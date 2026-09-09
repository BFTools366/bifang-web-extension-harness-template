import { execFile } from "node:child_process"
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  bootstrapGitIdentity,
  checkCommitConfiguration,
  checkGitIdentity,
  installCommitConfiguration,
  reportGitIdentity
} from "../.agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"

/** 保存测试使用的异步无 Shell 进程入口。 */
const execFileAsync = promisify(execFile)
/** 保存需要回收的临时目录。 */
const temporaryRoots: string[] = []
/** 保存宿主原始 Git 配置环境，避免测试污染或依赖用户全局身份。 */
const originalGitEnvironment = {
  global: process.env.GIT_CONFIG_GLOBAL,
  noSystem: process.env.GIT_CONFIG_NOSYSTEM
}
/** 保存受测真实 TypeScript CLI 的绝对路径。 */
const configurationScript = path.resolve(
  ".agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"
)

/** 描述一次真实 CLI 进程的完整可断言结果。 */
interface CliResult {
  /** 保存进程退出码。 */
  code: number
  /** 保存唯一标准输出。 */
  stdout: string
  /** 保存标准错误。 */
  stderr: string
}

/** 创建临时目录并登记回收。 */
async function temporaryDirectory(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

/** 在指定目录运行 Git。 */
async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

/** 通过项目本地 tsx 运行真实 helper CLI，并保留非零退出的 JSON。 */
async function runConfigurationCli(args: string[]): Promise<CliResult> {
  try {
    const result = await execFileAsync("pnpm", ["exec", "tsx", configurationScript, ...args], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
      }
    })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown }
    return {
      code: typeof failure.code === "number" ? failure.code : -1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? "")
    }
  }
}

/** 建立具有首个提交的最小 Git 仓库。 */
async function initializedRepository(prefix: string): Promise<string> {
  const root = await temporaryDirectory(prefix)
  await git(root, ["init"])
  await git(root, ["config", "--local", "user.name", "测试维护者"])
  await git(root, ["config", "--local", "user.email", "maintainer@example.com"])
  await writeFile(path.join(root, "README.md"), "# fixture\n")
  await git(root, ["add", "README.md"])
  await git(root, ["commit", "-m", "test: initialize fixture"])
  return realpath(root)
}

beforeEach(async () => {
  const environmentRoot = await temporaryDirectory("web-git-environment-")
  process.env.GIT_CONFIG_GLOBAL = path.join(environmentRoot, "global.gitconfig")
  process.env.GIT_CONFIG_NOSYSTEM = "1"
})

