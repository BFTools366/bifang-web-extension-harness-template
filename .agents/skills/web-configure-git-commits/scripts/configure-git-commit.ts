import { execFile } from "node:child_process"
import { open, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify, TextDecoder } from "node:util"

/** 枚举 Git 提交配置 helper 的命令。 */
export type CommitConfigurationCommand =
  "identity-report" | "identity-bootstrap" | "identity-check" | "install" | "check"

/** 描述 Git 配置值与来源。 */
export interface GitConfigValue {
  /** 保存 Git 解析的配置作用域。 */
  scope?: string
  /** 保存解析后的配置值。 */
  value?: string
  /** 保存 Git 返回的来源描述。 */
  origin?: string
}

/** 描述 local/global/effective 提交身份。 */
export interface GitIdentityReport {
  /** 保存只读身份或 bootstrap 结果状态。 */
  status: "ok" | "missing" | "configured"
  /** 表示本次 bootstrap 是否写入了 local 字段。 */
  changed?: boolean
  /** 保存本次写入的 local 键。 */
  writtenLocalKeys?: string[]
  /** 保存规范化 Git 顶层。 */
  projectRoot: string
  /** 保存规范化 Git common-dir。 */
  commonDir: string
  /** 保存 local 用户名。 */
  localName: GitConfigValue
  /** 保存 local 邮箱。 */
  localEmail: GitConfigValue
  /** 保存 global 用户名。 */
  globalName: GitConfigValue
  /** 保存 global 邮箱。 */
  globalEmail: GitConfigValue
  /** 保存最终生效用户名。 */
  effectiveName: GitConfigValue
  /** 保存最终生效邮箱。 */
  effectiveEmail: GitConfigValue
}

/** 描述受管提交模板的稳定安装或检查结果。 */
export interface CommitConfigurationResult {
  /** 保存安装或检查状态。 */
  status: "installed" | "ok"
  /** 保存规范化 Git 顶层。 */
  projectRoot: string
  /** 保存规范化 Git common-dir。 */
  commonDir: string
  /** 保存受管模板路径。 */
  templatePath: string
  /** 保存全部受管 local 设置。 */
  settings: Record<string, string>
  /** 表示本次操作是否改变了模板或设置。 */
  changed: boolean
  /** 表示是否经显式 replace 收敛了冲突。 */
  replacedConflicts: boolean
}

/** 描述模板安装与检查使用的仓库身份。 */
interface RepositoryIdentity {
  /** 保存真实 Git 顶层。 */
  projectRoot: string
  /** 保存真实 Git common-dir。 */
  commonDir: string
}

/** 描述命令行解析结果。 */
interface CliOptions {
  /** 保存唯一模式。 */
  command: CommitConfigurationCommand
  /** 保存用户声明项目根。 */
  projectRoot: string
  /** 保存身份补全 fallback。 */
  fallbackUsername?: string
  /** 表示用户已批准替换冲突配置。 */
  replace: boolean
}

/** 表示可以稳定归类为参数错误的 CLI 失败。 */
class CliInputError extends Error {}

/** 保存无需 Shell 的异步进程入口。 */
const execFileAsync = promisify(execFile)
/** 保存 repo-local 提交模板配置。 */
const MANAGED_CONFIG = {
  "commit.cleanup": "strip",
  "commit.verbose": "true",
  "core.commentChar": "#",
  "core.commentString": "#"
} as const
/** 保存安全 fallback 名称格式。 */
const FALLBACK_USERNAME = /^[A-Za-z](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u

/** 运行 Git 并返回去除单个尾部换行的 stdout。 */
async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.replace(/\r?\n$/u, "")
}

/** 读取可缺失的 Git 配置和来源。 */
async function readConfig(
  root: string,
  scope: "--local" | "--global" | null,
  key: string
): Promise<GitConfigValue> {
  try {
    const args = ["config"]
    if (scope !== null) args.push(scope)
    args.push("--null", "--show-origin", "--show-scope", "--get", key)
    const output = await git(root, args)
    const fields = output.split("\0").filter((value) => value !== "")
    if (fields.length !== 3) throw new Error(`Unexpected Git config output for ${key}`)
    return { scope: fields[0], origin: fields[1], value: fields[2] }
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return {}
    throw error
  }
}

/** 读取一项 repo-local 配置的全部值并保留顺序。 */
async function readLocalValues(root: string, key: string): Promise<string[]> {
  try {
    const output = await git(root, ["config", "--local", "--null", "--get-all", key])
    const values = output.split("\0")
    if (values.at(-1) === "") values.pop()
    return values
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return []
    throw error
  }
}

