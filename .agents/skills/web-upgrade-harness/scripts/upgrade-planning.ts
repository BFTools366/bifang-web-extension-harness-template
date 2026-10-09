import { lstat, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  BLOCKING_UPGRADE_CLASSIFICATIONS,
  MANUAL_UPGRADE_CLASSIFICATIONS,
  REQUIRED_MANAGED_SOURCE_PATHS,
  UPSTREAM_LOCK_RELATIVE_PATH
} from "./upgrade-policy.ts"
import { ownershipRuleForNode } from "./upgrade-glob.ts"
import { readBoundFileStable } from "./upgrade-mutation.ts"
import type {
  CreateUpgradePlanOptions,
  HarnessUpgradePlan,
  OwnershipMode,
  UpgradeFileSnapshot,
  UpgradePlanEntry,
  UpstreamLockEntry
} from "./upgrade-types.ts"
import {
  isNested,
  realDirectory,
  gitIdentity,
  exactControlPath,
  loadOwnershipManifest,
  inventoryTree,
  optionalSourceSnapshot,
  loadLock,
  sameSnapshot
} from "./upgrade-snapshot.ts"

/** 本地保存身份路径，避免逐文件自升级先更新 planner 时依赖 policy 的新增导出。 */
const PROJECT_CONFIG_RELATIVE_PATH = ".harness/project.json"

/** 本地保存宿主专用 Skill 根，保持旧 policy 与新 planner 可共同启动。 */
const HOST_SPECIFIC_SKILL_ROOTS = {
  web: [".agents/skills/web-implement-list-view"],
  extension: [".agents/skills/web-review-extension-compatibility"]
} as const

/** 按所有权和三方事实生成一个稳定分类。 */
export function classifyEntry(
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
export async function assertSourceVersion(sourceRoot: string, expected: string): Promise<void> {
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
  const projectFile = await readBoundFileStable(targetRoot, PROJECT_CONFIG_RELATIVE_PATH)
  if (projectFile.bytes === undefined || projectFile.snapshot === undefined) {
    throw new Error("Target project identity is missing")
  }
  const project: unknown = JSON.parse(projectFile.bytes.toString("utf8"))
  if (
    project === null ||
    typeof project !== "object" ||
    !("projectType" in project) ||
    (project.projectType !== "web" && project.projectType !== "extension")
  ) {
    throw new Error("Target projectType must be web or extension")
  }
  const projectType = project.projectType
  const forbiddenSkillRoots = HOST_SPECIFIC_SKILL_ROOTS[projectType === "web" ? "extension" : "web"]
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
  if (
    !sameSnapshot(projectFile.snapshot, targetInventory.files.get(PROJECT_CONFIG_RELATIVE_PATH))
  ) {
    throw new Error("Target project identity changed while planning")
  }
  // 保存 lock 变量供分类使用，同时单独把原始 lock 快照写入计划 provenance。
  const lock = loadedLock?.value
  const paths = new Set<string>([
    PROJECT_CONFIG_RELATIVE_PATH,
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
  for (const inventory of [candidateInventory, targetInventory]) {
    for (const relativePath of new Set([
      ...inventory.files.keys(),
      ...inventory.directories,
      ...inventory.unsafe
    ])) {
      if (
        forbiddenSkillRoots.some(
          (root) => relativePath === root || relativePath.startsWith(`${root}/`)
        )
      ) {
        block(
          relativePath,
          "conditional",
          `Skill is not allowed for target projectType=${projectType}`
        )
      }
    }
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
  const requiredSourcePaths = [
    ...REQUIRED_MANAGED_SOURCE_PATHS,
    ...HOST_SPECIFIC_SKILL_ROOTS[projectType].flatMap((root) => [
      `${root}/SKILL.md`,
      `${root}/agents/openai.yaml`
    ])
  ]
  for (const relativePath of requiredSourcePaths) {
    const sourceSnapshot = await optionalSourceSnapshot(sourceRoot, relativePath)
    if (
      sourceSnapshot !== undefined &&
      !sameSnapshot(sourceSnapshot, candidateInventory.files.get(relativePath))
    ) {
      block(
        relativePath,
        ownershipRuleForNode(relativePath, ownership.manifest, false)?.mode ?? "managed",
        "candidate does not exactly propagate required source file"
      )
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

/** 将计划独占写到 source、候选与目标树之外的新文件。 */
export async function writeUpgradePlan(
  plan: HarnessUpgradePlan,
  outputPath: string
): Promise<void> {
  const requested = path.resolve(outputPath)
  const parent = await realDirectory(path.dirname(requested), "Upgrade plan output parent")
  const output = path.join(parent, path.basename(requested))
  if (
    [plan.sourceRoot, plan.candidateRoot, plan.targetRoot].some((root) => isNested(root, output))
  ) {
    throw new Error("Upgrade plan output must be outside source, candidate and target roots")
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
