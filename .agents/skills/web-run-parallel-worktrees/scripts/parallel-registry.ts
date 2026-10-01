import { chmod, lstat, mkdir, open, readFile, rename, rmdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ParallelWorktreeRegistry } from "./parallel-types.ts"

/** 保存允许的技术 slug 格式。 */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
/** 保存 Git 对象标识的合法格式。 */
export const OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/u

/** 返回 helper 在 Git common-dir 中的私有登记路径。 */
export function registryPath(commonDir: string): string {
  return path.join(commonDir, "harness/parallel-worktrees.json")
}

/** 返回并发修改登记时使用的失败关闭锁目录。 */
export function registryLockPath(commonDir: string): string {
  return path.join(commonDir, "harness/parallel-worktrees.lock")
}

/** 返回 task/unit 的稳定登记键。 */
export function unitKey(task: string, unit: string): string {
  return `${task}:${unit}`
}

/** 校验一个稳定 ASCII slug。 */
export function assertSlug(value: string, label: string): void {
  if (!SLUG_PATTERN.test(value)) throw new Error(`${label} must be lowercase ASCII kebab-case`)
}

/** 规范化并校验一个 repo-relative 写入所有权。 */
export async function normalizeWriteTarget(root: string, value: string): Promise<string> {
  const rawSegments = value.split("/")
  if (
    value === "" ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    rawSegments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Write target must be a non-root POSIX repo-relative path: ${value}`)
  }
  let cursor = root
  for (const segment of rawSegments) {
    cursor = path.join(cursor, segment)
    const status = await lstat(cursor).catch((error: unknown) => {
      if ((error as { code?: unknown }).code === "ENOENT") return undefined
      throw error
    })
    if (status === undefined) break
    if (status.isSymbolicLink()) throw new Error(`Write target crosses a symbolic link: ${value}`)
  }
  return value
}

/** 判断两个所有权路径是否相同或具有祖先关系。 */
export function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/** 校验单元内部与活动单元之间不存在任何所有权重叠。 */
export function assertNonOverlappingTargets(
  targets: readonly string[],
  registry: ParallelWorktreeRegistry
): void {
  for (let left = 0; left < targets.length; left += 1) {
    for (let right = left + 1; right < targets.length; right += 1) {
      if (pathsOverlap(targets[left] ?? "", targets[right] ?? "")) {
        throw new Error("Write targets within one unit must not overlap")
      }
    }
  }
  for (const record of Object.values(registry.units)) {
    if (
      targets.some((target) => record.writeTargets.some((owned) => pathsOverlap(target, owned)))
    ) {
      throw new Error(`Write targets overlap active unit ${record.task}/${record.unit}`)
    }
  }
}

/** 校验 registry JSON 的完整 schema 与 common-dir 绑定。 */
export function validateRegistry(value: unknown, commonDir: string): ParallelWorktreeRegistry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Parallel Worktree registry must be an object")
  }
  const candidate = value as Partial<ParallelWorktreeRegistry>
  if (candidate.schemaVersion !== 1 || candidate.commonDir !== commonDir) {
    throw new Error("Parallel Worktree registry schema or common-dir is invalid")
  }
  if (
    candidate.units === null ||
    typeof candidate.units !== "object" ||
    Array.isArray(candidate.units)
  ) {
    throw new Error("Parallel Worktree registry units must be an object")
  }
  for (const [key, record] of Object.entries(candidate.units)) {
    if (
      record === null ||
      typeof record !== "object" ||
      key !== unitKey(record.task, record.unit) ||
      !SLUG_PATTERN.test(record.task) ||
      !SLUG_PATTERN.test(record.unit) ||
      !Array.isArray(record.writeTargets) ||
      record.writeTargets.length === 0 ||
      record.writeTargets.some(
        (target) =>
          typeof target !== "string" ||
          target === "" ||
          target === "." ||
          target.includes("\\") ||
          path.isAbsolute(target) ||
          path.posix.normalize(target) !== target ||
          target.startsWith("../")
      ) ||
      new Set(record.writeTargets).size !== record.writeTargets.length ||
      typeof record.sourceWorktree !== "string" ||
      !path.isAbsolute(record.sourceWorktree) ||
      typeof record.sourceBranch !== "string" ||
      record.sourceBranch !== `codex/task-${record.task}` ||
      typeof record.baseHead !== "string" ||
      !OBJECT_ID_PATTERN.test(record.baseHead) ||
      typeof record.branch !== "string" ||
      record.branch !== `codex/unit-${record.task}-${record.unit}` ||
      typeof record.worktreePath !== "string" ||
      !path.isAbsolute(record.worktreePath) ||
      !Number.isSafeInteger(record.expectedUnits) ||
      record.expectedUnits < 2 ||
      typeof record.createdAt !== "string" ||
      Number.isNaN(Date.parse(record.createdAt)) ||
      (record.verifiedHead !== undefined && !OBJECT_ID_PATTERN.test(record.verifiedHead))
    ) {
      throw new Error(`Parallel Worktree registry unit is invalid: ${key}`)
    }
    for (let left = 0; left < record.writeTargets.length; left += 1) {
      for (let right = left + 1; right < record.writeTargets.length; right += 1) {
        if (pathsOverlap(record.writeTargets[left] ?? "", record.writeTargets[right] ?? "")) {
          throw new Error(`Parallel Worktree registry ownership overlaps: ${key}`)
        }
      }
    }
  }
  const records = Object.values(candidate.units)
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      if (
        (records[left]?.writeTargets ?? []).some((leftTarget) =>
          (records[right]?.writeTargets ?? []).some((rightTarget) =>
            pathsOverlap(leftTarget, rightTarget)
          )
        )
      ) {
        throw new Error("Parallel Worktree registry contains overlapping active ownership")
      }
    }
  }
  return candidate as ParallelWorktreeRegistry
}

/** 建立或校验 Git common-dir 内的普通受管目录。 */
export async function ensureRegistryDirectory(commonDir: string): Promise<string> {
  const directory = path.dirname(registryPath(commonDir))
  const status = await lstat(directory).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (status?.isSymbolicLink() === true || (status !== undefined && !status.isDirectory())) {
    throw new Error("Parallel Worktree registry directory must be real")
  }
  if (status === undefined) {
    await mkdir(directory, { mode: 0o700 }).catch(async (error: unknown) => {
      if ((error as { code?: unknown }).code !== "EEXIST") throw error
      const raced = await lstat(directory)
      if (raced.isSymbolicLink() || !raced.isDirectory()) throw error
    })
  }
  return directory
}

/** 用原子目录锁串行化登记创建、验证与清理。 */
export async function withRegistryLock<T>(commonDir: string, action: () => Promise<T>): Promise<T> {
  await ensureRegistryDirectory(commonDir)
  const lockPath = registryLockPath(commonDir)
  try {
    await mkdir(lockPath, { mode: 0o700 })
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") {
      throw new Error(`Parallel Worktree registry is locked: ${lockPath}`, { cause: error })
    }
    throw error
  }
  try {
    return await action()
  } finally {
    await rmdir(lockPath).catch((error: unknown) => {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error
    })
  }
}

/** 只读加载登记；缺失时返回绑定当前 common-dir 的空集合。 */
export async function loadRegistry(commonDir: string): Promise<ParallelWorktreeRegistry> {
  const filePath = registryPath(commonDir)
  const status = await lstat(filePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (status === undefined) return { schemaVersion: 1, commonDir, units: {} }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error("Parallel Worktree registry must be a regular file")
  }
  return validateRegistry(JSON.parse(await readFile(filePath, "utf8")), commonDir)
}

/** 原子写入 0600 registry 并拒绝受管目录符号链接。 */
export async function writeRegistry(registry: ParallelWorktreeRegistry): Promise<void> {
  const filePath = registryPath(registry.commonDir)
  const directory = await ensureRegistryDirectory(registry.commonDir)
  const existing = await lstat(filePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (existing?.isSymbolicLink() === true || (existing !== undefined && !existing.isFile())) {
    throw new Error("Parallel Worktree registry must be a regular file")
  }
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    })
    const fileHandle = await open(temporary, "r")
    try {
      await fileHandle.sync()
    } finally {
      await fileHandle.close()
    }
    await rename(temporary, filePath)
    await chmod(filePath, 0o600)
    const directoryHandle = await open(directory, "r")
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}
