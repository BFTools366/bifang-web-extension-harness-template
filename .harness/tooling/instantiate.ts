import type { Stats } from "node:fs"
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  rmdir
} from "node:fs/promises"
import path from "node:path"
import { createProjectConfig } from "./config.ts"
import { ENVIRONMENT_FILES, FORBIDDEN_ENVIRONMENT_FILES, validateBaseUrls } from "./environment.ts"
import { initializeProject } from "./init.ts"
import { lstatIfPresent, pathExists } from "./files.ts"
import { createLogo } from "./logo.ts"
import type { InitOptions, InstantiateOptions, ProjectConfig } from "./types.ts"

// 保存 TOP_LEVEL_SEED_NAMES 变量供当前逻辑使用。
const TOP_LEVEL_SEED_NAMES = new Set([
  ".agents",
  ".gitignore",
  ".harness",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "LICENSE.en.md",
  "LICENSE.zh-CN.md",
  "README.md",
  "docs",
  "eslint.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "scripts",
  "tests",
  "tsconfig.json",
  "vitest.config.ts"
])

// 保存 EXCLUDED_NAMES 变量供当前逻辑使用。
const EXCLUDED_NAMES = new Set([
  ".git",
  ".DS_Store",
  ".plasmo",
  "build",
  "coverage",
  "dist",
  "node_modules"
])

// 执行 isNestedPath 函数的处理逻辑。
function isNestedPath(parent: string, candidate: string): boolean {
  // 保存 relative 变量供当前逻辑使用。
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

// 执行 assertEmptyTarget 函数的处理逻辑。
async function assertEmptyTarget(targetRoot: string): Promise<Stats | undefined> {
  // 保存 targetStat 变量供当前逻辑使用。
  const targetStat = await lstatIfPresent(targetRoot)
  if (targetStat === undefined) return undefined
  if (targetStat.isSymbolicLink())
    throw new Error(`Target must not be a symbolic link: ${targetRoot}`)
  if (!targetStat.isDirectory()) throw new Error(`Target is not a directory: ${targetRoot}`)
  // 保存 entries 变量供当前逻辑使用。
  const entries = await readdir(targetRoot)
  if (entries.length > 0) throw new Error(`Target directory must be empty: ${targetRoot}`)
  return targetStat
}

// 执行 canonicalizeTarget 函数的处理逻辑。
async function canonicalizeTarget(targetRoot: string): Promise<string> {
  // 保存 targetStat 变量供当前逻辑使用。
  const targetStat = await lstatIfPresent(targetRoot)
  if (targetStat !== undefined) {
    if (targetStat.isSymbolicLink())
      throw new Error(`Target must not be a symbolic link: ${targetRoot}`)
    return realpath(targetRoot)
  }
  // 保存 missingParts 变量供当前逻辑使用。
  const missingParts: string[] = []
  // 保存 existingParent 变量供当前逻辑使用。
  let existingParent = targetRoot
  while ((await lstatIfPresent(existingParent)) === undefined) {
    missingParts.unshift(path.basename(existingParent))
    // 保存 next 变量供当前逻辑使用。
    const next = path.dirname(existingParent)
    if (next === existingParent) throw new Error(`Cannot resolve target path: ${targetRoot}`)
    existingParent = next
  }
  return path.join(await realpath(existingParent), ...missingParts)
}

// 执行 shouldExclude 函数的处理逻辑。
function shouldExclude(relativePath: string, name: string): boolean {
  if (!relativePath.includes("/") && !TOP_LEVEL_SEED_NAMES.has(name)) return true
  if (EXCLUDED_NAMES.has(name)) return true
  if (relativePath === ".agents/skills/manage-project-surfaces") return true
  if (relativePath === "docs/work_plan") return true
  return (
    relativePath === ".harness/project.json" ||
    relativePath === ".harness/brand" ||
    relativePath.startsWith(".harness/brand/")
  )
}

// 执行 copyTemplateDirectory 函数的处理逻辑。
async function copyTemplateDirectory(source: string, target: string, relative = ""): Promise<void> {
  await mkdir(target, { recursive: true })
  // 保存 entries 变量供当前逻辑使用。
  const entries = await readdir(source, { withFileTypes: true })
  // 保存 entry 变量供当前逻辑使用。
  for (const entry of entries) {
    // 保存 childRelative 变量供当前逻辑使用。
    const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`
    if (shouldExclude(childRelative, entry.name)) continue
    // 保存 sourcePath 变量供当前逻辑使用。
    const sourcePath = path.join(source, entry.name)
    // 保存 targetPath 变量供当前逻辑使用。
    const targetPath = path.join(target, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Template contains unsupported symbolic link: ${childRelative}`)
    }
    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, targetPath, childRelative)
    } else if (entry.isFile()) {
      await mkdir(path.dirname(targetPath), { recursive: true })
      await copyFile(sourcePath, targetPath)
    }
  }
}

// 执行 assertTargetUnchanged 函数的处理逻辑。
async function assertTargetUnchanged(targetRoot: string, existed: boolean): Promise<void> {
  // 保存 targetStat 变量供当前逻辑使用。
  const targetStat = await lstatIfPresent(targetRoot)
  if (!existed) {
    if (targetStat !== undefined) {
      throw new Error(`Target appeared while project initialization was running: ${targetRoot}`)
    }
    return
  }
  if (targetStat === undefined) {
    throw new Error(`Target disappeared while project initialization was running: ${targetRoot}`)
  }
  await assertEmptyTarget(targetRoot)
}

