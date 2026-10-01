import type { Stats } from "node:fs"
import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, rmdir } from "node:fs/promises"
import path from "node:path"
import { lstatIfPresent } from "./files.ts"

/** 描述初始化开始时冻结的目标路径事实。 */
export type TargetSnapshot =
  | { kind: "absent" }
  | {
      kind: "empty-directory"
      device: number
      inode: number
      mode: number
    }

/** 描述初始化期间必须保持同一身份的真实目录。 */
export interface DirectorySnapshot {
  /** 保存设备编号。 */
  device: number
  /** 保存 inode 编号。 */
  inode: number
  /** 保存完整模式用于检测类型或权限漂移。 */
  mode: number
}

/** 描述首次目标写入前冻结的最近既有父目录与缺失目录链。 */
export interface TargetParentPlan {
  /** 保存最近既有的规范真实祖先。 */
  anchor: string
  /** 保存最近既有祖先的身份。 */
  anchorSnapshot: DirectorySnapshot
  /** 保存必须由本次初始化依次创建的规范目录。 */
  missingDirectories: string[]
}

/** 捕获规范真实目录的身份。 */
export async function captureDirectorySnapshot(
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
export async function captureTargetParentPlan(targetParent: string): Promise<TargetParentPlan> {
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
export async function prepareTargetParent(plan: TargetParentPlan): Promise<DirectorySnapshot> {
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
export async function acquireInitializationLease(
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
export async function releaseInitializationLease(
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
export async function captureTargetSnapshot(targetRoot: string): Promise<TargetSnapshot> {
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
export async function canonicalizeTarget(targetRoot: string): Promise<string> {
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
export async function commitStagedProject(
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
export async function cleanupStagingRoot(
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
