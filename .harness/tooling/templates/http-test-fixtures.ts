/** 生成 HTTP 测试共用的受控响应、延迟 Promise 与内存日志夹具。 */
export const HTTP_TEST_FIXTURES = `export const CONFIG = {
  apiBaseUrl: "https://api.example.com/v1",
  requestTimeoutMs: 1000
} as const

/** 说明 apiResponse 的稳定结构与职责边界。 */
export function apiResponse(
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

/** 说明 deferred 的稳定结构与职责边界。 */
export function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    /** 说明当前方法的稳定职责与行为边界。 */
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error("Deferred promise is unavailable")
      resolvePromise(value)
    },
    /** 让测试显式触发异步提取器的迟到失败。 */
    reject(reason: unknown) {
      if (rejectPromise === undefined) throw new Error("Deferred promise is unavailable")
      rejectPromise(reason)
    }
  }
}

/** 说明 memoryLogger 的稳定结构与职责边界。 */
export function memoryLogger() {
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
`
