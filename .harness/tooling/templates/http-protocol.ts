/** 生成受控 URL、响应校验、错误映射和 Ky 传输，无认证生命周期状态。 */
export const HTTP_PROTOCOL_SOURCE = `import ky from "ky"
import { ApiError, HTTP_HEADERS, type ApiErrorOptions, type LoginRedirectOptions, type UnauthorizedHandler } from "./httpContracts"

export const URL_SCHEME = /^[a-z][a-z\\d+.-]*:/i

export const MAX_CONTINUATION_LENGTH = 512

export const MAX_AUTH_TOKEN_LENGTH = 8192

/** 说明 apiError 的稳定结构与职责边界。 */
export function apiError(options: ApiErrorOptions): ApiError {
  return new ApiError(options)
}

/** 说明 hasControlCharacter 的稳定结构与职责边界。 */
export function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true
  }
  return false
}

/** 说明 safeRelativeLoginUrl 的稳定结构与职责边界。 */
export function safeRelativeLoginUrl(value: string): string {
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
    handleUnauthorized: (_error, context) => {
      if (context?.signal.aborted || context?.isCurrentSession() === false) return
      return options.navigate(loginUrl)
    }
  }
}

/** 说明 controlledApiBaseUrl 的稳定结构与职责边界。 */
export function controlledApiBaseUrl(value: string): URL {
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
export function controlledRequestTimeout(value: number): number {
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
export function resolveApiUrl(relativeUrl: string, baseUrl: URL): URL {
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
export function trustedResponse(response: Response, requestUrl: URL, baseUrl: URL): boolean {
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
export function opaqueHeader(
  value: string | null | undefined,
  maximumLength: number,
  code: string
): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== "string") {
    throw apiError({ kind: "invalid-response", code, message: "The API returned an invalid session header.", retryable: false })
  }
  if (value.trim() === "") return undefined
  const normalized = value.trim()
  if (normalized.length > maximumLength || hasControlCharacter(value) || !encodableHeader(normalized)) {
    throw apiError({
      kind: "invalid-response",
      code,
      message: "The API returned an invalid session header.",
      retryable: false
    })
  }
  return normalized
}

/** 使用浏览器实际 Header 编码规则预先验证，失败不携带敏感输入或原始异常。 */
export function encodableHeader(value: string): boolean {
  try { new Headers().set(HTTP_HEADERS.authToken, value); return true }
  catch { return false }
}

/** 说明 responseError 的稳定结构与职责边界。 */
export function responseError(response: Response, ignoreGlobalFeedback = false): ApiError {
  if (response.status === 401) {
    return apiError({
      kind: "http",
      code: "authentication_required",
      message: "Authentication is required.",
      retryable: false,
      status: 401,
      ignoreGlobalFeedback
    })
  }
  if (response.status === 403) {
    return apiError({
      kind: "http", code: "access_forbidden", message: "Access to this resource is forbidden.",
      retryable: false, status: 403
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
export function normalizeFailure(cause: unknown, timedOut: boolean, callerAborted: boolean): ApiError {
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
export function cancelledError(cause: unknown): ApiError {
  return apiError({
    kind: "aborted",
    code: "request_aborted",
    message: "The API request was cancelled.",
    retryable: false,
    cause
  })
}

/** 说明 defaultCredentialExtractor 的稳定结构与职责边界。 */
export function defaultCredentialExtractor(response: Response): string | null {
  return response.headers.get(HTTP_HEADERS.authToken)
}

/** Ky 只负责 Fetch 传输；重试、截止时间和 HTTP 错误由现有请求上下文统一处理。 */
export function requestWithKy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return ky(new Request(input, init), {
    retry: 0,
    timeout: false,
    totalTimeout: false,
    throwHttpErrors: false
  })
}`
