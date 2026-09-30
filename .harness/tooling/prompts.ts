import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import path from "node:path"
import { recommendedAgentPolicy } from "./agent-policy.ts"
import { assertProjectType, normalizeColor } from "./config.ts"
import { validateBaseUrls } from "./environment.ts"
import type {
  AgentPolicyChoice,
  AgentPolicyMode,
  AgentPolicySelection,
  InitOptions,
  ProjectType
} from "./types.ts"

/** 将中文初始化策略选项与命令行模式统一为稳定内部值。 */
export function parsePolicyMode(value: string): AgentPolicyMode {
  const normalized = value.trim().toLowerCase()
  if (["1", "预设", "recommended"].includes(normalized)) return "recommended"
  if (["2", "自定义", "custom"].includes(normalized)) return "custom"
  throw new Error("Agent 策略必须选择预设或自定义（recommended 或 custom）")
}

/** 描述交互表单可以复用的已提供值。 */
export interface PromptDefaults {
  targetRoot?: string
  projectType?: string
  name?: string
  id?: string
  description?: string
  brandColor?: string
  developmentBaseUrl?: string
  testBaseUrl?: string
  releaseBaseUrl?: string
  policyMode?: string
  confirmedBy?: string
  superpowers?: string
  userOwnedTasks?: string
  parallelWorktreeSubagents?: string
  acceptanceSmoke?: string
  e2eHint?: string
}

/** 描述基础表单解析完成后的项目身份与 Agent 策略。 */
export interface PromptedIdentity {
  targetRoot: string
  policyMode: AgentPolicyMode
  inputSources: Readonly<Record<string, string>>
  projectType: ProjectType
  name: string
  id: string
  description: string
  brandColor: string
  developmentBaseUrl: string
  testBaseUrl: string
  releaseBaseUrl: string
  agentPolicy: AgentPolicySelection
}

/** 描述可注入测试替身的单轮交互问答。 */
export type InteractiveQuestion = (question: string) => Promise<string>

/** 描述写入前完整初始化汇总所需事实。 */
export interface InstantiationSummary {
  rawSourceRoot: string
  canonicalSourceRoot: string
  rawTargetRoot: string
  canonicalTargetRoot: string
  inputSources: Readonly<Record<string, string>>
  policyMode: AgentPolicyMode
  init: Pick<
    InitOptions,
    | "projectType"
    | "name"
    | "id"
    | "description"
    | "brandColor"
    | "logoPath"
    | "developmentBaseUrl"
    | "testBaseUrl"
    | "releaseBaseUrl"
    | "agentPolicy"
  >
}

/** 枚举首轮批量表单的稳定字段名。 */
type BasicField =
  | "targetRoot"
  | "projectType"
  | "name"
  | "id"
  | "description"
  | "brandColor"
  | "developmentBaseUrl"
  | "testBaseUrl"
  | "releaseBaseUrl"
  | "policyMode"
  | "confirmedBy"

/** 描述已解析基础字段及其最终输入来源。 */
interface CollectedBasicFields {
  values: PromptDefaults
  inputSources: Record<string, string>
}

/** 描述一轮 JSON 回答实际更新的基础字段。 */
interface MergedBasicAnswer {
  values: PromptDefaults
  suppliedFields: BasicField[]
}

/** 描述自定义策略值及其最终输入来源。 */
interface ResolvedPolicyChoice {
  choice: AgentPolicyChoice
  source: "命令行参数" | "交互条件问询"
}

