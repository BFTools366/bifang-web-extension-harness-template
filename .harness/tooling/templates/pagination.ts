import type { ProjectConfig } from "../types.ts"
import { tsString } from "./helpers.ts"

// 保存 PAGINATION_SOURCE 变量供当前逻辑使用。
const PAGINATION_SOURCE = `import { useCallback, useEffect, useRef, useState } from "react"
import { BRAND } from "../brand"

export const PAGE_SIZES = [10, 20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export interface PageRequest {
  readonly page: number
  readonly pageSize: PageSize
}

export interface PageResult<Item> {
  readonly requestedPage: number
  readonly requestedPageSize: PageSize
  readonly items: readonly Item[]
  readonly total: number
}

export interface PageQueryState<Item> {
  readonly status: "pending" | "error" | "success"
  readonly isFetching: boolean
  readonly isPlaceholderData: boolean
  readonly result?: PageResult<Item>
}

export interface UseSessionPaginationOptions<Item> {
  readonly scope: string
  readonly query: PageQueryState<Item>
}

export interface SessionPagination {
  readonly request: Readonly<PageRequest>
  readonly storageKey: string
  readonly setPage: (page: number) => void
  readonly setPageSize: (pageSize: PageSize) => void
}

interface StoredPageRequest extends PageRequest {
  readonly version: 1
}

interface HookState {
  readonly storageKey: string
  readonly request: PageRequest
}

const DEFAULT_REQUEST: Readonly<PageRequest> = { page: 1, pageSize: 20 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

export function isPageSize(value: unknown): value is PageSize {
  return value === 10 || value === 20 || value === 50 || value === 100
}

export function paginationStorageKey(scope: string): string {
  const normalizedScope = scope.trim()
  if (normalizedScope.length === 0) throw new Error("Pagination scope must not be empty")
  return BRAND.id + ":pagination:v1:" + encodeURIComponent(normalizedScope)
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

function parseStoredRequest(raw: string | null): PageRequest {
  if (raw === null) return DEFAULT_REQUEST
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !isPositiveSafeInteger(value.page) ||
      !isPageSize(value.pageSize)
    ) {
      return DEFAULT_REQUEST
    }
    return { page: value.page, pageSize: value.pageSize }
  } catch {
    return DEFAULT_REQUEST
  }
}

function readStoredRequest(storageKey: string): PageRequest {
  try {
    return parseStoredRequest(sessionStorageOrUndefined()?.getItem(storageKey) ?? null)
  } catch {
    return DEFAULT_REQUEST
  }
}

function writeStoredRequest(storageKey: string, request: PageRequest): void {
  const record: StoredPageRequest = { version: 1, ...request }
  try {
    sessionStorageOrUndefined()?.setItem(storageKey, JSON.stringify(record))
  } catch {
    // Storage denial or quota exhaustion must not break navigation.
  }
}

export function createPageResult<Item>(
  request: Readonly<PageRequest>,
  items: readonly Item[],
  total: number
): PageResult<Item> {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Page result total must be a non-negative safe integer")
  }
  return {
    requestedPage: request.page,
    requestedPageSize: request.pageSize,
    items,
    total
  }
}

export function shouldReturnToFirstPage<Item>(
  request: Readonly<PageRequest>,
  query: Readonly<PageQueryState<Item>>
): boolean {
  const result = query.result
  return (
    request.page > 1 &&
    query.status === "success" &&
    !query.isFetching &&
    !query.isPlaceholderData &&
    result !== undefined &&
    result.requestedPage === request.page &&
    result.requestedPageSize === request.pageSize &&
    result.items.length === 0
  )
}

export function useSessionPagination<Item>({
  scope,
  query
}: UseSessionPaginationOptions<Item>): SessionPagination {
  const storageKey = paginationStorageKey(scope)
  const [hookState, setHookState] = useState<HookState>(() => ({
    storageKey,
    request: readStoredRequest(storageKey)
  }))
  const request =
    hookState.storageKey === storageKey ? hookState.request : readStoredRequest(storageKey)
  const requestRef = useRef(request)
  requestRef.current = request

  useEffect(() => {
    if (hookState.storageKey === storageKey) return
    setHookState({ storageKey, request: requestRef.current })
  }, [hookState.storageKey, storageKey])

  const commit = useCallback(
    (nextRequest: PageRequest) => {
      requestRef.current = nextRequest
      setHookState({ storageKey, request: nextRequest })
      writeStoredRequest(storageKey, nextRequest)
    },
    [storageKey]
  )

  const setPage = useCallback(
    (page: number) => {
      if (!isPositiveSafeInteger(page) || page === requestRef.current.page) return
      commit({ page, pageSize: requestRef.current.pageSize })
    },
    [commit]
  )

  const setPageSize = useCallback(
    (pageSize: PageSize) => {
      if (!isPageSize(pageSize) || pageSize === requestRef.current.pageSize) return
      commit({ page: 1, pageSize })
    },
    [commit]
  )

  useEffect(() => {
    if (!shouldReturnToFirstPage(request, query)) return
    commit({ page: 1, pageSize: request.pageSize })
  }, [commit, query, request])

  return { request, storageKey, setPage, setPageSize }
}
`

