import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseEnv } from "node:util"
import { loadProjectConfig } from "./config.ts"
import { pathExists, isMainModule } from "./files.ts"
import { isLocalWorkspaceMember } from "./workspace-context.ts"
import type { EnvironmentBaseUrls, ProjectType } from "./types.ts"

// 保存 ENVIRONMENT_FILES 变量供当前逻辑使用。
export const ENVIRONMENT_FILES = {
  development: ".env.development",
  test: ".env.test",
  release: ".env.production"
} as const

// 保存 FORBIDDEN_ENVIRONMENT_FILES 变量供当前逻辑使用。
export const FORBIDDEN_ENVIRONMENT_FILES = [
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local"
] as const

/** 枚举应用允许使用的三种运行环境。 */
export type ApplicationEnvironment = keyof typeof ENVIRONMENT_FILES
/** 枚举结构化日志允许使用的等级。 */
export type LogLevel = "debug" | "info" | "warn" | "error"

// 定义 ApplicationConfig 接口的结构契约。
export interface ApplicationConfig {
  // 描述 environment 接口成员的结构契约。
  environment: ApplicationEnvironment
  // 描述 apiBaseUrl 接口成员的结构契约。
  apiBaseUrl: string
  // 描述 logLevel 接口成员的结构契约。
  logLevel: LogLevel
  // 描述 requestTimeoutMs 接口成员的结构契约。
  requestTimeoutMs: number
}

// 保存 LOG_LEVELS 变量供当前逻辑使用。
const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"])
// 保存 VALUE_NAMES 变量供当前逻辑使用。
const VALUE_NAMES = ["APP_ENV", "API_BASE_URL", "LOG_LEVEL", "REQUEST_TIMEOUT_MS"] as const

// 执行 publicPrefix 函数的处理逻辑。
function publicPrefix(projectType: ProjectType): "VITE_" | "PLASMO_PUBLIC_" {
  return projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
}

// 执行 validatePublicKeys 函数的处理逻辑。
function validatePublicKeys(
  values: Record<string, string | undefined>,
  prefix: "VITE_" | "PLASMO_PUBLIC_",
  source: string
): void {
  // 保存 allowed 变量供当前逻辑使用。
  const allowed = new Set(
    VALUE_NAMES.map(/* 执行 当前声明 函数的处理逻辑。 */ (name) => `${prefix}${name}`)
  )
  // 保存 unknown 变量供当前逻辑使用。
  const unknown = Object.keys(values).filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (key) => key.startsWith(prefix) && !allowed.has(key)
  )
  if (unknown.length > 0) {
    throw new Error(`${source} contains undeclared public configuration: ${unknown.join(", ")}`)
  }
}

// 执行 normalizeBaseUrl 函数的处理逻辑。
function normalizeBaseUrl(
  value: unknown,
  environment: ApplicationEnvironment,
  requireConfigured = false
): string {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) {
    if (requireConfigured) throw new Error("Release API_BASE_URL is required before release")
    return ""
  }
  if (typeof value !== "string") throw new Error("API_BASE_URL must be a string")
  // 保存 url 变量供当前逻辑使用。
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("API_BASE_URL must be an absolute http/https URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use http or https")
  }
  // 仅允许浏览器与 Server 同机时使用 HTTP；远端仍要求 HTTPS。
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  if (environment === "release" && url.protocol !== "https:" && !loopback) {
    throw new Error("Release API_BASE_URL must use https (loopback HTTP is allowed)")
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("API_BASE_URL must not contain credentials")
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("API_BASE_URL must not contain query parameters or fragments")
  }
  return url.toString().replace(/\/$/, "")
}

// 执行 validateBaseUrls 函数的处理逻辑。
export function validateBaseUrls(values: EnvironmentBaseUrls): EnvironmentBaseUrls {
  return {
    developmentBaseUrl: normalizeBaseUrl(values.developmentBaseUrl, "development"),
    testBaseUrl: normalizeBaseUrl(values.testBaseUrl, "test"),
    releaseBaseUrl: normalizeBaseUrl(values.releaseBaseUrl, "release")
  }
}

