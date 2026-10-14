import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  applyUpgradePath,
  recordUpgradeBaseline,
  writeUpgradePlan
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import {
  captureStablePath,
  runBoundAtomicMutation
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-mutation.ts"
import { runUpgradeCli } from "../.agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
import { createSymlinkOrSkip } from "./setup.ts"
import {
  execFileAsync,
  temporaryRoots,
  digest,
  git,
  upgradeFixture,
  planFor,
  persistPlan,
  planCliArguments
} from "./harness-upgrade-fixture.ts"

/** 验证 three-way Harness upgrade 的完整回归场景。 */
describe("three-way Harness upgrade", () => {
  /** 验证项目设计支持、业务原型、用户选择与模块接口文档不进入候选，升级原样保留目标内容。 */
  test.each([
    [".agents/skills/design-taste-frontend", "SKILL.md"],
    ["docs/prototypes", "settings/review.json"],
    ["docs/api", "orders.md"],
    ["docs/api", "api/metadata.md"],
    ["docs/api", "business/orders.md"]
  ])(
    "excludes protected content under %s from the upgrade projection",
    async (protectedRoot, filename) => {
      const fixture = await upgradeFixture()
      const relativePath = `${protectedRoot}/${filename}`
      const existing = "User maintained design support\n"
      await mkdir(path.dirname(path.join(fixture.target, relativePath)), { recursive: true })
      await writeFile(path.join(fixture.target, relativePath), existing)
      await git(fixture.target, ["add", relativePath])
      await git(fixture.target, ["commit", "-m", "test: add user design support"])
      const projected = await planFor(fixture)
      expect(projected.entries).not.toContainEqual(expect.objectContaining({ path: relativePath }))
      expect(projected.problems).toEqual([])
      await mkdir(path.dirname(path.join(fixture.candidate, relativePath)), { recursive: true })
      await writeFile(path.join(fixture.candidate, relativePath), "Unapproved upstream version\n")
      const blocked = await planFor(fixture)
      expect(blocked.entries).toContainEqual(
        expect.objectContaining({
          path: relativePath,
          ownership: "protected",
          classification: "blocked"
        })
      )
      await rm(path.join(fixture.candidate, protectedRoot), {
        recursive: true
      })
      const reprojected = await planFor(fixture)
      expect(reprojected.entries).not.toContainEqual(
        expect.objectContaining({ path: relativePath })
      )
      expect(reprojected.problems).toEqual([])
      expect(await readFile(path.join(fixture.target, relativePath), "utf8")).toBe(existing)
    }
  )

  /** 验证真实规模的计划与基线超过管道缓冲区后仍能完整读取并继续规划。 */
  test("replans a baseline larger than the child stdout buffer", async () => {
    const fixture = await upgradeFixture()
    const relativeRoot = ".agents/skills/web-define-product/references"
    await Promise.all(
      [fixture.target, fixture.candidate].map(async (root) => {
        const directory = path.join(root, relativeRoot)
        await mkdir(directory, { recursive: true })
        await Promise.all(
          Array.from({ length: 220 }, (_, index) =>
            writeFile(path.join(directory, `contract-${index}.md`), "# Shared contract\n")
          )
        )
      })
    )
    const planPath = await persistPlan(fixture, "large-bootstrap")
    await recordUpgradeBaseline({
      planPath,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    expect((await readFile(fixture.lock)).length).toBeGreaterThan(64 * 1024)
    expect(await planFor(fixture)).toMatchObject({
      bootstrap: false,
      blocked: false,
      manualRequired: false,
      problems: []
    })
  })

  /** 验证 bootstrap、单路径 managed 更新、重规划和基线记录闭环。 */
  test("applies one reviewed managed update and records a converged baseline", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    const updatePlan = await persistPlan(fixture, "update")

    await expect(
      applyUpgradePath({
        planPath: updatePlan,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).resolves.toMatchObject({ classification: "update", ownership: "managed" })
    expect(
      await readFile(path.join(fixture.target, ".harness/tooling/comment-policy.ts"), "utf8")
    ).toBe("upstream update\n")

    const convergedPlan = await persistPlan(fixture, "converged")
    await expect(
      recordUpgradeBaseline({
        planPath: convergedPlan,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: []
      })
    ).resolves.toMatchObject({ sourceCommit: fixture.sourceCommit })
  })

  /** 验证 mixed 路径允许显式人工收敛，但不会自动覆盖目标内容。 */
  test("records an explicitly reviewed target-specific manual merge", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(path.join(fixture.candidate, "README.md"), "# Upstream contract\n")
    await writeFile(path.join(fixture.target, "README.md"), "# Product plus upstream contract\n")
    const manualPlan = await planFor(fixture)
    expect(manualPlan.entries.find((entry) => entry.path === "README.md")).toMatchObject({
      classification: "manual_merge",
      ownership: "merge-sections"
    })
    expect(manualPlan).toMatchObject({
      blocked: false,
      manualRequired: true,
      problems: []
    })
    const planPath = path.join(fixture.evidence, "manual.json")
    await writeUpgradePlan(manualPlan, planPath)

    await expect(
      recordUpgradeBaseline({
        planPath,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: ["README.md"]
      })
    ).resolves.toBeDefined()
    expect(await readFile(path.join(fixture.target, "README.md"), "utf8")).toBe(
      "# Product plus upstream contract\n"
    )
  })

  /** 验证 tombstone 或缺失 required 候选会阻断任何自动应用。 */
  test("blocks tombstones and missing required candidate files", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    await mkdir(path.join(fixture.target, "scripts"))
    await writeFile(path.join(fixture.target, "scripts/instantiate.ts"), "forbidden\n")
    await rm(path.join(fixture.candidate, "package.json"))
    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "package.json", classification: "blocked" }),
        expect.objectContaining({ path: "scripts/instantiate.ts", classification: "blocked" })
      ])
    )
    expect(plan).toMatchObject({
      blocked: true,
      manualRequired: false,
      problems: expect.arrayContaining([
        expect.stringMatching(/^package\.json: /),
        expect.stringMatching(/^scripts\/instantiate\.ts: /)
      ])
    })
    const planPath = path.join(fixture.evidence, "blocked.json")
    await writeUpgradePlan(plan, planPath)

    await expect(
      applyUpgradePath({
        planPath,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/blocked by/)
  })

  /** 验证计划 JSON 或候选事实漂移后不会发生路径写入。 */
  test("rejects stale or tampered plan evidence", async () => {
    const fixture = await upgradeFixture()
    const planPath = await persistPlan(fixture, "stale")
    await writeFile(path.join(fixture.candidate, "AGENTS.md"), "# Changed after plan\n")

    await expect(
      recordUpgradeBaseline({
        planPath,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: true,
        approval: "bootstrap-verified-baseline",
        resolvedManual: []
      })
    ).rejects.toThrow(/facts have drifted/)
  })

  /** 验证计划绑定 lock 原始字节，拒绝仅篡改其元数据后继续写入。 */
  test("rejects upstream lock metadata drift after planning", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap-lock")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    const updatePlan = await persistPlan(fixture, "lock-bound-update")
    // 保存 lock 变量供只改 provenance、保留逐路径双基线使用。
    const lock = JSON.parse(await readFile(fixture.lock, "utf8")) as Record<string, unknown>
    lock.sourceCommit = "0".repeat(40)
    await writeFile(fixture.lock, `${JSON.stringify(lock, null, 2)}\n`)

    await expect(
      applyUpgradePath({
        planPath: updatePlan,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/facts have drifted/)
    await expect(
      recordUpgradeBaseline({
        planPath: updatePlan,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: []
      })
    ).rejects.toThrow(/facts have drifted/)
  })

  /** 验证以符号链接伪装的 tombstone 目录根仍会阻断计划。 */
  test("blocks a tombstoned directory root represented by a symlink", async (context) => {
    const fixture = await upgradeFixture()
    const tombstoneRoot = path.join(fixture.target, ".agents/skills/web-instantiate-project")
    await mkdir(path.dirname(tombstoneRoot), { recursive: true })
    await createSymlinkOrSkip(context, fixture.evidence, tombstoneRoot, "dir")

    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".agents/skills/web-instantiate-project",
          ownership: "tombstone",
          classification: "blocked"
        })
      ])
    )
  })

  /** 验证父目录在捕获后被替换为符号链接时不会写入攻击者目录。 */
  test("binds atomic mutation to the captured parent inode", async (context) => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "web-upgrade-parent-"))
    temporaryRoots.push(parent)
    const stable = path.join(parent, "stable")
    const displaced = path.join(parent, "displaced")
    const attacker = path.join(parent, "attacker")
    await Promise.all([mkdir(stable), mkdir(attacker)])
    const target = path.join(stable, "managed.ts")
    const original = Buffer.from("original\n")
    await writeFile(target, original)
    const identity = await captureStablePath(parent, "stable/managed.ts")
    await rename(stable, displaced)
    await createSymlinkOrSkip(context, attacker, stable, "dir")

    const replacement = Buffer.from("replacement\n")
    expect(() =>
      runBoundAtomicMutation(
        identity,
        replacement,
        { sha256: digest(original), mode: 0o644 },
        0o644,
        digest(replacement)
      )
    ).toThrow(/bound path parent is not a real directory/)
    await expect(readFile(path.join(attacker, "managed.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
    expect(await readFile(path.join(displaced, "managed.ts"), "utf8")).toBe("original\n")
  })

  /** 验证多个 managed-self 按路径稳定更新，且 CLI runner 始终最后。 */
  test("applies managed-self files in stable order with the runner last", async () => {
    const fixture = await upgradeFixture()
    const selfFiles = [
      ".agents/skills/web-upgrade-harness/scripts/a-policy.ts",
      ".agents/skills/web-upgrade-harness/scripts/z-types.ts",
      ".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
    ]
    for (const root of [fixture.candidate, fixture.target]) {
      await mkdir(
        path.dirname(path.join(root, ".agents/skills/web-upgrade-harness/scripts/a-policy.ts")),
        { recursive: true }
      )
      for (const relativePath of selfFiles) {
        await writeFile(path.join(root, relativePath), "baseline\n")
      }
    }
    const bootstrapPlan = await persistPlan(fixture, "self-bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    for (const relativePath of selfFiles) {
      await writeFile(path.join(fixture.candidate, relativePath), `updated:${relativePath}\n`)
    }

    let currentPlan = await persistPlan(fixture, "self-order-one")
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[2] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/a-policy\.ts before/)
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[1] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/a-policy\.ts before/)
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[0] ?? "",
      approval: "apply-managed-changes"
    })

    currentPlan = await persistPlan(fixture, "self-order-two")
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[2] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/z-types\.ts before/)
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[1] ?? "",
      approval: "apply-managed-changes"
    })

    currentPlan = await persistPlan(fixture, "self-order-three")
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[2] ?? "",
      approval: "apply-managed-changes"
    })
    for (const relativePath of selfFiles) {
      expect(await readFile(path.join(fixture.target, relativePath), "utf8")).toBe(
        `updated:${relativePath}\n`
      )
    }
  })

  /** 验证 CLI 计划输出目录不能通过符号链接绕过真实目录检查。 */
  test("rejects a symlinked plan output ancestor", async (context) => {
    const fixture = await upgradeFixture()
    const linkedTarget = path.join(fixture.evidence, "linked-target")
    await createSymlinkOrSkip(context, fixture.target, linkedTarget, "dir")
    await expect(
      runUpgradeCli(planCliArguments(fixture, path.join(linkedTarget, "linked-plan.json")))
    ).rejects.toThrow(/real directory/)
  })
  /** 验证新增依赖先到位，旧目标和更新后目标的真实 CLI 都能重新启动。 */
  test("converges new self helpers before replacing the running core", async () => {
    const fixture = await upgradeFixture()
    const directory = ".agents/skills/web-upgrade-harness/scripts"
    const core = directory + "/upgrade-core.ts"
    const runner = directory + "/harness-upgrade.ts"
    const helper = directory + "/upgrade-snapshot.ts"
    for (const root of [fixture.candidate, fixture.target]) {
      await mkdir(path.join(root, directory), { recursive: true })
      await writeFile(path.join(root, core), 'export const stage = "old"\n')
      await writeFile(
        path.join(root, runner),
        'import { stage } from "./upgrade-core.ts"\nconsole.log(stage)\n'
      )
    }
    await recordUpgradeBaseline({
      planPath: await persistPlan(fixture, "helper-bootstrap"),
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, core),
      'export { stage } from "./upgrade-snapshot.ts"\n'
    )
    await writeFile(path.join(fixture.candidate, helper), 'export const stage = "new"\n')
    await expect(
      applyUpgradePath({
        planPath: await persistPlan(fixture, "missing-helper"),
        path: core,
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/managed-self additions must converge/)
    expect(
      (
        await execFileAsync(process.execPath, [path.join(fixture.target, runner)], {
          cwd: fixture.target
        })
      ).stdout.trim()
    ).toBe("old")
    // 模拟已批准的新增路径手工合并，随后以新计划执行现有文件更新。
    await writeFile(
      path.join(fixture.target, helper),
      await readFile(path.join(fixture.candidate, helper))
    )
    await applyUpgradePath({
      planPath: await persistPlan(fixture, "helper-present"),
      path: core,
      approval: "apply-managed-changes"
    })
    expect(
      (
        await execFileAsync(process.execPath, [path.join(fixture.target, runner)], {
          cwd: fixture.target
        })
      ).stdout.trim()
    ).toBe("new")
  })
})

