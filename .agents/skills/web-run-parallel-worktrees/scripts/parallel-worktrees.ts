import { execFile } from "node:child_process"
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rmdir,
  rm,
  writeFile
} from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

/** 枚举并行 Worktree helper 支持的命令。 */
export type ParallelWorktreeCommand = "inspect" | "create" | "guard" | "verify" | "remove"

/** 描述单个登记的并行写入单元。 */
export interface ParallelWorktreeUnit {
  task: string
  unit: string
  sourceWorktree: string
  worktreePath: string
  sourceBranch: string
  branch: string
  baseHead: string
  writeTargets: string[]
  expectedUnits: number
  createdAt: string
  verifiedHead?: string
}

/** 描述 Git common-dir 中的 helper 私有登记。 */
export interface ParallelWorktreeRegistry {
  schemaVersion: 1
  commonDir: string
  units: Record<string, ParallelWorktreeUnit>
}

/** 描述 guard/verify/remove 共用的单元选择。 */
export interface ParallelWorktreeSelection {
  projectRoot: string
  sourceWorktree: string
  task: string
  unit: string
  executionRoot?: string
}

/** 描述 create 命令所需的全部授权和身份。 */
export interface CreateParallelWorktreeOptions extends ParallelWorktreeSelection {
  writeTargets: string[]
  expectedUnits: number
  userRequested: boolean
  policy: "enabled" | "disabled"
}

/** 描述 guard 附加的意图路径。 */
export type GuardParallelWorktreeOptions = ParallelWorktreeSelection & { writeTargets: string[] }

/** 描述保守清理所需的精确整合 ref。 */
export type RemoveParallelWorktreeOptions = ParallelWorktreeSelection & { integratedInto: string }

/** 描述规范化 Git Worktree 与 common-dir。 */
interface GitWorktreeIdentity {
  topLevel: string
  commonDir: string
}

/** 描述 Git porcelain 中登记的单个 Worktree，并保留 Git 返回的全部字段。 */
export interface GitWorktreeRecord {
  worktree: string
  branch?: string
  prunable?: string | true
  [key: string]: string | true | undefined
}

/** 枚举 helper 登记无法与可用 Git Worktree 精确对应的原因。 */
type StaleReason = "missing_git_worktree" | "branch_mismatch" | "prunable_git_worktree"

/** 描述严格 CLI 解析结果。 */
interface CliOptions {
  command: ParallelWorktreeCommand
  values: Map<string, string>
  writeTargets: string[]
  userRequested: boolean
}

/** 描述单个子命令允许接受的 CLI 选项集合。 */
type CliOptionRule = Record<"values" | "repeated" | "booleans", readonly string[]>

/** 表示调用方提供了不符合稳定 CLI 契约的参数。 */
class CliInputError extends Error {
  readonly code = "cli_usage_invalid"
}

/** 保存无需 Shell 的异步进程入口。 */
const execFileAsync = promisify(execFile)
/** 保存允许的技术 slug 格式。 */
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
/** 保存 Git 对象标识的合法格式。 */
const OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/u
/** 保存每个子命令精确允许的选项，避免无关 flag 被静默忽略。 */
const CLI_OPTION_RULES: Record<ParallelWorktreeCommand, CliOptionRule> = {
  inspect: { values: ["project-root"], repeated: [], booleans: [] },
  create: {
    values: ["project-root", "source-worktree", "task", "unit", "expected-units", "policy"],
    repeated: ["write-target"],
    booleans: ["user-requested"]
  },
  guard: {
    values: ["project-root", "source-worktree", "task", "unit"],
    repeated: ["write-target"],
    booleans: []
  },
  verify: {
    values: ["project-root", "source-worktree", "task", "unit"],
    repeated: [],
    booleans: []
  },
  remove: {
    values: ["project-root", "source-worktree", "task", "unit", "integrated-into"],
    repeated: [],
    booleans: []
  }
}

