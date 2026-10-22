/** 列表表面与语义表格组合。 */
const LIST_SURFACE = `import { Paper, Table, type TableProps } from "@mantine/core"
import type { ReactNode } from "react"
import classes from "./listSurface.module.css"

/** 列表表面统一边框、滚动区和页脚，保留调用方的数据与状态归属。 */
export function ListSurface({
  children,
  label,
  footer,
  minWidth = 560,
  scroll = true
}: {
  children: ReactNode
  label: string
  footer?: ReactNode
  minWidth?: number
  scroll?: boolean
}) {
  return (
    <Paper
      component="div"
      withBorder
      radius="lg"
      className={classes.surface}
      role={scroll ? undefined : "region"}
      aria-label={scroll ? undefined : label}
    >
      {scroll ? (
        <Table.ScrollContainer
          type="native"
          minWidth={minWidth}
          role="region"
          aria-label={label}
          tabIndex={0}
          className={classes.scroll}
        >
          {children}
        </Table.ScrollContainer>
      ) : (
        children
      )}
      {footer}
    </Paper>
  )
}

/** 同一表格组合固定密度和表头样式，领域仅声明列与行。 */
export function ListTable({ className, ...props }: TableProps) {
  return (
    <Table
      {...props}
      horizontalSpacing="lg"
      verticalSpacing="md"
      className={[classes.table, className].filter(Boolean).join(" ")}
    />
  )
}
`

/** 列表、行与页脚统一使用现有 Mantine 令牌。 */
const LIST_STYLES = `.surface {
  min-width: 0;
  overflow: hidden;
}
.scroll:focus-visible {
  outline: 2px solid var(--mantine-primary-color-filled);
  outline-offset: -2px;
}
.table thead th {
  background: var(--mantine-color-body);
  color: var(--mantine-color-dimmed);
  font-weight: 600;
}
.table td:last-child,
.table thead th:last-child {
  text-align: end;
}
.table td:last-child > div {
  justify-content: flex-end;
}
.footer {
  border-top: 1px solid var(--mantine-color-default-border);
  padding: var(--mantine-spacing-md) var(--mantine-spacing-lg);
}
.controls {
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-md);
  flex-wrap: wrap;
}
.pageSize {
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  color: var(--mantine-color-dimmed);
  font-size: var(--mantine-font-size-sm);
}
.row {
  padding: var(--mantine-spacing-md) var(--mantine-spacing-lg);
  border-bottom: 1px solid var(--mantine-color-default-border);
}
.row:last-child {
  border-bottom: 0;
}
.state {
  padding: var(--mantine-spacing-xl);
}
`

/** 分页摘要、容量选择与数字页码的本地化组合。 */
const LIST_FOOTER = `import { useTranslation } from "react-i18next"
import { PaginationControls } from "./PaginationControls"
import type { PageRequest } from "./useSessionPagination"
import "../i18n/lists"

/** 所有列表页脚共用范围摘要、条数选择和页码，领域保留状态适配。 */
export function ListFooter({
  state,
  total,
  disabled = false,
  change
}: {
  state: PageRequest
  total: number
  disabled?: boolean
  change(patch: Partial<PageRequest>): void
}) {
  const { t } = useTranslation()
  return (
    <PaginationControls
      request={state}
      total={total}
      disabled={disabled}
      onPageChange={(page) => change({ page })}
      onPageSizeChange={(pageSize) => change({ page: 1, pageSize })}
      labels={{
        navigation: t("listPagination"),
        page: (page) => t("listPage", { page }),
        previous: t("listPrevious"),
        next: t("listNext"),
        pageSize: t("listPageSize"),
        pageSizePlaceholder: t("listChoosePageSize"),
        range: (from, to, total) => t(total ? "listRange" : "listTotal", { from, to, total })
      }}
    />
  )
}
`

/** 弹窗本地分页与主体隔离。 */
const LOCAL_PAGINATION = `import { useState } from "react"
import { type PageRequest, isPageSize } from "./useSessionPagination"

/** 弹窗分页独立于底层路由；主体变化立即使用默认页，不请求上一主体的页码。 */
export function useLocalPagination(owner: string) {
  const [snapshot, setSnapshot] = useState<{ owner: string; request: PageRequest }>({
    owner,
    request: { page: 1, pageSize: 20 }
  })
  const request = snapshot.owner === owner ? snapshot.request : { page: 1, pageSize: 20 as const }
  /** 每页数量修改与回到第一页原子发生。 */
  function change(patch: Partial<PageRequest>) {
    setSnapshot((previous) => {
      const current =
        previous.owner === owner ? previous.request : { page: 1, pageSize: 20 as const }
      const pageSize = isPageSize(patch.pageSize) ? patch.pageSize : current.pageSize
      return {
        owner,
        request: {
          pageSize,
          page: pageSize !== current.pageSize ? 1 : (patch.page ?? current.page)
        }
      }
    })
  }
  /** 成功读取后才纠正越界页，不从失败推断总数。 */
  function correct(total: number) {
    if (!Number.isSafeInteger(total) || total < 0) return
    const page = Math.max(1, Math.ceil(total / request.pageSize))
    if (request.page > page) change({ page })
  }
  return { request, change, correct }
}
`

/** 标准列表的两种语言文案。 */
const LIST_LOCALES = `import i18n from "../i18n"

i18n.addResourceBundle(
  "en",
  "translation",
  {
    listPagination: "List pagination",
    listPage: "Page {{page}}",
    listPrevious: "Previous page",
    listNext: "Next page",
    listPageSize: "Rows per page",
    listChoosePageSize: "Choose rows per page",
    listRange: "{{from}}–{{to}} of {{total}}",
    listTotal: "{{total}} records"
  },
  true,
  true
)
i18n.addResourceBundle(
  "zh",
  "translation",
  {
    listPagination: "列表分页",
    listPage: "第 {{page}} 页",
    listPrevious: "上一页",
    listNext: "下一页",
    listPageSize: "每页条数",
    listChoosePageSize: "选择每页显示数量",
    listRange: "第 {{from}}–{{to}} 条，共 {{total}} 条",
    listTotal: "共 {{total}} 条"
  },
  true,
  true
)
`

/** 标准列表同时生成到两种宿主，数据与请求仍由消费者拥有。 */
export function listFiles(): Map<string, string> {
  return new Map([
    ["src/pagination/ListSurface.tsx", LIST_SURFACE],
    ["src/pagination/listSurface.module.css", LIST_STYLES],
    ["src/pagination/ListFooter.tsx", LIST_FOOTER],
    ["src/pagination/useLocalPagination.ts", LOCAL_PAGINATION],
    ["src/i18n/lists.ts", LIST_LOCALES]
  ])
}
