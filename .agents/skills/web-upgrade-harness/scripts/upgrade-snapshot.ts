import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import {
  EXCLUDED_DIRECTORIES,
  MINIMUM_OWNERSHIP_RULES,
  MINIMUM_REQUIRED_OWNERSHIP_PATTERNS,
  OWNERSHIP_RELATIVE_PATH,
  OWNERSHIP_MODES,
  REQUIRED_MANAGED_SOURCE_PATHS,
  UPSTREAM_LOCK_RELATIVE_PATH
} from "./upgrade-policy.ts"
import { globPattern, ownershipPatternsOverlap, ownershipRule } from "./upgrade-glob.ts"
import { readBoundFileStable } from "./upgrade-mutation.ts"
import type {
  HarnessUpgradePlan,
  OwnershipManifest,
  UpgradeFileSnapshot,
  UpgradeGitIdentity,
  UpstreamLock
} from "./upgrade-types.ts"

/** 保存无需 Shell 的异步进程入口。 */
export const execFileAsync = promisify(execFile)

/** 描述枚举树中的普通文件与特殊路径。 */
export interface TreeInventory {
  /** 保存普通文件快照。 */
  files: Map<string, UpgradeFileSnapshot>
  /** 保存真实目录节点。 */
  directories: Set<string>
  /** 保存符号链接或其他特殊路径。 */
  unsafe: Set<string>
}

/** 运行 Git 并返回原始 stdout。 */
export async function git(root: string, args: string[]): Promise<string> {
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
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

/** 判断 candidate 是否位于 parent 内或等于 parent。 */
export function isNested(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

/** 解析拒绝符号链接的真实目录。 */
export async function realDirectory(input: string, label: string): Promise<string> {
  const requested = path.resolve(input)
  const status = await lstat(requested)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${requested}`)
  }
  return realpath(requested)
}

/** 读取普通文件并拒绝符号链接或特殊类型。 */
export async function regularFile(
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
export async function gitIdentity(
  root: string,
  requireClean: boolean
): Promise<UpgradeGitIdentity> {
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
    git(root, ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all"])
  ])
  if (requireClean && status !== "")
    throw new Error(`Source Harness Git Worktree must be clean: ${root}`)
  return { root, head: head.trim(), branch: branchResult, status }
}

/** 将控制文件精确绑定到终端目标内的固定相对位置。 */
export async function exactControlPath(
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

/** 校验生产所有权清单的 schema、顺序与不可弱化下限。 */
export function validateOwnershipManifest(value: unknown): OwnershipManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ownership manifest schema is invalid")
  }
  const candidate = value as Partial<OwnershipManifest>
  if (
    candidate.schemaVersion !== 1 ||
    candidate.defaultMode !== "protected" ||
    !Array.isArray(candidate.rules) ||
    candidate.rules.length === 0
  ) {
    throw new Error("Ownership manifest schema is invalid")
  }
  const seen = new Set<string>()
  for (const rule of candidate.rules) {
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
  const observed = new Map(candidate.rules.map((rule) => [rule.pattern, rule]))
  for (const [pattern, mode] of Object.entries(MINIMUM_OWNERSHIP_RULES)) {
    if (observed.get(pattern)?.mode !== mode) {
      throw new Error(`Ownership manifest weakened required rule: ${pattern} must be ${mode}`)
    }
    // 保存 requiredRuleIndex 与 shadowingRule 变量供拒绝任何局部或宽泛的前置遮蔽。
    const requiredRuleIndex = candidate.rules.findIndex((rule) => rule.pattern === pattern)
    const shadowingRule = candidate.rules.slice(0, requiredRuleIndex).find((rule) => {
      // 唯一例外是源明确退役的精确 Auth 模板，不能用任意规则遮蔽受管 Skill。
      const retiredAuth =
        pattern === ".agents/skills/web-compose-capabilities/**" &&
        rule.mode === "tombstone" &&
        MINIMUM_OWNERSHIP_RULES[rule.pattern] === "tombstone" &&
        rule.pattern.startsWith(
          ".agents/skills/web-compose-capabilities/templates/application/files/organization/"
        )
      return !retiredAuth && ownershipPatternsOverlap(rule.pattern, pattern)
    })
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
  const manifest = candidate as OwnershipManifest
  for (const relativePath of REQUIRED_MANAGED_SOURCE_PATHS) {
    if (ownershipRule(relativePath, manifest)?.mode !== "managed") {
      throw new Error(`Required source path must remain managed: ${relativePath}`)
    }
  }
  return manifest
}

/** 校验并读取所有权清单。 */
export async function loadOwnershipManifest(
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
  const manifest = validateOwnershipManifest(JSON.parse(source.bytes.toString("utf8")) as unknown)
  return {
    path: expectedPath,
    snapshot: source.snapshot,
    manifest
  }
}

/** 枚举目录树的普通文件摘要，并保留特殊路径用于相关阻断。 */
export async function inventoryTree(
  root: string,
  targetTree: boolean,
  skip?: (relativePath: string, directory: boolean) => boolean
): Promise<TreeInventory> {
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
      if (targetTree && (entry.name === ".env" || /^\.env(?:\..+)?\.local$/u.test(entry.name))) {
        inventory.unsafe.add(relativePath)
        continue
      }
      if (skip?.(relativePath, status.isDirectory())) continue
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
export async function readBoundFile(
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
export async function optionalSourceSnapshot(
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
export function validFileSnapshot(snapshot: UpgradeFileSnapshot | undefined): boolean {
  return (
    snapshot === undefined ||
    (/^[0-9a-f]{64}$/u.test(snapshot.sha256) && Number.isSafeInteger(snapshot.mode))
  )
}

/** 校验 upstream lock 的 schema 与路径快照。 */
export function validateLock(value: unknown): UpstreamLock {
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
export interface LoadedUpstreamLock {
  /** 保存完成 schema 校验的 lock 内容。 */
  value: UpstreamLock
  /** 保存用于拒绝控制文件静默漂移的字节与权限快照。 */
  snapshot: UpgradeFileSnapshot
}

/** 安全读取可选 upstream lock，并以同一次读取绑定原始字节和权限。 */
export async function loadLock(
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
export async function assertControlSnapshots(plan: HarnessUpgradePlan): Promise<void> {
  const identities = plan.entries.filter(
    (entry) =>
      entry.path === ".harness/project.json" ||
      entry.path === ".harness/workspace.json" ||
      entry.path.endsWith("/.harness/project.json")
  )
  if (!identities.length || identities.some((entry) => entry.target === undefined))
    throw new Error("Upgrade plan lacks target project identity")
  for (const entry of identities)
    await readBoundFileStable(plan.targetRoot, entry.path, entry.target)
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
export function sameSnapshot(
  left: UpgradeFileSnapshot | undefined,
  right: UpgradeFileSnapshot | undefined
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.sha256 === right.sha256 && left.mode === right.mode
}
