import path from "node:path"
import { assertExtensionIdentity, validateIdentityI18n } from "./identity.ts"
import { readJson } from "./files.ts"
import { PROJECT_TYPES, type InitOptions, type ProjectConfig, type ProjectType } from "./types.ts"

export const PROJECT_CONFIG_PATH = ".harness/project.json" as const
export const MASTER_LOGO_PATH = ".harness/brand/logo-1024.png" as const
/** 已迁至需求定义的旧原型 PRD 参考；源与终端都必须拒绝其恢复，升级按受管删除处理。 */
export const RETIRED_PRD_OUTLINE_PATH =
  ".agents/skills/web-design-prototype/references/prd-outline.md" as const

// Source-only project-creation paths that every terminal project must keep absent.
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
  ".harness/tooling/initialization-input.ts",
  ".harness/tooling/creation-requirements.ts",
  ".harness/tooling/saas-commerce-choice.ts",
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
  "tests/initialization-guidance.test.ts",
  "tests/creation-requirements.test.ts",
  "tests/saas-foundation-guidance.test.ts",
  "tests/web-routing-policy.test.ts",
  "tests/saas-creation.test.ts",
  "tests/capability-assets.test.ts",
  "tests/application-wiring-fixture.ts",
  "tests/application-wiring.test.ts",
  "tests/application-capabilities.test.ts",
  "tests/application-content.test.ts",
  "tests/application-shell.test.ts",
  "tests/application-settings.test.ts",
  "tests/application-organization.test.ts",
  "tests/application-readonly.test.ts",
  "tests/capability-source-reference.test.ts",
  "tests/identity-localization.test.ts",
  "tests/http-foundation.test.ts",
  "tests/harness-http-governance.test.ts",
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
  "Version.md",
  ".harness/tooling/instantiate-target.ts",
  "tests/harness-project-validation.test.ts",
  "tests/harness-terminal-governance.test.ts",
  "tests/harness-initialization-web.test.ts",
  "tests/harness-initialization-extension.test.ts",
  "tests/harness-instantiation-fixture.ts",
  "tests/harness-instantiation-terminal.test.ts",
  "tests/harness-validator-fixture.ts",
  "tests/harness-skill-validation.test.ts",
  "tests/harness-saas-commerce-reference.test.ts",
  "tests/project-memory-compatibility.test.ts",
  "tests/initialization-atomicity-fixture.ts",
  "tests/initialization-source-boundary.test.ts",
  "tests/path-containment.test.ts",
  "tests/node-tooling.test.ts",
  "tests/prototype-workflow.test.ts",
  "tests/harness-api-document-export.test.ts"
] as const

/** 保存只在实例化时排除、但终端后续事件可以合法创建的记忆与验证路径。 */
export const INSTANTIATION_ONLY_EXCLUDED_PATHS = [
  "docs/product_spec",
  "docs/prototypes",
  "docs/project_status",
  "docs/work_plan",
  "docs/adr",
  "docs/changelog",
  "docs/VERIFICATION.md",
  "docs/verification"
] as const

// 执行 normalizeColor 函数的处理逻辑。
export function normalizeColor(value: string): string {
  const trimmed = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short !== null) {
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
    "projectType" | "name" | "id" | "description" | "identityI18n" | "brandColor" | "logoPath"
  >
): ProjectConfig {
  assertProjectType(options.projectType)
  const id = requireText(options.id, "Project id")
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Project id must be a lowercase kebab-case package id")
  }
  const config: ProjectConfig = {
    schemaVersion: 1,
    projectType: options.projectType,
    name: requireText(options.name, "Project name"),
    id,
    description: requireText(options.description, "Project description"),
    ...(options.identityI18n === undefined
      ? {}
      : { identityI18n: validateIdentityI18n(options.identityI18n) }),
    brand: {
      primaryColor: normalizeColor(options.brandColor),
      logoSource: options.logoPath === undefined ? "generated" : "uploaded",
      masterLogo: MASTER_LOGO_PATH
    },
    initializedAt: new Date().toISOString()
  }
  assertExtensionIdentity(config)
  return config
}

// 执行 validateProjectConfig 函数的处理逻辑。
export function validateProjectConfig(value: unknown): ProjectConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid .harness/project.json: expected an object")
  }
  const candidate = value as Partial<ProjectConfig>
  assertProjectType(candidate.projectType)
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported project config schema")
  if (candidate.brand === undefined || typeof candidate.brand !== "object") {
    throw new Error("Invalid project config brand")
  }
  const config = createProjectConfig({
    projectType: candidate.projectType,
    name: requireText(candidate.name, "Project name"),
    id: requireText(candidate.id, "Project id"),
    description: requireText(candidate.description, "Project description"),
    identityI18n: validateIdentityI18n(candidate.identityI18n),
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
  const raw = await readJson<unknown>(path.join(root, PROJECT_CONFIG_PATH))
  return validateProjectConfig(raw)
}
