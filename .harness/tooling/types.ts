import type { IdentityI18n } from "./identity.ts"

// 保存 PROJECT_TYPES 变量供当前逻辑使用。
export const PROJECT_TYPES = ["web", "extension"] as const

/** 枚举 Harness 支持且互斥的终端项目类型。 */
export type ProjectType = (typeof PROJECT_TYPES)[number]
/** 枚举创建 Web 时明确选择的业务起点，不属于项目身份 Schema。 */
export type WebCreationType = "tool-site" | "saas-client" | "saas-admin"
// 定义 E2eSelection 类型约束单次构建选择。
export type E2eSelection = "enabled" | "disabled"
/** 枚举初始化时可选择的 Agent 策略模式。 */
export type AgentPolicyMode = "recommended" | "custom"
/** 枚举持久 Agent 能力选择。 */
export type AgentPolicyChoice = "enabled" | "disabled"

/** 描述完成初始化前必须完全解析的 Agent 策略。 */
export interface AgentPolicySelection {
  // 描述 confirmedBy 接口成员的结构契约。
  confirmedBy: string
  // 描述 confirmedAt 接口成员的结构契约。
  confirmedAt: string
  // 描述 superpowers 接口成员的结构契约。
  superpowers: AgentPolicyChoice
  // 描述 userOwnedTasks 接口成员的结构契约。
  userOwnedTasks: AgentPolicyChoice
  // 描述 parallelWorktreeSubagents 接口成员的结构契约。
  parallelWorktreeSubagents: AgentPolicyChoice
  // 描述 acceptanceSmoke 接口成员的结构契约。
  acceptanceSmoke: AgentPolicyChoice
  // 描述 e2eHint 接口成员的结构契约。
  e2eHint: AgentPolicyChoice
}

// 定义 BrandConfig 接口的结构契约。
export interface BrandConfig {
  // 描述 primaryColor 接口成员的结构契约。
  primaryColor: string
  // 描述 logoSource 接口成员的结构契约。
  logoSource: "generated" | "uploaded"
  // 描述 masterLogo 接口成员的结构契约。
  masterLogo: ".harness/brand/logo-1024.png"
}

// 定义 ProjectConfig 接口的结构契约。
export interface ProjectConfig {
  // 描述 schemaVersion 接口成员的结构契约。
  schemaVersion: 1
  // 描述 projectType 接口成员的结构契约。
  projectType: ProjectType
  // 描述 name 接口成员的结构契约。
  name: string
  // 描述 id 接口成员的结构契约。
  id: string
  // 描述 description 接口成员的结构契约。
  description: string
  // 保存默认语言及显式提供的身份翻译。
  identityI18n?: IdentityI18n
  // 描述 brand 接口成员的结构契约。
  brand: BrandConfig
  // 描述 initializedAt 接口成员的结构契约。
  initializedAt: string
}

// 定义 EnvironmentBaseUrls 接口的结构契约。
export interface EnvironmentBaseUrls {
  // 描述 developmentBaseUrl 接口成员的结构契约。
  developmentBaseUrl: string
  // 描述 testBaseUrl 接口成员的结构契约。
  testBaseUrl: string
  // 描述 releaseBaseUrl 接口成员的结构契约。
  releaseBaseUrl: string
}

// 定义 InitOptions 接口的结构契约。
export interface InitOptions extends EnvironmentBaseUrls {
  // 描述 root 接口成员的结构契约。
  root: string
  // 描述 projectType 接口成员的结构契约。
  projectType: ProjectType
  // 保存创建期选择，仅用于下游 README 交接，不写入 ProjectConfig。
  webType?: WebCreationType
  // 保存客户端购买选择，仅交接给唯一 PRD，不写入身份或策略。
  saasCommerce?: "enabled" | "disabled"
  // 描述 name 接口成员的结构契约。
  name: string
  // 保存创建期英文译名，仅用于标识生成与确认，不写入 ProjectConfig。
  englishName?: string
  // 描述 id 接口成员的结构契约。
  id: string
  // 描述 description 接口成员的结构契约。
  description: string
  // 保存默认语言及显式提供的身份翻译。
  identityI18n?: IdentityI18n
  // 描述 brandColor 接口成员的结构契约。
  brandColor: string
  // 描述 logoPath 接口成员的结构契约。
  logoPath?: string
  // 描述 agentPolicy 接口成员的结构契约。
  agentPolicy: AgentPolicySelection
  // 描述 skipInstall 接口成员的结构契约。
  skipInstall?: boolean
  // 描述 skipGit 接口成员的结构契约。
  skipGit?: boolean
}

// 定义 InstantiateOptions 接口的结构契约。
export interface InstantiateOptions {
  // 描述 sourceRoot 接口成员的结构契约。
  sourceRoot: string
  // 描述 targetRoot 接口成员的结构契约。
  targetRoot: string
  // 描述 init 接口成员的结构契约。
  init: Omit<InitOptions, "root">
}

// 定义 ParsedArgs 接口的结构契约。
export interface ParsedArgs {
  // 描述 positionals 接口成员的结构契约。
  positionals: string[]
  // 描述 options 接口成员的结构契约。
  options: Map<string, string | boolean>
}
