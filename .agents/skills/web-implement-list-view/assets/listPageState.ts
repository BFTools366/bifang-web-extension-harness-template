/** 列表页允许的固定页大小集合。 */
export const PAGE_SIZES = [10, 20, 50, 100] as const

/** 未由产品指定时使用的默认页大小。 */
export const DEFAULT_PAGE_SIZE = 20 satisfies PageSize

const LIST_STATE_SCHEMA_VERSION = 1
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1

/** 列表页允许的页大小。 */
export type PageSize = (typeof PAGE_SIZES)[number]

/** 服务端排序方向。 */
export type SortDirection = "asc" | "desc"

/** 列表行的稳定业务标识。 */
export type BusinessId = string | number

/** 列表行在单页和跨页都必须保持一致的业务标识类型。 */
export type BusinessIdType = "string" | "number"

/** 自动纠正的来源与目标指纹，用于抑制重复 replace。 */
export interface ListCorrectionClaim {
  source: string
  target: string
}

/** 列表当前排序；null 表示采用服务端声明的稳定默认顺序。 */
export type SortState<TSortField extends string> = {
  field: TSortField
  direction: SortDirection
} | null

/** URL、会话和查询共同使用的规范化列表状态。 */
export interface ListQueryState<TSortField extends string, TFilters> {
  page: number
  pageSize: PageSize
  sort: SortState<TSortField>
  filters: TFilters
}

/** 服务端页码式列表响应。 */
export interface ListPageResponse<TRow> {
  items: readonly TRow[]
  totalItems: number
}

/** 负责把具体业务查询状态解析、规范化和序列化的边界接口。 */
export interface ListStateCodec<TSortField extends string, TFilters> {
  ownedKeys: readonly string[]
  defaults: Pick<ListQueryState<TSortField, TFilters>, "sort" | "filters"> & {
    pageSize?: PageSize
  }
  parseUnknown(value: unknown): Partial<ListQueryState<TSortField, TFilters>>
  serialize(
    value: ListQueryState<TSortField, TFilters>
  ): Readonly<Record<string, string | undefined>>
  normalizeFilters(value: TFilters): TFilters
}

/** 列的窄屏职责；primary、status 和 actions 在窄屏都必须可达。 */
export type ListColumnResponsiveRole = "primary" | "status" | "actions" | "secondary"

/** 不依赖 React 的列契约，供运行时校验和偏好迁移复用。 */
export interface ListColumnContract<TColumnId extends string, TSortField extends string> {
  id: TColumnId
  accessibleName: string
  sortField?: TSortField
  required?: boolean
  defaultVisible?: boolean
  responsiveRole?: ListColumnResponsiveRole
  hideBelow?: "xs" | "sm" | "md" | "lg" | "xl"
}

/** 持久化的列顺序与显隐偏好；schemaVersion 只属于 payload。 */
export interface ColumnPreferences<TColumnId extends string> {
  schemaVersion: number
  order: readonly TColumnId[]
  hidden: readonly TColumnId[]
}

/** 浏览器 Storage 所需的最小接口，便于隔离测试。 */
export interface ListStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 返回 SSR/安全异常下可选的浏览器列表存储。 */
export function getBrowserListStorage(kind: "session" | "local"): ListStorage | undefined {
  try {
    if (typeof window === "undefined") return undefined
    return kind === "session" ? window.sessionStorage : window.localStorage
  } catch {
    return undefined
  }
}

/** 列 schema 变化时由具体列表提供的显式迁移函数。 */
export type ColumnPreferencesMigration<
  TColumnId extends string,
  TSortField extends string
> = (input: {
  raw: unknown
  fromVersion: number | undefined
  toVersion: number
  columns: readonly ListColumnContract<TColumnId, TSortField>[]
}) => unknown

/** 初始状态的来源与规范 URL，用于路由在首次请求前执行一次 replace。 */
export interface ResolvedInitialListState<TSortField extends string, TFilters> {
  state: ListQueryState<TSortField, TFilters>
  source: "url" | "session" | "defaults"
  canonicalSearch: Readonly<Record<string, string | undefined>>
}

/** 校验并解析页大小白名单。 */
export function parsePageSize(value: unknown): PageSize | undefined {
  const numeric = typeof value === "string" ? Number(value) : value
  return PAGE_SIZES.find((size) => size === numeric)
}

