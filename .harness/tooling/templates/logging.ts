import type { ProjectType } from "../types.ts"

// 执行 loggerSource 函数的处理逻辑。
function loggerSource(projectType: ProjectType): string {
  // 保存 releaseBuildExpression 变量供当前逻辑使用。
  const releaseBuildExpression =
    projectType === "web"
      ? 'import.meta.env.VITE_APP_ENV === "release"'
      : 'process.env.PLASMO_PUBLIC_APP_ENV === "release"'
  return `import { APP_CONFIG } from "../config/environment"
import type { AppConfig, LogLevel } from "../config/environment.schema"

/** 说明 LogContext 的稳定结构与职责边界。 */
export type LogContext = Record<string, unknown>

/** 说明 LogEntry 的稳定结构与职责边界。 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  scope: string
  event: string
  environment: AppConfig["environment"]
  context?: LogContext
}

/** 说明 LogSink 的稳定结构与职责边界。 */
export interface LogSink {
  /** 说明当前方法的稳定职责与行为边界。 */
  write(entry: LogEntry): void
}

/** 说明 LoggerOptions 的稳定结构与职责边界。 */
interface LoggerOptions {
  config?: Readonly<AppConfig>
  sink?: LogSink
  now?: () => Date
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SENSITIVE_KEY = /authorization|token|cookie|password|secret|api[-_]?key/i
const RELEASE_ALLOWED_KEYS = new Set([
  "correlationId",
  "requestId",
  "status",
  "code",
  "durationMs",
  "reason",
  "retryable",
  "surface",
  "component",
  "url",
  "error"
])
const RELEASE_NESTED_KEYS = new Set(["name", "message", "status", "code", "reason", "retryable"])
const RELEASE_BUILD = ${releaseBuildExpression}
const MAX_DEPTH = 5
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 1000

const DEFAULT_SINK: LogSink = {
  /** 说明当前方法的稳定职责与行为边界。 */
  write(entry) {
    if (entry.level === "error") console.error(entry)
    else if (entry.level === "warn") console.warn(entry)
    else if (!RELEASE_BUILD && entry.level === "info") console.info(entry)
    else if (!RELEASE_BUILD) console.debug(entry)
  }
}

/** 说明 sanitizeString 的稳定结构与职责边界。 */
function sanitizeString(value: string, release: boolean): string {
  let sanitized = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) + "…" : value
  if (!release) return sanitized
  sanitized = sanitized
    .replace(/\\bBearer\\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\\b((?:token|secret|password|api[-_]?key)=)[^&\\s]+/gi, "$1[REDACTED]")
    .replace(/\\/(?:Users|home)\\/[^/\\s]+/g, "[LOCAL_PATH]")
    .replace(/[A-Za-z]:\\\\Users\\\\[^\\\\\\s]+/g, "[LOCAL_PATH]")
  return sanitized.replace(/https?:\\/\\/[^\\s]+/g, (candidate) => {
    try {
      const url = new URL(candidate)
      return url.origin + url.pathname
    } catch {
      return "[URL]"
    }
  })
}

/** 说明 sanitizeValue 的稳定结构与职责边界。 */
function sanitizeValue(
  value: unknown,
  release: boolean,
  seen: WeakSet<object>,
  depth: number
): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") return sanitizeString(value, release)
  if (typeof value === "bigint") return value.toString()
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined
  }
  if (depth >= MAX_DEPTH) return "[MaxDepth]"
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    const error: LogContext = {
      name: value.name,
      message: sanitizeString(value.message, release)
    }
    if (!release) {
      if (value.stack !== undefined) error.stack = sanitizeString(value.stack, false)
      if (value.cause !== undefined) error.cause = sanitizeValue(value.cause, false, seen, depth + 1)
    }
    return error
  }
  if (typeof value !== "object") return String(value)
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, release, seen, depth + 1))
  }
  const result: LogContext = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) result[key] = "[REDACTED]"
    else if (release && !RELEASE_NESTED_KEYS.has(key)) continue
    else {
      const sanitized = sanitizeValue(child, release, seen, depth + 1)
      if (sanitized !== undefined) result[key] = sanitized
    }
  }
  return result
}

/** 说明 sanitizeContext 的稳定结构与职责边界。 */
function sanitizeContext(context: LogContext | undefined, release: boolean): LogContext | undefined {
  if (context === undefined) return undefined
  const result: LogContext = {}
  const seen = new WeakSet<object>()
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = "[REDACTED]"
      continue
    }
    if (release && !RELEASE_ALLOWED_KEYS.has(key)) continue
    const sanitized = sanitizeValue(value, release, seen, 0)
    if (sanitized !== undefined) result[key] = sanitized
  }
  return Object.keys(result).length === 0 ? undefined : result
}

/** 说明 stableName 的稳定结构与职责边界。 */
function stableName(value: string, fallback: string): string {
  return /^[a-z][a-z0-9_.-]*$/.test(value) ? value : fallback
}

/** 说明 createLogger 的稳定结构与职责边界。 */
export function createLogger(scope: string, options: LoggerOptions = {}) {
  const config = options.config ?? APP_CONFIG
  const sink = options.sink ?? DEFAULT_SINK
  const now = options.now ?? (() => new Date())
  const safeScope = stableName(scope, "invalid_scope")

  /** 说明 emit 的稳定结构与职责边界。 */
  function emit(level: LogLevel, event: string, context?: LogContext): void {
    try {
      const configuredWeight = LEVEL_WEIGHT[config.logLevel] ?? LEVEL_WEIGHT.warn
      const minimumWeight =
        config.environment === "release"
          ? Math.max(configuredWeight, LEVEL_WEIGHT.warn)
          : configuredWeight
      if (LEVEL_WEIGHT[level] < minimumWeight) return
      const entry: LogEntry = {
        timestamp: now().toISOString(),
        level,
        scope: safeScope,
        event: stableName(event, "invalid_event"),
        environment: config.environment
      }
      const safeContext = sanitizeContext(context, config.environment === "release")
      if (safeContext !== undefined) entry.context = safeContext
      sink.write(entry)
    } catch {
      // Logging must not break the application path it observes.
    }
  }

  return {
    debug: (event: string, context?: LogContext) => emit("debug", event, context),
    info: (event: string, context?: LogContext) => emit("info", event, context),
    warn: (event: string, context?: LogContext) => emit("warn", event, context),
    error: (event: string, context?: LogContext) => emit("error", event, context)
  }
}
`
}

