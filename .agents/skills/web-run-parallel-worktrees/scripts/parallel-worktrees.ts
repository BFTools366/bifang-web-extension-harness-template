import { lstat, mkdir, realpath } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type {
  ParallelWorktreeCommand,
  ParallelWorktreeUnit,
  ParallelWorktreeSelection,
  CreateParallelWorktreeOptions,
  GuardParallelWorktreeOptions,
  RemoveParallelWorktreeOptions,
  GitWorktreeRecord,
  StaleReason
} from "./parallel-types.ts"
import {
  unitKey,
  assertSlug,
  normalizeWriteTarget,
  assertNonOverlappingTargets,
  withRegistryLock,
  loadRegistry,
  writeRegistry
} from "./parallel-registry.ts"
import {
  execFileAsync,
  git,
  gitIsAncestor,
  gitIdentity,
  comparableWorktreePath,
  assertPrimaryWorktree,
  boundRepositories,
  assertExecutionRoot,
  assertSourceBranch,
  assertClean,
  assertOwnedPaths,
  actualChangedPaths,
  boundUnit,
  isNestedPath
} from "./parallel-git.ts"

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
/** 保持原入口的公开类型兼容。 */
export type {
  ParallelWorktreeCommand,
  ParallelWorktreeUnit,
  ParallelWorktreeRegistry,
  ParallelWorktreeSelection,
  CreateParallelWorktreeOptions,
  GuardParallelWorktreeOptions,
  RemoveParallelWorktreeOptions,
  GitWorktreeRecord
} from "./parallel-types.ts"
