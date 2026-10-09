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
import { downstreamAgents } from "./templates/downstream-agents.ts"
import { buildToolingFiles } from "./templates/build.ts"
import { downstreamGovernanceFiles } from "./templates/downstream-docs.ts"
import type { AgentPolicySelection, ProjectConfig } from "./types.ts"

// 保存 TERMINAL_CLI 变量供当前逻辑使用。
const TERMINAL_CLI = `import path from "node:path"
import { pathToFileURL } from "node:url"
import { assertKnownOptions, parseArgs, readStringOption } from "./args.ts"
import { refreshBrand } from "./brand.ts"
import { validateProject } from "./validate.ts"

/** 说明 usage 的稳定结构与职责边界。 */
function usage(): string {
  return \`Project Harness

Commands:
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
      throw new Error("Usage: pnpm harness brand refresh [--logo <path>] [--brand-color <color>]")
    }
    const config = await refreshBrand(root, {
      logoPath: readStringOption(args, "logo"),
      brandColor: readStringOption(args, "brand-color")
    })
    console.log(\`Refreshed brand assets for \${config.name}\`)
    return
  }
  if (command === "validate") {
    const args = parseArgs(rest)
    assertKnownOptions(args, [])
    if (args.positionals.length > 0) throw new Error("validate does not accept positional arguments")
    const checked = await validateProject(root)
    console.log(\`Project validation passed (\${checked.join(", ")})\`)
    return
  }
  if (command === "help" || command === "--help" || command === "-h" || command === undefined) {
    console.log(usage())
    return
  }
  throw new Error(\`Unknown project Harness command: \${command}\`)
}

const executed = process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
`

// 保存 TERMINAL_BRAND 变量供当前逻辑使用。
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

// 保存 TERMINAL_TYPES 变量供当前逻辑使用。
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

// 保存 TERMINAL_CONFIG 变量供当前逻辑使用。
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

// 执行 downstreamReadme 函数的处理逻辑。
function downstreamReadme(config: ProjectConfig): string {
  // 保存 stack 变量供当前逻辑使用。
  const stack =
    config.projectType === "web"
      ? "React, Vite, Mantine, TanStack Router file routing, TanStack Query, Jotai, and i18next"
      : "Plasmo (Chrome MV3 / Firefox MV2), React, Mantine, TanStack Router code routing, TanStack Query, Jotai, and i18next"
  // 保存 routeCommand 变量供当前逻辑使用。
  const routeCommand =
    config.projectType === "web"
      ? "- `pnpm routes:generate` — regenerate the Git-ignored TanStack route tree.\n"
      : ""
  // 保存 versionDescription 变量供当前宿主版本说明使用。
  const versionDescription =
    config.projectType === "web"
      ? "the Shanghai `YYMMDDHHMMSS` version"
      : "stable SemVer (`X.Y.Z`) from `package.json.version`"
  return `# ${config.name}

${config.description}

This is a terminal, flat, single-package **${config.projectType}** project.

## Selected stack

${stack}.

The generated Ky HTTP and pagination foundations standardize request headers, validated Token writes, 401/403 handling, localized Router/UI feedback, bounded Query reads, language persistence, and per-list session state without inventing a business endpoint. Ky is the default Fetch transport; optional OpenAPI, GraphQL, SSE, and RxJS integrations remain on demand; their rules live in \`docs/DATA_ACCESS.md\`.

Mantine theme, tokens, layout, component hierarchy, interaction states, responsive behavior, accessibility, and host-specific UI rules live in \`docs/MANTINE_UI_GUIDELINES.md\`. The generated appearance control follows the system setting by default and lets users choose light or dark mode.

Project-local \`.agents/skills/design-taste-frontend/\` provides optional visual guidance for landing pages, portfolios, and redesigns. It is installed automatically when missing; valid existing files are preserved. Read the applicability rules in \`docs/MANTINE_UI_GUIDELINES.md\` before using it. For product work, use \`$web-define-product\` to clarify and record the PRD in \`docs/product_spec/\`, then \`$web-design-prototype\` to present 2–3 interactive HTML alternatives. Select a specific revision before \`$web-implement-change\` starts development. Initialization only distributes these project-local Skills; it does not run this workflow or create business records.

## Identity and brand

- \`.harness/project.json\` is the identity and brand source of truth.
- \`.harness/brand/logo-1024.png\` is the canonical logo.
- Run \`pnpm harness brand refresh\` after changing the project name, id, description, identityI18n, color, or logo source.
- Optional identityI18n selects defaultLocale (en or zh_CN) and translations of the other language. Root name/description remain the default identity; missing translations fall back to them.
${config.projectType === "extension" ? "- Browser identity uses manifest __MSG_projectName__/__MSG_projectDescription__, explicit default_locale, and root locales/{en,zh_CN}/messages.json. Plasmo outputs _locales. Both Chrome MV3 and Firefox MV2 are required build/package targets. Plasmo dynamically generates each manifest; shared overrides do not pin manifest_version. Future development must handle browser API, permissions, messaging and background lifecycle differences; see docs/ENGINEERING_RULES.md.\n" : ""}
- \`.env.development\`, \`.env.test\`, and \`.env.production\` are the complete governed public runtime profiles; see \`docs/RUNTIME_CONFIGURATION.md\`.

## Commands

- \`pnpm dev\` — start development.
${config.projectType === "extension" ? "- `pnpm dev:firefox` — develop Firefox MV2; build/package produce both browser targets.\n" : ""}
${routeCommand}- \`pnpm env:validate\` — validate all three runtime profiles.
- \`pnpm build\` / \`pnpm build:release\` — the single Release artifact entry point; the build reuses the E2E selection already confirmed for this release, runs environment, Harness, format, lint, type, and full test gates, injects ${versionDescription} into the UI, and inspects the artifact. Non-interactive runs pass \`--e2e=enabled|disabled\`. Development and test profiles never produce a final artifact.
- \`pnpm release:inspect\` — rescan the existing Release artifact for configuration or source leakage.
- \`pnpm test\` — run the full test suite.
- \`pnpm test:related <changed-source...>\` — run only tests related to changed sources, for daily work.
- \`pnpm lint\` and \`pnpm typecheck\` — run static checks.
- \`pnpm harness brand refresh\` — regenerate brand assets from \`.harness/project.json\`.
- \`pnpm harness validate\` — validate project identity, layout, and assets.

## Validation scopes

Daily work runs only the related non-empty tests or smallest substitute checks needed by the change, usually through \`pnpm test:related\`; a zero-test batch is not evidence, so fall back to the owning test file. Do not automatically add format, lint, typecheck, repository-wide checks, or builds. Behavior-preserving refactors run the full \`pnpm test\`. Any final artifact goes through \`pnpm build\`, which already owns the full environment/Harness/format/lint/type/test/inspect chain — do not re-run those gates manually around it.
`
}

