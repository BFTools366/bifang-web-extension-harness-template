import { readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { CreationApproval } from "./types.ts"
import { parseIdentityI18n } from "./identity.ts"
import { readRequirementsInput } from "./creation-requirements.ts"
import { createLogo } from "./logo.ts"
import {
  INITIALIZATION_QUESTIONS,
  POLICY_OPTIONS,
  formatInitializationQuestion,
  type PromptDefaults
} from "./initialization-input.ts"
import {
  canonicalizeProspectiveTarget,
  validateInitializationTarget
} from "./initialization-target.ts"
import {
  collectPromptedIdentity,
  formatInstantiationSummary,
  type InstantiationSummary,
  type PromptedIdentity
} from "./prompts.ts"

/** 固定完整创建汇总需要的需求事实；具体语义仍由需求与功能组合 Skill 负责。 */
export const CREATION_SCOPE_FIELDS = {
  users: "目标用户",
  home: "真实首页",
  pages: "必要页面",
  operations: "核心操作、依赖及原因",
  design: "固定设计与交互",
  data: "数据模式与接口边界",
  acceptance: "可观察验收场景与开发走查"
} as const

/** 区分有需求依据的自动选择和仍需用户取舍的推荐。 */
interface SelectionChoice {
  value: string
  reason: string
  mode: "automatic" | "recommendation"
}

/** 自动选择绑定需求分析修订，不能覆盖显式答案或编造外部服务事实。 */
interface CreationSelection {
  revision: string
  projectType?: SelectionChoice
  serverMode?: SelectionChoice
}

/** 描述聊天适配器保存的原始输入；不把派生结果写回 values。 */
export interface CreationFormInput {
  values: PromptDefaults
  selection?: CreationSelection
  scope?: Record<keyof typeof CREATION_SCOPE_FIELDS, string>
  logoPath?: string
  /** Agent 推导译名绑定原显示名称；用户显式英文译名仍只存 values。 */
  translation?: { name: string; englishName: string }
  decision?: { revision: string; answer: string; source: string }
}

/** 返回只读表单状态；只有当前汇总明确授权后才给出唯一入口参数。 */
export interface CreationFormResult {
  phase:
    | "collecting"
    | "needs-translation"
    | "needs-scope"
    | "needs-brand"
    | "awaiting-confirmation"
    | "authorized"
    | "cancelled"
  field?: keyof PromptDefaults
  question?: string
  summary?: string
  revision?: string
  analysisRevision?: string
  issue?: string
  argv?: string[]
  approval?: CreationApproval
  identity?: PromptedIdentity
}

/** 使用普通异常提前返回一个待答问题，不执行用户交互或任何写入。 */
class PendingQuestion extends Error {
  /** 保留下一题的结构化身份与完整显示内容。 */
  constructor(
    readonly question: string,
    readonly field: keyof PromptDefaults
  ) {
    super("创建表单仍有待答项")
  }
}

/** 对机器输入严格收窄，不把未知字段、对象或需求中的命令当成控制参数。 */
export function parseCreationFormInput(input: unknown): CreationFormInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("表单输入必须是对象")
  const record = input as Record<string, unknown>
  const allowed = ["values", "selection", "scope", "logoPath", "translation", "decision"]
  if (Object.keys(record).some((key) => !allowed.includes(key)))
    throw new Error("表单包含未知控制字段")
  const values = record.values
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("values 必须是对象")
  const fields = new Set([
    ...Object.keys(INITIALIZATION_QUESTIONS.basic),
    ...Object.keys(POLICY_OPTIONS)
  ])
  for (const [key, value] of Object.entries(values)) {
    if (!fields.has(key) || typeof value !== "string") throw new Error(`非法表单字段：${key}`)
  }
  if (record.selection !== undefined) validateSelection(record.selection)
  if (record.translation !== undefined) {
    if (
      !record.translation ||
      typeof record.translation !== "object" ||
      Array.isArray(record.translation)
    )
      throw new Error("translation 必须是对象")
    const translation = record.translation as Record<string, unknown>
    if (
      Object.keys(translation).some((key) => !["name", "englishName"].includes(key)) ||
      typeof translation.name !== "string" ||
      typeof translation.englishName !== "string"
    )
      throw new Error("translation 仅接受 name 和 englishName 字符串")
  }
  if (record.logoPath !== undefined && typeof record.logoPath !== "string")
    throw new Error("logoPath 必须是字符串")
  if (record.scope !== undefined) {
    if (!record.scope || typeof record.scope !== "object" || Array.isArray(record.scope))
      throw new Error("scope 必须是对象")
    if (Object.keys(record.scope).some((key) => !Object.hasOwn(CREATION_SCOPE_FIELDS, key)))
      throw new Error("scope 包含未知字段")
    for (const key of Object.keys(CREATION_SCOPE_FIELDS)) {
      const value = (record.scope as Record<string, unknown>)[key]
      if (typeof value !== "string" || !value.trim()) throw new Error(`scope.${key} 必须是非空事实`)
    }
  }
  if (record.decision !== undefined) {
    if (!record.decision || typeof record.decision !== "object" || Array.isArray(record.decision))
      throw new Error("decision 必须是对象")
    const decision = record.decision as Record<string, unknown>
    if (Object.keys(decision).some((key) => !["revision", "answer", "source"].includes(key)))
      throw new Error("decision 包含未知字段")
    for (const key of ["revision", "answer", "source"]) {
      if (typeof decision[key] !== "string") throw new Error(`decision.${key} 必须是字符串`)
    }
  }
  return input as CreationFormInput
}

