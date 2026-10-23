import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  applyUpgradePath,
  recordUpgradeBaseline
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { assertControlSnapshots } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import {
  WORKSPACE_OWNERSHIP_RULES,
  missingWorkspaceOwnership
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-workspace.ts"
import { migrateOwnership } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-ownership-delta.ts"
import type { OwnershipRule } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-types.ts"
import {
  git,
  planFor,
  persistPlan,
  upgradeFixture,
  writeProjectFiles
} from "./harness-upgrade-fixture.ts"

/** 创建真实 Git Workspace 与根/成员独立的工程候选，Go 只作为受保护哨兵。 */
async function workspaceFixture(
  type: "web" | "extension" = "web",
  mode: "create" | "none" = "create"
) {
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
      ...(mode === "create" ? [{ type: "server", directory: "example_server" }] : [])
    ],
    service: { mode, developmentBaseUrl: mode === "create" ? "http://127.0.0.1:8080" : "" }
  }
  await rm(path.join(fixture.target, ".harness/project.json"))
  await writeFile(path.join(fixture.target, ".harness/workspace.json"), JSON.stringify(workspace))
  if (mode === "create") {
    await mkdir(path.join(fixture.target, "example_server"))
    await writeFile(
      path.join(fixture.target, "example_server/config.yaml"),
      "private provider config\n"
    )
  }
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
    for (const rule of WORKSPACE_OWNERSHIP_RULES)
      await writeFile(path.join(root, rule.pattern), "// runtime baseline\n")
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
  /** 旧创建器的源文档残留必须先明确清理，不能由升级静默恢复或覆盖。 */
  test("旧 Workspace 源文档残留清理前阻断，清理后恢复规划", async () => {
    const fixture = await workspaceFixture()
    const legacy = path.join(fixture.target, "docs/TS_WEB_TEMPLATE.md")
    await mkdir(path.dirname(legacy), { recursive: true })
    await writeFile(legacy, "legacy source document\n")
    const blocked = await planFor(fixture)
    expect(blocked.entries.find((entry) => entry.path === "docs/TS_WEB_TEMPLATE.md")).toMatchObject(
      {
        ownership: "tombstone",
        classification: "blocked"
      }
    )
    expect(await readFile(legacy, "utf8")).toBe("legacy source document\n")
    // 模拟隔离 fixture 已获批准的精确清理；真实用户工程必须先审查本地改写。
    await rm(legacy)
    expect((await planFor(fixture)).problems).toEqual([])
    expect(await readFile(path.join(fixture.target, "example_server/config.yaml"), "utf8")).toBe(
      "private provider config\n"
    )
  })

  /** 旧一项策略与缺失策略都能只读预演，授权后只追加新模块规则。 */
  test.each([0, 1, 3])("兼容旧 Workspace 的 %i 项根规则迁移", async (count) => {
    const fixture = await workspaceFixture()
    const manifest = JSON.parse(await readFile(fixture.ownership, "utf8"))
    if (count === 0) delete manifest.workspaceRules
    else manifest.workspaceRules = WORKSPACE_OWNERSHIP_RULES.slice(0, count)
    const original = JSON.stringify(manifest)
    await writeFile(fixture.ownership, original)
    const before = await readFile(path.join(fixture.target, "example_server/config.yaml"), "utf8")
    const missing = missingWorkspaceOwnership(manifest.workspaceRules)
    expect(missing).toEqual(WORKSPACE_OWNERSHIP_RULES.slice(count))
    const preview = await migrateOwnership({ targetOwnershipPath: fixture.ownership })
    expect(preview.written).toBe(false)
    expect(preview.delta.workspaceMissing ?? []).toEqual(missing)
    expect(await readFile(fixture.ownership, "utf8")).toBe(original)
    const applied = await migrateOwnership({
      targetOwnershipPath: fixture.ownership,
      approval: "测试中批准精确根规则追加"
    })
    expect(applied.written).toBe(count !== 3)
    const actual = JSON.parse(await readFile(fixture.ownership, "utf8"))
    expect(actual.rules).toEqual(manifest.rules)
    expect(actual.workspaceRules).toEqual(WORKSPACE_OWNERSHIP_RULES)
    await expect(planFor(fixture)).resolves.toBeDefined()
    expect(await readFile(path.join(fixture.target, "example_server/config.yaml"), "utf8")).toBe(
      before
    )
  })

  /** 兼容迁移不允许额外授权、顺序变化、重复或删弱权限。 */
  test("拒绝不可信 Workspace 根规则迁移", () => {
    const invalid: OwnershipRule[][] = [
      [
        ...WORKSPACE_OWNERSHIP_RULES,
        { pattern: "example_server/**", mode: "managed", required: true }
      ],
      [...WORKSPACE_OWNERSHIP_RULES.slice(1, 2), ...WORKSPACE_OWNERSHIP_RULES.slice(0, 1)],
      [...WORKSPACE_OWNERSHIP_RULES.slice(0, 1), ...WORKSPACE_OWNERSHIP_RULES.slice(0, 1)],
      [{ pattern: ".harness/runtime/workspace.mjs", mode: "protected", required: true }]
    ]
    for (const rules of invalid)
      expect(() => missingWorkspaceOwnership(rules)).toThrow(/workspaceRules/)
  })
  /** 本地服务归属受同一根锁保护，升级不新增服务成员或改变地址。 */
  test("本地模式可记录并复读工程基线", async () => {
    const fixture = await workspaceFixture("web", "none")
    await bootstrap(fixture)
    const plan = await planFor(fixture)
    expect(plan.blocked).toBe(false)
    expect(plan.entries.some((entry) => entry.path.startsWith("example_server/"))).toBe(false)
    expect(
      JSON.parse(await readFile(path.join(fixture.target, ".harness/workspace.json"), "utf8"))
        .service
    ).toEqual({ mode: "none", developmentBaseUrl: "" })
  })
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
