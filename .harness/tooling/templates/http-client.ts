/** 生成当前执行上下文唯一的请求、认证 revision、截止时间与 single-flight owner。 */
export const HTTP_CLIENT_SOURCE = `import { APP_CONFIG } from "../../../config/environment"
import { getRequestLanguage, normalizeLanguage } from "../../../i18n/language"
import { createLogger } from "../../../observability/logger"
import { ApiError, HTTP_HEADERS, type HttpClientOptions, type HttpClient, type HttpRequestOptions, type UnauthorizedContext } from "./httpContracts"
import { apiError, MAX_AUTH_TOKEN_LENGTH, MAX_CONTINUATION_LENGTH, controlledApiBaseUrl, controlledRequestTimeout, requestWithKy, defaultCredentialExtractor, normalizeFailure, cancelledError, hasControlCharacter, encodableHeader, resolveApiUrl, responseError, trustedResponse, opaqueHeader } from "./httpProtocol"

export { ApiError, HTTP_HEADERS } from "./httpContracts"
export { createLoginUnauthorizedHandler } from "./httpProtocol"
export type { ApiErrorKind, ApiErrorOptions, UnauthorizedHandler, UnauthorizedContext, HttpInterceptors, LoginRedirectOptions, CredentialExtractor, FetchLike, HttpClientOptions, HttpClient, HttpRequestOptions } from "./httpContracts"

/** 说明 RequestSnapshot 的稳定结构与职责边界。 */
interface RequestSnapshot {
  sequence: number
  authRevision: number
  authToken: string | undefined
}

/** 说明 createHttpClient 的稳定结构与职责边界。 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const config = options.config ?? APP_CONFIG
  const baseUrl = controlledApiBaseUrl(config.apiBaseUrl)
  const requestTimeoutMs = controlledRequestTimeout(config.requestTimeoutMs)
  const fetchRequest = options.fetch ?? requestWithKy
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

  /** 将协议和传输失败投影到统一错误观察器，保留原始公开错误。 */
  function interceptError(error: ApiError, startedAt: number, feedback: HttpRequestOptions["feedback"]): void {
    if (error.kind === "aborted" || error.status === 401) return
    logger.error("http.request_failed", {
      status: error.status,
      code: error.code,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      reason: error.kind,
      retryable: error.retryable
    })
    if (feedback === "owner") return
    try {
      // 即使调用方误传异步函数，也处理其拒绝；错误投影从不延长请求或替换原错误。
      const result: unknown = options.interceptors?.onError?.(error)
      void Promise.resolve(result).catch(() => {
        logger.error("http.error_interceptor_failed", { reason: "interceptor_failed", code: "error_interceptor_failed" })
      })
    } catch {
      logger.error("http.error_interceptor_failed", { reason: "interceptor_failed", code: "error_interceptor_failed" })
    }
  }

  /** 说明 reportUnauthorized 的稳定结构与职责边界。 */
  async function reportUnauthorized(error: ApiError, context: UnauthorizedContext): Promise<void> {
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
      .then(() => {
        if (context.signal.aborted || !context.isCurrentSession()) return
        return options.unauthorizedHandler.handleUnauthorized(error, context)
      })
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

  /** 显式登录只写入已校验的内存 Token，并阻止旧响应与旧认证导航影响新会话。 */
  function setAuthToken(token: string): void {
    if (typeof token !== "string" || token.trim() === "" || token.trim().length > MAX_AUTH_TOKEN_LENGTH || hasControlCharacter(token) || !encodableHeader(token.trim())) {
      throw apiError({ kind: "invalid-response", code: "invalid_auth_token", message: "The authentication token is invalid.", retryable: false })
    }
    clearSession()
    authToken = token.trim()
    unauthorizedLatched = false
    unauthorizedFlight = undefined
  }

  /** 请求拦截只从单一会话 owner 写入标准 header，调用方不能伪造这些字段。 */
  function interceptRequest(init: RequestInit): { headers: Headers; snapshot: RequestSnapshot } {
    const headers = new Headers(init.headers)
    headers.delete(HTTP_HEADERS.continuation)
    headers.delete(HTTP_HEADERS.language)
    headers.delete(HTTP_HEADERS.authToken)
    let requestLanguage = "en"
    try { requestLanguage = normalizeLanguage(language()) }
    catch { /* 偏好读取失败只回退语言，不阻断合法请求。 */ }
    const sequence = (nextSequence += 1)
    const snapshot: RequestSnapshot = { sequence, authRevision, authToken }
    headers.set(HTTP_HEADERS.language, requestLanguage)
    if (continuation !== undefined) headers.set(HTTP_HEADERS.continuation, continuation)
    if (authToken !== undefined) headers.set(HTTP_HEADERS.authToken, authToken)
    return { headers, snapshot }
  }

  /** 说明 request 的稳定结构与职责边界。 */
  async function request(relativeUrl: string, init: HttpRequestOptions = {}): Promise<Response> {
    const startedAt = now()
    let requestUrl: URL
    try {
      requestUrl = resolveApiUrl(relativeUrl, baseUrl)
    } catch (cause) {
      const error = normalizeFailure(cause, false, false)
      interceptError(error, startedAt, init.feedback)
      throw error
    }

    const callerSignal = init.signal ?? undefined
    if (callerSignal?.aborted) {
      throw cancelledError(callerSignal.reason)
    }

    let intercepted: ReturnType<typeof interceptRequest>
    try {
      intercepted = interceptRequest(init)
    } catch {
      const error = apiError({ kind: "http", code: "invalid_request_headers", message: "The request headers are invalid.", retryable: false })
      interceptError(error, startedAt, init.feedback)
      throw error
    }
    const { headers, snapshot } = intercepted
    const { sequence } = snapshot

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
        const currentSession = authRevision === snapshot.authRevision && authToken === snapshot.authToken
        const error = responseError(response, response.status === 401 && !currentSession)
        if (error.status === 401) {
          // 迟到的旧 401 不能清除或重定向一个已经更新的认证会话。
          if (currentSession) {
            authToken = undefined
            continuation = undefined
            // 同一失效周期保留稳定 revision，后续匿名 401 不能使唯一认证导航失效。
            if (!unauthorizedLatched) {
              authRevision += 1
            }
            // 失效门槛覆盖此时所有已派发请求，只允许之后的新请求建立会话。
            authSequence = Math.max(authSequence, nextSequence + 1)
            continuationSequence = Math.max(continuationSequence, nextSequence + 1)
            const expiredRevision = authRevision
            // handler 挂起也必须及时结束请求；其失败或截止时间不替换已经收到的原始 401。
            try {
              await awaitActive(() => reportUnauthorized(error, {
                signal: controller.signal,
                isCurrentSession: () => authRevision === expiredRevision && !controller.signal.aborted
              }))
            } catch {
              // 原 401 仍交给调用方，signal 和 revision 负责阻止迟到的认证副作用。
            }
            if (authRevision !== expiredRevision) throw responseError(response, true)
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
          // 默认提取器只读 Header，仅自定义提取器才克隆以免为每个响应缓冲第二份 Body。
          await awaitActive(() =>
            extractAuthToken(
              extractAuthToken === defaultCredentialExtractor ? response : response.clone()
            )
          ),
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
      interceptError(error, startedAt, init.feedback)
      throw error
    } finally {
      clearTimeout(timeout)
      callerSignal?.removeEventListener("abort", handleCallerAbort)
    }
  }

  return { request, clearSession, setAuthToken }
}`
