import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { loadProjectConfig } from "../../../../.harness/tooling/config.ts"
import {
  isMainModule,
  lstatIfPresent,
  sha256Hex,
  writeJsonAtomic
} from "../../../../.harness/tooling/files.ts"

/** 绑定一份仓库内评审文件的相对路径与内容。 */
interface Artifact {
  path: string
  sha256: string
}

/** 绑定本轮单一桌面原型；需求正文及开发授权不由此记录代替。 */
export interface PrototypeReview {
  schemaVersion: 2
  projectId: string
  projectType: "web" | "extension"
  scope: string
  revision: string
  layout: "desktop"
  prd: Artifact
  prototype: Artifact
}

/** 保存已校验的下游项目配置类型。 */
type ProjectConfig = Awaited<ReturnType<typeof loadProjectConfig>>

/** 由当前项目身份构造评审记录的固定头部，读取校验与登记共用同一形状。 */
function reviewHeader(
  config: ProjectConfig,
  scope: string,
  revision: string
): Omit<PrototypeReview, "prd" | "prototype"> {
  return {
    schemaVersion: 2,
    projectId: config.id,
    projectType: config.projectType,
    scope,
    revision,
    layout: "desktop"
  }
}

/** 校验稳定范围标识，避免命令参数改变记录目录。 */
function assertScope(scope: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(scope)) {
    throw new Error("scope must be lowercase kebab-case")
  }
}

/** 拒绝逃逸与符号链接；所有评审输入输出都限定在当前仓库。 */
async function localPath(root: string, relative: string, allowMissing = false): Promise<string> {
  if (
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/u.test(relative) ||
    relative.includes("\\") ||
    relative.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error("Artifact paths must be normalized repository-relative paths")
  }
  let current = root
  for (const part of relative.split("/")) {
    current = path.join(current, part)
    const stats = await lstatIfPresent(current)
    if (stats === undefined) {
      if (allowMissing) continue
      throw Object.assign(new Error(`Artifact not found: ${relative}`), { code: "ENOENT" })
    }
    if (stats.isSymbolicLink()) throw new Error("Symlink artifacts are forbidden")
  }
  return current
}

/** 一次读取真正存在的普通文件并取摘要，防止目录或空产物充当候选。 */
async function readArtifact(
  root: string,
  relative: string
): Promise<{ artifact: Artifact; bytes: Buffer }> {
  const absolute = await localPath(root, relative)
  if (!(await lstat(absolute)).isFile()) throw new Error("Artifact must be a regular file")
  const bytes = await readFile(absolute)
  if (bytes.length === 0) throw new Error("Artifact must not be empty")
  return { artifact: { path: relative, sha256: sha256Hex(bytes) }, bytes }
}

/** 只需要摘要时的便捷入口。 */
async function fingerprint(root: string, relative: string): Promise<Artifact> {
  return (await readArtifact(root, relative)).artifact
}

/** 以原子替换保存记录，目录链先经符号链接核验。 */
async function save(root: string, review: PrototypeReview): Promise<void> {
  const destination = await localPath(root, `docs/prototypes/${review.scope}/review.json`, true)
  await writeJsonAtomic(destination, review)
}

/** 收窄外部 JSON 对象，损坏记录不可进入开发门禁。 */
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid prototype review object")
  }
  return value as Record<string, unknown>
}

/** 校验摘要结构，不允许未知字段以隐式类型转换绕过文件绑定。 */
function artifact(value: unknown): Artifact {
  const item = object(value)
  if (
    typeof item.path !== "string" ||
    typeof item.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(item.sha256)
  ) {
    throw new Error("Invalid artifact fingerprint")
  }
  return { path: item.path, sha256: item.sha256 }
}

/** 仅读取首部唯一状态，代码示例和正文中的批准字样不能确认草稿。 */
function isApprovedPrd(source: string): boolean {
  const statuses: string[] = []
  let fence: { marker: string; length: number } | undefined
  for (const line of source.split(/\r?\n/u)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1]
    if (delimiter !== undefined) {
      if (fence === undefined) fence = { marker: delimiter[0] ?? "", length: delimiter.length }
      else if (delimiter[0] === fence.marker && delimiter.length >= fence.length) fence = undefined
      continue
    }
    if (fence !== undefined) continue
    if (/^ {0,3}#{2,6}[ \t]/u.test(line)) break
    const status = /^状态：[ \t]*(\S+)[ \t]*$/u.exec(line)?.[1]
    if (status !== undefined) statuses.push(status)
  }
  return statuses.length === 1 && statuses[0] === "Approved"
}

