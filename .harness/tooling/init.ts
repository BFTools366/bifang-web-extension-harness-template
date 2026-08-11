import path from "node:path"
import { createProjectConfig, PROJECT_CONFIG_PATH, MASTER_LOGO_PATH } from "./config.ts"
import { derivedLogoPaths } from "./brand.ts"
import {
  assertAbsent,
  pathExists,
  readJson,
  writeJsonAtomic,
  writeJsonNew,
  writeNew
} from "./files.ts"
import { createLogo, deriveLogoAssets } from "./logo.ts"
import { buildProjectManifest } from "./manifest.ts"
import { ENVIRONMENT_FILES, FORBIDDEN_ENVIRONMENT_FILES, validateBaseUrls } from "./environment.ts"
import { runCommand } from "./process.ts"
import { finalizeDownstream, prepareDownstreamFinalization } from "./finalize.ts"
import { extensionFiles } from "./templates/extension.ts"
import { webFiles } from "./templates/web.ts"
import type { InitOptions, ProjectConfig } from "./types.ts"
import { validateProject } from "./validate.ts"

const FORBIDDEN_LAYOUT_PATHS = ["pnpm-workspace.yaml", "apps", "packages"] as const
const PLASMO_TYPE_PATH = ".plasmo/index.d.ts"

async function assertSinglePackageRoot(root: string): Promise<void> {
  const exists = await Promise.all(
    FORBIDDEN_LAYOUT_PATHS.map((relativePath) => pathExists(path.join(root, relativePath)))
  )
  const forbidden = FORBIDDEN_LAYOUT_PATHS.filter((_, index) => exists[index])
  if (forbidden.length > 0) {
    throw new Error(`Single-package Harness cannot initialize with: ${forbidden.join(", ")}`)
  }
  if (!(await pathExists(path.join(root, "package.json")))) {
    throw new Error("Missing package.json in project root")
  }
}

async function prepareProjectTsconfig(
  root: string,
  projectType: ProjectConfig["projectType"]
): Promise<Record<string, unknown> | undefined> {
  const tsconfigPath = path.join(root, "tsconfig.json")
  const tsconfig = await readJson<Record<string, unknown>>(tsconfigPath)
  if (!Array.isArray(tsconfig.include)) {
    throw new Error("tsconfig.json include must be an array of strings")
  }
  const currentInclude = tsconfig.include.filter(
    (entry): entry is string => typeof entry === "string"
  )
  if (currentInclude.length !== tsconfig.include.length) {
    throw new Error("tsconfig.json include must be an array of strings")
  }
  const withoutPlasmoType = currentInclude.filter((entry) => entry !== PLASMO_TYPE_PATH)
  const include =
    projectType === "extension" ? [PLASMO_TYPE_PATH, ...withoutPlasmoType] : withoutPlasmoType
  if (
    include.length === currentInclude.length &&
    include.every((entry, index) => entry === currentInclude[index])
  ) {
    return undefined
  }
  return { ...tsconfig, include }
}

function generatedRoots(projectType: ProjectConfig["projectType"]): string[] {
  return projectType === "web"
    ? ["index.html", "vite.config.ts", "src", "public"]
    : ["src", "assets"]
}

async function runPostInitialization(options: InitOptions): Promise<void> {
  if (options.skipInstall !== true) {
    await runCommand("pnpm", ["install", "--no-frozen-lockfile"], options.root)
    await runCommand("pnpm", ["format"], options.root)
    for (const command of [
      ["harness", "validate"],
      ["format:check"],
      ["lint"],
      ["typecheck"],
      ["test"],
      ["build"],
      ["harness", "validate"]
    ]) {
      await runCommand("pnpm", command, options.root)
    }
  } else {
    console.log(
      "Skipped dependency installation, lint, typecheck, tests, and build (--skip-install)."
    )
  }
  if (options.skipGit !== true && !(await pathExists(path.join(options.root, ".git")))) {
    await runCommand("git", ["init", "-b", "main"], options.root)
  }
}

export async function initializeProject(options: InitOptions): Promise<ProjectConfig> {
  const root = path.resolve(options.root)
  const resolvedOptions = { ...options, ...validateBaseUrls(options), root }
  const config = createProjectConfig(resolvedOptions)
  await assertSinglePackageRoot(root)

  const collisions = [
    PROJECT_CONFIG_PATH,
    MASTER_LOGO_PATH,
    ...Object.values(ENVIRONMENT_FILES),
    ...FORBIDDEN_ENVIRONMENT_FILES,
    ...generatedRoots(config.projectType),
    ...derivedLogoPaths(config)
  ]
  await assertAbsent(root, collisions)

  const existingManifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  const projectManifest = buildProjectManifest(existingManifest, config)
  const logo = await createLogo({
    root,
    name: config.name,
    id: config.id,
    color: config.brand.primaryColor,
    logoPath: resolvedOptions.logoPath
  })
  const projectFiles =
    config.projectType === "web"
      ? webFiles(config, resolvedOptions)
      : extensionFiles(config, resolvedOptions)
  const [normalizedTsconfig, logoAssets, finalizationPlan] = await Promise.all([
    prepareProjectTsconfig(root, config.projectType),
    deriveLogoAssets(config.projectType, logo),
    prepareDownstreamFinalization(root, config)
  ])

  if (normalizedTsconfig !== undefined) {
    await writeJsonAtomic(path.join(root, "tsconfig.json"), normalizedTsconfig)
  }
  for (const [relativePath, contents] of projectFiles) {
    await writeNew(path.join(root, relativePath), contents)
  }
  await writeNew(path.join(root, MASTER_LOGO_PATH), logo)
  for (const [relativePath, contents] of logoAssets) {
    await writeNew(path.join(root, relativePath), contents)
  }
  await writeJsonAtomic(path.join(root, "package.json"), projectManifest)
  await writeJsonNew(path.join(root, PROJECT_CONFIG_PATH), config)
  await finalizeDownstream(root, config, finalizationPlan)
  await validateProject(root)
  await runPostInitialization(resolvedOptions)
  return config
}
