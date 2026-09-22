import assert from "node:assert/strict"
import {
  buildListPageAnnouncement,
  buildColumnPreferencesKey,
  claimListCorrection,
  getBusinessIdKey,
  getCorrectedPage,
  getBrowserListStorage,
  getEffectiveCurrentPageSelection,
  isOwnedListSearchCanonical,
  loadColumnPreferences,
  mergeOwnedListSearch,
  nextSort,
  parsePage,
  parsePageSize,
  pruneCurrentPageSelection,
  reconcileColumnPreferences,
  releaseListCorrection,
  resolveInitialListLocation,
  validateColumnContracts,
  validateBusinessIds,
  validatePageResponse,
  type ListColumnContract,
  type PageSize,
  type ListStateCodec,
  type ListStorage
} from "./listPageState.ts"

/** 契约测试允许服务端排序的字段。 */
type SortField = "amount" | "createdAt"
/** 契约测试使用的规范化筛选结构。 */
type Filters = { q: string }
/** 契约测试使用的稳定列标识。 */
type ColumnId = "id" | "amount" | "createdAt"

/** 为契约测试提供不接触用户浏览器数据的内存 Storage。 */
class MemoryStorage implements ListStorage {
  readonly values = new Map<string, string>()
  readonly setAttempts: string[] = []
  readonly removeAttempts: string[] = []
  readonly failures: {
    getItem?: boolean
    setItem?: boolean
    removeItem?: boolean
  }

  /** 创建可按操作注入失败的隔离存储。 */
  constructor(
    failures: {
      getItem?: boolean
      setItem?: boolean
      removeItem?: boolean
    } = {}
  ) {
    this.failures = failures
  }

  /** 读取测试隔离存储中的值。 */
  getItem(key: string): string | null {
    if (this.failures.getItem) throw new Error("configured getItem failure")
    return this.values.get(key) ?? null
  }

  /** 写入测试隔离存储中的值。 */
  setItem(key: string, value: string): void {
    this.setAttempts.push(key)
    if (this.failures.setItem) throw new Error("configured setItem failure")
    this.values.set(key, value)
  }

  /** 删除损坏或已迁移的测试值。 */
  removeItem(key: string): void {
    this.removeAttempts.push(key)
    if (this.failures.removeItem) {
      throw new Error("configured removeItem failure")
    }
    this.values.delete(key)
  }
}

/** 从测试存储读取必需值，并在缺失时给出明确失败。 */
function requiredStoredValue(storage: ListStorage, key: string): string {
  const value = storage.getItem(key)
  if (value === null) throw new Error(`Missing required test storage value: ${key}`)
  return value
}

const codec: ListStateCodec<SortField, Filters> = {
  ownedKeys: ["page", "pageSize", "sort", "q"],
  defaults: { sort: null, filters: { q: "" } },
  /** 从未知 URL 或存储输入中提取当前测试接受的列表字段。 */
  parseUnknown(value) {
    if (typeof value !== "object" || value === null) return {}
    const input = value as Record<string, unknown>
    const parsed: ReturnType<typeof codec.parseUnknown> = {}
    if (input.page !== undefined) parsed.page = Number(input.page)
    if (input.pageSize !== undefined) {
      parsed.pageSize = Number(input.pageSize) as 20
    }
    if (typeof input.q === "string") parsed.filters = { q: input.q }
    return parsed
  },
  /** 将规范列表状态序列化为 Router search 字段。 */
  serialize(value) {
    return {
      page: String(value.page),
      pageSize: String(value.pageSize),
      sort: value.sort ? `${value.sort.field}.${value.sort.direction}` : undefined,
      q: value.filters.q
    }
  },
  /** 清理搜索词并限制持久化长度。 */
  normalizeFilters(value) {
    return { q: value.q.trim().slice(0, 100) }
  }
}

const columns: readonly ListColumnContract<ColumnId, SortField>[] = [
  {
    id: "id",
    accessibleName: "ID",
    required: true,
    responsiveRole: "primary"
  },
  {
    id: "amount",
    accessibleName: "Amount",
    sortField: "amount",
    responsiveRole: "secondary"
  },
  {
    id: "createdAt",
    accessibleName: "Created",
    sortField: "createdAt",
    responsiveRole: "secondary"
  }
]

