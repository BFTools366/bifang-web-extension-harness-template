/** 生成真实 Ky 传输边界回归，不复制会话测试。 */
export const HTTP_TRANSPORT_TEST = `import { afterEach, describe, expect, test, vi } from "vitest"
import { HTTP_HEADERS, createHttpClient } from "./httpClient"
import { CONFIG, apiResponse, deferred } from "./httpTestFixtures"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("default Ky transport", () => {
  /** 验证扩展到运行时的对象字段不能成为 Ky hooks、替代传输或 URL override。 */
  test("accepts only standard RequestInit fields from callers", async () => {
    const alternateFetch = vi.fn()
    const beforeRequest = vi.fn()
    const init = {
      method: "POST",
      body: JSON.stringify({ value: "kept" }),
      headers: { "Content-Type": "application/json", "X-Domain-Value": "kept" },
      fetch: alternateFetch,
      prefix: "https://outside.example.com",
      hooks: { beforeRequest: [beforeRequest] }
    }
    let sentBody: unknown
    const wireFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      sentBody = await (input as Request).json()
      return apiResponse(200)
    })
    const client = createHttpClient({
      config: CONFIG, unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })
    await client.request("items", init)
    const dispatched = wireFetch.mock.calls[0]?.[0] as Request
    expect(dispatched.url).toBe("https://api.example.com/v1/items")
    expect(dispatched.method).toBe("POST")
    expect(sentBody).toEqual({ value: "kept" })
    expect(dispatched.headers.get("X-Domain-Value")).toBe("kept")
    expect(alternateFetch).not.toHaveBeenCalled()
    expect(beforeRequest).not.toHaveBeenCalled()
  })

  /** 验证真实 Ky dispatch 保持原始 Response、受控 URL、动态 header 与禁用 redirect。 */
  test("preserves response bodies and the controlled request context", async () => {
    const response = apiResponse(200, {
      body: JSON.stringify({ items: [1] }),
      headers: {
        [HTTP_HEADERS.authToken]: "server-token",
        [HTTP_HEADERS.continuation]: "server-continuation"
      }
    })
    const wireFetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(apiResponse(200))
    const client = createHttpClient({
      config: CONFIG,
      getLanguage: () => "zh-CN",
      unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })
    const result = await client.request("items", {
      headers: { [HTTP_HEADERS.authToken]: "caller-token" }
    })
    expect(result).toBe(response)
    expect(await result.json()).toEqual({ items: [1] })
    await client.request("items")
    const first = wireFetch.mock.calls[0]?.[0] as Request
    const next = wireFetch.mock.calls[1]?.[0] as Request
    expect(first).toBeInstanceOf(Request)
    expect(first.url).toBe("https://api.example.com/v1/items")
    expect(first.redirect).toBe("error")
    expect(first.headers.get(HTTP_HEADERS.language)).toBe("zh")
    expect(first.headers.has(HTTP_HEADERS.authToken)).toBe(false)
    expect(next.headers.get(HTTP_HEADERS.authToken)).toBe("server-token")
    expect(next.headers.get(HTTP_HEADERS.continuation)).toBe("server-continuation")
  })

  for (const status of [401, 429, 503]) {
    /** 验证 Ky 不抢先抛 HTTPError 或重试，401 与 ApiError 仍由请求上下文处理。 */
    test("handles status " + status + " once without hidden retries", async () => {
      const wireFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(apiResponse(status))
      const onUnauthorized = vi.fn()
      const client = createHttpClient({
        config: CONFIG,
        unauthorizedHandler: { handleUnauthorized: onUnauthorized }
      })
      await expect(client.request("items")).rejects.toMatchObject({
        name: "ApiError", kind: "http", status, retryable: status !== 401
      })
      expect(wireFetch).toHaveBeenCalledTimes(1)
      expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
    })
  }

  /** 验证网络或 redirect 拒绝只 dispatch 一次，并保留既有错误分类。 */
  test("normalizes a rejected fetch without retrying", async () => {
    const wireFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Fetch failed"))
    const client = createHttpClient({
      config: CONFIG, unauthorizedHandler: { handleUnauthorized: vi.fn() }
    })
    await expect(client.request("items")).rejects.toMatchObject({
      kind: "network", code: "network_error", retryable: true
    })
    expect(wireFetch).toHaveBeenCalledTimes(1)
    expect((wireFetch.mock.calls[0]?.[0] as Request).redirect).toBe("error")
  })

  for (const termination of ["aborted", "timeout"] as const) {
    /** 验证 Ky 收到取消信号，挂起的底层传输也由唯一截止时间及时结束。 */
    test("ends a pending Ky dispatch on " + termination, async () => {
      vi.useFakeTimers()
      const entered = deferred<void>()
      const caller = new AbortController()
      let dispatched: Request | undefined
      const wireFetch = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        dispatched = input as Request
        entered.resolve()
        return new Promise<Response>(() => undefined)
      })
      const client = createHttpClient({
        config: CONFIG,
        unauthorizedHandler: { handleUnauthorized: vi.fn() }
      })
      const pending = client.request("items", { signal: caller.signal })
      const rejected = expect(pending).rejects.toMatchObject({ kind: termination })
      await entered.promise
      if (termination === "aborted") caller.abort()
      else await vi.advanceTimersByTimeAsync(CONFIG.requestTimeoutMs)
      await rejected
      expect(dispatched?.signal.aborted).toBe(true)
      expect(wireFetch).toHaveBeenCalledTimes(1)
    })
  }
})`