/** 只接受两项逻辑选择及其理由；现成服务存在性仍须来自用户事实。 */
function validateSelection(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("selection 必须是对象")
  const selection = raw as Record<string, unknown>
  if (
    Object.keys(selection).some(
      (key) => !["revision", "projectType", "serverMode"].includes(key)
    ) ||
    typeof selection.revision !== "string" ||
    !selection.revision.trim()
  )
    throw new Error("selection 需要有效分析修订")
  for (const field of ["projectType", "serverMode"] as const) {
    const rawChoice = selection[field]
    if (rawChoice === undefined) continue
    if (!rawChoice || typeof rawChoice !== "object" || Array.isArray(rawChoice))
      throw new Error(`selection.${field} 必须是对象`)
    const choice = rawChoice as Record<string, unknown>
    const allowedValues =
      field === "projectType" ? ["web", "extension"] : ["existing", "create", "none"]
    if (
      Object.keys(choice).some((key) => !["value", "reason", "mode"].includes(key)) ||
      typeof choice.value !== "string" ||
      !allowedValues.includes(choice.value) ||
      typeof choice.reason !== "string" ||
      !choice.reason.trim() ||
      typeof choice.mode !== "string" ||
      !["automatic", "recommendation"].includes(choice.mode)
    )
      throw new Error(`selection.${field} 需要合法值、非空理由和选择模式`)
    if (field === "serverMode" && choice.mode === "automatic" && choice.value !== "none")
      throw new Error("只能自动选择确定的纯本地模式；是否有现成服务须复用或询问用户事实")
    if (field === "projectType" && choice.mode === "automatic")
      throw new Error("Web / Extension 必须由用户明确选择，不能由需求分析自动填入")
  }
}

/** 从已校验结果产生唯一工程命令，调用者不得再手工重组已批准的参数。 */
function creationArguments(identity: PromptedIdentity, logoPath: string): string[] {
  const argv = [
    identity.targetRoot,
    `--type=${(identity.workspaceMembers ?? [identity.projectType]).join(",")}`,
    `--server=${identity.serverMode}`,
    `--name=${identity.name}`,
    `--id=${identity.id}`,
    `--description=${identity.description}`,
    `--brand-color=${identity.brandColor}`,
    `--policy-mode=${identity.policyMode}`,
    `--confirmed-by=${identity.agentPolicy.confirmedBy}`,
    `--logo=${logoPath}`
  ]
  for (const key of [
    "apiContract",
    "requirementsFile",
    "requirementsText",
    "englishName",
    "identityI18n",
    "developmentBaseUrl",
    "testBaseUrl",
    "releaseBaseUrl"
  ] as const) {
    if (!identity[key]) continue
    const option = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    argv.push(`--${option}=${identity[key]}`)
  }
  if (identity.policyMode === "custom") {
    for (const [key, option] of Object.entries(POLICY_OPTIONS)) {
      argv.push(`--${option}=${identity.agentPolicy[key as keyof typeof POLICY_OPTIONS]}`)
    }
  }
  return argv
}

