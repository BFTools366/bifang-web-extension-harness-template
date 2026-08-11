import path from "node:path"
import { readJson } from "./files.ts"
import { PROJECT_TYPES, type InitOptions, type ProjectConfig, type ProjectType } from "./types.ts"

export const PROJECT_CONFIG_PATH = ".harness/project.json" as const
export const MASTER_LOGO_PATH = ".harness/brand/logo-1024.png" as const

// Generator-only paths that finalizeDownstream removes and validateProject must
// confirm stay absent from every terminal project. Single source of truth for both.
export const HARNESS_ONLY_PATHS = [
  ".agents/skills/initialize-web-project",
  ".agents/skills/instantiate-project",
  ".agents/skills/manage-project-surfaces",
  ".harness/tooling/init.ts",
  ".harness/tooling/instantiate.ts",
  ".harness/tooling/manifest.ts",
  ".harness/tooling/process.ts",
  ".harness/tooling/prompts.ts",
  ".harness/tooling/templates",
  ".harness/tooling/finalize.ts",
  "scripts/instantiate.ts",
  "scripts/validate-harness.ts",
  "tests/extension-runtime.test.ts",
  "tests/harness-tooling.test.ts",
  "tests/harness-validator.test.ts",
  "tests/initialization-atomicity.test.ts",
  "docs/TS_WEB_TEMPLATE.md",
  "docs/HARNESS_ENGINEERING.md",
  "docs/work_plan",
  "Version.md"
] as const

export function normalizeColor(value: string): string {
  const trimmed = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short !== null) {
    const chars = short[1]
    if (chars === undefined) throw new Error("Invalid brand color")
    return `#${chars
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`.toUpperCase()
  }
  if (!/^#[0-9a-f]{6}$/i.test(trimmed)) {
    throw new Error("Brand color must be a hex value such as #4C6EF5")
  }
  return trimmed.toUpperCase()
}

export function assertProjectType(value: unknown): asserts value is ProjectType {
  if (typeof value !== "string" || !PROJECT_TYPES.includes(value as ProjectType)) {
    throw new Error(
      'Project type must be exactly "web" or "extension"; combined projects are not supported'
    )
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`)
  }
  return value.trim()
}

export function createProjectConfig(
  options: Pick<
    InitOptions,
    "projectType" | "name" | "id" | "description" | "brandColor" | "logoPath"
  >
): ProjectConfig {
  assertProjectType(options.projectType)
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

export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  const raw = await readJson<unknown>(path.join(root, PROJECT_CONFIG_PATH))
  return validateProjectConfig(raw)
}
