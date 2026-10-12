import path from "node:path"
import { parseIdentityI18n } from "./identity.ts"
import { assertProjectType, normalizeColor } from "./config.ts"
import { validateBaseUrls } from "./environment.ts"
import type { AgentPolicyMode, ProjectType } from "./types.ts"

/** 枚举创建 Web 时的三个产品形态，仅工具站点已开放流程。 */
export type WebCreationType = "tool-site" | "saas-client" | "saas-admin"

/** 保存创建表单与汇总共用的 Web 类型名称。 */
export const WEB_TYPE_LABELS: Record<WebCreationType, string> = {
  "tool-site": "工具站点",
  "saas-client": "SaaS客户端",
  "saas-admin": "SaaS大后台"
}

/** 将编号、中文名称或 CLI 值解析为显式 Web 类型，不设置默认值。 */
export function parseWebCreationType(value: string): WebCreationType {
  const normalized = value.trim().toLowerCase()
  const types = Object.keys(WEB_TYPE_LABELS) as WebCreationType[]
  const selected = types.find((type, index) =>
    [type, String(index + 1), WEB_TYPE_LABELS[type].toLowerCase()].includes(normalized)
  )
  if (selected !== undefined) return selected
  throw new Error(
    "Web 类型必须选择：1.工具站点（tool-site）/ 2.SaaS客户端（saas-client，流程待开放）/ 3.SaaS大后台（saas-admin，流程待开放）"
  )
}

/** 在初始化写入和策略补问前拒绝不适用字段及尚未开放的 SaaS 流程。 */
export function assertWebCreationAvailable(projectType: ProjectType, value?: string): void {
  if (projectType === "extension") {
    if (value?.trim()) throw new Error("--web-type / webType 仅适用于 Web 项目")
    return
  }
  const type = parseWebCreationType(value ?? "")
  if (type !== "tool-site") {
    throw new Error(`${WEB_TYPE_LABELS[type]}创建流程暂未开放；当前仅工具站点可沿用现有流程创建`)
  }
}

/** 将中文初始化策略选项与命令行模式统一为稳定内部值。 */
export function parsePolicyMode(value: string): AgentPolicyMode {
  const normalized = value.trim().toLowerCase()
  if (["1", "预设", "recommended"].includes(normalized)) return "recommended"
  if (["2", "自定义", "custom"].includes(normalized)) return "custom"
  throw new Error("Agent 策略必须选择预设或自定义（recommended 或 custom）")
}

/** 描述逐项引导可以复用的已提供值。 */
export interface PromptDefaults {
  targetRoot?: string
  projectType?: string
  webType?: string
  name?: string
  id?: string
  description?: string
  identityI18n?: string
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

/** 描述可注入测试替身的单轮交互问答。 */
export type InteractiveQuestion = (question: string) => Promise<string>

/** 枚举初始化基础字段及主动提供 JSON 时使用的稳定键。 */
type BasicField =
  | "targetRoot"
  | "projectType"
  | "webType"
  | "name"
  | "id"
  | "description"
  | "identityI18n"
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

/** 保存逐项引导的字段顺序、显示名和约束。 */
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
  {
    key: "webType",
    label: "Web 类型",
    constraint:
      "1.工具站点（tool-site，现有流程）/ 2.SaaS客户端（saas-client，流程待开放）/ 3.SaaS大后台（saas-admin，流程待开放），不设默认值"
  },
  { key: "name", label: "项目显示名称", constraint: "非空文本" },
  { key: "id", label: "项目标识", constraint: "小写字母、数字和连字符，例如 my-project" },
  {
    key: "targetRoot",
    label: "源 Harness 外的目标目录",
    constraint: "原始输入本身必须是完整绝对路径"
  },
  { key: "description", label: "项目说明", constraint: "Extension 必填，简短说明；Web 可省略" },
  {
    key: "identityI18n",
    label: "身份本地化",
    constraint:
      "可选 JSON 字符串：defaultLocale 为 en 或 zh_CN，translations 提供另一语言名称和说明"
  },
  { key: "brandColor", label: "品牌颜色", constraint: "#RGB 或 #RRGGBB 十六进制颜色" },
  {
    key: "developmentBaseUrl",
    label: "开发 API 基地址",
    constraint: "无凭据、query、fragment 的绝对 http/https URL"
  },
  {
    key: "testBaseUrl",
    label: "测试 API 基地址",
    constraint: "无凭据、query、fragment 的绝对 http/https URL"
  },
  {
    key: "releaseBaseUrl",
    label: "正式 API 基地址",
    constraint: "无凭据、query、fragment 的绝对 https URL"
  },
  {
    key: "policyMode",
    label: "Agent 策略模式",
    constraint: "预设（推荐）或自定义"
  },
  { key: "confirmedBy", label: "确认来源", constraint: "真实确认人或明确责任主体" }
]

