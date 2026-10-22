import type { ProjectConfig } from "../types.ts"
import { tsString } from "./helpers.ts"

/** 生成会话分页 hook 与分页控件的行为测试源码。 */
export function paginationTest(config: ProjectConfig): string {
  return `// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core"
import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BRAND } from "../brand"
import { PaginationControls } from "./PaginationControls"
import {
  createPageResult,
  paginationStorageKey,
  shouldReturnToFirstPage,
  useSessionPagination,
  /** 说明 PageQueryState 的稳定结构与职责边界。 */
  type PageQueryState,
  /** 说明 PageRequest 的稳定结构与职责边界。 */
  type PageRequest
} from "./useSessionPagination"

/** 说明 queryState 的稳定结构与职责边界。 */
function queryState<Item>(
  overrides: Partial<PageQueryState<Item>> = {}
): PageQueryState<Item> {
  return {
    status: "pending",
    isFetching: false,
    isPlaceholderData: false,
    ...overrides
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe(${tsString(`${config.projectType} session pagination`)}, () => {
  /** 验证当前场景的核心成功或风险边界。 */
  test("restores valid state with project, schema, and collection scope isolation", () => {
    const ordersKey = paginationStorageKey("orders")
    const auditKey = paginationStorageKey("audit/events")
    expect(ordersKey).toBe(BRAND.id + ":pagination:v1:orders")
    expect(auditKey).toBe(BRAND.id + ":pagination:v1:audit%2Fevents")
    window.sessionStorage.setItem(
      ordersKey,
      JSON.stringify({ version: 1, page: 4, pageSize: 50 })
    )

    const orders = renderHook(() =>
      useSessionPagination({ scope: "orders", query: queryState<string>() })
    )
    const audit = renderHook(() =>
      useSessionPagination({ scope: "audit/events", query: queryState<string>() })
    )

    expect(orders.result.current.request).toEqual({ page: 4, pageSize: 50 })
    expect(audit.result.current.request).toEqual({ page: 1, pageSize: 20 })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test.each([
    ["malformed JSON", "{"],
    ["unknown schema", JSON.stringify({ version: 2, page: 2, pageSize: 20 })],
    ["zero page", JSON.stringify({ version: 1, page: 0, pageSize: 20 })],
    ["unsupported page size", JSON.stringify({ version: 1, page: 2, pageSize: 25 })]
  ])("uses defaults for %s", (_name, storedValue) => {
    window.sessionStorage.setItem(paginationStorageKey("orders"), storedValue)
    const { result } = renderHook(() =>
      useSessionPagination({ scope: "orders", query: queryState<string>() })
    )
    expect(result.current.request).toEqual({ page: 1, pageSize: 20 })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("survives Storage read and write failures without losing in-memory navigation", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    const { result } = renderHook(() =>
      useSessionPagination({ scope: "orders", query: queryState<string>() })
    )
    expect(result.current.request).toEqual({ page: 1, pageSize: 20 })

    vi.restoreAllMocks()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(() => act(() => result.current.setPage(3))).not.toThrow()
    expect(result.current.request).toEqual({ page: 3, pageSize: 20 })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("persists page changes and resets page one only when page size changes", () => {
    const storageKey = paginationStorageKey("orders")
    const { result, unmount } = renderHook(() =>
      useSessionPagination({ scope: "orders", query: queryState<string>() })
    )

    act(() => result.current.setPage(4))
    expect(window.sessionStorage.getItem(storageKey)).toBe(
      '{"version":1,"page":4,"pageSize":20}'
    )
    act(() => result.current.setPageSize(20))
    expect(result.current.request).toEqual({ page: 4, pageSize: 20 })
    act(() => result.current.setPageSize(50))
    expect(result.current.request).toEqual({ page: 1, pageSize: 50 })
    expect(window.sessionStorage.getItem(storageKey)).toBe(
      '{"version":1,"page":1,"pageSize":50}'
    )

    unmount()
    const restored = renderHook(() =>
      useSessionPagination({ scope: "orders", query: queryState<string>() })
    )
    expect(restored.result.current.request).toEqual({ page: 1, pageSize: 50 })
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("creates normalized results and rejects an invalid total", () => {
    const request: PageRequest = { page: 2, pageSize: 20 }
    expect(createPageResult(request, ["item"], 21)).toEqual({
      requestedPage: 2,
      requestedPageSize: 20,
      items: ["item"],
      total: 21
    })
    expect(() => createPageResult(request, [], -1)).toThrow(/non-negative/)
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("returns to page one for the exact current successful empty result", async () => {
    const initialQuery = queryState<string>()
    const { result, rerender } = renderHook(
      ({ query }: { query: PageQueryState<string> }) =>
        useSessionPagination({ scope: "orders", query }),
      { initialProps: { query: initialQuery } }
    )
    act(() => result.current.setPage(3))

    rerender({
      query: queryState({
        status: "success",
        result: createPageResult({ page: 3, pageSize: 20 }, [], 20)
      })
    })

    await waitFor(() => expect(result.current.request).toEqual({ page: 1, pageSize: 20 }))
    expect(window.sessionStorage.getItem(result.current.storageKey)).toBe(
      '{"version":1,"page":1,"pageSize":20}'
    )
  })

  const request: PageRequest = { page: 3, pageSize: 20 }
  const statesThatKeepPage: Array<[string, PageQueryState<string>]> = [
    [
      "pending",
      queryState({ status: "pending", result: createPageResult(request, [], 60) })
    ],
    ["error", queryState({ status: "error", result: createPageResult(request, [], 60) })],
    [
      "fetching",
      queryState({
        status: "success",
        isFetching: true,
        result: createPageResult(request, [], 60)
      })
    ],
    [
      "placeholder",
      queryState({
        status: "success",
        isPlaceholderData: true,
        result: createPageResult(request, [], 60)
      })
    ],
    [
      "stale page",
      queryState({
        status: "success",
        result: createPageResult({ page: 2, pageSize: 20 }, [], 60)
      })
    ],
    [
      "stale page size",
      queryState({
        status: "success",
        result: createPageResult({ page: 3, pageSize: 50 }, [], 60)
      })
    ],
    [
      "non-empty",
      queryState({ status: "success", result: createPageResult(request, ["item"], 60) })
    ]
  ]

  /** 验证当前场景的核心成功或风险边界。 */
  test.each(statesThatKeepPage)("does not return for %s state", (_name, query) => {
    expect(shouldReturnToFirstPage(request, query)).toBe(false)
  })

  /** 验证当前场景的核心成功或风险边界。 */
  test("keeps a successful empty first page", () => {
    const request: PageRequest = { page: 1, pageSize: 20 }
    const query = queryState<string>({
      status: "success",
      result: createPageResult(request, [], 0)
    })
    expect(shouldReturnToFirstPage(request, query)).toBe(false)
  })
})

/** 验证当前场景的核心成功或风险边界。 */
test("renders controlled accessible pagination without deriving state from an empty total", async () => {
  const user = userEvent.setup()
  const onPageChange = vi.fn()
  const onPageSizeChange = vi.fn()
  const labels = {
    navigation: "Results pagination",
    page: (page: number) => "Page " + page,
    previous: "Previous page",
    next: "Next page",
    pageSize: "Rows per page"
  }
  const { rerender } = render(
    <MantineProvider env="test">
      <PaginationControls
        request={{ page: 2, pageSize: 20 }}
        total={60}
        labels={labels}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </MantineProvider>
  )

  expect(screen.getByRole("navigation", { name: "Results pagination" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Page 3" }))
  expect(onPageChange).toHaveBeenCalledWith(3)
  await user.click(screen.getByRole("combobox", { name: "Rows per page" }))
  await user.click(screen.getByRole("option", { name: "50" }))
  expect(onPageSizeChange).toHaveBeenCalledWith(50)

  rerender(
    <MantineProvider env="test">
      <PaginationControls
        request={{ page: 2, pageSize: 20 }}
        total={0}
        labels={labels}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </MantineProvider>
  )
  expect(onPageChange).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("button", { name: "Page 2" })).not.toBeInTheDocument()
})
`
}