/** 以确定顺序替换一项 repo-local 配置的全部值。 */
async function replaceLocalValues(
  root: string,
  key: string,
  values: readonly string[]
): Promise<void> {
  await execFileAsync("git", ["config", "--local", "--unset-all", key], {
    cwd: root,
    encoding: "utf8"
  }).catch((error: unknown) => {
    if ((error as { code?: unknown }).code !== 5) throw error
  })
  for (const value of values) await git(root, ["config", "--local", "--add", key, value])
}

/** 验证并规范化 Git 顶层与 common-dir。 */
async function repositoryIdentity(projectRootInput: string): Promise<RepositoryIdentity> {
  const requested = path.resolve(projectRootInput)
  const status = await lstat(requested)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Project root must be a real directory: ${requested}`)
  }
  const projectRoot = await realpath(requested)
  const topLevel = await realpath(await git(projectRoot, ["rev-parse", "--show-toplevel"]))
  if (topLevel !== projectRoot) {
    throw new Error(`Project root must equal the Git top-level directory: ${projectRoot}`)
  }
  const commonRaw = await git(projectRoot, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  ])
  return { projectRoot, commonDir: await realpath(commonRaw) }
}

/** 判断用户名或邮箱是否是非空、无控制字符的稳定值。 */
function validIdentityValue(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.trim() !== "" &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 || code === 127
    })
  )
}

/** 判断邮箱是否具备安全的基本结构。 */
function validEmail(value: string | undefined): value is string {
  return validIdentityValue(value) && /^[^\s@]+@[^\s@]+$/u.test(value)
}

/** 读取完整 Git 身份报告。 */
export async function reportGitIdentity(projectRoot: string): Promise<GitIdentityReport> {
  const identity = await repositoryIdentity(projectRoot)
  const [localName, localEmail, globalName, globalEmail, effectiveName, effectiveEmail] =
    await Promise.all([
      readConfig(identity.projectRoot, "--local", "user.name"),
      readConfig(identity.projectRoot, "--local", "user.email"),
      readConfig(identity.projectRoot, "--global", "user.name"),
      readConfig(identity.projectRoot, "--global", "user.email"),
      readConfig(identity.projectRoot, null, "user.name"),
      readConfig(identity.projectRoot, null, "user.email")
    ])
  return {
    status:
      effectiveName.value === undefined || effectiveEmail.value === undefined ? "missing" : "ok",
    ...identity,
    localName,
    localEmail,
    globalName,
    globalEmail,
    effectiveName,
    effectiveEmail
  }
}

/** 证明最终生效 Git 身份完整且合法。 */
export async function checkGitIdentity(projectRoot: string): Promise<GitIdentityReport> {
  const report = await reportGitIdentity(projectRoot)
  if (!validIdentityValue(report.effectiveName.value)) throw new Error("Git user.name is missing")
  if (!validEmail(report.effectiveEmail.value))
    throw new Error("Git user.email is missing or invalid")
  return { ...report, status: "ok" }
}

/** 恢复一项 local Git 配置为原始存在或缺失状态。 */
/** 只补齐缺失的 repo-local Git 身份，并在失败时回滚。 */
export async function bootstrapGitIdentity(
  projectRoot: string,
  fallbackUsername?: string
): Promise<GitIdentityReport> {
  const before = await reportGitIdentity(projectRoot)
  if (before.effectiveName.value !== undefined && !validIdentityValue(before.effectiveName.value)) {
    throw new Error("Existing effective Git user.name is invalid; refusing silent replacement")
  }
  if (before.effectiveEmail.value !== undefined && !validEmail(before.effectiveEmail.value)) {
    throw new Error("Existing effective Git user.email is invalid; refusing silent replacement")
  }
  const missing = [
    ...(before.effectiveName.value === undefined ? ["user.name"] : []),
    ...(before.effectiveEmail.value === undefined ? ["user.email"] : [])
  ]
  if (
    missing.length > 0 &&
    (fallbackUsername === undefined || !FALLBACK_USERNAME.test(fallbackUsername))
  ) {
    throw new Error("Missing Git identity requires a safe ASCII --fallback-username")
  }
  const changes: Array<[string, string]> = []
  if (missing.includes("user.name")) changes.push(["user.name", fallbackUsername ?? ""])
  if (missing.includes("user.email")) {
    changes.push(["user.email", `${fallbackUsername ?? ""}@gmail.com`])
  }
  const previous = new Map<string, string[]>()
  for (const [key] of changes) previous.set(key, await readLocalValues(before.projectRoot, key))
  const touched: string[] = []
  try {
    for (const [key, value] of changes) {
      touched.push(key)
      await replaceLocalValues(before.projectRoot, key, [value])
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const key of touched.reverse()) {
      await replaceLocalValues(before.projectRoot, key, previous.get(key) ?? []).catch((rollback) =>
        rollbackErrors.push(rollback)
      )
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Git identity update failed and rollback was incomplete",
        { cause: error }
      )
    }
    throw error
  }
  const after = await checkGitIdentity(before.projectRoot)
  return {
    ...after,
    status: "configured",
    changed: changes.length > 0,
    writtenLocalKeys: changes.map(([key]) => key).sort()
  }
}

/** 返回 Skill 内受管模板的精确路径与字节。 */
async function managedTemplate(): Promise<{ path: string; contents: Buffer }> {
  const templatePath = path.resolve(import.meta.dirname, "../assets/commit-template.txt")
  const status = await lstat(templatePath)
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error("Source commit template must be a regular file")
  }
  const contents = await readFile(templatePath)
  const text = new TextDecoder("utf-8", { fatal: true }).decode(contents)
  if (
    text.trim() === "" ||
    !text.endsWith("\n") ||
    text.split(/\r?\n/u).some((line) => line !== "" && !line.startsWith("#"))
  ) {
    throw new Error("Managed commit template must contain only comment lines")
  }
  return { path: templatePath, contents }
}

/** 失败关闭地检查受管 Git 元数据目录与模板文件类型。 */
async function assertManagedTarget(filePath: string): Promise<void> {
  const directoryStatus = await lstat(path.dirname(filePath)).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (
    directoryStatus?.isSymbolicLink() === true ||
    (directoryStatus !== undefined && !directoryStatus.isDirectory())
  ) {
    throw new Error("Managed Git metadata path must be a real directory")
  }
  const fileStatus = await lstat(filePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (fileStatus?.isSymbolicLink() === true || (fileStatus !== undefined && !fileStatus.isFile())) {
    throw new Error("Managed commit template must be a regular file")
  }
}

/** 原子写入文件并同步文件和父目录。 */
async function writeAtomic(filePath: string, contents: Uint8Array): Promise<void> {
  const directory = path.dirname(filePath)
  const directoryStatus = await lstat(directory).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (
    directoryStatus?.isSymbolicLink() === true ||
    (directoryStatus !== undefined && !directoryStatus.isDirectory())
  ) {
    throw new Error("Managed Git metadata path must be a real directory")
  }
  if (directoryStatus === undefined) await mkdir(directory, { mode: 0o700 })
  const existing = await lstat(filePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (existing?.isSymbolicLink() === true || (existing !== undefined && !existing.isFile())) {
    throw new Error("Managed commit template must be a regular file")
  }
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o644 })
    const fileHandle = await open(temporary, "r")
    try {
      await fileHandle.sync()
    } finally {
      await fileHandle.close()
    }
    await rename(temporary, filePath)
    const directoryHandle = await open(directory, "r")
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

/** 验证模板字节与全部 repo-local Git 配置。 */
export async function checkCommitConfiguration(
  projectRoot: string
): Promise<CommitConfigurationResult> {
  const identity = await repositoryIdentity(projectRoot)
  const template = await managedTemplate()
  const templatePath = path.join(identity.commonDir, "harness/meaningful-commit-template.txt")
  await assertManagedTarget(templatePath)
  const installedStatus = await lstat(templatePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (
    installedStatus?.isSymbolicLink() === true ||
    (installedStatus !== undefined && !installedStatus.isFile())
  ) {
    throw new Error("Managed commit template must be a regular file")
  }
  const installed = await readFile(templatePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (installed === undefined || !installed.equals(template.contents)) {
    throw new Error("Managed commit template is missing or differs from the Skill asset")
  }
  const expected = { "commit.template": templatePath, ...MANAGED_CONFIG }
  for (const [key, value] of Object.entries(expected)) {
    const actual = await readLocalValues(identity.projectRoot, key)
    if (actual.length !== 1 || actual[0] !== value) {
      throw new Error(`Local Git config ${key} must contain exactly ${value}`)
    }
  }
  return {
    ...identity,
    status: "ok",
    templatePath,
    settings: expected,
    changed: false,
    replacedConflicts: false
  }
}

/** 安装受管提交模板和 repo-local 配置，并对失败执行完整回滚。 */
export async function installCommitConfiguration(
  projectRoot: string,
  replace = false
): Promise<CommitConfigurationResult> {
  const identity = await repositoryIdentity(projectRoot)
  const template = await managedTemplate()
  const templatePath = path.join(identity.commonDir, "harness/meaningful-commit-template.txt")
  await assertManagedTarget(templatePath)
  const existingStatus = await lstat(templatePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  if (
    existingStatus?.isSymbolicLink() === true ||
    (existingStatus !== undefined && !existingStatus.isFile())
  ) {
    throw new Error("Managed commit template must be a regular file")
  }
  const existingTemplate = await readFile(templatePath).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined
    throw error
  })
  const expected = { "commit.template": templatePath, ...MANAGED_CONFIG }
  const previous = new Map<string, string[]>()
  const settingsToChange: Array<[string, string]> = []
  let configurationConflict = false
  for (const [key, value] of Object.entries(expected)) {
    const current = await readLocalValues(identity.projectRoot, key)
    previous.set(key, current)
    if (current.length !== 1 || current[0] !== value) settingsToChange.push([key, value])
    if (current.length > 0 && (current.length !== 1 || current[0] !== value)) {
      configurationConflict = true
    }
    if (!replace && current.length > 0 && (current.length !== 1 || current[0] !== value)) {
      throw new Error(`Local Git config ${key} already has a different value`)
    }
  }
  if (!replace && existingTemplate !== undefined && !existingTemplate.equals(template.contents)) {
    throw new Error("Managed commit template path already contains different bytes")
  }
  const templateChanged =
    existingTemplate === undefined || !existingTemplate.equals(template.contents)
  const replacedConflicts =
    replace &&
    (configurationConflict ||
      (existingTemplate !== undefined && !existingTemplate.equals(template.contents)))
  const changed = templateChanged || settingsToChange.length > 0
  const touched: string[] = []
  try {
    if (templateChanged) {
      await writeAtomic(templatePath, template.contents)
    }
    for (const [key, value] of settingsToChange) {
      touched.push(key)
      await replaceLocalValues(identity.projectRoot, key, [value])
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const key of touched.reverse()) {
      await replaceLocalValues(identity.projectRoot, key, previous.get(key) ?? []).catch(
        (rollback) => rollbackErrors.push(rollback)
      )
    }
    if (templateChanged) {
      if (existingTemplate === undefined) {
        await rm(templatePath, { force: true }).catch((rollback) => rollbackErrors.push(rollback))
      } else {
        await writeAtomic(templatePath, existingTemplate).catch((rollback) =>
          rollbackErrors.push(rollback)
        )
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Commit template update failed and rollback was incomplete",
        { cause: error }
      )
    }
    throw error
  }
  const checked = await checkCommitConfiguration(identity.projectRoot)
  return {
    ...checked,
    status: "installed",
    changed,
    replacedConflicts
  }
}

/** 解析严格、显式的 helper 命令行。 */
function parseCli(argv: string[]): CliOptions {
  const command = argv[0] as CommitConfigurationCommand | undefined
  if (
    !["identity-report", "identity-bootstrap", "identity-check", "install", "check"].includes(
      command ?? ""
    )
  ) {
    throw new CliInputError(
      "Expected identity-report|identity-bootstrap|identity-check|install|check"
    )
  }
  let projectRoot: string | undefined
  let fallbackUsername: string | undefined
  let replace = false
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--replace") {
      replace = true
      continue
    }
    const value = argv[index + 1]
    if ((flag !== "--project-root" && flag !== "--fallback-username") || value === undefined) {
      throw new CliInputError(`Unknown or incomplete option: ${String(flag)}`)
    }
    if (flag === "--project-root") projectRoot = value
    else fallbackUsername = value
    index += 1
  }
  if (projectRoot === undefined) throw new CliInputError("--project-root is required")
  if (command !== "identity-bootstrap" && fallbackUsername !== undefined) {
    throw new CliInputError("--fallback-username is only valid for identity-bootstrap")
  }
  if (command !== "install" && replace)
    throw new CliInputError("--replace is only valid for install")
  return { command: command as CommitConfigurationCommand, projectRoot, fallbackUsername, replace }
}

/** 执行 helper 命令并向 stdout 输出唯一稳定 JSON 结果。 */
export async function runCommitConfigurationCli(argv = process.argv.slice(2)): Promise<number> {
  let operation = argv[0] ?? "unknown"
  try {
    const options = parseCli(argv)
    operation = options.command
    let result: GitIdentityReport | CommitConfigurationResult
    if (options.command === "identity-report") {
      result = await reportGitIdentity(options.projectRoot)
    } else if (options.command === "identity-check") {
      result = await checkGitIdentity(options.projectRoot)
    } else if (options.command === "identity-bootstrap") {
      result = await bootstrapGitIdentity(options.projectRoot, options.fallbackUsername)
    } else if (options.command === "install") {
      result = await installCommitConfiguration(options.projectRoot, options.replace)
    } else {
      result = await checkCommitConfiguration(options.projectRoot)
    }
    process.stdout.write(`${JSON.stringify({ ok: true, operation, ...result })}\n`)
    return 0
  } catch (error) {
    const code = error instanceof CliInputError ? "invalid_arguments" : "operation_failed"
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write(
      `${JSON.stringify({ ok: false, status: "error", operation, error: { code, message } })}\n`
    )
    return error instanceof CliInputError ? 2 : 4
  }
}

/** 保存当前脚本直接执行时的规范化 URL。 */
const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  void runCommitConfigurationCli().then((exitCode) => {
    process.exitCode = exitCode
  })
}
