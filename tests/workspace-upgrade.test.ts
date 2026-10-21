import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  applyUpgradePath,
  recordUpgradeBaseline
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { assertControlSnapshots } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import { WORKSPACE_OWNERSHIP_RULES } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-workspace.ts"
import {
  git,
  planFor,
  persistPlan,
  upgradeFixture,
  writeProjectFiles
} from "./harness-upgrade-fixture.ts"

/** 创建真实 Git Workspace 与根/成员独立的工程候选，Go 只作为受保护哨兵。 */
async function workspaceFixture(type: "web" | "extension" = "web") {
  const fixture = await upgradeFixture()
  const frontend = `example_${type}`
  const workspace = {
    schemaVersion: 1,
    kind: "workspace",
    id: "example",
    name: "Example",
    initializedAt: "2026-10-21T00:00:00Z",
    members: [
      { type, directory: frontend },
      { type: "server", directory: "example_server" }
    ],
    service: { mode: "create", developmentBaseUrl: "http://127.0.0.1:8080" }
  }
  await rm(path.join(fixture.target, ".harness/project.json"))
  await writeFile(path.join(fixture.target, ".harness/workspace.json"), JSON.stringify(workspace))
  await mkdir(path.join(fixture.target, "example_server"))
  await writeFile(
    path.join(fixture.target, "example_server/config.yaml"),
    "private provider config\n"
  )
  await writeProjectFiles(path.join(fixture.target, frontend))
  await writeProjectFiles(path.join(fixture.candidate, frontend))
  await writeFile(
    path.join(fixture.target, frontend, ".harness/project.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectType: type,
      id: frontend
    })
  )
  for (const root of [fixture.target, fixture.candidate]) {
    await mkdir(path.join(root, ".harness/runtime"), { recursive: true })
    await writeFile(path.join(root, ".harness/runtime/workspace.mjs"), "// runtime baseline\n")
  }
  await git(fixture.target, ["add", "."])
  await git(fixture.target, ["commit", "-m", "test: workspace baseline"])
  return { ...fixture, frontend, workspace }
}

/** 记录已核验、字节相同的首次双基线。 */
async function bootstrap(fixture: Awaited<ReturnType<typeof workspaceFixture>>) {
  await recordUpgradeBaseline({
    planPath: await persistPlan(fixture, "bootstrap"),
    sourceVersion: "202609090101",
    sourceCommit: fixture.sourceCommit,
    bootstrap: true,
    approval: "bootstrap-verified-baseline",
    resolvedManual: []
  })
}

