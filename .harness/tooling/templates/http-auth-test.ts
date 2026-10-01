/** 生成认证写入、错误观察器与失效周期的可执行回归。 */
export const HTTP_AUTH_TEST = `import { afterEach, expect, test, vi } from "vitest"
import { createHttpClient, HTTP_HEADERS, type UnauthorizedContext } from "./httpClient"
import { describeHttpError, retryHttpQuery } from "./httpErrors"

const config = { apiBaseUrl: "https://api.example.com/v1", requestTimeoutMs: 1000 }

/** 创建保持真实服务边界的响应，不涉及产品 endpoint。 */
function response(status: number, headers?: HeadersInit): Response {
  const value = new Response(null, { status, headers })
  Object.defineProperty(value, "url", { value: "https://api.example.com/v1/items" })
  return value
}

/** 挂起指定异步边界，由场景明确决定完成时刻。 */
function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => { finish = resolve })
  return { promise, resolve: (value: T) => { if (!finish) throw new Error("Missing resolver"); finish(value) } }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/** 403 是权限失败，不清理 Token、不导航，也不允许 Query 普通重试。 */
test("keeps the session on 403 and intercepts the original safe error", async () => {
  const onError = vi.fn()
  const handleUnauthorized = vi.fn()
  const fetch = vi.fn().mockResolvedValueOnce(response(200, { [HTTP_HEADERS.continuation]: "kept-context" })).mockResolvedValueOnce(response(403)).mockResolvedValue(response(200))
  const client = createHttpClient({ config, fetch, unauthorizedHandler: { handleUnauthorized }, interceptors: { onError } })
  client.setAuthToken("signed-in-token")
  await client.request("items")
  const error = await client.request("items").catch((error: unknown) => error)
  expect(error).toMatchObject({ status: 403, code: "access_forbidden", retryable: false })
  expect(describeHttpError(error).kind).toBe("forbidden")
  expect(retryHttpQuery(0, error)).toBe(false)
  expect(onError).toHaveBeenCalledExactlyOnceWith(error)
  expect(handleUnauthorized).not.toHaveBeenCalled()
  await client.request("items")
  const nextHeaders = new Headers(fetch.mock.calls[2]?.[1]?.headers)
  expect(nextHeaders.get(HTTP_HEADERS.authToken)).toBe("signed-in-token")
  expect(nextHeaders.get(HTTP_HEADERS.continuation)).toBe("kept-context")
})

for (const status of [400, 404, 429, 500, 503]) {
  /** 只用固定状态和错误码分类，不读取远端响应体中的私有文案。 */
  test("maps HTTP status " + status + " to its bounded read policy", async () => {
    const onError = vi.fn()
    const client = createHttpClient({ config, fetch: vi.fn().mockResolvedValue(response(status)), unauthorizedHandler: { handleUnauthorized: vi.fn() }, interceptors: { onError } })
    const error = await client.request("items").catch((error: unknown) => error)
    const retryable = status === 429 || status >= 500
    expect(error).toMatchObject({ code: "http_" + status, status, retryable })
    expect(retryHttpQuery(0, error)).toBe(retryable)
    expect(retryHttpQuery(2, error)).toBe(false)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
  })
}

for (const failure of ["throw", "reject"] as const) {
  /** 错误观察器故障不会替换公开错误，也不会暴露私有异常。 */
  test("contains an error observer that can " + failure, async () => {
    const entries: unknown[] = []
    const client = createHttpClient({ config, fetch: vi.fn().mockResolvedValue(response(500)), unauthorizedHandler: { handleUnauthorized: vi.fn() },
      logger: { warn: () => undefined, error: (event, context) => entries.push({ event, context }) },
      interceptors: { onError: () => { if (failure === "throw") throw new Error("private-token"); return Promise.reject(new Error("private-token")) } }
    })
    await expect(client.request("items")).rejects.toMatchObject({ status: 500, code: "http_500" })
    await Promise.resolve()
    expect(entries).toContainEqual(expect.objectContaining({ event: "http.error_interceptor_failed" }))
    expect(JSON.stringify(entries)).not.toContain("private-token")
  })
}

/** 显式登录经统一请求拦截自动写 header，调用方的伪造值被覆盖。 */
test("writes validated login tokens automatically and rejects invalid replacements atomically", async () => {
  const fetch = vi.fn().mockResolvedValue(response(200))
  const client = createHttpClient({ config, fetch, unauthorizedHandler: { handleUnauthorized: vi.fn() } })
  client.setAuthToken(" first-token ")
  for (const invalid of ["", " ", "bad\\u0000token", "token-😀", "x".repeat(8193)]) {
    expect(() => client.setAuthToken(invalid)).toThrow(expect.objectContaining({ code: "invalid_auth_token" }))
  }
  await client.request("items", { headers: { [HTTP_HEADERS.authToken]: "forged" } })
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get(HTTP_HEADERS.authToken)).toBe("first-token")
})

/** 标准 Headers 边界失败同样归一为不可重试 ApiError，尚未发送请求。 */
test("intercepts invalid request headers without a transport dispatch", async () => {
  const fetch = vi.fn()
  const onError = vi.fn()
  const client = createHttpClient({ config, fetch, unauthorizedHandler: { handleUnauthorized: vi.fn() }, interceptors: { onError } })
  const invalidHeaders: HeadersInit[] = [{ "bad name": "value" }, { "X-Value": "😀" }]
  for (const headers of invalidHeaders) {
    await expect(client.request("items", { headers })).rejects.toMatchObject({ code: "invalid_request_headers", retryable: false })
  }
  expect(fetch).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(2)
})

/** 自定义 Token 提取器也遵守浏览器 header 编码，失败保留当前会话与 continuation。 */
test("rejects unencodable extractor output before committing response state", async () => {
  const fetch = vi.fn().mockResolvedValue(response(200, { [HTTP_HEADERS.continuation]: "uncommitted" }))
  const client = createHttpClient({ config, fetch, extractAuthToken: () => "😀", unauthorizedHandler: { handleUnauthorized: vi.fn() } })
  client.setAuthToken("kept-token")
  await expect(client.request("items")).rejects.toMatchObject({ code: "invalid_auth_token_header", retryable: false })
  await client.request("items").catch(() => undefined)
  const headers = new Headers(fetch.mock.calls[1]?.[1]?.headers)
  expect(headers.get(HTTP_HEADERS.authToken)).toBe("kept-token")
  expect(headers.get(HTTP_HEADERS.continuation)).toBeNull()
})

/** 偏好读取同步建立会话后，当前响应仍可合法 rotation。 */
test("allocates the request sequence after a synchronous session adapter", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(200, { [HTTP_HEADERS.authToken]: "rotated-token" })).mockResolvedValue(response(200))
  let first = true
  const client = createHttpClient({ config, fetch, getLanguage: () => { if (first) { first = false; client.setAuthToken("login-token") }; return "en" }, unauthorizedHandler: { handleUnauthorized: vi.fn() } })
  await client.request("items")
  await client.request("items")
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get(HTTP_HEADERS.authToken)).toBe("login-token")
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get(HTTP_HEADERS.authToken)).toBe("rotated-token")
})

/** 同一失效周期即使后续请求以空 Token 发出，也只有一个仍有效的认证 handler。 */
test("shares a stable expiration context across subsequent 401s", async () => {
  const gate = deferred<void>()
  let context: UnauthorizedContext | undefined
  const handleUnauthorized = vi.fn((_error, received?: UnauthorizedContext) => { context = received; return gate.promise })
  const client = createHttpClient({ config, fetch: vi.fn().mockResolvedValue(response(401)), unauthorizedHandler: { handleUnauthorized } })
  client.setAuthToken("old-token")
  const first = client.request("items").catch((error: unknown) => error)
  await vi.waitFor(() => expect(handleUnauthorized).toHaveBeenCalledTimes(1))
  const second = client.request("items").catch((error: unknown) => error)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(context?.isCurrentSession()).toBe(true)
  gate.resolve()
  expect(await first).toMatchObject({ status: 401, ignoreGlobalFeedback: false })
  expect(await second).toMatchObject({ status: 401, ignoreGlobalFeedback: false })
  expect(handleUnauthorized).toHaveBeenCalledTimes(1)
})

/** 已失效周期里的匿名成功可以返回上下文，但再次 401 必须清掉该 continuation。 */
test("clears continuation on every current 401 without retriggering the handler", async () => {
  const handleUnauthorized = vi.fn()
  const fetch = vi.fn().mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(200, { [HTTP_HEADERS.continuation]: "anonymous-context" }))
    .mockResolvedValueOnce(response(401)).mockResolvedValue(response(200))
  const client = createHttpClient({ config, fetch, unauthorizedHandler: { handleUnauthorized } })
  await client.request("items").catch(() => undefined)
  await client.request("items")
  await client.request("items").catch(() => undefined)
  await client.request("items")
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get(HTTP_HEADERS.continuation)).toBe("anonymous-context")
  expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get(HTTP_HEADERS.continuation)).toBeNull()
  expect(handleUnauthorized).toHaveBeenCalledTimes(1)
})

/** 重新登录使挂起的旧 401 静默，handler 内的异步导航必须复核 context。 */
test("suppresses a pending old 401 after explicit login", async () => {
  const gate = deferred<void>()
  const navigate = vi.fn()
  const handleUnauthorized = vi.fn(async (_error, context?: UnauthorizedContext) => { await gate.promise; if (context?.isCurrentSession()) navigate() })
  const client = createHttpClient({ config, fetch: vi.fn().mockResolvedValue(response(401)), unauthorizedHandler: { handleUnauthorized } })
  const request = client.request("items").catch((error: unknown) => error)
  await vi.waitFor(() => expect(handleUnauthorized).toHaveBeenCalledTimes(1))
  client.setAuthToken("new-token")
  gate.resolve()
  expect(await request).toMatchObject({ status: 401, ignoreGlobalFeedback: true })
  expect(navigate).not.toHaveBeenCalled()
})

/** 显式认证建立门槛，挂起的旧提取结果不能覆盖新 Token 或恢复旧 continuation。 */
test("blocks an old response extractor after a new explicit session", async () => {
  const gate = deferred<string>()
  const fetch = vi.fn().mockResolvedValue(response(200, { [HTTP_HEADERS.continuation]: "old-context" }))
  const extractAuthToken = vi.fn().mockImplementationOnce(() => gate.promise).mockReturnValue(undefined)
  const client = createHttpClient({ config, fetch, extractAuthToken, unauthorizedHandler: { handleUnauthorized: vi.fn() } })
  client.setAuthToken("first-token")
  const pending = client.request("items")
  await vi.waitFor(() => expect(extractAuthToken).toHaveBeenCalledTimes(1))
  client.setAuthToken("new-token")
  gate.resolve("old-token")
  await pending
  await client.request("items")
  const headers = new Headers(fetch.mock.calls[1]?.[1]?.headers)
  expect(headers.get(HTTP_HEADERS.authToken)).toBe("new-token")
  expect(headers.get(HTTP_HEADERS.continuation)).toBeNull()
})

/** handler 挂起仍在截止时间结束，原 401 不被 timeout 替换，迟到导航被阻止。 */
test("bounds a hanging unauthorized handler with the original 401", async () => {
  vi.useFakeTimers()
  const gate = deferred<void>()
  const navigate = vi.fn()
  let context: UnauthorizedContext | undefined
  const handleUnauthorized = vi.fn(async (_error, received?: UnauthorizedContext) => { context = received; await gate.promise; if (context?.isCurrentSession()) navigate() })
  const client = createHttpClient({ config, fetch: vi.fn().mockResolvedValue(response(401)), unauthorizedHandler: { handleUnauthorized } })
  const request = client.request("items").catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(0)
  expect(handleUnauthorized).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await request).toMatchObject({ status: 401, code: "authentication_required" })
  expect(context?.signal.aborted).toBe(true)
  gate.resolve()
  await Promise.resolve(); await Promise.resolve()
  expect(navigate).not.toHaveBeenCalled()
})
`
