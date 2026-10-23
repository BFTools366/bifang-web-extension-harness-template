import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach } from "vitest"
import {
  createUpgradePlan,
  writeUpgradePlan
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"

/** 保存测试使用的异步无 Shell 进程入口。 */
export const execFileAsync = promisify(execFile)
/** 保存需要回收的临时目录。 */
export const temporaryRoots: string[] = []
/** 保存生产所有权清单的精确位置。 */
export const ownershipPath = path.resolve(
  ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
)
/** 保存必须由真实进程验证 stdout 契约的升级 CLI。 */
export const upgradeCliPath = path.resolve(
  ".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
)

/** 计算测试载荷的稳定 SHA-256。 */
export function digest(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex")
}

/** 描述一个可升级下游的隔离测试目录。 */
export interface UpgradeFixture {
  /** 保存 clean 源 Harness Git 根。 */
  source: string
  /** 保存针对目标渲染的候选树。 */
  candidate: string
  /** 保存已初始化目标 Git 根。 */
  target: string
  /** 保存受保护上游基线路径。 */
  lock: string
  /** 保存目标仓库内唯一受信任的所有权清单。 */
  ownership: string
  /** 保存源 HEAD。 */
  sourceCommit: string
  /** 保存计划文件的源外父目录。 */
  evidence: string
}

/** 在指定仓库运行 Git。 */
export async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

/** 写入测试候选与目标共享的最小工程文件。 */
export async function writeProjectFiles(root: string, managed = "baseline\n"): Promise<void> {
  await mkdir(path.join(root, ".harness/tooling"), { recursive: true })
  await writeFile(path.join(root, "AGENTS.md"), "# Agent\n")
  await writeFile(path.join(root, "README.md"), "# Project\n")
  await writeFile(path.join(root, "package.json"), '{"name":"fixture"}\n')
  await writeFile(path.join(root, ".harness/tooling/comment-policy.ts"), managed)
  await writeFile(
    path.join(root, ".harness/tooling/router-browser.ts"),
    "export const isServer = false\nexport const loadServerRoute = undefined\n"
  )
}

/** 建立源、候选、目标与证据四个互不嵌套的根。 */
export async function upgradeFixture(): Promise<UpgradeFixture> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "web-harness-upgrade-"))
  temporaryRoots.push(parent)
  const source = path.join(parent, "source")
  const candidate = path.join(parent, "candidate")
  const target = path.join(parent, "target")
  const evidence = path.join(parent, "evidence")
  await Promise.all([source, candidate, target, evidence].map((directory) => mkdir(directory)))
  await git(source, ["init", "-b", "main"])
  await git(source, ["config", "--local", "user.name", "Harness Source"])
  await git(source, ["config", "--local", "user.email", "source@example.com"])
  await writeFile(path.join(source, "Version.md"), "当前版本：`202609090101`\n")
  await git(source, ["add", "Version.md"])
  await git(source, ["commit", "-m", "test: source baseline"])
  await Promise.all([writeProjectFiles(candidate), writeProjectFiles(target)])
  const relativeOwnership = ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
  const targetOwnership = path.join(target, relativeOwnership)
  const candidateOwnership = path.join(candidate, relativeOwnership)
  await Promise.all([
    mkdir(path.dirname(targetOwnership), { recursive: true }),
    mkdir(path.dirname(candidateOwnership), { recursive: true })
  ])
  await Promise.all([
    copyFile(ownershipPath, targetOwnership),
    copyFile(ownershipPath, candidateOwnership)
  ])
  await writeFile(path.join(target, ".harness/project.json"), '{"projectType":"web"}\n')
  await git(target, ["init", "-b", "main"])
  await git(target, ["config", "--local", "user.name", "Target Owner"])
  await git(target, ["config", "--local", "user.email", "target@example.com"])
  await git(target, ["add", "."])
  await git(target, ["commit", "-m", "test: target baseline"])
  return {
    source,
    candidate,
    target,
    lock: path.join(target, ".harness/upstream-lock.json"),
    ownership: targetOwnership,
    sourceCommit: await git(source, ["rev-parse", "HEAD"]),
    evidence
  }
}

/** 生成绑定 fixture 当前事实的计划。 */
export async function planFor(fixture: UpgradeFixture) {
  return createUpgradePlan({
    sourceRoot: fixture.source,
    sourceVersion: "202609090101",
    sourceCommit: fixture.sourceCommit,
    candidateRoot: fixture.candidate,
    targetRoot: fixture.target,
    ownershipPath: fixture.ownership,
    lockPath: fixture.lock
  })
}

/** 写入一个全新计划证据文件并返回路径。 */
export async function persistPlan(fixture: UpgradeFixture, name: string): Promise<string> {
  const filePath = path.join(fixture.evidence, `${name}.json`)
  await writeUpgradePlan(await planFor(fixture), filePath)
  return filePath
}

/** 生成 plan CLI 共享的严格参数，输出路径保持可选。 */
export function planCliArguments(fixture: UpgradeFixture, output?: string): string[] {
  const argumentsList = [
    "plan",
    "--source-root",
    fixture.source,
    "--source-version",
    "202609090101",
    "--source-commit",
    fixture.sourceCommit,
    "--candidate-root",
    fixture.candidate,
    "--target-root",
    fixture.target,
    "--ownership",
    fixture.ownership,
    "--lock",
    fixture.lock
  ]
  if (output !== undefined) argumentsList.push("--output", output)
  return argumentsList
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})