/** 校验 PRD 位置及确认状态；源模板的批准事实不能替代下游需求确认。 */
async function confirmedPrd(root: string, relative: string): Promise<Artifact> {
  if (!/^docs\/product_spec\/\d{8}_product_spec\.md$/u.test(relative)) {
    throw new Error("PRD 必须是当前按日期命名的产品规格")
  }
  const [{ artifact: result, bytes }, names] = await Promise.all([
    readArtifact(root, relative),
    readdir(path.join(root, "docs/product_spec"))
  ])
  const specs = names.filter((name) => /^\d{8}_product_spec\.md$/u.test(name)).sort()
  if (path.posix.basename(relative) !== specs.at(-1)) {
    throw new Error("PRD 必须是最新产品规格；请针对当前范围重新登记原型")
  }
  if (!isApprovedPrd(bytes.toString("utf8"))) {
    throw new Error("准备原型前须由用户确认 PRD")
  }
  return result
}

/** 限定原型为当前范围及版本中的一个独立 HTML。 */
function prototypeRevision(scope: string, relative: string): string {
  const prefix = `docs/prototypes/${scope}/`
  const match = relative.startsWith(prefix)
    ? /^(v[1-9]\d*)\/([a-z][a-z0-9-]*)\.html$/u.exec(relative.slice(prefix.length))
    : null
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error("Prototype must be docs/prototypes/<scope>/vN/<name>.html")
  }
  return match[1]
}

/** 读取并验证记录与当前项目及文件内容一致，任何漂移都要求重新展示。 */
async function readReview(
  root: string,
  scope: string,
  config: ProjectConfig
): Promise<PrototypeReview> {
  let location: string
  try {
    location = await localPath(root, `docs/prototypes/${scope}/review.json`)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "No prototype review; generate and register one desktop prototype before development",
        { cause: error }
      )
    }
    throw error
  }
  const raw = object(JSON.parse(await readFile(location, "utf8")))
  if (raw.schemaVersion !== 2) {
    throw new Error("原型记录格式已更新；请自查、展示并重新登记单一桌面原型")
  }
  if (
    raw.projectId !== config.id ||
    raw.projectType !== config.projectType ||
    raw.scope !== scope ||
    typeof raw.revision !== "string" ||
    raw.layout !== "desktop" ||
    "candidates" in raw ||
    "selection" in raw ||
    "state" in raw
  ) {
    throw new Error("Invalid single desktop prototype review identity")
  }
  const prd = artifact(raw.prd)
  if ((await confirmedPrd(root, prd.path)).sha256 !== prd.sha256) {
    throw new Error("PRD 已变化；请修订、自查并重新登记原型")
  }
  const prototype = artifact(raw.prototype)
  if (prototypeRevision(scope, prototype.path) !== raw.revision) {
    throw new Error("Invalid prototype revision")
  }
  if ((await fingerprint(root, prototype.path)).sha256 !== prototype.sha256) {
    throw new Error("原型已变化；请修订、自查并重新登记原型")
  }
  return {
    ...reviewHeader(config, scope, raw.revision),
    prd,
    prototype
  }
}

/** 登记或核验单一桌面原型，不增加用户选择或业务开发授权。 */
export async function runPrototypeReview(
  argv: string[],
  root = process.cwd()
): Promise<PrototypeReview> {
  const [command, scope, ...args] = argv
  if (scope === undefined) throw new Error("用法：prototype-review.ts prepare|check <scope> ...")
  assertScope(scope)
  // 在读取任何业务文件或创建目录前验证下游身份，初始化不得调用本工具。
  const config = await loadProjectConfig(root)
  if (command === "prepare") {
    const [prdPath, prototypePath] = args
    if (args.length !== 2 || prdPath === undefined || prototypePath === undefined)
      throw new Error("prepare 需要 PRD 和恰好一个桌面 HTML 原型")
    const prd = await confirmedPrd(root, prdPath)
    const revision = prototypeRevision(scope, prototypePath)
    const prototype = await fingerprint(root, prototypePath)
    const review: PrototypeReview = {
      ...reviewHeader(config, scope, revision),
      prd,
      prototype
    }
    await save(root, review)
    return review
  }
  if (command !== "check") throw new Error("仅支持 prepare/check，不提供多方案选择命令")
  if (args.length !== 0) throw new Error("check 不接受额外参数")
  return readReview(root, scope, config)
}

if (isMainModule(import.meta.url)) {
  runPrototypeReview(process.argv.slice(2))
    .then((review) => console.log(JSON.stringify(review, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
