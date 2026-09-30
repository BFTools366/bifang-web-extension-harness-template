import type { Stats } from "node:fs"
import { execFile } from "node:child_process"
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  rmdir
} from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { checkCommitConfiguration } from "../../.agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"
import { normalizeAgentPolicy } from "./agent-policy.ts"
import { createProjectConfig, INSTANTIATION_ONLY_EXCLUDED_PATHS } from "./config.ts"
import { ENVIRONMENT_FILES, FORBIDDEN_ENVIRONMENT_FILES, validateBaseUrls } from "./environment.ts"
import { initializeProject } from "./init.ts"
import { lstatIfPresent, pathExists } from "./files.ts"
import { createLogo } from "./logo.ts"
import {
  assertTemplateSnapshotUnchanged,
  captureTemplateSnapshot,
  copyTemplateSnapshot
} from "./source-snapshot.ts"
import type { InitOptions, InstantiateOptions, ProjectConfig } from "./types.ts"

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
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/** 描述初始化开始时冻结的目标路径事实。 */
type TargetSnapshot =
  | { kind: "absent" }
  | {
      kind: "empty-directory"
      device: number
      inode: number
      mode: number
    }

/** 描述初始化期间必须保持同一身份的真实目录。 */
interface DirectorySnapshot {
  /** 保存设备编号。 */
  device: number
  /** 保存 inode 编号。 */
  inode: number
  /** 保存完整模式用于检测类型或权限漂移。 */
  mode: number
}

/** 描述首次目标写入前冻结的最近既有父目录与缺失目录链。 */
interface TargetParentPlan {
  /** 保存最近既有的规范真实祖先。 */
  anchor: string
  /** 保存最近既有祖先的身份。 */
  anchorSnapshot: DirectorySnapshot
  /** 保存必须由本次初始化依次创建的规范目录。 */
  missingDirectories: string[]
}

