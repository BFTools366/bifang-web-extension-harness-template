import type { ProjectConfig } from "../types.ts"

function languageSource(): string {
  return `import { BRAND } from "../brand"

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = BRAND.id + ":language:v1"

export interface LanguageRuntime {
  readonly language?: string
  readonly resolvedLanguage?: string
  changeLanguage(language: SupportedLanguage): Promise<unknown>
  on(event: "languageChanged", listener: (language: string) => void): unknown
  off(event: "languageChanged", listener: (language: string) => void): unknown
}

export interface LanguageStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LanguageControllerOptions {
  runtime: LanguageRuntime
  storage?: LanguageStorage
  storageKey?: string
  navigatorLanguage?: string
}

export interface LanguageController {
  ready(): Promise<void>
  getRequestLanguage(): SupportedLanguage
  changeLanguage(language: string): Promise<void>
  dispose(): void
}

function recognizedLanguage(value: unknown): SupportedLanguage | undefined {
  if (typeof value !== "string") return undefined
  const primary = value.trim().toLowerCase().split(/[-_]/, 1)[0]
  return primary === "en" || primary === "zh" ? primary : undefined
}

export function normalizeLanguage(value: unknown): SupportedLanguage {
  return recognizedLanguage(value) ?? "en"
}

function browserStorage(): LanguageStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage
  } catch {
    return undefined
  }
}

function readStoredLanguage(storage: LanguageStorage | undefined, key: string): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function storeLanguage(
  storage: LanguageStorage | undefined,
  key: string,
  language: SupportedLanguage
): void {
  try {
    storage?.setItem(key, language)
  } catch {
    // Language persistence is optional and must not block application startup.
  }
}

export function createLanguageController(options: LanguageControllerOptions): LanguageController {
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY
  const storedLanguage = readStoredLanguage(options.storage, storageKey)
  let currentLanguage =
    recognizedLanguage(storedLanguage) ??
    normalizeLanguage(
      options.navigatorLanguage ?? options.runtime.resolvedLanguage ?? options.runtime.language
    )

  const handleLanguageChanged = (language: string) => {
    currentLanguage = normalizeLanguage(language)
    storeLanguage(options.storage, storageKey, currentLanguage)
  }
  options.runtime.on("languageChanged", handleLanguageChanged)

  const ready = options.runtime
    .changeLanguage(currentLanguage)
    .then(() => storeLanguage(options.storage, storageKey, currentLanguage))
    .catch(() => {
      currentLanguage = normalizeLanguage(
        options.runtime.resolvedLanguage ?? options.runtime.language ?? options.navigatorLanguage
      )
    })

  return {
    ready: () => ready,
    getRequestLanguage: () => currentLanguage,
    async changeLanguage(language: string): Promise<void> {
      const normalized = normalizeLanguage(language)
      await options.runtime.changeLanguage(normalized)
      currentLanguage = normalized
      storeLanguage(options.storage, storageKey, normalized)
    },
    dispose(): void {
      options.runtime.off("languageChanged", handleLanguageChanged)
    }
  }
}

let defaultController: LanguageController | undefined

export interface InitialLanguageOptions {
  storage?: LanguageStorage
  storageKey?: string
  navigatorLanguage?: string
}

export function initialApplicationLanguage(options: InitialLanguageOptions = {}): SupportedLanguage {
  const storage = options.storage ?? browserStorage()
  const storageKey = options.storageKey ?? LANGUAGE_STORAGE_KEY
  const navigatorLanguage =
    options.navigatorLanguage ?? (typeof navigator === "undefined" ? "en" : navigator.language)
  return recognizedLanguage(readStoredLanguage(storage, storageKey)) ?? normalizeLanguage(navigatorLanguage)
}

export function initializeLanguage(runtime: LanguageRuntime): void {
  if (defaultController !== undefined) return
  defaultController = createLanguageController({
    runtime,
    storage: browserStorage(),
    navigatorLanguage: initialApplicationLanguage()
  })
  void defaultController.ready()
}

export function getRequestLanguage(): SupportedLanguage {
  return defaultController?.getRequestLanguage() ?? initialApplicationLanguage()
}

export async function changeApplicationLanguage(language: string): Promise<void> {
  if (defaultController === undefined) {
    throw new Error("Language runtime is not initialized")
  }
  await defaultController.changeLanguage(language)
}
`
}

