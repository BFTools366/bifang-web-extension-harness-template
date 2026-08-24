import { readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { HARNESS_ONLY_PATHS } from "./config.ts"
import { lstatIfPresent, writeAtomic } from "./files.ts"
import { buildToolingFiles } from "./templates/build.ts"
import { downstreamGovernanceFiles } from "./templates/downstream-docs.ts"
import type { ProjectConfig } from "./types.ts"

// 保存 TERMINAL_CLI 变量供当前逻辑使用。
const TERMINAL_CLI = `import path from "node:path"
import { pathToFileURL } from "node:url"
import { assertKnownOptions, parseArgs, readStringOption } from "./args.ts"
import { refreshBrand } from "./brand.ts"
import { validateProject } from "./validate.ts"

function usage(): string {
  return \`Project Harness

Commands:
  pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
  pnpm harness validate
\`
}

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
import { createLogo, deriveLogoAssets, readLogo } from "./logo.ts"
import { loadProjectConfig, MASTER_LOGO_PATH, normalizeColor, PROJECT_CONFIG_PATH } from "./config.ts"
import { annotateTypeScriptSource } from "./comment-policy.ts"
import { readJson, writeAtomic, writeJsonAtomic } from "./files.ts"
import type { ProjectConfig } from "./types.ts"

export interface BrandRefreshOptions { logoPath?: string; brandColor?: string }

export function derivedLogoPaths(config: ProjectConfig): string[] {
  return config.projectType === "web"
    ? ["public/logo.png", "public/favicon.png"]
    : ["assets/icon.png"]
}

function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function brandModule(config: ProjectConfig): string {
  const logo = config.projectType === "web" ? ',\\n  logoPath: "/logo.png"' : ""
  return \`export const BRAND = {\\n  name: \${JSON.stringify(config.name)},\\n  id: \${JSON.stringify(config.id)},\\n  description: \${JSON.stringify(config.description)},\\n  primaryColor: \${JSON.stringify(config.brand.primaryColor)}\${logo}\\n} as const\\n\`
}

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

async function syncMetadata(root: string, config: ProjectConfig): Promise<void> {
  const packagePath = path.join(root, "package.json")
  const manifest = await readJson<Record<string, unknown>>(packagePath)
  const updated: Record<string, unknown> = { ...manifest, name: config.id, description: config.description }
  if (config.projectType === "extension") {
    updated.displayName = config.name
    const current = manifest.manifest !== null && typeof manifest.manifest === "object"
      ? manifest.manifest as Record<string, unknown> : {}
    updated.manifest = { ...current, manifest_version: 3, name: config.name, description: config.description }
  }
  await writeJsonAtomic(packagePath, updated)
  await writeAtomic(
    path.join(root, "src/brand.ts"),
    annotateTypeScriptSource(brandModule(config), "src/brand.ts")
  )
  if (config.projectType === "web") await writeAtomic(path.join(root, "index.html"), webIndex(config))
}

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
const TERMINAL_TYPES = `export type ProjectType = "web" | "extension"
export type E2eSelection = "enabled" | "disabled"

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

export interface ParsedArgs {
  positionals: string[]
  options: Map<string, string | boolean>
}
`

// 保存 TERMINAL_CONFIG 变量供当前逻辑使用。
const TERMINAL_CONFIG = `import path from "node:path"
import { readJson } from "./files.ts"
import type { ProjectConfig, ProjectType } from "./types.ts"

export const PROJECT_CONFIG_PATH = ".harness/project.json" as const
export const MASTER_LOGO_PATH = ".harness/brand/logo-1024.png" as const
export const HARNESS_ONLY_PATHS = ${JSON.stringify(HARNESS_ONLY_PATHS)} as const

export function normalizeColor(value: string): string {
  const trimmed = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short?.[1] !== undefined) {
    return \`#\${short[1].split("").map((character) => \`\${character}\${character}\`).join("")}\`.toUpperCase()
  }
  if (!/^#[0-9a-f]{6}$/i.test(trimmed)) throw new Error("Brand color must be a hex value such as #4C6EF5")
  return trimmed.toUpperCase()
}

function isProjectType(value: unknown): value is ProjectType {
  return value === "web" || value === "extension"
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(\`Invalid project config \${label}\`)
  return value.trim()
}

export function validateProjectConfig(value: unknown): ProjectConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid project config")
  const config = value as Partial<ProjectConfig>
  if (config.schemaVersion !== 1 || !isProjectType(config.projectType)) throw new Error("Unsupported project config schema")
  if (config.brand === undefined || typeof config.brand !== "object") throw new Error("Invalid project brand")
  if (config.brand.masterLogo !== MASTER_LOGO_PATH) throw new Error(\`Brand masterLogo must be \${MASTER_LOGO_PATH}\`)
  if (config.brand.logoSource !== "generated" && config.brand.logoSource !== "uploaded") throw new Error("Invalid logoSource")
  const id = text(config.id, "id")
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Invalid project id")
  return {
    schemaVersion: 1,
    projectType: config.projectType,
    name: text(config.name, "name"),
    id,
    description: text(config.description, "description"),
    brand: {
      primaryColor: normalizeColor(text(config.brand.primaryColor, "brand color")),
      logoSource: config.brand.logoSource,
      masterLogo: MASTER_LOGO_PATH
    },
    initializedAt: text(config.initializedAt, "initializedAt")
  }
}

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
      : "Plasmo (Chrome MV3), React, Mantine, TanStack Query, Jotai, and i18next"
  // 保存 routeCommand 变量供当前逻辑使用。
  const routeCommand =
    config.projectType === "web"
      ? "- `pnpm routes:generate` — regenerate the Git-ignored TanStack route tree.\n"
      : ""
  return `# ${config.name}

${config.description}

This is a terminal, flat, single-package **${config.projectType}** project.

## Selected stack

${stack}.

The generated native Fetch and pagination foundations standardize request headers, authentication handoff, 401 handling, language persistence, and per-list session state without inventing a business endpoint. Optional Ky/OpenAPI, GraphQL, SSE, and RxJS integrations remain on demand; their rules live in \`docs/DATA_ACCESS.md\`.

Mantine theme, tokens, layout, component hierarchy, interaction states, responsive behavior, accessibility, and host-specific UI rules live in \`docs/MANTINE_UI_GUIDELINES.md\`.

## Identity and brand

- \`.harness/project.json\` is the identity and brand source of truth.
- \`.harness/brand/logo-1024.png\` is the canonical logo.
- Run \`pnpm harness brand refresh\` after changing the project name, id, description, color, or logo source.
- \`.env.development\`, \`.env.test\`, and \`.env.production\` are the complete governed public runtime profiles; see \`docs/RUNTIME_CONFIGURATION.md\`.

## Commands

- \`pnpm dev\` — start development.
${routeCommand}- \`pnpm env:validate\` — validate all three runtime profiles.
- \`pnpm build\` / \`pnpm build:release\` — the single Release artifact entry point; every run asks whether to enable E2E, then runs environment, Harness, format, lint, type, and full test gates, injects the Shanghai \`YYYYMMDDHHMM\` version into the UI, and inspects the artifact. Non-interactive runs pass \`--e2e=enabled|disabled\`. Development and test profiles never produce a final artifact.
- \`pnpm release:inspect\` — rescan the existing Release artifact for configuration or source leakage.
- \`pnpm test\` — run the full test suite.
- \`pnpm test:related <changed-source...>\` — run only tests related to changed sources, for daily work.
- \`pnpm lint\` and \`pnpm typecheck\` — run static checks.
- \`pnpm harness brand refresh\` — regenerate brand assets from \`.harness/project.json\`.
- \`pnpm harness validate\` — validate project identity, layout, and assets.

## Validation scopes

Daily work runs the smallest sufficient affected format/lint/type checks plus \`pnpm test:related\`; a zero-test batch is not evidence, so fall back to the owning test file. Behavior-preserving refactors run the full \`pnpm test\`. Any final artifact goes through \`pnpm build\`, which already owns the full environment/Harness/format/lint/type/test/inspect chain — do not re-run those gates manually around it.
`
}

// 执行 downstreamAgents 函数的处理逻辑。
function downstreamAgents(config: ProjectConfig): string {
  // 保存 hostSources 变量供当前逻辑使用。
  const hostSources =
    config.projectType === "web"
      ? "- `src/routes/`: file-route source; `src/routeTree.gen.ts` is generated, Git-ignored, and never edited by hand.\n"
      : ""
  return `# Project Agent Instructions

This repository is the terminal \`${config.projectType}\` project **${config.name}**. Keep it flat and single-package. Do not add project-generation commands, a workspace layout, or a second project type.

## Minimum reading

Always inspect the workspace and protect existing changes. Read this file and \`.harness/project.json\`; read \`docs/AGENT_POLICY.md\` when choosing paths, persistent planning, parallel work, smoke, or E2E. Read \`docs/ENGINEERING_RULES.md\` before modifying code, tests, docs, or configuration, plus the selected Skill. Read \`docs/MANTINE_UI_GUIDELINES.md\` for theme, page, Popup, Options, layout, component, interaction-state, responsive, or UI-accessibility work. Read \`docs/RUNTIME_CONFIGURATION.md\` for environment work, \`docs/LOGGING.md\` for logging/error handling, and \`docs/DATA_ACCESS.md\` for pagination, HTTP headers, authentication, REST/OpenAPI, GraphQL, SSE, multiple remote endpoints, multi-source event streams, or RxJS. Read only the additional facts needed.

## Three delivery paths

1. Small, local, reversible changes: inspect the owning file, implement narrowly, and run the smallest sufficient affected checks and related non-empty tests.
2. Reversible standard feature work uses \`$web-implement-change\` directly and keeps progress in the current task; create a persistent plan only when the user explicitly requests one. Behavior-preserving refactors run the full unit suite, but ordinary UI or route changes do not become milestones merely because they are visible.
3. Milestone work includes project-creation contracts, project-type capabilities, brand/identity derivation, Release, compatibility contracts, security/permissions, production side effects, and irreversible changes. Plan explicit boundaries, preserve evidence, and invoke \`$web-verify-delivery\`; parallel Worktrees and browser smoke remain explicit extras, while every artifact build asks the user for that build's E2E choice.

## Sources of truth

- \`.harness/project.json\`: project type, identity, and brand metadata.
- \`.harness/brand/logo-1024.png\`: canonical logo; derived assets must be refreshed, not edited independently.
- \`package.json\` and \`pnpm-lock.yaml\`: scripts and dependency versions.
- Product source and tests: executable behavior.
${hostSources}- \`src/pagination/\`: the governed page/pageSize session state and empty-page reconciliation contract.
- \`src/api/client/\`: the endpoint-free native Fetch, request-context, language, token, error, and unauthorized-handler foundation.
- \`docs/DATA_ACCESS.md\`: pagination, request headers, authentication, data access, SSE, optional RxJS, and state ownership boundaries.
- \`docs/MANTINE_UI_GUIDELINES.md\`: Mantine theme, tokens, layout, component semantics, interaction states, responsive behavior, accessibility, and current-host UI rules.
- \`docs/RUNTIME_CONFIGURATION.md\`: the three profiles, public configuration schema, and build mapping.
- \`docs/LOGGING.md\`: structured logging, error boundaries, redaction, and Release inspection.
- \`docs/\`: durable policy, engineering, release, and debt records.
- License files: legal text; the Applicable Project Name must match the current project identity.

## Web Harness 前端 Skill 地图

- \`$web-check-development-environment\`：检查 Node.js、pnpm 与按需使用的 Google Chrome 前端环境。
- \`$web-define-product\`：定义单一 React Web 或 Plasmo Chrome MV3 Extension 前端产品范围。
- \`$web-extract-i18n-strings\`：维护基于 i18next 的完整前端国际化文案。
- \`$web-plan-change\`：只为里程碑、发布候选或用户明确要求的前端变更建立持久计划。
- \`$web-implement-change\`：实施并验证已批准的 Web Harness 前端变更。
- \`$web-refactor-code\`：在保持行为不变时整理 TypeScript/TSX 前端代码。
- \`$web-prepare-brand-identity\`：同步当前前端宿主的 Logo 与品牌元数据。
- \`$web-run-parallel-worktrees\`：仅在用户明确要求时隔离并协调写入范围互不重叠的前端并行工作。
- \`$web-test-final-artifact-e2e\`：在真实 Chrome 中测试精确前端候选产物。
- \`$web-prepare-release\`：整理 Web Harness、Vite dist 或 Chrome MV3 zip 发布候选。
- \`$web-upgrade-harness\`：保留产品所有权并同步较新的 Web Harness 前端工程层。
- \`$web-verify-delivery\`：运行并报告 Web Harness 前端交付门禁。

## Validation loop

Use \`pnpm harness brand refresh\` after intentional identity changes. Daily work runs the smallest sufficient affected format/lint/type checks and \`pnpm test:related <changed-source...>\`; a zero-test batch is not evidence, so run the owning test file when dependency discovery finds none. Run the full unit suite only through \`pnpm build\`/Release or an explicit behavior-preserving refactor. Before every artifact build, ask the user for the current E2E choice and pass \`--e2e=enabled|disabled\`. Every artifact-producing build is \`pnpm build\` → \`build:release\`; it owns environment validation, Harness/format/lint/type/full-test gates, \`YYYYMMDDHHMM\` UI version injection${
    config.projectType === "extension" ? ", browser-bundle self-containment validation," : ""
  } and \`pnpm release:inspect\`. Build commands, timestamp versions, E2E choices, and test/inspection results stay in command output and the current task report; they do not create or update Work Plans, ADRs, Status, Changelogs, Verifications, or other persistent project memory. Development and test profiles never produce final artifacts. Manually maintained code is reviewed above 500 lines and must be split at 1000 lines. Report skipped or blocked checks explicitly; do not claim success from partial evidence.
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
  config: ProjectConfig
): Promise<DownstreamFinalizationPlan> {
  // 保存 [canonicalDataAccess, canonicalMantineUiGuidelines] 变量供当前逻辑使用。
  const [canonicalDataAccess, canonicalMantineUiGuidelines] = await Promise.all([
    readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8"),
    readFile(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"), "utf8")
  ])
  // 保存 files 变量供当前逻辑使用。
  const files = new Map<string, string>([
    [".harness/tooling/cli.ts", TERMINAL_CLI],
    [".harness/tooling/brand.ts", TERMINAL_BRAND],
    [".harness/tooling/types.ts", TERMINAL_TYPES],
    [".harness/tooling/config.ts", TERMINAL_CONFIG],
    ["README.md", downstreamReadme(config)],
    ["AGENTS.md", downstreamAgents(config)]
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
  plan?: DownstreamFinalizationPlan
): Promise<void> {
  // 保存 prepared 变量供当前逻辑使用。
  const prepared = plan ?? (await prepareDownstreamFinalization(root, config))
  await Promise.all(
    [...prepared.files].map(
      /* 执行 当前声明 函数的处理逻辑。 */ ([relativePath, contents]) =>
        writeAtomic(path.join(root, relativePath), contents)
    )
  )

  await Promise.all(
    HARNESS_ONLY_PATHS.filter(
      // 执行 当前声明 函数的处理逻辑。
      (relativePath) => relativePath !== ".harness/tooling/finalize.ts"
    ).map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) => removeIfPresent(root, relativePath)
    )
  )
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
