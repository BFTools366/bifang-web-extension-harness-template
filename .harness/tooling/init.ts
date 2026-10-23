import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { format, resolveConfig } from "prettier"
import { createProjectConfig, PROJECT_CONFIG_PATH, MASTER_LOGO_PATH } from "./config.ts"
import { derivedLogoPaths } from "./brand.ts"
import {
  assertAbsent,
  passesThroughDirectory,
  pathExists,
  readJson,
  writeAtomic,
  writeJsonAtomic,
  writeJsonNew,
  writeNew
} from "./files.ts"
import { createLogo, deriveLogoAssets } from "./logo.ts"
import { buildProjectManifest } from "./manifest.ts"
import { ENVIRONMENT_FILES, FORBIDDEN_ENVIRONMENT_FILES, validateBaseUrls } from "./environment.ts"
import { runCommand } from "./process.ts"
import { finalizeDownstream, prepareDownstreamFinalization } from "./finalize.ts"
import { prepareDesignSkillInstallation } from "./install-design-skill.ts"
import { inspectDesignSkill } from "./design-skill.ts"
import { extensionFiles } from "./templates/extension.ts"
import { webFiles } from "./templates/web.ts"
import type { InitOptions, ProjectConfig } from "./types.ts"
import { validateProject } from "./validate.ts"

const FORBIDDEN_LAYOUT_PATHS = ["apps", "packages"] as const
const PLASMO_TYPE_PATH = ".plasmo/index.d.ts"
const SOURCE_HARNESS_ROOT = fileURLToPath(new URL("../../", import.meta.url))
// 保存 FORMATTABLE_EXTENSIONS 变量，限制初始化期只格式化本次生成或改写的文本文件。
const FORMATTABLE_EXTENSIONS = new Set([".css", ".html", ".json", ".md", ".mjs", ".ts", ".tsx"])

// 定义 InitializationCommandRunner 类型，允许回归测试观察创建期外部命令而不执行真实安装。
export type InitializationCommandRunner = typeof runCommand

export const DOWNSTREAM_ONLY_INITIALIZATION_ERROR =
  "Refusing to initialize inside the source Harness. No files were changed. Create a downstream project outside this repository with `pnpm instantiate -- <absolute-parent> ...`."

// 执行 isSameOrNestedPath 函数的处理逻辑。
function isSameOrNestedPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

// 执行 rejectInPlaceInitialization 函数的处理逻辑。
export function rejectInPlaceInitialization(): never {
  throw new Error(DOWNSTREAM_ONLY_INITIALIZATION_ERROR)
}

// 执行 assertDownstreamInitializationRoot 函数的处理逻辑。
export async function assertDownstreamInitializationRoot(root: string): Promise<void> {
  const requestedRoot = path.resolve(root)
  if (isSameOrNestedPath(path.resolve(SOURCE_HARNESS_ROOT), requestedRoot)) {
    rejectInPlaceInitialization()
  }
  const [sourceRoot, candidateRoot] = await Promise.all([
    realpath(SOURCE_HARNESS_ROOT),
    realpath(root)
  ])
  if (
    isSameOrNestedPath(sourceRoot, requestedRoot) ||
    isSameOrNestedPath(sourceRoot, candidateRoot) ||
    (await passesThroughDirectory(requestedRoot, sourceRoot))
  )
    rejectInPlaceInitialization()
}

// 执行 assertSinglePackageRoot 函数的处理逻辑。
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

// 执行 prepareProjectTsconfig 函数的处理逻辑。
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

// 执行 generatedRoots 函数的处理逻辑。
function generatedRoots(projectType: ProjectConfig["projectType"]): string[] {
  return projectType === "web"
    ? ["index.html", "vite.config.ts", "src", "public"]
    : ["src", "assets"]
}