/** 解析不会导致 offset 超出安全整数范围的 1-based 页码。 */
export function parsePage(value: unknown): number | undefined {
  const numeric = typeof value === "string" ? Number(value) : value
  return typeof numeric === "number" &&
    Number.isSafeInteger(numeric) &&
    numeric >= 1 &&
    numeric <= MAX_PAGE
    ? numeric
    : undefined
}

/** 根据可信总页数返回需要 replace 的纠正页码。 */
export function getCorrectedPage(page: number, totalPages: number): number | undefined {
  if (totalPages === 0) return page === 1 ? undefined : 1
  return page > totalPages ? totalPages : undefined
}

/** 认领一次来源到目标的自动纠正；相同 claim 只导航一次。 */
export function claimListCorrection(
  current: ListCorrectionClaim | undefined,
  source: string,
  target: string
): { claim: ListCorrectionClaim; shouldNavigate: boolean } {
  if (current?.source === source && current.target === target) {
    return { claim: current, shouldNavigate: false }
  }
  return {
    claim: { source, target },
    shouldNavigate: true
  }
}

/** 仅当来源已变化时释放 claim，保留同来源短暂 fetching 期间的去重。 */
export function releaseListCorrection(
  current: ListCorrectionClaim | undefined,
  source: string
): ListCorrectionClaim | undefined {
  return current?.source === source ? current : undefined
}

/** 计算 asc→desc→none 的固定排序循环。 */
export function nextSort<TSortField extends string>(
  current: SortState<TSortField>,
  field: TSortField
): SortState<TSortField> {
  if (current?.field !== field) return { field, direction: "asc" }
  if (current.direction === "asc") return { field, direction: "desc" }
  return null
}

/** 为 string/number 业务 id 生成无类型碰撞的 React key。 */
export function getBusinessIdKey(id: BusinessId): string {
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id)) {
      throw new Error("Invalid list response: numeric business id must be a safe integer")
    }
    return `number:${id}`
  }
  if (id.trim().length === 0) {
    throw new Error("Invalid list response: string business id must not be blank")
  }
  return `string:${id}`
}

/** 校验响应之外的选择 id 也遵守列表唯一业务 id 类型和值域。 */
export function validateBusinessIds(ids: Iterable<BusinessId>, expectedType: BusinessIdType): void {
  for (const id of ids) {
    if (typeof id !== expectedType) {
      throw new Error(`ListPage selection requires ${expectedType} business ids`)
    }
    getBusinessIdKey(id)
  }
}

/** 构造按列表和非 PII 结果 scope 隔离的当前标签页会话键。 */
export function buildListSessionKey(
  appNamespace: string,
  listId: string,
  cacheScope: string
): string {
  return `${appNamespace}:list-state:${encodeURIComponent(listId)}:${encodeURIComponent(cacheScope)}:v${LIST_STATE_SCHEMA_VERSION}`
}

/** 构造跨列 schema 稳定的偏好键；版本只保存在 payload 以支持迁移。 */
export function buildColumnPreferencesKey(
  appNamespace: string,
  listId: string,
  columnPreferenceScope: string
): string {
  return `${appNamespace}:list-columns:${encodeURIComponent(listId)}:${encodeURIComponent(columnPreferenceScope)}`
}

/** 判断未经默认值填充的原始 URL 是否显式包含任一本列表 key。 */
export function hasOwnedUrlKey(rawUrlPresence: unknown, ownedKeys: readonly string[]): boolean {
  if (rawUrlPresence instanceof URLSearchParams) {
    return ownedKeys.some((key) => rawUrlPresence.has(key))
  }
  if (typeof rawUrlPresence !== "object" || rawUrlPresence === null) return false
  return ownedKeys.some((key) => Object.prototype.hasOwnProperty.call(rawUrlPresence, key))
}

