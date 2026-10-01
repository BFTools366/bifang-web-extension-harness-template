import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach } from "vitest"

/** 保存测试使用的异步无 Shell 进程入口。 */
export const execFileAsync = promisify(execFile)
/** 保存需要回收的临时父目录。 */
export const temporaryRoots: string[] = []
/** 保存实际 helper 脚本的绝对路径。 */
export const helperScript = path.resolve(
  import.meta.dirname,
  "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts"
)
/** 保存项目本地 tsx 入口，避免依赖全局安装。 */
export const tsxExecutable = path.resolve(import.meta.dirname, "../node_modules/.bin/tsx")

/** 描述真实 CLI 子进程的一次稳定 JSON 结果。 */
export interface CliResult {
  /** 保存进程退出码。 */
  exitCode: number
  /** 保存 stdout 中唯一的 JSON 对象。 */
  payload: Record<string, unknown>
  /** 保存意外诊断输出。 */
  stderr: string
}

/** 在指定目录运行 Git。 */
export async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

/** 运行真实 TypeScript CLI，并在成功或预期失败时解析唯一 JSON stdout。 */
export async function runCli(cwd: string, args: string[]): Promise<CliResult> {
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
export async function taskRepository(): Promise<{ root: string; source: string }> {
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
export function managedUnitPath(root: string, task: string, unit: string): string {
  return path.join(path.dirname(root), ".codex-worktrees", path.basename(root), task, unit)
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})
