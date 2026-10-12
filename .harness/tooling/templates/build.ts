import type { ProjectConfig } from "../types.ts"

// 执行 terminalBuildSource 函数，生成只包含当前宿主的构建编排器。
function terminalBuildSource(config: ProjectConfig): string {
  const targetType = config.projectType === "web" ? '"build"' : '"build" | "package"'
  const targetGuard =
    config.projectType === "web"
      ? 'target !== "build"'
      : 'target !== "build" && target !== "package"'
  const usage =
    config.projectType === "web"
      ? "pnpm build -- --e2e=enabled|disabled"
      : "pnpm build -- --e2e=enabled|disabled or pnpm package -- --e2e=enabled|disabled"
  const hostCommand =
    config.projectType === "web"
      ? `return [{
    command: "pnpm",
    args: ["exec", "vite", "build", "--mode", "production"],
    env: { VITE_BUILD_VERSION: buildVersion }
  }]`
      : `return EXTENSION_TARGETS.map((browser) => {
    const args = ["exec", "plasmo", "build"]
    if (target === "package") args.push("--zip")
    args.push("--target=" + browser.target, "--tag=prod", "--build-path=build", "--src-path=src", "--env=.env.production")
    return { command: "pnpm", args, env: { PLASMO_PUBLIC_BUILD_VERSION: buildVersion } }
  })`
  const versionImport =
    config.projectType === "web"
      ? 'import { WEB_BUILD_VERSION_PATTERN as BUILD_VERSION_PATTERN } from "./version.ts"'
      : 'import { isValidExtensionVersion } from "./version.ts"'
  const versionSource =
    config.projectType === "web"
      ? `const BUILD_TIME_ZONE = "Asia/Shanghai" as const

/** 按上海时区生成 YYMMDDHHMMSS 构建版本。 */
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
  for (const part of formatter.formatToParts(now)) values.set(part.type, part.value)
  const version = ["year", "month", "day", "hour", "minute", "second"]
    .map((name) => (name === "year" ? values.get(name)?.slice(-2) : values.get(name)) ?? "")
    .join("")
  if (!BUILD_VERSION_PATTERN.test(version)) {
    throw new Error("Cannot format build version in " + BUILD_TIME_ZONE)
  }
  return version
}`
      : `/** 从 package.json 读取 Extension 稳定 SemVer，不改写版本文件。 */
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
}`
  const versionError =
    config.projectType === "web"
      ? "Web build version must use YYMMDDHHMMSS"
      : "Extension build version must use Chrome-compatible stable SemVer X.Y.Z"

  return `import { spawn } from "node:child_process"
import { once } from "node:events"
${config.projectType === "extension" ? 'import { readFile } from "node:fs/promises"' : ""}
import path from "node:path"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { pathToFileURL } from "node:url"
import { loadProjectConfig } from "./config.ts"
${config.projectType === "extension" ? 'import { EXTENSION_TARGETS } from "./extension-targets.ts"' : ""}
import type { E2eSelection } from "./types.ts"
${versionImport}

const PROJECT_TYPE = "${config.projectType}" as const

/** 说明 BuildTarget 的稳定结构与职责边界。 */
export type BuildTarget = ${targetType}
export type { E2eSelection } from "./types.ts"

/** 说明 BuildArguments 的稳定结构与职责边界。 */
export interface BuildArguments {
  e2e?: E2eSelection
  target: BuildTarget
}

/** 说明 BuildCommand 的稳定结构与职责边界。 */
export interface BuildCommand {
  args: string[]
  command: string
  env?: Readonly<Record<string, string>>
}

${versionSource}

/** 说明 parseBuildArguments 的稳定结构与职责边界。 */
export function parseBuildArguments(argv: readonly string[]): BuildArguments {
  const target = argv[0]
  if (${targetGuard}) throw new Error("Usage: ${usage}")
  let e2e: E2eSelection | undefined
  for (const argument of argv.slice(1)) {
    if (argument === "--") continue
    if (!argument.startsWith("--e2e=")) throw new Error("Unknown build option: " + argument)
    if (e2e !== undefined) throw new Error("--e2e can only be provided once")
    const value = argument.slice("--e2e=".length)
    if (value !== "enabled" && value !== "disabled") {
      throw new Error("--e2e must be enabled or disabled")
    }
    e2e = value
  }
  return { e2e, target }
}

/** 说明 createHostCommands 的稳定结构与职责边界。 */
function createHostCommands(target: BuildTarget, buildVersion: string): BuildCommand[] {
  ${hostCommand}
}

/** 说明 createBuildCommandPlan 的稳定结构与职责边界。 */
export function createBuildCommandPlan(
  target: BuildTarget,
  buildVersion: string
): BuildCommand[] {
  if (!${config.projectType === "web" ? "BUILD_VERSION_PATTERN.test" : "isValidExtensionVersion"}(buildVersion)) {
    throw new Error("${versionError}")
  }
  return [
    { command: "pnpm", args: ["env:validate", "--profile", "release"] },
    { command: "pnpm", args: ["harness", "validate"] },
    { command: "pnpm", args: ["format:check"] },
    { command: "pnpm", args: ["lint"] },
    { command: "pnpm", args: ["typecheck"] },
    { command: "pnpm", args: ["test"] },
    ...createHostCommands(target, buildVersion),
    {
      command: "pnpm",
      args: ["release:inspect"],
      env: { HARNESS_BUILD_VERSION: buildVersion }
    }
  ]
}

/** 说明 promptForE2eSelection 的稳定结构与职责边界。 */
async function promptForE2eSelection(): Promise<E2eSelection> {
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    while (true) {
      const answer = (
        await prompt.question("本次构建完成后是否启用 E2E 测试？[y/N] ")
      ).trim()
      if (answer === "" || /^(?:n|no|否)$/iu.test(answer)) return "disabled"
      if (/^(?:y|yes|是)$/iu.test(answer)) return "enabled"
      stdout.write("请输入 y/yes/是 或 n/no/否。\\n")
    }
  } finally {
    prompt.close()
  }
}

/** 说明 resolveE2eSelection 的稳定结构与职责边界。 */
export async function resolveE2eSelection(
  explicit: E2eSelection | undefined,
  interactive: boolean
): Promise<E2eSelection> {
  if (explicit !== undefined) return explicit
  if (interactive) return promptForE2eSelection()
  throw new Error(
    "非交互构建必须传入 --e2e=enabled 或 --e2e=disabled；复用当前发布的 E2E 选择。"
  )
}

/** 说明 runCommand 的稳定结构与职责边界。 */
async function runCommand(specification: BuildCommand, root: string): Promise<void> {
  const child = spawn(specification.command, specification.args, {
    cwd: root,
    env: { ...process.env, ...specification.env },
    stdio: "inherit"
  })
  const [code, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null]
  if (code === 0) return
  const suffix = signal === null ? "退出码 " + String(code) : "信号 " + signal
  throw new Error(
    specification.command + " " + specification.args.join(" ") + " 执行失败：" + suffix
  )
}

/** 说明 runBuild 的稳定结构与职责边界。 */
export async function runBuild(
  rootInput: string,
  args: BuildArguments,
  interactive: boolean${config.projectType === "web" ? ",\n  now = new Date()" : ""}
): Promise<{ buildVersion: string; e2e: E2eSelection }> {
  const root = path.resolve(rootInput)
  const project = await loadProjectConfig(root)
  if (project.projectType !== PROJECT_TYPE) {
    throw new Error("构建工具与 .harness/project.json 的 projectType 不一致")
  }
  const e2e = await resolveE2eSelection(args.e2e, interactive)
  const buildVersion = ${config.projectType === "web" ? "formatBuildVersion(now)" : "await readExtensionBuildVersion(root)"}
  for (const command of createBuildCommandPlan(args.target, buildVersion)) {
    await runCommand(command, root)
  }
  console.log("构建 " + buildVersion + " 通过；E2E 选择：" + e2e + "。")
  if (e2e === "enabled") {
    console.log(
      "已选择 E2E，尚待执行：对本次精确产物运行 $web-test-final-artifact-e2e。"
    )
  }
  return { buildVersion, e2e }
}

/** 说明 runCli 的稳定结构与职责边界。 */
async function runCli(): Promise<void> {
  try {
    const args = parseBuildArguments(process.argv.slice(2))
    await runBuild(process.cwd(), args, stdin.isTTY === true && stdout.isTTY === true)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) void runCli()
`
}