/** 捕获业务 codec 的异常，避免畸形 URL 或存储值击穿页面。 */
function safeParseUnknown<TSortField extends string, TFilters>(
  codec: ListStateCodec<TSortField, TFilters>,
  value: unknown
): Partial<ListQueryState<TSortField, TFilters>> {
  try {
    const parsed = codec.parseUnknown(value)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/** 以默认值和白名单把局部状态收敛为唯一运行时形态。 */
export function normalizeListState<TSortField extends string, TFilters>(
  partial: Partial<ListQueryState<TSortField, TFilters>>,
  codec: ListStateCodec<TSortField, TFilters>
): ListQueryState<TSortField, TFilters> {
  const filters = partial.filters ?? codec.defaults.filters
  return {
    page: parsePage(partial.page) ?? 1,
    pageSize: parsePageSize(partial.pageSize) ?? codec.defaults.pageSize ?? DEFAULT_PAGE_SIZE,
    sort: partial.sort === undefined ? codec.defaults.sort : partial.sort,
    filters: codec.normalizeFilters(filters)
  }
}

/** 安全读取会话快照；损坏值会被删除而不是反复解析。 */
function readListSessionState<TSortField extends string, TFilters>(input: {
  storage: ListStorage | undefined
  key: string
  codec: ListStateCodec<TSortField, TFilters>
}): Partial<ListQueryState<TSortField, TFilters>> | undefined {
  if (input.storage === undefined) return undefined
  try {
    const serialized = input.storage.getItem(input.key)
    if (serialized === null) return undefined
    const parsed: unknown = JSON.parse(serialized)
    return safeParseUnknown(input.codec, parsed)
  } catch {
    try {
      input.storage.removeItem(input.key)
    } catch {
      // Storage 不可写时只忽略快照，列表仍可用默认状态启动。
    }
    return undefined
  }
}

/** 解析初始列表状态，并返回路由需要原子 replace 的规范搜索参数。 */
export function resolveInitialListLocation<TSortField extends string, TFilters>(input: {
  rawUrlPresence: unknown
  urlSearch: unknown
  sessionStorage?: ListStorage
  sessionKey: string
  codec: ListStateCodec<TSortField, TFilters>
}): ResolvedInitialListState<TSortField, TFilters> {
  const explicitUrl = hasOwnedUrlKey(input.rawUrlPresence, input.codec.ownedKeys)
  const sessionPartial = explicitUrl
    ? undefined
    : readListSessionState({
        storage: input.sessionStorage,
        key: input.sessionKey,
        codec: input.codec
      })
  const source = explicitUrl ? "url" : sessionPartial === undefined ? "defaults" : "session"
  const partial = explicitUrl
    ? safeParseUnknown(input.codec, input.urlSearch)
    : (sessionPartial ?? {})
  const state = normalizeListState(partial, input.codec)
  const serialized = input.codec.serialize(state)
  return {
    state,
    source,
    canonicalSearch: Object.fromEntries(input.codec.ownedKeys.map((key) => [key, serialized[key]]))
  }
}

/** 保留旧调用方式，只返回规范状态；新路由应优先使用 resolveInitialListLocation。 */
export function resolveInitialListState<TSortField extends string, TFilters>(input: {
  rawUrlSearch: unknown
  sessionKey: string
  codec: ListStateCodec<TSortField, TFilters>
  sessionStorage?: ListStorage
}): ListQueryState<TSortField, TFilters> {
  return resolveInitialListLocation({
    rawUrlPresence: input.rawUrlSearch,
    urlSearch: input.rawUrlSearch,
    sessionStorage: input.sessionStorage,
    sessionKey: input.sessionKey,
    codec: input.codec
  }).state
}

/** 原子合并本列表拥有的搜索参数，同时保留同一路由其他功能的参数。 */
export function mergeOwnedListSearch(
  current: Readonly<Record<string, unknown>>,
  ownedKeys: readonly string[],
  canonical: Readonly<Record<string, string | undefined>>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current }
  for (const key of ownedKeys) delete next[key]
  for (const key of ownedKeys) {
    const value = canonical[key]
    if (value !== undefined) next[key] = value
  }
  return next
}

/** 判断列表拥有的 URL 字段是否已经等于规范序列化结果。 */
export function isOwnedListSearchCanonical(
  current: Readonly<Record<string, unknown>>,
  ownedKeys: readonly string[],
  canonical: Readonly<Record<string, string | undefined>>
): boolean {
  return ownedKeys.every((key) => {
    const expected = canonical[key]
    const actual = current[key]
    if (expected === undefined) return actual === undefined
    return actual !== undefined && String(actual) === expected
  })
}

/** 把规范列表状态写入当前标签页；写入失败不阻断查询。 */
export function writeListSessionState<TSortField extends string, TFilters>(
  storage: ListStorage | undefined,
  key: string,
  state: ListQueryState<TSortField, TFilters>,
  codec: ListStateCodec<TSortField, TFilters>
): void {
  if (storage === undefined) return
  try {
    storage.setItem(key, JSON.stringify(codec.serialize(state)))
  } catch {
    // Storage 不可用时仍允许列表工作；调用方可接入脱敏诊断日志。
  }
}

/** 校验列 schema 中会破坏 key、排序或窄屏可达性的配置错误。 */
export function validateColumnContracts<TColumnId extends string, TSortField extends string>(
  columns: readonly ListColumnContract<TColumnId, TSortField>[]
): void {
  if (columns.length === 0) {
    throw new Error("ListPage requires at least one column")
  }
  const columnIds = columns.map((column) => column.id)
  if (columnIds.some((id) => id.trim().length === 0)) {
    throw new Error("ListPage requires non-empty column ids")
  }
  if (columns.some((column) => column.accessibleName.trim().length === 0)) {
    throw new Error("ListPage requires non-empty column accessible names")
  }
  if (new Set(columnIds).size !== columnIds.length) {
    throw new Error("ListPage requires unique column ids")
  }
  const primaryColumns = columns.filter((column) => column.responsiveRole === "primary")
  if (primaryColumns.length !== 1) {
    throw new Error("ListPage requires exactly one primary business column")
  }
  const essentialColumns = columns.filter(
    (column) =>
      column.responsiveRole === "primary" ||
      column.responsiveRole === "status" ||
      column.responsiveRole === "actions"
  )
  if (
    essentialColumns.some((column) => column.required !== true || column.hideBelow !== undefined)
  ) {
    throw new Error(
      "ListPage requires primary, status and actions columns to remain visible on narrow screens"
    )
  }
  if (columns.some((column) => column.required === true && column.hideBelow !== undefined)) {
    throw new Error("ListPage required columns cannot declare hideBelow")
  }
  const sortFields = columns
    .map((column) => column.sortField)
    .filter((field): field is TSortField => field !== undefined)
  if (sortFields.some((field) => field.trim().length === 0)) {
    throw new Error("ListPage requires non-empty sort fields")
  }
  if (new Set(sortFields).size !== sortFields.length) {
    throw new Error("ListPage requires each sort field to belong to exactly one column")
  }
}

/** 由列 schema 生成首次使用或迁移失败后的安全默认偏好。 */
export function defaultColumnPreferences<TColumnId extends string, TSortField extends string>(
  columns: readonly ListColumnContract<TColumnId, TSortField>[],
  schemaVersion: number
): ColumnPreferences<TColumnId> {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("columnSchemaVersion must be a positive safe integer")
  }
  validateColumnContracts(columns)
  return {
    schemaVersion,
    order: columns.map((column) => column.id),
    hidden: columns
      .filter((column) => column.defaultVisible === false && column.required !== true)
      .map((column) => column.id)
  }
}

