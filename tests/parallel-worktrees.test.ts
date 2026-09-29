import { execFile } from "node:child_process"
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"
import {
  createParallelWorktree,
  guardParallelWorktree,
  inspectParallelWorktrees,
  removeParallelWorktree,
  verifyParallelWorktree
} from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
import { createSymlinkOrSkip } from "./setup.ts"

/** 保存测试使用的异步无 Shell 进程入口。 */
const execFileAsync = promisify(execFile)
/** 保存需要回收的临时父目录。 */
const temporaryRoots: string[] = []
/** 保存实际 helper 脚本的绝对路径。 */
const helperScript = path.resolve(
  import.meta.dirname,
  "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
)
/** 保存项目本地 tsx 入口，避免依赖全局安装。 */
const tsxExecutable = path.resolve(import.meta.dirname, "../node_modules/.bin/tsx")

/** 描述真实 CLI 子进程的一次稳定 JSON 结果。 */
interface CliResult {
  /** 保存进程退出码。 */
  exitCode: number
  /** 保存 stdout 中唯一的 JSON 对象。 */
  payload: Record<string, unknown>
  /** 保存意外诊断输出。 */
  stderr: string
}

/** 在指定目录运行 Git。 */
async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

/** 运行真实 TypeScript CLI，并在成功或预期失败时解析唯一 JSON stdout。 */
async function runCli(cwd: string, args: string[]): Promise<CliResult> {
  try {
    const result = await execFileAsync(tsxExecutable, [helperScript, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" }
    })
    return { exitCode: 0, payload: JSON.parse(result.stdout), stderr: result.stderr }
  } catch (error) {
    const candidate = error as { code?: unknown; stdout?: unknown; stderr?: unknown }
    return {
      exitCode: typeof candidate.code === "number" ? candidate.code : -1,
      payload: JSON.parse(String(candidate.stdout ?? "")),
      stderr: String(candidate.stderr ?? "")
    }
  }
}

/** 建立 primary 仓库及独立 codex/task-* source Worktree。 */
async function taskRepository(): Promise<{ root: string; source: string }> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "web-parallel-worktree-"))
  temporaryRoots.push(parent)
  const root = path.join(parent, "project")
  await mkdir(root)
  await git(root, ["init", "-b", "main"])
  await git(root, ["config", "--local", "user.name", "Test Owner"])
  await git(root, ["config", "--local", "user.email", "owner@example.com"])
  await writeFile(path.join(root, "README.md"), "# fixture\n")
  await git(root, ["add", "README.md"])
  await git(root, ["commit", "-m", "test: initialize fixture"])
  const source = path.join(parent, "source-task")
  await git(root, ["worktree", "add", "-b", "codex/task-sync-harness", source, "HEAD"])
  return { root, source }
}

/** 返回与 helper 创建约定完全一致的单元 Worktree 路径。 */
function managedUnitPath(root: string, task: string, unit: string): string {
  return path.join(path.dirname(root), ".codex-worktrees", path.basename(root), task, unit)
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

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
      writeTargets: ["src/api"],
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
        writeTargets: ["src/api/client.ts"],
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
