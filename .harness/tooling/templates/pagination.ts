import type { ProjectConfig } from "../types.ts"
import { listFiles } from "./list.ts"
import { paginationTest } from "./pagination-test.ts"

// 保存 PAGINATION_SOURCE 变量供当前逻辑使用。
const PAGINATION_SOURCE = `import { useCallback, useEffect, useRef, useState } from "react"
import { BRAND } from "../brand"
import { getWebStorage } from "../data/storage/webStorage"

/** 说明 PAGE_SIZES 的稳定结构与职责边界。 */
export const PAGE_SIZES = [10, 20, 50, 100] as const
/** 说明 PageSize 的稳定结构与职责边界。 */
export type PageSize = (typeof PAGE_SIZES)[number]

/** 说明 PageRequest 的稳定结构与职责边界。 */
export interface PageRequest {
  readonly page: number
  readonly pageSize: PageSize
}

/** 说明 PageResult 的稳定结构与职责边界。 */
export interface PageResult<Item> {
  readonly requestedPage: number
  readonly requestedPageSize: PageSize
  readonly items: readonly Item[]
  readonly total: number
}

/** 说明 PageQueryState 的稳定结构与职责边界。 */
export interface PageQueryState<Item> {
  readonly status: "pending" | "error" | "success"
  readonly isFetching: boolean
  readonly isPlaceholderData: boolean
  readonly result?: PageResult<Item>
}

/** 说明 UseSessionPaginationOptions 的稳定结构与职责边界。 */
export interface UseSessionPaginationOptions<Item> {
  readonly scope: string
  readonly query: PageQueryState<Item>
}

/** 说明 SessionPagination 的稳定结构与职责边界。 */
export interface SessionPagination {
  readonly request: Readonly<PageRequest>
  readonly storageKey: string
  readonly setPage: (page: number) => void
  readonly setPageSize: (pageSize: PageSize) => void
}

/** 说明 StoredPageRequest 的稳定结构与职责边界。 */
interface StoredPageRequest extends PageRequest {
  readonly version: 1
}

/** 说明 HookState 的稳定结构与职责边界。 */
interface HookState {
  readonly storageKey: string
  readonly request: PageRequest
}

const DEFAULT_REQUEST: Readonly<PageRequest> = { page: 1, pageSize: 20 }

/** 说明 isRecord 的稳定结构与职责边界。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** 说明 isPositiveSafeInteger 的稳定结构与职责边界。 */
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

/** 说明 isPageSize 的稳定结构与职责边界。 */
export function isPageSize(value: unknown): value is PageSize {
  return value === 10 || value === 20 || value === 50 || value === 100
}

/** 说明 paginationStorageKey 的稳定结构与职责边界。 */
export function paginationStorageKey(scope: string): string {
  const normalizedScope = scope.trim()
  if (normalizedScope.length === 0) throw new Error("Pagination scope must not be empty")
  return BRAND.id + ":pagination:v1:" + encodeURIComponent(normalizedScope)
}

/** 说明 parseStoredRequest 的稳定结构与职责边界。 */
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

/** 说明 readStoredRequest 的稳定结构与职责边界。 */
function readStoredRequest(storageKey: string): PageRequest {
  try {
    return parseStoredRequest(getWebStorage("session")?.getItem(storageKey) ?? null)
  } catch {
    return DEFAULT_REQUEST
  }
}

/** 说明 writeStoredRequest 的稳定结构与职责边界。 */
function writeStoredRequest(storageKey: string, request: PageRequest): void {
  const record: StoredPageRequest = { version: 1, ...request }
  try {
    getWebStorage("session")?.setItem(storageKey, JSON.stringify(record))
  } catch {
    // Storage denial or quota exhaustion must not break navigation.
  }
}

/** 说明 createPageResult 的稳定结构与职责边界。 */
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

/** 说明 shouldReturnToFirstPage 的稳定结构与职责边界。 */
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

/** 说明 useSessionPagination 的稳定结构与职责边界。 */
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
const PAGINATION_CONTROLS_SOURCE = `import { Group, Pagination, Select, Text } from "@mantine/core"
import classes from "./listSurface.module.css"
import {
  PAGE_SIZES,
  isPageSize,
  /** 说明 PageRequest 的稳定结构与职责边界。 */
  type PageRequest,
  /** 说明 PageSize 的稳定结构与职责边界。 */
  type PageSize
} from "./useSessionPagination"

