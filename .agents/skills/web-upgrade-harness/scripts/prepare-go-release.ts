import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isMainModule, sha256Hex } from "../../../../.harness/tooling/files.ts"
import { readBoundFileStable } from "./upgrade-mutation.ts"
import { gitIdentity, isNested, realDirectory } from "./upgrade-snapshot.ts"
import type { UpgradeFileSnapshot } from "./upgrade-types.ts"

/** Go 迁移仅生成外部提案，绝不通过工程所有权放开服务目录。 */
interface GoReleaseOptions {
  sourceRoot: string
  sourceCommit: string
  targetRoot: string
  output: string
}

/** 只记录路径与摘要，配置原值不会写入报告。 */
interface GoReleaseEntry {
  path: string
  action: "add" | "review_existing" | "preserve_existing" | "manual_merge"
  before?: UpgradeFileSnapshot
  candidate?: { path: string; sha256: string }
}

/** 已有生产配置不可由新模板替换；缺失时只建议最小环境差异。 */
const MINIMAL_PRODUCTION =
  "# 仅补生产环境选择；其余值沿用现有配置，部署前逐键核对。\napp:\n  env: prod\nserver:\n  mode: release\n"

/** 为已登记 Go 成员生成发布工具候选与函数合并参考，目标保持只读。 */
export async function prepareGoRelease(options: GoReleaseOptions) {
  const source = await realDirectory(options.sourceRoot, "Source")
  const target = await realDirectory(options.targetRoot, "Target")
  if (source === target) throw new Error("Go migration target must be a downstream Workspace")
  const parent = await realDirectory(path.dirname(path.resolve(options.output)), "Output parent")
  const output = path.join(parent, path.basename(options.output))
  if ([source, target].some((root) => isNested(root, output) || isNested(output, root)))
    throw new Error("Go migration output must be outside source and target")
  const sourceGit = await gitIdentity(source, true)
  const targetGit = await gitIdentity(target, false)
  if (sourceGit.head !== options.sourceCommit) throw new Error("Source commit does not match")
  const sourcePackage = await readBoundFileStable(source, "package.json")
  if (!sourcePackage.bytes || !JSON.parse(sourcePackage.bytes.toString()).scripts?.instantiate)
    throw new Error("Source must be the verified Harness source")
  const workspaceFile = await readBoundFileStable(target, ".harness/workspace.json")
  const workspace = JSON.parse(workspaceFile.bytes?.toString() ?? "null")
  if (
    workspace?.schemaVersion !== 1 ||
    workspace.kind !== "workspace" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(workspace.id) ||
    workspace.service?.mode !== "create" ||
    !Array.isArray(workspace.members)
  )
    throw new Error("Target must register its existing Go service")
  const servers = workspace.members.filter((member: { type?: string }) => member?.type === "server")
  if (servers.length !== 1 || servers[0].directory !== `${workspace.id}_server`)
    throw new Error("Target Go member identity is invalid")
  const member: string = servers[0].directory
  const observed = new Map<string, UpgradeFileSnapshot | undefined>([
    [".harness/workspace.json", workspaceFile.snapshot]
  ])
  const moduleFile = await readBoundFileStable(target, `${member}/go.mod`)
  const module = /^module[ \t]+([^\s]+)[ \t]*$/mu.exec(moduleFile.bytes?.toString() ?? "")?.[1]
  if (module !== member)
    throw new Error(
      "Go module differs from the registered Workspace contract; preserve it and review manually"
    )
  observed.set(`${member}/go.mod`, moduleFile.snapshot)
  // 候选来自本次绑定的 source；模板模块不依赖目标业务文件。
  const templatePath = ".harness/tooling/templates/go-config.ts"
  const templateFile = await readBoundFileStable(source, templatePath)
  if (!templateFile.snapshot) throw new Error("Source migration template is missing")
  const templateUrl = pathToFileURL(path.join(source, templatePath))
  templateUrl.searchParams.set("sha256", templateFile.snapshot.sha256)
  const templates = await import(templateUrl.href)
  for (const key of [
    "GO_CONFIG_LOAD",
    "GO_CONFIG_ENVIRONMENT",
    "GO_RELEASE_CONFIG",
    "GO_RELEASE_CONFIG_COMMAND"
  ])
    if (typeof templates[key] !== "string")
      throw new Error(`Source migration template is missing: ${key}`)
  const candidates = new Map<string, string>([
    ["internal/config/environment.go", templates.GO_CONFIG_ENVIRONMENT],
    ["internal/config/release.go", templates.GO_RELEASE_CONFIG],
    ["cmd/release-config/main.go", templates.GO_RELEASE_CONFIG_COMMAND],
    ["configs/config-prod.yaml", MINIMAL_PRODUCTION]
  ])
  const entries: GoReleaseEntry[] = []
  const files = new Map<string, string>()
  for (const [relative, contents] of candidates) {
    const relativePath = `${member}/${relative}`
    const before = await readBoundFileStable(target, relativePath, undefined, true)
    observed.set(relativePath, before.snapshot)
    // 已有生产 YAML 只绑定摘要，外部提案也不复制它的秘密。
    if (relative === "configs/config-prod.yaml" && before.exists) {
      entries.push({ path: relativePath, action: "preserve_existing", before: before.snapshot })
      continue
    }
    const candidatePath = `files/${relativePath}`
    files.set(candidatePath, contents)
    entries.push({
      path: relativePath,
      action: before.exists ? "review_existing" : "add",
      ...(before.snapshot ? { before: before.snapshot } : {}),
      candidate: { path: candidatePath, sha256: sha256Hex(contents) }
    })
  }
  for (const relative of [
    "internal/config/config.go",
    "cmd/server/main.go",
    "configs/config.yaml",
    "configs/config-dev.yaml",
    "go.sum"
  ]) {
    const relativePath = `${member}/${relative}`
    const before = await readBoundFileStable(
      target,
      relativePath,
      undefined,
      relative.endsWith("config-dev.yaml") || relative === "go.sum"
    )
    observed.set(relativePath, before.snapshot)
    entries.push({
      path: relativePath,
      action:
        relative === "go.sum" || relative === "configs/config-dev.yaml"
          ? "preserve_existing"
          : "manual_merge",
      ...(before.snapshot ? { before: before.snapshot } : {})
    })
  }
  files.set("reference/Load.go.txt", templates.GO_CONFIG_LOAD)
  // 任何目标配置、身份或源码漂移都要先重新生成提案，不能混用旧摘要。
  for (const [relative, expected] of observed) {
    const current = await readBoundFileStable(target, relative, undefined, true)
    if (JSON.stringify(current.snapshot) !== JSON.stringify(expected))
      throw new Error(`Target changed: ${relative}`)
  }
  await readBoundFileStable(source, templatePath, templateFile.snapshot)
  if (
    JSON.stringify(await gitIdentity(source, true)) !== JSON.stringify(sourceGit) ||
    JSON.stringify(await gitIdentity(target, false)) !== JSON.stringify(targetGit)
  )
    throw new Error("Source or target Git state changed during Go migration preview")
  const plan = {
    kind: "go-release-migration",
    source,
    sourceCommit: sourceGit.head,
    target,
    targetGit,
    member,
    output,
    targetWritten: false,
    entries,
    reference: "reference/Load.go.txt",
    requiredReview: [
      "按函数合并加载器与现有校验，保留业务类型及辅助函数",
      "既有配置逐键保留；仅代码默认值需按缺失键显式迁入 YAML",
      "先核对生产安全参数，再执行指定平台打包与隔离启动验证"
    ],
    validation: "Not run; this command only prepares the migration"
  }
  await mkdir(output, { mode: 0o700 })
  for (const [relative, contents] of files) {
    const file = path.join(output, relative)
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, contents, { flag: "wx", mode: 0o600 })
  }
  await writeFile(path.join(output, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600
  })
  return plan
}

/** 迁移入口只接受具名参数，不提供绕过审查的自动写入开关。 */
async function main() {
  const names = new Map([
    ["--source-root", "sourceRoot"],
    ["--source-commit", "sourceCommit"],
    ["--target-root", "targetRoot"],
    ["--output", "output"]
  ])
  const values: Record<string, string> = {}
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    const key = names.get(args[index] ?? ""),
      value = args[index + 1]
    if (!key || !value || value.startsWith("--") || values[key] !== undefined)
      throw new Error("Invalid Go migration arguments")
    values[key] = value
  }
  if (Object.keys(values).length !== names.size)
    throw new Error("Required: --source-root --source-commit --target-root --output")
  process.stdout.write(
    `${JSON.stringify(await prepareGoRelease(values as unknown as GoReleaseOptions))}\n`
  )
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`
    )
    process.exitCode = 2
  })
}
