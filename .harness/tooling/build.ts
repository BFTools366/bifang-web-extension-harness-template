import { spawn } from "node:child_process"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { loadProjectConfig } from "./config.ts"
import { EXTENSION_TARGETS } from "./extension-targets.ts"
import type { E2eSelection, ProjectType } from "./types.ts"
import { isValidExtensionVersion, WEB_BUILD_VERSION_PATTERN } from "./version.ts"
import { isMainModule } from "./files.ts"

const BUILD_TIME_ZONE = "Asia/Shanghai" as const
// 定义 BuildTarget 类型约束受支持的产物动作。
export type BuildTarget = "build" | "package"
export type { E2eSelection } from "./types.ts"

// 定义 BuildArguments 接口承载构建命令参数。
export interface BuildArguments {
  // 描述 e2e 接口成员的当次选择。
  e2e?: E2eSelection
  // 描述 target 接口成员的产物动作。
  target: BuildTarget
}

// 定义 BuildCommand 接口描述一个顺序执行的构建命令。
export interface BuildCommand {
  // 描述 args 接口成员的命令参数。
  args: string[]
  // 描述 command 接口成员的可执行程序。
  command: string
  // 描述 env 接口成员的临时构建变量。
  env?: Readonly<Record<string, string>>
}

// 执行 formatBuildVersion 函数，按上海时区生成 YYMMDDHHMMSS 构建版本。
export function formatBuildVersion(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: BUILD_TIME_ZONE,
    year: "numeric"
  })
  const values = new Map<string, string>()
  // 遍历格式化字段并保存版本所需值。
  for (const part of formatter.formatToParts(now)) {
    values.set(part.type, part.value)
  }
  const version = ["year", "month", "day", "hour", "minute", "second"]
    .map(
      // 执行当前字段到格式化值的映射。
      (name) => (name === "year" ? values.get(name)?.slice(-2) : values.get(name)) ?? ""
    )
    .join("")
  if (!WEB_BUILD_VERSION_PATTERN.test(version)) {
    throw new Error(`Cannot format build version in ${BUILD_TIME_ZONE}`)
  }
  return version
}

// 从 Extension 的 package.json 读取稳定 SemVer，不改变版本文件。
export async function readExtensionBuildVersion(root: string): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
  const version =
    manifest !== null && typeof manifest === "object" && "version" in manifest
      ? manifest.version
      : undefined
  if (!isValidExtensionVersion(version)) {
    throw new Error("Extension package.json.version must use Chrome-compatible stable SemVer X.Y.Z")
  }
  return version
}

// 按唯一 projectType 选择 Web 时间版本或 Extension 包版本。
export async function resolveBuildVersion(
  projectType: ProjectType,
  root: string,
  now: Date
): Promise<string> {
  return projectType === "web" ? formatBuildVersion(now) : readExtensionBuildVersion(root)
}

// 执行 parseBuildArguments 函数，解析产物动作和 E2E 选择。
export function parseBuildArguments(argv: readonly string[]): BuildArguments {
  const target = argv[0]
  if (target !== "build" && target !== "package") {
    throw new Error(
      "Usage: pnpm build -- --e2e=enabled|disabled or pnpm package -- --e2e=enabled|disabled"
    )
  }
  let e2e: E2eSelection | undefined
  // 遍历剩余参数并拒绝未知构建选项。
  for (const argument of argv.slice(1)) {
    if (argument === "--") continue
    if (!argument.startsWith("--e2e=")) {
      throw new Error(`Unknown build option: ${argument}`)
    }
    if (e2e !== undefined) throw new Error("--e2e can only be provided once")
    const value = argument.slice("--e2e=".length)
    if (value !== "enabled" && value !== "disabled") {
      throw new Error("--e2e must be enabled or disabled")
    }
    e2e = value
  }
  return { e2e, target }
}