// 保存 LOGGER_TEST 变量供当前逻辑使用。
const LOGGER_TEST = `import { describe, expect, test } from "vitest"
import type { AppConfig } from "../config/environment.schema"
import { createLogger, type LogEntry } from "./logger"

/** 说明 config 的稳定结构与职责边界。 */
function config(environment: AppConfig["environment"], logLevel: AppConfig["logLevel"]): AppConfig {
  return {
    environment,
    apiBaseUrl: "https://api.example.com",
    logLevel,
    requestTimeoutMs: 10000
  }
}

describe("structured logger", () => {
  /** 验证当前场景的核心成功或风险边界。 */
  test("emits development detail safely and survives circular data", () => {
    const entries: LogEntry[] = []
    const circular: Record<string, unknown> = { value: "safe", token: "private" }
    circular.self = circular
    const logger = createLogger("bootstrap", {
      config: config("development", "debug"),
      sink: { write: (entry) => entries.push(entry) },
      now: () => new Date("2026-08-10T00:00:00.000Z")
    })

    logger.debug("application_started", { details: circular })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.context).toEqual({
      details: { value: "safe", token: "[REDACTED]", self: "[Circular]" }
    })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("suppresses low-level release logs and strips unnecessary or sensitive context", () => {
    const entries: LogEntry[] = []
    const error = new Error("failed under /Users/example/private")
    const logger = createLogger("query", {
      config: config("release", "warn"),
      sink: { write: (entry) => entries.push(entry) },
      now: () => new Date("2026-08-10T00:00:00.000Z")
    })

    logger.debug("debug_sentinel", { token: "do-not-ship" })
    logger.info("info_sentinel", { details: "do-not-ship" })
    logger.warn("request_failed", {
      requestId: "request-1",
      token: "secret",
      url: "https://api.example.com/items?token=secret#private",
      details: "release noise",
      body: { password: "secret" },
      reason: { code: "timeout", responseBody: { email: "private@example.com" } },
      error
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.context).toEqual({
      requestId: "request-1",
      token: "[REDACTED]",
      url: "https://api.example.com/items",
      reason: { code: "timeout" },
      error: { name: "Error", message: "failed under [LOCAL_PATH]/private" }
    })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("never lets hostile context, clocks, or sinks break the observed path", () => {
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    const logger = createLogger("Invalid Scope", {
      config: config("development", "debug"),
      sink: { write: () => { throw new Error("sink failed") } },
      now: () => new Date(Number.NaN)
    })

    expect(() => logger.error("Invalid Event", { error: revoked.proxy })).not.toThrow()
  })
})
`

