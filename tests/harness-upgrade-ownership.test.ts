import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { HARNESS_ONLY_PATHS } from "../.harness/tooling/config.ts"
import { walkFiles } from "../.harness/tooling/files.ts"
import {
  applyUpgradePath,
  createUpgradePlan,
  recordUpgradeBaseline
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { migrateOwnership } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-ownership-delta.ts"
import {
  MINIMUM_OWNERSHIP_RULES,
  REQUIRED_MANAGED_SOURCE_PATHS
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts"
import {
  ownershipPath,
  git,
  upgradeFixture,
  planFor,
  persistPlan
} from "./harness-upgrade-fixture.ts"

const REQUIRED_SOURCE_FILES = [
  ".agents/skills/web-define-product/SKILL.md",
  ".agents/skills/web-define-product/agents/openai.yaml",
  ".agents/skills/web-define-product/references/requirements-analysis.md",
  ".agents/skills/web-compose-capabilities/references/requirements-selection.md",
  ".agents/skills/web-compose-capabilities/catalog.json",
  ".agents/skills/web-compose-capabilities/templates/application/settings-source.ts",
  ".agents/skills/web-compose-capabilities/templates/application/files/base/SettingsPage.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/application/files/identity/SettingsLink.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/application/files/identity/identity.module.css.txt",
  ".agents/skills/web-compose-capabilities/templates/application/files/identity/AccountMenu.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/application/files/organization/OrganizationContext.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/features/client/SettingsPage.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/features/client/SettingsLink.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/features/client/settingsNavigation.ts.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/features/client/SettingsPage.test.tsx.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/routes/settings.tsx.txt",
  ".agents/skills/web-compose-capabilities/knowledge/identity.md",
  ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/session.ts.txt",
  ".agents/skills/web-compose-capabilities/templates/compositions/purchase-checkout/commerce-reference.js",
  ".agents/skills/web-review-api-contract/SKILL.md",
  ".agents/skills/web-review-api-contract/agents/openai.yaml",
  ".agents/skills/web-review-module-boundaries/SKILL.md",
  ".agents/skills/web-review-module-boundaries/agents/openai.yaml",
  ".agents/skills/web-implement-access-control/SKILL.md",
  ".agents/skills/web-implement-access-control/agents/openai.yaml",
  ".agents/skills/web-implement-write-recovery/SKILL.md",
  ".agents/skills/web-implement-write-recovery/agents/openai.yaml",
  ".agents/skills/web-implement-browser-storage/SKILL.md",
  ".agents/skills/web-implement-browser-storage/agents/openai.yaml",
  ".agents/skills/web-implement-event-stream/SKILL.md",
  ".agents/skills/web-implement-event-stream/agents/openai.yaml",
  ".agents/skills/web-manage-user-tasks/SKILL.md",
  ".agents/skills/web-manage-user-tasks/agents/openai.yaml",
  ".agents/skills/web-audit-worktrees/SKILL.md",
  ".agents/skills/web-audit-worktrees/agents/openai.yaml",
  ".agents/skills/web-audit-worktrees/references/inspection-contract.md",
  ".agents/skills/web-preview-harness-upgrade/SKILL.md",
  ".agents/skills/web-preview-harness-upgrade/agents/openai.yaml",
  ".agents/skills/web-preview-harness-upgrade/references/preview-contract.md",
  ".harness/tooling/project-memory.ts",
  ".agents/skills/web-connect-http-service/SKILL.md",
  ".agents/skills/web-connect-http-service/agents/openai.yaml",
  ".agents/skills/web-document-api/SKILL.md",
  ".agents/skills/web-document-api/agents/openai.yaml",
  ".agents/skills/web-document-api/references/export-contract.md",
  ".agents/skills/web-document-api/references/protocol-formats.md",
  ".agents/skills/web-document-api/scripts/check-export.ts",
  ".agents/skills/web-design-prototype/SKILL.md",
  ".agents/skills/web-design-prototype/agents/openai.yaml",
  ".agents/skills/web-define-product/references/prd-outline.md",
  ".agents/skills/web-design-prototype/scripts/prototype-review.ts"
]

/** 升级所有权、精确传播与迁移反例共用同一冻结计划边界，保留在此内聚测试模块。 */
describe("upgrade ownership protection", () => {
  /** 验证两宿主的候选注入和目标独有残留（含空目录、符号链接）都阻断升级写入。 */
  test.each([
    ["web", "web-review-extension-compatibility"],
    ["extension", "web-implement-list-view"]
  ] as const)("blocks wrong-host skill residue for %s: %s", async (projectType, forbidden) => {
    const fixture = await upgradeFixture()
    await writeFile(
      path.join(fixture.target, ".harness/project.json"),
      JSON.stringify({ projectType })
    )
    const relativeRoot = `.agents/skills/${forbidden}`
    for (const root of [fixture.candidate, fixture.target]) {
      const skillRoot = path.join(root, relativeRoot)
      await mkdir(skillRoot, { recursive: true })
      let plan = await planFor(fixture)
      expect(plan.entries).toContainEqual(
        expect.objectContaining({ path: relativeRoot, classification: "blocked" })
      )
      await writeFile(path.join(skillRoot, "SKILL.md"), "wrong host\n")
      plan = await planFor(fixture)
      expect(plan.entries).toContainEqual(
        expect.objectContaining({ path: `${relativeRoot}/SKILL.md`, classification: "blocked" })
      )
      const planPath = await persistPlan(
        fixture,
        `${projectType}-${root === fixture.target ? "target" : "candidate"}`
      )
      await expect(
        applyUpgradePath({
          planPath,
          path: ".harness/tooling/comment-policy.ts",
          approval: "apply-managed-changes"
        })
      ).rejects.toThrow(/blocked by/)
      await expect(
        recordUpgradeBaseline({
          planPath,
          sourceVersion: "202609090101",
          sourceCommit: fixture.sourceCommit,
          bootstrap: true,
          approval: "bootstrap-verified-baseline",
          resolvedManual: []
        })
      ).rejects.toThrow(/not converged/)
      await rm(skillRoot, { recursive: true })
      await symlink(fixture.evidence, skillRoot, process.platform === "win32" ? "junction" : "dir")
      expect((await planFor(fixture)).entries).toContainEqual(
        expect.objectContaining({ path: relativeRoot, classification: "blocked" })
      )
      await rm(skillRoot)
    }
    expect(
      (await planFor(fixture)).entries.filter((entry) => entry.classification === "blocked")
    ).toEqual([])
  })

  /** 验证宿主专用 Skill 缺失或陈旧阻断，另一宿主合法缺席不阻断。 */
  test.each([["extension", "web", "web-review-extension-compatibility"]] as const)(
    "propagates %s host skill %s: %s",
    async (host, otherHost, skill) => {
      const fixture = await upgradeFixture()
      const files = ["SKILL.md", "agents/openai.yaml"].map(
        (file) => `.agents/skills/${skill}/${file}`
      )
      for (const file of files) {
        await mkdir(path.dirname(path.join(fixture.source, file)), { recursive: true })
        await writeFile(path.join(fixture.source, file), "current review contract\n")
      }
      await git(fixture.source, ["add", "."])
      await git(fixture.source, ["commit", "-m", "test: 添加宿主专用 Skill 合同"])
      fixture.sourceCommit = await git(fixture.source, ["rev-parse", "HEAD"])
      await writeFile(
        path.join(fixture.target, ".harness/project.json"),
        JSON.stringify({ projectType: otherHost })
      )
      expect(
        (await planFor(fixture)).entries.filter((entry) => entry.classification === "blocked")
      ).toEqual([])
      await writeFile(
        path.join(fixture.target, ".harness/project.json"),
        JSON.stringify({ projectType: host })
      )
      for (const file of files) {
        expect((await planFor(fixture)).entries).toContainEqual(
          expect.objectContaining({
            path: file,
            classification: "blocked",
            ownership: "conditional"
          })
        )
        await mkdir(path.dirname(path.join(fixture.candidate, file)), { recursive: true })
        await writeFile(path.join(fixture.candidate, file), "stale\n")
        expect((await planFor(fixture)).entries).toContainEqual(
          expect.objectContaining({ path: file, classification: "blocked" })
        )
        await writeFile(path.join(fixture.candidate, file), "current review contract\n")
      }
      expect(
        (await planFor(fixture)).entries.filter((entry) => entry.classification === "blocked")
      ).toEqual([])
      const planPath = await persistPlan(fixture, "identity-bound")
      await writeFile(
        path.join(fixture.target, ".harness/project.json"),
        JSON.stringify({ projectType: otherHost })
      )
      await expect(
        applyUpgradePath({
          planPath,
          path: ".harness/tooling/comment-policy.ts",
          approval: "apply-managed-changes"
        })
      ).rejects.toThrow(/drifted/)
    }
  )
  /** 验证关键 helper 及原型 Skill 的每个文件在两宿主候选中缺失或陈旧时均失败关闭。 */
  test.each(["web", "extension"] as const)(
    "blocks missing or stale %s source files",
    async (projectType) => {
      const fixture = await upgradeFixture()
      await writeFile(
        path.join(fixture.target, ".harness/project.json"),
        JSON.stringify({ projectType })
      )
      await git(fixture.target, ["add", ".harness/project.json"])
      await git(fixture.target, ["commit", "--allow-empty", "-m", "test: set target host"])
      for (const requiredPath of REQUIRED_SOURCE_FILES) {
        await mkdir(path.dirname(path.join(fixture.source, requiredPath)), { recursive: true })
        await writeFile(path.join(fixture.source, requiredPath), "source contract\n")
      }
      await git(fixture.source, ["add", ...REQUIRED_SOURCE_FILES])
      await git(fixture.source, ["commit", "-m", "test: add required managed sources"])
      fixture.sourceCommit = await git(fixture.source, ["rev-parse", "HEAD"])

      const missingPlan = await planFor(fixture)
      for (const requiredPath of REQUIRED_SOURCE_FILES) {
        expect(missingPlan.entries).toContainEqual(
          expect.objectContaining({
            path: requiredPath,
            classification: "blocked",
            reason: "候选未精确传播必需源文件"
          })
        )
        await mkdir(path.dirname(path.join(fixture.candidate, requiredPath)), { recursive: true })
        await writeFile(path.join(fixture.candidate, requiredPath), "stale candidate\n")
      }

      const stalePlan = await planFor(fixture)
      for (const requiredPath of REQUIRED_SOURCE_FILES) {
        expect(stalePlan.entries).toContainEqual(
          expect.objectContaining({ path: requiredPath, classification: "blocked" })
        )
        await writeFile(path.join(fixture.candidate, requiredPath), "source contract\n")
      }

      const completePlan = await planFor(fixture)
      for (const requiredPath of REQUIRED_SOURCE_FILES) {
        expect(completePlan.entries.find((entry) => entry.path === requiredPath)).toMatchObject({
          classification: "add",
          ownership: "managed"
        })
      }
    }
  )

  /** 验证原型与 API 导出 Skill 的每个资源均被精确传播清单锚定。 */
  test.each([
    "web-define-product",
    "web-design-prototype",
    "web-document-api",
    "web-compose-capabilities"
  ])("anchors every %s skill file in the required propagation list", async (skill) => {
    const skillRoot = path.resolve(".agents/skills", skill)
    const actual = (await walkFiles(skillRoot)).map(
      (file) =>
        `.agents/skills/${skill}/${path.relative(skillRoot, file).split(path.sep).join("/")}`
    )
    for (const file of actual) {
      expect(REQUIRED_MANAGED_SOURCE_PATHS, `${file} must be anchored`).toContain(file)
    }
  })

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

  /** 验证旧下游清单可由代码计算精确增量，授权后只追加缺失规则，冲突与遮蔽阻断。 */
  test("migrates an old target ownership manifest by exact delta", async () => {
    const fixture = await upgradeFixture()
    const original = JSON.parse(await readFile(fixture.ownership, "utf8")) as {
      rules: Array<{ pattern: string; mode: string; required?: boolean }>
    }
    const absent = new Set([
      ".agents/skills/web-review-api-contract/**",
      ".agents/skills/web-review-module-boundaries/**",
      ".agents/skills/web-implement-access-control/**",
      ".agents/skills/web-implement-write-recovery/**",
      ".agents/skills/web-implement-browser-storage/**",
      ".agents/skills/web-implement-event-stream/**",
      ".agents/skills/web-manage-user-tasks/**",
      ".agents/skills/web-design-prototype/**",
      "docs/prototypes/**",
      ".agents/skills/web-document-api/**",
      "docs/api/**",
      ".agents/skills/web-connect-http-service/**",
      ".agents/skills/web-audit-worktrees/**",
      ".agents/skills/web-preview-harness-upgrade/**",
      ".agents/skills/web-review-extension-compatibility/**",
      "tests/prototype-workflow.test.ts"
    ])
    const old = { ...original, rules: original.rules.filter((rule) => !absent.has(rule.pattern)) }
    await writeFile(fixture.ownership, `${JSON.stringify(old, null, 2)}\n`)

    const preview = await migrateOwnership({ targetOwnershipPath: fixture.ownership })
    expect(preview.written).toBe(false)
    expect(new Set(preview.delta.missing.map((rule) => rule.pattern))).toEqual(absent)
    expect(await readFile(fixture.ownership, "utf8")).toBe(`${JSON.stringify(old, null, 2)}\n`)

    const applied = await migrateOwnership({
      targetOwnershipPath: fixture.ownership,
      approval: "migrate-ownership-delta"
    })
    expect(applied.written).toBe(true)
    const migrated = JSON.parse(await readFile(fixture.ownership, "utf8")) as typeof old
    expect(migrated.rules.slice(0, old.rules.length)).toEqual(old.rules)
    expect(migrated.rules.slice(old.rules.length).map((rule) => rule.pattern)).toEqual(
      preview.delta.missing.map((rule) => rule.pattern)
    )
    await expect(migrateOwnership({ targetOwnershipPath: fixture.ownership })).resolves.toEqual({
      delta: { missing: [], conflicts: [], shadowed: [] },
      written: false
    })

    const shadowed = { ...old, rules: [{ pattern: "docs/**", mode: "protected" }, ...old.rules] }
    await writeFile(fixture.ownership, `${JSON.stringify(shadowed, null, 2)}\n`)
    await expect(
      migrateOwnership({ targetOwnershipPath: fixture.ownership, approval: "migrate" })
    ).rejects.toThrow(/conflicts or shadowed/)
  })

  /** 验证漏分发原型 Skill 时，其他 managed 文件不能先更新，基线也不能被记录。 */
  test("blocks managed writes and baseline recording when the prototype helper is omitted", async () => {
    const fixture = await upgradeFixture()
    const bootstrap = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrap,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    const requiredPath = ".agents/skills/web-design-prototype/scripts/prototype-review.ts"
    await mkdir(path.dirname(path.join(fixture.source, requiredPath)), { recursive: true })
    await writeFile(path.join(fixture.source, requiredPath), "new prototype helper\n")
    await git(fixture.source, ["add", requiredPath])
    await git(fixture.source, ["commit", "-m", "test: add prototype helper"])
    fixture.sourceCommit = await git(fixture.source, ["rev-parse", "HEAD"])
    const managedPath = ".harness/tooling/comment-policy.ts"
    await writeFile(path.join(fixture.candidate, managedPath), "upstream update\n")
    const planPath = await persistPlan(fixture, "missing-prototype")
    await expect(
      applyUpgradePath({ planPath, path: managedPath, approval: "apply-managed-changes" })
    ).rejects.toThrow(/blocked by/)
    await expect(
      recordUpgradeBaseline({
        planPath,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: []
      })
    ).rejects.toThrow(/not converged/)
    expect(await readFile(path.join(fixture.target, managedPath), "utf8")).toBe("baseline\n")
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
          reason: "候选路径没有所有权规则"
        })
      ])
    )
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
