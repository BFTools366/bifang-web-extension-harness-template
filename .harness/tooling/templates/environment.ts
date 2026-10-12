import { validateBaseUrls } from "../environment.ts"
import type { EnvironmentBaseUrls, ProjectConfig } from "../types.ts"

const ENVIRONMENT_SCHEMA = `export const APPLICATION_ENVIRONMENTS = ["development", "test", "release"] as const
/** 说明 LOG_LEVELS 的稳定结构与职责边界。 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const

/** 说明 ApplicationEnvironment 的稳定结构与职责边界。 */
export type ApplicationEnvironment = (typeof APPLICATION_ENVIRONMENTS)[number]
/** 说明 LogLevel 的稳定结构与职责边界。 */
export type LogLevel = (typeof LOG_LEVELS)[number]

/** 说明 AppConfig 的稳定结构与职责边界。 */
export interface AppConfig {
  environment: ApplicationEnvironment
  apiBaseUrl: string
  logLevel: LogLevel
  requestTimeoutMs: number
}

/** 说明 AppConfigInput 的稳定结构与职责边界。 */
export interface AppConfigInput {
  appEnv?: string
  apiBaseUrl?: string
  logLevel?: string
  requestTimeoutMs?: string
}

/** 说明 normalizeBaseUrl 的稳定结构与职责边界。 */
function normalizeBaseUrl(value: string | undefined, environment: ApplicationEnvironment): string {
  if (value === undefined || value.trim() === "") {
    if (environment === "release") throw new Error("Release API_BASE_URL is required before release")
    return ""
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("API_BASE_URL must be an absolute http/https URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use http or https")
  }
  if (environment === "release" && url.protocol !== "https:") {
    throw new Error("Release API_BASE_URL must use https")
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("API_BASE_URL must not contain credentials")
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("API_BASE_URL must not contain query parameters or fragments")
  }
  return url.toString().replace(/\\/$/, "")
}

/** 说明 createAppConfig 的稳定结构与职责边界。 */
export function createAppConfig(input: AppConfigInput): Readonly<AppConfig> {
  if (!APPLICATION_ENVIRONMENTS.includes(input.appEnv as ApplicationEnvironment)) {
    throw new Error("APP_ENV must be development, test, or release")
  }
  const environment = input.appEnv as ApplicationEnvironment
  if (!LOG_LEVELS.includes(input.logLevel as LogLevel)) {
    throw new Error("LOG_LEVEL must be debug, info, warn, or error")
  }
  if (environment === "release" && input.logLevel !== "warn" && input.logLevel !== "error") {
    throw new Error("LOG_LEVEL must be warn or error for release")
  }
  if (input.requestTimeoutMs === undefined || !/^[1-9]\\d*$/.test(input.requestTimeoutMs)) {
    throw new Error("REQUEST_TIMEOUT_MS must be a positive integer")
  }
  const requestTimeoutMs = Number(input.requestTimeoutMs)
  if (requestTimeoutMs < 1000 || requestTimeoutMs > 120000) {
    throw new Error("REQUEST_TIMEOUT_MS must be between 1000 and 120000")
  }
  return Object.freeze({
    environment,
    apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl, environment),
    logLevel: input.logLevel as LogLevel,
    requestTimeoutMs
  })
}
`

// 执行 environmentFile 函数的处理逻辑。
function environmentFile(
  prefix: "VITE_" | "PLASMO_PUBLIC_",
  environment: "development" | "test" | "release",
  baseUrl: string
): string {
  const logLevel =
    environment === "development" ? "debug" : environment === "test" ? "info" : "warn"
  return `# 浏览器公开配置；不得填写密钥、令牌、Cookie 或密码。
${prefix}APP_ENV=${environment}
${prefix}API_BASE_URL=${baseUrl}
${prefix}LOG_LEVEL=${logLevel}
${prefix}REQUEST_TIMEOUT_MS=10000
`
}

