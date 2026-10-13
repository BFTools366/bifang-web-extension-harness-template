import { execFile } from "node:child_process"
import { lstat, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type {
  ParallelWorktreeUnit,
  ParallelWorktreeRegistry,
  ParallelWorktreeSelection,
  GitWorktreeIdentity,
  GitWorktreeRecord
} from "./parallel-types.ts"
import { unitKey, assertSlug, loadRegistry } from "./parallel-registry.ts"

/** 保存无需 Shell 的异步进程入口。 */
export const execFileAsync = promisify(execFile)

/** 运行 Git 并返回原始 stdout。 */
export async function git(
  root: string,
  args: string[],
  allowCodes: number[] = [0]
): Promise<string> {
  try {
    const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
    return result.stdout
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "number" && allowCodes.includes(code)) {
      return String((error as { stdout?: unknown }).stdout ?? "")
    }
    const detail = String((error as { stderr?: unknown }).stderr ?? "").trim()
    throw new Error(`git ${args.join(" ")} failed${detail === "" ? "" : `: ${detail}`}`, {
      cause: error
    })
  }
}

/** 查询祖先关系，并把 Git 的否定退出码与执行故障区分开。 */
export async function gitIsAncestor(
  root: string,
  ancestor: string,
  descendant: string
): Promise<boolean> {
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      encoding: "utf8"
    })
    return true
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return false
    const detail = String((error as { stderr?: unknown }).stderr ?? "").trim()
    throw new Error(`git merge-base --is-ancestor failed${detail === "" ? "" : `: ${detail}`}`, {
      cause: error
    })
  }
}

