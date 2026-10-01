import { execFile } from "node:child_process"
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, expect, vi } from "vitest"
import type { InitOptions } from "../.harness/tooling/types.ts"

// 保存 temporaryRoots 变量供当前逻辑使用。
export const temporaryRoots: string[] = []
// 保存 repositoryRoot 变量供当前逻辑使用。
export const repositoryRoot = path.resolve(import.meta.dirname, "..")
// 保存 BASE_URLS 变量供当前逻辑使用。
export const BASE_URLS = {
  developmentBaseUrl: "http://localhost:3000/api",
  testBaseUrl: "https://test-api.example.com/v1",
  releaseBaseUrl: "https://api.example.com/v1"
} as const
/** 保存原子初始化测试使用的已决 Agent policy。 */
export const TEST_AGENT_POLICY = {
  confirmedBy: "test-owner",
  confirmedAt: "2026-09-09T00:00:00.000Z",
  superpowers: "disabled",
  userOwnedTasks: "disabled",
  parallelWorktreeSubagents: "enabled",
  acceptanceSmoke: "enabled",
  e2eHint: "disabled"
} as const
/** 保存测试 Git 命令的无 Shell 异步入口。 */
export const execFileAsync = promisify(execFile)

// 执行 temporaryDirectory 函数的处理逻辑。
export async function temporaryDirectory(prefix: string): Promise<string> {
  // 保存 root 变量供当前逻辑使用。
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

// 执行 initOptions 函数的处理逻辑。
export function initOptions(
  root: string,
  projectType: "web" | "extension",
  id: string
): InitOptions {
  return {
    root,
    projectType,
    name: "Atomic Initialization",
    id,
    description: "Exercises failure-safe project initialization.",
    brandColor: "#4C6EF5",
    agentPolicy: TEST_AGENT_POLICY,
    ...BASE_URLS,
    skipInstall: true,
    skipGit: true
  }
}

// 执行 snapshotTree 函数的处理逻辑。
export async function snapshotTree(root: string): Promise<Record<string, string>> {
  // 保存 snapshot 变量供当前逻辑使用。
  const snapshot: Record<string, string> = {}

  // 执行 visit 函数的处理逻辑。
  async function visit(directory: string, relativeDirectory = ""): Promise<void> {
    // 保存 entries 变量供当前逻辑使用。
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort(
      /* 执行 当前声明 函数的处理逻辑。 */ (left, right) => left.name.localeCompare(right.name)
    )
    // 保存 entry 变量供当前逻辑使用。
    for (const entry of entries) {
      // 保存 relativePath 变量供当前逻辑使用。
      const relativePath =
        relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`
      // 保存 absolutePath 变量供当前逻辑使用。
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        snapshot[relativePath] = "directory"
        await visit(absolutePath, relativePath)
      } else if (entry.isFile()) {
        snapshot[relativePath] = `file:${(await readFile(absolutePath)).toString("base64")}`
      } else {
        snapshot[relativePath] = "other"
      }
    }
  }

  await visit(root)
  return snapshot
}

/** 断言失败初始化没有发布目标或遗留 sibling staging。 */
export async function expectNoPublishedTarget(parent: string, id: string): Promise<void> {
  await expect(lstat(path.join(parent, id))).rejects.toMatchObject({ code: "ENOENT" })
  expect(
    (await readdir(parent)).filter((entry) => entry.startsWith(`.${id}.harness-stage-`))
  ).toEqual([])
}

/** 在测试源根执行 Git 并返回标准输出。 */
export async function git(root: string, args: string[]): Promise<string> {
  return (
    await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8"
    })
  ).stdout.trim()
}

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    vi.restoreAllMocks()
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)
