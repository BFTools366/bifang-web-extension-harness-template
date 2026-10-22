import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { HARNESS_ONLY_PATHS } from "../.harness/tooling/config.ts"
import { MINIMUM_OWNERSHIP_RULES } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts"
import { ownershipPath, upgradeFixture, planFor } from "./harness-upgrade-fixture.ts"

/** 所有权策略、清单与源独立墓碑之间的静态一致性，与冻结计划回归分开维护。 */
describe("upgrade ownership policy consistency", () => {
  /** 验证磁盘上的每个 Skill 目录都被所有权清单显式覆盖，新增 Skill 漏登记会失败。 */
  test("covers every on-disk skill directory with an ownership rule", async () => {
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      rules: Array<{ pattern: string }>
    }
    const patterns = new Set(manifest.rules.map((rule) => rule.pattern))
    const skills = await readdir(path.resolve(".agents/skills"))
    for (const skill of skills) {
      expect(patterns, `${skill} must have an ownership rule`).toContain(
        `.agents/skills/${skill}/**`
      )
    }
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
    // 仍存在于源的测试墓碑必须同时登记为源专用，否则终端会携带缺少 fixture 的源回归。
    for (const pattern of minimumTombstones) {
      if (!pattern.startsWith("tests/")) continue
      const exists = await readFile(path.join(import.meta.dirname, "..", pattern)).then(
        () => true,
        () => false
      )
      if (exists) expect(HARNESS_ONLY_PATHS, pattern).toContain(pattern)
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
      "docs/API.md",
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

  /** 验证 Web-only Skill 通过 conditional 规则参与升级而不弱化宿主边界。 */
  test.each(["web-implement-list-view"])(
    "keeps %s conditional in both ownership policies",
    async (skill) => {
      const conditionalPattern = `.agents/skills/${skill}/**`
      const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
        rules: Array<{ pattern: string; mode: string }>
      }

      expect(MINIMUM_OWNERSHIP_RULES[conditionalPattern]).toBe("conditional")
      expect(manifest.rules.filter((rule) => rule.pattern === conditionalPattern)).toEqual([
        { pattern: conditionalPattern, mode: "conditional" }
      ])
    }
  )

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

/** 验证旧产品模式 Skill 在两宿主均作为墓碑阻断重新注入。 */
test.each(["web-implement-saas-auth", "web-implement-saas-admin", "web-implement-saas-commerce"])(
  "obsolete mode skill is a tombstone: %s",
  async (skill) => {
    const fixture = await upgradeFixture()
    const relative = `.agents/skills/${skill}/SKILL.md`
    expect(MINIMUM_OWNERSHIP_RULES[`.agents/skills/${skill}/**`]).toBe("tombstone")
    for (const host of ["web", "extension"]) {
      await writeFile(
        path.join(fixture.target, ".harness/project.json"),
        JSON.stringify({ projectType: host })
      )
      await mkdir(path.dirname(path.join(fixture.candidate, relative)), { recursive: true })
      await writeFile(path.join(fixture.candidate, relative), "obsolete product mode\n")
      expect((await planFor(fixture)).entries).toContainEqual(
        expect.objectContaining({
          path: relative,
          ownership: "tombstone",
          classification: "blocked"
        })
      )
      await rm(path.dirname(path.join(fixture.candidate, relative)), { recursive: true })
    }
  }
)
