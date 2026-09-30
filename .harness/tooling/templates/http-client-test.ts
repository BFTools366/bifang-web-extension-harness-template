// 保存 HTTP_CLIENT_TEST 变量供当前逻辑使用。
export const HTTP_CLIENT_TEST = `import { afterEach, describe, expect, test, vi } from "vitest"
import {
  ApiError,
  HTTP_HEADERS,
  createHttpClient,
  createLoginUnauthorizedHandler,
  /** 说明 FetchLike 的稳定结构与职责边界。 */
  type FetchLike
} from "./httpClient"

const CONFIG = {
  apiBaseUrl: "https://api.example.com/v1",
  requestTimeoutMs: 1000
} as const

/** 说明 apiResponse 的稳定结构与职责边界。 */
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

/** 说明 deferred 的稳定结构与职责边界。 */
function deferred<T>() {
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
  /** 验证调用后立即取消时，尚未开始的异步 adapter 不会获得执行机会。 */
  test("does not dispatch work cancelled before the scheduled fetch", async () => {
    const caller = new AbortController()
    const fetchRequest = vi.fn<FetchLike>().mockResolvedValue(apiResponse(200))
    const client = createHttpClient({
      config: CONFIG, fetch: fetchRequest,
      unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })
    const pending = client.request("cancelled", { signal: caller.signal })
    caller.abort()
    await expect(pending).rejects.toMatchObject({ code: "request_aborted" })
    expect(fetchRequest).not.toHaveBeenCalled()
  })

  for (const phase of ["before-request", "language-adapter"] as const) {
    /** 验证自定义取消原因仍是不可重试取消，adapter 中取消也不会触发 Fetch。 */
    test("normalizes cancellation during " + phase + " without dispatching", async () => {
      const caller = new AbortController()
      const reason = new ApiError({
        kind: "network", code: "custom_network", message: "Custom reason", retryable: true
      })
      if (phase === "before-request") caller.abort(reason)
      const fetchRequest = vi.fn<FetchLike>()
      const client = createHttpClient({
        config: CONFIG,
        fetch: fetchRequest,
        getLanguage: () => {
          if (phase === "language-adapter") caller.abort(reason)
          return "en"
        },
        unauthorizedHandler: { handleUnauthorized: vi.fn() }
      })
      await expect(client.request("cancelled", { signal: caller.signal })).rejects.toMatchObject({
        code: "request_aborted", kind: "aborted", retryable: false
      })
      expect(fetchRequest).not.toHaveBeenCalled()
    })
  }

  for (const termination of ["aborted", "timeout"] as const) {
    for (const lateResult of ["resolve", "reject"] as const) {
      /** 验证挂起提取器及时终止，迟到结果不推进会话且首个终止原因保持稳定。 */
      test("stops pending extraction on " + termination + " before late " + lateResult, async () => {
        vi.useFakeTimers()
        const entered = deferred<void>()
        const extraction = deferred<string>()
        const extractor = vi.fn()
          .mockImplementationOnce(() => {
            entered.resolve()
            return extraction.promise
          })
          .mockResolvedValue(undefined)
        const fetchRequest = vi.fn<FetchLike>()
          .mockResolvedValueOnce(apiResponse(200, {
            headers: { [HTTP_HEADERS.continuation]: "late-continuation" }
          }))
          .mockResolvedValue(apiResponse(200))
        const onUnauthorized = vi.fn()
        const client = createHttpClient({
          config: CONFIG,
          fetch: fetchRequest,
          extractAuthToken: extractor,
          unauthorizedHandler: { handleUnauthorized: onUnauthorized }
        })
        const caller = new AbortController()
        let settled = false
        const outcome = client.request("slow-extraction", { signal: caller.signal }).then(
          () => { settled = true; return "resolved" },
          (error: unknown) => { settled = true; return error instanceof ApiError ? error.code : "unknown" }
        )
        await entered.promise
        if (termination === "aborted") caller.abort(new ApiError({
          kind: "network", code: "custom_network", message: "Custom reason", retryable: true
        }))
        await vi.advanceTimersByTimeAsync(CONFIG.requestTimeoutMs)
        if (termination === "timeout") caller.abort()

        expect(settled).toBe(true)
        await expect(outcome).resolves.toBe(termination === "aborted" ? "request_aborted" : "request_timeout")
        expect(vi.getTimerCount()).toBe(0)
        if (lateResult === "resolve") extraction.resolve("late-token")
        else extraction.reject(new Error("late extractor failure"))
        await vi.advanceTimersByTimeAsync(0)
        await client.request("next")
        const nextHeaders = new Headers(fetchRequest.mock.calls[1]?.[1]?.headers)
        expect(nextHeaders.has(HTTP_HEADERS.authToken)).toBe(false)
        expect(nextHeaders.has(HTTP_HEADERS.continuation)).toBe(false)
        expect(onUnauthorized).not.toHaveBeenCalled()
      })
    }
  }

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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

  /** 验证当前场景的核心成功或风险边界。 */
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
    const unconfiguredFetch = vi.fn<FetchLike>()
    expect(() => createHttpClient({
      config: { ...CONFIG, apiBaseUrl: "" }, fetch: unconfiguredFetch, unauthorizedHandler: loginHandler
    })).toThrow(/API base URL is not configured/)
    expect(unconfiguredFetch).not.toHaveBeenCalled()
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