/** 保存首轮基础字段的编号、显示名和约束。 */
const BASIC_FIELDS: ReadonlyArray<{
  key: BasicField
  label: string
  constraint: string
}> = [
  {
    key: "projectType",
    label: "项目类型",
    constraint: "web（React 网页）或 extension（Chrome 扩展），不设默认值"
  },
  { key: "name", label: "项目显示名称", constraint: "非空文本" },
  { key: "id", label: "项目标识", constraint: "小写字母、数字和连字符，例如 my-project" },
  {
    key: "targetRoot",
    label: "源 Harness 外的目标目录",
    constraint: "原始输入本身必须是完整绝对路径"
  },
  { key: "description", label: "项目说明", constraint: "可省略，默认使用显示名称" },
  { key: "brandColor", label: "品牌颜色", constraint: "#RGB 或 #RRGGBB 十六进制颜色" },
  {
    key: "developmentBaseUrl",
    label: "Development API BaseURL",
    constraint: "无凭据、query、fragment 的绝对 http/https URL"
  },
  {
    key: "testBaseUrl",
    label: "Test API BaseURL",
    constraint: "无凭据、query、fragment 的绝对 http/https URL"
  },
  {
    key: "releaseBaseUrl",
    label: "Release API BaseURL",
    constraint: "无凭据、query、fragment 的绝对 https URL"
  },
  {
    key: "policyMode",
    label: "Agent 策略模式",
    constraint: "预设（推荐）或自定义"
  },
  { key: "confirmedBy", label: "确认来源", constraint: "真实确认人或明确责任主体" }
]

/** 保存无需首轮询问、但可主动提供或修正的可选字段。 */
const OPTIONAL_BASIC_FIELDS: readonly BasicField[] = [
  "description",
  "brandColor",
  "developmentBaseUrl",
  "testBaseUrl",
  "releaseBaseUrl",
  "confirmedBy"
]

/** 将用户能力回答规范化为 enabled 或 disabled。 */
function parsePolicyChoice(value: string, label: string): AgentPolicyChoice {
  const normalized = value.trim().toLowerCase()
  if (["1", "enabled", "enable", "yes", "y"].includes(normalized)) return "enabled"
  if (["2", "disabled", "disable", "no", "n"].includes(normalized)) return "disabled"
  throw new Error(`${label} must be enabled or disabled`)
}

/** 拒绝空文本并返回去除首尾空白后的值。 */
function requiredText(value: string | undefined, label: string): string {
  const normalized = value?.trim()
  if (normalized === undefined || normalized === "") throw new Error(`${label} is required`)
  return normalized
}

/** 对单个基础字段执行与正式 initializer 一致的只读校验。 */
function normalizeBasicField(
  field: BasicField,
  value: string | undefined,
  allValues: PromptDefaults
): string {
  if (field === "targetRoot") {
    const targetRoot = requiredText(value, "Instantiation target")
    if (!path.isAbsolute(targetRoot)) throw new Error("must be provided as an absolute path")
    return targetRoot
  }
  if (field === "projectType") {
    const normalized = requiredText(value, "Project type")
    const projectType = normalized === "1" ? "web" : normalized === "2" ? "extension" : normalized
    assertProjectType(projectType)
    return projectType
  }
  if (field === "name") return requiredText(value, "Project name")
  if (field === "id") {
    const id = requiredText(value, "Project id")
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error("must be a lowercase ASCII kebab-case package id")
    }
    return id
  }
  if (field === "description") return value?.trim() ?? ""
  if (field === "brandColor") return normalizeColor(requiredText(value, "Brand color"))
  if (field === "policyMode") {
    const policyMode = parsePolicyMode(requiredText(value, "Agent policy mode"))
    const hasIndividualPolicy = [
      allValues.superpowers,
      allValues.userOwnedTasks,
      allValues.parallelWorktreeSubagents,
      allValues.acceptanceSmoke,
      allValues.e2eHint
    ].some((choice) => choice !== undefined)
    if (policyMode === "recommended" && hasIndividualPolicy) {
      throw new Error(
        "recommended cannot be combined with individual policy choices; choose custom"
      )
    }
    return policyMode
  }
  if (field === "confirmedBy") return value?.trim() || "当前用户"

  const baseUrls = {
    developmentBaseUrl: field === "developmentBaseUrl" ? (value ?? "") : "",
    testBaseUrl: field === "testBaseUrl" ? (value ?? "") : "",
    releaseBaseUrl: field === "releaseBaseUrl" ? (value ?? "") : ""
  }
  return validateBaseUrls(baseUrls)[field]
}