/** 已清理的废弃 Skill 可以安全退役旧所有权基线，任一实际残留仍阻断。 */
test("retires cleared tombstones from historical ownership baselines", async () => {
  const fixture = await upgradeFixture()
  const retired = ".agents/skills/web-implement-saas-auth/SKILL.md"
  const bootstrap = await persistPlan(fixture, "retire-bootstrap")
  await recordUpgradeBaseline({
    planPath: bootstrap,
    sourceVersion: "202609090101",
    sourceCommit: fixture.sourceCommit,
    bootstrap: true,
    approval: "bootstrap-verified-baseline",
    resolvedManual: []
  })
  const lock = JSON.parse(await readFile(fixture.lock, "utf8"))
  lock.files[retired] = {
    ownership: "conditional",
    candidate: { sha256: digest(Buffer.from("retired\n")), mode: 0o644 },
    target: { sha256: digest(Buffer.from("retired\n")), mode: 0o644 }
  }
  await writeFile(fixture.lock, JSON.stringify(lock))
  await git(fixture.target, ["add", "."])
  await git(fixture.target, ["commit", "-m", "test: 记录历史退役基线"])
  for (const root of [fixture.candidate, fixture.target]) {
    await mkdir(path.dirname(path.join(root, retired)), { recursive: true })
    await writeFile(path.join(root, retired), "retired\n")
    expect((await planFor(fixture)).entries).toContainEqual(
      expect.objectContaining({ path: retired, ownership: "tombstone", classification: "blocked" })
    )
    await rm(path.dirname(path.join(root, retired)), { recursive: true })
  }
  expect((await planFor(fixture)).entries).toContainEqual(
    expect.objectContaining({ path: retired, ownership: "tombstone", classification: "unchanged" })
  )
  const planPath = await persistPlan(fixture, "retire-record")
  await recordUpgradeBaseline({
    planPath,
    sourceVersion: "202609090101",
    sourceCommit: fixture.sourceCommit,
    bootstrap: false,
    approval: "record-verified-baseline",
    resolvedManual: []
  })
  expect(JSON.parse(await readFile(fixture.lock, "utf8")).files).not.toHaveProperty(retired)
})