/** 复用真实收集器、校验和渲染，聊天模型只负责从用户回答中提取事实。 */
export async function inspectCreationForm(
  sourceRoot: string,
  raw: unknown
): Promise<CreationFormResult> {
  const resolvedSourceRoot = path.resolve(sourceRoot)
  const input = parseCreationFormInput(raw)
  if (
    input.decision &&
    ["cancel", "取消", "no", "n"].includes(input.decision.answer.trim().toLowerCase())
  ) {
    return { phase: "cancelled" }
  }
  // 需求文件按源根解析；读取失败仍交给共享收集器显示对应修正题。
  let requirementsSha256: string | undefined
  try {
    requirementsSha256 = (
      await readRequirementsInput({
        ...input.values,
        requirementsFile: input.values.requirementsFile
          ? path.resolve(resolvedSourceRoot, input.values.requirementsFile)
          : undefined
      })
    )?.sha256
  } catch {
    /* 需求字段在共享收集器中独立校验。 */
  }
  const analysisRevision = createHash("sha256")
    .update(
      JSON.stringify({
        requirementsSha256,
        scope: input.scope
          ? Object.keys(CREATION_SCOPE_FIELDS).map((key) => [
              key,
              input.scope?.[key as keyof typeof CREATION_SCOPE_FIELDS]
            ])
          : undefined,
        projectType: input.values.projectType,
        serverMode: input.values.serverMode
      })
    )
    .digest("hex")
  const selection = input.selection?.revision === analysisRevision ? input.selection : undefined
  const staleSelection = input.selection !== undefined && selection === undefined
  const selectedValues: PromptDefaults = { ...input.values }
  const automaticSources: Record<string, string> = {}
  for (const field of ["serverMode"] as const) {
    const choice = selection?.[field]
    if (input.values[field] === undefined && choice?.mode === "automatic") {
      selectedValues[field] = choice.value
      automaticSources[field] = `Agent 根据需求自动选择：${choice.reason}`
    }
  }
  let identity: PromptedIdentity
  try {
    identity = await collectPromptedIdentity(
      {
        ...selectedValues,
        englishName:
          input.values.englishName ??
          (input.translation?.name === input.values.name
            ? input.translation?.englishName
            : undefined)
      },
      async (question, context) => {
        if (!context) throw new Error("表单题目缺少字段身份")
        throw new PendingQuestion(question, context.field)
      },
      {
        mode: "agent",
        cwd: resolvedSourceRoot,
        validateTarget: (values) => validateInitializationTarget(resolvedSourceRoot, values)
      }
    )
  } catch (error) {
    if (error instanceof PendingQuestion) {
      if (
        staleSelection &&
        !["requirementsFile", "requirementsText", "projectType"].includes(error.field)
      )
        return {
          phase: "needs-scope",
          analysisRevision,
          issue: "需求、范围或显式选择已变化，请重新分析并绑定当前修订"
        }
      // 先询问可选需求，再取得用户明确宿主选择，之后才分析服务与能力。
      if (
        !input.scope &&
        !selection &&
        [
          "serverMode",
          "apiContract",
          "developmentBaseUrl",
          "testBaseUrl",
          "releaseBaseUrl"
        ].includes(error.field)
      )
        return { phase: "needs-scope", analysisRevision }
      if (error.field === "englishName" && input.values.englishName === undefined)
        return { phase: "needs-translation", field: "englishName", analysisRevision }
      let question =
        error.field === "serverMode" && input.scope
          ? `需求判断：${input.scope.data}\n\n${error.question}`
          : error.question
      const recommendation =
        error.field === "projectType" || error.field === "serverMode"
          ? selection?.[error.field]
          : undefined
      if (recommendation?.mode === "recommendation") {
        const label = INITIALIZATION_QUESTIONS.basic[
          error.field as "projectType" | "serverMode"
        ].options.find((option) => option.value === recommendation.value)?.label
        question += `\n推荐：${label}。依据：${recommendation.reason}；请明确选择。`
      }
      return { phase: "collecting", field: error.field, question, analysisRevision }
    }
    throw error
  }
  if (staleSelection)
    return {
      phase: "needs-scope",
      analysisRevision,
      issue: "需求、范围或显式选择已变化，请重新分析并绑定当前修订"
    }
  // 预览不能因运行时间变化使相同输入的确认失效；真实工程创建才记录最终时间。
  identity.agentPolicy.confirmedAt = "工程创建时记录最终日期"
  identity.inputSources = Object.fromEntries(
    Object.entries(identity.inputSources).map(([key, source]) => [
      key,
      source === "命令行参数" ? "当前创建请求" : source
    ])
  )
  identity.inputSources = { ...identity.inputSources, ...automaticSources }
  if (input.values.englishName === undefined && input.translation?.name === input.values.name) {
    identity.inputSources = {
      ...identity.inputSources,
      englishName: "Agent 英文翻译（绑定显示名称）"
    }
  }
  if (!input.scope) return { phase: "needs-scope", identity, analysisRevision }
  if (!input.logoPath) return { phase: "needs-brand", identity, analysisRevision }
  if (!path.isAbsolute(input.logoPath)) throw new Error("已选 Logo 必须是绝对路径")
  const logoBytes = await readFile(input.logoPath)
  await createLogo({
    root: resolvedSourceRoot,
    name: identity.name,
    id: identity.id,
    color: identity.brandColor,
    logoPath: input.logoPath,
    logoBytes
  })
  const requirements = await readRequirementsInput(identity)
  const target = path.join(identity.targetRoot, identity.id)
  const summaryInput: InstantiationSummary = {
    rawSourceRoot: resolvedSourceRoot,
    canonicalSourceRoot: await canonicalizeProspectiveTarget(resolvedSourceRoot),
    rawParentRoot: identity.rawParentRoot ?? identity.targetRoot,
    pathBaseRoot: resolvedSourceRoot,
    rawTargetRoot: target,
    canonicalTargetRoot: await canonicalizeProspectiveTarget(target),
    policyMode: identity.policyMode,
    inputSources: identity.inputSources,
    requirements: requirements
      ? {
          sourcePath: identity.requirementsFile ?? "直接输入或 Word 提取的需求文本",
          sha256: requirements.sha256,
          byteLength: Buffer.byteLength(requirements.content)
        }
      : undefined,
    init: {
      ...identity,
      logoPath: input.logoPath,
      identityI18n: parseIdentityI18n(identity.identityI18n)
    }
  }
  const summary =
    formatInstantiationSummary(summaryInput) +
    "\n\n首版完整范围\n" +
    Object.entries(CREATION_SCOPE_FIELDS)
      .map(
        ([key, label]) => `- ${label}：${input.scope?.[key as keyof typeof CREATION_SCOPE_FIELDS]}`
      )
      .join("\n")
  const question = formatInitializationQuestion(INITIALIZATION_QUESTIONS.agentConfirmation, {
    field: "agentConfirmation",
    mode: "agent"
  })
  const approval: CreationApproval = {
    canonicalTargetRoot: summaryInput.canonicalTargetRoot,
    requirementsSha256: requirements?.sha256,
    apiContractSha256: identity.apiContract
      ? createHash("sha256")
          .update(await readFile(identity.apiContract))
          .digest("hex")
      : undefined,
    logoSha256: createHash("sha256").update(logoBytes).digest("hex")
  }
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        engineering: summaryInput,
        scope: Object.keys(CREATION_SCOPE_FIELDS).map((key) => [
          key,
          input.scope?.[key as keyof typeof CREATION_SCOPE_FIELDS]
        ]),
        question,
        approval
      })
    )
    .digest("hex")
  const result: CreationFormResult = {
    phase: "awaiting-confirmation",
    summary,
    question,
    revision,
    analysisRevision
  }
  if (!input.decision) return result
  if (input.decision.revision !== revision)
    return { ...result, issue: "输入或范围已变化，旧确认不能授权当前汇总" }
  const answer = input.decision.answer.trim().toLowerCase()
  if (!["yes", "y", "确认"].includes(answer) || !input.decision.source.trim()) {
    return {
      ...result,
      issue: "需要当前汇总的明确确认及真实用户消息来源；空回答、预选或超时不是授权"
    }
  }
  return {
    ...result,
    phase: "authorized",
    argv: creationArguments(identity, input.logoPath),
    approval: {
      ...approval,
      initialCreationAuthorization: {
        revision,
        source: input.decision.source,
        scope: { ...input.scope }
      }
    }
  }
}