/** 运行 Git 并返回原始 stdout。 */
async function git(root: string, args: string[], allowCodes: number[] = [0]): Promise<string> {
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
async function gitIsAncestor(root: string, ancestor: string, descendant: string): Promise<boolean> {
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
async function gitIdentity(rootInput: string): Promise<GitWorktreeIdentity> {
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
async function registeredWorktrees(root: string): Promise<GitWorktreeRecord[]> {
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
async function comparableWorktreePath(worktreePath: string): Promise<string> {
  try {
    return await realpath(worktreePath)
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return path.resolve(worktreePath)
    throw error
  }
}

/** 要求保存项目身份精确对应 Git registry 的 primary Worktree。 */
async function assertPrimaryWorktree(project: GitWorktreeIdentity): Promise<GitWorktreeRecord[]> {
  const registered = await registeredWorktrees(project.topLevel)
  const primaryPath =
    registered[0] === undefined ? undefined : await comparableWorktreePath(registered[0].worktree)
  if (primaryPath !== project.topLevel) {
    throw new Error("Project root must be the repository primary Worktree")
  }
  return registered
}

/** 验证 primary、source、common-dir 和 registry 绑定。 */
async function boundRepositories(
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
  if (source.topLevel === project.topLevel) {
    throw new Error("Source Worktree must be an independent left-side Task Worktree")
  }
  const registeredPaths = await Promise.all(
    registered.map((record) => comparableWorktreePath(record.worktree))
  )
  if (!registeredPaths.includes(source.topLevel)) {
    throw new Error("Project root and source Worktree must both be registered Git Worktrees")
  }
  return { project, source }
}

/** 返回 helper 在 Git common-dir 中的私有登记路径。 */
function registryPath(commonDir: string): string {
  return path.join(commonDir, "harness/parallel-worktrees.json")
}

/** 返回并发修改登记时使用的失败关闭锁目录。 */
function registryLockPath(commonDir: string): string {
  return path.join(commonDir, "harness/parallel-worktrees.lock")
}

/** 返回 task/unit 的稳定登记键。 */
function unitKey(task: string, unit: string): string {
  return `${task}:${unit}`
}

/** 校验一个稳定 ASCII slug。 */
function assertSlug(value: string, label: string): void {
  if (!SLUG_PATTERN.test(value)) throw new Error(`${label} must be lowercase ASCII kebab-case`)
}

/** 规范化并校验一个 repo-relative 写入所有权。 */
async function normalizeWriteTarget(root: string, value: string): Promise<string> {
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
function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/** 校验单元内部与活动单元之间不存在任何所有权重叠。 */
function assertNonOverlappingTargets(
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
function validateRegistry(value: unknown, commonDir: string): ParallelWorktreeRegistry {
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
async function ensureRegistryDirectory(commonDir: string): Promise<string> {
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
async function withRegistryLock<T>(commonDir: string, action: () => Promise<T>): Promise<T> {
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
async function loadRegistry(commonDir: string): Promise<ParallelWorktreeRegistry> {
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
async function writeRegistry(registry: ParallelWorktreeRegistry): Promise<void> {
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

/** 证明调用 cwd 与期望 Worktree 顶层相同。 */
async function assertExecutionRoot(actual: string | undefined, expected: string): Promise<void> {
  const executionRoot = await realpath(path.resolve(actual ?? process.cwd()))
  if (executionRoot !== expected)
    throw new Error(`Helper must run from exact Worktree: ${expected}`)
}

/** 返回 source 当前分支并要求是父 Task 技术分支。 */
async function assertSourceBranch(sourceRoot: string, task: string): Promise<string> {
  const expected = `codex/task-${task}`
  const actual = (
    await git(sourceRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1])
  ).trim()
  if (actual !== expected) throw new Error(`Source branch must equal ${expected}`)
  const registered = await registeredWorktrees(sourceRoot)
  const record = registered.find((candidate) => candidate.worktree === sourceRoot)
  if (record?.branch !== `refs/heads/${expected}`) {
    throw new Error(`Registered source Worktree branch must equal refs/heads/${expected}`)
  }
  return expected
}

/** 证明 Git Worktree 没有 staged、unstaged 或 untracked 修改。 */
async function assertClean(root: string): Promise<void> {
  const status = await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  if (status !== "") throw new Error(`Git Worktree must be clean: ${root}`)
}

/** 解析 porcelain -z 并保留 rename/copy 两端路径。 */
function porcelainPaths(output: string): string[] {
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
function nameStatusPaths(output: string): string[] {
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
function isOwned(relativePath: string, writeTargets: readonly string[]): boolean {
  const normalized = relativePath.split(path.sep).join("/")
  return writeTargets.some((target) => normalized === target || normalized.startsWith(`${target}/`))
}

/** 证明一组实际路径完全落在登记所有权内。 */
function assertOwnedPaths(paths: readonly string[], record: ParallelWorktreeUnit): void {
  const escaped = paths.filter((candidate) => !isOwned(candidate, record.writeTargets))
  if (escaped.length > 0) {
    throw new Error(`Unit changed paths outside ownership: ${escaped.sort().join(", ")}`)
  }
}

/** 收集 base..HEAD 与 staged、unstaged、untracked 的全部实际路径。 */
async function actualChangedPaths(record: ParallelWorktreeUnit): Promise<string[]> {
  await git(record.worktreePath, ["merge-base", "--is-ancestor", record.baseHead, "HEAD"])
  const [committed, pending] = await Promise.all([
    git(record.worktreePath, [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
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
async function boundUnit(options: ParallelWorktreeSelection): Promise<{
  repositories: { project: GitWorktreeIdentity; source: GitWorktreeIdentity }
  registry: ParallelWorktreeRegistry
  record: ParallelWorktreeUnit
}> {
  assertSlug(options.task, "task")
  assertSlug(options.unit, "unit")
  const repositories = await boundRepositories(options.projectRoot, options.sourceWorktree)
  await assertSourceBranch(repositories.source.topLevel, options.task)
  const registry = await loadRegistry(repositories.project.commonDir)
  const record = registry.units[unitKey(options.task, options.unit)]
  if (record === undefined) throw new Error("Parallel Worktree unit is not registered")
  const expectedWorktreePath = path.join(
    path.dirname(repositories.project.topLevel),
    ".codex-worktrees",
    path.basename(repositories.project.topLevel),
    options.task,
    options.unit
  )
  if (
    record.sourceWorktree !== repositories.source.topLevel ||
    record.sourceBranch !== `codex/task-${options.task}` ||
    record.task !== options.task ||
    record.unit !== options.unit ||
    record.worktreePath !== expectedWorktreePath
  ) {
    throw new Error("Parallel Worktree unit source binding has drifted")
  }
  return { repositories, registry, record }
}

/** 判断候选路径是否严格位于一个受管目录内。 */
function isNestedPath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate)
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

/** 只读列出 primary 状态、全部 Git Worktree、helper 登记及二者失配。 */
export async function inspectParallelWorktrees(projectRoot: string, executionRoot?: string) {
  const identity = await gitIdentity(projectRoot)
  const worktrees = await assertPrimaryWorktree(identity)
  await assertExecutionRoot(executionRoot, identity.topLevel)
  const registry = await loadRegistry(identity.commonDir)
  const units = Object.values(registry.units).sort((left, right) =>
    unitKey(left.task, left.unit).localeCompare(unitKey(right.task, right.unit))
  )
  const comparablePaths = await Promise.all(
    worktrees.map((record) => comparableWorktreePath(record.worktree))
  )
  const worktreeIndexes = new Map(comparablePaths.map((candidate, index) => [candidate, index]))
  const matchedWorktreeIndexes = new Set<number>()
  const staleUnits: Array<{
    unit: ParallelWorktreeUnit
    reasons: StaleReason[]
    gitWorktree?: GitWorktreeRecord
  }> = []
  for (const unit of units) {
    const samePathIndex = worktreeIndexes.get(unit.worktreePath)
    const gitWorktree = samePathIndex === undefined ? undefined : worktrees[samePathIndex]
    const exact = gitWorktree?.branch === `refs/heads/${unit.branch}`
    const reasons: StaleReason[] = []
    if (gitWorktree === undefined) reasons.push("missing_git_worktree")
    else if (!exact) reasons.push("branch_mismatch")
    if (gitWorktree?.prunable !== undefined) reasons.push("prunable_git_worktree")
    if (samePathIndex !== undefined) matchedWorktreeIndexes.add(samePathIndex)
    if (reasons.length > 0) {
      staleUnits.push({ unit, reasons, ...(gitWorktree === undefined ? {} : { gitWorktree }) })
    }
  }
  const projectName = path.basename(identity.topLevel)
  const managedRoot = path.resolve(identity.topLevel, "../.codex-worktrees", projectName)
  const orphanWorktrees = worktrees.filter(
    (record, index) =>
      !matchedWorktreeIndexes.has(index) &&
      isNestedPath(managedRoot, comparablePaths[index] ?? "") &&
      record.branch?.startsWith("refs/heads/codex/unit-") === true
  )
  const [status, headValue, branchValue] = await Promise.all([
    git(identity.topLevel, ["status", "--porcelain=v1", "--untracked-files=all"]),
    git(identity.topLevel, ["rev-parse", "--verify", "HEAD"], [0, 128]),
    git(identity.topLevel, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1])
  ])
  return {
    projectRoot: identity.topLevel,
    commonDir: identity.commonDir,
    clean: status.trim() === "",
    branch: branchValue.trim() || null,
    head: headValue.trim() || null,
    worktrees,
    units,
    orphanWorktrees,
    staleUnits
  }
}

/** 从干净 Task HEAD 创建并登记一个不重叠写入单元。 */
export async function createParallelWorktree(
  options: CreateParallelWorktreeOptions
): Promise<ParallelWorktreeUnit> {
  if (!options.userRequested || options.policy !== "enabled") {
    throw new Error("Parallel create requires current user request AND enabled project policy")
  }
  if (!Number.isSafeInteger(options.expectedUnits) || options.expectedUnits < 2) {
    throw new Error("Parallel create requires at least two expected units")
  }
  assertSlug(options.task, "task")
  assertSlug(options.unit, "unit")
  const repositories = await boundRepositories(options.projectRoot, options.sourceWorktree)
  await assertExecutionRoot(options.executionRoot, repositories.source.topLevel)
  const sourceBranch = await assertSourceBranch(repositories.source.topLevel, options.task)
  await assertClean(repositories.source.topLevel)
  const baseHead = (await git(repositories.source.topLevel, ["rev-parse", "HEAD"])).trim()
  const writeTargets = [
    ...new Set(
      await Promise.all(
        options.writeTargets.map((target) =>
          normalizeWriteTarget(repositories.source.topLevel, target)
        )
      )
    )
  ].sort()
  if (writeTargets.length === 0) throw new Error("Parallel unit requires write targets")
  return withRegistryLock(repositories.project.commonDir, async () => {
    const registry = await loadRegistry(repositories.project.commonDir)
    const key = unitKey(options.task, options.unit)
    if (registry.units[key] !== undefined)
      throw new Error("Parallel Worktree unit is already registered")
    const taskUnits = Object.values(registry.units).filter((record) => record.task === options.task)
    if (
      taskUnits.some(
        (record) => record.baseHead !== baseHead || record.expectedUnits !== options.expectedUnits
      )
    ) {
      throw new Error("Parallel Worktree task batch baseline has drifted")
    }
    if (taskUnits.length >= options.expectedUnits)
      throw new Error("Parallel Worktree batch is full")
    assertNonOverlappingTargets(writeTargets, registry)
    const branch = `codex/unit-${options.task}-${options.unit}`
    const branchExists = await execFileAsync(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { cwd: repositories.source.topLevel, encoding: "utf8" }
    ).then(
      () => true,
      (error: unknown) => {
        if ((error as { code?: unknown }).code === 1) return false
        throw error
      }
    )
    if (branchExists) throw new Error(`Parallel unit branch already exists: ${branch}`)
    const anchor = path.join(path.dirname(repositories.project.topLevel), ".codex-worktrees")
    const projectContainer = path.join(anchor, path.basename(repositories.project.topLevel))
    const container = path.join(projectContainer, options.task)
    for (const [directory, label] of [
      [anchor, "Parallel Worktree root"],
      [projectContainer, "Parallel Worktree project container"],
      [container, "Parallel Worktree task container"]
    ] as const) {
      const status = await lstat(directory).catch((error: unknown) => {
        if ((error as { code?: unknown }).code === "ENOENT") return undefined
        throw error
      })
      if (status?.isSymbolicLink() === true || (status !== undefined && !status.isDirectory())) {
        throw new Error(`${label} must be a real directory`)
      }
      if (status === undefined) await mkdir(directory)
    }
    const worktreePath = path.join(container, options.unit)
    if (
      (await lstat(worktreePath).catch((error: unknown) => {
        if ((error as { code?: unknown }).code === "ENOENT") return undefined
        throw error
      })) !== undefined
    ) {
      throw new Error(`Parallel Worktree path already exists: ${worktreePath}`)
    }
    await git(repositories.source.topLevel, [
      "worktree",
      "add",
      worktreePath,
      "-b",
      branch,
      baseHead
    ])
    const record: ParallelWorktreeUnit = {
      task: options.task,
      unit: options.unit,
      sourceWorktree: repositories.source.topLevel,
      worktreePath: await realpath(worktreePath),
      sourceBranch,
      branch,
      baseHead,
      writeTargets,
      expectedUnits: options.expectedUnits,
      createdAt: new Date().toISOString()
    }
    registry.units[key] = record
    try {
      await writeRegistry(registry)
    } catch (error) {
      const rollbackErrors: unknown[] = []
      await git(repositories.source.topLevel, ["worktree", "remove", record.worktreePath]).catch(
        (rollback) => rollbackErrors.push(rollback)
      )
      await git(repositories.source.topLevel, ["branch", "-D", branch]).catch((rollback) =>
        rollbackErrors.push(rollback)
      )
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Parallel Worktree registration failed and rollback was incomplete",
          { cause: error }
        )
      }
      throw error
    }
    return record
  })
}

/** 在写入前证明单元身份、既有改动与意图路径均未越权。 */
export async function guardParallelWorktree(
  options: GuardParallelWorktreeOptions
): Promise<ParallelWorktreeUnit> {
  const { record } = await boundUnit(options)
  const unitIdentity = await gitIdentity(record.worktreePath)
  await assertExecutionRoot(options.executionRoot, unitIdentity.topLevel)
  if (unitIdentity.commonDir !== (await gitIdentity(options.projectRoot)).commonDir) {
    throw new Error("Parallel unit Git common-dir has drifted")
  }
  const branch = (
    await git(record.worktreePath, ["symbolic-ref", "--quiet", "--short", "HEAD"])
  ).trim()
  if (branch !== record.branch) throw new Error("Parallel unit branch has drifted")
  const intended = await Promise.all(
    options.writeTargets.map((target) => normalizeWriteTarget(record.worktreePath, target))
  )
  if (intended.length === 0) throw new Error("Parallel guard requires write targets")
  assertOwnedPaths(intended, record)
  await actualChangedPaths(record)
  return record
}

/** 对完成单元执行 committed 路径、clean 状态和 ancestry postflight。 */
export async function verifyParallelWorktree(
  options: ParallelWorktreeSelection
): Promise<ParallelWorktreeUnit> {
  const repositories = await boundRepositories(options.projectRoot, options.sourceWorktree)
  return withRegistryLock(repositories.project.commonDir, async () => {
    const { registry, record } = await boundUnit(options)
    const identity = await gitIdentity(record.worktreePath)
    await assertExecutionRoot(options.executionRoot, identity.topLevel)
    if (identity.commonDir !== repositories.project.commonDir) {
      throw new Error("Parallel unit Git common-dir has drifted")
    }
    const branch = (
      await git(record.worktreePath, ["symbolic-ref", "--quiet", "--short", "HEAD"])
    ).trim()
    if (branch !== record.branch) throw new Error("Parallel unit branch has drifted")
    await actualChangedPaths(record)
    await assertClean(record.worktreePath)
    record.verifiedHead = (await git(record.worktreePath, ["rev-parse", "HEAD"])).trim()
    registry.units[unitKey(record.task, record.unit)] = record
    await writeRegistry(registry)
    return record
  })
}

/** 只清理已验证、干净且已成为父 Task 分支祖先的精确单元 Worktree。 */
export async function removeParallelWorktree(
  options: RemoveParallelWorktreeOptions
): Promise<ParallelWorktreeUnit> {
  const repositories = await boundRepositories(options.projectRoot, options.sourceWorktree)
  return withRegistryLock(repositories.project.commonDir, async () => {
    const { registry, record } = await boundUnit(options)
    await assertExecutionRoot(options.executionRoot, repositories.source.topLevel)
    await assertSourceBranch(repositories.source.topLevel, options.task)
    if (options.integratedInto !== record.sourceBranch) {
      throw new Error(`--integrated-into must equal ${record.sourceBranch}`)
    }
    if (record.verifiedHead === undefined) throw new Error("Parallel unit has not passed verify")
    await actualChangedPaths(record)
    await assertClean(record.worktreePath)
    const unitHead = (await git(record.worktreePath, ["rev-parse", "HEAD"])).trim()
    if (unitHead !== record.verifiedHead) throw new Error("Parallel unit changed after verify")
    if (
      !(await gitIsAncestor(
        repositories.source.topLevel,
        record.verifiedHead,
        options.integratedInto
      ))
    ) {
      throw new Error(`Parallel unit is not integrated into ${options.integratedInto}`)
    }
    await git(repositories.source.topLevel, ["worktree", "remove", record.worktreePath])
    delete registry.units[unitKey(record.task, record.unit)]
    await writeRegistry(registry)
    return record
  })
}

/** 解析 helper 的严格命令行，不接受未知或重复单值选项。 */
function parseCli(argv: string[]): CliOptions {
  const command = argv[0] as ParallelWorktreeCommand | undefined
  if (!["inspect", "create", "guard", "verify", "remove"].includes(command ?? "")) {
    throw new CliInputError("Expected inspect|create|guard|verify|remove")
  }
  const rule = CLI_OPTION_RULES[command as ParallelWorktreeCommand]
  const values = new Map<string, string>()
  const writeTargets: string[] = []
  let userRequested = false
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === undefined || !flag.startsWith("--")) {
      throw new CliInputError(`Unexpected positional argument: ${String(flag)}`)
    }
    const key = flag.slice(2)
    if (rule.booleans.includes(key)) {
      if (key !== "user-requested") throw new CliInputError(`Unsupported boolean option: ${flag}`)
      if (userRequested) throw new CliInputError("Duplicate --user-requested")
      userRequested = true
      continue
    }
    if (!rule.values.includes(key) && !rule.repeated.includes(key)) {
      throw new CliInputError(`Option is not allowed for ${command}: ${flag}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) {
      throw new CliInputError(`Option requires a value: ${flag}`)
    }
    if (rule.repeated.includes(key)) {
      if (key !== "write-target") throw new CliInputError(`Unsupported repeated option: ${flag}`)
      writeTargets.push(value)
    } else {
      if (values.has(key)) throw new CliInputError(`Duplicate option: ${flag}`)
      values.set(key, value)
    }
    index += 1
  }
  return { command: command as ParallelWorktreeCommand, values, writeTargets, userRequested }
}

/** 读取必需的 CLI 单值选项。 */
function required(options: CliOptions, name: string): string {
  const value = options.values.get(name)
  if (value === undefined) throw new CliInputError(`--${name} is required`)
  return value
}

/** 把未知失败收敛为稳定、可机器判定的 CLI 错误对象。 */
function cliError(error: unknown): { code: string; message: string } {
  return {
    code: error instanceof CliInputError ? error.code : "parallel_worktree_failed",
    message: error instanceof Error ? error.message : String(error)
  }
}

/** 执行 helper 命令，始终向 stdout 输出唯一 JSON 对象并返回退出码。 */
export async function runParallelWorktreeCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseCli(argv)
    const projectRoot = required(options, "project-root")
    let result: object
    if (options.command === "inspect") {
      result = await inspectParallelWorktrees(projectRoot)
    } else {
      const sourceWorktree = required(options, "source-worktree")
      const task = required(options, "task")
      const unit = required(options, "unit")
      const selection = { projectRoot, sourceWorktree, task, unit }
      if (options.command === "create") {
        const policy = required(options, "policy")
        if (policy !== "enabled" && policy !== "disabled") {
          throw new CliInputError("--policy must be enabled or disabled")
        }
        result = await createParallelWorktree({
          ...selection,
          writeTargets: options.writeTargets,
          expectedUnits: Number(required(options, "expected-units")),
          userRequested: options.userRequested,
          policy
        })
      } else if (options.command === "guard") {
        result = await guardParallelWorktree({
          ...selection,
          writeTargets: options.writeTargets
        })
      } else if (options.command === "verify") {
        result = await verifyParallelWorktree(selection)
      } else {
        result = await removeParallelWorktree({
          ...selection,
          integratedInto: required(options, "integrated-into")
        })
      }
    }
    process.stdout.write(`${JSON.stringify({ ok: true, operation: options.command, ...result })}\n`)
    return 0
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: cliError(error) })}\n`)
    return error instanceof CliInputError ? 2 : 4
  }
}

/** 保存当前脚本直接执行时的规范化 URL。 */
const executedPath = pathToFileURL(path.resolve(process.argv[1] ?? "")).href
if (executedPath === import.meta.url) {
  void runParallelWorktreeCli().then((exitCode) => {
    process.exitCode = exitCode
  })
}
