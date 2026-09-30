// 保存 HTTP_CLIENT_SOURCE 变量供当前逻辑使用。
export const HTTP_CLIENT_SOURCE = `import { APP_CONFIG } from "../../config/environment"
import type { AppConfig } from "../../config/environment.schema"
import { getRequestLanguage, normalizeLanguage } from "../../i18n/language"
import { createLogger } from "../../observability/logger"

/** 说明 HTTP_HEADERS 的稳定结构与职责边界。 */
export const HTTP_HEADERS = {
  continuation: "X-Http-Request",
  language: "X-Lang",
  authToken: "X-AUTH-TOKEN"
} as const

/** 说明 ApiErrorKind 的稳定结构与职责边界。 */
export type ApiErrorKind =
  | "aborted"
  | "http"
  | "invalid-response"
  | "network"
  | "timeout"
  | "unauthorized-handler"

/** 说明 ApiErrorOptions 的稳定结构与职责边界。 */
export interface ApiErrorOptions {
  kind: ApiErrorKind
  code: string
  message: string
  retryable: boolean
  status?: number
  cause?: unknown
}

/** 说明 ApiError 的稳定结构与职责边界。 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly code: string
  readonly retryable: boolean
  readonly status: number | undefined

  /** 说明当前方法的稳定职责与行为边界。 */
  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.kind = options.kind
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
  }
}

/** 说明 UnauthorizedHandler 的稳定结构与职责边界。 */
export interface UnauthorizedHandler {
  handleUnauthorized(error: ApiError): void | Promise<void>
}

/** 说明 LoginRedirectOptions 的稳定结构与职责边界。 */
export interface LoginRedirectOptions {
  loginUrl: string
  navigate(url: string): void | Promise<void>
}

/** 说明 CredentialExtractor 的稳定结构与职责边界。 */
export type CredentialExtractor = (response: Response) =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>

/** 说明 FetchLike 的稳定结构与职责边界。 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** 说明 HttpLogger 的稳定结构与职责边界。 */
interface HttpLogger {
  warn(event: string, context?: Record<string, unknown>): void
  error(event: string, context?: Record<string, unknown>): void
}

/** 说明 HttpClientOptions 的稳定结构与职责边界。 */
export interface HttpClientOptions {
  unauthorizedHandler: UnauthorizedHandler
  config?: Pick<Readonly<AppConfig>, "apiBaseUrl" | "requestTimeoutMs">
  fetch?: FetchLike
  getLanguage?: () => string
  extractAuthToken?: CredentialExtractor
  logger?: HttpLogger
  now?: () => number
}

/** 说明 HttpClient 的稳定结构与职责边界。 */
export interface HttpClient {
  request(relativeUrl: string, init?: RequestInit): Promise<Response>
  clearSession(): void
}

/** 说明 RequestSnapshot 的稳定结构与职责边界。 */
interface RequestSnapshot {
  sequence: number
  authRevision: number
  authToken: string | undefined
}

const URL_SCHEME = /^[a-z][a-z\\d+.-]*:/i
const MAX_CONTINUATION_LENGTH = 512
const MAX_AUTH_TOKEN_LENGTH = 8192

/** 说明 apiError 的稳定结构与职责边界。 */
function apiError(options: ApiErrorOptions): ApiError {
  return new ApiError(options)
}

/** 说明 hasControlCharacter 的稳定结构与职责边界。 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true
  }
  return false
}

/** 说明 safeRelativeLoginUrl 的稳定结构与职责边界。 */
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

/** 说明 createLoginUnauthorizedHandler 的稳定结构与职责边界。 */
export function createLoginUnauthorizedHandler(options: LoginRedirectOptions): UnauthorizedHandler {
  const loginUrl = safeRelativeLoginUrl(options.loginUrl)
  return {
    handleUnauthorized: () => options.navigate(loginUrl)
  }
}

/** 说明 controlledApiBaseUrl 的稳定结构与职责边界。 */
function controlledApiBaseUrl(value: string): URL {
  if (value.trim() === "") {
    throw apiError({
      kind: "http",
      code: "api_base_url_not_configured",
      message: "The API base URL is not configured. Set API_BASE_URL before making requests.",
      retryable: false
    })
  }
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

/** 说明 controlledRequestTimeout 的稳定结构与职责边界。 */
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

/** 说明 resolveApiUrl 的稳定结构与职责边界。 */
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

/** 说明 trustedResponse 的稳定结构与职责边界。 */
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

/** 说明 opaqueHeader 的稳定结构与职责边界。 */
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

/** 说明 responseError 的稳定结构与职责边界。 */
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

/** 说明 normalizeFailure 的稳定结构与职责边界。 */
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
    return cancelledError(cause)
  }
  return apiError({
    kind: "network",
    code: "network_error",
    message: "The API request could not be completed.",
    retryable: true,
    cause
  })
}

/** 调用方取消始终归一为不可重试错误，不让自定义 reason 冒充网络失败。 */
function cancelledError(cause: unknown): ApiError {
  return apiError({
    kind: "aborted",
    code: "request_aborted",
    message: "The API request was cancelled.",
    retryable: false,
    cause
  })
}

/** 说明 defaultCredentialExtractor 的稳定结构与职责边界。 */
function defaultCredentialExtractor(response: Response): string | null {
  return response.headers.get(HTTP_HEADERS.authToken)
}

/** 说明 createHttpClient 的稳定结构与职责边界。 */
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

  /** 说明 reportFailure 的稳定结构与职责边界。 */
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

  /** 说明 reportUnauthorized 的稳定结构与职责边界。 */
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

  /** 说明 clearSession 的稳定结构与职责边界。 */
  function clearSession(): void {
    continuation = undefined
    authToken = undefined
    authRevision += 1
    const nextAllowedSequence = nextSequence + 1
    continuationSequence = nextAllowedSequence
    authSequence = nextAllowedSequence
  }

  /** 说明 request 的稳定结构与职责边界。 */
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
      throw cancelledError(callerSignal.reason)
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
    let terminationError: ApiError | undefined
    /** 首次取消或超时拥有终止原因，后续事件不能覆盖它。 */
    function terminate(error: ApiError): void {
      if (terminationError !== undefined) return
      terminationError = error
      controller.abort(error)
    }
    const handleCallerAbort = () => terminate(cancelledError(callerSignal?.reason))
    callerSignal?.addEventListener("abort", handleCallerAbort, { once: true })
    // 同步语言 adapter 也可能取消请求，安装监听后再次复核以闭合这一窗口。
    if (callerSignal?.aborted) handleCallerAbort()
    const timeout = setTimeout(() => {
      terminate(normalizeFailure(undefined, true, false))
    }, requestTimeoutMs)

    /** 让不响应 AbortSignal 的 Fetch 或异步提取器也能及时结束当前请求。 */
    async function awaitActive<T>(operation: () => T | Promise<T>): Promise<T> {
      if (terminationError !== undefined) throw terminationError
      let handleAbort: () => void = () => undefined
      const stopped = new Promise<never>((_resolve, reject) => {
        handleAbort = () => reject(terminationError)
        controller.signal.addEventListener("abort", handleAbort, { once: true })
      })
      try {
        const work = Promise.resolve().then(() => {
          if (terminationError !== undefined) throw terminationError
          return operation()
        })
        return await Promise.race([work, stopped])
      } finally {
        controller.signal.removeEventListener("abort", handleAbort)
      }
    }

    try {
      const response = await awaitActive(() => fetchRequest(requestUrl, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: "error"
      }))
      if (terminationError !== undefined) throw terminationError
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
          await awaitActive(() => extractAuthToken(response.clone())),
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

      // 取消或超时后的迟到提取结果不得推进会话，序号仍保护并发响应顺序。
      if (terminationError !== undefined) throw terminationError
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
      const error = normalizeFailure(
        cause,
        terminationError?.kind === "timeout",
        terminationError?.kind === "aborted"
      )
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
