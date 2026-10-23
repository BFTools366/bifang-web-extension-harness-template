import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { resolveWorkspaceContextRoot } from "../../../../.harness/tooling/workspace-context.ts"
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
  schemaVersion: 3
  projectId: string
  projectType: "web" | "extension"
  initializedAt: string
  scope: string
  revision: string
  layout: "desktop"
  requestSource: string
  generation: string
  reviewHash: string
  state: "awaiting-preview" | "awaiting-feedback" | "approved"
  presentation?: { source: string }
  approval?: { mode: "preview" | "waiver"; answer: string; source: string }
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
): Pick<
  PrototypeReview,
  "schemaVersion" | "projectId" | "projectType" | "initializedAt" | "scope" | "revision" | "layout"
> {
  return {
    schemaVersion: 3,
    projectId: config.id,
    projectType: config.projectType,
    initializedAt: config.initializedAt,
    scope,
    revision,
    layout: "desktop"
  }
}

/** 绑定本轮请求、项目实例、登记代次与文件，不把旧确认用于新一轮设计。 */
function reviewHash(review: PrototypeReview): string {
  return sha256Hex(
    JSON.stringify({
      projectId: review.projectId,
      projectType: review.projectType,
      initializedAt: review.initializedAt,
      scope: review.scope,
      revision: review.revision,
      layout: review.layout,
      requestSource: review.requestSource,
      generation: review.generation,
      prd: review.prd,
      prototype: review.prototype
    })
  )
}

/** 要求真实来源或原话，空值不表示展示、反馈或豁免。 */
function evidence(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("需要非空的真实消息来源或原话")
  return value
}

/** 读取与当前工程实例绑定的创建范围及首版原型门禁，不把范围确认当成设计批准。 */
async function creationReceipt(root: string, review: PrototypeReview) {
  const location = await localPath(root, ".harness/initial-creation.json", true)
  if ((await lstatIfPresent(location)) === undefined) return undefined
  const receipt = object(JSON.parse(await readFile(location, "utf8")))
  if (
    receipt.schemaVersion !== 1 ||
    receipt.projectId !== review.projectId ||
    receipt.projectType !== review.projectType ||
    receipt.initializedAt !== review.initializedAt
  )
    throw new Error("创建范围凭据与当前工程实例不匹配")
  if (receipt.prototypeApproval !== undefined) {
    const approval = object(receipt.prototypeApproval)
    if (
      typeof approval.scope !== "string" ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(approval.scope) ||
      typeof approval.reviewHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(approval.reviewHash)
    )
      throw new Error("首版设计确认记录无效")
  }
  return { location, receipt }
}

/** 首版门禁绑定工程而非任意 scope，改名或旧消费/关闭字段都不能绕过。 */
async function requiresInitialPreview(root: string, review: PrototypeReview): Promise<boolean> {
  const context = await creationReceipt(root, review)
  if (context?.receipt.prototypeApproval !== undefined) return false
  return context !== undefined || review.scope === "initial-create"
}

