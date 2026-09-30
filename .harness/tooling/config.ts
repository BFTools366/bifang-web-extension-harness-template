import path from "node:path"
import { readJson } from "./files.ts"
import { PROJECT_TYPES, type InitOptions, type ProjectConfig, type ProjectType } from "./types.ts"

// 保存 PROJECT_CONFIG_PATH 变量供当前逻辑使用。
export const PROJECT_CONFIG_PATH = ".harness/project.json" as const
// 保存 MASTER_LOGO_PATH 变量供当前逻辑使用。
export const MASTER_LOGO_PATH = ".harness/brand/logo-1024.png" as const

// Source-only project-creation paths that every terminal project must keep absent.
// 保存 HARNESS_ONLY_PATHS 变量供当前逻辑使用。
export const HARNESS_ONLY_PATHS = [
  ".agents/skills/initialize-web-project",
  ".agents/skills/instantiate-project",
  ".agents/skills/web-instantiate-project",
  ".agents/skills/web-curate-harness-memory",
  ".agents/skills/manage-project-surfaces",
  ".harness/tooling/init.ts",
  ".harness/tooling/install-design-skill.ts",
  ".harness/vendor/design-taste-frontend",
  ".harness/tooling/instantiate.ts",
  ".harness/tooling/manifest.ts",
  ".harness/tooling/process.ts",
  ".harness/tooling/prompts.ts",
  ".harness/tooling/source-snapshot.ts",
  ".harness/tooling/templates",
  ".harness/tooling/finalize.ts",
  "scripts/instantiate.ts",
  "scripts/validate-harness.ts",
  "scripts/harness-validation",
  "tests/agent-policy.test.ts",
  "tests/extension-runtime.test.ts",
  "tests/harness-agents-entrypoint.test.ts",
  "tests/harness-governance.test.ts",
  "tests/harness-initialization.test.ts",
  "tests/design-skill-installation.test.ts",
  "tests/harness-instantiation.test.ts",
  "tests/harness-memory.test.ts",
  "tests/harness-ownership-validation.test.ts",
  "tests/harness-tooling-support.ts",
  "tests/harness-tooling.test.ts",
  "tests/harness-validator.test.ts",
  "tests/initialization-atomicity.test.ts",
  "tests/line-limits.test.ts",
  "docs/TS_WEB_TEMPLATE.md",
  "docs/HARNESS_ENGINEERING.md",
  "docs/harness_engineering",
  "Version.md"
] as const

/** 保存只在实例化时排除、但终端后续事件可以合法创建的记忆与验证路径。 */
export const INSTANTIATION_ONLY_EXCLUDED_PATHS = [
  "docs/product_spec",
  "docs/project_status",
  "docs/work_plan",
  "docs/adr",
  "docs/changelog",
  "docs/VERIFICATION.md",
  "docs/verification"
] as const

// 执行 normalizeColor 函数的处理逻辑。
export function normalizeColor(value: string): string {
  // 保存 trimmed 变量供当前逻辑使用。
  const trimmed = value.trim()
  // 保存 short 变量供当前逻辑使用。
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short !== null) {
    // 保存 chars 变量供当前逻辑使用。
    const chars = short[1]
    if (chars === undefined) throw new Error("Invalid brand color")
    return `#${chars
      .split("")
      .map(/* 执行 当前声明 函数的处理逻辑。 */ (character) => `${character}${character}`)
      .join("")}`.toUpperCase()
  }
  if (!/^#[0-9a-f]{6}$/i.test(trimmed)) {
    throw new Error("Brand color must be a hex value such as #4C6EF5")
  }
  return trimmed.toUpperCase()
}

// 执行 assertProjectType 函数的处理逻辑。
export function assertProjectType(value: unknown): asserts value is ProjectType {
  if (typeof value !== "string" || !PROJECT_TYPES.includes(value as ProjectType)) {
    throw new Error(
      'Project type must be exactly "web" or "extension"; combined projects are not supported'
    )
  }
}

// 执行 requireText 函数的处理逻辑。
function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`)
  }
  return value.trim()
}

// 执行 createProjectConfig 函数的处理逻辑。
export function createProjectConfig(
  options: Pick<
    InitOptions,
    "projectType" | "name" | "id" | "description" | "brandColor" | "logoPath"
  >
): ProjectConfig {
  assertProjectType(options.projectType)
  // 保存 id 变量供当前逻辑使用。
  const id = requireText(options.id, "Project id")
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Project id must be a lowercase kebab-case package id")
  }
  return {
    schemaVersion: 1,
    projectType: options.projectType,
    name: requireText(options.name, "Project name"),
    id,
    description: requireText(options.description, "Project description"),
    brand: {
      primaryColor: normalizeColor(options.brandColor),
      logoSource: options.logoPath === undefined ? "generated" : "uploaded",
      masterLogo: MASTER_LOGO_PATH
    },
    initializedAt: new Date().toISOString()
  }
}

// 执行 validateProjectConfig 函数的处理逻辑。
export function validateProjectConfig(value: unknown): ProjectConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid .harness/project.json: expected an object")
  }
  // 保存 candidate 变量供当前逻辑使用。
  const candidate = value as Partial<ProjectConfig>
  assertProjectType(candidate.projectType)
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported project config schema")
  if (candidate.brand === undefined || typeof candidate.brand !== "object") {
    throw new Error("Invalid project config brand")
  }
  // 保存 config 变量供当前逻辑使用。
  const config = createProjectConfig({
    projectType: candidate.projectType,
    name: requireText(candidate.name, "Project name"),
    id: requireText(candidate.id, "Project id"),
    description: requireText(candidate.description, "Project description"),
    brandColor: requireText(candidate.brand.primaryColor, "Brand color"),
    logoPath: candidate.brand.logoSource === "uploaded" ? "uploaded" : undefined
  })
  if (candidate.brand.masterLogo !== MASTER_LOGO_PATH) {
    throw new Error(`Brand masterLogo must be ${MASTER_LOGO_PATH}`)
  }
  if (candidate.brand.logoSource !== "generated" && candidate.brand.logoSource !== "uploaded") {
    throw new Error("Brand logoSource must be generated or uploaded")
  }
  return {
    ...config,
    initializedAt: requireText(candidate.initializedAt, "initializedAt")
  }
}

// 执行 loadProjectConfig 函数的处理逻辑。
export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  // 保存 raw 变量供当前逻辑使用。
  const raw = await readJson<unknown>(path.join(root, PROJECT_CONFIG_PATH))
  return validateProjectConfig(raw)
}
