// 保存 PROJECT_TYPES 变量供当前逻辑使用。
export const PROJECT_TYPES = ["web", "extension"] as const

export type ProjectType = (typeof PROJECT_TYPES)[number]

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
  // 描述 id 接口成员的结构契约。
  id: string
  // 描述 description 接口成员的结构契约。
  description: string
  // 描述 brandColor 接口成员的结构契约。
  brandColor: string
  // 描述 logoPath 接口成员的结构契约。
  logoPath?: string
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
