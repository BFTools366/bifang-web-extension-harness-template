import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { HARNESS_ONLY_PATHS } from "../.harness/tooling/config.ts"
import { createUpgradePlan } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { MINIMUM_OWNERSHIP_RULES } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts"
import { ownershipPath, git, upgradeFixture, planFor } from "./harness-upgrade-fixture.ts"

/** 验证 upgrade ownership protection 的完整回归场景。 */
describe("upgrade ownership protection", () => {
  /** 验证关键 managed source helper 在候选中缺失或陈旧时均失败关闭。 */
  test("blocks missing or stale required managed source propagation", async () => {
    const fixture = await upgradeFixture()
    const requiredPath = ".harness/tooling/project-memory.ts"
    await mkdir(path.dirname(path.join(fixture.source, requiredPath)), { recursive: true })
    await writeFile(path.join(fixture.source, requiredPath), "source contract\n")
    await git(fixture.source, ["add", requiredPath])
    await git(fixture.source, ["commit", "-m", "test: add required managed source"])
    fixture.sourceCommit = await git(fixture.source, ["rev-parse", "HEAD"])

    const missingPlan = await planFor(fixture)
    expect(missingPlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: requiredPath,
          classification: "blocked",
          reason: "candidate does not exactly propagate required source file"
        })
      ])
    )

    await writeFile(path.join(fixture.candidate, requiredPath), "stale candidate\n")
    const stalePlan = await planFor(fixture)
    expect(stalePlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: requiredPath, classification: "blocked" })
      ])
    )
  })

  /** 验证未命中显式规则的候选路径按 defaultMode 失败关闭。 */
  test("treats unmatched candidate paths as protected blockers", async () => {
    const fixture = await upgradeFixture()
    await writeFile(path.join(fixture.candidate, "unowned.txt"), "must not propagate\n")

    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "unowned.txt",
          ownership: "protected",
          classification: "blocked",
          reason: "candidate path has no ownership rule"
        })
      ])
    )
    // 保存 manifest 变量供复核混合文档与默认保护契约。
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      defaultMode: string
      rules: Array<{ pattern: string; mode: string }>
    }
    expect(manifest.defaultMode).toBe("protected")
    expect(manifest.rules).toEqual(
      expect.arrayContaining([
        { pattern: "docs/DATA_ACCESS.md", mode: "merge-sections" },
        { pattern: "docs/ENGINEERING_RULES.md", mode: "merge-sections" },
        { pattern: "docs/MANTINE_UI_GUIDELINES.md", mode: "merge-sections" },
        { pattern: "docs/RELEASE.md", mode: "merge-sections" },
        { pattern: "docs/RUNTIME_CONFIGURATION.md", mode: "merge-sections" }
      ])
    )
  })

  /** 验证 source-only 清单、最低规则与生产所有权清单保持一致。 */
  test("keeps every source-only path tombstoned in both ownership policies", async () => {
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      rules: Array<{ pattern: string; mode: string }>
    }
    const manifestTombstones = new Set(
      manifest.rules.filter((rule) => rule.mode === "tombstone").map((rule) => rule.pattern)
    )
    const minimumTombstones = new Set(
      Object.entries(MINIMUM_OWNERSHIP_RULES)
        .filter(([, mode]) => mode === "tombstone")
        .map(([pattern]) => pattern)
    )

    expect(manifestTombstones).toEqual(minimumTombstones)
    for (const sourceOnlyPath of HARNESS_ONLY_PATHS) {
      const matchingPatterns = [sourceOnlyPath, `${sourceOnlyPath}/**`].filter((pattern) =>
        minimumTombstones.has(pattern)
      )
      expect(matchingPatterns, `${sourceOnlyPath} must have one tombstone rule`).toHaveLength(1)
    }
    for (const protectedConfiguration of [
      ".harness/project-memory-compatibility.json",
      ".harness/release-policy.json"
    ]) {
      expect(MINIMUM_OWNERSHIP_RULES[protectedConfiguration]).toBe("protected")
      expect(manifest.rules).toContainEqual({
        pattern: protectedConfiguration,
        mode: "protected"
      })
    }
    for (const productExtensibleDocument of [
      "docs/DATA_ACCESS.md",
      "docs/MANTINE_UI_GUIDELINES.md",
      "docs/RUNTIME_CONFIGURATION.md"
    ]) {
      expect(MINIMUM_OWNERSHIP_RULES[productExtensibleDocument]).toBe("merge-sections")
      expect(manifest.rules).toContainEqual({
        pattern: productExtensibleDocument,
        mode: "merge-sections"
      })
    }
  })

  /** 验证 Web-only 列表页 Skill 通过 conditional 规则参与升级而不弱化宿主边界。 */
  test("keeps the list-view skill conditional in both ownership policies", async () => {
    const conditionalPattern = ".agents/skills/web-implement-list-view/**"
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      rules: Array<{ pattern: string; mode: string }>
    }

    expect(MINIMUM_OWNERSHIP_RULES[conditionalPattern]).toBe("conditional")
    expect(manifest.rules.filter((rule) => rule.pattern === conditionalPattern)).toEqual([
      { pattern: conditionalPattern, mode: "conditional" }
    ])
  })

  /** 验证新增 source-only 墓碑与可选兼容记忆保护规则都会代表性阻断。 */
  test("blocks representative source-only residue and compatibility-file injection", async () => {
    const tombstoneFixture = await upgradeFixture()
    const tombstonedPath = ".harness/tooling/finalize.ts"
    await writeFile(path.join(tombstoneFixture.target, tombstonedPath), "forbidden\n")
    await git(tombstoneFixture.target, ["add", tombstonedPath])
    await git(tombstoneFixture.target, ["commit", "-m", "test: add source-only residue"])

    const tombstonePlan = await planFor(tombstoneFixture)
    expect(tombstonePlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: tombstonedPath,
          ownership: "tombstone",
          classification: "blocked"
        })
      ])
    )

    const protectedFixture = await upgradeFixture()
    const compatibilityPath = ".harness/project-memory-compatibility.json"
    await writeFile(path.join(protectedFixture.target, compatibilityPath), '{"version":1}\n')
    await git(protectedFixture.target, ["add", compatibilityPath])
    await git(protectedFixture.target, ["commit", "-m", "test: add compatibility memory"])
    const preservedPlan = await planFor(protectedFixture)
    expect(preservedPlan.entries.find((entry) => entry.path === compatibilityPath)).toBeUndefined()
    expect(preservedPlan.problems).not.toEqual(
      expect.arrayContaining([expect.stringContaining(compatibilityPath)])
    )

    await writeFile(path.join(protectedFixture.candidate, compatibilityPath), '{"version":2}\n')
    const blockedPlan = await planFor(protectedFixture)
    expect(blockedPlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: compatibilityPath,
          ownership: "protected",
          classification: "blocked"
        })
      ])
    )
  })

  /** 验证一个仓库的 helper 或策略不能替另一终端仓库授权升级。 */
  test("binds ownership policy to the exact target repository", async () => {
    const first = await upgradeFixture()
    const second = await upgradeFixture()

    await expect(
      createUpgradePlan({
        sourceRoot: second.source,
        sourceVersion: "202609090101",
        sourceCommit: second.sourceCommit,
        candidateRoot: second.candidate,
        targetRoot: second.target,
        ownershipPath: first.ownership,
        lockPath: second.lock
      })
    ).rejects.toThrow(/Ownership manifest must equal/)
    await expect(
      createUpgradePlan({
        sourceRoot: second.source,
        sourceVersion: "202609090101",
        sourceCommit: second.sourceCommit,
        candidateRoot: second.candidate,
        targetRoot: second.target,
        ownershipPath: second.ownership,
        lockPath: first.lock
      })
    ).rejects.toThrow(/Upstream lock must equal/)
  })

  /** 验证前置宽规则或局部规则不能遮蔽 protected、tombstone 或 managed-self 下限。 */
  test("rejects broad and partial rules that shadow minimum ownership semantics", async () => {
    for (const shadowingRule of [
      { pattern: "**", mode: "managed" },
      { pattern: ".agents/skills/**", mode: "managed" },
      { pattern: "src/private/**", mode: "managed" },
      { pattern: ".agents/skills/web-instantiate-project/private/**", mode: "managed" },
      { pattern: ".agents/skills/web-upgrade-harness/private/**", mode: "protected" }
    ]) {
      const fixture = await upgradeFixture()
      const manifest = JSON.parse(await readFile(fixture.ownership, "utf8")) as {
        rules: Array<{ pattern: string; mode: string }>
      }
      manifest.rules.unshift(shadowingRule)
      await writeFile(fixture.ownership, `${JSON.stringify(manifest, null, 2)}\n`)

      await expect(planFor(fixture)).rejects.toThrow(/shadows required rule/)
    }
  })

  /** 验证关键合并文件不能通过删除 required 标记弱化候选完整性。 */
  test("rejects weakened required ownership rules", async () => {
    const fixture = await upgradeFixture()
    const manifest = JSON.parse(await readFile(fixture.ownership, "utf8")) as {
      rules: Array<{ pattern: string; mode: string; required?: boolean }>
    }
    const requiredRule = manifest.rules.find((rule) => rule.pattern === "AGENTS.md")
    expect(requiredRule).toBeDefined()
    delete requiredRule?.required
    await writeFile(fixture.ownership, `${JSON.stringify(manifest, null, 2)}\n`)

    await expect(planFor(fixture)).rejects.toThrow(/AGENTS\.md must set required=true/)
  })
})
