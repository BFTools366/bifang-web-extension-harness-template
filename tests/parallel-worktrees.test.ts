import { lstat, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  createParallelWorktree,
  guardParallelWorktree,
  inspectParallelWorktrees,
  removeParallelWorktree,
  verifyParallelWorktree
} from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
import { createSymlinkOrSkip } from "./setup.ts"
import { git, taskRepository } from "./parallel-worktree-fixture.ts"

/** 验证 registered parallel Worktrees 的完整回归场景。 */
describe("registered parallel Worktrees", () => {
  /** 验证 create 同时要求当前用户并行请求与 enabled 策略且零写入失败。 */
  test("requires both user request and enabled policy", async () => {
    const { root, source } = await taskRepository()

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "disabled",
        executionRoot: source
      })
    ).rejects.toThrow(/user request AND enabled project policy/)

    expect((await inspectParallelWorktrees(root, root)).units).toEqual([])
    expect(await git(root, ["branch", "--list", "codex/unit-sync-harness-docs"])).toBe("")
  })

  /** 验证 guard、postflight、父分支整合与保守清理形成完整闭环。 */
  test("verifies ownership before and after an integrated unit", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "docs",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await guardParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "docs",
      writeTargets: ["docs/guide.md"],
      executionRoot: record.worktreePath
    })
    await mkdir(path.join(record.worktreePath, "docs"))
    await writeFile(path.join(record.worktreePath, "docs/guide.md"), "# Guide\n")
    await git(record.worktreePath, ["add", "docs/guide.md"])
    await git(record.worktreePath, ["commit", "-m", "docs: add guide"])

    const verified = await verifyParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "docs",
      executionRoot: record.worktreePath
    })
    expect(verified.verifiedHead).toMatch(/^[0-9a-f]{40}$/u)
    await git(source, ["merge", "--ff-only", record.branch])
    await expect(
      removeParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        integratedInto: "codex/task-sync-harness",
        executionRoot: source
      })
    ).resolves.toMatchObject({ branch: record.branch })
    expect((await inspectParallelWorktrees(root, root)).units).toEqual([])
    await expect(lstat(record.worktreePath)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await git(root, ["branch", "--list", record.branch])).toContain(record.branch)
  })

  /** 验证活动单元之间相同或祖先/后代所有权均被拒绝。 */
  test("rejects overlapping active ownership", async () => {
    const { root, source } = await taskRepository()
    await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "api",
      writeTargets: ["src/data/api"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "client",
        writeTargets: ["src/data/api/client.ts"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: source
      })
    ).rejects.toThrow(/overlap active unit/)
    expect((await inspectParallelWorktrees(root, root)).units).toHaveLength(1)
  })

  /** 验证 guard 会发现单元已经产生的越权未跟踪路径。 */
  test("rejects existing changes outside registered ownership", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "docs",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await writeFile(path.join(record.worktreePath, "outside.txt"), "not owned\n")

    await expect(
      guardParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        writeTargets: ["docs"],
        executionRoot: record.worktreePath
      })
    ).rejects.toThrow(/outside ownership: outside\.txt/)
  })

  /** 验证 postflight 会同时检查未提交路径与 rename 的源路径。 */
  test("postflight rejects pending and renamed paths outside ownership", async () => {
    const { root, source } = await taskRepository()
    const record = await createParallelWorktree({
      projectRoot: root,
      sourceWorktree: source,
      task: "sync-harness",
      unit: "docs",
      writeTargets: ["docs"],
      expectedUnits: 2,
      userRequested: true,
      policy: "enabled",
      executionRoot: source
    })
    await mkdir(path.join(record.worktreePath, "docs"))
    await git(record.worktreePath, ["mv", "README.md", "docs/README.md"])

    await expect(
      verifyParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        executionRoot: record.worktreePath
      })
    ).rejects.toThrow(/outside ownership: README\.md/)
  })

  /** 验证保存项目 primary 不能冒充独立的左侧 Task source。 */
  test("requires an independent registered source Worktree", async () => {
    const { root } = await taskRepository()

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: root,
        task: "sync-harness",
        unit: "docs",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: root
      })
    ).rejects.toThrow(/independent left-side Task Worktree/)
  })

  /** 验证遗留并发锁会在创建任何分支或 Worktree 前阻断。 */
  test("fails closed while the registry is locked", async () => {
    const { root, source } = await taskRepository()
    const commonDir = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    await mkdir(path.join(commonDir, "harness"))
    await mkdir(path.join(commonDir, "harness/parallel-worktrees.lock"))

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: source
      })
    ).rejects.toThrow(/registry is locked/)
    expect(await git(root, ["branch", "--list", "codex/unit-sync-harness-docs"])).toBe("")
  })

  /** 验证 source 分支和 helper cwd 都必须绑定真实父 Task Worktree。 */
  test("rejects an unbound source branch or execution root", async () => {
    const { root, source } = await taskRepository()
    await git(source, ["switch", "-c", "unrelated"])

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "docs",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: source
      })
    ).rejects.toThrow(/Source branch must equal codex\/task-sync-harness/)
  })

  /** 验证 source 不能来自其他仓库，也不能处于 detached HEAD。 */
  test("rejects another repository and detached source HEAD", async () => {
    const { root, source } = await taskRepository()
    const other = path.join(path.dirname(root), "other-repository")
    await mkdir(other)
    await git(other, ["init", "-b", "codex/task-sync-harness"])
    await git(other, ["config", "--local", "user.name", "Test Owner"])
    await git(other, ["config", "--local", "user.email", "owner@example.com"])
    await git(other, ["commit", "--allow-empty", "-m", "test: initialize other fixture"])

    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: other,
        task: "sync-harness",
        unit: "other",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: other
      })
    ).rejects.toThrow(/share one Git common-dir/)

    await git(source, ["checkout", "--detach"])
    await expect(
      createParallelWorktree({
        projectRoot: root,
        sourceWorktree: source,
        task: "sync-harness",
        unit: "detached",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: source
      })
    ).rejects.toThrow(/Source branch must equal codex\/task-sync-harness/)
  })

  /** 验证所有权保留原始路径语义，拒绝空、点与双斜线组件。 */
  test("rejects raw empty and dot path components", async () => {
    const { root, source } = await taskRepository()
    const invalidTargets = [
      "./docs",
      "docs/./guide.md",
      "docs/../guide.md",
      "docs//guide.md",
      "docs/"
    ]

    for (const [index, target] of invalidTargets.entries()) {
      await expect(
        createParallelWorktree({
          projectRoot: root,
          sourceWorktree: source,
          task: "sync-harness",
          unit: `invalid-${index}`,
          writeTargets: [target],
          expectedUnits: 2,
          userRequested: true,
          policy: "enabled",
          executionRoot: source
        })
      ).rejects.toThrow(/non-root POSIX repo-relative path/)
    }
    expect(await git(root, ["branch", "--list", "codex/unit-sync-harness-invalid-*"])).toBe("")
  })

  /** 验证 ownership 不能通过符号链接重定向。 */
  test("rejects symlink escapes in ownership", async (context) => {
    const first = await taskRepository()
    const external = path.join(path.dirname(first.root), "external")
    await mkdir(external)
    await createSymlinkOrSkip(context, external, path.join(first.source, "linked"), "dir")
    await git(first.source, ["add", "linked"])
    await git(first.source, ["commit", "-m", "test: add unsafe ownership fixture"])

    await expect(
      createParallelWorktree({
        projectRoot: first.root,
        sourceWorktree: first.source,
        task: "sync-harness",
        unit: "linked-target",
        writeTargets: ["linked/file.ts"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: first.source
      })
    ).rejects.toThrow(/crosses a symbolic link/)
  })

  /** 验证 Worktree 容器不能通过符号链接重定向。 */
  test("rejects symlinked Worktree containers", async (context) => {
    const second = await taskRepository()
    const redirected = path.join(path.dirname(second.root), "redirected-worktrees")
    await mkdir(redirected)
    await createSymlinkOrSkip(
      context,
      redirected,
      path.join(path.dirname(second.root), ".codex-worktrees"),
      "dir"
    )
    await expect(
      createParallelWorktree({
        projectRoot: second.root,
        sourceWorktree: second.source,
        task: "sync-harness",
        unit: "linked-container",
        writeTargets: ["docs"],
        expectedUnits: 2,
        userRequested: true,
        policy: "enabled",
        executionRoot: second.source
      })
    ).rejects.toThrow(/Worktree root must be a real directory/)
    expect(
      await git(second.root, ["branch", "--list", "codex/unit-sync-harness-linked-container"])
    ).toBe("")
  })
})