/** 把任意版本 payload 迁移并收敛为当前列 schema。 */
export function reconcileColumnPreferences<TColumnId extends string, TSortField extends string>(
  raw: unknown,
  columns: readonly ListColumnContract<TColumnId, TSortField>[],
  schemaVersion: number,
  migrate?: ColumnPreferencesMigration<TColumnId, TSortField>
): ColumnPreferences<TColumnId> {
  const defaults = defaultColumnPreferences(columns, schemaVersion)
  let candidateRaw = raw
  const fromVersion =
    typeof raw === "object" && raw !== null
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined
  if (fromVersion !== schemaVersion) {
    if (migrate === undefined) return defaults
    try {
      candidateRaw = migrate({
        raw,
        fromVersion:
          typeof fromVersion === "number" && Number.isSafeInteger(fromVersion)
            ? fromVersion
            : undefined,
        toVersion: schemaVersion,
        columns
      })
    } catch {
      return defaults
    }
  }
  if (typeof candidateRaw !== "object" || candidateRaw === null) return defaults
  const candidate = candidateRaw as {
    schemaVersion?: unknown
    order?: unknown
    hidden?: unknown
  }
  if (candidate.schemaVersion !== schemaVersion) return defaults
  const knownIds = new Set<string>(columns.map((column) => column.id))
  const requiredIds = new Set<string>(
    columns.filter((column) => column.required === true).map((column) => column.id)
  )
  const order = Array.isArray(candidate.order)
    ? candidate.order.filter(
        (id, position, all): id is TColumnId =>
          typeof id === "string" && knownIds.has(id) && all.indexOf(id) === position
      )
    : []
  for (const column of columns) {
    if (!order.includes(column.id)) order.push(column.id)
  }
  const hidden = Array.isArray(candidate.hidden)
    ? candidate.hidden.filter(
        (id, position, all): id is TColumnId =>
          typeof id === "string" &&
          knownIds.has(id) &&
          !requiredIds.has(id) &&
          all.indexOf(id) === position
      )
    : [...defaults.hidden]
  return { schemaVersion, order, hidden }
}