/** 覆盖模板最容易回归的解析、迁移、响应和选择纯函数契约。 */
function runListPageContractTests(): void {
  assert.equal(getBrowserListStorage("session"), undefined)
  assert.equal(parsePageSize("100"), 100)
  assert.equal(parsePageSize(25), undefined)
  assert.equal(parsePage("1e308"), undefined)
  assert.equal(parsePage(Number.MAX_SAFE_INTEGER), undefined)
  assert.equal(getCorrectedPage(5, 3), 3)
  assert.equal(getCorrectedPage(2, 0), 1)
  assert.deepEqual(
    [
      ...getEffectiveCurrentPageSelection({
        selectedIds: new Set(["a", "stale"]),
        currentIds: ["a", "b"],
        unsafe: false
      })
    ],
    ["a"]
  )
  assert.equal(
    getEffectiveCurrentPageSelection({
      selectedIds: new Set(["a"]),
      currentIds: ["a"],
      unsafe: true
    }).size,
    0
  )
  assert.equal(
    buildListPageAnnouncement({
      isPending: false,
      isCorrecting: false,
      isEmpty: false,
      hasActiveFilters: false,
      isFetching: true,
      loading: "Loading",
      correcting: "Correcting",
      noResults: "No results",
      noData: "No data",
      refreshing: "Refreshing",
      resultSummary: "1–20 of 40",
      selectionSummary: "2 selected"
    }),
    "Refreshing 2 selected"
  )
  const firstCorrection = claimListCorrection(undefined, "orders:page:5", "orders:page:3")
  assert.deepEqual(firstCorrection, {
    claim: { source: "orders:page:5", target: "orders:page:3" },
    shouldNavigate: true
  })
  const retainedCorrection = releaseListCorrection(firstCorrection.claim, "orders:page:5")
  assert.equal(retainedCorrection, firstCorrection.claim)
  assert.deepEqual(claimListCorrection(retainedCorrection, "orders:page:5", "orders:page:3"), {
    claim: firstCorrection.claim,
    shouldNavigate: false
  })
  assert.equal(releaseListCorrection(firstCorrection.claim, "orders:page:3"), undefined)
  assert.equal(
    claimListCorrection(firstCorrection.claim, "orders:page:5", "orders:page:2").shouldNavigate,
    true
  )
  assert.deepEqual(nextSort<SortField>(null, "amount"), {
    field: "amount",
    direction: "asc"
  })
  assert.deepEqual(nextSort<SortField>({ field: "amount", direction: "asc" }, "amount"), {
    field: "amount",
    direction: "desc"
  })
  assert.equal(nextSort<SortField>({ field: "amount", direction: "desc" }, "amount"), null)

  const sessionStorage = new MemoryStorage()
  const sessionKey = "app:list-state:orders:public:v1"
  sessionStorage.setItem(sessionKey, JSON.stringify({ page: 3, pageSize: 50, q: " saved " }))
  const restored = resolveInitialListLocation({
    rawUrlPresence: new URLSearchParams(),
    urlSearch: {},
    sessionStorage,
    sessionKey,
    codec
  })
  assert.equal(restored.source, "session")
  assert.deepEqual(restored.state, {
    page: 3,
    pageSize: 50,
    sort: null,
    filters: { q: "saved" }
  })
  const explicitUrl = resolveInitialListLocation({
    rawUrlPresence: new URLSearchParams("page=invalid"),
    urlSearch: { page: "invalid" },
    sessionStorage,
    sessionKey,
    codec
  })
  assert.equal(explicitUrl.source, "url")
  assert.equal(explicitUrl.state.page, 1)
  assert.equal(explicitUrl.state.pageSize, 20)
  const parserFailure = resolveInitialListLocation({
    rawUrlPresence: new URLSearchParams("page=2"),
    urlSearch: { page: "2" },
    sessionKey,
    codec: {
      ...codec,
      /** 模拟业务 parser 抛错，验证初始化仍安全回退。 */
      parseUnknown() {
        throw new Error("malformed input")
      }
    }
  })
  assert.equal(parserFailure.source, "url")
  assert.equal(parserFailure.state.page, 1)
  const plainObjectUrl = resolveInitialListLocation({
    rawUrlPresence: { q: " url " },
    urlSearch: { q: " url " },
    sessionStorage,
    sessionKey,
    codec
  })
  assert.equal(plainObjectUrl.source, "url")
  assert.deepEqual(plainObjectUrl.state, {
    page: 1,
    pageSize: 20,
    sort: null,
    filters: { q: "url" }
  })
  const unrelatedPlainObjectUrl = resolveInitialListLocation({
    rawUrlPresence: { modal: "details" },
    urlSearch: { page: 9, q: "router default" },
    sessionStorage,
    sessionKey,
    codec
  })
  assert.equal(unrelatedPlainObjectUrl.source, "session")
  assert.deepEqual(unrelatedPlainObjectUrl.state, restored.state)

  const merged = mergeOwnedListSearch(
    { page: 9, modal: "details" },
    codec.ownedKeys,
    explicitUrl.canonicalSearch
  )
  assert.equal(merged.modal, "details")
  assert.equal(merged.page, "1")
  assert.equal(
    isOwnedListSearchCanonical(merged, codec.ownedKeys, explicitUrl.canonicalSearch),
    true
  )
  assert.equal(
    mergeOwnedListSearch({ modal: "details", injected: "preserved" }, codec.ownedKeys, {
      ...explicitUrl.canonicalSearch,
      injected: "blocked"
    }).injected,
    "preserved"
  )

  const stablePreferenceKey = buildColumnPreferencesKey("app", "orders", "user-a")
  const localStorage = new MemoryStorage()
  localStorage.setItem(
    stablePreferenceKey,
    JSON.stringify({ schemaVersion: 1, order: ["amount", "id"], hidden: [] })
  )
  const migrated = loadColumnPreferences({
    storage: localStorage,
    key: stablePreferenceKey,
    columns,
    schemaVersion: 2,
    migrate: ({ raw }) => ({
      ...(raw as object),
      schemaVersion: 2
    })
  })
  assert.equal(migrated.schemaVersion, 2)
  assert.deepEqual(migrated.order, ["amount", "id", "createdAt"])
  const legacyKey = `${stablePreferenceKey}:v1`
  const legacyStorage = new MemoryStorage()
  legacyStorage.setItem(
    legacyKey,
    JSON.stringify({ schemaVersion: 1, order: ["createdAt", "id"], hidden: [] })
  )
  const legacyMigrated = loadColumnPreferences({
    storage: legacyStorage,
    key: stablePreferenceKey,
    legacyKeys: [legacyKey],
    columns,
    schemaVersion: 2,
    migrate: ({ raw }) => ({ ...(raw as object), schemaVersion: 2 })
  })
  assert.deepEqual(legacyMigrated.order, ["createdAt", "id", "amount"])
  assert.equal(legacyStorage.getItem(legacyKey), null)
  assert.notEqual(legacyStorage.getItem(stablePreferenceKey), null)
  const selfKeyStorage = new MemoryStorage()
  selfKeyStorage.setItem(
    stablePreferenceKey,
    JSON.stringify({ schemaVersion: 2, order: ["id"], hidden: [] })
  )
  loadColumnPreferences({
    storage: selfKeyStorage,
    key: stablePreferenceKey,
    legacyKeys: [stablePreferenceKey],
    columns,
    schemaVersion: 2
  })
  assert.notEqual(selfKeyStorage.getItem(stablePreferenceKey), null)
  localStorage.setItem(stablePreferenceKey, "{broken")
  assert.deepEqual(
    loadColumnPreferences({
      storage: localStorage,
      key: stablePreferenceKey,
      columns,
      schemaVersion: 2
    }).order,
    ["id", "amount", "createdAt"]
  )
  assert.deepEqual(JSON.parse(requiredStoredValue(localStorage, stablePreferenceKey)), {
    schemaVersion: 2,
    order: ["id", "amount", "createdAt"],
    hidden: []
  })
  const validSetFailure = new MemoryStorage({ setItem: true })
  validSetFailure.values.set(
    stablePreferenceKey,
    JSON.stringify({
      schemaVersion: 2,
      order: ["amount", "id", "createdAt"],
      hidden: ["createdAt"]
    })
  )
  assert.deepEqual(
    loadColumnPreferences({
      storage: validSetFailure,
      key: stablePreferenceKey,
      columns,
      schemaVersion: 2
    }),
    {
      schemaVersion: 2,
      order: ["amount", "id", "createdAt"],
      hidden: ["createdAt"]
    }
  )
  assert.deepEqual(validSetFailure.setAttempts, [stablePreferenceKey])
  const validRemoveFailure = new MemoryStorage({ removeItem: true })
  validRemoveFailure.values.set(
    legacyKey,
    JSON.stringify({
      schemaVersion: 2,
      order: ["createdAt", "id", "amount"],
      hidden: []
    })
  )
  assert.deepEqual(
    loadColumnPreferences({
      storage: validRemoveFailure,
      key: stablePreferenceKey,
      legacyKeys: [legacyKey],
      columns,
      schemaVersion: 2
    }).order,
    ["createdAt", "id", "amount"]
  )
  assert.deepEqual(validRemoveFailure.removeAttempts, [legacyKey])
  assert.notEqual(validRemoveFailure.getItem(legacyKey), null)
  const damagedRemoveFailure = new MemoryStorage({ removeItem: true })
  damagedRemoveFailure.values.set(stablePreferenceKey, "{broken")
  assert.deepEqual(
    loadColumnPreferences({
      storage: damagedRemoveFailure,
      key: stablePreferenceKey,
      columns,
      schemaVersion: 2
    }).order,
    ["id", "amount", "createdAt"]
  )
  assert.deepEqual(damagedRemoveFailure.removeAttempts, [stablePreferenceKey])
  assert.deepEqual(JSON.parse(requiredStoredValue(damagedRemoveFailure, stablePreferenceKey)), {
    schemaVersion: 2,
    order: ["id", "amount", "createdAt"],
    hidden: []
  })
  const damagedSetFailure = new MemoryStorage({ setItem: true })
  damagedSetFailure.values.set(stablePreferenceKey, "{broken")
  assert.deepEqual(
    loadColumnPreferences({
      storage: damagedSetFailure,
      key: stablePreferenceKey,
      columns,
      schemaVersion: 2
    }).order,
    ["id", "amount", "createdAt"]
  )
  assert.deepEqual(damagedSetFailure.removeAttempts, [stablePreferenceKey])
  assert.deepEqual(damagedSetFailure.setAttempts, [stablePreferenceKey])
  assert.equal(damagedSetFailure.getItem(stablePreferenceKey), null)

  assert.throws(
    () => reconcileColumnPreferences(undefined, [columns[0], { ...columns[0] }], 1),
    /unique column ids/
  )
  assert.throws(
    () => reconcileColumnPreferences(undefined, [{ ...columns[0], hideBelow: "sm" }], 1),
    /remain visible on narrow screens/
  )
  assert.throws(
    () =>
      reconcileColumnPreferences(
        undefined,
        columns.map((column) => ({ ...column, responsiveRole: "secondary" })),
        1
      ),
    /exactly one primary business column/
  )
  assert.throws(
    () =>
      reconcileColumnPreferences(
        undefined,
        [...columns, { id: "extra", accessibleName: "Extra", sortField: "" }],
        1
      ),
    /non-empty sort fields/
  )
  assert.throws(
    () =>
      validateColumnContracts(
        columns.map((column, index) =>
          index === 0 ? { ...column, accessibleName: "   " } : column
        )
      ),
    /non-empty column accessible names/
  )
  assert.notEqual(getBusinessIdKey(1), getBusinessIdKey("1"))
  assert.throws(() => getBusinessIdKey(Number.MAX_SAFE_INTEGER + 1), /safe integer/)
  assert.throws(
    () => validateBusinessIds(new Set([1, "2"]), "number"),
    /selection requires number business ids/
  )
  assert.throws(() => validateBusinessIds(new Set([""]), "string"), /must not be blank/)
  assert.throws(
    () => validateBusinessIds(new Set([Number.MAX_SAFE_INTEGER + 1]), "number"),
    /safe integer/
  )
  for (const invalidPage of [0, -1, 1.5]) {
    assert.throws(
      () =>
        validatePageResponse(
          { items: [], totalItems: 0 },
          invalidPage,
          20,
          (row: { id: string }) => row.id
        ),
      /page must be a positive safe integer/
    )
  }
  assert.throws(
    () =>
      validatePageResponse(
        { items: [], totalItems: 0 },
        1,
        15 as PageSize,
        (row: { id: string }) => row.id
      ),
    /pageSize must be an allowed safe integer/
  )
  assert.throws(
    () => validatePageResponse({ items: [{ id: "a" }], totalItems: 0 }, 1, 20, (row) => row.id),
    /more items than totalItems/
  )
  assert.throws(
    () =>
      validatePageResponse({ items: [], totalItems: 25 }, 2, 20, (row: { id: string }) => row.id),
    /page length does not match the trusted totalItems/
  )
  assert.throws(
    () => validatePageResponse({ items: [{ id: "a" }], totalItems: 25 }, 1, 20, (row) => row.id),
    /page length does not match the trusted totalItems/
  )
  assert.deepEqual(
    validatePageResponse({ items: [], totalItems: 25 }, 3, 20, (row: { id: string }) => row.id),
    { items: [], totalItems: 25 }
  )
  assert.throws(
    () =>
      validatePageResponse(
        { items: [{ id: "a" }, { id: "a" }], totalItems: 2 },
        1,
        20,
        (row) => row.id
      ),
    /duplicate business id/
  )
  assert.throws(
    () =>
      validatePageResponse(
        { items: [{ id: "1" }, { id: 2 }], totalItems: 2 },
        1,
        20,
        (row) => row.id
      ),
    /business id type must be consistent within a page/
  )
  assert.throws(
    () =>
      validatePageResponse(
        { items: [{ id: 21 }], totalItems: 21 },
        2,
        20,
        (row) => row.id,
        "string"
      ),
    /expected string business ids/
  )
  assert.deepEqual(
    validatePageResponse(
      { items: [{ id: "21" }], totalItems: 21 },
      2,
      20,
      (row) => row.id,
      "string"
    ),
    { items: [{ id: "21" }], totalItems: 21 }
  )

  const selected = new Set(["a", "missing"])
  assert.deepEqual([...pruneCurrentPageSelection(selected, ["a", "b"])], ["a"])
}

runListPageContractTests()
console.log("mantine-list-view executable contracts passed")
