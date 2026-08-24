import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { format, resolveConfig } from "prettier"
import { createProjectConfig, PROJECT_CONFIG_PATH, MASTER_LOGO_PATH } from "./config.ts"
import { derivedLogoPaths } from "./brand.ts"
import {
  assertAbsent,
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
import { extensionFiles } from "./templates/extension.ts"
import { webFiles } from "./templates/web.ts"
import type { InitOptions, ProjectConfig } from "./types.ts"
import { validateProject } from "./validate.ts"
import { annotateTypeScriptProject } from "./comment-policy.ts"

// 保存 FORBIDDEN_LAYOUT_PATHS 变量供当前逻辑使用。
const FORBIDDEN_LAYOUT_PATHS = ["pnpm-workspace.yaml", "apps", "packages"] as const
// 保存 PLASMO_TYPE_PATH 变量供当前逻辑使用。
const PLASMO_TYPE_PATH = ".plasmo/index.d.ts"
// 保存 SOURCE_HARNESS_ROOT 变量供当前逻辑使用。
const SOURCE_HARNESS_ROOT = fileURLToPath(new URL("../../", import.meta.url))
// 保存 FORMATTABLE_EXTENSIONS 变量，限制初始化期只格式化本次生成或改写的文本文件。
const FORMATTABLE_EXTENSIONS = new Set([".html", ".json", ".md", ".mjs", ".ts", ".tsx"])

// 定义 InitializationCommandRunner 类型，允许回归测试观察创建期外部命令而不执行真实安装。
export type InitializationCommandRunner = typeof runCommand

// 保存 DOWNSTREAM_ONLY_INITIALIZATION_ERROR 变量供当前逻辑使用。
export const DOWNSTREAM_ONLY_INITIALIZATION_ERROR =
  "Refusing to initialize inside the source Harness. No files were changed. Create a downstream project outside this repository with `pnpm instantiate -- <absolute-target> ...`."

// 执行 isSameOrNestedPath 函数的处理逻辑。
function isSameOrNestedPath(parent: string, candidate: string): boolean {
  // 保存 relative 变量供当前逻辑使用。
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

// 执行 rejectInPlaceInitialization 函数的处理逻辑。
export function rejectInPlaceInitialization(): never {
  throw new Error(DOWNSTREAM_ONLY_INITIALIZATION_ERROR)
}

// 执行 assertDownstreamInitializationRoot 函数的处理逻辑。
async function assertDownstreamInitializationRoot(root: string): Promise<void> {
  // 保存 [sourceRoot, candidateRoot] 变量供当前逻辑使用。
  const [sourceRoot, candidateRoot] = await Promise.all([
    realpath(SOURCE_HARNESS_ROOT),
    realpath(root)
  ])
  if (isSameOrNestedPath(sourceRoot, candidateRoot)) rejectInPlaceInitialization()
}

// 执行 assertSinglePackageRoot 函数的处理逻辑。
async function assertSinglePackageRoot(root: string): Promise<void> {
  // 保存 exists 变量供当前逻辑使用。
  const exists = await Promise.all(
    FORBIDDEN_LAYOUT_PATHS.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) =>
        pathExists(path.join(root, relativePath))
    )
  )
  // 保存 forbidden 变量供当前逻辑使用。
  const forbidden = FORBIDDEN_LAYOUT_PATHS.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (_, index) => exists[index]
  )
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
  // 保存 tsconfigPath 变量供当前逻辑使用。
  const tsconfigPath = path.join(root, "tsconfig.json")
  // 保存 tsconfig 变量供当前逻辑使用。
  const tsconfig = await readJson<Record<string, unknown>>(tsconfigPath)
  if (!Array.isArray(tsconfig.include)) {
    throw new Error("tsconfig.json include must be an array of strings")
  }
  // 保存 currentInclude 变量供当前逻辑使用。
  const currentInclude = tsconfig.include.filter(
    // 执行 当前声明 函数的处理逻辑。
    (entry): entry is string => typeof entry === "string"
  )
  if (currentInclude.length !== tsconfig.include.length) {
    throw new Error("tsconfig.json include must be an array of strings")
  }
  // 保存 withoutPlasmoType 变量供当前逻辑使用。
  const withoutPlasmoType = currentInclude.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry !== PLASMO_TYPE_PATH
  )
  // 保存 include 变量供当前逻辑使用。
  const include =
    projectType === "extension" ? [PLASMO_TYPE_PATH, ...withoutPlasmoType] : withoutPlasmoType
  if (
    include.length === currentInclude.length &&
    include.every(
      /* 执行 当前声明 函数的处理逻辑。 */ (entry, index) => entry === currentInclude[index]
    )
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
async function formatInitializationFiles(
  root: string,
  relativePaths: Iterable<string>
): Promise<void> {
  // 保存 prettierConfig 变量，复用目标根随模板复制的正式格式配置。
  const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
  // 保存 candidates 变量，去重并排除二进制、环境文件与法律文本。
  const candidates = [...new Set(relativePaths)]
    .filter(
      // 执行 当前声明 函数的处理逻辑。
      (relativePath) =>
        !relativePath.startsWith("LICENSE.") &&
        FORMATTABLE_EXTENSIONS.has(path.extname(relativePath))
    )
    .sort()
  await Promise.all(
    candidates.map(
      // 执行 当前声明 函数的处理逻辑。
      async (relativePath) => {
        // 保存 absolutePath 变量供格式化读写使用。
        const absolutePath = path.join(root, relativePath)
        // 保存 source 变量供格式化差异判断使用。
        const source = await readFile(absolutePath, "utf8")
        // 保存 formatted 变量，按真实目标路径选择 Prettier parser。
        const formatted = await format(source, { ...prettierConfig, filepath: absolutePath })
        if (formatted !== source) await writeAtomic(absolutePath, formatted)
      }
    )
  )
}

// 执行 runPostInitialization 函数，只安装一次依赖并按需建立独立 Git 根。
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
    console.log("Skipped dependency installation (--skip-install).")
  }
  if (options.skipGit !== true && !(await pathExists(path.join(options.root, ".git")))) {
    await commandRunner("git", ["init", "-b", "main"], options.root)
  }
}