/** 保存无需主动询问、但可提供或修正的可选字段。 */
const OPTIONAL_BASIC_FIELDS: readonly BasicField[] = [
  "webType",
  "description",
  "identityI18n",
  "brandColor",
  "developmentBaseUrl",
  "testBaseUrl",
  "releaseBaseUrl",
  "confirmedBy"
]

/** 拒绝空文本并返回去除首尾空白后的值。 */
export function requiredText(value: string | undefined, label: string): string {
  const normalized = value?.trim()
  if (normalized === undefined || normalized === "") throw new Error(`${label}不能为空`)
  return normalized
}

/** 对单个基础字段执行与正式 initializer 一致的只读校验。 */
function normalizeBasicField(
  field: BasicField,
  value: string | undefined,
  allValues: PromptDefaults
): string {
  if (field === "targetRoot") {
    const targetRoot = requiredText(value, "目标目录")
    if (!path.isAbsolute(targetRoot)) throw new Error("必须提供绝对路径")
    return targetRoot
  }
  if (field === "projectType") {
    const normalized = requiredText(value, "项目类型")
    const projectType = normalized === "1" ? "web" : normalized === "2" ? "extension" : normalized
    assertProjectType(projectType)
    return projectType
  }
  if (field === "name") return requiredText(value, "项目名称")
  if (field === "webType") {
    return ["web", "1"].includes(allValues.projectType?.trim() ?? "")
      ? parseWebCreationType(requiredText(value, "Web 类型（--web-type）"))
      : (value?.trim() ?? "")
  }
  if (field === "id") {
    const id = requiredText(value, "项目标识")
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error("项目标识必须由小写 ASCII 字母、数字与单个连字符组成")
    }
    return id
  }
  if (field === "description") {
    return allValues.projectType?.trim() === "extension" || allValues.projectType?.trim() === "2"
      ? requiredText(value, "Extension 项目说明")
      : (value?.trim() ?? "")
  }
  if (field === "identityI18n") {
    parseIdentityI18n(value)
    return value?.trim() ?? ""
  }
  if (field === "brandColor") return normalizeColor(requiredText(value, "品牌颜色"))
  if (field === "policyMode") {
    const policyMode = parsePolicyMode(requiredText(value, "Agent 策略模式"))
    const hasIndividualPolicy = [
      allValues.superpowers,
      allValues.userOwnedTasks,
      allValues.parallelWorktreeSubagents,
      allValues.acceptanceSmoke,
      allValues.e2eHint
    ].some((choice) => choice !== undefined)
    if (policyMode === "recommended" && hasIndividualPolicy) {
      throw new Error("预设模式不能同时指定单项策略；请改用自定义模式")
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

/** 从已知身份推荐可接受的默认值，不猜项目类型、路径或服务地址。 */
function suggestedBasicValue(field: BasicField, values: PromptDefaults): string | undefined {
  if (field === "policyMode") {
    return [
      values.superpowers,
      values.userOwnedTasks,
      values.parallelWorktreeSubagents,
      values.acceptanceSmoke,
      values.e2eHint
    ].some((choice) => choice !== undefined)
      ? "custom"
      : "recommended"
  }
  if (field !== "id") return undefined
  const directoryName =
    values.targetRoot && path.isAbsolute(values.targetRoot) ? path.basename(values.targetRoot) : ""
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(directoryName)) return directoryName
  const name = values.name?.trim() ?? ""
  if (!/^[a-zA-Z][a-zA-Z0-9 -]*$/.test(name)) return undefined
  const id = name.toLowerCase().replace(/[ -]+/g, "-").replace(/-$/, "")
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ? id : undefined
}

/** 接受当前字段的普通回答，同时兼容用户主动附带多个待补字段。 */
function mergeBasicAnswer(
  current: PromptDefaults,
  pending: readonly BasicField[],
  answer: string
): MergedBasicAnswer {
  const field = pending[0]
  if (field === undefined) throw new Error("本轮没有待补充的基础字段")
  const text = answer.trim()
  if (!text.startsWith("{")) {
    return { values: { ...current, [field]: text }, suppliedFields: [field] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(answer)
  } catch {
    throw new Error("附带多个字段时必须提供有效 JSON 对象；也可以只回答当前问题")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("回答必须是一个单行 JSON 对象")
  }
  const record = parsed as Record<string, unknown>
  if (field === "identityI18n" && ("defaultLocale" in record || "translations" in record)) {
    return { values: { ...current, identityI18n: text }, suppliedFields: [field] }
  }
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
      throw new Error(`${field} 必须是字符串`)
    }
    next[field] = String(value)
    suppliedFields.push(field)
  }
  return { values: next, suppliedFields }
}