// 执行 parseApplicationConfig 函数的处理逻辑。
export function parseApplicationConfig(
  values: Record<string, string | undefined>,
  projectType: ProjectType,
  expectedEnvironment: ApplicationEnvironment,
  requireConfigured = false
): ApplicationConfig {
  // 保存 prefix 变量供当前逻辑使用。
  const prefix = publicPrefix(projectType)
  // 保存 environment 变量供当前逻辑使用。
  const environment = values[`${prefix}APP_ENV`]
  if (environment !== expectedEnvironment) {
    throw new Error(`${prefix}APP_ENV must be ${expectedEnvironment}`)
  }
  // 保存 logLevel 变量供当前逻辑使用。
  const logLevel = values[`${prefix}LOG_LEVEL`]
  if (!LOG_LEVELS.has(logLevel as LogLevel)) {
    throw new Error(`${prefix}LOG_LEVEL must be debug, info, warn, or error`)
  }
  if (expectedEnvironment === "release" && logLevel !== "warn" && logLevel !== "error") {
    throw new Error(`${prefix}LOG_LEVEL must be warn or error for release`)
  }
  // 保存 timeoutText 变量供当前逻辑使用。
  const timeoutText = values[`${prefix}REQUEST_TIMEOUT_MS`]
  if (typeof timeoutText !== "string" || !/^[1-9]\d*$/.test(timeoutText)) {
    throw new Error(`${prefix}REQUEST_TIMEOUT_MS must be a positive integer`)
  }
  // 保存 requestTimeoutMs 变量供当前逻辑使用。
  const requestTimeoutMs = Number(timeoutText)
  if (requestTimeoutMs < 1000 || requestTimeoutMs > 120000) {
    throw new Error(`${prefix}REQUEST_TIMEOUT_MS must be between 1000 and 120000`)
  }
  return Object.freeze({
    environment: expectedEnvironment,
    apiBaseUrl: normalizeBaseUrl(
      values[`${prefix}API_BASE_URL`],
      expectedEnvironment,
      requireConfigured
    ),
    logLevel: logLevel as LogLevel,
    requestTimeoutMs
  })
}

// 执行 validateEnvironmentFiles 函数的处理逻辑。
export async function validateEnvironmentFiles(
  rootInput: string,
  activeEnvironment?: ApplicationEnvironment
): Promise<Record<ApplicationEnvironment, ApplicationConfig>> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 project 变量供当前逻辑使用。
  const project = await loadProjectConfig(root)
  const local = await isLocalWorkspaceMember(root, project)
  // 保存 prefix 变量供当前逻辑使用。
  const prefix = publicPrefix(project.projectType)
  // 保存 relativePath 变量供当前逻辑使用。
  for (const relativePath of FORBIDDEN_ENVIRONMENT_FILES) {
    if (await pathExists(path.join(root, relativePath))) {
      throw new Error(
        `${relativePath} is not allowed because it can silently override the governed profiles`
      )
    }
  }
  // 保存 entries 变量供当前逻辑使用。
  const entries = await Promise.all(
    (Object.entries(ENVIRONMENT_FILES) as Array<[ApplicationEnvironment, string]>).map(
      // 执行 当前声明 函数的处理逻辑。
      async ([environment, relativePath]) => {
        // 保存 raw 变量供当前逻辑使用。
        const raw = parseEnv(await readFile(path.join(root, relativePath), "utf8"))
        validatePublicKeys(raw, prefix, relativePath)
        if (environment === activeEnvironment) {
          validatePublicKeys(process.env, prefix, "process environment")
          // 保存 name 变量供当前逻辑使用。
          for (const name of VALUE_NAMES) {
            // 保存 key 变量供当前逻辑使用。
            const key = `${prefix}${name}`
            if (process.env[key] !== undefined) raw[key] = process.env[key]
          }
        }
        const result = [
          environment,
          parseApplicationConfig(
            raw,
            project.projectType,
            environment,
            !local && environment === "release" && activeEnvironment === "release"
          )
        ] as const
        if (local && result[1].apiBaseUrl) throw new Error("纯本地项目不应配置服务地址")
        return result
      }
    )
  )
  return Object.fromEntries(entries) as Record<ApplicationEnvironment, ApplicationConfig>
}

// 执行 profileFromArgs 函数的处理逻辑。
export function profileFromArgs(args: string[]): ApplicationEnvironment | undefined {
  if (args.length === 0) return undefined
  if (args.length !== 2 || args[0] !== "--profile") {
    throw new Error("Usage: pnpm env:validate --profile development|test|release")
  }
  // 保存 profile 变量供当前逻辑使用。
  const profile = args[1]
  if (profile !== "development" && profile !== "test" && profile !== "release") {
    throw new Error("Environment profile must be development, test, or release")
  }
  return profile
}

if (isMainModule(import.meta.url)) {
  // 保存 [command, ...rest] 变量供当前逻辑使用。
  const [command, ...rest] = process.argv.slice(2)
  if (command !== "validate") {
    console.error("Usage: pnpm env:validate [--profile development|test|release]")
    process.exitCode = 1
  } else {
    validateEnvironmentFiles(process.cwd(), profileFromArgs(rest))
      .then(
        /* 执行 当前声明 函数的处理逻辑。 */ (configs) => {
          console.log(`Environment validation passed (${Object.keys(configs).join(", ")})`)
        }
      )
      .catch(
        /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error))
          process.exitCode = 1
        }
      )
  }
}
