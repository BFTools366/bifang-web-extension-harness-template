import { readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { CreationApproval } from "./types.ts"
import { parseIdentityI18n } from "./identity.ts"
import { readCreationRequirements } from "./creation-requirements.ts"
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

/** 描述聊天适配器保存的原始输入；不把派生结果写回 values。 */
export interface CreationFormInput {
  values: PromptDefaults
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
  const allowed = ["values", "scope", "logoPath", "translation", "decision"]
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

/** 从已校验结果产生唯一工程命令，调用者不得再手工重组已批准的参数。 */
function creationArguments(identity: PromptedIdentity, logoPath: string): string[] {
  const argv = [
    identity.targetRoot,
    `--type=${identity.projectType}`,
    `--name=${identity.name}`,
    `--id=${identity.id}`,
    `--description=${identity.description}`,
    `--brand-color=${identity.brandColor}`,
    `--policy-mode=${identity.policyMode}`,
    `--confirmed-by=${identity.agentPolicy.confirmedBy}`,
    `--logo=${logoPath}`
  ]
  for (const key of [
    "requirementsFile",
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
  let identity: PromptedIdentity
  try {
    identity = await collectPromptedIdentity(
      {
        ...input.values,
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
        validateTarget: (values) => validateInitializationTarget(resolvedSourceRoot, values)
      }
    )
  } catch (error) {
    if (error instanceof PendingQuestion) {
      if (error.field === "englishName" && input.values.englishName === undefined)
        return { phase: "needs-translation", field: "englishName" }
      return { phase: "collecting", field: error.field, question: error.question }
    }
    throw error
  }
  // 预览不能因运行时间变化使相同输入的确认失效；真实工程创建才记录最终时间。
  identity.agentPolicy.confirmedAt = "工程创建时记录最终日期"
  identity.inputSources = Object.fromEntries(
    Object.entries(identity.inputSources).map(([key, source]) => [
      key,
      source === "命令行参数" ? "当前创建请求" : source
    ])
  )
  if (input.values.englishName === undefined && input.translation?.name === input.values.name) {
    identity.inputSources = {
      ...identity.inputSources,
      englishName: "Agent 英文翻译（绑定显示名称）"
    }
  }
  if (!input.scope) return { phase: "needs-scope", identity }
  if (!input.logoPath) return { phase: "needs-brand", identity }
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
  const requirements = identity.requirementsFile
    ? await readCreationRequirements(identity.requirementsFile)
    : undefined
  const target = path.join(identity.targetRoot, identity.id)
  const summaryInput: InstantiationSummary = {
    rawSourceRoot: resolvedSourceRoot,
    canonicalSourceRoot: await canonicalizeProspectiveTarget(resolvedSourceRoot),
    rawParentRoot: identity.targetRoot,
    rawTargetRoot: target,
    canonicalTargetRoot: await canonicalizeProspectiveTarget(target),
    policyMode: identity.policyMode,
    inputSources: identity.inputSources,
    requirements:
      requirements && identity.requirementsFile
        ? {
            sourcePath: identity.requirementsFile,
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
  const result: CreationFormResult = { phase: "awaiting-confirmation", summary, question, revision }
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
    approval
  }
}
