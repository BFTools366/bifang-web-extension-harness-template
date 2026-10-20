import { access, lstat, readdir, realpath, stat } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import type { PromptDefaults } from "./initialization-input.ts"

/** 只读解析不存在路径的最近真实祖先，得到用于确认的规范目标。 */
export async function canonicalizeProspectiveTarget(targetRoot: string): Promise<string> {
  let cursor = path.resolve(targetRoot)
  const missingNames: string[] = []
  while (true) {
    try {
      const existingRoot = await realpath(cursor)
      return path.join(existingRoot, ...missingNames.reverse())
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) throw error
      missingNames.push(path.basename(cursor))
      cursor = parent
    }
  }
}

/** 只读核对父目录最近的真实祖先可访问且可创建子目录，不提前创建任何目录。 */
export async function validateParentAccess(parentRoot: string): Promise<void> {
  let cursor = parentRoot
  while (true) {
    try {
      if (!(await stat(cursor)).isDirectory()) throw new Error(`父路径不是目录：${cursor}`)
      await access(cursor, constants.R_OK | constants.W_OK | constants.X_OK)
      return
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) throw error
      cursor = parent
    }
  }
}

/** 在最终汇总前只读验证目标名称、位置、类型与空目录约束。 */
export async function preflightConfirmedTarget(
  targetRoot: string,
  canonicalTargetRoot: string,
  canonicalSourceRoot: string,
  projectId: string
): Promise<void> {
  if (path.basename(targetRoot) !== projectId) {
    throw new Error(`Target directory name must exactly match project id "${projectId}"`)
  }
  const relativeToSource = path.relative(canonicalSourceRoot, canonicalTargetRoot)
  if (
    relativeToSource === "" ||
    (relativeToSource !== ".." &&
      !relativeToSource.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeToSource))
  ) {
    throw new Error("Target must be outside the Harness template directory")
  }
  try {
    const status = await lstat(targetRoot)
    if (status.isSymbolicLink())
      throw new Error(`Target must not be a symbolic link: ${targetRoot}`)
    if (!status.isDirectory()) throw new Error(`Target is not a directory: ${targetRoot}`)
    if ((await readdir(targetRoot)).length > 0) {
      throw new Error(`Target directory must be empty: ${targetRoot}`)
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error
  }
}

/** 在表单阶段复用事务前的源外位置与空目标检查，不产生目录。 */
export async function validateInitializationTarget(
  sourceRoot: string,
  values: PromptDefaults
): Promise<void> {
  if (!values.targetRoot || !values.id) return
  await validateParentAccess(values.targetRoot)
  const target = path.join(values.targetRoot, values.id)
  await preflightConfirmedTarget(
    target,
    await canonicalizeProspectiveTarget(target),
    await realpath(sourceRoot),
    values.id
  )
}
