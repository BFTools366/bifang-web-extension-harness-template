/** 生成统一 HTTP 错误分类与 Query 重试策略，不读取服务端文案或异常 cause。 */
export const HTTP_ERRORS_SOURCE = `import { ApiError } from "./httpClient"

/** 错误展示只保留可本地化的固定键与恢复能力，不持有 Token 或原始响应。 */
export interface HttpErrorPresentation {
  kind: "authentication" | "forbidden" | "network" | "timeout" | "rate-limit" | "server" | "request" | "cancelled" | "superseded" | "unexpected"
  titleKey: string
  descriptionKey: string
  canRetry: boolean
}

/** 将所有失败映射为固定 UI 语义；认证与权限错误永不成为普通重试。 */
export function describeHttpError(error: unknown): HttpErrorPresentation {
  if (!(error instanceof ApiError)) {
    return { kind: "unexpected", titleKey: "routeErrorTitle", descriptionKey: "routeErrorDescription", canRetry: true }
  }
  if (error.ignoreGlobalFeedback) {
    return { kind: "superseded", titleKey: "httpSupersededTitle", descriptionKey: "httpSupersededDescription", canRetry: true }
  }
  if (error.kind === "aborted") {
    return { kind: "cancelled", titleKey: "httpCancelledTitle", descriptionKey: "httpCancelledDescription", canRetry: false }
  }
  if (error.status === 401) {
    return { kind: "authentication", titleKey: "httpAuthenticationTitle", descriptionKey: "httpAuthenticationDescription", canRetry: false }
  }
  if (error.status === 403) {
    return { kind: "forbidden", titleKey: "httpForbiddenTitle", descriptionKey: "httpForbiddenDescription", canRetry: false }
  }
  const kind = error.kind === "network" || error.kind === "timeout" ? error.kind
    : error.status === 429 ? "rate-limit"
    : error.status !== undefined && error.status >= 500 ? "server" : "request"
  const keys = {
    network: ["httpNetworkTitle", "httpNetworkDescription"],
    timeout: ["httpTimeoutTitle", "httpTimeoutDescription"],
    "rate-limit": ["httpRateLimitTitle", "httpRateLimitDescription"],
    server: ["httpServerTitle", "httpServerDescription"],
    request: ["httpRequestTitle", "httpRequestDescription"]
  } as const
  return { kind, titleKey: keys[kind][0], descriptionKey: keys[kind][1], canRetry: error.retryable }
}

/** 读取最多重试两次，未知错误与会话、权限、取消失败不自动重试；mutation 单独禁用。 */
export function retryHttpQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && error.retryable
    && !error.ignoreGlobalFeedback && error.kind !== "aborted" && error.status !== 401 && error.status !== 403
}
`

/** 生成跨组件错误反馈的 Jotai 状态，原始错误仅用弱引用关联，不进入 UI 状态。 */
export const HTTP_FEEDBACK_SOURCE = `import { atom, getDefaultStore } from "jotai"
import { ApiError } from "./httpClient"
import { describeHttpError, type HttpErrorPresentation } from "./httpErrors"

/** 当前入口唯一的安全反馈投影，执行上下文之间不共享该 atom。 */
export const httpFeedbackAtom = atom<HttpErrorPresentation | null>(null)
let currentReference: WeakRef<object> | undefined
let currentPrimitive: unknown

/** 相同错误或相同展示语义只播报一次，取消和旧会话失败保持安静。 */
export function reportHttpError(error: unknown): void {
  if (error instanceof ApiError && (error.kind === "aborted" || error.ignoreGlobalFeedback)) return
  const reference = (typeof error === "object" && error !== null) || typeof error === "function" ? error : undefined
  const presentation = describeHttpError(error)
  const store = getDefaultStore()
  const current = store.get(httpFeedbackAtom)
  // 同语义不重复播报，但最新失败仍独立拥有清理权，旧局部状态不能清掉新错误。
  currentReference = reference === undefined ? undefined : new WeakRef(reference)
  currentPrimitive = reference === undefined ? error : undefined
  if (current?.kind === presentation.kind && current.canRetry === presentation.canRetry) return
  store.set(httpFeedbackAtom, presentation)
}

/** 局部或路由状态已接管同一错误时清理全局反馈，其他并发错误不受影响。 */
export function clearHttpFeedback(...errors: [] | [unknown]): void {
  const store = getDefaultStore()
  if (errors.length === 0 || (currentReference === undefined ? Object.is(currentPrimitive, errors[0]) : currentReference.deref() === errors[0])) {
    currentReference = undefined
    currentPrimitive = undefined
    store.set(httpFeedbackAtom, null)
  }
}
`

