import path from "node:path"
import { readFile } from "node:fs/promises"
import { writeAtomic } from "./files.ts"
import type { AgentPolicyChoice, AgentPolicySelection } from "./types.ts"

/** 保存用户可见 Task 进度标题模板。 */
export const TASK_PROGRESS_TITLE_TEMPLATE = "Task {序号} | {当前进度} | {单一结果}"
/** 保存左侧 Task 派发时的初始标题模板。 */
export const TASK_PROGRESS_TITLE_INITIAL = "Task {序号} | 已分配 | {单一结果}"
/** 保存统一标题允许的四个生命周期状态。 */
export const TASK_PROGRESS_STATES = ["已分配", "运行中", "检查中", "已完成"] as const
/** 匹配三字段、精确空格且无前导零的用户可见 Task 标题。 */
const TASK_PROGRESS_TITLE_PATTERN =
  /^Task (?<sequence>[1-9][0-9]*) \| (?<progress>已分配|运行中|检查中|已完成) \| (?<singleResult>[^|\r\n]+)$/u
/** 保存 Agent policy 唯一字段顺序。 */
const POLICY_FIELDS = [
  "schema_version",
  "confirmed_by",
  "confirmed_at",
  "decision_mode",
  "superpowers",
  "user_owned_tasks",
  "parallel_worktree_subagents",
  "acceptance_smoke",
  "e2e_hint"
] as const
/** 保存不可作为下游确认来源的占位值。 */
const UNRESOLVED_CONFIRMATION = new Set(["pending", "unknown", "unset", "n/a"])
/** 保存项目序号分配必须同时出现的宿主、归档与内部边界措辞。 */
export const PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS = [
  "`hostId`",
  "`projectId`",
  "`list_threads`",
  "归档",
  "最大有效序号",
  "空历史",
  "缺号不回填",
  "内部 Subagent"
] as const
/** 保存策略正文必须保留的跨 Task、并行和候选语义。 */
export const AGENT_POLICY_REQUIRED_BODY_FRAGMENTS = [
  "完成初始化的下游五项选择只能是 `enabled` 或 `disabled`",
  "`user_owned_tasks`：控制是否由 Agent 自动把新结果拆到 Codex 左侧菜单",
  "`user_owned_tasks: disabled` 是默认状态",
  "用户仍可明确要求创建左侧 Task",
  "`enabled` 是长期授权",
  "一个用户可见 Task 只对应一个明确、可验收的结果",
  "交付物类型变化、生命周期阶段变化",
  "每个项目同一时间只允许一个写入型 active 用户可见 Task",
  "Task0 可以协调和派发，但不得代替实施 Task 写入",
  "Git 项目固定选择",
  "environment.type = worktree",
  "非 Git 项目固定使用同一 project target 与 `environment.type = local`",
  "只返回 `clientThreadId` 表示仍在 setup",
  "保持零实现",
  "取得真实 `threadId`",
  "核对该 id 的标题、`projectId`、cwd 和状态",
  "核对工作区干净及起始提交正确",
  "`Task {序号} | {当前进度} | {单一结果}`",
  'title="Task {序号} | 已分配 | {单一结果}"',
  "不识别任何历史标题格式",
  ...PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS,
  "内部 Subagent 不使用本标题合同、不占用 Task 序号",
  "推荐预设确定性物化五项",
  "`user_owned_tasks: disabled`",
  "开启左侧 Task",
  "关闭左侧 Task",
  "任何初始化后的永久策略变更都必须写入当日 ADR",
  "临时 Task 限制不得改写持久策略",
  "不兼容、不推断任何更早 schema 或缺少字段的旧形态",
  "`parallel_worktree_subagents` 只控制当前 Task 内部",
  "日常开发直接实施",
  "同一发布流程复用已明确的 E2E 选择",
  "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`",
  "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
  "用户、产品、安全或渠道硬要求优先于持久值",
  "源 Harness 的 `pending` 不授权可选 smoke",
  "用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`",
  "当前请求也不能覆盖 `disabled`",
  "`codex/task-<task-slug>`",
  "`codex/unit-<task-slug>-<unit-slug>`",
  "`set_thread_title`",
  "`SETUP_PENDING`",
  "### 命名、基线与分支",
  "### 执行、提交与边界",
  "### 协调方整合与清理",
  "### 统一 Task 描述模板",
  "Task key：",
  "Git task slug：",
  "`Not applicable`",
  "一次原子写入",
  "当前候选",
  "复用 E2E 选择不复用旧候选的验证证据",
  "明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认"
] as const