// 执行 initializeProject 函数的处理逻辑。
export async function initializeProject(
  options: InitOptions,
  preparedLogo?: Uint8Array,
  commandRunner: InitializationCommandRunner = runCommand
): Promise<ProjectConfig> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(options.root)
  await assertDownstreamInitializationRoot(root)
  // 保存 resolvedOptions 变量供当前逻辑使用。
  const resolvedOptions = { ...options, ...validateBaseUrls(options), root }
  // 保存 config 变量供当前逻辑使用。
  const config = createProjectConfig(resolvedOptions)
  await assertSinglePackageRoot(root)

  // 保存 collisions 变量供当前逻辑使用。
  const collisions = [
    PROJECT_CONFIG_PATH,
    MASTER_LOGO_PATH,
    ...Object.values(ENVIRONMENT_FILES),
    ...FORBIDDEN_ENVIRONMENT_FILES,
    ...generatedRoots(config.projectType),
    ...derivedLogoPaths(config)
  ]
  await assertAbsent(root, collisions)

  // 保存 existingManifest 变量供当前逻辑使用。
  const existingManifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  // 保存 projectManifest 变量供当前逻辑使用。
  const projectManifest = buildProjectManifest(existingManifest, config)
  // 保存 logo 变量供当前逻辑使用。
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
  // 保存 projectFiles 变量供当前逻辑使用。
  const projectFiles =
    config.projectType === "web"
      ? webFiles(config, resolvedOptions)
      : extensionFiles(config, resolvedOptions)
  // 保存 [normalizedTsconfig, logoAssets, finalizationPlan] 变量供当前逻辑使用。
  const [normalizedTsconfig, logoAssets, finalizationPlan] = await Promise.all([
    prepareProjectTsconfig(root, config.projectType),
    deriveLogoAssets(config.projectType, logo),
    prepareDownstreamFinalization(root, config)
  ])

  if (normalizedTsconfig !== undefined) {
    await writeJsonAtomic(path.join(root, "tsconfig.json"), normalizedTsconfig)
  }
  // 保存 [relativePath, contents] 变量供当前逻辑使用。
  for (const [relativePath, contents] of projectFiles) {
    await writeNew(path.join(root, relativePath), contents)
  }
  await writeNew(path.join(root, MASTER_LOGO_PATH), logo)
  // 保存 [relativePath, contents] 变量供当前逻辑使用。
  for (const [relativePath, contents] of logoAssets) {
    await writeNew(path.join(root, relativePath), contents)
  }
  await writeJsonAtomic(path.join(root, "package.json"), projectManifest)
  await writeJsonNew(path.join(root, PROJECT_CONFIG_PATH), config)
  await finalizeDownstream(root, config, finalizationPlan)
  // 保存 annotatedFiles 变量，纳入本次最小格式化集合。
  const annotatedFiles = await annotateTypeScriptProject(root)
  await formatInitializationFiles(root, [
    ...projectFiles.keys(),
    ...finalizationPlan.files.keys(),
    ...annotatedFiles,
    ...(normalizedTsconfig === undefined ? [] : ["tsconfig.json"]),
    "package.json",
    PROJECT_CONFIG_PATH
  ])
  await validateProject(root)
  await runPostInitialization(resolvedOptions, commandRunner)
  return config
}