/** 捕获规范真实目录的身份。 */
async function captureDirectorySnapshot(
  directory: string,
  label: string
): Promise<DirectorySnapshot> {
  const status = await lstat(directory)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`)
  }
  if ((await realpath(directory)) !== path.resolve(directory)) {
    throw new Error(`${label} must use its canonical path: ${directory}`)
  }
  return { device: status.dev, inode: status.ino, mode: status.mode }
}

/** 复核真实目录仍由同一设备、inode 与模式表示。 */
async function assertDirectorySnapshotUnchanged(
  directory: string,
  snapshot: DirectorySnapshot,
  label: string
): Promise<void> {
  const status = await lstatIfPresent(directory)
  if (
    status === undefined ||
    status.isSymbolicLink() ||
    !status.isDirectory() ||
    status.dev !== snapshot.device ||
    status.ino !== snapshot.inode ||
    status.mode !== snapshot.mode ||
    (await realpath(directory)) !== path.resolve(directory)
  ) {
    throw new Error(`${label} changed while project initialization was running: ${directory}`)
  }
}

/** 在任何目标写入前冻结最近既有父目录和缺失链。 */
async function captureTargetParentPlan(targetParent: string): Promise<TargetParentPlan> {
  const missingDirectories: string[] = []
  let anchor = targetParent
  while ((await lstatIfPresent(anchor)) === undefined) {
    missingDirectories.unshift(anchor)
    const next = path.dirname(anchor)
    if (next === anchor) throw new Error(`Cannot resolve target parent: ${targetParent}`)
    anchor = next
  }
  return {
    anchor,
    anchorSnapshot: await captureDirectorySnapshot(anchor, "Target parent anchor"),
    missingDirectories
  }
}

/** 复核冻结祖先并独占创建仍然缺失的父目录链。 */
async function prepareTargetParent(plan: TargetParentPlan): Promise<DirectorySnapshot> {
  await assertDirectorySnapshotUnchanged(plan.anchor, plan.anchorSnapshot, "Target parent anchor")
  let current = plan.anchor
  let currentSnapshot = plan.anchorSnapshot
  for (const missingDirectory of plan.missingDirectories) {
    await assertDirectorySnapshotUnchanged(current, currentSnapshot, "Target parent ancestor")
    try {
      await mkdir(missingDirectory)
    } catch (error) {
      if ((error as { code?: unknown }).code === "EEXIST") {
        throw new Error(
          `Target parent path appeared while project initialization was running: ${missingDirectory}`,
          { cause: error }
        )
      }
      throw error
    }
    await assertDirectorySnapshotUnchanged(current, currentSnapshot, "Target parent ancestor")
    current = missingDirectory
    currentSnapshot = await captureDirectorySnapshot(current, "Created target parent")
  }
  return currentSnapshot
}

/** 创建仅约束合作 Harness 进程的 sibling 初始化租约。 */
async function acquireInitializationLease(
  targetParent: string,
  targetName: string,
  targetParentSnapshot: DirectorySnapshot
): Promise<{ root: string; snapshot: DirectorySnapshot }> {
  const root = path.join(targetParent, `.${targetName}.harness-init.lock`)
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  try {
    await mkdir(root, { mode: 0o700 })
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") {
      throw new Error(`Another Harness initialization already owns target: ${targetName}`, {
        cause: error
      })
    }
    throw error
  }
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  return { root, snapshot: await captureDirectorySnapshot(root, "Initialization lease") }
}

/** 只回收仍由当前进程精确绑定的初始化租约。 */
async function releaseInitializationLease(
  targetParent: string,
  targetParentSnapshot: DirectorySnapshot,
  leaseRoot: string,
  leaseSnapshot: DirectorySnapshot
): Promise<void> {
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  await assertDirectorySnapshotUnchanged(leaseRoot, leaseSnapshot, "Initialization lease")
  await rmdir(leaseRoot)
}

// 执行 assertEmptyDirectory 函数的处理逻辑。
async function assertEmptyDirectory(targetRoot: string, targetStat: Stats): Promise<void> {
  if (targetStat.isSymbolicLink())
    throw new Error(`Target must not be a symbolic link: ${targetRoot}`)
  if (!targetStat.isDirectory()) throw new Error(`Target is not a directory: ${targetRoot}`)
  // 保存 entries 变量供当前逻辑使用。
  const entries = await readdir(targetRoot)
  if (entries.length > 0) throw new Error(`Target directory must be empty: ${targetRoot}`)
}

// 执行 captureTargetSnapshot 函数的处理逻辑。
async function captureTargetSnapshot(targetRoot: string): Promise<TargetSnapshot> {
  // 保存 targetStat 变量供当前逻辑使用。
  const targetStat = await lstatIfPresent(targetRoot)
  if (targetStat === undefined) return { kind: "absent" }
  await assertEmptyDirectory(targetRoot, targetStat)
  return {
    kind: "empty-directory",
    device: targetStat.dev,
    inode: targetStat.ino,
    mode: targetStat.mode
  }
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

// 执行 assertTargetUnchanged 函数的处理逻辑。
async function assertTargetUnchanged(
  targetRoot: string,
  targetSnapshot: TargetSnapshot
): Promise<void> {
  // 保存 targetStat 变量供当前逻辑使用。
  const targetStat = await lstatIfPresent(targetRoot)
  if (targetSnapshot.kind === "absent") {
    if (targetStat !== undefined) {
      throw new Error(`Target appeared while project initialization was running: ${targetRoot}`)
    }
    return
  }
  if (targetStat === undefined) {
    throw new Error(`Target disappeared while project initialization was running: ${targetRoot}`)
  }
  if (
    targetStat.isSymbolicLink() ||
    !targetStat.isDirectory() ||
    targetStat.dev !== targetSnapshot.device ||
    targetStat.ino !== targetSnapshot.inode ||
    targetStat.mode !== targetSnapshot.mode
  ) {
    throw new Error(`Target changed while project initialization was running: ${targetRoot}`)
  }
  await assertEmptyDirectory(targetRoot, targetStat)
}

/** 在 rename 提交点后给身份异常提供明确的已发布语义。 */
async function verifyPublishedProject(
  targetParent: string,
  targetRoot: string,
  targetParentSnapshot: DirectorySnapshot,
  stagingSnapshot: DirectorySnapshot
): Promise<void> {
  try {
    await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
    await assertDirectorySnapshotUnchanged(targetRoot, stagingSnapshot, "Published project")
  } catch (error) {
    throw new Error(
      `Project rename reached its commit point, but post-publication identity verification failed: ${path.basename(targetRoot)}`,
      { cause: error }
    )
  }
}

// 执行 commitStagedProject 函数的处理逻辑。
async function commitStagedProject(
  stagingRoot: string,
  targetRoot: string,
  targetSnapshot: TargetSnapshot,
  targetParentSnapshot: DirectorySnapshot,
  stagingSnapshot: DirectorySnapshot
): Promise<void> {
  const targetParent = path.dirname(targetRoot)
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  await assertDirectorySnapshotUnchanged(stagingRoot, stagingSnapshot, "Staging directory")
  await assertTargetUnchanged(targetRoot, targetSnapshot)
  if (targetSnapshot.kind === "absent") {
    await rename(stagingRoot, targetRoot)
    await verifyPublishedProject(targetParent, targetRoot, targetParentSnapshot, stagingSnapshot)
    return
  }

  // 保存 targetHoldingPrefix 变量，将待删除对象放入随机 sibling 目录再复核身份。
  const targetHoldingPrefix = `.${path.basename(targetRoot)}.harness-target-`
  // 保存 targetHoldingRoot 变量供当前逻辑使用。
  const targetHoldingRoot = await mkdtemp(path.join(path.dirname(targetRoot), targetHoldingPrefix))
  // 保存 targetHoldingSnapshot 变量，绑定只允许容纳原空目录的私有隔离根。
  const targetHoldingSnapshot = await captureDirectorySnapshot(
    targetHoldingRoot,
    "Target holding directory"
  )
  // 保存 heldTargetRoot 变量供当前逻辑使用。
  const heldTargetRoot = path.join(targetHoldingRoot, "empty-target")
  // 保存 targetWasHeld 变量，避免错误清理未精确绑定的目录。
  let targetWasHeld = false
  try {
    await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
    await assertDirectorySnapshotUnchanged(
      targetHoldingRoot,
      targetHoldingSnapshot,
      "Target holding directory"
    )
    await rename(targetRoot, heldTargetRoot)
    targetWasHeld = true
    await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
    await assertDirectorySnapshotUnchanged(
      targetHoldingRoot,
      targetHoldingSnapshot,
      "Target holding directory"
    )
    await assertTargetUnchanged(heldTargetRoot, targetSnapshot)
    await assertTargetUnchanged(targetRoot, { kind: "absent" })
    await assertDirectorySnapshotUnchanged(stagingRoot, stagingSnapshot, "Staging directory")
    await rename(stagingRoot, targetRoot)
  } catch (error) {
    // 保存 restoreErrors 变量，同时保留发布失败与目标恢复失败的事实。
    const restoreErrors: unknown[] = []
    if (targetWasHeld) {
      try {
        await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
        await assertDirectorySnapshotUnchanged(
          targetHoldingRoot,
          targetHoldingSnapshot,
          "Target holding directory"
        )
        if ((await lstatIfPresent(targetRoot)) !== undefined) {
          throw new Error(
            `Refusing to overwrite a target that appeared during rollback: ${targetRoot}`,
            { cause: error }
          )
        }
        await rename(heldTargetRoot, targetRoot)
        await rmdir(targetHoldingRoot)
      } catch (restoreError) {
        restoreErrors.push(restoreError)
      }
    } else {
      try {
        await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
        await assertDirectorySnapshotUnchanged(
          targetHoldingRoot,
          targetHoldingSnapshot,
          "Target holding directory"
        )
        await rmdir(targetHoldingRoot)
      } catch (cleanupError) {
        restoreErrors.push(cleanupError)
      }
    }
    if (restoreErrors.length > 0) {
      throw new AggregateError(
        [error, ...restoreErrors],
        `Failed to commit staged project and restore empty target: ${targetRoot}`,
        { cause: error }
      )
    }
    throw error
  }

  await verifyPublishedProject(targetParent, targetRoot, targetParentSnapshot, stagingSnapshot)
  try {
    await assertDirectorySnapshotUnchanged(
      targetHoldingRoot,
      targetHoldingSnapshot,
      "Target holding directory"
    )
    await assertTargetUnchanged(heldTargetRoot, targetSnapshot)
    await rmdir(heldTargetRoot)
    targetWasHeld = false
    await rmdir(targetHoldingRoot)
  } catch (cleanupError) {
    void cleanupError
    console.warn(
      `Project was published, but its bound empty-target holding directory could not be removed: ${path.basename(targetHoldingRoot)}`
    )
  }
}

// 执行 cleanupStagingRoot 函数的处理逻辑。
async function cleanupStagingRoot(
  stagingRoot: string,
  targetParent: string,
  stagingPrefix: string,
  targetParentSnapshot: DirectorySnapshot,
  stagingSnapshot: DirectorySnapshot
): Promise<void> {
  if (
    path.dirname(stagingRoot) !== targetParent ||
    !path.basename(stagingRoot).startsWith(stagingPrefix)
  ) {
    throw new Error(`Refusing to clean an unexpected staging path: ${stagingRoot}`)
  }
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  if ((await lstatIfPresent(stagingRoot)) === undefined) return
  await assertDirectorySnapshotUnchanged(stagingRoot, stagingSnapshot, "Staging directory")
  // 保存 cleanupPrefix 变量，将递归删除限制在随机私有 holding 内。
  const cleanupPrefix = stagingPrefix.replace(".harness-stage-", ".harness-cleanup-")
  // 保存 cleanupRoot 变量供当前逻辑使用。
  const cleanupRoot = await mkdtemp(path.join(targetParent, cleanupPrefix))
  // 保存 cleanupSnapshot 变量，确保 holding 本身未被替换。
  const cleanupSnapshot = await captureDirectorySnapshot(cleanupRoot, "Staging cleanup directory")
  // 保存 heldStagingRoot 变量供当前逻辑使用。
  const heldStagingRoot = path.join(cleanupRoot, "staging")
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  await assertDirectorySnapshotUnchanged(cleanupRoot, cleanupSnapshot, "Staging cleanup directory")
  await assertDirectorySnapshotUnchanged(stagingRoot, stagingSnapshot, "Staging directory")
  await rename(stagingRoot, heldStagingRoot)
  await assertDirectorySnapshotUnchanged(targetParent, targetParentSnapshot, "Target parent")
  await assertDirectorySnapshotUnchanged(cleanupRoot, cleanupSnapshot, "Staging cleanup directory")
  await assertDirectorySnapshotUnchanged(heldStagingRoot, stagingSnapshot, "Held staging directory")
  await rm(heldStagingRoot, { recursive: true, force: true })
  await rmdir(cleanupRoot)
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