// 执行 terminalBuildTest 函数，生成当前宿主的构建编排回归测试。
function terminalBuildTest(config: ProjectConfig): string {
  const buildVersion = config.projectType === "web" ? "260824123459" : "1.2.3"
  const hostAssertions =
    config.projectType === "web"
      ? `expect(commands[6]).toMatchObject({
    args: ["exec", "vite", "build", "--mode", "production"],
    env: { VITE_BUILD_VERSION: "${buildVersion}" }
  })`
      : `for (const [index, browser] of ["chrome-mv3", "firefox-mv2"].entries()) {
    expect(commands[index + 6]).toMatchObject({
      args: ["exec", "plasmo", "build", "--target=" + browser, "--tag=prod", "--build-path=build", "--src-path=src", "--env=.env.production"],
      env: { PLASMO_PUBLIC_BUILD_VERSION: "${buildVersion}" }
    })
    const packaged = createBuildCommandPlan("package", "${buildVersion}")
    expect(packaged[index + 6]?.args).toEqual(["exec", "plasmo", "build", "--zip", "--target=" + browser, "--tag=prod", "--build-path=build", "--src-path=src", "--env=.env.production"])
  }`
  const versionTest =
    config.projectType === "web"
      ? `/** 验证上海时间的秒级 Web 版本并拒绝旧格式。 */
  test("formats the Shanghai Web build version", () => {
    expect(formatBuildVersion(new Date("2026-08-24T04:34:59.000Z"))).toBe("260824123459")
    expect(formatBuildVersion(new Date("2026-08-24T04:35:00.000Z"))).toBe("260824123500")
    expect(() => createBuildCommandPlan("build", "202608241234")).toThrow(/YYMMDDHHMMSS/)
  })`
      : `/** 验证 Extension 构建读取 package.json 的稳定 SemVer。 */
  test("uses the package SemVer for Extension builds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "extension-build-version-"))
    try {
      const manifestPath = path.join(root, "package.json")
      await writeFile(manifestPath, JSON.stringify({ version: "1.2.3" }))
      expect(await readExtensionBuildVersion(root)).toBe("1.2.3")
      await writeFile(manifestPath, JSON.stringify({ version: "1.2.3-beta.1" }))
      await expect(readExtensionBuildVersion(root)).rejects.toThrow(/stable SemVer/)
      for (const version of ["0.0.0", "65536.0.0"]) {
        await writeFile(manifestPath, JSON.stringify({ version }))
        await expect(readExtensionBuildVersion(root)).rejects.toThrow(/Chrome-compatible/)
      }
      expect(() => createBuildCommandPlan("build", "260824123459")).toThrow(/stable SemVer/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })`

  return `${config.projectType === "extension" ? 'import { mkdtemp, rm, writeFile } from "node:fs/promises"\nimport { tmpdir } from "node:os"\nimport path from "node:path"\n' : ""}import { describe, expect, test } from "vitest"
import {
  createBuildCommandPlan,
  ${config.projectType === "web" ? "formatBuildVersion" : "readExtensionBuildVersion"},
  parseBuildArguments,
  resolveE2eSelection
} from "../.harness/tooling/build.ts"

describe("release build orchestration", () => {
  ${versionTest}

  /** 验证当前场景的核心成功或风险边界。 */
  test("requires an E2E decision outside an interactive terminal", async () => {
    await expect(resolveE2eSelection(undefined, false)).rejects.toThrow(
      /非交互构建必须传入/
    )
    for (const selection of ["enabled", "disabled"] as const) {
      await expect(resolveE2eSelection(selection, false)).resolves.toBe(selection)
      await expect(resolveE2eSelection(selection, false)).resolves.toBe(selection)
    }
    expect(parseBuildArguments(["build", "--e2e=disabled"])).toEqual({
      e2e: "disabled",
      target: "build"
    })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("runs the full unit suite before the ${config.projectType} host build", () => {
    const commands = createBuildCommandPlan("build", "${buildVersion}")
    expect(commands.map((command) => command.command + " " + command.args.join(" "))).toEqual([
      "pnpm env:validate --profile release",
      "pnpm harness validate",
      "pnpm format:check",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      ${
        config.projectType === "web"
          ? '"pnpm exec vite build --mode production"'
          : '"pnpm exec plasmo build --target=chrome-mv3 --tag=prod --build-path=build --src-path=src --env=.env.production",\n      "pnpm exec plasmo build --target=firefox-mv2 --tag=prod --build-path=build --src-path=src --env=.env.production"'
      },
      "pnpm release:inspect"
    ])
    ${hostAssertions}
    expect(commands[${config.projectType === "web" ? 7 : 8}]?.env).toEqual({ HARNESS_BUILD_VERSION: "${buildVersion}" })
  })
})
`
}

// 执行 buildToolingFiles 函数，返回当前宿主构建器及其单元测试。
export function buildToolingFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    [".harness/tooling/build.ts", terminalBuildSource(config)],
    ["tests/build-tooling.test.ts", terminalBuildTest(config)]
  ])
}
