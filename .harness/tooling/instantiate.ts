import { execFile } from "node:child_process"
import { chmod, lstat, mkdtemp, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { checkCommitConfiguration } from "../../.agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"
import { normalizeAgentPolicy } from "./agent-policy.ts"
import { createProjectConfig, INSTANTIATION_ONLY_EXCLUDED_PATHS } from "./config.ts"
import { ENVIRONMENT_FILES, FORBIDDEN_ENVIRONMENT_FILES, validateBaseUrls } from "./environment.ts"
import { initializeProject } from "./init.ts"
import { pathExists } from "./files.ts"
import { createLogo } from "./logo.ts"
import {
  assertTemplateSnapshotUnchanged,
  captureTemplateSnapshot,
  copyTemplateSnapshot
} from "./source-snapshot.ts"
import type { InitOptions, InstantiateOptions, ProjectConfig } from "./types.ts"
import {
  captureDirectorySnapshot,
  captureTargetParentPlan,
  prepareTargetParent,
  acquireInitializationLease,
  releaseInitializationLease,
  captureTargetSnapshot,
  canonicalizeTarget,
  commitStagedProject,
  cleanupStagingRoot
} from "./instantiate-target.ts"

/** 无 Shell 执行 Git 配置迁移和回读。 */
const execFileAsync = promisify(execFile)

/** 发布前把受管提交模板预绑定到最终路径，所有失败仍留在 staging。 */
async function bindPublishedCommitTemplate(stagingRoot: string, targetRoot: string): Promise<void> {
  const configuration = await checkCommitConfiguration(stagingRoot)
  if (configuration.commonDir !== path.join(stagingRoot, ".git")) {
    throw new Error("Initialization Git metadata must belong to the staged project")
  }
  const finalTemplatePath = path.join(targetRoot, ".git/harness/meaningful-commit-template.txt")
  await execFileAsync("git", ["config", "--local", "commit.template", finalTemplatePath], {
    cwd: stagingRoot
  })
  const rebound = await execFileAsync("git", ["config", "--local", "--get", "commit.template"], {
    cwd: stagingRoot,
    encoding: "utf8"
  })
  if (rebound.stdout.trim() !== finalTemplatePath) {
    throw new Error("Initialization Git commit template did not bind to the final project path")
  }
}

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
  "pnpm-workspace.yaml",
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
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

// 执行 shouldExclude 函数的处理逻辑。
function shouldExclude(relativePath: string, name: string): boolean {
  if (!relativePath.includes("/") && !TOP_LEVEL_SEED_NAMES.has(name)) return true
  if (EXCLUDED_NAMES.has(name)) return true
  if (relativePath === ".agents/skills/manage-project-surfaces") return true
  if (relativePath === ".agents/skills/web-curate-harness-memory") {
    return true
  }
  if (
    INSTANTIATION_ONLY_EXCLUDED_PATHS.some(
      (excludedPath) => relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`)
    )
  )
    return true
  return (
    relativePath === ".harness/project.json" ||
    relativePath === ".harness/brand" ||
    relativePath.startsWith(".harness/brand/")
  )
}

/** 描述源外 staging 内部初始化器的可替换接口。 */
type ProjectInitializer = (
  options: InitOptions,
  preparedLogo?: Uint8Array
) => Promise<ProjectConfig>

// 执行 instantiateProject 函数的处理逻辑。
export async function instantiateProject(
  options: InstantiateOptions,
  initialize: ProjectInitializer = initializeProject
): Promise<ProjectConfig> {
  // 保存 requestedSourceRoot 变量，在 realpath 前拒绝符号链接源根。
  const requestedSourceRoot = path.resolve(options.sourceRoot)
  const sourceStatus = await lstat(requestedSourceRoot)
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory()) {
    throw new Error(`Instantiation source must be a real directory: ${requestedSourceRoot}`)
  }
  // 保存 sourceRoot 变量供当前逻辑使用。
  const sourceRoot = await realpath(requestedSourceRoot)
  // 保存 requestedTarget 变量供当前逻辑使用。
  const requestedTarget = path.resolve(options.targetRoot)
  // 保存 previewConfig 变量供当前逻辑使用。
  const previewConfig = createProjectConfig(options.init)
  validateBaseUrls(options.init)
  normalizeAgentPolicy(options.init.agentPolicy)
  // 保存 logoPath 变量供当前逻辑使用。
  const logoPath =
    options.init.logoPath === undefined
      ? undefined
      : path.isAbsolute(options.init.logoPath)
        ? options.init.logoPath
        : path.resolve(requestedTarget, options.init.logoPath)
  // 保存 targetRoot 变量供当前逻辑使用。
  const targetRoot = await canonicalizeTarget(requestedTarget)
  if (path.basename(targetRoot) !== previewConfig.id) {
    throw new Error(`Target directory name must exactly match project id "${previewConfig.id}"`)
  }
  if (isNestedPath(sourceRoot, targetRoot)) {
    throw new Error("Target must be outside the Harness template directory")
  }
  // 保存 targetParent 变量供当前逻辑使用。
  const targetParent = path.dirname(targetRoot)
  // 保存 targetParentPlan 变量，在 source 快照期间也约束既有父目录身份。
  const targetParentPlan = await captureTargetParentPlan(targetParent)
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
  // 保存 sourceSnapshot 变量，在任何目标或 staging 写入前冻结精确源事实。
  const sourceSnapshot = await captureTemplateSnapshot(
    sourceRoot,
    (relativePath, name) => !shouldExclude(relativePath, name)
  )
  // 保存 preparedLogo 变量，确保预检与正式写入复用同一次 Logo 压缩结果。
  const preparedLogo = await createLogo({
    root: requestedTarget,
    name: previewConfig.name,
    id: previewConfig.id,
    color: previewConfig.brand.primaryColor,
    logoPath
  })
  // 保存 targetParentSnapshot 变量，绑定所有 staging、发布与回收动作的父目录身份。
  const targetParentSnapshot = await prepareTargetParent(targetParentPlan)
  // 保存 lease 变量，阻止两个遵循 Harness 契约的初始化器同时竞争同一目标。
  const lease = await acquireInitializationLease(
    targetParent,
    path.basename(targetRoot),
    targetParentSnapshot
  )
  try {
    // 保存 targetSnapshot 变量，在合作租约持有期间冻结目标缺席或空目录身份。
    const targetSnapshot = await captureTargetSnapshot(targetRoot)
    // 保存 stagingPrefix 变量供当前逻辑使用。
    const stagingPrefix = `.${path.basename(targetRoot)}.harness-stage-`
    // 保存 stagingRoot 变量供当前逻辑使用。
    const stagingRoot = await mkdtemp(path.join(targetParent, stagingPrefix))
    // 保存 stagingSnapshot 变量，在递归写入前绑定唯一 staging 目录。
    let stagingSnapshot = await captureDirectorySnapshot(stagingRoot, "Staging directory")
    // 保存 stagingOwned 变量供当前逻辑使用。
    let stagingOwned = true
    try {
      await chmod(
        stagingRoot,
        targetSnapshot.kind === "absent" ? 0o777 & ~process.umask() : targetSnapshot.mode & 0o7777
      )
      stagingSnapshot = await captureDirectorySnapshot(stagingRoot, "Staging directory")
      await copyTemplateSnapshot(sourceSnapshot, stagingRoot)
      // 保存 config 变量供当前逻辑使用。
      const config = await initialize(
        { ...options.init, logoPath, root: stagingRoot },
        preparedLogo
      )
      if (options.init.skipGit !== true) {
        await bindPublishedCommitTemplate(stagingRoot, targetRoot)
      }
      await assertTemplateSnapshotUnchanged(
        sourceSnapshot,
        (relativePath, name) => !shouldExclude(relativePath, name)
      )
      await commitStagedProject(
        stagingRoot,
        targetRoot,
        targetSnapshot,
        targetParentSnapshot,
        stagingSnapshot
      )
      stagingOwned = false
      return config
    } catch (error) {
      if (stagingOwned) {
        try {
          await cleanupStagingRoot(
            stagingRoot,
            targetParent,
            stagingPrefix,
            targetParentSnapshot,
            stagingSnapshot
          )
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
  } finally {
    try {
      await releaseInitializationLease(
        targetParent,
        targetParentSnapshot,
        lease.root,
        lease.snapshot
      )
    } catch (cleanupError) {
      void cleanupError
      console.warn(`Initialization lease could not be removed safely: ${path.basename(lease.root)}`)
    }
  }
}