// 执行 commitStagedProject 函数的处理逻辑。
async function commitStagedProject(
  stagingRoot: string,
  targetRoot: string,
  targetExisted: boolean
): Promise<void> {
  await assertTargetUnchanged(targetRoot, targetExisted)
  // 保存 removedEmptyTarget 变量供当前逻辑使用。
  let removedEmptyTarget = false
  try {
    if (targetExisted) {
      await rmdir(targetRoot)
      removedEmptyTarget = true
    }
    await rename(stagingRoot, targetRoot)
  } catch (error) {
    if (removedEmptyTarget) {
      try {
        await mkdir(targetRoot)
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `Failed to commit staged project and restore empty target: ${targetRoot}`,
          { cause: restoreError }
        )
      }
    }
    throw error
  }
}

// 执行 cleanupStagingRoot 函数的处理逻辑。
async function cleanupStagingRoot(
  stagingRoot: string,
  targetParent: string,
  stagingPrefix: string
): Promise<void> {
  if (
    path.dirname(stagingRoot) !== targetParent ||
    !path.basename(stagingRoot).startsWith(stagingPrefix)
  ) {
    throw new Error(`Refusing to clean an unexpected staging path: ${stagingRoot}`)
  }
  await rm(stagingRoot, { recursive: true, force: true })
}

type ProjectInitializer = (options: InitOptions) => Promise<ProjectConfig>

// 执行 instantiateProject 函数的处理逻辑。
export async function instantiateProject(
  options: InstantiateOptions,
  initialize: ProjectInitializer = initializeProject
): Promise<ProjectConfig> {
  // 保存 sourceRoot 变量供当前逻辑使用。
  const sourceRoot = await realpath(path.resolve(options.sourceRoot))
  // 保存 requestedTarget 变量供当前逻辑使用。
  const requestedTarget = path.resolve(options.targetRoot)
  // 保存 previewConfig 变量供当前逻辑使用。
  const previewConfig = createProjectConfig(options.init)
  validateBaseUrls(options.init)
  // 保存 logoPath 变量供当前逻辑使用。
  const logoPath =
    options.init.logoPath === undefined
      ? undefined
      : path.isAbsolute(options.init.logoPath)
        ? options.init.logoPath
        : path.resolve(requestedTarget, options.init.logoPath)
  if (logoPath !== undefined) {
    await createLogo({
      root: requestedTarget,
      name: previewConfig.name,
      id: previewConfig.id,
      color: previewConfig.brand.primaryColor,
      logoPath
    })
  }
  // 保存 targetRoot 变量供当前逻辑使用。
  const targetRoot = await canonicalizeTarget(requestedTarget)
  if (path.basename(targetRoot) !== previewConfig.id) {
    throw new Error(`Target directory name must exactly match project id "${previewConfig.id}"`)
  }
  if (isNestedPath(sourceRoot, targetRoot)) {
    throw new Error("Target must be outside the Harness template directory")
  }
  if (await pathExists(path.join(sourceRoot, ".harness/project.json"))) {
    throw new Error("Instantiation source is already initialized and is not a clean template")
  }
  // 保存 suspectEnvironmentFiles 变量供当前逻辑使用。
  const suspectEnvironmentFiles = [
    ...Object.values(ENVIRONMENT_FILES),
    ...FORBIDDEN_ENVIRONMENT_FILES
  ]
  // 保存 suspectEnvironmentFilesExist 变量供当前逻辑使用。
  const suspectEnvironmentFilesExist = await Promise.all(
    suspectEnvironmentFiles.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) =>
        pathExists(path.join(sourceRoot, relativePath))
    )
  )
  // 保存 foundEnvironmentFile 变量供当前逻辑使用。
  const foundEnvironmentFile = suspectEnvironmentFiles.find(
    // 执行 当前声明 函数的处理逻辑。
    (_, index) => suspectEnvironmentFilesExist[index]
  )
  if (foundEnvironmentFile !== undefined) {
    throw new Error(
      `Instantiation source contains generated or forbidden environment ${foundEnvironmentFile}`
    )
  }
  // 保存 existingTarget 变量供当前逻辑使用。
  const existingTarget = await assertEmptyTarget(targetRoot)
  // 保存 targetExisted 变量供当前逻辑使用。
  const targetExisted = existingTarget !== undefined
  // 保存 targetParent 变量供当前逻辑使用。
  const targetParent = path.dirname(targetRoot)
  await mkdir(targetParent, { recursive: true })
  // 保存 stagingPrefix 变量供当前逻辑使用。
  const stagingPrefix = `.${path.basename(targetRoot)}.harness-stage-`
  // 保存 stagingRoot 变量供当前逻辑使用。
  const stagingRoot = await mkdtemp(path.join(targetParent, stagingPrefix))
  // 保存 stagingOwned 变量供当前逻辑使用。
  let stagingOwned = true
  try {
    await chmod(
      stagingRoot,
      existingTarget === undefined ? 0o777 & ~process.umask() : existingTarget.mode & 0o777
    )
    await copyTemplateDirectory(sourceRoot, stagingRoot)
    // 保存 config 变量供当前逻辑使用。
    const config = await initialize({ ...options.init, logoPath, root: stagingRoot })
    await commitStagedProject(stagingRoot, targetRoot, targetExisted)
    stagingOwned = false
    return config
  } catch (error) {
    if (stagingOwned) {
      try {
        await cleanupStagingRoot(stagingRoot, targetParent, stagingPrefix)
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Project initialization failed and staging cleanup also failed: ${stagingRoot}`,
          { cause: cleanupError }
        )
      }
    }
    throw error
  }
}
