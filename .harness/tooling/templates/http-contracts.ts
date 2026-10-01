/** 生成 HTTP 稳定协议类型与唯一 ApiError 类，不保存任何会话状态。 */
export const HTTP_CONTRACTS_SOURCE = `import type { AppConfig } from "../../config/environment.schema"

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
  ignoreGlobalFeedback?: boolean
}

/** 说明 ApiError 的稳定结构与职责边界。 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly code: string
  readonly retryable: boolean
  readonly status: number | undefined
  readonly ignoreGlobalFeedback: boolean

  /** 说明当前方法的稳定职责与行为边界。 */
  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.kind = options.kind
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
    this.ignoreGlobalFeedback = options.ignoreGlobalFeedback ?? false
  }
}

/** 说明 UnauthorizedHandler 的稳定结构与职责边界。 */
export interface UnauthorizedHandler {
  handleUnauthorized(error: ApiError, context?: UnauthorizedContext): void | Promise<void>
}

/** 认证 adapter 在每次导航或异步副作用前复核会话，并在请求结束时停止工作。 */
export interface UnauthorizedContext {
  signal: AbortSignal
  /** 每次异步认证副作用之前判断是否仍属于当前失效周期。 */
  isCurrentSession(): boolean
}

/** 错误观察器只同步投影安全 UI 状态，不接管认证、重放或原始异常。 */
export interface HttpInterceptors {
  onError?(error: ApiError): void
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
export interface HttpLogger {
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
  interceptors?: HttpInterceptors
}

/** 说明 HttpClient 的稳定结构与职责边界。 */
export interface HttpClient {
  request(relativeUrl: string, init?: HttpRequestOptions): Promise<Response>
  clearSession(): void
  setAuthToken(token: string): void
}

/** Query 或局部界面拥有重试和最终失败反馈时，抑制中间尝试的全局观察器。 */
export interface HttpRequestOptions extends RequestInit {
  feedback?: "global" | "owner"
}
`