// 执行 runtimeAdapter 函数的处理逻辑。
function runtimeAdapter(projectType: ProjectConfig["projectType"]): string {
  if (projectType === "web") {
    return `import { createAppConfig } from "./environment.schema"

/** 说明 IS_RELEASE_BUILD 的稳定结构与职责边界。 */
export const IS_RELEASE_BUILD = import.meta.env.VITE_APP_ENV === "release"

/** 说明 APP_CONFIG 的稳定结构与职责边界。 */
export const APP_CONFIG = createAppConfig({
  appEnv: import.meta.env.VITE_APP_ENV,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  logLevel: import.meta.env.VITE_LOG_LEVEL,
  requestTimeoutMs: import.meta.env.VITE_REQUEST_TIMEOUT_MS
})
`
  }
  return `import { createAppConfig } from "./environment.schema"

/** 说明 IS_RELEASE_BUILD 的稳定结构与职责边界。 */
export const IS_RELEASE_BUILD = process.env.PLASMO_PUBLIC_APP_ENV === "release"

/** 说明 APP_CONFIG 的稳定结构与职责边界。 */
export const APP_CONFIG = createAppConfig({
  appEnv: process.env.PLASMO_PUBLIC_APP_ENV,
  apiBaseUrl: process.env.PLASMO_PUBLIC_API_BASE_URL,
  logLevel: process.env.PLASMO_PUBLIC_LOG_LEVEL,
  requestTimeoutMs: process.env.PLASMO_PUBLIC_REQUEST_TIMEOUT_MS
})
`
}

const ENVIRONMENT_TEST = `import { describe, expect, test } from "vitest"
import { createAppConfig } from "./environment.schema"

describe("application environment", () => {
  /** 验证开发和测试允许未配置 API，正式运行始终拒绝空地址及 HTTP。 */
  test("allows deferred APIs only outside release runtime", () => {
    for (const appEnv of ["development", "test"]) {
      expect(createAppConfig({ appEnv, apiBaseUrl: "", logLevel: "info", requestTimeoutMs: "10000" }).apiBaseUrl).toBe("")
    }
    for (const apiBaseUrl of [undefined, "", "http://api.example.com"]) {
      expect(() => createAppConfig({ appEnv: "release", apiBaseUrl, logLevel: "warn", requestTimeoutMs: "10000" })).toThrow()
    }
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("parses a complete typed configuration", () => {
    expect(
      createAppConfig({
        appEnv: "test",
        apiBaseUrl: "https://test-api.example.com/v1/",
        logLevel: "info",
        requestTimeoutMs: "10000"
      })
    ).toEqual({
      environment: "test",
      apiBaseUrl: "https://test-api.example.com/v1",
      logLevel: "info",
      requestTimeoutMs: 10000
    })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("rejects an unsafe or incomplete release configuration", () => {
    expect(() =>
      createAppConfig({
        appEnv: "release",
        apiBaseUrl: "http://api.example.com?token=unsafe",
        logLevel: "debug",
        requestTimeoutMs: "0"
      })
    ).toThrow()
  })
})
`

// 执行 environmentFiles 函数的处理逻辑。
export function environmentFiles(
  config: ProjectConfig,
  suppliedBaseUrls: EnvironmentBaseUrls
): Map<string, string> {
  const baseUrls = validateBaseUrls(suppliedBaseUrls)
  const prefix = config.projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
  return new Map([
    [".env.development", environmentFile(prefix, "development", baseUrls.developmentBaseUrl)],
    [".env.test", environmentFile(prefix, "test", baseUrls.testBaseUrl)],
    [".env.production", environmentFile(prefix, "release", baseUrls.releaseBaseUrl)],
    ["src/config/environment.schema.ts", ENVIRONMENT_SCHEMA],
    ["src/config/environment.ts", runtimeAdapter(config.projectType)],
    ["src/config/environment.test.ts", ENVIRONMENT_TEST]
  ])
}
