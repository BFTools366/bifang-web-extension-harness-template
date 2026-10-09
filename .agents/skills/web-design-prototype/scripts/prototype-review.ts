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

/** 保存本轮候选与真实用户选择，需求正文仍属于 Product Spec。 */
export interface PrototypeReview {
  schemaVersion: 1
  projectId: string
  projectType: "web" | "extension"
  scope: string
  revision: string
  prd: Artifact
  candidates: (Artifact & { id: string })[]
  state: "awaiting_selection" | "selected"
  selection?: { candidateId: string; confirmation: string; confirmedAt: string }
}

/** 保存已校验的下游项目配置类型。 */
type ProjectConfig = Awaited<ReturnType<typeof loadProjectConfig>>

/** 由当前项目身份构造评审记录的固定头部，读取校验与登记共用同一形状。 */
function reviewHeader(
  config: ProjectConfig,
  scope: string,
  revision: string
): Omit<PrototypeReview, "prd" | "candidates" | "state"> {
  return {
    schemaVersion: 1,
    projectId: config.id,
    projectType: config.projectType,
    scope,
    revision
  }
}

/** 选择确认语必须是非空白字符串。 */
function hasConfirmation(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
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
    throw new Error("PRD must be the current dated Product Spec")
  }
  const { artifact: result, bytes } = await readArtifact(root, relative)
  const specs = (await readdir(path.join(root, "docs/product_spec")))
    .filter((name) => /^\d{8}_product_spec\.md$/u.test(name))
    .sort()
  if (path.posix.basename(relative) !== specs.at(-1)) {
    throw new Error("PRD must be the latest Product Spec; request selection for the current scope")
  }
  if (!isApprovedPrd(bytes.toString("utf8"))) {
    throw new Error("Confirm the PRD with the user before preparing prototypes")
  }
  return result
}

/** 限定候选为同一范围及版本的独立 HTML，并返回可直接选择的 ID。 */
function candidateIdentity(scope: string, relative: string): { revision: string; id: string } {
  const prefix = `docs/prototypes/${scope}/`
  const match = relative.startsWith(prefix)
    ? /^(v[1-9]\d*)\/([a-z][a-z0-9-]*)\.html$/u.exec(relative.slice(prefix.length))
    : null
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error("Candidates must be docs/prototypes/<scope>/vN/<id>.html")
  }
  return { revision: match[1], id: match[2] }
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
        "No prototype review; generate candidates and wait for user selection before development",
        { cause: error }
      )
    }
    throw error
  }
  const raw = object(JSON.parse(await readFile(location, "utf8")))
  if (
    raw.schemaVersion !== 1 ||
    raw.projectId !== config.id ||
    raw.projectType !== config.projectType ||
    raw.scope !== scope ||
    typeof raw.revision !== "string" ||
    !Array.isArray(raw.candidates) ||
    raw.candidates.length < 1 ||
    raw.candidates.length > 3 ||
    (raw.state !== "awaiting_selection" && raw.state !== "selected")
  ) {
    throw new Error("Invalid prototype review identity or state")
  }
  const prd = artifact(raw.prd)
  if ((await confirmedPrd(root, prd.path)).sha256 !== prd.sha256) {
    throw new Error("PRD changed; prepare and request user selection again")
  }
  const candidates: PrototypeReview["candidates"] = []
  for (const value of raw.candidates) {
    const item = object(value)
    const file = artifact(item)
    const identity = candidateIdentity(scope, file.path)
    if (
      identity.revision !== raw.revision ||
      item.id !== identity.id ||
      candidates.some((other) => other.id === item.id)
    ) {
      throw new Error("Invalid or duplicate candidate identity")
    }
    candidates.push({ ...file, id: identity.id })
  }
  const current = await Promise.all(candidates.map((item) => fingerprint(root, item.path)))
  if (current.some((item, index) => item.sha256 !== candidates[index]?.sha256)) {
    throw new Error("Prototype changed; prepare and request user selection again")
  }
  const review: PrototypeReview = {
    ...reviewHeader(config, scope, raw.revision),
    prd,
    candidates,
    state: raw.state
  }
  if (raw.state === "selected") {
    const selected = object(raw.selection)
    if (
      typeof selected.candidateId !== "string" ||
      !candidates.some((item) => item.id === selected.candidateId) ||
      !hasConfirmation(selected.confirmation) ||
      typeof selected.confirmedAt !== "string" ||
      !Number.isFinite(Date.parse(selected.confirmedAt))
    ) {
      throw new Error("Invalid user selection evidence")
    }
    review.selection = {
      candidateId: selected.candidateId,
      confirmation: selected.confirmation,
      confirmedAt: selected.confirmedAt
    }
  } else if (raw.selection !== undefined) {
    throw new Error("Unselected review cannot contain selection evidence")
  }
  return review
}

/** 执行下游原型登记、选择与开发前核验；授权真实性由调用 Agent 对照用户会话。 */
export async function runPrototypeReview(
  argv: string[],
  root = process.cwd()
): Promise<PrototypeReview> {
  const [command, scope, ...args] = argv
  if (scope === undefined)
    throw new Error("Usage: prototype-review.ts prepare|select|check <scope> ...")
  assertScope(scope)
  // 在读取任何业务文件或创建目录前验证下游身份，初始化不得调用本工具。
  const config = await loadProjectConfig(root)
  if (command === "prepare") {
    const [prdPath, ...paths] = args
    if (prdPath === undefined || paths.length < 1 || paths.length > 3)
      throw new Error("prepare requires PRD and 1–3 HTML candidates")
    const prd = await confirmedPrd(root, prdPath)
    const identities = paths.map((file) => candidateIdentity(scope, file))
    if (
      new Set(identities.map((item) => item.revision)).size !== 1 ||
      new Set(identities.map((item) => item.id)).size !== paths.length
    ) {
      throw new Error("Candidates must have unique IDs and share one revision")
    }
    const candidates = await Promise.all(
      paths.map(async (file, index) => ({
        ...(await fingerprint(root, file)),
        id: identities[index]?.id ?? ""
      }))
    )
    const review: PrototypeReview = {
      ...reviewHeader(config, scope, identities[0]?.revision ?? ""),
      prd,
      candidates,
      state: "awaiting_selection"
    }
    await save(root, review)
    return review
  }
  if (command !== "select" && command !== "check")
    throw new Error("Unknown prototype review command")
  if ((command === "check" && args.length !== 0) || (command === "select" && args.length !== 2)) {
    throw new Error(
      "check takes no extra arguments; select requires candidate ID and user confirmation"
    )
  }
  const review = await readReview(root, scope, config)
  if (command === "select") {
    const [id, confirmation] = args
    if (
      id === undefined ||
      !review.candidates.some((item) => item.id === id) ||
      !hasConfirmation(confirmation)
    ) {
      throw new Error("Select an existing candidate with the user's explicit confirmation")
    }
    review.state = "selected"
    review.selection = { candidateId: id, confirmation, confirmedAt: new Date().toISOString() }
    await save(root, review)
  } else if (review.state !== "selected") {
    throw new Error("Awaiting user selection; do not start development")
  }
  return review
}

if (isMainModule(import.meta.url)) {
  runPrototypeReview(process.argv.slice(2))
    .then((review) => console.log(JSON.stringify(review, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
