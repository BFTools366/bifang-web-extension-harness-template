import path from "node:path"
import { readFile } from "node:fs/promises"
import { writeAtomic } from "./files.ts"
import type { AgentPolicyChoice, AgentPolicySelection } from "./types.ts"

/** 保存统一 Session 进度标题模板。 */
export const SESSION_PROGRESS_TITLE_TEMPLATE = "{序号}|{Task简述}|{当前进度} |{功能摘要}"
/** 保存左侧 Task 派发时的初始标题模板。 */
export const SESSION_PROGRESS_TITLE_INITIAL = "{序号}|{Task简述}|已分配 |{功能摘要}"
/** 保存统一标题允许的四个生命周期状态。 */
export const SESSION_PROGRESS_STATES = ["已分配", "运行中", "检查中", "已完成"] as const
/** 匹配四段、精确空格且无前导零的 Session 标题。 */
const SESSION_PROGRESS_TITLE_PATTERN =
  /^(?<sequence>[1-9][0-9]*)\|(?<taskSummary>[^|\r\n\u0085\u2028\u2029]+)\|(?<progress>已分配|运行中|检查中|已完成) \|(?<featureSummary>[^|\r\n\u0085\u2028\u2029]+)$/u
/** 保存 Agent policy 唯一字段顺序。 */
const POLICY_FIELDS = [
  "schema_version",
  "confirmed_by",
  "confirmed_at",
  "decision_mode",
  "superpowers",
  "parallel_worktree_subagents",
  "milestone_smoke",
  "milestone_e2e"
] as const
/** 保存不可作为下游确认来源的占位值。 */
const UNRESOLVED_CONFIRMATION = new Set(["pending", "unknown", "unset", "n/a"])
/** 保存策略正文必须保留的跨 Session、Task、并行和候选语义。 */
export const AGENT_POLICY_REQUIRED_BODY_FRAGMENTS = [
  "事件驱动执行",
  "{序号}|{Task简述}|{当前进度} |{功能摘要}",
  "`set_thread_title`",
  "`list_threads`",
  "`read_thread`",
  "`threadId`",
  "`clientThreadId`",
  "`projectId`",
  "`SETUP_PENDING`",
  "不是失败，也不是可传给 `read_thread`、`wait_threads`",
  "非 Git Local Task 才要求 cwd 等于保存项目完整路径",
  "`codex/task-<task-slug>`",
  "`codex/unit-<task-slug>-<unit-slug>`",
  "`spawn_agent`",
  "每次真实进度转换至多尝试一次",
  "只读 Subagent",
  "用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`",
  "当前请求也不能覆盖 `disabled`",
  "### 命名、基线与分支",
  "### 执行、提交与边界",
  "### 协调方整合与清理",
  "### 统一 Task 描述模板",
  "Task key：",
  "Git task slug：",
  "`Not applicable`",
  "一次原子写入",
  "当前候选",
  "不授权发布"
] as const

/** 描述 Agent policy 文档校验选项。 */
export interface AgentPolicyValidationOptions {
  // 描述 allowPending 接口成员的结构契约。
  allowPending: boolean
  // 描述 requireSourceDefaults 接口成员的结构契约。
  requireSourceDefaults?: boolean
}

/** 判断 Session 标题是否满足统一四段格式与字段约束。 */
export function isValidSessionProgressTitle(title: string): boolean {
  const match = SESSION_PROGRESS_TITLE_PATTERN.exec(title)
  if (match?.groups === undefined) return false
  return [match.groups.taskSummary, match.groups.featureSummary].every(
    (value) => value !== undefined && value === value.trim() && value.split(/\r?\n/u).length === 1
  )
}

/** 解析最小 YAML frontmatter 并拒绝重复或畸形字段。 */
function parseFrontmatter(document: string, errors: string[]): Map<string, string> | undefined {
  const match = /^---\n(?<body>[\s\S]*?)\n---\n/u.exec(document)
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
  if (fields.get("schema_version") !== "1") errors.push("Agent policy schema_version must be 1")
  if (fields.get("decision_mode") !== "reuse_then_infer_then_ask") {
    errors.push("Agent policy decision_mode must be reuse_then_infer_then_ask")
  }
  if (options.requireSourceDefaults === true) {
    const sourceDefaults = {
      confirmed_by: "pending",
      confirmed_at: "pending",
      superpowers: "disabled",
      parallel_worktree_subagents: "pending",
      milestone_smoke: "pending",
      milestone_e2e: "pending"
    } as const
    for (const [field, expectedValue] of Object.entries(sourceDefaults)) {
      if (fields.get(field) !== expectedValue) {
        errors.push(`Harness source Agent policy ${field} must default to ${expectedValue}`)
      }
    }
  }
  for (const field of [
    "superpowers",
    "parallel_worktree_subagents",
    "milestone_smoke",
    "milestone_e2e"
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

/** 校验策略正文没有丢失统一标题、项目绑定、并行和候选边界。 */
export function validateAgentPolicyBody(document: string): string[] {
  const errors: string[] = []
  for (const fragment of AGENT_POLICY_REQUIRED_BODY_FRAGMENTS) {
    if (!document.includes(fragment)) errors.push(`Agent policy body is missing: ${fragment}`)
  }
  const examplePattern =
    /`([^`\r\n\u0085\u2028\u2029]+\|[^`\r\n\u0085\u2028\u2029]+\|(?:已分配|运行中|检查中|已完成) \|[^`\r\n\u0085\u2028\u2029]+)`/gu
  const examples = [...document.matchAll(examplePattern)].map((match) => match[1] ?? "")
  if (!examples.some((example) => isValidSessionProgressTitle(example))) {
    errors.push("Agent policy body must contain a valid Session progress title example")
  }
  return errors
}

/** 返回推荐预设的四项能力选择与真实确认元数据。 */
export function recommendedAgentPolicy(
  confirmedBy: string,
  confirmedAt = new Date().toISOString()
): AgentPolicySelection {
  return {
    confirmedBy,
    confirmedAt,
    superpowers: "disabled",
    parallelWorktreeSubagents: "enabled",
    milestoneSmoke: "enabled",
    milestoneE2e: "disabled"
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
  const body = sourceDocument.startsWith("---\n")
    ? sourceDocument.replace(/^---\n[\s\S]*?\n---\n/u, "")
    : sourceDocument.replace(/^\n/u, "")
  return `---
schema_version: 1
confirmed_by: ${selection.confirmedBy}
confirmed_at: ${selection.confirmedAt}
decision_mode: reuse_then_infer_then_ask
superpowers: ${selection.superpowers}
parallel_worktree_subagents: ${selection.parallelWorktreeSubagents}
milestone_smoke: ${selection.milestoneSmoke}
milestone_e2e: ${selection.milestoneE2e}
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
