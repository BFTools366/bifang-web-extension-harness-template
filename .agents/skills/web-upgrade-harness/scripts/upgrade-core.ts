import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import {
  BLOCKING_UPGRADE_CLASSIFICATIONS,
  EXCLUDED_DIRECTORIES,
  MANUAL_UPGRADE_CLASSIFICATIONS,
  MINIMUM_OWNERSHIP_RULES,
  MINIMUM_REQUIRED_OWNERSHIP_PATTERNS,
  OWNERSHIP_RELATIVE_PATH,
  OWNERSHIP_MODES,
  REQUIRED_MANAGED_SOURCE_PATHS,
  UPSTREAM_LOCK_RELATIVE_PATH
} from "./upgrade-policy.ts"
import {
  globPattern,
  ownershipPatternsOverlap,
  ownershipRule,
  ownershipRuleForNode
} from "./upgrade-glob.ts"
import { readBoundFileStable, writeBoundFileAtomic } from "./upgrade-mutation.ts"
import type {
  ApplyUpgradeOptions,
  CreateUpgradePlanOptions,
  HarnessUpgradePlan,
  OwnershipManifest,
  OwnershipMode,
  RecordUpgradeOptions,
  UpgradeFileSnapshot,
  UpgradeGitIdentity,
  UpgradePlanEntry,
  UpstreamLock,
  UpstreamLockEntry
} from "./upgrade-types.ts"

/** 保存无需 Shell 的异步进程入口。 */
const execFileAsync = promisify(execFile)

/** 描述枚举树中的普通文件与特殊路径。 */
interface TreeInventory {
  /** 保存普通文件快照。 */
  files: Map<string, UpgradeFileSnapshot>
  /** 保存真实目录节点。 */
  directories: Set<string>
  /** 保存符号链接或其他特殊路径。 */
  unsafe: Set<string>
}

/** 运行 Git 并返回原始 stdout。 */
async function git(root: string, args: string[]): Promise<string> {
  try {
    return (await execFileAsync("git", args, { cwd: root, encoding: "utf8" })).stdout
  } catch (error) {
    const detail = String((error as { stderr?: unknown }).stderr ?? "").trim()
    throw new Error(`git ${args.join(" ")} failed${detail === "" ? "" : `: ${detail}`}`, {
      cause: error
    })
  }
}

/** 计算字节或文本的稳定 SHA-256。 */
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

/** 判断 candidate 是否位于 parent 内或等于 parent。 */
function isNested(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/** 解析拒绝符号链接的真实目录。 */
async function realDirectory(input: string, label: string): Promise<string> {
  const requested = path.resolve(input)
  const status = await lstat(requested)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${requested}`)
  }
  return realpath(requested)
}

/** 读取普通文件并拒绝符号链接或特殊类型。 */
async function regularFile(
  input: string,
  label: string
): Promise<{ path: string; bytes: Buffer; snapshot: UpgradeFileSnapshot }> {
  const requested = path.resolve(input)
  const before = await lstat(requested)
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular file: ${requested}`)
  }
  // 保存 bytes 与 after 变量供拒绝控制文件在单次读取期间发生漂移。
  const bytes = await readFile(requested)
  const after = await lstat(requested)
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.mode !== after.mode
  ) {
    throw new Error(`${label} changed while it was being read: ${requested}`)
  }
  return {
    path: await realpath(requested),
    bytes,
    snapshot: { sha256: sha256(bytes), mode: before.mode & 0o777 }
  }
}

/** 读取并绑定 Git 顶层、HEAD、分支与完整脏状态。 */
async function gitIdentity(root: string, requireClean: boolean): Promise<UpgradeGitIdentity> {
  const topLevel = await realpath((await git(root, ["rev-parse", "--show-toplevel"])).trim())
  if (topLevel !== root) throw new Error(`Git top-level must equal declared root: ${root}`)
  const [head, branchResult, status] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    execFileAsync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8"
    }).then(
      (result) => result.stdout.trim(),
      (error: unknown) => {
        if ((error as { code?: unknown }).code === 1) return "DETACHED"
        throw error
      }
    ),
    git(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ])
  if (requireClean && status !== "")
    throw new Error(`Source Harness Git Worktree must be clean: ${root}`)
  return { root, head: head.trim(), branch: branchResult, status }
}