/** 描述 Agent policy 文档校验选项。 */
export interface AgentPolicyValidationOptions {
  // 描述 allowPending 接口成员的结构契约。
  allowPending: boolean
  // 描述 requireSourceDefaults 接口成员的结构契约。
  requireSourceDefaults?: boolean
}

/** 描述可用于分配项目 Task 序号的线程记录。 */
export interface ProjectTaskSequenceRecord {
  // 描述 kind 接口成员的结构契约。
  kind?: unknown
  // 描述 hostId 接口成员的结构契约。
  hostId?: unknown
  // 描述 projectId 接口成员的结构契约。
  projectId?: unknown
  // 描述 title 接口成员的结构契约。
  title?: unknown
}

/** 判断标题是否满足当前用户可见 Task 三字段格式与字段约束。 */
export function isValidTaskProgressTitle(title: string): boolean {
  return matchTaskProgressTitle(title) !== undefined
}

/** 返回满足三字段标题契约的匹配组，否则返回 undefined。 */
function matchTaskProgressTitle(
  title: string
): { sequence: string; progress: string; singleResult: string } | undefined {
  const match = TASK_PROGRESS_TITLE_PATTERN.exec(title)
  const singleResult = match?.groups?.singleResult
  if (match?.groups === undefined || singleResult === undefined) return undefined
  if (
    singleResult !== singleResult.trim() ||
    singleResult.split(/\r\n|[\n\r\u0085\u2028\u2029]/u).length !== 1
  ) {
    return undefined
  }
  return {
    sequence: match.groups.sequence ?? "",
    progress: match.groups.progress ?? "",
    singleResult
  }
}

/** 按同一宿主和项目的合法 Codex 标题分配连续递增序号。 */
export function allocateProjectTaskSequences(
  records: Iterable<unknown>,
  options: { hostId: string; projectId: string; count?: number }
): number[] {
  const hostId = options.hostId
  const projectId = options.projectId
  if (typeof hostId !== "string" || hostId === "" || hostId !== hostId.trim()) {
    throw new Error("hostId must be a non-empty trimmed string")
  }
  if (typeof projectId !== "string" || projectId === "" || projectId !== projectId.trim()) {
    throw new Error("projectId must be a non-empty trimmed string")
  }
  const count = options.count ?? 1
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    throw new Error("count must be a positive integer")
  }
  let highestSequence = 0
  for (const record of records) {
    if (record === null || typeof record !== "object") continue
    const candidate = record as ProjectTaskSequenceRecord
    if (
      candidate.kind !== "codex" ||
      candidate.hostId !== hostId ||
      candidate.projectId !== projectId ||
      typeof candidate.title !== "string"
    ) {
      continue
    }
    const matched = matchTaskProgressTitle(candidate.title)
    if (matched !== undefined) {
      highestSequence = Math.max(highestSequence, Number(matched.sequence))
    }
  }
  const firstSequence = highestSequence + 1
  return Array.from({ length: count }, (_, index) => firstSequence + index)
}