/** 将用户的一行 JSON 回答合并到仍待修正的基础字段。 */
function mergeBasicAnswer(
  current: PromptDefaults,
  pending: readonly BasicField[],
  answer: string
): MergedBasicAnswer {
  let parsed: unknown
  try {
    parsed = JSON.parse(answer)
  } catch {
    throw new Error("回答必须是一个单行 JSON object")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("回答必须是一个单行 JSON object")
  }
  const record = parsed as Record<string, unknown>
  const allowed = new Set([...pending, ...OPTIONAL_BASIC_FIELDS])
  const unknown = Object.keys(record).filter((key) => !allowed.has(key as BasicField))
  if (unknown.length > 0) {
    throw new Error(`本轮只接受这些字段：${pending.join(", ")}；发现 ${unknown.join(", ")}`)
  }
  const next = { ...current }
  const suppliedFields: BasicField[] = []
  for (const field of allowed) {
    if (!(field in record)) continue
    const value = record[field]
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`${field} 必须是 string`)
    }
    next[field] = String(value)
    suppliedFields.push(field)
  }
  return { values: next, suppliedFields }
}

/** 生成一次包含全部待修正字段的编号表单。 */
function basicQuestion(issues: ReadonlyMap<BasicField, string>, parseError?: string): string {
  const fields = BASIC_FIELDS.filter(({ key }) => issues.has(key))
  const lines = fields.map(({ key, label, constraint }, index) => {
    const issue = issues.get(key)
    return `${index + 1}. ${label}（JSON key: ${key}）：${constraint}；当前问题：${issue}`
  })
  return `${parseError === undefined ? "" : `上次回答无法解析：${parseError}\n`}请一次填写以下尚未解析的基础字段；输入单行 JSON：\n${lines.join("\n")}\n开发 API 地址 developmentBaseUrl 可选，可后续配置；测试与正式地址可留到发布前配置。\n> `
}

/** 首轮批量收集基础字段，后续仅重问缺失或非法项。 */
async function collectBasicFields(
  defaults: PromptDefaults,
  ask: InteractiveQuestion
): Promise<CollectedBasicFields> {
  let values: PromptDefaults = {
    ...defaults,
    brandColor: defaults.brandColor ?? "#4C6EF5"
  }
  const inputSources: Record<string, string> = {}
  for (const { key } of BASIC_FIELDS) {
    if (defaults[key] !== undefined) inputSources[key] = "命令行参数"
  }
  if (defaults.brandColor === undefined) inputSources.brandColor = "Harness 默认值"
  for (const key of OPTIONAL_BASIC_FIELDS) {
    if (defaults[key] === undefined)
      inputSources[key] =
        key === "description"
          ? "默认使用显示名称"
          : key === "confirmedBy"
            ? "当前用户（自动记录）"
            : key === "brandColor"
              ? "Harness 默认值"
              : "未配置（可后续补齐）"
  }
  let parseError: string | undefined
  while (true) {
    const normalized: PromptDefaults = { ...values }
    if (!values.confirmedBy?.trim()) inputSources.confirmedBy = "当前用户（自动记录）"
    const issues = new Map<BasicField, string>()
    for (const { key } of BASIC_FIELDS) {
      try {
        normalized[key] = normalizeBasicField(key, values[key], values)
      } catch (error) {
        issues.set(key, error instanceof Error ? error.message : String(error))
      }
    }
    if (issues.size === 0) {
      if (!values.description?.trim()) inputSources.description = "默认使用显示名称"
      for (const key of ["developmentBaseUrl", "testBaseUrl", "releaseBaseUrl"] as const) {
        if (normalized[key] === "") inputSources[key] = "未配置（可后续补齐）"
      }
      return { values: normalized, inputSources }
    }

    const pending = BASIC_FIELDS.filter(({ key }) => issues.has(key)).map(({ key }) => key)
    const answer = await ask(basicQuestion(issues, parseError))
    try {
      const merged = mergeBasicAnswer(normalized, pending, answer)
      values = merged.values
      for (const field of merged.suppliedFields) inputSources[field] = "交互表单"
      parseError = undefined
    } catch (error) {
      values = normalized
      parseError = error instanceof Error ? error.message : String(error)
    }
  }
}