// 执行 createBuildCommandPlan 函数，生成唯一且无重复门禁的构建链。
export function createBuildCommandPlan(
  projectType: ProjectType,
  target: BuildTarget,
  buildVersion: string
): BuildCommand[] {
  if (projectType === "web" && !WEB_BUILD_VERSION_PATTERN.test(buildVersion)) {
    throw new Error("Web build version must use YYMMDDHHMMSS")
  }
  if (projectType === "extension" && !isValidExtensionVersion(buildVersion)) {
    throw new Error("Extension build version must use Chrome-compatible stable SemVer X.Y.Z")
  }
  if (target === "package" && projectType !== "extension") {
    throw new Error("Only an Extension project can create a package")
  }
  const commands: BuildCommand[] = [
    { command: "pnpm", args: ["env:validate", "--profile", "release"] },
    { command: "pnpm", args: ["harness", "validate"] },
    { command: "pnpm", args: ["format:check"] },
    { command: "pnpm", args: ["lint"] },
    { command: "pnpm", args: ["typecheck"] },
    { command: "pnpm", args: ["test"] }
  ]
  if (projectType === "web") {
    commands.push({
      command: "pnpm",
      args: ["exec", "vite", "build", "--mode", "production"],
      env: { VITE_BUILD_VERSION: buildVersion }
    })
  } else {
    for (const browser of EXTENSION_TARGETS) {
      const plasmoArgs = ["exec", "plasmo", "build"]
      if (target === "package") plasmoArgs.push("--zip")
      plasmoArgs.push(
        `--target=${browser.target}`,
        "--tag=prod",
        "--build-path=build",
        "--src-path=src",
        "--env=.env.production"
      )
      commands.push({
        command: "pnpm",
        args: plasmoArgs,
        env: { PLASMO_PUBLIC_BUILD_VERSION: buildVersion }
      })
    }
  }
  commands.push({
    command: "pnpm",
    args: ["release:inspect"],
    env: { HARNESS_BUILD_VERSION: buildVersion }
  })
  return commands
}

// 执行 promptForE2eSelection 函数，取得交互式构建的当次 E2E 决定。
async function promptForE2eSelection(): Promise<E2eSelection> {
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    while (true) {
      const answer = (await prompt.question("本次构建完成后是否启用 E2E 测试？[y/N] ")).trim()
      if (answer === "" || /^(?:n|no|否)$/iu.test(answer)) return "disabled"
      if (/^(?:y|yes|是)$/iu.test(answer)) return "enabled"
      stdout.write("请输入 y/yes/是 或 n/no/否。\n")
    }
  } finally {
    prompt.close()
  }
}

// 执行 resolveE2eSelection 函数，复用显式传入的发布 E2E 选择，缺少参数时才提示。
export async function resolveE2eSelection(
  explicit: E2eSelection | undefined,
  interactive: boolean
): Promise<E2eSelection> {
  if (explicit !== undefined) return explicit
  if (interactive) return promptForE2eSelection()
  throw new Error("非交互构建必须传入 --e2e=enabled 或 --e2e=disabled；复用当前发布的 E2E 选择。")
}

// 执行 runCommand 函数，按原样转发单个构建门禁的输入输出。
async function runCommand(specification: BuildCommand, root: string): Promise<void> {
  const child = spawn(specification.command, specification.args, {
    cwd: root,
    env: { ...process.env, ...specification.env },
    stdio: "inherit"
  })
  const [code, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null]
  if (code === 0) return
  const suffix = signal === null ? `退出码 ${String(code)}` : `信号 ${signal}`
  throw new Error(`${specification.command} ${specification.args.join(" ")} 执行失败：${suffix}`)
}

// 执行 runBuild 函数，串行完成选择、全量单测、宿主构建与产物检查。
export async function runBuild(
  rootInput: string,
  args: BuildArguments,
  interactive: boolean,
  now = new Date()
): Promise<{ buildVersion: string; e2e: E2eSelection }> {
  const root = path.resolve(rootInput)
  const project = await loadProjectConfig(root)
  const e2e = await resolveE2eSelection(args.e2e, interactive)
  const buildVersion = await resolveBuildVersion(project.projectType, root, now)
  for (const command of createBuildCommandPlan(project.projectType, args.target, buildVersion)) {
    await runCommand(command, root)
  }
  console.log(`构建 ${buildVersion} 通过；E2E 选择：${e2e}。`)
  if (e2e === "enabled") {
    console.log("已选择 E2E，尚待执行：对本次精确产物运行 $web-test-final-artifact-e2e。")
  }
  return { buildVersion, e2e }
}

// 执行 runCli 函数，连接 pnpm 脚本与构建编排器。
async function runCli(): Promise<void> {
  try {
    const args = parseBuildArguments(process.argv.slice(2))
    await runBuild(process.cwd(), args, stdin.isTTY === true && stdout.isTTY === true)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (isMainModule(import.meta.url)) void runCli()
