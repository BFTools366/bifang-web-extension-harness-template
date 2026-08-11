import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseEnv } from "node:util"
import { loadProjectConfig } from "./config.ts"
import { pathExists } from "./files.ts"
import type { EnvironmentBaseUrls, ProjectType } from "./types.ts"

export const ENVIRONMENT_FILES = {
  development: ".env.development",
  test: ".env.test",
  release: ".env.production"
} as const

export const FORBIDDEN_ENVIRONMENT_FILES = [
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local"
] as const

export type ApplicationEnvironment = keyof typeof ENVIRONMENT_FILES
export type LogLevel = "debug" | "info" | "warn" | "error"

export interface ApplicationConfig {
  environment: ApplicationEnvironment
  apiBaseUrl: string
  logLevel: LogLevel
  requestTimeoutMs: number
}

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"])
const VALUE_NAMES = ["APP_ENV", "API_BASE_URL", "LOG_LEVEL", "REQUEST_TIMEOUT_MS"] as const

function publicPrefix(projectType: ProjectType): "VITE_" | "PLASMO_PUBLIC_" {
  return projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
}

function validatePublicKeys(
  values: Record<string, string | undefined>,
  prefix: "VITE_" | "PLASMO_PUBLIC_",
  source: string
): void {
  const allowed = new Set(VALUE_NAMES.map((name) => `${prefix}${name}`))
  const unknown = Object.keys(values).filter((key) => key.startsWith(prefix) && !allowed.has(key))
  if (unknown.length > 0) {
    throw new Error(`${source} contains undeclared public configuration: ${unknown.join(", ")}`)
  }
}

function normalizeBaseUrl(value: unknown, environment: ApplicationEnvironment): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("API_BASE_URL is required")
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
  return url.toString().replace(/\/$/, "")
}

export function validateBaseUrls(values: EnvironmentBaseUrls): EnvironmentBaseUrls {
  return {
    developmentBaseUrl: normalizeBaseUrl(values.developmentBaseUrl, "development"),
    testBaseUrl: normalizeBaseUrl(values.testBaseUrl, "test"),
    releaseBaseUrl: normalizeBaseUrl(values.releaseBaseUrl, "release")
  }
}

export function parseApplicationConfig(
  values: Record<string, string | undefined>,
  projectType: ProjectType,
  expectedEnvironment: ApplicationEnvironment
): ApplicationConfig {
  const prefix = publicPrefix(projectType)
  const environment = values[`${prefix}APP_ENV`]
  if (environment !== expectedEnvironment) {
    throw new Error(`${prefix}APP_ENV must be ${expectedEnvironment}`)
  }
  const logLevel = values[`${prefix}LOG_LEVEL`]
  if (!LOG_LEVELS.has(logLevel as LogLevel)) {
    throw new Error(`${prefix}LOG_LEVEL must be debug, info, warn, or error`)
  }
  if (expectedEnvironment === "release" && logLevel !== "warn" && logLevel !== "error") {
    throw new Error(`${prefix}LOG_LEVEL must be warn or error for release`)
  }
  const timeoutText = values[`${prefix}REQUEST_TIMEOUT_MS`]
  if (typeof timeoutText !== "string" || !/^[1-9]\d*$/.test(timeoutText)) {
    throw new Error(`${prefix}REQUEST_TIMEOUT_MS must be a positive integer`)
  }
  const requestTimeoutMs = Number(timeoutText)
  if (requestTimeoutMs < 1000 || requestTimeoutMs > 120000) {
    throw new Error(`${prefix}REQUEST_TIMEOUT_MS must be between 1000 and 120000`)
  }
  return Object.freeze({
    environment: expectedEnvironment,
    apiBaseUrl: normalizeBaseUrl(values[`${prefix}API_BASE_URL`], expectedEnvironment),
    logLevel: logLevel as LogLevel,
    requestTimeoutMs
  })
}

export async function validateEnvironmentFiles(
  rootInput: string,
  activeEnvironment?: ApplicationEnvironment
): Promise<Record<ApplicationEnvironment, ApplicationConfig>> {
  const root = path.resolve(rootInput)
  const project = await loadProjectConfig(root)
  const prefix = publicPrefix(project.projectType)
  for (const relativePath of FORBIDDEN_ENVIRONMENT_FILES) {
    if (await pathExists(path.join(root, relativePath))) {
      throw new Error(
        `${relativePath} is not allowed because it can silently override the governed profiles`
      )
    }
  }
  const entries = await Promise.all(
    (Object.entries(ENVIRONMENT_FILES) as Array<[ApplicationEnvironment, string]>).map(
      async ([environment, relativePath]) => {
        const raw = parseEnv(await readFile(path.join(root, relativePath), "utf8"))
        validatePublicKeys(raw, prefix, relativePath)
        if (environment === activeEnvironment) {
          validatePublicKeys(process.env, prefix, "process environment")
          for (const name of VALUE_NAMES) {
            const key = `${prefix}${name}`
            if (process.env[key] !== undefined) raw[key] = process.env[key]
          }
        }
        return [environment, parseApplicationConfig(raw, project.projectType, environment)] as const
      }
    )
  )
  return Object.fromEntries(entries) as Record<ApplicationEnvironment, ApplicationConfig>
}

export function profileFromArgs(args: string[]): ApplicationEnvironment | undefined {
  if (args.length === 0) return undefined
  if (args.length !== 2 || args[0] !== "--profile") {
    throw new Error("Usage: pnpm env:validate --profile development|test|release")
  }
  const profile = args[1]
  if (profile !== "development" && profile !== "test" && profile !== "release") {
    throw new Error("Environment profile must be development, test, or release")
  }
  return profile
}

const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  const [command, ...rest] = process.argv.slice(2)
  if (command !== "validate") {
    console.error("Usage: pnpm env:validate [--profile development|test|release]")
    process.exitCode = 1
  } else {
    validateEnvironmentFiles(process.cwd(), profileFromArgs(rest))
      .then((configs) => {
        console.log(`Environment validation passed (${Object.keys(configs).join(", ")})`)
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