/** 逐轮读取一个自定义策略选择，非法值只重问当前字段。 */
async function collectPolicyChoice(
  supplied: string | undefined,
  field: string,
  question: string,
  ask: InteractiveQuestion
): Promise<ResolvedPolicyChoice> {
  let candidate = supplied
  let source: ResolvedPolicyChoice["source"] = "命令行参数"
  let issue: string | undefined
  while (true) {
    if (candidate !== undefined) {
      try {
        return { choice: parsePolicyChoice(candidate, field), source }
      } catch (error) {
        issue = error instanceof Error ? error.message : String(error)
      }
    }
    candidate = await ask(`${issue === undefined ? "" : `当前问题：${issue}\n`}${question}`)
    source = "交互条件问询"
  }
}

/** 运行可测试的交互状态机并返回完全解析的初始化输入。 */
export async function collectPromptedIdentity(
  defaults: PromptDefaults,
  ask: InteractiveQuestion
): Promise<PromptedIdentity> {
  const collected = await collectBasicFields(defaults, ask)
  const basic = collected.values
  const projectType = normalizeBasicField("projectType", basic.projectType, basic) as ProjectType
  const policyMode = parsePolicyMode(requiredText(basic.policyMode, "Agent policy mode"))
  const confirmedBy = requiredText(basic.confirmedBy, "Agent policy confirmation source")
  let agentPolicy: AgentPolicySelection
  let policySources: Record<string, string>
  if (policyMode === "recommended") {
    agentPolicy = recommendedAgentPolicy(confirmedBy)
    policySources = {
      userOwnedTasks: "recommended 确定性预设",
      superpowers: "recommended 确定性预设",
      parallelWorktreeSubagents: "recommended 确定性预设",
      acceptanceSmoke: "recommended 确定性预设",
      e2eHint: "recommended 确定性预设"
    }
  } else {
    const userOwnedTasks = await collectPolicyChoice(
      basic.userOwnedTasks,
      "user-owned-tasks",
      "左侧 user-owned Task 自动拆分（enabled 或 disabled；推荐 disabled）：",
      ask
    )
    const superpowers = await collectPolicyChoice(
      basic.superpowers,
      "superpowers",
      "Superpowers（enabled 或 disabled）：",
      ask
    )
    const parallelWorktreeSubagents = await collectPolicyChoice(
      basic.parallelWorktreeSubagents,
      "parallel-worktree-subagents",
      "并行 Worktree/Subagent（enabled 或 disabled；推荐 disabled）：",
      ask
    )
    const acceptanceSmoke = await collectPolicyChoice(
      basic.acceptanceSmoke,
      "acceptance-smoke",
      "完整候选冒烟（enabled 或 disabled）：",
      ask
    )
    const e2eHint = await collectPolicyChoice(
      basic.e2eHint,
      "e2e-hint",
      "发布首次 E2E 选择的建议值（enabled 或 disabled；同一发布流程复用已明确选择）：",
      ask
    )
    agentPolicy = {
      confirmedBy,
      confirmedAt: new Date().toISOString(),
      superpowers: superpowers.choice,
      userOwnedTasks: userOwnedTasks.choice,
      parallelWorktreeSubagents: parallelWorktreeSubagents.choice,
      acceptanceSmoke: acceptanceSmoke.choice,
      e2eHint: e2eHint.choice
    }
    policySources = {
      userOwnedTasks: userOwnedTasks.source,
      superpowers: superpowers.source,
      parallelWorktreeSubagents: parallelWorktreeSubagents.source,
      acceptanceSmoke: acceptanceSmoke.source,
      e2eHint: e2eHint.source
    }
  }

  return {
    targetRoot: requiredText(basic.targetRoot, "Instantiation target"),
    policyMode,
    inputSources: { ...collected.inputSources, ...policySources },
    projectType,
    name: requiredText(basic.name, "Project name"),
    id: requiredText(basic.id, "Project id"),
    description: basic.description?.trim() || requiredText(basic.name, "Project name"),
    brandColor: normalizeColor(requiredText(basic.brandColor, "Brand color")),
    developmentBaseUrl: basic.developmentBaseUrl ?? "",
    testBaseUrl: basic.testBaseUrl ?? "",
    releaseBaseUrl: basic.releaseBaseUrl ?? "",
    agentPolicy
  }
}

