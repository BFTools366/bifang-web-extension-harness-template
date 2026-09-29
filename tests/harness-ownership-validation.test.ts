import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "vitest"
import {
  MINIMUM_OWNERSHIP_RULES,
  MINIMUM_REQUIRED_OWNERSHIP_PATTERNS
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts"
import {
  REQUIRED_UPGRADE_REQUIRED_PATTERNS,
  REQUIRED_UPGRADE_RULES,
  validateUpgradeOwnership
} from "../scripts/harness-validation/upgrade-ownership.ts"

/** 验证源门禁与生产升级器分别锚定当前所有权清单。 */
test("keeps an independent upgrade ownership baseline", () => {
  expect(REQUIRED_UPGRADE_RULES).not.toBe(MINIMUM_OWNERSHIP_RULES)
  expect(REQUIRED_UPGRADE_RULES).toEqual(MINIMUM_OWNERSHIP_RULES)
  expect(REQUIRED_UPGRADE_REQUIRED_PATTERNS).not.toBe(MINIMUM_REQUIRED_OWNERSHIP_PATTERNS)
  expect(REQUIRED_UPGRADE_REQUIRED_PATTERNS).toEqual(MINIMUM_REQUIRED_OWNERSHIP_PATTERNS)
})

/** 验证运行时规则与清单同步弱化时，源独立门禁仍拒绝源专用和通用 Skill 路径。 */
test.each(["scripts/instantiate.ts", ".agents/skills/web-test-final-artifact-e2e/**"])(
  "rejects coordinated ownership weakening for %s",
  async (pattern) => {
    const runtimeRules = MINIMUM_OWNERSHIP_RULES as Record<string, string>
    const originalMode = runtimeRules[pattern]
    if (originalMode === undefined) throw new Error(`Missing runtime ownership rule: ${pattern}`)
    const root = await mkdtemp(path.join(os.tmpdir(), "web-harness-ownership-anchor-"))
    try {
      const relativePath = ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
      const manifestPath = path.join(root, relativePath)
      const sourcePath = path.resolve(import.meta.dirname, "..", relativePath)
      const manifest = JSON.parse(await readFile(sourcePath, "utf8")) as {
        rules: Array<{ pattern: string; mode: string }>
      }
      const targetRule = manifest.rules.find((rule) => rule.pattern === pattern)
      if (targetRule === undefined) throw new Error(`Missing manifest ownership rule: ${pattern}`)
      targetRule.mode = "protected"
      await mkdir(path.dirname(manifestPath), { recursive: true })
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      runtimeRules[pattern] = "protected"
      try {
        const errors: string[] = []
        await validateUpgradeOwnership(root, errors)
        expect(errors.join("\n")).toContain(
          `Independent ownership rule weakened: ${pattern} must be ${originalMode}`
        )
      } finally {
        runtimeRules[pattern] = originalMode
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