/** 将控制文件精确绑定到终端目标内的固定相对位置。 */
async function exactControlPath(
  targetRoot: string,
  requestedPath: string,
  relativePath: string,
  label: string
): Promise<string> {
  const expected = path.join(targetRoot, ...relativePath.split("/"))
  const requested = path.resolve(requestedPath)
  const status = await lstat(requested).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  const observed =
    status === undefined
      ? path.join(await realpath(path.dirname(requested)), path.basename(requested))
      : await realpath(requested)
  if (observed !== expected) {
    throw new Error(`${label} must equal ${expected}`)
  }
  return expected
}

/** 校验并读取所有权清单。 */
async function loadOwnershipManifest(
  filePath: string,
  targetRoot: string
): Promise<{
  path: string
  snapshot: UpgradeFileSnapshot
  manifest: OwnershipManifest
}> {
  const expectedPath = await exactControlPath(
    targetRoot,
    filePath,
    OWNERSHIP_RELATIVE_PATH,
    "Ownership manifest"
  )
  const source = await readBoundFileStable(targetRoot, OWNERSHIP_RELATIVE_PATH)
  if (!source.exists || source.bytes === undefined || source.snapshot === undefined) {
    throw new Error(`Ownership manifest must be a regular file: ${expectedPath}`)
  }
  const value = JSON.parse(source.bytes.toString("utf8")) as Partial<OwnershipManifest>
  if (
    value.schemaVersion !== 1 ||
    value.defaultMode !== "protected" ||
    !Array.isArray(value.rules) ||
    value.rules.length === 0
  ) {
    throw new Error("Ownership manifest schema is invalid")
  }
  const seen = new Set<string>()
  for (const rule of value.rules) {
    if (
      rule === null ||
      typeof rule !== "object" ||
      typeof rule.pattern !== "string" ||
      rule.pattern === "" ||
      path.isAbsolute(rule.pattern) ||
      rule.pattern.includes("\\") ||
      rule.pattern.split("/").includes("..") ||
      !OWNERSHIP_MODES.has(rule.mode) ||
      (rule.required !== undefined && typeof rule.required !== "boolean")
    ) {
      throw new Error("Ownership manifest contains an invalid rule")
    }
    if (seen.has(rule.pattern)) throw new Error(`Duplicate ownership pattern: ${rule.pattern}`)
    seen.add(rule.pattern)
    globPattern(rule.pattern)
  }
  /** 保存每条显式规则供不可弱化下限复核。 */
  const observed = new Map(value.rules.map((rule) => [rule.pattern, rule]))
  for (const [pattern, mode] of Object.entries(MINIMUM_OWNERSHIP_RULES)) {
    if (observed.get(pattern)?.mode !== mode) {
      throw new Error(`Ownership manifest weakened required rule: ${pattern} must be ${mode}`)
    }
    // 保存 requiredRuleIndex 与 shadowingRule 变量供拒绝任何局部或宽泛的前置遮蔽。
    const requiredRuleIndex = value.rules.findIndex((rule) => rule.pattern === pattern)
    const shadowingRule = value.rules
      .slice(0, requiredRuleIndex)
      .find((rule) => ownershipPatternsOverlap(rule.pattern, pattern))
    if (shadowingRule !== undefined) {
      throw new Error(
        `Ownership manifest shadows required rule: ${shadowingRule.pattern} precedes ${pattern}`
      )
    }
  }
  for (const pattern of MINIMUM_REQUIRED_OWNERSHIP_PATTERNS) {
    if (observed.get(pattern)?.required !== true) {
      throw new Error(
        `Ownership manifest weakened required path: ${pattern} must set required=true`
      )
    }
  }
  /** 保存完成 schema 复核的生产清单。 */
  const manifest = value as OwnershipManifest
  for (const relativePath of REQUIRED_MANAGED_SOURCE_PATHS) {
    if (ownershipRule(relativePath, manifest)?.mode !== "managed") {
      throw new Error(`Required source path must remain managed: ${relativePath}`)
    }
  }
  return {
    path: expectedPath,
    snapshot: source.snapshot,
    manifest
  }
}

