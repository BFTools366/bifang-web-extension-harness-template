import { readFile } from "node:fs/promises"
import { writeJsonAtomic } from "../../../../.harness/tooling/files.ts"
import { ownershipPatternsOverlap } from "./upgrade-glob.ts"
import { MINIMUM_OWNERSHIP_RULES, MINIMUM_REQUIRED_OWNERSHIP_PATTERNS } from "./upgrade-policy.ts"
import { validateOwnershipManifest } from "./upgrade-snapshot.ts"
import type { OwnershipManifest, OwnershipMode, OwnershipRule } from "./upgrade-types.ts"

/** 描述目标本地清单相对当前 helper 最低规则的精确差异。 */
export interface OwnershipDelta {
  /** 保存目标尚未登记、可以追加的规则。 */
  missing: OwnershipRule[]
  /** 保存模式与最低规则不同的既有规则，必须人工处理。 */
  conflicts: { pattern: string; expected: OwnershipMode; actual: OwnershipMode }[]
  /** 保存追加后会被目标既有前置规则遮蔽的缺失规则。 */
  shadowed: { pattern: string; by: string }[]
}

/** 保存迁移命令的结果；written 仅在获授权且无冲突时为 true。 */
export interface OwnershipMigration {
  delta: OwnershipDelta
  written: boolean
}

/** 只做结构读取，不套用最低规则下限，旧清单正是因缺失新规则而无法通过完整校验。 */
function parseLocalManifest(value: unknown): OwnershipManifest {
  const manifest = value as Partial<OwnershipManifest> | null
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    manifest.schemaVersion !== 1 ||
    manifest.defaultMode !== "protected" ||
    !Array.isArray(manifest.rules)
  ) {
    throw new Error("Target ownership manifest schema is invalid")
  }
  return manifest as OwnershipManifest
}

/** 计算目标清单缺失、冲突与被遮蔽的最低规则；保持目标已有规则与顺序不变。 */
export function computeOwnershipDelta(target: OwnershipManifest): OwnershipDelta {
  const existing = new Map(target.rules.map((rule) => [rule.pattern, rule]))
  const delta: OwnershipDelta = { missing: [], conflicts: [], shadowed: [] }
  for (const [pattern, mode] of Object.entries(MINIMUM_OWNERSHIP_RULES)) {
    const current = existing.get(pattern)
    if (current !== undefined) {
      if (current.mode !== mode)
        delta.conflicts.push({ pattern, expected: mode, actual: current.mode })
      continue
    }
    const shadowing = target.rules.find((rule) => ownershipPatternsOverlap(rule.pattern, pattern))
    if (shadowing !== undefined) {
      delta.shadowed.push({ pattern, by: shadowing.pattern })
      continue
    }
    delta.missing.push(
      MINIMUM_REQUIRED_OWNERSHIP_PATTERNS.has(pattern)
        ? { pattern, mode, required: true }
        : { pattern, mode }
    )
  }
  return delta
}

/** 默认只读展示差异；提供 approval 且无冲突或遮蔽时才把缺失规则追加到目标清单末尾。 */
export async function migrateOwnership(options: {
  targetOwnershipPath: string
  approval?: string
}): Promise<OwnershipMigration> {
  const target = parseLocalManifest(JSON.parse(await readFile(options.targetOwnershipPath, "utf8")))
  const delta = computeOwnershipDelta(target)
  const blocked = delta.conflicts.length > 0 || delta.shadowed.length > 0
  if (options.approval === undefined || delta.missing.length === 0) return { delta, written: false }
  if (blocked) throw new Error("Ownership delta has conflicts or shadowed rules; resolve manually")
  const merged: OwnershipManifest = { ...target, rules: [...target.rules, ...delta.missing] }
  // 合并结果必须通过当前 helper 的完整下限校验后才写入，证明增量补齐了全部最低规则。
  validateOwnershipManifest(merged)
  await writeJsonAtomic(options.targetOwnershipPath, merged)
  return { delta, written: true }
}
