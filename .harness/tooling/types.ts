export const PROJECT_TYPES = ["web", "extension"] as const

export type ProjectType = (typeof PROJECT_TYPES)[number]

export interface BrandConfig {
  primaryColor: string
  logoSource: "generated" | "uploaded"
  masterLogo: ".harness/brand/logo-1024.png"
}

export interface ProjectConfig {
  schemaVersion: 1
  projectType: ProjectType
  name: string
  id: string
  description: string
  brand: BrandConfig
  initializedAt: string
}

export interface EnvironmentBaseUrls {
  developmentBaseUrl: string
  testBaseUrl: string
  releaseBaseUrl: string
}

export interface InitOptions extends EnvironmentBaseUrls {
  root: string
  projectType: ProjectType
  name: string
  id: string
  description: string
  brandColor: string
  logoPath?: string
  skipInstall?: boolean
  skipGit?: boolean
}

export interface InstantiateOptions {
  sourceRoot: string
  targetRoot: string
  init: Omit<InitOptions, "root">
}

export interface ParsedArgs {
  positionals: string[]
  options: Map<string, string | boolean>
}
