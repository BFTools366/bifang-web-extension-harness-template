import { validateBaseUrls } from "../environment.ts"
import type { EnvironmentBaseUrls, ProjectConfig } from "../types.ts"

const ENVIRONMENT_SCHEMA = `export const APPLICATION_ENVIRONMENTS = ["development", "test", "release"] as const
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const

export type ApplicationEnvironment = (typeof APPLICATION_ENVIRONMENTS)[number]
export type LogLevel = (typeof LOG_LEVELS)[number]

export interface AppConfig {
  environment: ApplicationEnvironment
  apiBaseUrl: string
  logLevel: LogLevel
  requestTimeoutMs: number
}

export interface AppConfigInput {
  appEnv?: string
  apiBaseUrl?: string
  logLevel?: string
  requestTimeoutMs?: string
}

function normalizeBaseUrl(value: string | undefined, environment: ApplicationEnvironment): string {
  if (value === undefined || value.trim() === "") throw new Error("API_BASE_URL is required")
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

function environmentFile(
  prefix: "VITE_" | "PLASMO_PUBLIC_",
  environment: "development" | "test" | "release",
  baseUrl: string
): string {
  const logLevel =
    environment === "development" ? "debug" : environment === "test" ? "info" : "warn"
  return `# Public browser configuration. Never place secrets, tokens, cookies, or passwords here.
${prefix}APP_ENV=${environment}
${prefix}API_BASE_URL=${baseUrl}
${prefix}LOG_LEVEL=${logLevel}
${prefix}REQUEST_TIMEOUT_MS=10000
`
}

function runtimeAdapter(projectType: ProjectConfig["projectType"]): string {
  if (projectType === "web") {
    return `import { createAppConfig } from "./environment.schema"

export const IS_RELEASE_BUILD = import.meta.env.VITE_APP_ENV === "release"

export const APP_CONFIG = createAppConfig({
  appEnv: import.meta.env.VITE_APP_ENV,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  logLevel: import.meta.env.VITE_LOG_LEVEL,
  requestTimeoutMs: import.meta.env.VITE_REQUEST_TIMEOUT_MS
})
`
  }
  return `import { createAppConfig } from "./environment.schema"

export const IS_RELEASE_BUILD = process.env.PLASMO_PUBLIC_APP_ENV === "release"

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
