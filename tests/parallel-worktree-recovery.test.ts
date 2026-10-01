import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  createParallelWorktree,
  inspectParallelWorktrees,
  removeParallelWorktree,
  verifyParallelWorktree
} from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
import { git, runCli, taskRepository, managedUnitPath } from "./parallel-worktree-fixture.ts"

/** 验证 parallel worktree identity and recovery 的完整回归场景。 */
describe("parallel worktree identity and recovery", () => {
  /** 验证 inspect 只接受 primary checkout，并要求从其精确 cwd 运行。 */
  test("binds inspect to the primary checkout and its exact cwd", async () => {
    const { root, source } = await taskRepository()

    await expect(inspectParallelWorktrees(source, source)).rejects.toThrow(/primary Worktree/)
    await expect(inspectParallelWorktrees(root, source)).rejects.toThrow(/exact Worktree/)
    await expect(inspectParallelWorktrees(root, root)).resolves.toMatchObject({
      projectRoot: await realpath(root),
      clean: true,
      branch: "main",
      head: await git(root, ["rev-parse", "HEAD"]),
      worktrees: [
        { worktree: expect.any(String), HEAD: expect.any(String), branch: "refs/heads/main" },
        {
          worktree: expect.any(String),
          HEAD: expect.any(String),
          branch: "refs/heads/codex/task-sync-harness"
        }
      ],
      units: [],
      orphanWorktrees: [],
      staleUnits: []
    })
  })

  /** 验证 create 在 Git add 与 registry 写入之间退出后会暴露 orphan。 */
  test("reports an unregistered managed Worktree after an interrupted create", async () => {
    const { root, source } = await taskRepository()
    const orphanPath = managedUnitPath(root, "sync-harness", "orphan")
    await mkdir(path.dirname(orphanPath), { recursive: true })
    await git(source, [
      "worktree",
      "add",
      "-b",
      "codex/unit-sync-harness-orphan",
      orphanPath,
      "HEAD"
    ])

    const inspected = await inspectParallelWorktrees(root, root)
    expect(inspected.units).toEqual([])
    expect(inspected.staleUnits).toEqual([])
    expect(inspected.orphanWorktrees).toEqual([
      expect.objectContaining({
        worktree: await realpath(orphanPath),
        branch: "refs/heads/codex/unit-sync-harness-orphan"
      })
    ])
    await expect(lstat(orphanPath)).resolves.toBeDefined()
  })

  /** 验证 remove 在 Git 删除与 registry 更新之间退出后会暴露 stale 登记。 */
  test("reports a stale helper unit after an interrupted remove", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "stale",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await git(source, ["worktree", "remove", record.worktreePath])

    const inspected = await inspectParallelWorktrees(root, root)
    expect(inspected.orphanWorktrees).toEqual([])
    expect(inspected.staleUnits).toEqual([
      {
        unit: expect.objectContaining({ task: "sync-harness", unit: "stale" }),
        reasons: ["missing_git_worktree"]
      }
    ])
  })

  /** 验证缺失的 prunable 路径保留完整 Git 证据且不会让 inspect 抛出 ENOENT。 */
  test("reports a prunable registered unit without resolving its missing path", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "prunable",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await rm(record.worktreePath, { recursive: true, force: true })

    const inspected = await inspectParallelWorktrees(root, root)
    const prunable = inspected.worktrees.find(
      (worktree) => worktree.branch === "refs/heads/codex/unit-sync-harness-prunable"
    )
    expect(prunable).toMatchObject({
      worktree: record.worktreePath,
      prunable: expect.any(String)
    })
    expect(inspected.orphanWorktrees).toEqual([])
    expect(inspected.staleUnits).toEqual([
      {
        unit: expect.objectContaining({ task: "sync-harness", unit: "prunable" }),
        reasons: ["prunable_git_worktree"],
        gitWorktree: prunable
      }
    ])
  })

  /** 验证 remove 对 verify 后新增脏状态和未整合提交都失败关闭。 */
  test("refuses dirty or unintegrated verified units", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "cleanup",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await mkdir(path.join(record.worktreePath, "docs"))
    await writeFile(path.join(record.worktreePath, "docs/guide.md"), "# Guide\n")
    await git(record.worktreePath, ["add", "docs/guide.md"])
    await git(record.worktreePath, ["commit", "-m", "docs: add guide"])
    await verifyParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "cleanup",
      executionRoot: record.worktreePath
    })

    const pending = path.join(record.worktreePath, "docs/pending.md")
    await writeFile(pending, "pending\n")
    await expect(
      removeParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "cleanup",
        integratedInto: "codex/task-sync-harness",
        executionRoot: source
      })
    ).rejects.toThrow(/must be clean/)
    await rm(pending)
    await expect(
      removeParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "cleanup",
        integratedInto: "codex/task-sync-harness",
        executionRoot: source
      })
    ).rejects.toThrow(/not integrated/)
    await expect(lstat(record.worktreePath)).resolves.toBeDefined()
  })

  /** 验证真实 CLI 成功与失败都只输出稳定结构化 JSON。 */
  test("emits stable JSON and rejects command-irrelevant flags", async () => {
    const { root } = await taskRepository()
    const inspected = await runCli(root, ["inspect", "--project-root", root])
    expect(inspected).toMatchObject({
      exitCode: 0,
      stderr: "",
      payload: {
        ok: true,
        operation: "inspect",
        clean: true,
        branch: "main",
        head: expect.any(String),
        worktrees: expect.any(Array),
        units: [],
        orphanWorktrees: [],
        staleUnits: []
      }
    })

    const invalidInvocations = [
      ["inspect", "--project-root", root, "--task", "sync-harness"],
      ["verify", "--project-root", root, "--write-target", "docs"],
      ["guard", "--project-root", root, "--policy", "enabled"],
      ["remove", "--project-root", root, "--user-requested"]
    ]
    for (const invocation of invalidInvocations) {
      const rejected = await runCli(root, invocation)
      expect(rejected).toMatchObject({
        exitCode: 2,
        stderr: "",
        payload: { ok: false, error: { code: "cli_usage_invalid" } }
      })
    }
  })
})