function languageTest(config: ProjectConfig): string {
  const expectedStorageKey = JSON.stringify(`${config.id}:language:v1`)
  return `// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import {
  LANGUAGE_STORAGE_KEY,
  createLanguageController,
  initialApplicationLanguage,
  normalizeLanguage,
  type LanguageRuntime,
  type LanguageStorage
} from "./language"

function controlledRuntime(initialLanguage: string) {
  let language = initialLanguage
  const listeners = new Set<(language: string) => void>()
  const runtime: LanguageRuntime = {
    get language() {
      return language
    },
    get resolvedLanguage() {
      return language
    },
    async changeLanguage(nextLanguage) {
      language = nextLanguage
      for (const listener of listeners) listener(nextLanguage)
    },
    on(_event, listener) {
      listeners.add(listener)
    },
    off(_event, listener) {
      listeners.delete(listener)
    }
  }
  return {
    runtime,
    emit(nextLanguage: string) {
      language = nextLanguage
      for (const listener of listeners) listener(nextLanguage)
    }
  }
}

describe("application language", () => {
  test("normalizes supported language variants and falls back to English", () => {
    expect(LANGUAGE_STORAGE_KEY).toBe(${expectedStorageKey})
    expect(normalizeLanguage("zh-CN")).toBe("zh")
    expect(normalizeLanguage("EN_us")).toBe("en")
    expect(normalizeLanguage("fr-FR")).toBe("en")
    expect(normalizeLanguage(undefined)).toBe("en")
    expect(
      initialApplicationLanguage({
        storage: { getItem: () => "fr-FR", setItem: vi.fn() },
        storageKey: "example:language",
        navigatorLanguage: "zh-CN"
      })
    ).toBe("zh")
  })

  test("persists a project-scoped preference and reads language dynamically", async () => {
    const values = new Map<string, string>([["example:language", "zh-CN"]])
    const storage: LanguageStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
    const controlled = controlledRuntime("en")
    const controller = createLanguageController({
      runtime: controlled.runtime,
      storage,
      storageKey: "example:language",
      navigatorLanguage: "en-US"
    })

    await controller.ready()
    expect(controller.getRequestLanguage()).toBe("zh")
    expect(values.get("example:language")).toBe("zh")

    controlled.emit("en-GB")
    expect(controller.getRequestLanguage()).toBe("en")
    expect(values.get("example:language")).toBe("en")

    await controller.changeLanguage("zh-TW")
    expect(controller.getRequestLanguage()).toBe("zh")
    controller.dispose()
  })

  test("survives unavailable browser storage", async () => {
    const storage: LanguageStorage = {
      getItem: () => {
        throw new Error("storage denied")
      },
      setItem: vi.fn(() => {
        throw new Error("storage denied")
      })
    }
    const controlled = controlledRuntime("zh-CN")
    expect(
      initialApplicationLanguage({ storage, storageKey: "denied:language", navigatorLanguage: "zh-CN" })
    ).toBe("zh")
    const controller = createLanguageController({
      runtime: controlled.runtime,
      storage,
      navigatorLanguage: "en-US"
    })

    await expect(controller.ready()).resolves.toBeUndefined()
    expect(controller.getRequestLanguage()).toBe("en")
    await expect(controller.changeLanguage("en-US")).resolves.toBeUndefined()
    expect(controller.getRequestLanguage()).toBe("en")
  })
})
`
}

