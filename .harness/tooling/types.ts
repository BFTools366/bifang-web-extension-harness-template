/** 约束与现有英文、简体中文 UI 对齐的浏览器身份语言。 */
export type IdentityLocale = "en" | "zh_CN"

/** 描述一份完整的本地化项目身份，禁止半份翻译。 */
export interface LocalizedIdentity {
  name: string
  description: string
}

/** 默认语言消费根名称和说明，其他语言只保存显式翻译。 */
export interface IdentityI18n {
  defaultLocale: IdentityLocale
  translations: Partial<Record<IdentityLocale, LocalizedIdentity>>
}

// 保存 PROJECT_TYPES 变量供当前逻辑使用。
export const PROJECT_TYPES = ["web", "extension"] as const

/** 枚举 Harness 支持且互斥的终端项目类型。 */
export type ProjectType = (typeof PROJECT_TYPES)[number]
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
  // 描述 name 接口成员的结构契约。
  name: string
  // 保存创建期英文译名，仅用于标识生成与确认，不写入 ProjectConfig。
  englishName?: string
  /** 保存创建期可选需求路径，仅由公开创建入口消费，不写入身份配置。 */
  requirementsFile?: string
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
  /** 保存用户需求的冻结原文，与 staging 一起提交或回收。 */
  requirements?: CreationRequirements
  /** 聊天完整创建批准的冻结事实，必须在事务首次写入前独立复核。 */
  approval?: CreationApproval
}

/** 绑定真实规范目标、需求原文及已选 Logo 的批准摘要。 */
export interface CreationApproval {
  canonicalTargetRoot: string
  requirementsSha256?: string
  logoSha256: string
}

/** 描述与用户确认内容绑定的需求原文快照，不承载执行指令或身份配置。 */
export interface CreationRequirements {
  content: string
  sha256: string
}

// 定义 ParsedArgs 接口的结构契约。
export interface ParsedArgs {
  // 描述 positionals 接口成员的结构契约。
  positionals: string[]
  // 描述 options 接口成员的结构契约。
  options: Map<string, string | boolean>
}
