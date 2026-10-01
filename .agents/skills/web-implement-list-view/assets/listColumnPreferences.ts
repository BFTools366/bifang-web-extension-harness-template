import type { ListStorage } from "./listPageStorage.ts"

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

/** 构造跨列 schema 稳定的偏好键；版本只保存在 payload 以支持迁移。 */
export function buildColumnPreferencesKey(
  appNamespace: string,
  listId: string,
  columnPreferenceScope: string
): string {
  return `${appNamespace}:list-columns:${encodeURIComponent(listId)}:${encodeURIComponent(columnPreferenceScope)}`
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
