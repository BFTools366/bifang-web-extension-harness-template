import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { format } from "prettier"
import { recommendedAgentPolicy } from "./agent-policy.ts"
import { prepareDownstreamFinalization } from "./finalize.ts"
import { workspaceDocuments, workspacePackage } from "./workspace-documents.ts"
import { buildProjectManifest } from "./manifest.ts"
import { webFiles } from "./templates/web.ts"
import { extensionFiles } from "./templates/extension.ts"
import { loadProjectConfig } from "./config.ts"
import { computeOwnershipDelta } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-ownership-delta.ts"
import { WORKSPACE_OWNERSHIP_RULES } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-workspace.ts"
import { readBoundFileStable } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-mutation.ts"
import { validateOwnershipManifest } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import { isMainModule } from "./files.ts"
import { ownershipRule } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-glob.ts"
import { loadUpgradeTargetContext } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-workspace.ts"
import {
  gitIdentity,
  inventoryTree,
  isNested,
  loadOwnershipManifest,
  readBoundFile,
  realDirectory
} from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import type { WorkspaceConfig } from "./workspace.ts"

/** 保存源专用渲染入口的真实根，不把创建器分发到下游。 */
const SOURCE_ROOT = fileURLToPath(new URL("../../", import.meta.url))
/** 限定 Workspace 根实际使用的工具，不注入前端构建器。 */
const ROOT_TOOLS = new Set([
  "args.ts",
  "files.ts",
  "logo.ts",
  "types.ts",
  "identity.ts",
  "workspace-context.ts",
  "config.ts"
])