// 保存 ERROR_BOUNDARY_SOURCE 变量供当前逻辑使用。
const ERROR_BOUNDARY_SOURCE = `import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { createLogger } from "./logger"

/** 说明 AppErrorBoundaryProps 的稳定结构与职责边界。 */
interface AppErrorBoundaryProps {
  children: ReactNode
}

/** 说明 LoggedErrorBoundaryProps 的稳定结构与职责边界。 */
interface LoggedErrorBoundaryProps extends AppErrorBoundaryProps {
  fallback: ReactNode
}

/** 说明 AppErrorBoundaryState 的稳定结构与职责边界。 */
interface AppErrorBoundaryState {
  failed: boolean
}

const logger = createLogger("render")

/** 说明 LoggedErrorBoundary 的稳定结构与职责边界。 */
class LoggedErrorBoundary extends Component<
  LoggedErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  /** 说明当前方法的稳定职责与行为边界。 */
  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  /** 说明当前方法的稳定职责与行为边界。 */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("render_failed", { component: "react", error, details: info.componentStack })
  }

  /** 说明当前方法的稳定职责与行为边界。 */
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** 说明 AppErrorBoundary 的稳定结构与职责边界。 */
export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  const { t } = useTranslation()
  return (
    <LoggedErrorBoundary fallback={<div role="alert">{t("unexpectedError")}</div>}>
      {children}
    </LoggedErrorBoundary>
  )
}
`

// 保存 ERROR_BOUNDARY_TEST 变量供当前逻辑使用。
const ERROR_BOUNDARY_TEST = `// @vitest-environment jsdom
import "../i18n"
import { render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { AppErrorBoundary } from "./AppErrorBoundary"

afterEach(() => vi.restoreAllMocks())

/** 验证当前场景的核心成功或风险边界。 */
test("contains render failures without rethrowing into the host surface", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  /** 说明 Broken 的稳定结构与职责边界。 */
  function Broken(): never {
    throw new Error("render failed")
  }

  expect(() =>
    /** 说明当前方法的稳定职责与行为边界。 */
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>
    )
  ).not.toThrow()
  expect(screen.getByRole("alert")).toBeInTheDocument()
})
`

// 执行 loggingFiles 函数的处理逻辑。
export function loggingFiles(projectType: ProjectType = "web"): Map<string, string> {
  return new Map([
    ["src/observability/logger.ts", loggerSource(projectType)],
    ["src/observability/logger.test.ts", LOGGER_TEST],
    ["src/observability/AppErrorBoundary.tsx", ERROR_BOUNDARY_SOURCE],
    ["src/observability/AppErrorBoundary.test.tsx", ERROR_BOUNDARY_TEST]
  ])
}