/** 仅呈现决定下一步的一个问题和可明确接受的建议值。 */
function basicQuestion(
  field: BasicField,
  issue: string,
  suggested: string | undefined,
  parseError?: string
): string {
  const definition = BASIC_FIELDS.find(({ key }) => key === field)
  if (definition === undefined) throw new Error(`未知初始化字段：${field}`)
  const value = field === "policyMode" ? (suggested === "custom" ? "自定义" : "预设") : suggested
  const reason =
    field === "id"
      ? "建议由已知目录名或 ASCII 名称推导。"
      : suggested === "custom"
        ? "已有单项策略，使用自定义可保留这些决定。"
        : "沿用仓库五项预设，减少逐项配置。"
  const guidance =
    suggested === undefined
      ? `${definition.label}希望使用什么值？请直接输入回答。`
      : `是否使用${value}作为${definition.label}？建议/默认：${value}；回车采用，也可输入其他值。${reason}`
  return `${parseError === undefined ? "" : `上次回答无法解析：${parseError}\n`}${guidance}\n字段： ${field}；${definition.constraint}；当前问题：${issue}\n> `
}

/** 按依赖顺序逐项引导，仅重问缺失或非法值并在类型确定后立即检查可用性。 */
export async function collectBasicFields(
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
          : key === "identityI18n"
            ? "默认语言，未提供翻译"
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
    if (!issues.has("projectType") && !issues.has("webType")) {
      const projectType = normalized.projectType
      if (projectType === "web" || projectType === "extension")
        assertWebCreationAvailable(projectType, normalized.webType)
    }
    if (issues.size === 0) {
      if (normalized.projectType === "extension") inputSources.webType = "不适用"
      if (!values.description?.trim()) inputSources.description = "默认使用显示名称"
      for (const key of ["developmentBaseUrl", "testBaseUrl", "releaseBaseUrl"] as const) {
        if (normalized[key] === "") inputSources[key] = "未配置（可后续补齐）"
      }
      return { values: normalized, inputSources }
    }

    const pending = BASIC_FIELDS.filter(({ key }) => issues.has(key)).map(({ key }) => key)
    const field = pending[0]
    if (field === undefined) throw new Error("初始化校验失败，但未找到待补充字段")
    const suggested = suggestedBasicValue(field, normalized)
    const issue = issues.get(field)
    if (issue === undefined) throw new Error(`初始化字段缺少校验问题：${field}`)
    const answer = await ask(basicQuestion(field, issue, suggested, parseError))
    const acceptedDefault = answer.trim() === "" && suggested !== undefined
    try {
      const merged = mergeBasicAnswer(
        normalized,
        pending,
        answer.trim() === "" && suggested !== undefined ? suggested : answer
      )
      values = merged.values
      for (const key of merged.suppliedFields) {
        inputSources[key] = acceptedDefault
          ? "交互接受默认值"
          : answer.trim().startsWith("{")
            ? "交互表单"
            : "交互问答"
      }
      parseError = undefined
    } catch (error) {
      values = normalized
      parseError = error instanceof Error ? error.message : String(error)
    }
  }
}