/** 生成宿主可按需使用的唯一 HTTP 实例，静态页面不会因空 BaseURL 失去启动能力。 */
export const HTTP_RUNTIME_SOURCE = `import { createHttpClient, type HttpClient, type HttpRequestOptions, type UnauthorizedHandler } from "./httpClient"
import { clearHttpFeedback, reportHttpError } from "./httpFeedback"

let client: HttpClient | undefined
let authenticationHandler: UnauthorizedHandler | undefined

/** 在真实登录入口存在后由组合层注入；不存在时只呈现可见的重新认证状态。 */
export function configureUnauthorizedHandler(handler: UnauthorizedHandler): void {
  authenticationHandler = handler
}

/** 首次真实操作才校验配置；认证失效与其他错误共用安全反馈入口。 */
function currentClient(): HttpClient {
  client ??= createHttpClient({
    unauthorizedHandler: {
      handleUnauthorized: (error, context) => {
        if (context?.signal.aborted || context?.isCurrentSession() === false) return
        reportHttpError(error)
        return authenticationHandler?.handleUnauthorized(error, context)
      }
    },
    interceptors: { onError: reportHttpError }
  })
  return client
}

/** feature 和路由 loader 使用相同会话 owner，显式登录后自动向后续请求写入 Token。 */
export const applicationHttp: HttpClient = {
  /** 当前操作按反馈所有者处理失败并保留原始公开错误。 */
  async request(relativeUrl, init) {
    try { return await currentClient().request(relativeUrl, init) }
    catch (error) { if (init?.feedback !== "owner") reportHttpError(error); throw error }
  },
  /** 真实认证成功后建立新会话并清理失效提示。 */
  setAuthToken(token) {
    currentClient().setAuthToken(token)
    clearHttpFeedback()
  },
  /** 登出只清当前内存会话与提示，私有 Query cache 由认证 feature 清理。 */
  clearSession() {
    client?.clearSession()
    clearHttpFeedback()
  }
}

/** Query 拥有重试与最终反馈，自动重试的中间错误不污染全局 UI；会话仍由同一 client 拥有。 */
export function requestHttpQuery(relativeUrl: string, init: HttpRequestOptions = {}): Promise<Response> {
  return applicationHttp.request(relativeUrl, { ...init, feedback: "owner" })
}
`

/** 生成两种宿主共用的固定 UI 翻译键，仍进入各自既有 i18next 资源。 */
export const HTTP_ERROR_TRANSLATIONS = {
  en: {
    httpAuthenticationTitle: "Authentication required",
    httpAuthenticationDescription:
      "Your session is unavailable. Authentication is required to continue this operation.",
    httpForbiddenTitle: "Access denied",
    httpForbiddenDescription:
      "You do not have permission to access this resource. Your session has been kept.",
    httpNetworkTitle: "Connection unavailable",
    httpNetworkDescription: "Check your connection before continuing.",
    httpTimeoutTitle: "Request timed out",
    httpTimeoutDescription:
      "The request took too long. Check the result of this action before continuing.",
    httpRateLimitTitle: "Too many requests",
    httpRateLimitDescription: "Wait before continuing.",
    httpServerTitle: "Service unavailable",
    httpServerDescription:
      "The service could not complete this request. Check the result of this action before continuing.",
    httpRequestTitle: "Request could not complete",
    httpRequestDescription: "Check this action's input and permissions before continuing.",
    httpCancelledTitle: "Request cancelled",
    httpCancelledDescription: "This operation has stopped.",
    httpSupersededTitle: "Session changed",
    httpSupersededDescription:
      "This request used an earlier session. Reload this page with the current session.",
    httpAuthenticate: "Authenticate",
    httpDismiss: "Dismiss error",
    routeLoading: "Loading page…",
    routeErrorTitle: "Unable to open this page",
    routeErrorDescription: "Please retry the page or return home.",
    routeRetry: "Retry page",
    backHome: "Back to home"
  },
  zh: {
    httpAuthenticationTitle: "需要重新认证",
    httpAuthenticationDescription: "当前会话不可用，需要重新认证才能继续本次操作。",
    httpForbiddenTitle: "没有访问权限",
    httpForbiddenDescription: "你没有访问此资源的权限，当前会话已保留。",
    httpNetworkTitle: "连接暂时不可用",
    httpNetworkDescription: "请检查网络连接，再继续。",
    httpTimeoutTitle: "请求超时",
    httpTimeoutDescription: "请求等待时间过长，请先确认本次操作的结果。",
    httpRateLimitTitle: "请求过于频繁",
    httpRateLimitDescription: "请等待一段时间后再继续。",
    httpServerTitle: "服务暂时不可用",
    httpServerDescription: "服务未能完成请求，请先确认本次操作的结果。",
    httpRequestTitle: "请求未能完成",
    httpRequestDescription: "请检查此操作的输入和权限，再继续。",
    httpCancelledTitle: "请求已取消",
    httpCancelledDescription: "本次操作已停止。",
    httpSupersededTitle: "会话状态已更新",
    httpSupersededDescription: "此请求使用了旧会话，请用当前会话重新加载页面。",
    httpAuthenticate: "重新认证",
    httpDismiss: "关闭错误提示",
    routeLoading: "正在加载页面…",
    routeErrorTitle: "页面暂时无法打开",
    routeErrorDescription: "请重试加载页面，或返回首页。",
    routeRetry: "重新加载页面",
    backHome: "返回首页"
  }
} as const
