import { readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { HARNESS_ONLY_PATHS } from "./config.ts"
import { lstatIfPresent, writeAtomic } from "./files.ts"
import { downstreamGovernanceFiles } from "./templates/downstream-docs.ts"
import type { ProjectConfig } from "./types.ts"

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

const TERMINAL_BRAND = `import path from "node:path"
import { createLogo, deriveLogoAssets, readLogo } from "./logo.ts"
import { loadProjectConfig, MASTER_LOGO_PATH, normalizeColor, PROJECT_CONFIG_PATH } from "./config.ts"
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
  await writeAtomic(path.join(root, "src/brand.ts"), brandModule(config))
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

const TERMINAL_TYPES = `export type ProjectType = "web" | "extension"

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

function downstreamReadme(config: ProjectConfig): string {
  const stack =
    config.projectType === "web"
      ? "React, Vite, Mantine, TanStack Router file routing, TanStack Query, Jotai, and i18next"
      : "Plasmo (Chrome MV3), React, Mantine, TanStack Query, Jotai, and i18next"
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
- \`pnpm build:development\` and \`pnpm build:test\` — create diagnostic artifacts.
- \`pnpm build\` / \`pnpm build:release\` — create and inspect the Release artifact.
- \`pnpm release:inspect\` — rescan the existing Release artifact for configuration or source leakage.
- \`pnpm test\` — run component tests.
- \`pnpm lint\` and \`pnpm typecheck\` — run static checks.
- \`pnpm harness brand refresh\` — regenerate brand assets from \`.harness/project.json\`.
- \`pnpm harness validate\` — validate project identity, layout, and assets.

## Validation scopes

For a small, reversible change, run the smallest sufficient affected checks. For a milestone, Release candidate, cross-cutting configuration/structure/build change, or when narrower evidence is insufficient, run \`pnpm harness validate && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build\`. Release building validates all three environment files and automatically runs the artifact inspection.
`
}

function downstreamAgents(config: ProjectConfig): string {
  const hostSources =
    config.projectType === "web"
      ? "- `src/routes/`: file-route source; `src/routeTree.gen.ts` is generated, Git-ignored, and never edited by hand.\n"
      : ""
  return `# Project Agent Instructions

This repository is the terminal \`${config.projectType}\` project **${config.name}**. Keep it flat and single-package. Do not add project-generation commands, a workspace layout, or a second project type.

## Minimum reading

Always inspect the workspace and protect existing changes. Read this file and \`.harness/project.json\`; read \`docs/AGENT_POLICY.md\` when choosing paths, persistent planning, parallel work, smoke, or E2E. Read \`docs/ENGINEERING_RULES.md\` before modifying code, tests, docs, or configuration, plus the selected Skill. Read \`docs/MANTINE_UI_GUIDELINES.md\` for theme, page, Popup, Options, layout, component, interaction-state, responsive, or UI-accessibility work. Read \`docs/RUNTIME_CONFIGURATION.md\` for environment work, \`docs/LOGGING.md\` for logging/error handling, and \`docs/DATA_ACCESS.md\` for pagination, HTTP headers, authentication, REST/OpenAPI, GraphQL, SSE, multiple remote endpoints, multi-source event streams, or RxJS. Read only the additional facts needed.

## Three delivery paths

1. Small, local, reversible changes: inspect the owning file, implement narrowly, and run the smallest sufficient affected checks.
2. Reversible standard feature or refactor work: create a persistent plan only for cross-session work, handoff/recovery, significant step dependencies, or an explicit user request; otherwise use \`implement-change\` directly and complete the smallest sufficient affected checks. Ordinary UI or route changes do not become milestones merely because they are visible.
3. Milestone work includes project-creation contracts, project-type capabilities, brand/identity derivation, Release, compatibility contracts, security/permissions, production side effects, and irreversible changes. Plan explicit boundaries, use isolated worktrees only when eligible, preserve evidence, and invoke \`verify-delivery\`; smoke and E2E run only when policy selects them or a product/channel requirement makes them mandatory.

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

## Skill map

- \`check-development-environment\`: verify the local toolchain.
- \`define-product\`: clarify product scope and acceptance criteria.
- \`extract-i18n-strings\`: maintain complete localized UI text.
- \`plan-change\`: prepare persistent plans when coordination or recovery needs them.
- \`implement-change\`: execute an approved change with tests.
- \`refactor-code\`: preserve behavior during structural cleanup.
- \`prepare-brand-identity\`: refresh identity and brand assets.
- \`run-parallel-worktrees\`: isolate explicitly parallel work.
- \`test-final-artifact-e2e\`: test the final built artifact.
- \`prepare-release\`: assemble release evidence and artifacts.
- \`upgrade-harness\`: review compatible Harness engineering updates while preserving product-owned files.
- \`verify-delivery\`: run and report the delivery gate.

## Validation loop

Use \`pnpm harness brand refresh\` after intentional identity changes. For daily work, run the smallest sufficient affected format, lint, type, and non-empty test checks. Run \`pnpm harness validate\`, \`pnpm format:check\`, \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`, and \`pnpm build\` for milestones, Release candidates, cross-cutting configuration/structure/build changes, explicit requests, or when narrower evidence is insufficient. Release build includes environment validation${
    config.projectType === "extension" ? ", browser-bundle self-containment validation," : ""
  } and \`pnpm release:inspect\`. Report any skipped or blocked check explicitly; do not claim success from partial evidence.
`
}

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

async function removeIfPresent(root: string, relativePath: string): Promise<void> {
  await rm(path.join(root, relativePath), { recursive: true, force: true })
}

export interface DownstreamFinalizationPlan {
  files: ReadonlyMap<string, string>
}

export async function prepareDownstreamFinalization(
  root: string,
  config: ProjectConfig
): Promise<DownstreamFinalizationPlan> {
  const [canonicalDataAccess, canonicalMantineUiGuidelines] = await Promise.all([
    readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8"),
    readFile(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"), "utf8")
  ])
  const files = new Map<string, string>([
    [".harness/tooling/cli.ts", TERMINAL_CLI],
    [".harness/tooling/brand.ts", TERMINAL_BRAND],
    [".harness/tooling/types.ts", TERMINAL_TYPES],
    [".harness/tooling/config.ts", TERMINAL_CONFIG],
    ["README.md", downstreamReadme(config)],
    ["AGENTS.md", downstreamAgents(config)]
  ])
  for (const [relativePath, contents] of downstreamGovernanceFiles(
    config,
    canonicalDataAccess,
    canonicalMantineUiGuidelines
  )) {
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

export async function finalizeDownstream(
  root: string,
  config: ProjectConfig,
  plan?: DownstreamFinalizationPlan
): Promise<void> {
  const prepared = plan ?? (await prepareDownstreamFinalization(root, config))
  await Promise.all(
    [...prepared.files].map(([relativePath, contents]) =>
      writeAtomic(path.join(root, relativePath), contents)
    )
  )

  await Promise.all(
    HARNESS_ONLY_PATHS.filter(
      (relativePath) => relativePath !== ".harness/tooling/finalize.ts"
    ).map((relativePath) => removeIfPresent(root, relativePath))
  )
  const scriptsPath = path.join(root, "scripts")
  if (
    await readdir(scriptsPath)
      .catch(() => ["not-empty"] as string[])
      .then((entries) => entries.length === 0)
  ) {
    await removeIfPresent(root, "scripts")
  }
  await removeIfPresent(root, ".harness/tooling/finalize.ts")
}