const HTTP_CLIENT_SOURCE = `import { APP_CONFIG } from "../../config/environment"
import type { AppConfig } from "../../config/environment.schema"
import { getRequestLanguage, normalizeLanguage } from "../../i18n/language"
import { createLogger } from "../../observability/logger"

export const HTTP_HEADERS = {
  continuation: "X-Http-Request",
  language: "X-Lang",
  authToken: "X-AUTH-TOKEN"
} as const

export type ApiErrorKind =
  | "aborted"
  | "http"
  | "invalid-response"
  | "network"
  | "timeout"
  | "unauthorized-handler"

export interface ApiErrorOptions {
  kind: ApiErrorKind
  code: string
  message: string
  retryable: boolean
  status?: number
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly code: string
  readonly retryable: boolean
  readonly status: number | undefined

  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.kind = options.kind
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
  }
}

export interface UnauthorizedHandler {
  handleUnauthorized(error: ApiError): void | Promise<void>
}

export interface LoginRedirectOptions {
  loginUrl: string
  navigate(url: string): void | Promise<void>
}

export type CredentialExtractor = (response: Response) =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface HttpLogger {
  warn(event: string, context?: Record<string, unknown>): void
  error(event: string, context?: Record<string, unknown>): void
}

export interface HttpClientOptions {
  unauthorizedHandler: UnauthorizedHandler
  config?: Pick<Readonly<AppConfig>, "apiBaseUrl" | "requestTimeoutMs">
  fetch?: FetchLike
  getLanguage?: () => string
  extractAuthToken?: CredentialExtractor
  logger?: HttpLogger
  now?: () => number
}

export interface HttpClient {
  request(relativeUrl: string, init?: RequestInit): Promise<Response>
  clearSession(): void
}

interface RequestSnapshot {
  sequence: number
  authRevision: number
  authToken: string | undefined
}

const URL_SCHEME = /^[a-z][a-z\\d+.-]*:/i
const MAX_CONTINUATION_LENGTH = 512
const MAX_AUTH_TOKEN_LENGTH = 8192

function apiError(options: ApiErrorOptions): ApiError {
  return new ApiError(options)
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true
  }
  return false
}

function safeRelativeLoginUrl(value: string): string {
  const loginUrl = value.trim()
  if (
    loginUrl === "" ||
    !loginUrl.startsWith("/") ||
    loginUrl.startsWith("//") ||
    loginUrl.includes("\\\\") ||
    URL_SCHEME.test(loginUrl)
  ) {
    throw apiError({
      kind: "http",
      code: "invalid_login_url",
      message: "The login URL must be an internal relative URL.",
      retryable: false
    })
  }
  const parsed = new URL(loginUrl, "https://application.invalid")
  if (parsed.origin !== "https://application.invalid") {
    throw apiError({
      kind: "http",
      code: "invalid_login_url",
      message: "The login URL must be an internal relative URL.",
      retryable: false
    })
  }
  return parsed.pathname + parsed.search + parsed.hash
}

export function createLoginUnauthorizedHandler(options: LoginRedirectOptions): UnauthorizedHandler {
  const loginUrl = safeRelativeLoginUrl(options.loginUrl)
  return {
    handleUnauthorized: () => options.navigate(loginUrl)
  }
}

function controlledApiBaseUrl(value: string): URL {
  try {
    const baseUrl = new URL(value.endsWith("/") ? value : value + "/")
    if (
      (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
      baseUrl.username !== "" ||
      baseUrl.password !== "" ||
      baseUrl.search !== "" ||
      baseUrl.hash !== ""
    ) {
      throw new TypeError("Invalid API base URL boundary")
    }
    return baseUrl
  } catch (cause) {
    throw apiError({
      kind: "http",
      code: "invalid_api_base_url",
      message: "The configured API base URL is invalid.",
      retryable: false,
      cause
    })
  }
}

function controlledRequestTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 120000) {
    throw apiError({
      kind: "http",
      code: "invalid_request_timeout",
      message: "The configured request timeout is invalid.",
      retryable: false
    })
  }
  return value
}

function resolveApiUrl(relativeUrl: string, baseUrl: URL): URL {
  const value = relativeUrl.trim()
  if (
    value === "" ||
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    value.includes("\\\\") ||
    URL_SCHEME.test(value)
  ) {
    throw apiError({
      kind: "http",
      code: "invalid_relative_url",
      message: "API requests require a non-empty relative URL.",
      retryable: false
    })
  }
  const resolved = new URL(value, baseUrl)
  if (
    resolved.origin !== baseUrl.origin ||
    !resolved.pathname.startsWith(baseUrl.pathname) ||
    resolved.hash !== ""
  ) {
    throw apiError({
      kind: "http",
      code: "invalid_relative_url",
      message: "The API URL escapes the configured service boundary.",
      retryable: false
    })
  }
  return resolved
}

function trustedResponse(response: Response, requestUrl: URL, baseUrl: URL): boolean {
  if (response.redirected || response.type === "opaque" || response.type === "opaqueredirect") {
    return false
  }
  if (response.url === "") return false
  try {
    const responseUrl = new URL(response.url)
    return (
      responseUrl.origin === requestUrl.origin &&
      responseUrl.origin === baseUrl.origin &&
      responseUrl.pathname.startsWith(baseUrl.pathname)
    )
  } catch {
    return false
  }
}

function opaqueHeader(
  value: string | null | undefined,
  maximumLength: number,
  code: string
): string | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined
  const normalized = value.trim()
  if (normalized.length > maximumLength || hasControlCharacter(normalized)) {
    throw apiError({
      kind: "invalid-response",
      code,
      message: "The API returned an invalid session header.",
      retryable: false
    })
  }
  return normalized
}

function responseError(response: Response): ApiError {
  if (response.status === 401) {
    return apiError({
      kind: "http",
      code: "authentication_required",
      message: "Authentication is required.",
      retryable: false,
      status: 401
    })
  }
  return apiError({
    kind: "http",
    code: "http_" + response.status,
    message: "The API request failed.",
    retryable: response.status === 429 || response.status >= 500,
    status: response.status
  })
}

function normalizeFailure(cause: unknown, timedOut: boolean, callerAborted: boolean): ApiError {
  if (cause instanceof ApiError) return cause
  if (timedOut) {
    return apiError({
      kind: "timeout",
      code: "request_timeout",
      message: "The API request timed out.",
      retryable: true,
      cause
    })
  }
  if (callerAborted) {
    return apiError({
      kind: "aborted",
      code: "request_aborted",
      message: "The API request was cancelled.",
      retryable: false,
      cause
    })
  }
  return apiError({
    kind: "network",
    code: "network_error",
    message: "The API request could not be completed.",
    retryable: true,
    cause
  })
}

function defaultCredentialExtractor(response: Response): string | null {
  return response.headers.get(HTTP_HEADERS.authToken)
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const config = options.config ?? APP_CONFIG
  const baseUrl = controlledApiBaseUrl(config.apiBaseUrl)
  const requestTimeoutMs = controlledRequestTimeout(config.requestTimeoutMs)
  const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis)
  const language = options.getLanguage ?? getRequestLanguage
  const extractAuthToken = options.extractAuthToken ?? defaultCredentialExtractor
  const logger = options.logger ?? createLogger("http")
  const now = options.now ?? Date.now

  let nextSequence = 0
  let continuation: string | undefined
  let continuationSequence = 0
  let authToken: string | undefined
  let authSequence = 0
  let authRevision = 0
  let unauthorizedLatched = false
  let unauthorizedFlight: Promise<void> | undefined

  function reportFailure(error: ApiError, startedAt: number): void {
    if (error.kind === "aborted" || error.status === 401) return
    logger.error("http.request_failed", {
      status: error.status,
      code: error.code,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      reason: error.kind,
      retryable: error.retryable
    })
  }

  async function reportUnauthorized(error: ApiError): Promise<void> {
    if (unauthorizedLatched) {
      await unauthorizedFlight
      return
    }
    unauthorizedLatched = true
    if (unauthorizedFlight !== undefined) {
      await unauthorizedFlight
      return
    }
    logger.warn("http.unauthorized", {
      status: 401,
      code: error.code,
      reason: error.kind,
      retryable: false
    })
    const flight = Promise.resolve()
      .then(() => options.unauthorizedHandler.handleUnauthorized(error))
      .catch((cause: unknown) => {
        const handlerError = apiError({
          kind: "unauthorized-handler",
          code: "unauthorized_handler_failed",
          message: "The unauthorized handler could not complete.",
          retryable: false,
          status: 401,
          cause
        })
        logger.error("http.unauthorized_handler_failed", {
          status: 401,
          code: handlerError.code,
          reason: handlerError.kind,
          retryable: handlerError.retryable
        })
      })
      .then(() => undefined)
    unauthorizedFlight = flight
    await flight
    if (unauthorizedFlight === flight) unauthorizedFlight = undefined
  }

  function clearSession(): void {
    continuation = undefined
    authToken = undefined
    authRevision += 1
    const nextAllowedSequence = nextSequence + 1
    continuationSequence = nextAllowedSequence
    authSequence = nextAllowedSequence
  }

  async function request(relativeUrl: string, init: RequestInit = {}): Promise<Response> {
    const startedAt = now()
    let requestUrl: URL
    try {
      requestUrl = resolveApiUrl(relativeUrl, baseUrl)
    } catch (cause) {
      const error = normalizeFailure(cause, false, false)
      reportFailure(error, startedAt)
      throw error
    }

    const callerSignal = init.signal ?? undefined
    if (callerSignal?.aborted) {
      throw normalizeFailure(callerSignal.reason, false, true)
    }

    const sequence = (nextSequence += 1)
    const snapshot: RequestSnapshot = { sequence, authRevision, authToken }
    const headers = new Headers(init.headers)
    headers.delete(HTTP_HEADERS.continuation)
    headers.delete(HTTP_HEADERS.language)
    headers.delete(HTTP_HEADERS.authToken)
    let requestLanguage = "en"
    try {
      requestLanguage = normalizeLanguage(language())
    } catch {
      // A failed user preference adapter must not break an otherwise valid request.
    }
    headers.set(HTTP_HEADERS.language, requestLanguage)
    if (continuation !== undefined) headers.set(HTTP_HEADERS.continuation, continuation)
    if (authToken !== undefined) headers.set(HTTP_HEADERS.authToken, authToken)

    const controller = new AbortController()
    let timedOut = false
    const handleCallerAbort = () => controller.abort(callerSignal?.reason)
    callerSignal?.addEventListener("abort", handleCallerAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, requestTimeoutMs)

    try {
      const response = await fetchRequest(requestUrl, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: "error"
      })
      if (timedOut) throw normalizeFailure(undefined, true, false)
      if (!trustedResponse(response, requestUrl, baseUrl)) {
        throw apiError({
          kind: "invalid-response",
          code: "untrusted_response_url",
          message: "The API response crossed the configured service boundary.",
          retryable: false
        })
      }

      if (!response.ok) {
        const error = responseError(response)
        if (error.status === 401) {
          // 迟到的旧 401 不能清除或重定向一个已经更新的认证会话。
          if (authRevision === snapshot.authRevision && authToken === snapshot.authToken) {
            authToken = undefined
            continuation = undefined
            authSequence = Math.max(authSequence, sequence)
            continuationSequence = Math.max(continuationSequence, sequence)
            authRevision += 1
            await reportUnauthorized(error)
          }
        }
        throw error
      }

      let extractedToken: string | undefined
      let extractedContinuation: string | undefined
      try {
        extractedContinuation = opaqueHeader(
          response.headers.get(HTTP_HEADERS.continuation),
          MAX_CONTINUATION_LENGTH,
          "invalid_continuation_header"
        )
        extractedToken = opaqueHeader(
          await extractAuthToken(response.clone()),
          MAX_AUTH_TOKEN_LENGTH,
          "invalid_auth_token_header"
        )
      } catch (cause) {
        if (cause instanceof ApiError) throw cause
        throw apiError({
          kind: "invalid-response",
          code: "credential_extraction_failed",
          message: "The API credential response could not be processed.",
          retryable: false,
          cause
        })
      }

      // 请求序号决定并发响应的客户端顺序，旧响应不能覆盖后发请求已接受的状态。
      if (extractedContinuation !== undefined && sequence >= continuationSequence) {
        continuation = extractedContinuation
        continuationSequence = sequence
      }
      if (extractedToken !== undefined && sequence >= authSequence) {
        authToken = extractedToken
        authSequence = sequence
        authRevision += 1
        unauthorizedLatched = false
        unauthorizedFlight = undefined
      }
      return response
    } catch (cause) {
      const error = normalizeFailure(cause, timedOut, callerSignal?.aborted === true)
      reportFailure(error, startedAt)
      throw error
    } finally {
      clearTimeout(timeout)
      callerSignal?.removeEventListener("abort", handleCallerAbort)
    }
  }

  return { request, clearSession }
}
`