/** 枚举目录树的普通文件摘要，并保留特殊路径用于相关阻断。 */
async function inventoryTree(root: string, targetTree: boolean): Promise<TreeInventory> {
  const inventory: TreeInventory = {
    files: new Map(),
    directories: new Set(),
    unsafe: new Set()
  }

  /** 递归枚举路径且保持稳定顺序。 */
  async function visit(directory: string, relativeDirectory = ""): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue
      const relativePath =
        relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`
      const absolutePath = path.join(directory, entry.name)
      const status = await lstat(absolutePath)
      if (entry.name === ".git") {
        if (!targetTree) inventory.unsafe.add(relativePath)
      } else if (status.isSymbolicLink()) {
        inventory.unsafe.add(relativePath)
      } else if (status.isDirectory()) {
        inventory.directories.add(relativePath)
        await visit(absolutePath, relativePath)
      } else if (status.isFile()) {
        if ((status.mode & 0o7000) !== 0) inventory.unsafe.add(relativePath)
        inventory.files.set(relativePath, {
          sha256: sha256(await readFile(absolutePath)),
          mode: status.mode & 0o777
        })
      } else {
        inventory.unsafe.add(relativePath)
      }
    }
  }

  await visit(root)
  return inventory
}

/** 沿真实目录读取并复核一个计划绑定的普通文件。 */
async function readBoundFile(
  root: string,
  relativePath: string,
  expected: UpgradeFileSnapshot,
  label: string
): Promise<Buffer> {
  const source = await readBoundFileStable(root, relativePath, expected)
  if (!source.exists || source.bytes === undefined || source.snapshot === undefined) {
    throw new Error(`${label} must remain a regular file`)
  }
  return source.bytes
}

/** 读取可缺失 source 普通文件的安全快照。 */
async function optionalSourceSnapshot(
  root: string,
  relativePath: string
): Promise<UpgradeFileSnapshot | undefined> {
  const segments = relativePath.split("/")
  let current = root
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] ?? "")
    const status = await lstat(current).catch((error: unknown) => {
      if ((error as { code?: unknown }).code === "ENOENT") return undefined
      throw error
    })
    if (status === undefined) return undefined
    if (status.isSymbolicLink())
      throw new Error(`Required source path crosses a symlink: ${relativePath}`)
    if (index < segments.length - 1 && !status.isDirectory()) {
      throw new Error(`Required source path parent is not a directory: ${relativePath}`)
    }
    if (index === segments.length - 1 && !status.isFile()) {
      throw new Error(`Required source path is not a regular file: ${relativePath}`)
    }
  }
  const status = await lstat(current)
  return { sha256: sha256(await readFile(current)), mode: status.mode & 0o777 }
}

/** 判断可选快照具备合法摘要和普通权限模式。 */
function validFileSnapshot(snapshot: UpgradeFileSnapshot | undefined): boolean {
  return (
    snapshot === undefined ||
    (/^[0-9a-f]{64}$/u.test(snapshot.sha256) && Number.isSafeInteger(snapshot.mode))
  )
}

/** 校验 upstream lock 的 schema 与路径快照。 */
function validateLock(value: unknown): UpstreamLock {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Upstream lock must be an object")
  }
  const candidate = value as Partial<UpstreamLock>
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.sourceVersion !== "string" ||
    typeof candidate.sourceCommit !== "string" ||
    candidate.files === null ||
    typeof candidate.files !== "object" ||
    Array.isArray(candidate.files)
  ) {
    throw new Error("Upstream lock schema is invalid")
  }
  for (const [relativePath, entry] of Object.entries(candidate.files)) {
    if (
      relativePath === "" ||
      path.isAbsolute(relativePath) ||
      relativePath.includes("\\") ||
      relativePath.split("/").includes("..") ||
      !OWNERSHIP_MODES.has(entry.ownership) ||
      !validFileSnapshot(entry.candidate) ||
      !validFileSnapshot(entry.target) ||
      (entry.candidate === undefined && entry.target === undefined)
    ) {
      throw new Error(`Upstream lock entry is invalid: ${relativePath}`)
    }
  }
  return candidate as UpstreamLock
}

/** 描述一次读取绑定的 upstream lock 内容与原始文件快照。 */
interface LoadedUpstreamLock {
  /** 保存完成 schema 校验的 lock 内容。 */
  value: UpstreamLock
  /** 保存用于拒绝控制文件静默漂移的字节与权限快照。 */
  snapshot: UpgradeFileSnapshot
}

/** 安全读取可选 upstream lock，并以同一次读取绑定原始字节和权限。 */
async function loadLock(
  lockPath: string,
  targetRoot: string
): Promise<LoadedUpstreamLock | undefined> {
  const expectedPath = await exactControlPath(
    targetRoot,
    lockPath,
    UPSTREAM_LOCK_RELATIVE_PATH,
    "Upstream lock"
  )
  // 保存 source 变量供同一次稳定读取完成内容校验与原始摘要绑定。
  const source = await readBoundFileStable(targetRoot, UPSTREAM_LOCK_RELATIVE_PATH, undefined, true)
  if (!source.exists) return undefined
  if (source.bytes === undefined || source.snapshot === undefined) {
    throw new Error(`Upstream lock must be a regular file: ${expectedPath}`)
  }
  return {
    value: validateLock(JSON.parse(source.bytes.toString("utf8"))),
    snapshot: source.snapshot
  }
}

/** 复验计划绑定的所有权清单与可选 upstream lock 快照。 */
async function assertControlSnapshots(plan: HarnessUpgradePlan): Promise<void> {
  const ownershipPath = await exactControlPath(
    plan.targetRoot,
    plan.ownershipPath,
    OWNERSHIP_RELATIVE_PATH,
    "Ownership manifest"
  )
  // 保存 ownership 变量供验证控制清单的字节和权限均未变化。
  const ownership = await readBoundFileStable(
    plan.targetRoot,
    OWNERSHIP_RELATIVE_PATH,
    plan.ownershipSnapshot
  )
  if (!ownership.exists || !sameSnapshot(ownership.snapshot, plan.ownershipSnapshot)) {
    throw new Error(`Ownership manifest changed after plan verification: ${ownershipPath}`)
  }
  // 保存 loadedLock 与 expectedLock 变量供区分缺席、出现、删除和内容漂移。
  const loadedLock = await loadLock(plan.lockPath, plan.targetRoot)
  const expectedLock = plan.lockSnapshot ?? undefined
  if (!sameSnapshot(loadedLock?.snapshot, expectedLock)) {
    throw new Error("Upstream lock changed after plan verification")
  }
}

/** 判断两个文件快照是否字节和普通权限模式均一致。 */
function sameSnapshot(
  left: UpgradeFileSnapshot | undefined,
  right: UpgradeFileSnapshot | undefined
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.sha256 === right.sha256 && left.mode === right.mode
}

/** 按所有权和三方事实生成一个稳定分类。 */
function classifyEntry(
  relativePath: string,
  ownership: OwnershipMode,
  baseline: UpstreamLockEntry | undefined,
  candidate: UpgradeFileSnapshot | undefined,
  target: UpgradeFileSnapshot | undefined,
  bootstrap: boolean,
  unsafe: boolean
): UpgradePlanEntry {
  const entry = { path: relativePath, ownership, baseline, candidate, target }
  if (unsafe)
    return {
      ...entry,
      classification: "blocked",
      reason: "related path is not a safe regular file"
    }
  if ((ownership === "protected" || ownership === "tombstone") && candidate !== undefined) {
    return {
      ...entry,
      classification: "blocked",
      reason: `candidate must not contain ${ownership} path`
    }
  }
  if (ownership === "tombstone" && target !== undefined) {
    return {
      ...entry,
      classification: "blocked",
      reason: "terminal target contains a tombstoned source-only path"
    }
  }
  if (ownership === "protected" || ownership === "tombstone") {
    return {
      ...entry,
      classification: "unchanged",
      reason: `${ownership} boundary is satisfied`
    }
  }
  const automatic = ownership === "managed" || ownership === "managed-self"
  if (!automatic) {
    if (baseline === undefined) {
      if (candidate === undefined) {
        return { ...entry, classification: "preserve_local", reason: "candidate is absent" }
      }
      if (sameSnapshot(candidate, target)) {
        return { ...entry, classification: "converged", reason: "candidate and target match" }
      }
      return {
        ...entry,
        classification: target === undefined ? "manual_add" : "manual_merge",
        reason: "mixed path requires a reviewed target-specific merge"
      }
    }
    if (sameSnapshot(candidate, baseline.candidate)) {
      return {
        ...entry,
        classification: sameSnapshot(target, baseline.target) ? "unchanged" : "preserve_local",
        reason: "upstream mixed path is unchanged"
      }
    }
    if (sameSnapshot(candidate, target)) {
      return { ...entry, classification: "converged", reason: "candidate and target match" }
    }
    return {
      ...entry,
      classification: "manual_merge",
      reason: "upstream mixed path changed and requires reviewed merge"
    }
  }
  if (baseline === undefined) {
    if (candidate !== undefined && target === undefined) {
      return { ...entry, classification: "add", reason: "candidate path is new" }
    }
    if (candidate !== undefined && target !== undefined) {
      return {
        ...entry,
        classification: bootstrap
          ? "bootstrap_conflict"
          : sameSnapshot(candidate, target)
            ? "converged"
            : "collision",
        reason: bootstrap
          ? "first baseline requires explicit convergence review"
          : "untracked target path collides with the candidate"
      }
    }
    return { ...entry, classification: "preserve_local", reason: "candidate is absent" }
  }
  const candidateChanged = !sameSnapshot(candidate, baseline.candidate)
  const targetChanged = !sameSnapshot(target, baseline.target)
  if (candidateChanged && targetChanged) {
    return {
      ...entry,
      classification: sameSnapshot(candidate, target) ? "converged" : "conflict",
      reason: "upstream and target both changed from their recorded baselines"
    }
  }
  if (targetChanged) {
    return { ...entry, classification: "preserve_local", reason: "only target changed locally" }
  }
  if (!candidateChanged) {
    return { ...entry, classification: "unchanged", reason: "neither side changed" }
  }
  if (candidate === undefined) {
    return { ...entry, classification: "delete", reason: "upstream removed the managed path" }
  }
  if (target === undefined && baseline.target !== undefined) {
    return {
      ...entry,
      classification: "conflict",
      reason: "target deleted an upstream update path"
    }
  }
  return { ...entry, classification: "update", reason: "only upstream candidate changed" }
}

/** 从 Version.md 提取唯一当前版本并与声明匹配。 */
async function assertSourceVersion(sourceRoot: string, expected: string): Promise<void> {
  const versionPath = path.join(sourceRoot, "Version.md")
  const status = await lstat(versionPath)
  if (status.isSymbolicLink() || !status.isFile())
    throw new Error("Source Version.md must be regular")
  const source = await readFile(versionPath, "utf8")
  const match = /当前版本：`(?<version>[0-9]{12})`/u.exec(source)
  if (match?.groups?.version !== expected) {
    throw new Error(`Source Version.md does not declare ${expected}`)
  }
}

/** 创建绑定源、候选、目标、所有权与 lock 的只读三方计划。 */
export async function createUpgradePlan(
  options: CreateUpgradePlanOptions
): Promise<HarnessUpgradePlan> {
  const [sourceRoot, candidateRoot, targetRoot] = await Promise.all([
    realDirectory(options.sourceRoot, "Source Harness root"),
    realDirectory(options.candidateRoot, "Rendered candidate root"),
    realDirectory(options.targetRoot, "Target root")
  ])
  const roots = [sourceRoot, candidateRoot, targetRoot]
  if (
    roots.some((root, index) =>
      roots.some(
        (candidate, candidateIndex) => index !== candidateIndex && isNested(root, candidate)
      )
    )
  ) {
    throw new Error("Source, rendered candidate, and target roots must be distinct and non-nested")
  }
  const ownership = await loadOwnershipManifest(options.ownershipPath, targetRoot)
  const lockPath = await exactControlPath(
    targetRoot,
    options.lockPath,
    UPSTREAM_LOCK_RELATIVE_PATH,
    "Upstream lock"
  )
  await assertSourceVersion(sourceRoot, options.sourceVersion)
  const [sourceGit, targetGit] = await Promise.all([
    gitIdentity(sourceRoot, true),
    gitIdentity(targetRoot, false)
  ])
  if (sourceGit.head !== options.sourceCommit) {
    throw new Error("Declared source commit does not match source HEAD")
  }
  const [candidateInventory, targetInventory, loadedLock] = await Promise.all([
    inventoryTree(candidateRoot, false),
    inventoryTree(targetRoot, true),
    loadLock(lockPath, targetRoot)
  ])
  // 保存 lock 变量供分类使用，同时单独把原始 lock 快照写入计划 provenance。
  const lock = loadedLock?.value
  const paths = new Set<string>([
    ...candidateInventory.files.keys(),
    ...candidateInventory.unsafe,
    ...Object.keys(lock?.files ?? {}),
    ...[...targetInventory.files.keys(), ...targetInventory.unsafe].filter(
      (relativePath) =>
        ownershipRuleForNode(relativePath, ownership.manifest, true)?.mode === "tombstone"
    )
  ])
  const entries: UpgradePlanEntry[] = []
  /** 登记一个唯一的路径级阻断。 */
  const block = (relativePath: string, mode: OwnershipMode, reason: string): void => {
    if (entries.some((entry) => entry.path === relativePath)) return
    entries.push({
      path: relativePath,
      ownership: mode,
      classification: "blocked",
      baseline: lock?.files[relativePath],
      candidate: candidateInventory.files.get(relativePath),
      target: targetInventory.files.get(relativePath),
      reason
    })
    paths.add(relativePath)
  }
  for (const rule of ownership.manifest.rules) {
    if (
      rule.required === true &&
      !rule.pattern.includes("*") &&
      !candidateInventory.files.has(rule.pattern) &&
      !candidateInventory.unsafe.has(rule.pattern)
    ) {
      block(rule.pattern, rule.mode, "required candidate path is missing")
    }
  }
  for (const relativePath of REQUIRED_MANAGED_SOURCE_PATHS) {
    const sourceSnapshot = await optionalSourceSnapshot(sourceRoot, relativePath)
    if (
      sourceSnapshot !== undefined &&
      !sameSnapshot(sourceSnapshot, candidateInventory.files.get(relativePath))
    ) {
      block(relativePath, "managed", "candidate does not exactly propagate required source file")
    }
  }
  for (const relativePath of candidateInventory.directories) {
    const mode = ownershipRuleForNode(relativePath, ownership.manifest, true)?.mode
    if (mode === "protected" || mode === "tombstone") {
      block(relativePath, mode, `candidate contains forbidden ${mode} directory`)
    }
  }
  for (const relativePath of new Set([...targetInventory.directories, ...targetInventory.unsafe])) {
    if (ownershipRuleForNode(relativePath, ownership.manifest, true)?.mode === "tombstone") {
      block(
        relativePath,
        "tombstone",
        "terminal target contains a tombstoned source-only directory"
      )
    }
  }
  for (const relativePath of [...paths].sort()) {
    if (entries.some((entry) => entry.path === relativePath)) continue
    const unsafeNode =
      candidateInventory.unsafe.has(relativePath) || targetInventory.unsafe.has(relativePath)
    // 保存 rule 变量，并让符号链接目录根沿用其 /** 所有权而不是落入未知路径。
    const rule = ownershipRuleForNode(relativePath, ownership.manifest, unsafeNode)
    if (rule === undefined) {
      entries.push({
        path: relativePath,
        ownership: ownership.manifest.defaultMode,
        classification: "blocked",
        candidate: candidateInventory.files.get(relativePath),
        target: targetInventory.files.get(relativePath),
        reason: "candidate path has no ownership rule"
      })
      continue
    }
    const baselineEntry = lock?.files[relativePath]
    if (baselineEntry !== undefined && baselineEntry.ownership !== rule.mode) {
      entries.push({
        path: relativePath,
        ownership: rule.mode,
        classification: "blocked",
        baseline: baselineEntry,
        candidate: candidateInventory.files.get(relativePath),
        target: targetInventory.files.get(relativePath),
        reason: "ownership mode drifted from recorded baseline"
      })
      continue
    }
    entries.push(
      classifyEntry(
        relativePath,
        rule.mode,
        baselineEntry,
        candidateInventory.files.get(relativePath),
        targetInventory.files.get(relativePath),
        lock === undefined,
        candidateInventory.unsafe.has(relativePath) ||
          (targetInventory.unsafe.has(relativePath) &&
            (baselineEntry !== undefined || candidateInventory.files.has(relativePath)))
      )
    )
  }
  entries.sort((left, right) => left.path.localeCompare(right.path))
  // 保存结构性 problems，供调用方不解析逐路径 entry 也能显示阻断原因。
  const problems = entries
    .filter((entry) => entry.classification === "blocked")
    .map((entry) => `${entry.path}: ${entry.reason}`)
  return {
    schemaVersion: 2,
    sourceRoot,
    sourceVersion: options.sourceVersion,
    sourceCommit: options.sourceCommit,
    candidateRoot,
    targetRoot,
    ownershipPath: ownership.path,
    ownershipSnapshot: ownership.snapshot,
    lockPath,
    lockSnapshot: loadedLock?.snapshot ?? null,
    sourceGit,
    targetGit,
    bootstrap: lock === undefined,
    blocked: entries.some((entry) => BLOCKING_UPGRADE_CLASSIFICATIONS.has(entry.classification)),
    manualRequired: entries.some((entry) =>
      MANUAL_UPGRADE_CLASSIFICATIONS.has(entry.classification)
    ),
    problems,
    entries
  }
}

/** 将计划独占写到候选与目标树之外的新文件。 */
export async function writeUpgradePlan(
  plan: HarnessUpgradePlan,
  outputPath: string
): Promise<void> {
  const requested = path.resolve(outputPath)
  const parent = await realDirectory(path.dirname(requested), "Upgrade plan output parent")
  const output = path.join(parent, path.basename(requested))
  if ([plan.candidateRoot, plan.targetRoot].some((root) => isNested(root, output))) {
    throw new Error("Upgrade plan output must be outside candidate and target roots")
  }
  try {
    await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") {
      throw new Error(`Upgrade plan output already exists and cannot be overwritten: ${output}`, {
        cause: error
      })
    }
    throw error
  }
}

/** 读取并做最小 schema 校验的计划文件。 */
async function loadPlan(planPath: string): Promise<HarnessUpgradePlan> {
  const source = await regularFile(planPath, "Upgrade plan")
  const value = JSON.parse(source.bytes.toString("utf8")) as Partial<HarnessUpgradePlan>
  if (
    value.schemaVersion !== 2 ||
    typeof value.sourceRoot !== "string" ||
    typeof value.sourceVersion !== "string" ||
    typeof value.sourceCommit !== "string" ||
    typeof value.candidateRoot !== "string" ||
    typeof value.targetRoot !== "string" ||
    typeof value.ownershipPath !== "string" ||
    typeof value.lockPath !== "string" ||
    value.ownershipSnapshot === undefined ||
    !validFileSnapshot(value.ownershipSnapshot) ||
    !("lockSnapshot" in value) ||
    !(value.lockSnapshot === null || validFileSnapshot(value.lockSnapshot)) ||
    typeof value.blocked !== "boolean" ||
    typeof value.manualRequired !== "boolean" ||
    !Array.isArray(value.problems) ||
    value.problems.some((problem) => typeof problem !== "string") ||
    !Array.isArray(value.entries)
  ) {
    throw new Error("Upgrade plan schema is invalid")
  }
  return value as HarnessUpgradePlan
}

/** 重新生成计划并拒绝任何输入、事实或 JSON 漂移。 */
async function assertFreshPlan(plan: HarnessUpgradePlan): Promise<HarnessUpgradePlan> {
  const fresh = await createUpgradePlan({
    sourceRoot: plan.sourceRoot,
    sourceVersion: plan.sourceVersion,
    sourceCommit: plan.sourceCommit,
    candidateRoot: plan.candidateRoot,
    targetRoot: plan.targetRoot,
    ownershipPath: plan.ownershipPath,
    lockPath: plan.lockPath
  })
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) {
    throw new Error("Upgrade plan or bound source/candidate/target facts have drifted")
  }
  return fresh
}

/** 只应用一个已复核 managed update，禁止自动新增、删除或混合合并。 */
export async function applyUpgradePath(options: ApplyUpgradeOptions): Promise<UpgradePlanEntry> {
  if (options.approval !== "apply-managed-changes") {
    throw new Error("Upgrade apply requires approval apply-managed-changes")
  }
  const plan = await assertFreshPlan(await loadPlan(options.planPath))
  /** 保存会阻断所有自动路径应用的条目。 */
  const blockers = plan.entries.filter((entry) =>
    BLOCKING_UPGRADE_CLASSIFICATIONS.has(entry.classification)
  )
  if (blockers.length > 0) {
    throw new Error(
      `Upgrade apply is blocked by: ${blockers.map((entry) => entry.path).join(", ")}`
    )
  }
  const relativePath = path.posix.normalize(options.path)
  if (
    relativePath !== options.path ||
    relativePath === "." ||
    relativePath.startsWith("../") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Upgrade apply path must be one normalized repo-relative path")
  }
  const entry = plan.entries.find((candidate) => candidate.path === relativePath)
  if (
    entry === undefined ||
    entry.classification !== "update" ||
    (entry.ownership !== "managed" && entry.ownership !== "managed-self") ||
    entry.candidate === undefined ||
    entry.target === undefined
  ) {
    throw new Error("Upgrade apply path is not an existing safe managed update")
  }
  if (entry.ownership === "managed-self") {
    // 保存普通 managed 路径供强制先完成非自更新操作。
    const ordinary = plan.entries.filter(
      (candidate) => candidate.classification === "update" && candidate.ownership === "managed"
    )
    if (ordinary.length > 0) {
      throw new Error("managed-self updates must run after all ordinary managed updates")
    }
    // 保存稳定自更新队列，并强制 CLI runner 最后替换。
    const runner = ".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
    const selfUpdates = plan.entries
      .filter(
        (candidate) =>
          candidate.classification === "update" && candidate.ownership === "managed-self"
      )
      .map((candidate) => candidate.path)
      .sort((left, right) => {
        const runnerOrder = Number(left === runner) - Number(right === runner)
        return runnerOrder === 0 ? left.localeCompare(right) : runnerOrder
      })
    if (selfUpdates[0] !== relativePath) {
      throw new Error(`managed-self update order requires ${selfUpdates[0]} before ${relativePath}`)
    }
  }
  const candidateBytes = await readBoundFile(
    plan.candidateRoot,
    relativePath,
    entry.candidate,
    "Upgrade candidate"
  )
  await readBoundFile(plan.targetRoot, relativePath, entry.target, "Upgrade target")
  await assertControlSnapshots(plan)
  await writeBoundFileAtomic(
    plan.targetRoot,
    relativePath,
    candidateBytes,
    entry.target,
    entry.candidate.mode,
    entry.candidate.sha256
  )
  return entry
}

/** 原子写入受保护 upstream lock 并固定 0600 权限。 */
async function writeLock(
  targetRoot: string,
  lockPath: string,
  lock: UpstreamLock,
  expectedSnapshot: UpgradeFileSnapshot | null
): Promise<void> {
  await exactControlPath(targetRoot, lockPath, UPSTREAM_LOCK_RELATIVE_PATH, "Upstream lock")
  // 保存 observedSnapshot 变量供最终原子替换前再次拒绝 lock 漂移。
  const observedSnapshot = (await loadLock(lockPath, targetRoot))?.snapshot
  if (!sameSnapshot(observedSnapshot, expectedSnapshot ?? undefined)) {
    throw new Error("Upstream lock changed before baseline replacement")
  }
  // 保存稳定载荷，由绑定父目录的子进程写入、fsync 并 rename。
  const contents = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`)
  await writeBoundFileAtomic(
    targetRoot,
    UPSTREAM_LOCK_RELATIVE_PATH,
    contents,
    expectedSnapshot,
    0o600,
    sha256(contents)
  )
}