afterEach(async () => {
  if (originalGitEnvironment.global === undefined) delete process.env.GIT_CONFIG_GLOBAL
  else process.env.GIT_CONFIG_GLOBAL = originalGitEnvironment.global
  if (originalGitEnvironment.noSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM
  else process.env.GIT_CONFIG_NOSYSTEM = originalGitEnvironment.noSystem
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("repository-local Git commit configuration", () => {
  /** 验证 bootstrap 保留合法 Unicode 名称并只补齐缺失字段。 */
  test("bootstraps only missing local identity fields", async () => {
    const root = await temporaryDirectory("web-git-identity-")
    await git(root, ["init"])
    await git(root, ["config", "--local", "user.name", "中文维护者"])

    const report = await bootstrapGitIdentity(root, "codex-user")

    expect(report.localName.value).toBe("中文维护者")
    expect(report.localEmail.value).toBe("codex-user@gmail.com")
    await expect(checkGitIdentity(root)).resolves.toMatchObject({
      projectRoot: await realpath(root)
    })
  })

  /** 验证完整 global 身份会被复用且 bootstrap 不创建 local 身份。 */
  test("preserves a complete effective global identity", async () => {
    const root = await temporaryDirectory("web-git-global-identity-")
    await git(root, ["init"])
    await git(root, ["config", "--global", "user.name", "全局维护者"])
    await git(root, ["config", "--global", "user.email", "global@example.com"])

    const report = await bootstrapGitIdentity(root)

    expect(report.effectiveName).toMatchObject({ scope: "global", value: "全局维护者" })
    expect(report.effectiveEmail).toMatchObject({ scope: "global", value: "global@example.com" })
    expect(report.localName.value).toBeUndefined()
    expect(report.localEmail.value).toBeUndefined()
  })

  /** 验证只缺邮箱时仅补写 local 邮箱而不遮蔽已有 global 名称。 */
  test("fills only the missing effective email", async () => {
    const root = await temporaryDirectory("web-git-partial-identity-")
    await git(root, ["init"])
    await git(root, ["config", "--global", "user.name", "Existing Name"])

    const report = await bootstrapGitIdentity(root, "device-user")

    expect(report.effectiveName).toMatchObject({ scope: "global", value: "Existing Name" })
    expect(report.localName.value).toBeUndefined()
    expect(report.localEmail.value).toBe("device-user@gmail.com")
  })

  /** 验证非法 fallback 在任何 local 身份写入前失败。 */
  test("rejects an unsafe fallback without mutating identity", async () => {
    const root = await temporaryDirectory("web-git-invalid-identity-")
    await git(root, ["init"])
    const before = await reportGitIdentity(root)

    await expect(bootstrapGitIdentity(root, "unsafe name")).rejects.toThrow(/safe ASCII/)

    expect(await reportGitIdentity(root)).toEqual(before)
  })

  /** 验证已存在但非法的 effective 身份不会被 local fallback 静默覆盖。 */
  test("rejects an invalid effective identity", async () => {
    const root = await temporaryDirectory("web-git-invalid-effective-")
    await git(root, ["init"])
    await git(root, ["config", "--global", "user.name", "Existing Name"])
    await git(root, ["config", "--global", "user.email", "not-an-email"])

    await expect(bootstrapGitIdentity(root, "device-user")).rejects.toThrow(
      /effective Git user.email is invalid/
    )

    expect((await reportGitIdentity(root)).localEmail.value).toBeUndefined()
  })

  /** 验证模板与 local 配置在普通仓库和 linked Worktree 中共享同一 common-dir。 */
  test("installs and checks the managed template through Git common-dir", async () => {
    const root = await initializedRepository("web-git-template-")
    const installed = await installCommitConfiguration(root)
    const worktree = await temporaryDirectory("web-git-linked-")
    await rm(worktree, { recursive: true, force: true })
    await git(root, ["worktree", "add", worktree, "-b", "codex/test-linked"])

    const linked = await checkCommitConfiguration(worktree)

    expect(linked.commonDir).toBe(installed.commonDir)
    expect(linked.templatePath).toBe(installed.templatePath)
    expect((await readFile(installed.templatePath, "utf8")).split("\n").filter(Boolean)).toSatisfy(
      (lines: string[]) => lines.every((line) => line.startsWith("#"))
    )
  })

  /** 验证冲突 local 配置在模板写入前失败，显式 replace 才允许收敛。 */
  test("preflights conflicts and requires replace for convergence", async () => {
    const root = await initializedRepository("web-git-conflict-")
    await git(root, ["config", "--local", "commit.cleanup", "scissors"])
    const commonDir = await realpath(
      await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    )
    const templatePath = path.join(commonDir, "harness/meaningful-commit-template.txt")

    await expect(installCommitConfiguration(root)).rejects.toThrow(/different value/)
    await expect(readFile(templatePath)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await git(root, ["config", "--local", "--get", "commit.cleanup"])).toBe("scissors")

    await expect(installCommitConfiguration(root, true)).resolves.toMatchObject({ templatePath })
    await expect(checkCommitConfiguration(root)).resolves.toMatchObject({ templatePath })
  })

  /** 验证优先级更高的 commentString 不能绕过井号模板注释清理。 */
  test("rejects and repairs a conflicting core.commentString", async () => {
    const root = await initializedRepository("web-git-comment-string-")
    await installCommitConfiguration(root)
    await git(root, ["config", "--local", "core.commentString", "//"])

    await expect(checkCommitConfiguration(root)).rejects.toThrow(/core\.commentString/)
    await expect(installCommitConfiguration(root)).rejects.toThrow(/core\.commentString/)
    await expect(installCommitConfiguration(root, true)).resolves.toMatchObject({
      replacedConflicts: true,
      settings: { "core.commentChar": "#", "core.commentString": "#" }
    })
    expect(await git(root, ["config", "--local", "--get", "core.commentString"])).toBe("#")
  })

  /** 验证重复安装保持字节与 local 配置幂等。 */
  test("is idempotent after the managed configuration converges", async () => {
    const root = await initializedRepository("web-git-idempotent-")
    const first = await installCommitConfiguration(root)
    const before = await readFile(first.templatePath)

    const second = await installCommitConfiguration(root)

    expect(first.changed).toBe(true)
    expect(second).toEqual({ ...first, changed: false })
    expect(await readFile(first.templatePath)).toEqual(before)
  })

  /** 验证符号链接项目根不会被当成可写 Git 根。 */
  test("rejects a symbolic-link project root", async () => {
    const root = await initializedRepository("web-git-real-root-")
    const aliasParent = await temporaryDirectory("web-git-root-alias-")
    const alias = path.join(aliasParent, "repository")
    await symlink(root, alias)

    await expect(reportGitIdentity(alias)).rejects.toThrow(/real directory/)
  })

  /** 验证消息资产包含完整 type、影响与测试事实，并限制破坏性标记。 */
  test("ships the complete meaningful commit convention", async () => {
    const template = await readFile(
      path.resolve(".agents/skills/web-configure-git-commits/assets/commit-template.txt"),
      "utf8"
    )
    const convention = await readFile(
      path.resolve(".agents/skills/web-configure-git-commits/references/commit-convention.md"),
      "utf8"
    )

    expect(template).toContain("# Impact:")
    expect(template).toContain("# Test:")
    expect(template).toContain(
      "feat | fix | refactor | perf | ui | style | docs | test | build | ci | chore | revert"
    )
    for (const type of [
      "feat",
      "fix",
      "refactor",
      "perf",
      "ui",
      "style",
      "docs",
      "test",
      "build",
      "ci",
      "chore",
      "revert"
    ]) {
      expect(convention).toContain(`| \`${type}\``)
    }
    expect(convention).toContain("只有已取得对外契约变化批准时")
    expect(convention).toContain("BREAKING CHANGE:")
    expect(convention).toContain("一个提交对应一个完整、独立、可解释的变化")
  })

  /** 验证真实 CLI 成功与失败都只返回稳定 JSON，并能发现安装后篡改。 */
  test("returns stable JSON from the real CLI and rejects post-install tampering", async () => {
    const root = await initializedRepository("web-git-real-cli-")
    const installed = await runConfigurationCli(["install", "--project-root", root])
    expect(installed.code).toBe(0)
    expect(installed.stderr).toBe("")
    const success = JSON.parse(installed.stdout) as Record<string, unknown>
    expect(success).toMatchObject({
      ok: true,
      operation: "install",
      status: "installed",
      changed: true,
      replacedConflicts: false,
      settings: {
        "commit.cleanup": "strip",
        "commit.verbose": "true",
        "core.commentChar": "#",
        "core.commentString": "#"
      }
    })

    await writeFile(String(success.templatePath), "# tampered\n")
    const checked = await runConfigurationCli(["check", "--project-root", root])
    expect(checked.code).toBe(4)
    expect(checked.stderr).toBe("")
    expect(JSON.parse(checked.stdout)).toMatchObject({
      ok: false,
      status: "error",
      operation: "check",
      error: {
        code: "operation_failed",
        message: expect.stringMatching(/differs/)
      }
    })

    const invalid = await runConfigurationCli(["install", "--project-root"])
    expect(invalid.code).toBe(2)
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false,
      error: { code: "invalid_arguments" }
    })
  })

  /** 验证模板安装与身份检查不会改写隔离的 global 配置字节。 */
  test("preserves global Git configuration bytes", async () => {
    const root = await initializedRepository("web-git-global-bytes-")
    await git(root, ["config", "--global", "user.name", "Global User"])
    await git(root, ["config", "--global", "user.email", "global@example.com"])
    await git(root, ["config", "--global", "commit.cleanup", "verbatim"])
    const globalPath = process.env.GIT_CONFIG_GLOBAL ?? ""
    const before = await readFile(globalPath)

    await installCommitConfiguration(root)
    await reportGitIdentity(root)
    await checkGitIdentity(root)

    expect(await readFile(globalPath)).toEqual(before)
  })
})
