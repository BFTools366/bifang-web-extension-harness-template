import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "vitest"
import {
  applyUpgradePath,
  recordUpgradeBaseline
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { digest, git, persistPlan, planFor, upgradeFixture } from "./harness-upgrade-fixture.ts"

/** 退役上游副本只产生显式删除或冲突，不能自动删除或触及产品会话。 */
test.each([false, true])(
  "protects retired account assets with local changes=%s",
  async (changed) => {
    const fixture = await upgradeFixture()
    const retired =
      ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/session.ts.txt"
    const product = "src/features/auth/session.ts"
    const original = "// 原有上游会话示例\n"
    const productSource = "// 产品拥有的唯一会话实现\n"
    for (const root of [fixture.candidate, fixture.target]) {
      await mkdir(path.dirname(path.join(root, retired)), { recursive: true })
      await writeFile(path.join(root, retired), original)
    }
    await mkdir(path.dirname(path.join(fixture.target, product)), { recursive: true })
    await writeFile(path.join(fixture.target, product), productSource)
    await git(fixture.target, ["add", "."])
    await git(fixture.target, ["commit", "-m", "test: 建立旧模板与产品会话基线"])
    await recordUpgradeBaseline({
      planPath: await persistPlan(fixture, "retired-bootstrap"),
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await rm(path.join(fixture.candidate, retired))
    const targetSource = changed ? "// 用户已经定制的旧模板\n" : original
    if (changed) await writeFile(path.join(fixture.target, retired), targetSource)
    const plan = await planFor(fixture)
    expect(plan.entries).toContainEqual(
      expect.objectContaining({ path: retired, classification: changed ? "conflict" : "delete" })
    )
    expect(plan.entries).not.toContainEqual(expect.objectContaining({ path: product }))
    await expect(
      applyUpgradePath({
        planPath: await persistPlan(fixture, "retired-delete"),
        path: retired,
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(changed ? /blocked by/ : /not an existing safe managed update/)
    expect(await readFile(path.join(fixture.target, retired), "utf8")).toBe(targetSource)
    expect(await readFile(path.join(fixture.target, product), "utf8")).toBe(productSource)
  }
)

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