// 保存 PAGINATION_CONTROLS_SOURCE 变量供当前逻辑使用。
const PAGINATION_CONTROLS_SOURCE = `import { Group, Pagination, Select } from "@mantine/core"
import {
  PAGE_SIZES,
  isPageSize,
  type PageRequest,
  type PageSize
} from "./useSessionPagination"

export interface PaginationControlsLabels {
  readonly navigation: string
  readonly page: (page: number) => string
  readonly previous: string
  readonly next: string
  readonly pageSize: string
}

export interface PaginationControlsProps {
  readonly request: Readonly<PageRequest>
  readonly total: number
  readonly labels: PaginationControlsLabels
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (pageSize: PageSize) => void
  readonly disabled?: boolean
}

function normalizedTotal(total: number): number {
  return Number.isSafeInteger(total) && total >= 0 ? total : 0
}

export function PaginationControls({
  request,
  total,
  labels,
  onPageChange,
  onPageSizeChange,
  disabled = false
}: PaginationControlsProps) {
  const pageCount = Math.ceil(normalizedTotal(total) / request.pageSize)
  const visiblePageCount = pageCount === 0 ? 0 : Math.max(pageCount, request.page)

  return (
    <nav aria-label={labels.navigation}>
      <Group align="flex-end" justify="space-between" wrap="wrap">
        {visiblePageCount > 0 ? (
          <Pagination
            total={visiblePageCount}
            value={request.page}
            onChange={onPageChange}
            disabled={disabled}
            getItemProps={(page) => ({ "aria-label": labels.page(page) })}
            getControlProps={(control) => {
              if (control === "previous") return { "aria-label": labels.previous }
              if (control === "next") return { "aria-label": labels.next }
              return {}
            }}
          />
        ) : null}
        <Select
          label={labels.pageSize}
          value={String(request.pageSize)}
          data={PAGE_SIZES.map(String)}
          allowDeselect={false}
          disabled={disabled}
          onChange={(value) => {
            const pageSize = Number(value)
            if (isPageSize(pageSize)) onPageSizeChange(pageSize)
          }}
        />
      </Group>
    </nav>
  )
}
`

// 执行 paginationTest 函数的处理逻辑。
function paginationTest(config: ProjectConfig): string {
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
  type PageQueryState,
  type PageRequest
} from "./useSessionPagination"

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

  test.each(statesThatKeepPage)("does not return for %s state", (_name, query) => {
    expect(shouldReturnToFirstPage(request, query)).toBe(false)
  })

  test("keeps a successful empty first page", () => {
    const request: PageRequest = { page: 1, pageSize: 20 }
    const query = queryState<string>({
      status: "success",
      result: createPageResult(request, [], 0)
    })
    expect(shouldReturnToFirstPage(request, query)).toBe(false)
  })
})

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

// 执行 paginationFiles 函数的处理逻辑。
export function paginationFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    ["src/pagination/useSessionPagination.ts", PAGINATION_SOURCE],
    ["src/pagination/PaginationControls.tsx", PAGINATION_CONTROLS_SOURCE],
    ["src/pagination/pagination.test.tsx", paginationTest(config)]
  ])
}