/** 解析非符号链接 Git 顶层与 common-dir。 */
export async function gitIdentity(rootInput: string): Promise<GitWorktreeIdentity> {
  const requested = path.resolve(rootInput)
  const status = await lstat(requested)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Git Worktree root must be a real directory: ${requested}`)
  }
  const topLevel = await realpath(requested)
  const reported = await realpath((await git(topLevel, ["rev-parse", "--show-toplevel"])).trim())
  if (reported !== topLevel) throw new Error(`Root must equal its Git top-level: ${topLevel}`)
  const commonRaw = (
    await git(topLevel, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  ).trim()
  return { topLevel, commonDir: await realpath(commonRaw) }
}

/** 解析 Git 登记中的全部 Worktree 记录并保留原始 porcelain 字段。 */
export async function registeredWorktrees(root: string): Promise<GitWorktreeRecord[]> {
  const output = await git(root, ["worktree", "list", "--porcelain"])
  if (output.trim() === "") return []
  return output
    .trimEnd()
    .split(/\r?\n\r?\n/u)
    .map((block) => {
      const record: Record<string, string | true> = {}
      for (const line of block.split(/\r?\n/u)) {
        const separator = line.indexOf(" ")
        const key = separator === -1 ? line : line.slice(0, separator)
        record[key] = separator === -1 ? true : line.slice(separator + 1)
      }
      if (typeof record.worktree !== "string") {
        throw new Error("Git Worktree porcelain record is missing its path")
      }
      return record as GitWorktreeRecord
    })
}

/** 解析用于身份比较的 Worktree 路径，缺失的 prunable 路径保持词法绝对值。 */
export async function comparableWorktreePath(worktreePath: string): Promise<string> {
  try {
    return await realpath(worktreePath)
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return path.resolve(worktreePath)
    throw error
  }
}

/** 要求保存项目身份精确对应 Git registry 的 primary Worktree。 */
export async function assertPrimaryWorktree(
  project: GitWorktreeIdentity
): Promise<GitWorktreeRecord[]> {
  const registered = await registeredWorktrees(project.topLevel)
  const primaryPath =
    registered[0] === undefined ? undefined : await comparableWorktreePath(registered[0].worktree)
  if (primaryPath !== project.topLevel) {
    throw new Error("Project root must be the repository primary Worktree")
  }
  return registered
}

/** 验证 primary、source、common-dir 和 registry 绑定。 */
export async function boundRepositories(
  projectRoot: string,
  sourceWorktree: string
): Promise<{ project: GitWorktreeIdentity; source: GitWorktreeIdentity }> {
  const [project, source] = await Promise.all([
    gitIdentity(projectRoot),
    gitIdentity(sourceWorktree)
  ])
  if (project.commonDir !== source.commonDir) {
    throw new Error("Project root and source Worktree must share one Git common-dir")
  }
  const registered = await assertPrimaryWorktree(project)
  const registeredPaths = await Promise.all(
    registered.map((record) => comparableWorktreePath(record.worktree))
  )
  if (!registeredPaths.includes(source.topLevel)) {
    throw new Error("Project root and source Worktree must both be registered Git Worktrees")
  }
  return { project, source }
}

/** 证明调用 cwd 与期望 Worktree 顶层相同。 */
export async function assertExecutionRoot(
  actual: string | undefined,
  expected: string
): Promise<void> {
  const executionRoot = await realpath(path.resolve(actual ?? process.cwd()))
  if (executionRoot !== expected)
    throw new Error(`Helper must run from exact Worktree: ${expected}`)
}

/** 校验独立 Task 分支，或复用并精确核对 Local 源的冻结分支。 */
export async function assertSourceBranch(
  sourceRoot: string,
  task: string,
  local = false,
  frozenBranch?: string
): Promise<string> {
  const actual = (
    await git(sourceRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1])
  ).trim()
  if (local && actual === "") throw new Error("Local source must use a named branch")
  const expected = local ? (frozenBranch ?? actual) : `codex/task-${task}`
  if (actual !== expected) throw new Error(`Source branch must equal ${expected}`)
  const registered = await registeredWorktrees(sourceRoot)
  const record = registered.find((candidate) => candidate.worktree === sourceRoot)
  if (record?.branch !== `refs/heads/${expected}`) {
    throw new Error(`Registered source Worktree branch must equal refs/heads/${expected}`)
  }
  return expected
}

/** 证明 Git Worktree 没有 staged、unstaged 或 untracked 修改。 */
export async function assertClean(root: string): Promise<void> {
  const status = await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  if (status !== "") throw new Error(`Git Worktree must be clean: ${root}`)
}

/** 解析 porcelain -z 并保留 rename/copy 两端路径。 */
export function porcelainPaths(output: string): string[] {
  const fields = output.split("\0")
  const paths: string[] = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? ""
    if (field === "") continue
    const status = field.slice(0, 2)
    paths.push(field.slice(3))
    if (/[RC]/u.test(status)) {
      const paired = fields[index + 1]
      if (paired !== undefined && paired !== "") paths.push(paired)
      index += 1
    }
  }
  return paths
}

/** 解析 name-status -z 并保留 rename/copy 两端路径。 */
export function nameStatusPaths(output: string): string[] {
  const fields = output.split("\0")
  const paths: string[] = []
  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index] ?? ""
    if (status === "") continue
    const first = fields[index + 1]
    if (first === undefined || first === "") throw new Error("Invalid Git name-status output")
    paths.push(first)
    index += 1
    if (status.startsWith("R") || status.startsWith("C")) {
      const second = fields[index + 1]
      if (second === undefined || second === "") throw new Error("Invalid Git rename output")
      paths.push(second)
      index += 1
    }
  }
  return paths
}

/** 判断路径是否位于登记所有权之内。 */
export function isOwned(relativePath: string, writeTargets: readonly string[]): boolean {
  const normalized = relativePath.split(path.sep).join("/")
  return writeTargets.some((target) => normalized === target || normalized.startsWith(`${target}/`))
}

/** 证明一组实际路径完全落在登记所有权内。 */
export function assertOwnedPaths(paths: readonly string[], record: ParallelWorktreeUnit): void {
  const escaped = paths.filter((candidate) => !isOwned(candidate, record.writeTargets))
  if (escaped.length > 0) {
    throw new Error(`Unit changed paths outside ownership: ${escaped.sort().join(", ")}`)
  }
}

/** 收集 base..HEAD 每次提交（含 merge、撤销）与未提交修改的全部路径。 */
export async function actualChangedPaths(record: ParallelWorktreeUnit): Promise<string[]> {
  await git(record.worktreePath, ["merge-base", "--is-ancestor", record.baseHead, "HEAD"])
  const [committed, pending] = await Promise.all([
    git(record.worktreePath, [
      "log",
      "--format=",
      "--name-status",
      "-z",
      "--find-renames",
      "--diff-merges=first-parent",
      `${record.baseHead}..HEAD`,
      "--"
    ]),
    git(record.worktreePath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  ])
  const paths = [...new Set([...nameStatusPaths(committed), ...porcelainPaths(pending)])].sort()
  assertOwnedPaths(paths, record)
  return paths
}

/** 加载并重新绑定精确单元、source 与 common-dir。 */
export async function boundUnit(options: ParallelWorktreeSelection): Promise<{
  repositories: { project: GitWorktreeIdentity; source: GitWorktreeIdentity }
  registry: ParallelWorktreeRegistry
  record: ParallelWorktreeUnit
}> {
  assertSlug(options.task, "task")
  assertSlug(options.unit, "unit")
  const repositories = await boundRepositories(options.projectRoot, options.sourceWorktree)
  const registry = await loadRegistry(repositories.project.commonDir)
  const record = registry.units[unitKey(options.task, options.unit)]
  if (record === undefined) throw new Error("Parallel Worktree unit is not registered")
  const local = repositories.source.topLevel === repositories.project.topLevel
  await assertSourceBranch(repositories.source.topLevel, options.task, local, record.sourceBranch)
  const expectedWorktreePath = path.join(
    path.dirname(repositories.project.topLevel),
    ".codex-worktrees",
    path.basename(repositories.project.topLevel),
    options.task,
    options.unit
  )
  if (
    record.sourceWorktree !== repositories.source.topLevel ||
    (record.sourceKind ?? "task-worktree") !== (local ? "local" : "task-worktree") ||
    record.task !== options.task ||
    record.unit !== options.unit ||
    record.worktreePath !== expectedWorktreePath
  ) {
    throw new Error("Parallel Worktree unit source binding has drifted")
  }
  if (!(await gitIsAncestor(repositories.source.topLevel, record.baseHead, "HEAD"))) {
    throw new Error("Parallel Worktree source baseline has drifted")
  }
  return { repositories, registry, record }
}

/** 判断候选路径是否严格位于一个受管目录内。 */
export function isNestedPath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate)
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}