/** 使用当前终端执行交互初始化表单。 */
export async function promptForIdentity(defaults: PromptDefaults): Promise<PromptedIdentity> {
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    return await collectPromptedIdentity(defaults, (question) => prompt.question(question))
  } finally {
    prompt.close()
  }
}

/** 渲染写入前必须由用户完整确认的初始化事实。 */
export function formatInstantiationSummary(summary: InstantiationSummary): string {
  const policy = summary.init.agentPolicy
  const sourceLines = Object.entries(summary.inputSources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, source]) => `  - ${field}: ${source}`)
    .join("\n")
  return `初始化完整汇总
- 源路径（原始）：${summary.rawSourceRoot}
- 源路径（规范）：${summary.canonicalSourceRoot}
- 目标路径（原始）：${summary.rawTargetRoot}
- 目标路径（规范）：${summary.canonicalTargetRoot}
- Agent 策略模式：${summary.policyMode === "recommended" ? "预设" : "自定义"}
- 项目类型：${summary.init.projectType}
- 展示名称：${summary.init.name}
- 项目 id：${summary.init.id}
- 项目说明：${summary.init.description}
- 品牌颜色：${summary.init.brandColor}
- Logo：${summary.init.logoPath ?? "未提供（初始化器确定性生成）"}
- 开发 API 地址：${summary.init.developmentBaseUrl || "未配置，可后续补齐"}
- 测试 API 地址：${summary.init.testBaseUrl || "未配置，可后续补齐"}
- 正式 API 地址：${summary.init.releaseBaseUrl || "未配置，正式发布前必须补齐 HTTPS 地址"}
- Agent Policy：user_owned_tasks=${policy.userOwnedTasks}, superpowers=${policy.superpowers}, parallel_worktree_subagents=${policy.parallelWorktreeSubagents}, acceptance_smoke=${policy.acceptanceSmoke}, e2e_hint=${policy.e2eHint}
- 策略确认来源：${policy.confirmedBy}
- 策略确认时间：${policy.confirmedAt}
- 输入来源：
${sourceLines}`
}

/** 展示完整汇总并提出写入前唯一最终确认。 */
export async function confirmInstantiation(
  summary: InstantiationSummary,
  ask?: InteractiveQuestion
): Promise<boolean> {
  const question = `${formatInstantiationSummary(summary)}\n\n按此创建？输入 yes 确认，其余回答取消：`
  if (ask !== undefined) {
    return ["yes", "y", "确认"].includes((await ask(question)).trim().toLowerCase())
  }
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    return ["yes", "y", "确认"].includes((await prompt.question(question)).trim().toLowerCase())
  } finally {
    prompt.close()
  }
}

/** 判断当前进程是否同时拥有交互输入和输出终端。 */
export function isInteractiveTerminal(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true
}
