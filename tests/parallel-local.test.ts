import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  createParallelWorktree,
  guardParallelWorktree,
  inspectParallelWorktrees,
  removeParallelWorktree,
  verifyParallelWorktree
} from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
import { git, taskRepository } from "./parallel-worktree-fixture.ts"

/** 从 primary 当前分支建立本次 Local 并行单元。 */
async function localUnit(root: string, unit = "docs", writeTarget = "docs") {
  return createParallelWorktree({
    projectRoot: root,
    sourceWorktree: root,
    task: "sync-harness",
    unit,
    writeTargets: [writeTarget],
    expectedUnits: 2,
    userRequested: true,
    policy: "enabled",
    executionRoot: root
  })
}

describe("Local parallel source binding", () => {
  /** 验证遍历所有新提交，同时不把 merge 第二父缺失的既有基线文件误判为单元写入。 */
  test.each([false, true])("checks side-branch history with outside change=%s", async (outside) => {
    const { root } = await taskRepository()
    await writeFile(path.join(root, "baseline-only.txt"), "already in source baseline\n")
    await git(root, ["add", "baseline-only.txt"])
    await git(root, ["commit", "-m", "test: extend source baseline"])
    const record = await localUnit(root)
    await git(record.worktreePath, ["switch", "-c", "side", `${record.baseHead}^`])
    await mkdir(path.join(record.worktreePath, "docs"))
    await writeFile(path.join(record.worktreePath, "docs/side.md"), "# Side\n")
    await git(record.worktreePath, ["add", "docs/side.md"])
    await git(record.worktreePath, ["commit", "-m", "docs: add side guide"])
    if (outside) {
      await writeFile(path.join(record.worktreePath, "README.md"), "outside ownership\n")
      await git(record.worktreePath, ["add", "README.md"])
      await git(record.worktreePath, ["commit", "-m", "test: change outside ownership"])
      await git(record.worktreePath, ["revert", "--no-edit", "HEAD"])
    }
    await git(record.worktreePath, ["switch", record.branch])
    await mkdir(path.join(record.worktreePath, "docs"), { recursive: true })
    await writeFile(path.join(record.worktreePath, "docs/main.md"), "# Main\n")
    await git(record.worktreePath, ["add", "docs/main.md"])
    await git(record.worktreePath, ["commit", "-m", "docs: add main guide"])
    await git(record.worktreePath, ["merge", "--no-ff", "side", "-m", "test: merge side guide"])
    const verification = verifyParallelWorktree({
      projectRoot: root,
      sourceWorktree: root,
      task: record.task,
      unit: record.unit,
      executionRoot: record.worktreePath
    })
    if (outside) await expect(verification).rejects.toThrow(/outside ownership: README\.md/)
    else
      await expect(verification).resolves.toMatchObject({
        verifiedHead: await git(record.worktreePath, ["rev-parse", "HEAD"])
      })
  })

  /** 验证撤销越权修改或 rename 不能从提交历史所有权检查中抹掉源路径。 */
  test.each(["modify", "rename"] as const)(
    "rejects reverted out-of-scope %s commits",
    async (change) => {
      const { root } = await taskRepository()
      const record = await localUnit(root)
      if (change === "modify")
        await writeFile(path.join(record.worktreePath, "README.md"), "outside ownership\n")
      else await git(record.worktreePath, ["mv", "README.md", "renamed.md"])
      await git(record.worktreePath, ["add", "--all"])
      await git(record.worktreePath, ["commit", "-m", "test: change outside ownership"])
      await git(record.worktreePath, ["revert", "--no-edit", "HEAD"])
      expect(
        await git(record.worktreePath, ["diff", "--name-only", `${record.baseHead}..HEAD`])
      ).toBe("")
      await expect(
        verifyParallelWorktree({
          projectRoot: root,
          sourceWorktree: root,
          task: record.task,
          unit: record.unit,
          executionRoot: record.worktreePath
        })
      ).rejects.toThrow(/outside ownership:.*README\.md/)
      expect((await inspectParallelWorktrees(root, root)).units[0]?.verifiedHead).toBeUndefined()
    }
  )

  /** 验证旧 Task Worktree 登记可继续 guard，但篡改为 Local 模式会被实际身份拦截。 */
  test("preserves legacy Task records and rejects a forged Local mode", async () => {
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
    const commonDir = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    const registryPath = path.join(commonDir, "harness/parallel-worktrees.json")
    const registry = JSON.parse(await readFile(registryPath, "utf8"))
    const key = `${record.task}:${record.unit}`
    delete registry.units[key].sourceKind
    await writeFile(registryPath, JSON.stringify(registry))
    const selection = {
      projectRoot: root,
      sourceWorktree: source,
      task: record.task,
      unit: record.unit,
      executionRoot: record.worktreePath,
      writeTargets: ["docs"]
    }
    await expect(guardParallelWorktree(selection)).resolves.toMatchObject({
      sourceBranch: "codex/task-sync-harness"
    })
    registry.units[key].sourceKind = "local"
    await writeFile(registryPath, JSON.stringify(registry))
    await expect(guardParallelWorktree(selection)).rejects.toThrow(/source binding has drifted/)
  })

  /** 验证未产生提交的单元不能被登记为已验证，也不能清理。 */
  test("rejects verify and removal of a unit without a commit", async () => {
    const { root } = await taskRepository()
    const record = await localUnit(root)
    const selection = {
      projectRoot: root,
      sourceWorktree: root,
      task: record.task,
      unit: record.unit
    }
    await expect(
      verifyParallelWorktree({ ...selection, executionRoot: record.worktreePath })
    ).rejects.toThrow(/at least one reviewable commit/)
    expect((await inspectParallelWorktrees(root, root)).units[0]?.verifiedHead).toBeUndefined()
    await expect(
      removeParallelWorktree({ ...selection, executionRoot: root, integratedInto: "main" })
    ).rejects.toThrow(/has not passed verify/)
  })

  /** 验证 Local 源切换分支后 guard、verify、remove 都失败关闭并保留单元。 */
  test("rejects every mutation after the Local source branch changes", async () => {
    const { root } = await taskRepository()
    const record = await localUnit(root)
    const selection = {
      projectRoot: root,
      sourceWorktree: root,
      task: record.task,
      unit: record.unit
    }
    await git(root, ["switch", "-c", "unrelated"])
    await expect(
      guardParallelWorktree({
        ...selection,
        executionRoot: record.worktreePath,
        writeTargets: ["docs"]
      })
    ).rejects.toThrow(/Source branch must equal main/)
    await expect(
      verifyParallelWorktree({ ...selection, executionRoot: record.worktreePath })
    ).rejects.toThrow(/Source branch must equal main/)
    await expect(
      removeParallelWorktree({ ...selection, executionRoot: root, integratedInto: "main" })
    ).rejects.toThrow(/Source branch must equal main/)
    expect((await inspectParallelWorktrees(root, root)).units).toHaveLength(1)
  })

  /** 验证同一 Local 批次只复用精确源身份、分支与起始提交。 */
  test("rejects a second unit after source HEAD or branch drift", async () => {
    for (const drift of ["head", "branch"] as const) {
      const { root } = await taskRepository()
      await localUnit(root)
      if (drift === "head")
        await git(root, ["commit", "--allow-empty", "-m", "test: advance source"])
      else await git(root, ["switch", "-c", "unrelated"])
      await expect(localUnit(root, "api", "src/data/api")).rejects.toThrow(
        /batch baseline has drifted/
      )
      expect((await inspectParallelWorktrees(root, root)).units).toHaveLength(1)
      expect(await git(root, ["branch", "--list", "codex/unit-sync-harness-api"])).toBe("")
    }
  })

  /** 验证整合目标必须精确使用冻结 Local 分支，不能改成旧的 Task 分支约定。 */
  test("rejects removal into another branch after Local verification", async () => {
    const { root } = await taskRepository()
    const record = await localUnit(root)
    const selection = {
      projectRoot: root,
      sourceWorktree: root,
      task: record.task,
      unit: record.unit
    }
    await mkdir(path.join(record.worktreePath, "docs"))
    await writeFile(path.join(record.worktreePath, "docs/guide.md"), "# Guide\n")
    await git(record.worktreePath, ["add", "docs/guide.md"])
    await git(record.worktreePath, ["commit", "-m", "docs: add guide"])
    await verifyParallelWorktree({ ...selection, executionRoot: record.worktreePath })
    await expect(
      removeParallelWorktree({
        ...selection,
        executionRoot: root,
        integratedInto: "codex/task-sync-harness"
      })
    ).rejects.toThrow(/integrated-into must equal main/)
    await expect(
      removeParallelWorktree({ ...selection, executionRoot: root, integratedInto: "main" })
    ).rejects.toThrow(/not integrated into main/)
    expect((await inspectParallelWorktrees(root, root)).units).toHaveLength(1)
  })
})