/** 只创建源外工程投影，不安装、初始化 Git、访问服务或生成品牌/业务。 */
export async function renderUpgradeCandidate(
  targetInput: string,
  outputInput: string,
  bootstrapProposal = false
) {
  const source = await realDirectory(SOURCE_ROOT, "Source")
  const target = await realDirectory(targetInput, "Target")
  const parent = await realDirectory(path.dirname(path.resolve(outputInput)), "Candidate parent")
  const output = path.join(parent, path.basename(outputInput))
  if ([source, target].some((root) => isNested(root, output) || isNested(output, root)))
    throw new Error("Candidate must be outside source and target")
  const [sourceGit, targetGit] = await Promise.all([
    gitIdentity(source, true),
    gitIdentity(target, false)
  ])
  const ownershipRelative = ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
  const localOwnership = await readBoundFileStable(target, ownershipRelative)
  if (!localOwnership.bytes) throw new Error("Target local ownership is missing")
  const beforeOwnership = JSON.parse(localOwnership.bytes.toString("utf8"))
  const workspaceIdentity = await readBoundFileStable(
    target,
    ".harness/workspace.json",
    undefined,
    true
  )
  const delta = computeOwnershipDelta(beforeOwnership, workspaceIdentity.exists)
  if (delta.conflicts.length || delta.shadowed.length)
    throw new Error("Ownership requires conflict review")
  const proposed = {
    ...beforeOwnership,
    rules: [...beforeOwnership.rules, ...delta.missing],
    ...(delta.workspaceMissing
      ? {
          workspaceRules: [...(beforeOwnership.workspaceRules ?? []), ...delta.workspaceMissing]
        }
      : {})
  }
  const ownership = bootstrapProposal
    ? { manifest: validateOwnershipManifest(proposed) }
    : await loadOwnershipManifest(path.join(target, ownershipRelative), target)
  const context = await loadUpgradeTargetContext(target, ownership.manifest)
  const inventory = await inventoryTree(source, false)
  const sourcePackage = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"))
  const options = JSON.parse(await readFile(path.join(source, ".prettierrc.json"), "utf8"))
  const files = new Map<string, { bytes: Buffer; mode: number }>()
  /** 接受目标本地清单允许的工程路径，环境、产品和品牌从不进入候选。 */
  function allowed(relative: string) {
    const mode = ownershipRule(relative, context.manifest)?.mode
    return (
      mode !== undefined &&
      ["managed", "managed-self", "merge-sections", "conditional"].includes(mode) &&
      !relative.split("/").some((segment) => segment.startsWith(".env"))
    )
  }
  /** 写入内存中的终端模板，复用创建期的相同格式设置。 */
  async function rendered(relative: string, contents: string) {
    if (!allowed(relative)) return
    const formatted = await format(contents, { ...options, filepath: relative })
    files.set(relative, { bytes: Buffer.from(formatted), mode: 0o644 })
  }
  /** 按范围投影原样源文件；拒绝链接和特殊权限，不复制源全树。 */
  async function originals(prefix: string, rootScope: boolean, host?: "web" | "extension") {
    for (const [relative, snapshot] of inventory.files) {
      if (context.workspace && prefix && relative === "pnpm-workspace.yaml") continue
      if (
        rootScope &&
        !relative.startsWith(".agents/skills/") &&
        !relative.startsWith("docs/") &&
        !WORKSPACE_OWNERSHIP_RULES.some((rule) => rule.pattern === relative) &&
        !(relative.startsWith(".harness/tooling/") && ROOT_TOOLS.has(path.basename(relative)))
      )
        continue
      if (
        host &&
        relative.startsWith(
          `.agents/skills/${host === "web" ? "web-review-extension-compatibility" : "web-implement-list-view"}/`
        )
      )
        continue
      const destination = prefix ? `${prefix}/${relative}` : relative
      if (!allowed(destination)) continue
      if (inventory.unsafe.has(relative)) throw new Error(`Unsafe source projection: ${relative}`)
      files.set(destination, {
        bytes: await readBoundFile(source, relative, snapshot, "Source projection"),
        mode: snapshot.mode
      })
    }
  }
  if (context.workspace) {
    await originals("", true)
    for (const [relative, content] of workspaceDocuments(context.workspace as WorkspaceConfig))
      await rendered(relative, content)
    await rendered(
      "package.json",
      JSON.stringify(workspacePackage(context.workspace as WorkspaceConfig, sourcePackage))
    )
    const members = context.frontends.map((member) => `  - ${JSON.stringify(member.directory)}`)
    const buildPolicy = await readFile(path.join(source, "pnpm-workspace.yaml"), "utf8")
    files.set("pnpm-workspace.yaml", {
      bytes: Buffer.from(
        `packages:\n${members.length ? members.join("\n") : "  []"}\n${buildPolicy}`
      ),
      mode: 0o644
    })
  }
  for (const member of context.frontends) {
    const config = await loadProjectConfig(path.join(target, member.directory))
    await originals(member.directory, false, member.type)
    // 该合成策略只用于受保护文件的内存渲染，绝不投影或修改用户策略。
    const finalized = await prepareDownstreamFinalization(
      source,
      config,
      recommendedAgentPolicy("工程投影内部占位；不写入策略")
    )
    const prefix = member.directory ? `${member.directory}/` : ""
    for (const [relative, content] of finalized.files)
      await rendered(`${prefix}${relative}`, content)
    await rendered(
      `${prefix}package.json`,
      JSON.stringify(buildProjectManifest(sourcePackage, config))
    )
    const init = {
      developmentBaseUrl: "",
      testBaseUrl: "",
      releaseBaseUrl: "",
      serverMode: context.workspace?.service.mode
    }
    const hostFiles = member.type === "web" ? webFiles(config, init) : extensionFiles(config, init)
    for (const [relative, content] of hostFiles) await rendered(`${prefix}${relative}`, content)
    if (context.workspace && member === context.frontends[0]) {
      const contents = finalized.files.get(".harness/tooling/config.ts")
      if (contents) await rendered(".harness/tooling/config.ts", contents)
    }
  }
  for (const unsafe of inventory.unsafe)
    if (unsafe !== ".git" && allowed(unsafe)) throw new Error(`Unsafe source projection: ${unsafe}`)
  // 所有权保留目标规则和顺序；proposal 只生成外部待批准字节，不授权目标写入。
  files.set(ownershipRelative, {
    bytes: Buffer.from(`${JSON.stringify(ownership.manifest, null, 2)}\n`),
    mode: 0o644
  })
  if (
    JSON.stringify(await gitIdentity(source, true)) !== JSON.stringify(sourceGit) ||
    JSON.stringify(await gitIdentity(target, false)) !== JSON.stringify(targetGit)
  )
    throw new Error("Source or target Git state changed during rendering")
  // 完整计算后才独占创建新目录；失败时保留精确输出位置供调查，绝不覆盖已有候选。
  await mkdir(output)
  for (const [relative, file] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const absolute = path.join(output, relative)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, file.bytes, { flag: "wx", mode: file.mode })
    await chmod(absolute, file.mode)
  }
  return {
    source,
    sourceCommit: sourceGit.head,
    target,
    candidate: output,
    files: files.size,
    bootstrapProposal,
    ...(context.workspace
      ? {
          manualReview: [
            {
              path: "package.json",
              requirement:
                "合并候选 release 与已选成员 release:<member> 脚本，并保留产品脚本和依赖。"
            },
            {
              path: ".gitignore",
              requirement: "保留既有内容，手工追加 /release/；此文件仍受保护，不自动覆盖。"
            },
            ...(context.workspace.members.some((member) => member.type === "server")
              ? [
                  {
                    path: `${context.workspace.id}_server`,
                    requirement:
                      "服务代码与配置受保护；使用 release:server 前须另行迁移单文件配置及 cmd/release-config。"
                  }
                ]
              : [])
          ]
        }
      : {}),
    ...(bootstrapProposal
      ? { ownershipMigration: { before: beforeOwnership, after: proposed } }
      : {})
  }
}

if (isMainModule(import.meta.url)) {
  const [target, output, ...extra] = process.argv.slice(2)
  if (
    !target ||
    !output ||
    extra.length > 1 ||
    (extra.length && extra[0] !== "--bootstrap-proposal")
  )
    throw new Error(
      "用法：upgrade-candidate.ts <absolute-target-root> <new-absolute-candidate-root>"
    )
  process.stdout.write(
    `${JSON.stringify(await renderUpgradeCandidate(target, output, extra[0] === "--bootstrap-proposal"))}\n`
  )
}