const HTTP_CLIENT_TEST = `import { afterEach, describe, expect, test, vi } from "vitest"
import {
  ApiError,
  HTTP_HEADERS,
  createHttpClient,
  createLoginUnauthorizedHandler,
  type FetchLike
} from "./httpClient"

const CONFIG = {
  apiBaseUrl: "https://api.example.com/v1",
  requestTimeoutMs: 1000
} as const

function apiResponse(
  status: number,
  options: { body?: string; headers?: HeadersInit; url?: string; redirected?: boolean } = {}
): Response {
  const response = new Response(options.body, { status, headers: options.headers })
  Object.defineProperty(response, "url", {
    configurable: true,
    value: options.url ?? "https://api.example.com/v1/items"
  })
  if (options.redirected === true) {
    Object.defineProperty(response, "redirected", { configurable: true, value: true })
  }
  return response
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error("Deferred promise is unavailable")
      resolvePromise(value)
    }
  }
}

function memoryLogger() {
  const entries: Array<{ level: "warn" | "error"; event: string; context?: Record<string, unknown> }> = []
  return {
    entries,
    logger: {
      warn: (event: string, context?: Record<string, unknown>) =>
        entries.push({ level: "warn", event, context }),
      error: (event: string, context?: Record<string, unknown>) =>
        entries.push({ level: "error", event, context })
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("HTTP client", () => {
  test("sends dynamic language and carries only trusted successful response state", async () => {
    let language = "zh-CN"
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        apiResponse(200, {
          headers: {
            [HTTP_HEADERS.continuation]: "continuation-1",
            [HTTP_HEADERS.authToken]: "token-1"
          }
        })
      )
      .mockResolvedValueOnce(apiResponse(200))
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      getLanguage: () => language,
      unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })

    await client.request("bootstrap")
    language = "en-US"
    await client.request("items?limit=10", {
      headers: {
        [HTTP_HEADERS.continuation]: "caller-value",
        [HTTP_HEADERS.authToken]: "caller-token"
      }
    })

    const firstHeaders = new Headers(fetchRequest.mock.calls[0]?.[1]?.headers)
    expect(firstHeaders.get(HTTP_HEADERS.language)).toBe("zh")
    expect(firstHeaders.has(HTTP_HEADERS.continuation)).toBe(false)
    expect(firstHeaders.has(HTTP_HEADERS.authToken)).toBe(false)

    const secondHeaders = new Headers(fetchRequest.mock.calls[1]?.[1]?.headers)
    expect(secondHeaders.get(HTTP_HEADERS.language)).toBe("en")
    expect(secondHeaders.get(HTTP_HEADERS.continuation)).toBe("continuation-1")
    expect(secondHeaders.get(HTTP_HEADERS.authToken)).toBe("token-1")
    expect(fetchRequest.mock.calls[1]?.[0].toString()).toBe(
      "https://api.example.com/v1/items?limit=10"
    )
  })

  test("supports an asynchronous credential extractor without consuming the caller response", async () => {
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(apiResponse(200, { body: JSON.stringify({ token: "custom-token" }) }))
      .mockResolvedValueOnce(apiResponse(200))
    const extractor = vi.fn(async (response: Response) => {
      const text = await response.text()
      if (text === "") return undefined
      const body = JSON.parse(text) as { token?: unknown }
      return typeof body.token === "string" ? body.token : undefined
    })
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      extractAuthToken: extractor,
      unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })

    const response = await client.request("login")
    expect(await response.json()).toEqual({ token: "custom-token" })
    await client.request("profile")

    const headers = new Headers(fetchRequest.mock.calls[1]?.[1]?.headers)
    expect(headers.get(HTTP_HEADERS.authToken)).toBe("custom-token")
    expect(extractor).toHaveBeenCalledTimes(2)
  })

  test("rejects a control character returned by a custom credential extractor", async () => {
    const log = memoryLogger()
    const client = createHttpClient({
      config: CONFIG,
      fetch: vi.fn<FetchLike>().mockResolvedValue(apiResponse(200)),
      extractAuthToken: () => "bad\\u0000token",
      logger: log.logger,
      unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })

    await expect(client.request("invalid-token")).rejects.toMatchObject({
      kind: "invalid-response",
      code: "invalid_auth_token_header"
    })
    expect(JSON.stringify(log.entries)).not.toContain("bad")
  })

  test("rejects stale state and a late 401 cannot clear or redirect a newer token", async () => {
    const oldSuccess = deferred<Response>()
    const newSuccess = deferred<Response>()
    const oldUnauthorized = deferred<Response>()
    const rotatedSuccess = deferred<Response>()
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        apiResponse(200, { headers: { [HTTP_HEADERS.authToken]: "token-a" } })
      )
      .mockImplementationOnce(() => oldSuccess.promise)
      .mockImplementationOnce(() => newSuccess.promise)
      .mockResolvedValueOnce(apiResponse(200))
      .mockImplementationOnce(() => oldUnauthorized.promise)
      .mockImplementationOnce(() => rotatedSuccess.promise)
      .mockResolvedValueOnce(apiResponse(200))
    const onUnauthorized = vi.fn()
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      unauthorizedHandler: { handleUnauthorized: onUnauthorized }
    })

    await client.request("login")
    const oldSuccessRequest = client.request("old-success")
    const newSuccessRequest = client.request("new-success")
    newSuccess.resolve(
      apiResponse(200, {
        headers: {
          [HTTP_HEADERS.continuation]: "continuation-new",
          [HTTP_HEADERS.authToken]: "token-b"
        }
      })
    )
    await newSuccessRequest
    oldSuccess.resolve(
      apiResponse(200, {
        headers: {
          [HTTP_HEADERS.continuation]: "continuation-old",
          [HTTP_HEADERS.authToken]: "token-old"
        }
      })
    )
    await oldSuccessRequest

    await client.request("after-order-race")
    const headers = new Headers(fetchRequest.mock.calls[3]?.[1]?.headers)
    expect(headers.get(HTTP_HEADERS.authToken)).toBe("token-b")
    expect(headers.get(HTTP_HEADERS.continuation)).toBe("continuation-new")

    const oldUnauthorizedRequest = client.request("old-unauthorized")
    const rotatedRequest = client.request("rotate")
    rotatedSuccess.resolve(
      apiResponse(200, {
        headers: {
          [HTTP_HEADERS.continuation]: "continuation-rotated",
          [HTTP_HEADERS.authToken]: "token-c"
        }
      })
    )
    await rotatedRequest
    oldUnauthorized.resolve(apiResponse(401))
    await expect(oldUnauthorizedRequest).rejects.toMatchObject({ code: "authentication_required" })
    expect(onUnauthorized).not.toHaveBeenCalled()

    await client.request("after-401-race")
    const finalHeaders = new Headers(fetchRequest.mock.calls[6]?.[1]?.headers)
    expect(finalHeaders.get(HTTP_HEADERS.authToken)).toBe("token-c")
    expect(finalHeaders.get(HTTP_HEADERS.continuation)).toBe("continuation-rotated")
  })

  test("coalesces current 401 handling and logs no credential or response data", async () => {
    const handlerFlight = deferred<void>()
    const onUnauthorized = vi.fn(() => handlerFlight.promise)
    const log = memoryLogger()
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(apiResponse(401, { body: "secret response body" }))
      .mockResolvedValueOnce(apiResponse(401, { headers: { [HTTP_HEADERS.authToken]: "secret" } }))
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      logger: log.logger,
      unauthorizedHandler: { handleUnauthorized: onUnauthorized }
    })

    const first = client.request("one")
    const second = client.request("two")
    const resultsPromise = Promise.allSettled([first, second])
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
    handlerFlight.resolve()
    const results = await resultsPromise

    expect(results.every((result) => result.status === "rejected")).toBe(true)
    expect(log.entries.filter((entry) => entry.event === "http.unauthorized")).toHaveLength(1)
    expect(JSON.stringify(log.entries)).not.toContain("secret")
    expect(JSON.stringify(log.entries)).not.toContain("X-AUTH-TOKEN")
  })

  test("keeps the unauthorized latch after handler failure and resets it after a new token", async () => {
    const onUnauthorized = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret handler detail"))
      .mockResolvedValueOnce(undefined)
    const log = memoryLogger()
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(apiResponse(401))
      .mockResolvedValueOnce(apiResponse(401))
      .mockResolvedValueOnce(
        apiResponse(200, { headers: { [HTTP_HEADERS.authToken]: "new-token" } })
      )
      .mockResolvedValueOnce(apiResponse(401))
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      logger: log.logger,
      unauthorizedHandler: { handleUnauthorized: onUnauthorized }
    })

    await expect(client.request("first-unauthorized")).rejects.toMatchObject({
      code: "authentication_required",
      status: 401
    })
    await expect(client.request("latched-unauthorized")).rejects.toMatchObject({
      code: "authentication_required"
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    await client.request("new-session")
    await expect(client.request("new-session-unauthorized")).rejects.toMatchObject({
      code: "authentication_required"
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(2)
    expect(log.entries.filter((entry) => entry.event === "http.unauthorized_handler_failed")).toHaveLength(1)
    expect(JSON.stringify(log.entries)).not.toContain("secret handler detail")
  })

  test("a new token detaches an older unauthorized flight from the new session", async () => {
    const oldHandlerFlight = deferred<void>()
    const newHandlerFlight = deferred<void>()
    const onUnauthorized = vi
      .fn()
      .mockImplementationOnce(() => oldHandlerFlight.promise)
      .mockImplementationOnce(() => newHandlerFlight.promise)
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(apiResponse(401))
      .mockResolvedValueOnce(
        apiResponse(200, { headers: { [HTTP_HEADERS.authToken]: "new-session-token" } })
      )
      .mockResolvedValueOnce(apiResponse(401))
    const client = createHttpClient({
      config: CONFIG,
      fetch: fetchRequest,
      unauthorizedHandler: { handleUnauthorized: onUnauthorized }
    })

    const oldRequest = client.request("old-session")
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    await client.request("establish-new-session")

    const newRequest = client.request("new-session")
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(2))
    newHandlerFlight.resolve()
    await expect(newRequest).rejects.toMatchObject({ code: "authentication_required" })

    oldHandlerFlight.resolve()
    await expect(oldRequest).rejects.toMatchObject({ code: "authentication_required" })
    expect(onUnauthorized).toHaveBeenCalledTimes(2)
  })

  test("rejects arbitrary URLs, redirects, caller aborts, and timeouts as ApiError", async () => {
    const navigate = vi.fn()
    const loginHandler = createLoginUnauthorizedHandler({ loginUrl: "/login", navigate })
    await loginHandler.handleUnauthorized(
      new ApiError({
        kind: "http",
        code: "authentication_required",
        message: "Authentication is required.",
        retryable: false,
        status: 401
      })
    )
    expect(navigate).toHaveBeenCalledWith("/login")
    expect(() =>
      createLoginUnauthorizedHandler({ loginUrl: "https://evil.example/login", navigate })
    ).toThrow(/internal relative URL/)
    for (const apiBaseUrl of [
      "ftp://api.example.com/v1",
      "https://user:password@api.example.com/v1",
      "https://api.example.com/v1?tenant=unsafe",
      "https://api.example.com/v1#unsafe"
    ]) {
      expect(() =>
        createHttpClient({
          config: { ...CONFIG, apiBaseUrl },
          fetch: vi.fn<FetchLike>(),
          unauthorizedHandler: loginHandler
        })
      ).toThrow(/configured API base URL is invalid/)
    }
    for (const requestTimeoutMs of [0, 999, 120001, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createHttpClient({
          config: { ...CONFIG, requestTimeoutMs },
          fetch: vi.fn<FetchLike>(),
          unauthorizedHandler: loginHandler
        })
      ).toThrow(/configured request timeout is invalid/)
    }

    const redirectedClient = createHttpClient({
      config: CONFIG,
      fetch: vi.fn<FetchLike>().mockResolvedValue(apiResponse(200, { redirected: true })),
      unauthorizedHandler: loginHandler
    })
    await expect(redirectedClient.request("https://evil.example/items")).rejects.toMatchObject({
      code: "invalid_relative_url"
    })
    await expect(redirectedClient.request("redirected")).rejects.toMatchObject({
      code: "untrusted_response_url"
    })
    const emptyResponseUrlClient = createHttpClient({
      config: CONFIG,
      fetch: vi.fn<FetchLike>().mockResolvedValue(apiResponse(200, { url: "" })),
      unauthorizedHandler: loginHandler
    })
    await expect(emptyResponseUrlClient.request("empty-response-url")).rejects.toMatchObject({
      code: "untrusted_response_url"
    })

    const aborted = new AbortController()
    aborted.abort()
    await expect(redirectedClient.request("cancelled", { signal: aborted.signal })).rejects.toMatchObject({
      code: "request_aborted"
    })

    vi.useFakeTimers()
    const pendingFetch: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      })
    const timeoutClient = createHttpClient({
      config: CONFIG,
      fetch: pendingFetch,
      unauthorizedHandler: loginHandler
    })
    const timeoutRequest = timeoutClient.request("slow")
    const timeoutExpectation = expect(timeoutRequest).rejects.toMatchObject({
      code: "request_timeout"
    })
    await vi.advanceTimersByTimeAsync(1000)
    await timeoutExpectation
  })
})
`

export function httpFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    ["src/i18n/language.ts", languageSource()],
    ["src/i18n/language.test.ts", languageTest(config)],
    ["src/api/client/httpClient.ts", HTTP_CLIENT_SOURCE],
    ["src/api/client/httpClient.test.ts", HTTP_CLIENT_TEST]
  ])
}