/** 从稳定键或旧键读取列偏好，迁移成功后写回稳定键并清理旧键。 */
export function loadColumnPreferences<TColumnId extends string, TSortField extends string>(input: {
  storage: ListStorage | undefined
  key: string
  legacyKeys?: readonly string[]
  columns: readonly ListColumnContract<TColumnId, TSortField>[]
  schemaVersion: number
  migrate?: ColumnPreferencesMigration<TColumnId, TSortField>
}): ColumnPreferences<TColumnId> {
  const defaults = defaultColumnPreferences(input.columns, input.schemaVersion)
  if (input.storage === undefined) return defaults
  const legacyKeys = [...new Set((input.legacyKeys ?? []).filter((key) => key !== input.key))]
  const keys = [input.key, ...legacyKeys]
  for (const key of keys) {
    let serialized: string | null
    try {
      serialized = input.storage.getItem(key)
    } catch {
      return defaults
    }
    if (serialized === null) continue
    let raw: unknown
    try {
      raw = JSON.parse(serialized)
    } catch {
      try {
        input.storage.removeItem(key)
      } catch {
        // 清理失败不阻止继续尝试旧键或重写默认偏好。
      }
      continue
    }
    const preferences = reconcileColumnPreferences(
      raw,
      input.columns,
      input.schemaVersion,
      input.migrate
    )
    try {
      input.storage.setItem(input.key, JSON.stringify(preferences))
    } catch {
      // 有效偏好已经读取；回写失败不能把它降级为默认值。
    }
    for (const legacyKey of legacyKeys) {
      try {
        input.storage.removeItem(legacyKey)
      } catch {
        // 单个旧键清理失败不影响偏好读取或其他旧键的清理。
      }
    }
    return preferences
  }
  try {
    input.storage.setItem(input.key, JSON.stringify(defaults))
  } catch {
    // Storage 不可写时仍返回安全默认值。
  }
  for (const legacyKey of legacyKeys) {
    try {
      input.storage.removeItem(legacyKey)
    } catch {
      // 单个旧键清理失败不影响默认偏好或其他旧键的清理。
    }
  }
  return defaults
}

/** 持久化已经规范化的列偏好；失败时保留组件内状态。 */
export function writeColumnPreferences<TColumnId extends string>(
  storage: ListStorage | undefined,
  key: string,
  value: ColumnPreferences<TColumnId>
): void {
  if (storage === undefined) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage 不可用时保留内存设置，不阻断列表工作。
  }
}

