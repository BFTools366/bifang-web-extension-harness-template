import path from "node:path"
import { BLOCKING_UPGRADE_CLASSIFICATIONS, UPSTREAM_LOCK_RELATIVE_PATH } from "./upgrade-policy.ts"
import { writeBoundFileAtomic } from "./upgrade-mutation.ts"
import type {
  ApplyUpgradeOptions,
  HarnessUpgradePlan,
  RecordUpgradeOptions,
  UpgradeFileSnapshot,
  UpgradePlanEntry,
  UpstreamLock,
  UpstreamLockEntry
} from "./upgrade-types.ts"
import {
  sha256,
  regularFile,
  exactControlPath,
  readBoundFile,
  validFileSnapshot,
  loadLock,
  assertControlSnapshots,
  sameSnapshot
} from "./upgrade-snapshot.ts"
import { createUpgradePlan } from "./upgrade-planning.ts"

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
    /** 新增自更新依赖必须先手工收敛，避免下一轮目标 CLI 无法启动。 */
    const missingHelpers = plan.entries.filter(
      (candidate) => candidate.ownership === "managed-self" && candidate.classification === "add"
    )
    if (missingHelpers.length > 0) {
      throw new Error(
        `managed-self additions must converge before self updates: ${missingHelpers.map((candidate) => candidate.path).join(", ")}`
      )
    }
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
/** 保持原入口的公开函数与常量兼容。 */
export { validateOwnershipManifest } from "./upgrade-snapshot.ts"

/** 保持原入口的公开函数与常量兼容。 */
export { createUpgradePlan, writeUpgradePlan } from "./upgrade-planning.ts"