/** 解析最小 YAML frontmatter 并拒绝重复或畸形字段。 */
function parseFrontmatter(document: string, errors: string[]): Map<string, string> | undefined {
  const normalized = document.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
  const match = /^---\n(?<body>[\s\S]*?)\n---\n/u.exec(normalized)
  if (match?.groups?.body === undefined) {
    errors.push("missing Agent policy YAML frontmatter")
    return undefined
  }
  const fields = new Map<string, string>()
  for (const line of match.groups.body.split("\n")) {
    const separator = line.indexOf(":")
    const key = separator < 0 ? "" : line.slice(0, separator).trim()
    if (separator < 0 || key === "") {
      errors.push(`invalid Agent policy frontmatter line: ${line}`)
      continue
    }
    if (fields.has(key)) {
      errors.push(`duplicate Agent policy field: ${key}`)
      continue
    }
    fields.set(key, line.slice(separator + 1).trim())
  }
  return fields
}

/** 判断日期值是否是日历有效的 ISO 日期或 RFC3339 时间戳。 */
function isValidConfirmationDate(value: string): boolean {
  const date = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value)
  if (date?.groups !== undefined) {
    const year = Number(date.groups.year)
    const month = Number(date.groups.month)
    const day = Number(date.groups.day)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    )
  }
  const timestamp =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,9})?(?<zone>Z|[+-]\d{2}:\d{2})$/u.exec(
      value
    )
  if (timestamp?.groups === undefined) return false
  const year = Number(timestamp.groups.year)
  const month = Number(timestamp.groups.month)
  const day = Number(timestamp.groups.day)
  const hour = Number(timestamp.groups.hour)
  const minute = Number(timestamp.groups.minute)
  const second = Number(timestamp.groups.second)
  const calendar = new Date(Date.UTC(year, month - 1, day))
  const zone = timestamp.groups.zone ?? ""
  const offset = zone === "Z" ? undefined : /^(?<hour>\d{2}):(?<minute>\d{2})$/u.exec(zone.slice(1))
  const validOffset =
    offset === undefined ||
    (offset !== null && Number(offset.groups?.hour) <= 23 && Number(offset.groups?.minute) <= 59)
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() + 1 === month &&
    calendar.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    validOffset &&
    !Number.isNaN(new Date(value).valueOf())
  )
}

/** 校验 Agent policy 的唯一 schema、值域和下游确认状态。 */
export function validateAgentPolicyDocument(
  document: string,
  options: AgentPolicyValidationOptions
): string[] {
  const errors: string[] = []
  const fields = parseFrontmatter(document, errors)
  if (fields === undefined) return errors
  const expected = new Set<string>(POLICY_FIELDS)
  for (const field of POLICY_FIELDS) {
    if (!fields.has(field)) errors.push(`Agent policy is missing ${field}`)
  }
  for (const field of fields.keys()) {
    if (!expected.has(field)) errors.push(`Agent policy has unknown field: ${field}`)
  }
  if (fields.get("schema_version") !== "3") errors.push("Agent policy schema_version must be 3")
  if (fields.get("decision_mode") !== "reuse_then_infer_then_ask") {
    errors.push("Agent policy decision_mode must be reuse_then_infer_then_ask")
  }
  if (options.requireSourceDefaults === true) {
    const sourceDefaults = {
      confirmed_by: "pending",
      confirmed_at: "pending",
      superpowers: "disabled",
      user_owned_tasks: "disabled",
      parallel_worktree_subagents: "pending",
      acceptance_smoke: "pending",
      e2e_hint: "pending"
    } as const
    for (const [field, expectedValue] of Object.entries(sourceDefaults)) {
      if (fields.get(field) !== expectedValue) {
        errors.push(`Harness source Agent policy ${field} must default to ${expectedValue}`)
      }
    }
  }
  for (const field of [
    "superpowers",
    "user_owned_tasks",
    "parallel_worktree_subagents",
    "acceptance_smoke",
    "e2e_hint"
  ]) {
    const value = fields.get(field)
    if (
      !(["enabled", "disabled", "pending"] as const).includes(
        value as AgentPolicyChoice | "pending"
      )
    ) {
      errors.push(`Agent policy ${field} must be enabled, disabled, or pending`)
    } else if (!options.allowPending && value === "pending") {
      errors.push(`initialized downstream Agent policy must resolve ${field}`)
    }
  }
  for (const field of ["confirmed_by", "confirmed_at"]) {
    if ((fields.get(field) ?? "").trim() === "")
      errors.push(`Agent policy ${field} must not be empty`)
  }
  if (!options.allowPending) {
    const confirmedBy = (fields.get("confirmed_by") ?? "").trim()
    const confirmedAt = (fields.get("confirmed_at") ?? "").trim()
    if (UNRESOLVED_CONFIRMATION.has(confirmedBy.toLowerCase())) {
      errors.push("initialized downstream Agent policy confirmed_by must identify a real source")
    }
    if (
      UNRESOLVED_CONFIRMATION.has(confirmedAt.toLowerCase()) ||
      !isValidConfirmationDate(confirmedAt)
    ) {
      errors.push("initialized downstream Agent policy confirmed_at must be a valid ISO date")
    }
  }
  return errors
}