/** 只在计划完全收敛且人工合并集合精确时记录新上游基线。 */
export async function recordUpgradeBaseline(options: RecordUpgradeOptions): Promise<UpstreamLock> {
  const plan = await assertFreshPlan(await loadPlan(options.planPath))
  if (options.sourceVersion !== plan.sourceVersion || options.sourceCommit !== plan.sourceCommit) {
    throw new Error("Record source version/commit must match the reviewed plan")
  }
  const expectedApproval = options.bootstrap
    ? "bootstrap-verified-baseline"
    : "record-verified-baseline"
  if (options.approval !== expectedApproval || options.bootstrap !== plan.bootstrap) {
    throw new Error(`Upgrade record requires ${expectedApproval} and matching bootstrap mode`)
  }
  const manual = plan.entries
    .filter((entry) => entry.classification === "manual_merge")
    .map((entry) => entry.path)
    .sort()
  const suppliedManual = [...new Set(options.resolvedManual)].sort()
  if (JSON.stringify(manual) !== JSON.stringify(suppliedManual)) {
    throw new Error("--resolved-manual must exactly match reviewed manual_merge paths")
  }
  const allowed = new Set(["unchanged", "converged", "preserve_local", "manual_merge"])
  const unresolved = plan.entries.filter(
    (entry) =>
      !allowed.has(entry.classification) &&
      !(
        options.bootstrap &&
        entry.classification === "bootstrap_conflict" &&
        sameSnapshot(entry.candidate, entry.target)
      )
  )
  if (unresolved.length > 0) {
    throw new Error(
      `Upgrade plan is not converged: ${unresolved.map((entry) => entry.path).join(", ")}`
    )
  }
  // 保存 previousLoad 变量供读取旧双基线并复验计划绑定的控制文件。
  const previousLoad = await loadLock(plan.lockPath, plan.targetRoot)
  if (!sameSnapshot(previousLoad?.snapshot, plan.lockSnapshot ?? undefined)) {
    throw new Error("Upstream lock changed after plan verification")
  }
  await assertControlSnapshots(plan)
  const previous = previousLoad?.value
  const files: Record<string, UpstreamLockEntry> = {}
  for (const entry of plan.entries) {
    if (entry.ownership === "protected" || entry.ownership === "tombstone") continue
    /** 保存上一轮双基线，供本地偏离路径继续保护。 */
    const previousEntry = previous?.files[entry.path]
    if (entry.classification === "preserve_local" && previousEntry !== undefined) {
      files[entry.path] = previousEntry
    } else if (entry.candidate !== undefined || entry.target !== undefined) {
      files[entry.path] = {
        ownership: entry.ownership,
        candidate: entry.candidate,
        target: entry.target
      }
    }
  }
  const lock: UpstreamLock = {
    schemaVersion: 1,
    sourceVersion: plan.sourceVersion,
    sourceCommit: plan.sourceCommit,
    files: Object.fromEntries(
      Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
    )
  }
  await assertFreshPlan(plan)
  await writeLock(plan.targetRoot, plan.lockPath, lock, plan.lockSnapshot)
  return lock
}
