import path from "node:path"
import { parseWorkspaceSelection, parseServerMode } from "./workspace-selection.ts"
import initializationQuestions from "../../.agents/skills/web-instantiate-project/references/initialization-questions.json" with { type: "json" }
import { assertExtensionIdentityText, parseIdentityI18n } from "./identity.ts"
import { assertProjectType, normalizeColor } from "./config.ts"
import { validateBaseUrls } from "./environment.ts"
import type { AgentPolicyMode, ProjectType } from "./types.ts"
import { createRequirementsText, readCreationRequirements } from "./creation-requirements.ts"

/** 将创建类型编号或名称解析为唯一宿主，不提供默认类型。 */
export function parseProjectType(value: string): ProjectType {
  const normalized = value.trim().toLowerCase()
  const projectType = normalized === "1" ? "web" : normalized === "2" ? "extension" : normalized
  assertProjectType(projectType)
  return projectType
}

/** 从英文名称生成稳定标识；非英文名称必须先由 Agent 翻译或提供英文译名。 */
export function deriveProjectId(name?: string, englishName?: string): string | undefined {
  const english = (englishName ?? name)?.trim() ?? ""
  if (!/^[\x20-\x7e]+$/.test(english)) return undefined
  const id = english
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ? id : undefined
}

/** 在拼接目录前拒绝非法标识，避免路径片段逃逸。 */
export function validateProjectId(value: string): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error("项目标识必须由小写 ASCII 字母、数字与单个连字符组成")
  }
  return value
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
  serverMode?: string
  apiContract?: string
  /** 保存可选需求原文路径；空字符串表示用户选择继续逐项引导。 */
  requirementsFile?: string
  /** 保存直接输入或 Word 提取的完整正文，保留首尾空白与换行。 */
  requirementsText?: string
  name?: string
  englishName?: string
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
export type InteractiveQuestion = (
  question: string,
  context?: { field: keyof PromptDefaults }
) => Promise<string>

/** 控制聊天与终端的空回答语义，并允许调用方注入当前源的只读目标校验。 */
export interface InitializationInteraction {
  mode?: "cli" | "agent"
  cwd?: string
  validateTarget?: (values: PromptDefaults) => Promise<void>
}

/** 关联题库策略字段与唯一命令行参数，题序仍只来自题库。 */
export const POLICY_OPTIONS = {
  userOwnedTasks: "user-owned-tasks",
  superpowers: "superpowers",
  parallelWorktreeSubagents: "parallel-worktree-subagents",
  acceptanceSmoke: "acceptance-smoke",
  e2eHint: "e2e-hint"
} as const satisfies Record<keyof typeof initializationQuestions.policy, string>

/** 枚举初始化基础字段及主动提供 JSON 时使用的稳定键。 */
type BasicField = keyof typeof initializationQuestions.basic

/** 为 CLI 与 Agent 提供同一份固定题名、题面及选项说明。 */
export const INITIALIZATION_QUESTIONS = initializationQuestions

/** 描述固定题目的展示内容，选项说明必须跟在选项名称之后。 */
interface InitializationQuestion {
  title: string
  question: string
  hint: string
  options: readonly { value: string; label: string; description: string }[]
}

/** 将固定内容与可变建议、校验错误分别展示，重问时不改题名或题面。 */
export function formatInitializationQuestion(
  definition: InitializationQuestion,
  context: {
    field: string
    suggested?: string
    issue?: string
    parseError?: string
    mode?: "cli" | "agent"
  }
): string {
  const lines = [
    `问题名称：${definition.title}`,
    definition.question,
    ...definition.options.map(({ label, description }) => `- ${label}（${description}）`),
    definition.hint
  ]
  if (context.suggested !== undefined) {
    lines.push(
      context.mode === "agent"
        ? `建议：${context.suggested === "" ? "不提供" : context.suggested}；需明确回答接受，也可输入其他值。`
        : `建议/默认：${context.suggested}；回车采用，也可输入其他值。`
    )
  }
  if (context.parseError !== undefined) lines.push(`上次回答无法解析：${context.parseError}`)
  if (context.issue !== undefined) lines.push(`当前问题：${context.issue}`)
  lines.push(`字段： ${context.field}`, "> ")
  return lines.join("\n")
}

