import { readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import {
  normalizeAgentPolicy,
  renderAgentPolicy,
  validateAgentPolicyBody,
  validateAgentPolicyDocument
} from "./agent-policy.ts"
import { HARNESS_ONLY_PATHS, INSTANTIATION_ONLY_EXCLUDED_PATHS } from "./config.ts"
import { lstatIfPresent, writeAtomic } from "./files.ts"
import {
  EXPECTED_EXTENSION_ONLY_TERMINAL_SKILLS,
  EXPECTED_WEB_ONLY_TERMINAL_SKILLS
} from "./skill-validation.ts"
import { downstreamAgents } from "./templates/downstream-agents.ts"
import { downstreamReadme } from "./templates/downstream-readme.ts"
import { buildToolingFiles } from "./templates/build.ts"
import { downstreamGovernanceFiles } from "./templates/downstream-docs.ts"
import type { AgentPolicySelection, ProjectConfig } from "./types.ts"

const TERMINAL_CLI = `import path from "node:path"
import { pathToFileURL } from "node:url"
import { assertKnownOptions, parseArgs, readStringOption } from "./args.ts"
import { refreshBrand } from "./brand.ts"
import { validateProject } from "./validate.ts"

/** 说明 usage 的稳定结构与职责边界。 */
function usage(): string {
  return \`项目 Harness

命令：
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate
\`
}

/** 说明 runCli 的稳定结构与职责边界。 */
export async function runCli(argv = process.argv.slice(2), root = process.cwd()): Promise<void> {
  const [command, ...rest] = argv
  if (command === "brand") {
    const args = parseArgs(rest)
    assertKnownOptions(args, ["logo", "brand-color"])
    if (args.positionals.length !== 1 || args.positionals[0] !== "refresh") {
      throw new Error("用法：pnpm harness brand refresh [--logo <path>] [--brand-color <color>]")
    }
    const config = await refreshBrand(root, {
      logoPath: readStringOption(args, "logo"),
      brandColor: readStringOption(args, "brand-color")
    })
    console.log(\`已刷新品牌资产：\${config.name}\`)
    return
  }
  if (command === "validate") {
    const args = parseArgs(rest)
    assertKnownOptions(args, [])
    if (args.positionals.length > 0) throw new Error("validate 不接受位置参数")
    const checked = await validateProject(root)
    console.log(\`项目校验通过 (\${checked.join(", ")})\`)
    return
  }
  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    console.log(usage())
    return
  }
  throw new Error(\`未知的项目 Harness 命令：\${command}\`)
}

const executed = process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
`

const TERMINAL_BRAND = `import path from "node:path"
import { extensionIdentityManifest, renderIdentityBrand, synchronizeIdentityLocales } from "./identity.ts"
import { createLogo, deriveLogoAssets, readLogo } from "./logo.ts"
import { loadProjectConfig, MASTER_LOGO_PATH, normalizeColor, PROJECT_CONFIG_PATH } from "./config.ts"
import { readJson, writeAtomic, writeJsonAtomic } from "./files.ts"
import type { ProjectConfig } from "./types.ts"

/** 说明 BrandRefreshOptions 的稳定结构与职责边界。 */
export interface BrandRefreshOptions { logoPath?: string; brandColor?: string }

/** 说明 derivedLogoPaths 的稳定结构与职责边界。 */
export function derivedLogoPaths(config: ProjectConfig): string[] {
  return config.projectType === "web"
    ? ["public/logo.png", "public/favicon.png"]
    : ["assets/icon.png"]
}

/** 说明 html 的稳定结构与职责边界。 */
function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** 说明 brandModule 的稳定结构与职责边界。 */
function brandModule(config: ProjectConfig): string {
  return renderIdentityBrand(config)
}

/** 说明 webIndex 的稳定结构与职责边界。 */
function webIndex(config: ProjectConfig): string {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="\${html(config.description)}" />
    <meta name="theme-color" content="\${html(config.brand.primaryColor)}" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>\${html(config.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
\`
}

/** 说明 syncMetadata 的稳定结构与职责边界。 */
async function syncMetadata(root: string, config: ProjectConfig): Promise<void> {
  const packagePath = path.join(root, "package.json")
  const manifest = await readJson<Record<string, unknown>>(packagePath)
  const updated: Record<string, unknown> = { ...manifest, name: config.id, description: config.description }
  if (config.projectType === "extension") {
    updated.displayName = config.name
    const current = manifest.manifest !== null && typeof manifest.manifest === "object"
      ? { ...(manifest.manifest as Record<string, unknown>) } : {}
    delete current.manifest_version
    updated.manifest = { ...current, ...extensionIdentityManifest(config) }
    await synchronizeIdentityLocales(root, config)
  }
  await writeJsonAtomic(packagePath, updated)
  await writeAtomic(path.join(root, "src/brand.ts"), brandModule(config))
  if (config.projectType === "web") await writeAtomic(path.join(root, "index.html"), webIndex(config))
}

/** 说明 refreshBrand 的稳定结构与职责边界。 */
export async function refreshBrand(root: string, options: BrandRefreshOptions = {}): Promise<ProjectConfig> {
  const current = await loadProjectConfig(root)
  const color = options.brandColor === undefined ? current.brand.primaryColor : normalizeColor(options.brandColor)
  const config: ProjectConfig = {
    ...current,
    brand: { ...current.brand, primaryColor: color, logoSource: options.logoPath === undefined ? current.brand.logoSource : "uploaded" }
  }
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  const logo = options.logoPath !== undefined || config.brand.logoSource === "generated"
    ? await createLogo({ root, name: config.name, id: config.id, color, logoPath: options.logoPath })
    : await readLogo(masterPath)
  await writeAtomic(masterPath, logo)
  for (const [relativePath, contents] of await deriveLogoAssets(config.projectType, logo)) {
    await writeAtomic(path.join(root, relativePath), contents)
  }
  await writeJsonAtomic(path.join(root, PROJECT_CONFIG_PATH), config)
  await syncMetadata(root, config)
  return config
}
`

const TERMINAL_TYPES = `import type { IdentityI18n } from "./identity.ts"

/** 说明 ProjectType 的唯一前端宿主类型。 */
export type ProjectType = "web" | "extension"
/** 说明 E2eSelection 的稳定结构与职责边界。 */
export type E2eSelection = "enabled" | "disabled"
/** 说明 AgentPolicyChoice 的持久能力选择。 */
export type AgentPolicyChoice = "enabled" | "disabled"

/** 说明 AgentPolicySelection 的完整策略决议。 */
export interface AgentPolicySelection {
  confirmedBy: string
  confirmedAt: string
  superpowers: AgentPolicyChoice
  userOwnedTasks: AgentPolicyChoice
  parallelWorktreeSubagents: AgentPolicyChoice
  acceptanceSmoke: AgentPolicyChoice
  e2eHint: AgentPolicyChoice
}

/** 说明 BrandConfig 的稳定结构与职责边界。 */
export interface BrandConfig {
  primaryColor: string
  logoSource: "generated" | "uploaded"
  masterLogo: ".harness/brand/logo-1024.png"
}

/** 说明 ProjectConfig 的稳定结构与职责边界。 */
export interface ProjectConfig {
  schemaVersion: 1
  projectType: ProjectType
  name: string
  id: string
  description: string
  identityI18n?: IdentityI18n
  brand: BrandConfig
  initializedAt: string
}

/** 说明 EnvironmentBaseUrls 的稳定结构与职责边界。 */
export interface EnvironmentBaseUrls {
  developmentBaseUrl: string
  testBaseUrl: string
  releaseBaseUrl: string
}

/** 说明 ParsedArgs 的稳定结构与职责边界。 */
export interface ParsedArgs {
  positionals: string[]
  options: Map<string, string | boolean>
}
`

const TERMINAL_CONFIG = `import path from "node:path"
import { assertExtensionIdentity, validateIdentityI18n } from "./identity.ts"
import { readJson } from "./files.ts"
import type { ProjectConfig, ProjectType } from "./types.ts"

/** 说明 PROJECT_CONFIG_PATH 的稳定结构与职责边界。 */
export const PROJECT_CONFIG_PATH = ".harness/project.json" as const
/** 说明 MASTER_LOGO_PATH 的稳定结构与职责边界。 */
export const MASTER_LOGO_PATH = ".harness/brand/logo-1024.png" as const
/** 说明 HARNESS_ONLY_PATHS 的稳定结构与职责边界。 */
export const HARNESS_ONLY_PATHS = ${JSON.stringify(HARNESS_ONLY_PATHS)} as const

/** 说明 normalizeColor 的稳定结构与职责边界。 */
export function normalizeColor(value: string): string {
  const trimmed = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short?.[1] !== undefined) {
    return \`#\${short[1].split("").map((character) => \`\${character}\${character}\`).join("")}\`.toUpperCase()
  }
  if (!/^#[0-9a-f]{6}$/i.test(trimmed)) throw new Error("Brand color must be a hex value such as #4C6EF5")
  return trimmed.toUpperCase()
}

/** 说明 isProjectType 的稳定结构与职责边界。 */
function isProjectType(value: unknown): value is ProjectType {
  return value === "web" || value === "extension"
}

/** 说明 text 的稳定结构与职责边界。 */
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(\`Invalid project config \${label}\`)
  return value.trim()
}

/** 说明 validateProjectConfig 的稳定结构与职责边界。 */
export function validateProjectConfig(value: unknown): ProjectConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid project config")
  const config = value as Partial<ProjectConfig>
  if (config.schemaVersion !== 1 || !isProjectType(config.projectType)) throw new Error("Unsupported project config schema")
  if (config.brand === undefined || typeof config.brand !== "object") throw new Error("Invalid project brand")
  if (config.brand.masterLogo !== MASTER_LOGO_PATH) throw new Error(\`Brand masterLogo must be \${MASTER_LOGO_PATH}\`)
  if (config.brand.logoSource !== "generated" && config.brand.logoSource !== "uploaded") throw new Error("Invalid logoSource")
  const id = text(config.id, "id")
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Invalid project id")
  const parsed: ProjectConfig = {
    schemaVersion: 1,
    projectType: config.projectType,
    name: text(config.name, "name"),
    id,
    description: text(config.description, "description"),
    ...(config.identityI18n === undefined ? {} : { identityI18n: validateIdentityI18n(config.identityI18n) }),
    brand: {
      primaryColor: normalizeColor(text(config.brand.primaryColor, "brand color")),
      logoSource: config.brand.logoSource,
      masterLogo: MASTER_LOGO_PATH
    },
    initializedAt: text(config.initializedAt, "initializedAt")
  }
  assertExtensionIdentity(parsed)
  return parsed
}

/** 说明 loadProjectConfig 的稳定结构与职责边界。 */
export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  return validateProjectConfig(await readJson<unknown>(path.join(root, PROJECT_CONFIG_PATH)))
}
`

// 执行 prepareLicenseFiles 函数的处理逻辑。
async function prepareLicenseFiles(
  root: string,
  config: ProjectConfig
): Promise<Map<string, string>> {
  const replacements = [
    [
      "LICENSE.en.md",
      "Applicable Project Name: Bifang Web Harness Template.",
      `Applicable Project Name: ${config.name}.`
    ],
    [
      "LICENSE.zh-CN.md",
      "适用项目名称：Bifang Web Harness Template。",
      `适用项目名称：${config.name}。`
    ]
  ] as const
  const contentsByFile = await Promise.all(
    replacements.map(([file]) => readFile(path.join(root, file), "utf8"))
  )
  const files = new Map<string, string>()
  replacements.forEach(([file, before, after], index) => {
    const contents = contentsByFile[index]
    if (contents === undefined || contents.split(before).length !== 2) {
      throw new Error(`Cannot safely replace project name in ${file}`)
    }
    files.set(file, contents.replace(before, after))
  })
  return files
}

// 执行 removeIfPresent 函数的处理逻辑。
async function removeIfPresent(root: string, relativePath: string): Promise<void> {
  await rm(path.join(root, relativePath), { recursive: true, force: true })
}

// 定义 DownstreamFinalizationPlan 接口的结构契约。
export interface DownstreamFinalizationPlan {
  // 描述 files 接口成员的结构契约。
  files: ReadonlyMap<string, string>
}

// 执行 prepareDownstreamFinalization 函数的处理逻辑。
export async function prepareDownstreamFinalization(
  root: string,
  config: ProjectConfig,
  agentPolicy: AgentPolicySelection
): Promise<DownstreamFinalizationPlan> {
  // 预检唯一源文档，任何派生合同缺失均在写入前失败。
  const [
    canonicalDataAccess,
    canonicalMantineUiGuidelines,
    canonicalAgentPolicy,
    canonicalEngineeringRules
  ] = await Promise.all([
    readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8"),
    readFile(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"), "utf8"),
    readFile(path.join(root, "docs/AGENT_POLICY.md"), "utf8"),
    readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
  ])
  const canonicalPolicyErrors = [
    ...validateAgentPolicyDocument(canonicalAgentPolicy, {
      allowPending: true,
      requireSourceDefaults: true
    }),
    ...validateAgentPolicyBody(canonicalAgentPolicy)
  ]
  if (canonicalPolicyErrors.length > 0) {
    throw new Error(`Invalid source Agent policy:\n- ${canonicalPolicyErrors.join("\n- ")}`)
  }
  const downstreamAgentPolicy = renderAgentPolicy(
    canonicalAgentPolicy.replaceAll("$web-instantiate-project", "源 Harness 初始化流程"),
    normalizeAgentPolicy(agentPolicy)
  )
  const downstreamPolicyErrors = [
    ...validateAgentPolicyDocument(downstreamAgentPolicy, { allowPending: false }),
    ...validateAgentPolicyBody(downstreamAgentPolicy)
  ]
  if (downstreamPolicyErrors.length > 0) {
    throw new Error(`Invalid downstream Agent policy:\n- ${downstreamPolicyErrors.join("\n- ")}`)
  }
  const files = new Map<string, string>([
    [".harness/tooling/cli.ts", TERMINAL_CLI],
    [".harness/tooling/brand.ts", TERMINAL_BRAND],
    [".harness/tooling/types.ts", TERMINAL_TYPES],
    [".harness/tooling/config.ts", TERMINAL_CONFIG],
    ["README.md", downstreamReadme(config)],
    ["AGENTS.md", downstreamAgents(config)],
    ["docs/AGENT_POLICY.md", downstreamAgentPolicy]
  ])
  for (const [relativePath, contents] of downstreamGovernanceFiles(config, {
    dataAccess: canonicalDataAccess,
    mantineUiGuidelines: canonicalMantineUiGuidelines,
    engineeringRules: canonicalEngineeringRules
  })) {
    files.set(relativePath, contents)
  }
  for (const [relativePath, contents] of buildToolingFiles(config)) {
    files.set(relativePath, contents)
  }
  for (const [relativePath, contents] of await prepareLicenseFiles(root, config)) {
    files.set(relativePath, contents)
  }
  await Promise.all(
    [...files.keys()].map(async (relativePath) => {
      const existing = await lstatIfPresent(path.join(root, relativePath))
      if (existing !== undefined && !existing.isFile()) {
        throw new Error(`Downstream output path must be a regular file: ${relativePath}`)
      }
    })
  )
  return { files }
}

// 执行 finalizeDownstream 函数的处理逻辑。
export async function finalizeDownstream(
  root: string,
  config: ProjectConfig,
  agentPolicy: AgentPolicySelection,
  plan?: DownstreamFinalizationPlan
): Promise<void> {
  const prepared = plan ?? (await prepareDownstreamFinalization(root, config, agentPolicy))
  await Promise.all(
    [...prepared.files].map(([relativePath, contents]) =>
      writeAtomic(path.join(root, relativePath), contents)
    )
  )

  // 保存 terminalizationExcludedPaths 变量，合并永久禁用入口与仅本次不继承的源记忆。
  const terminalizationExcludedPaths = [
    ...new Set([...HARNESS_ONLY_PATHS, ...INSTANTIATION_ONLY_EXCLUDED_PATHS])
  ]
  await Promise.all(
    terminalizationExcludedPaths
      .filter((relativePath) => relativePath !== ".harness/tooling/finalize.ts")
      .map((relativePath) => removeIfPresent(root, relativePath))
  )
  // 删除另一宿主专属的 Skill，名单与验证器共用同一来源。
  const foreignSkills =
    config.projectType === "extension"
      ? EXPECTED_WEB_ONLY_TERMINAL_SKILLS
      : EXPECTED_EXTENSION_ONLY_TERMINAL_SKILLS
  for (const skillName of foreignSkills) {
    await removeIfPresent(root, `.agents/skills/${skillName}`)
  }
  const scriptsPath = path.join(root, "scripts")
  if (
    await readdir(scriptsPath)
      .catch(/* 执行 当前声明 函数的处理逻辑。 */ () => ["not-empty"] as string[])
      .then(/* 执行 当前声明 函数的处理逻辑。 */ (entries) => entries.length === 0)
  ) {
    await removeIfPresent(root, "scripts")
  }
  await removeIfPresent(root, ".harness/tooling/finalize.ts")
}