// 执行 formatInitializationFiles 函数，只整理初始化器本次创建或注释迁移的文本。
export async function formatInitializationFiles(
  root: string,
  relativePaths: Iterable<string>
): Promise<void> {
  // 保存 prettierConfig 变量，复用目标根随模板复制的正式格式配置。
  const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
  // 保存 candidates 变量，去重并排除二进制、环境文件与法律文本。
  const candidates = [...new Set(relativePaths)]
    .filter(
      (relativePath) =>
        !relativePath.startsWith("LICENSE.") &&
        FORMATTABLE_EXTENSIONS.has(path.extname(relativePath))
    )
    .sort()
  await Promise.all(
    candidates.map(async (relativePath) => {
      const absolutePath = path.join(root, relativePath)
      const source = await readFile(absolutePath, "utf8")
      // 保存 formatted 变量，按真实目标路径选择 Prettier parser。
      const formatted = await format(source, { ...prettierConfig, filepath: absolutePath })
      if (formatted !== source) await writeAtomic(absolutePath, formatted)
    })
  )
}

// 执行 runPostInitialization 函数，只安装一次依赖，不配置或初始化 Git。
export async function runPostInitialization(
  options: InitOptions,
  commandRunner: InitializationCommandRunner = runCommand
): Promise<void> {
  if (options.skipInstall !== true) {
    await commandRunner(
      "pnpm",
      ["install", "--no-frozen-lockfile", "--prefer-offline"],
      options.root
    )
  } else {
    console.log("Skipped dependency installation through internal test injection.")
  }
}

// 执行 initializeProject 函数的处理逻辑。
export async function initializeProject(
  options: InitOptions,
  preparedLogo?: Uint8Array,
  commandRunner: InitializationCommandRunner = runCommand
): Promise<ProjectConfig> {
  const root = path.resolve(options.root)
  await assertDownstreamInitializationRoot(root)
  const resolvedOptions = { ...options, ...validateBaseUrls(options), root }
  const config = createProjectConfig(resolvedOptions)
  await assertSinglePackageRoot(root)

  const collisions = [
    PROJECT_CONFIG_PATH,
    ".harness/initial-creation.json",
    MASTER_LOGO_PATH,
    ...Object.values(ENVIRONMENT_FILES),
    ...FORBIDDEN_ENVIRONMENT_FILES,
    ...generatedRoots(config.projectType),
    ...(config.projectType === "extension" ? ["locales"] : []),
    ...derivedLogoPaths(config)
  ]
  await assertAbsent(root, collisions)

  const existingManifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  const projectManifest = buildProjectManifest(existingManifest, config)
  const logo =
    preparedLogo === undefined
      ? await createLogo({
          root,
          name: config.name,
          id: config.id,
          color: config.brand.primaryColor,
          logoPath: resolvedOptions.logoPath
        })
      : Buffer.from(preparedLogo)
  const projectFiles =
    config.projectType === "web"
      ? webFiles(config, resolvedOptions)
      : extensionFiles(config, resolvedOptions)
  const [normalizedTsconfig, logoAssets, finalizationPlan, designSkillFiles] = await Promise.all([
    prepareProjectTsconfig(root, config.projectType),
    deriveLogoAssets(config.projectType, logo),
    prepareDownstreamFinalization(root, config, resolvedOptions.agentPolicy),
    prepareDesignSkillInstallation(root)
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
  await writeJsonNew(path.join(root, ".harness/initial-creation.json"), {
    schemaVersion: 1,
    projectId: config.id,
    projectType: config.projectType,
    initializedAt: config.initializedAt,
    prototypeApprovalRequired: true,
    ...(resolvedOptions.initialCreationAuthorization
      ? { authorization: resolvedOptions.initialCreationAuthorization }
      : {})
  })
  // 将审核过的第三方原始字节仅写入项目目录，不纳入初始化文本格式化。
  for (const [relativePath, contents] of designSkillFiles) {
    await writeNew(path.join(root, relativePath), contents)
  }
  if ((await inspectDesignSkill(root)) !== "present") {
    throw new Error("New downstream project must include its local design Skill")
  }
  await finalizeDownstream(root, config, resolvedOptions.agentPolicy, finalizationPlan)
  await formatInitializationFiles(root, [
    ...projectFiles.keys(),
    ...finalizationPlan.files.keys(),
    ...(normalizedTsconfig === undefined ? [] : ["tsconfig.json"]),
    "package.json",
    PROJECT_CONFIG_PATH
  ])
  await validateProject(root)
  await runPostInitialization(resolvedOptions, commandRunner)
  return config
}