/** 描述已解析基础字段及其最终输入来源。 */
interface CollectedBasicFields {
  values: PromptDefaults
  inputSources: Record<string, string>
  rawParentRoot?: string
}

/** 描述一轮 JSON 回答实际更新的基础字段。 */
interface MergedBasicAnswer {
  values: PromptDefaults
  suppliedFields: BasicField[]
}

/** 按固定清单中的键顺序逐项收集基础字段，不随默认值改变问法。 */
const BASIC_FIELDS = (Object.keys(INITIALIZATION_QUESTIONS.basic) as BasicField[]).map((key) => ({
  key
}))

/** 保存无需主动询问、但可提供或修正的可选字段。 */
const OPTIONAL_BASIC_FIELDS: readonly BasicField[] = [
  "apiContract",
  "requirementsText",
  "englishName",
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
async function normalizeBasicField(
  field: BasicField,
  value: string | undefined,
  allValues: PromptDefaults,
  cwd: string
): Promise<string> {
  const selected = allValues.projectType ? parseWorkspaceSelection(allValues.projectType) : []
  const isExtension = selected.includes("extension")
  if (field === "targetRoot") {
    const targetRoot = requiredText(value, "目标目录")
    return path.resolve(cwd, targetRoot)
  }
  if (field === "projectType") {
    return parseWorkspaceSelection(requiredText(value, "项目类型")).join(",")
  }
  if (field === "serverMode") {
    return parseServerMode(value)
  }
  if (field === "apiContract") return value?.trim() ? path.resolve(cwd, value.trim()) : ""
  if (field === "requirementsFile") {
    if (value?.trim() && allValues.requirementsText) {
      throw new Error("需求文件与直接文本只能提供一种")
    }
    if (allValues.requirementsText) return ""
    if (value === undefined) throw new Error("可提供需求文件、直接输入文字，或选择暂不提供")
    const file = value.trim()
    const resolved = file ? path.resolve(cwd, file) : ""
    if (resolved) await readCreationRequirements(resolved)
    return resolved
  }
  if (field === "requirementsText") {
    if (value) createRequirementsText(value)
    return value ?? ""
  }
  if (field === "name") {
    const name = requiredText(value, "项目名称")
    if (isExtension) assertExtensionIdentityText(name, "name")
    return name
  }
  if (field === "englishName") {
    if (!value?.trim() && (allValues.id?.trim() || deriveProjectId(allValues.name))) return ""
    const englishName = requiredText(value, "项目名称的英文翻译（--english-name）")
    if (deriveProjectId(undefined, englishName) === undefined) {
      throw new Error("请提供以英文字母开头的英文名称，用于生成项目标识")
    }
    return englishName
  }
  if (field === "id") {
    return validateProjectId(
      requiredText(
        value ?? deriveProjectId(allValues.name, allValues.englishName || undefined),
        "项目标识"
      )
    )
  }
  if (field === "description") {
    const description = isExtension
      ? requiredText(value, "Extension 项目说明")
      : (value?.trim() ?? "")
    if (isExtension) assertExtensionIdentityText(description, "description")
    return description
  }
  if (field === "identityI18n") {
    const identity = parseIdentityI18n(value)
    if (isExtension) {
      for (const translated of Object.values(identity?.translations ?? {})) {
        assertExtensionIdentityText(translated.name, "name")
        assertExtensionIdentityText(translated.description, "description")
      }
    }
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
  const normalizedUrl = validateBaseUrls(baseUrls)[field]
  if (
    field === "developmentBaseUrl" &&
    allValues.serverMode &&
    parseServerMode(allValues.serverMode) === "existing" &&
    !normalizedUrl
  ) {
    throw new Error("已有服务端必须提供开发 BaseURL")
  }
  return normalizedUrl
}

/** 从已知身份推荐可接受的默认值，不猜项目类型、路径或服务地址。 */
function suggestedBasicValue(field: BasicField, values: PromptDefaults): string | undefined {
  if (field === "requirementsFile") return ""
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
  return undefined
}

/** 接受当前字段的普通回答，同时兼容用户主动附带多个待补字段。 */
function mergeBasicAnswer(
  current: PromptDefaults,
  pending: readonly BasicField[],
  answer: string
): MergedBasicAnswer {
  const field = pending[0]
  if (field === undefined) throw new Error("本轮没有待补充的基础字段")
  if (field === "requirementsText") {
    return { values: { ...current, requirementsText: answer }, suppliedFields: [field] }
  }
  const text = answer.trim()
  if (field === "requirementsFile" && /^(?:text:|文字：)/i.test(text)) {
    const content = answer.replace(/^\s*(?:text:|文字：)/i, "")
    createRequirementsText(content)
    return {
      values: { ...current, requirementsFile: "", requirementsText: content },
      suppliedFields: ["requirementsFile", "requirementsText"]
    }
  }
  if (!text.startsWith("{")) {
    return {
      values: {
        ...current,
        ...(field === "requirementsFile" ? { requirementsText: undefined } : {}),
        [field]: text
      },
      suppliedFields: [field]
    }
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
  parseError?: string,
  mode?: "cli" | "agent"
): string {
  const value =
    field === "policyMode" && suggested !== undefined
      ? suggested === "custom"
        ? "自定义"
        : "预设"
      : suggested
  return formatInitializationQuestion(INITIALIZATION_QUESTIONS.basic[field], {
    field,
    suggested: value,
    issue,
    parseError,
    mode
  })
}

/** 按依赖顺序逐项引导，仅重问缺失或非法值并在类型确定后立即检查可用性。 */
export async function collectBasicFields(
  defaults: PromptDefaults,
  ask: InteractiveQuestion,
  interaction: InitializationInteraction = {}
): Promise<CollectedBasicFields> {
  let values: PromptDefaults = {
    ...defaults,
    brandColor: defaults.brandColor ?? "#4C6EF5"
  }
  let rawParentRoot = defaults.targetRoot
  const cwd = path.resolve(interaction.cwd ?? process.cwd())
  const inputSources: Record<string, string> = {}
  for (const { key } of BASIC_FIELDS) {
    if (defaults[key] !== undefined) inputSources[key] = "命令行参数"
  }
  if (defaults.brandColor === undefined) inputSources.brandColor = "Harness 默认值"
  for (const key of OPTIONAL_BASIC_FIELDS) {
    if (key === "englishName") continue
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
    // 派生标识随名称重算，只有用户显式提供的标识才作为稳定输入复用。
    if (inputSources.id === "英文名称自动生成") values = { ...values, id: undefined }
    const normalized: PromptDefaults = { ...values }
    if (!values.confirmedBy?.trim()) inputSources.confirmedBy = "当前用户（自动记录）"
    const issues = new Map<BasicField, string>()
    for (const { key } of BASIC_FIELDS) {
      try {
        normalized[key] = await normalizeBasicField(key, values[key], values, cwd)
      } catch (error) {
        issues.set(key, error instanceof Error ? error.message : String(error))
      }
    }
    if (values.id === undefined && normalized.id !== undefined && !issues.has("id")) {
      inputSources.id = "英文名称自动生成"
    }
    if (!issues.has("targetRoot") && !issues.has("id") && interaction.validateTarget) {
      try {
        await interaction.validateTarget(normalized)
      } catch (error) {
        issues.set("targetRoot", error instanceof Error ? error.message : String(error))
      }
    }
    if (issues.size === 0) {
      if (!values.description?.trim()) inputSources.description = "默认使用显示名称"
      for (const key of ["developmentBaseUrl", "testBaseUrl", "releaseBaseUrl"] as const) {
        if (normalized[key] === "") inputSources[key] = "未配置（可后续补齐）"
      }
      return { values: normalized, inputSources, rawParentRoot }
    }

    const pending = BASIC_FIELDS.filter(({ key }) => issues.has(key)).map(({ key }) => key)
    const field = pending[0]
    if (field === undefined) throw new Error("初始化校验失败，但未找到待补充字段")
    const suggested = suggestedBasicValue(field, normalized)
    const issue = issues.get(field)
    if (issue === undefined) throw new Error(`初始化字段缺少校验问题：${field}`)
    const answer = await ask(basicQuestion(field, issue, suggested, parseError, interaction.mode), {
      field
    })
    const acceptedDefault =
      interaction.mode !== "agent" && answer.trim() === "" && suggested !== undefined
    if (interaction.mode === "agent" && answer.trim() === "") continue
    try {
      const merged = mergeBasicAnswer(
        normalized,
        pending,
        acceptedDefault ? (suggested ?? "") : answer
      )
      values = merged.values
      if (merged.suppliedFields.includes("targetRoot")) rawParentRoot = values.targetRoot
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