// 执行 prepareLicenseFiles 函数的处理逻辑。
async function prepareLicenseFiles(
  root: string,
  config: ProjectConfig
): Promise<Map<string, string>> {
  // 保存 replacements 变量供当前逻辑使用。
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
  // 保存 contentsByFile 变量供当前逻辑使用。
  const contentsByFile = await Promise.all(
    replacements.map(
      /* 执行 当前声明 函数的处理逻辑。 */ ([file]) => readFile(path.join(root, file), "utf8")
    )
  )
  // 保存 files 变量供当前逻辑使用。
  const files = new Map<string, string>()
  replacements.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ ([file, before, after], index) => {
      // 保存 contents 变量供当前逻辑使用。
      const contents = contentsByFile[index]
      if (contents === undefined || contents.split(before).length !== 2) {
        throw new Error(`Cannot safely replace project name in ${file}`)
      }
      files.set(file, contents.replace(before, after))
    }
  )
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
  // 保存 [canonicalDataAccess, canonicalMantineUiGuidelines, canonicalAgentPolicy] 变量供当前逻辑使用。
  const [canonicalDataAccess, canonicalMantineUiGuidelines, canonicalAgentPolicy] =
    await Promise.all([
      readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8"),
      readFile(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"), "utf8"),
      readFile(path.join(root, "docs/AGENT_POLICY.md"), "utf8")
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
  // 保存 files 变量供当前逻辑使用。
  const files = new Map<string, string>([
    [".harness/tooling/cli.ts", TERMINAL_CLI],
    [".harness/tooling/brand.ts", TERMINAL_BRAND],
    [".harness/tooling/types.ts", TERMINAL_TYPES],
    [".harness/tooling/config.ts", TERMINAL_CONFIG],
    ["README.md", downstreamReadme(config)],
    ["AGENTS.md", downstreamAgents(config)],
    ["docs/AGENT_POLICY.md", downstreamAgentPolicy]
  ])
  // 保存 [relativePath, contents] 变量供当前逻辑使用。
  for (const [relativePath, contents] of downstreamGovernanceFiles(
    config,
    canonicalDataAccess,
    canonicalMantineUiGuidelines
  )) {
    files.set(relativePath, contents)
  }
  // 保存 [relativePath, contents] 变量供当前宿主构建器终端化使用。
  for (const [relativePath, contents] of buildToolingFiles(config)) {
    files.set(relativePath, contents)
  }
  // 保存 [relativePath, contents] 变量供当前逻辑使用。
  for (const [relativePath, contents] of await prepareLicenseFiles(root, config)) {
    files.set(relativePath, contents)
  }
  await Promise.all(
    [...files.keys()].map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (relativePath) => {
        // 保存 existing 变量供当前逻辑使用。
        const existing = await lstatIfPresent(path.join(root, relativePath))
        if (existing !== undefined && !existing.isFile()) {
          throw new Error(`Downstream output path must be a regular file: ${relativePath}`)
        }
      }
    )
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
  // 保存 prepared 变量供当前逻辑使用。
  const prepared = plan ?? (await prepareDownstreamFinalization(root, config, agentPolicy))
  await Promise.all(
    [...prepared.files].map(
      /* 执行 当前声明 函数的处理逻辑。 */ ([relativePath, contents]) =>
        writeAtomic(path.join(root, relativePath), contents)
    )
  )

  // 保存 terminalizationExcludedPaths 变量，合并永久禁用入口与仅本次不继承的源记忆。
  const terminalizationExcludedPaths = [
    ...new Set([...HARNESS_ONLY_PATHS, ...INSTANTIATION_ONLY_EXCLUDED_PATHS])
  ]
  await Promise.all(
    terminalizationExcludedPaths
      .filter(
        // 执行 当前声明 函数的处理逻辑。
        (relativePath) => relativePath !== ".harness/tooling/finalize.ts"
      )
      .map(
        /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) => removeIfPresent(root, relativePath)
      )
  )
  if (config.projectType === "extension") {
    await removeIfPresent(root, ".agents/skills/web-implement-list-view")
  } else {
    await removeIfPresent(root, ".agents/skills/web-review-extension-compatibility")
  }
  // 保存 scriptsPath 变量供当前逻辑使用。
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