/** 验证服务端响应的数量、页边界和业务 id 是否自洽。 */
export function validatePageResponse<TRow, TId extends BusinessId>(
  response: ListPageResponse<TRow>,
  page: number,
  pageSize: PageSize,
  getRowId: (row: TRow) => TId,
  expectedIdType?: BusinessIdType
): ListPageResponse<TRow> {
  if (parsePage(page) !== page) {
    throw new Error("Invalid list request: page must be a positive safe integer")
  }
  if (parsePageSize(pageSize) !== pageSize) {
    throw new Error("Invalid list request: pageSize must be an allowed safe integer")
  }
  if (!Array.isArray(response.items)) {
    throw new Error("Invalid list response: items must be an array")
  }
  if (!Number.isSafeInteger(response.totalItems) || response.totalItems < 0) {
    throw new Error("Invalid list response: totalItems must be a non-negative safe integer")
  }
  if (response.items.length > pageSize) {
    throw new Error("Invalid list response: page contains more items than pageSize")
  }
  if (response.items.length > response.totalItems) {
    throw new Error("Invalid list response: page contains more items than totalItems")
  }
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset)) {
    throw new Error("Invalid list request: offset exceeds the safe integer range")
  }
  const remainingItems = Math.max(0, response.totalItems - offset)
  if (response.items.length > remainingItems) {
    throw new Error("Invalid list response: page items exceed the remaining total")
  }
  const expectedItems = Math.min(pageSize, remainingItems)
  if (offset < response.totalItems && response.items.length !== expectedItems) {
    throw new Error("Invalid list response: page length does not match the trusted totalItems")
  }
  const rowKeys = new Set<string>()
  let pageIdType: BusinessIdType | undefined
  for (const row of response.items) {
    const id = getRowId(row)
    const idType = typeof id
    if (idType !== "string" && idType !== "number") {
      throw new Error("Invalid list response: business id must be a string or number")
    }
    if (pageIdType !== undefined && pageIdType !== idType) {
      throw new Error("Invalid list response: business id type must be consistent within a page")
    }
    if (expectedIdType !== undefined && expectedIdType !== idType) {
      throw new Error(`Invalid list response: expected ${expectedIdType} business ids`)
    }
    pageIdType = idType
    const key = getBusinessIdKey(id)
    if (rowKeys.has(key)) {
      throw new Error("Invalid list response: duplicate business id")
    }
    rowKeys.add(key)
  }
  return response
}

/** 生成不含页码的查询指纹，限定 placeholder 只能用于纯翻页。 */
export function buildBaseQueryFingerprint<TSortField extends string, TFilters>(input: {
  listId: string
  cacheScope: string
  filters: TFilters
  sort: SortState<TSortField>
  pageSize: PageSize
}): string {
  return JSON.stringify([
    "list",
    input.listId,
    input.cacheScope,
    input.filters,
    input.sort,
    input.pageSize
  ])
}

/** 计算当前成功页的可见结果区间。 */
export function getResultRange(input: {
  page: number
  pageSize: PageSize
  itemCount: number
  totalItems: number
}): { start: number; end: number; total: number } {
  if (input.itemCount === 0 || input.totalItems === 0) {
    return { start: 0, end: 0, total: input.totalItems }
  }
  const start = (input.page - 1) * input.pageSize + 1
  return {
    start,
    end: Math.min(input.totalItems, start + input.itemCount - 1),
    total: input.totalItems
  }
}

/** 同页刷新后仅保留仍存在于当前成功响应中的 current-page 选择。 */
export function pruneCurrentPageSelection<TId extends BusinessId>(
  selectedIds: ReadonlySet<TId>,
  currentIds: readonly TId[]
): ReadonlySet<TId> {
  const current = new Set(currentIds)
  const next = new Set([...selectedIds].filter((id) => current.has(id)))
  if (next.size === selectedIds.size && [...next].every((id) => selectedIds.has(id))) {
    return selectedIds
  }
  return next
}

/** 渲染期同步屏蔽失效选择，避免 effect 回写前暴露旧页批量动作。 */
export function getEffectiveCurrentPageSelection<TId extends BusinessId>(input: {
  selectedIds: ReadonlySet<TId>
  currentIds: readonly TId[]
  unsafe: boolean
}): ReadonlySet<TId> {
  if (input.unsafe) {
    return input.selectedIds.size === 0 ? input.selectedIds : new Set<TId>()
  }
  return pruneCurrentPageSelection(input.selectedIds, input.currentIds)
}

/** 以互斥状态优先级生成页面唯一 live region 的播报文本。 */
export function buildListPageAnnouncement(input: {
  isPending: boolean
  isCorrecting: boolean
  isEmpty: boolean
  hasActiveFilters: boolean
  isFetching: boolean
  loading: string
  correcting: string
  noResults: string
  noData: string
  refreshing: string
  resultSummary?: string
  selectionSummary?: string
}): string {
  const primary =
    input.isPending || input.isCorrecting
      ? input.isCorrecting
        ? input.correcting
        : input.loading
      : input.isEmpty
        ? input.hasActiveFilters
          ? input.noResults
          : input.noData
        : input.isFetching
          ? input.refreshing
          : input.resultSummary
  return [primary, input.selectionSummary]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(" ")
}