/** 说明 PaginationControlsLabels 的稳定结构与职责边界。 */
export interface PaginationControlsLabels {
  readonly navigation: string
  readonly page: (page: number) => string
  readonly previous: string
  readonly next: string
  readonly pageSize: string
  readonly pageSizePlaceholder?: string
  readonly range?: (from: number, to: number, total: number) => string
}

/** 说明 PaginationControlsProps 的稳定结构与职责边界。 */
export interface PaginationControlsProps {
  readonly request: Readonly<PageRequest>
  readonly total: number
  readonly labels: PaginationControlsLabels
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (pageSize: PageSize) => void
  readonly disabled?: boolean
}

/** 说明 normalizedTotal 的稳定结构与职责边界。 */
function normalizedTotal(total: number): number {
  return Number.isSafeInteger(total) && total >= 0 ? total : 0
}

/** 说明 PaginationControls 的稳定结构与职责边界。 */
export function PaginationControls({
  request,
  total,
  labels,
  onPageChange,
  onPageSizeChange,
  disabled = false
}: PaginationControlsProps) {
  const pageCount = Math.ceil(normalizedTotal(total) / request.pageSize)
  const validPage = request.page <= Math.max(1, pageCount)

  return (
    <nav aria-label={labels.navigation} className={classes.footer}>
      <Group align="center" justify="space-between" wrap="wrap" gap="md">
        {labels.range && validPage && (
          <Text size="sm" c="dimmed" role="status">
            {labels.range(
              normalizedTotal(total) ? (request.page - 1) * request.pageSize + 1 : 0,
              Math.min(request.page * request.pageSize, normalizedTotal(total)),
              normalizedTotal(total)
            )}
          </Text>
        )}
        <div className={classes.controls}>
          <div className={classes.pageSize}>
            <Text component="span" size="sm" c="dimmed">
              {labels.pageSize}
            </Text>
            <Select
              aria-label={labels.pageSize}
              placeholder={labels.pageSizePlaceholder ?? labels.pageSize}
              value={String(request.pageSize)}
              data={PAGE_SIZES.map((value) => ({ value: String(value), label: String(value) }))}
              allowDeselect={false}
              disabled={disabled}
              w={80}
              size="sm"
              onChange={(value) => {
                const pageSize = Number(value)
                if (isPageSize(pageSize)) onPageSizeChange(pageSize)
              }}
            />
          </div>
          {pageCount > 0 && validPage ? (
            <Pagination
              total={pageCount}
              value={request.page}
              onChange={onPageChange}
              disabled={disabled}
              size="sm"
              getItemProps={(page) => ({ "aria-label": labels.page(page) })}
              getControlProps={(control) => {
                if (control === "previous") return { "aria-label": labels.previous }
                if (control === "next") return { "aria-label": labels.next }
                return {}
              }}
            />
          ) : null}
        </div>
      </Group>
    </nav>
  )
}
`

// 执行 paginationFiles 函数的处理逻辑。
export function paginationFiles(config: ProjectConfig): Map<string, string> {
  return new Map([
    ...listFiles(),
    ["src/pagination/useSessionPagination.ts", PAGINATION_SOURCE],
    ["src/pagination/PaginationControls.tsx", PAGINATION_CONTROLS_SOURCE],
    ["src/pagination/pagination.test.tsx", paginationTest(config)]
  ])
}