/** 只在实际展示并取得新用户反馈后记录首版设计确认，保留产品范围原文。 */
async function recordInitialPrototypeApproval(
  root: string,
  review: PrototypeReview
): Promise<void> {
  const context = await creationReceipt(root, review)
  if (context && context.receipt.prototypeApproval === undefined)
    await writeJsonAtomic(context.location, {
      ...context.receipt,
      prototypeApproval: { scope: review.scope, reviewHash: review.reviewHash }
    })
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
  if (raw.schemaVersion !== 3) {
    throw new Error("原型记录格式已更新；请重新登记、展示并取得当前设计反馈，不能自动继承旧批准")
  }
  if (
    raw.projectId !== config.id ||
    raw.projectType !== config.projectType ||
    raw.initializedAt !== config.initializedAt ||
    raw.scope !== scope ||
    typeof raw.revision !== "string" ||
    raw.layout !== "desktop" ||
    "candidates" in raw ||
    "selection" in raw
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
  const result: PrototypeReview = {
    ...reviewHeader(config, scope, raw.revision),
    requestSource: evidence(raw.requestSource),
    generation: evidence(raw.generation),
    reviewHash: evidence(raw.reviewHash),
    state: raw.state as PrototypeReview["state"],
    prd,
    prototype
  }
  await creationReceipt(root, result)
  if (!/^[a-f0-9]{64}$/u.test(result.reviewHash) || result.reviewHash !== reviewHash(result))
    throw new Error("原型评审修订不匹配，请重新登记并展示")
  if (raw.presentation !== undefined) {
    result.presentation = { source: evidence(object(raw.presentation).source) }
  }
  if (raw.approval !== undefined) {
    const decision = object(raw.approval)
    if (typeof decision.mode !== "string" || !["preview", "waiver"].includes(decision.mode))
      throw new Error("设计反馈模式无效；完整创建确认不能代替原型展示后的用户确认")
    result.approval = {
      mode: decision.mode as NonNullable<PrototypeReview["approval"]>["mode"],
      answer: evidence(decision.answer),
      source: evidence(decision.source)
    }
  }
  if (
    !["awaiting-preview", "awaiting-feedback", "approved"].includes(result.state) ||
    (result.state === "awaiting-preview" && (result.presentation || result.approval)) ||
    (result.state === "awaiting-feedback" && (!result.presentation || result.approval)) ||
    (result.state === "approved" &&
      (!result.approval || (result.approval.mode !== "waiver" && !result.presentation)))
  )
    throw new Error("原型展示或用户反馈状态损坏")
  if (result.approval?.mode === "preview" && !isApprovalAnswer(result.approval.answer))
    throw new Error("缺少明确设计反馈")
  if (
    result.approval?.mode === "preview" &&
    [result.requestSource, result.presentation?.source].includes(result.approval.source)
  )
    throw new Error("设计反馈不能复用原始需求或展示消息")
  if (result.approval?.mode === "waiver" && !isWaiverAnswer(result.approval.answer))
    throw new Error("缺少明确跳过本次预览的原话")
  if (result.approval?.mode === "waiver" && (await requiresInitialPreview(root, result)))
    throw new Error("初始化首版原型必须展示并取得用户明确确认，不能跳过")

  return result
}

/** 只接受对当前原型的明确肯定，含修改要求的回答不能直接批准。 */
function isApprovalAnswer(answer: string): boolean {
  return ["yes", "y", "确认", "通过", "同意", "按此实现"].includes(answer.trim().toLowerCase())
}

/** 明确跳过预览须单独表达，普通实施授权或 yes 不构成豁免。 */
function isWaiverAnswer(answer: string): boolean {
  return [
    "跳过本次预览并直接实施",
    "跳过预览直接实施",
    "不用预览直接改",
    "skip preview and implement"
  ].includes(answer.trim().toLowerCase())
}

/** 登记、展示及绑定当前设计反馈；开发检查不自动制造展示或用户批准。 */
export async function runPrototypeReview(
  argv: string[],
  root = process.cwd()
): Promise<PrototypeReview> {
  root = await resolveWorkspaceContextRoot(root)
  const [command, scope, ...args] = argv
  if (scope === undefined)
    throw new Error("用法：prototype-review.ts prepare|present|approve|waive|check <scope> ...")
  assertScope(scope)
  // 在读取业务文件前验证下游身份；工程生成事务成功后才可准备原型。
  const config = await loadProjectConfig(root)
  if (command === "prepare") {
    const [requestSource, prdPath, prototypePath] = args
    if (args.length !== 3 || prdPath === undefined || prototypePath === undefined)
      throw new Error("prepare 需要设计请求来源、PRD 和恰好一个桌面 HTML 原型")
    const prd = await confirmedPrd(root, prdPath)
    const revision = prototypeRevision(scope, prototypePath)
    const prototype = await fingerprint(root, prototypePath)
    const review: PrototypeReview = {
      ...reviewHeader(config, scope, revision),
      requestSource: evidence(requestSource),
      generation: randomUUID(),
      reviewHash: "",
      state: "awaiting-preview",
      prd,
      prototype
    }
    review.reviewHash = reviewHash(review)
    await save(root, review)
    return review
  }
  if (!["present", "approve", "waive", "check"].includes(command ?? ""))
    throw new Error(
      "仅支持 prepare/present/approve/waive/check，不提供多方案选择；完整创建确认不能代替原型确认"
    )
  const review = await readReview(root, scope, config)
  if (command === "check") {
    if (args.length !== 1) throw new Error("check 需要本轮设计请求来源，不接受额外参数")
    if (args[0] !== review.requestSource) throw new Error("当前设计请求已变化，不能复用旧原型批准")
    if (review.state !== "approved") throw new Error("原型仍待预览或用户反馈，不得修改产品代码")
    return review
  }
  if (args[0] !== review.reviewHash) throw new Error("旧评审修订不能用于当前原型")
  if (command === "present") {
    if (args.length !== 2 || review.state !== "awaiting-preview")
      throw new Error("present 需要当前修订及真实展示来源，且只能展示待预览记录")
    review.presentation = { source: evidence(args[1]) }
    review.state = "awaiting-feedback"
  } else {
    if (args.length !== 3 || review.state === "approved")
      throw new Error("设计反馈需要当前修订、真实原话及用户消息来源")
    const answer = evidence(args[1])
    const source = evidence(args[2])
    if (command === "approve") {
      if (review.state !== "awaiting-feedback" || !isApprovalAnswer(answer))
        throw new Error("须先展示当前原型，并取得明确设计反馈")
      if (source === review.requestSource || source === review.presentation?.source)
        throw new Error("设计反馈必须来自展示后的新用户回复，不能复用原始需求或展示消息")
    } else if (await requiresInitialPreview(root, review))
      throw new Error("初始化首版原型必须展示并取得用户明确确认，不能跳过")
    else if (!isWaiverAnswer(answer))
      throw new Error("必须明确跳过本次预览并直接实施，普通授权不能代替")
    review.approval = { mode: command === "approve" ? "preview" : "waiver", answer, source }
    review.state = "approved"
  }
  await save(root, review)
  if (command === "approve") await recordInitialPrototypeApproval(root, review)
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