/** 校验策略正文没有丢失用户可见 Task、并行和候选边界。 */
export function validateAgentPolicyBody(document: string): string[] {
  const errors: string[] = []
  for (const fragment of AGENT_POLICY_REQUIRED_BODY_FRAGMENTS) {
    if (!document.includes(fragment)) errors.push(`Agent policy body is missing: ${fragment}`)
  }
  const example = "Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关"
  if (!document.includes(example) || !isValidTaskProgressTitle(example)) {
    errors.push("Agent policy body must contain a valid Task progress title example")
  }
  return errors
}

/** 返回推荐预设的五项能力选择与真实确认元数据。 */
export function recommendedAgentPolicy(
  confirmedBy: string,
  confirmedAt = new Date().toISOString()
): AgentPolicySelection {
  return {
    confirmedBy,
    confirmedAt,
    superpowers: "disabled",
    userOwnedTasks: "disabled",
    parallelWorktreeSubagents: "disabled",
    acceptanceSmoke: "enabled",
    e2eHint: "disabled"
  }
}

/** 校验准备写入下游的策略对象并返回规范化副本。 */
export function normalizeAgentPolicy(selection: AgentPolicySelection): AgentPolicySelection {
  const confirmedBy = selection.confirmedBy.trim()
  const candidate = { ...selection, confirmedBy }
  const document = renderAgentPolicy("\n", candidate)
  const errors = validateAgentPolicyDocument(document, { allowPending: false })
  if (errors.length > 0) throw new Error(`Invalid resolved Agent policy:\n- ${errors.join("\n- ")}`)
  return candidate
}

/** 用已决选择替换 policy 文档 frontmatter，并保持正文为唯一语义来源。 */
export function renderAgentPolicy(sourceDocument: string, selection: AgentPolicySelection): string {
  const normalized = sourceDocument.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
  const body = normalized.startsWith("---\n")
    ? normalized.replace(/^---\n[\s\S]*?\n---\n/u, "")
    : normalized.replace(/^\n/u, "")
  return `---
schema_version: 3
confirmed_by: ${selection.confirmedBy}
confirmed_at: ${selection.confirmedAt}
decision_mode: reuse_then_infer_then_ask
superpowers: ${selection.superpowers}
user_owned_tasks: ${selection.userOwnedTasks}
parallel_worktree_subagents: ${selection.parallelWorktreeSubagents}
acceptance_smoke: ${selection.acceptanceSmoke}
e2e_hint: ${selection.e2eHint}
---
${body}`
}

/** 将已完全解析的 Agent policy 一次原子写入下游文档。 */
export async function writeResolvedAgentPolicy(
  root: string,
  selection: AgentPolicySelection
): Promise<void> {
  const normalized = normalizeAgentPolicy(selection)
  const policyPath = path.join(root, "docs/AGENT_POLICY.md")
  const source = await readFile(policyPath, "utf8")
  await writeAtomic(policyPath, renderAgentPolicy(source, normalized))
}