describe("Workspace Harness upgrade", () => {
  /** 秘密环境只登记路径，不能被保护默认值静默忽略。 */
  test.each([".env", "example_web/.env.local", "example_web/.env.production.local"])(
    "blocks target secret presence at %s",
    async (file) => {
      const fixture = await workspaceFixture()
      await writeFile(path.join(fixture.target, file), "private\n")
      const plan = await planFor(fixture)
      expect(plan.entries.find((entry) => entry.path === file)?.classification).toBe("blocked")
    }
  )
  /** 不能把旧单包 lock 套到根拓扑后静默丢失基线。 */
  test("rejects a standalone baseline in a Workspace", async () => {
    const fixture = await workspaceFixture()
    await bootstrap(fixture)
    const lock = JSON.parse(await readFile(fixture.lock, "utf8"))
    delete lock.workspace
    await writeFile(fixture.lock, JSON.stringify(lock))
    await expect(planFor(fixture)).rejects.toThrow(/topology/u)
  })
  /** 同一根基线覆盖宿主成员，真实应用前后不触碰 Go 和用户改动。 */
  test.each(["web", "extension"] as const)(
    "updates %s tooling through the root lock",
    async (type) => {
      const fixture = await workspaceFixture(type)
      await bootstrap(fixture)
      const changed = `${fixture.frontend}/.harness/tooling/comment-policy.ts`
      await writeFile(path.join(fixture.candidate, changed), "// newer tooling\n")
      await writeFile(path.join(fixture.target, "README.md"), "# Local product instructions\n")
      const plan = await planFor(fixture)
      expect(plan.blocked).toBe(false)
      expect(plan.entries.find((entry) => entry.path === changed)?.classification).toBe("update")
      expect(plan.entries.some((entry) => entry.path.startsWith("example_server/"))).toBe(false)
      await applyUpgradePath({
        planPath: await persistPlan(fixture, "apply"),
        path: changed,
        approval: "apply-managed-changes"
      })
      expect(await readFile(path.join(fixture.target, changed), "utf8")).toBe("// newer tooling\n")
      expect(await readFile(path.join(fixture.target, "README.md"), "utf8")).toBe(
        "# Local product instructions\n"
      )
      expect(await readFile(path.join(fixture.target, "example_server/config.yaml"), "utf8")).toBe(
        "private provider config\n"
      )
    }
  )

  /** 所有身份均为写前控制文件，已脏身份的内容改变也必须失败。 */
  test.each([".harness/workspace.json", "example_web/.harness/project.json"])(
    "rejects identity drift at %s",
    async (file) => {
      const fixture = await workspaceFixture()
      await bootstrap(fixture)
      const plan = await planFor(fixture)
      const savedPlan = await persistPlan(fixture, "before-drift")
      await writeFile(path.join(fixture.target, file), "{}\n")
      await expect(assertControlSnapshots(plan)).rejects.toThrow()
      await expect(
        recordUpgradeBaseline({
          planPath: savedPlan,
          sourceVersion: "202609090101",
          sourceCommit: fixture.sourceCommit,
          bootstrap: false,
          approval: "record-verified-baseline",
          resolvedManual: []
        })
      ).rejects.toThrow()
    }
  )

  /** 候选完整扫描，不能通过规则扩张注入服务器或前端业务与秘密。 */
  test.each([
    "example_server/config.yaml",
    "example_web/src/account.ts",
    "example_web/.env.local",
    "example_web/pnpm-workspace.yaml",
    "example_web/.harness/upstream-lock.json",
    ".harness/runtime/other.mjs"
  ])("blocks candidate injection at %s", async (file) => {
    const fixture = await workspaceFixture()
    await mkdir(path.dirname(path.join(fixture.candidate, file)), { recursive: true })
    await writeFile(path.join(fixture.candidate, file), "injected\n")
    const plan = await planFor(fixture)
    expect(plan.entries.find((entry) => entry.path === file)?.classification).toBe("blocked")
  })

  /** 不读取受保护目录中的链接，独立成员路径和身份必须精确登记。 */
  test("rejects duplicate members, escaping directories, links and mismatched identities", async () => {
    const fixture = await workspaceFixture()
    for (const members of [
      [...fixture.workspace.members, fixture.workspace.members[0]],
      [{ type: "web", directory: "../outside" }]
    ]) {
      await writeFile(
        path.join(fixture.target, ".harness/workspace.json"),
        JSON.stringify({ ...fixture.workspace, members })
      )
      await expect(planFor(fixture)).rejects.toThrow(/member/u)
    }
    await writeFile(
      path.join(fixture.target, ".harness/workspace.json"),
      JSON.stringify(fixture.workspace)
    )
    const identity = path.join(fixture.target, fixture.frontend, ".harness/project.json")
    await writeFile(
      identity,
      JSON.stringify({ schemaVersion: 1, id: fixture.frontend, projectType: "extension" })
    )
    await expect(planFor(fixture)).rejects.toThrow(/identity/u)
    await rm(path.join(fixture.target, fixture.frontend), { recursive: true })
    await symlink(fixture.candidate, path.join(fixture.target, fixture.frontend), "dir")
    await expect(planFor(fixture)).rejects.toThrow(/Unsafe/u)
  })

  /** Workspace 规则须明确登记，旧单包的 runtime 墓碑仍保持关闭。 */
  test("requires explicit Workspace policy and keeps the standalone runtime tombstone", async () => {
    const fixture = await workspaceFixture()
    const manifest = JSON.parse(await readFile(fixture.ownership, "utf8"))
    expect(manifest.workspaceRules).toEqual(WORKSPACE_OWNERSHIP_RULES)
    delete manifest.workspaceRules
    await writeFile(fixture.ownership, JSON.stringify(manifest))
    await expect(planFor(fixture)).rejects.toThrow(/workspaceRules/u)
    const single = await upgradeFixture()
    await mkdir(path.join(single.candidate, ".harness/runtime"))
    await writeFile(path.join(single.candidate, ".harness/runtime/workspace.mjs"), "unsafe\n")
    expect((await planFor(single)).problems.join("\n")).toContain("tombstone")
  })
})
