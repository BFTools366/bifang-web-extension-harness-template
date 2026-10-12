import { derivedLogoPaths } from "./brand.ts"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { recommendedAgentPolicy } from "./agent-policy.ts"
import { normalizeColor } from "./config.ts"
import type {
  AgentPolicyChoice,
  AgentPolicyMode,
  AgentPolicySelection,
  InitOptions,
  ProjectType
} from "./types.ts"

import {
  collectBasicFields,
  parsePolicyMode,
  parseWebCreationType,
  requiredText,
  WEB_TYPE_LABELS
} from "./initialization-input.ts"
import type {
  InteractiveQuestion,
  PromptDefaults,
  WebCreationType
} from "./initialization-input.ts"

/** 描述基础表单解析完成后的项目身份与 Agent 策略。 */
export interface PromptedIdentity {
  targetRoot: string
  policyMode: AgentPolicyMode
  inputSources: Readonly<Record<string, string>>
  projectType: ProjectType
  webType?: WebCreationType
  name: string
  id: string
  description: string
  identityI18n?: string
  brandColor: string
  developmentBaseUrl: string
  testBaseUrl: string
  releaseBaseUrl: string
  agentPolicy: AgentPolicySelection
}

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
    | "identityI18n"
    | "brandColor"
    | "logoPath"
    | "developmentBaseUrl"
    | "testBaseUrl"
    | "releaseBaseUrl"
    | "agentPolicy"
  > & { webType?: WebCreationType }
}

/** 描述自定义策略值及其最终输入来源。 */
interface ResolvedPolicyChoice {
  choice: AgentPolicyChoice
  source: "命令行参数" | "交互条件问询" | "交互接受默认值"
}

/** 将用户能力回答规范化为 enabled 或 disabled。 */
function parsePolicyChoice(value: string, label: string): AgentPolicyChoice {
  const normalized = value.trim().toLowerCase()
  if (["1", "enabled", "enable", "yes", "y", "是", "启用", "开启"].includes(normalized))
    return "enabled"
  if (["2", "disabled", "disable", "no", "n", "否", "禁用", "关闭"].includes(normalized))
    return "disabled"
  throw new Error(`${label} 必须是 enabled 或 disabled`)
}

/** 按询问顺序列出自定义策略字段、命令行名称与问题。 */
const POLICY_QUESTIONS = [
  {
    key: "userOwnedTasks",
    field: "user-owned-tasks",
    question: "是否开启左侧 user-owned Task 自动拆分？"
  },
  { key: "superpowers", field: "superpowers", question: "是否启用 Superpowers？" },
  {
    key: "parallelWorktreeSubagents",
    field: "parallel-worktree-subagents",
    question: "是否启用并行 Worktree/Subagent？"
  },
  { key: "acceptanceSmoke", field: "acceptance-smoke", question: "是否启用完整候选冒烟？" },
  {
    key: "e2eHint",
    field: "e2e-hint",
    question: "是否建议启用发布首次 E2E？同一发布流程复用已明确选择。"
  }
] as const

/** 逐轮读取一个自定义策略选择，非法值只重问当前字段。 */
async function collectPolicyChoice(
  supplied: string | undefined,
  field: string,
  question: string,
  suggested: AgentPolicyChoice,
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
    const answer = await ask(
      `${issue === undefined ? "" : `当前问题：${issue}\n`}${question}\n建议/默认：${suggested}；回车采用，也可回答启用/关闭：`
    )
    candidate = answer.trim() || suggested
    source = answer.trim() ? "交互条件问询" : "交互接受默认值"
  }
}

/** 运行可测试的交互状态机并返回完全解析的初始化输入。 */
export async function collectPromptedIdentity(
  defaults: PromptDefaults,
  ask: InteractiveQuestion
): Promise<PromptedIdentity> {
  const collected = await collectBasicFields(defaults, ask)
  const basic = collected.values
  const projectType = requiredText(basic.projectType, "项目类型") as ProjectType
  const policyMode = parsePolicyMode(requiredText(basic.policyMode, "Agent 策略模式"))
  const confirmedBy = requiredText(basic.confirmedBy, "Agent policy confirmation source")
  let agentPolicy: AgentPolicySelection
  let policySources: Record<string, string>
  if (policyMode === "recommended") {
    agentPolicy = recommendedAgentPolicy(confirmedBy)
    policySources = Object.fromEntries(
      POLICY_QUESTIONS.map(({ key }) => [key, "recommended 确定性预设"])
    )
  } else {
    const suggested = recommendedAgentPolicy(confirmedBy)
    const choices: Record<string, AgentPolicyChoice> = {}
    policySources = {}
    for (const { key, field, question } of POLICY_QUESTIONS) {
      const resolved = await collectPolicyChoice(basic[key], field, question, suggested[key], ask)
      choices[key] = resolved.choice
      policySources[key] = resolved.source
    }
    agentPolicy = {
      confirmedBy,
      confirmedAt: new Date().toISOString(),
      ...choices
    } as AgentPolicySelection
  }

  return {
    targetRoot: requiredText(basic.targetRoot, "目标目录"),
    policyMode,
    inputSources: { ...collected.inputSources, ...policySources },
    projectType,
    webType: projectType === "web" ? parseWebCreationType(basic.webType ?? "") : undefined,
    name: requiredText(basic.name, "项目名称"),
    id: requiredText(basic.id, "项目标识"),
    description: basic.description?.trim() || requiredText(basic.name, "项目名称"),
    identityI18n: basic.identityI18n || undefined,
    brandColor: normalizeColor(requiredText(basic.brandColor, "品牌颜色")),
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
- 项目类型：${summary.init.projectType}${summary.init.webType === undefined ? "" : `\n- Web 类型：${WEB_TYPE_LABELS[summary.init.webType]}（${summary.init.webType}）`}
- 展示名称：${summary.init.name}
- 项目 id：${summary.init.id}
- 项目说明：${summary.init.description}
- 品牌颜色：${summary.init.brandColor}
- Logo：${summary.init.logoPath ?? "未提供（初始化器确定性生成）"}
- 母版：.harness/brand/logo-1024.png（1024×1024 PNG）
- 派生资产：${derivedLogoPaths({ projectType: summary.init.projectType }).join(", ")}
- 身份本地化：${JSON.stringify(summary.init.identityI18n ?? { defaultLocale: "en", translations: {} })}
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
