# Mantine 与 Query API 边界

本参考从桌面 Harness 的 Mantine 列表契约适配而来。使用 `Pagination layout="responsive"`、`formatLabel`、`getItemProps`、`getControlProps` 和 Query v5 `placeholderData(previousData, previousQuery)` 时，直接实现的兼容下界是 `@mantine/core >=9.6.1 <10`、`@tanstack/react-query >=5.102.8 <6`。当前 Web Harness 对新下游使用精确稳定版本与锁文件；旧下游低于下界时先按项目依赖规则升级，或实现并测试等价回退方案。

## 表格与滚动区

二维关系确实需要表格时使用 Mantine `Table` 与 `Table.ScrollContainer`：

```tsx
<Table.ScrollContainer
  minWidth={tableMinWidth}
  type="native"
  role="region"
  aria-label={messages.scrollRegion}
  tabIndex={0}
>
  <Table stickyHeader stickyHeaderOffset={layout.listStickyHeaderOffset}>
    <Table.Thead className={styles.tableHeader}>{/* 列标题 */}</Table.Thead>
    <Table.Tbody>{/* 数据行 */}</Table.Tbody>
  </Table>
</Table.ScrollContainer>
```

- offset 从当前 AppShell/页面布局事实传入，不在列表组件硬编码。
- `Table.Thead` 的稳定 CSS Module 类使用 `.tableHeader th { background-color: var(--mantine-color-body); }`；表头背景不得透明或固定为单一色彩模式的颜色，以免滚动数据透出。粘滞定位仍由 Mantine 管理。
- `minWidth` 按真实列宽声明；页面根不横向滚动，局部 viewport 可由键盘进入且有 focus ring。
- 主业务列可用 `Table.Th scope="row"`；列标题用 `scope="col"`，当前排序列才设置 `aria-sort`。
- 行 hover/focus 只提供位置反馈，不自动赋予点击语义，也不代替状态文字、选择控件或可见焦点。

## 分页（Pagination）

Mantine Pagination 的 `total` 是总页数，不是总条数；零条结果不渲染分页控件，状态 page 仍规范为 1。优先使用 responsive layout，并为 landmark、首末前后、页码和当前页提供 i18n 名称。分页器之外显示可见结果范围；placeholder 或纠页期间不播报伪范围。

低版本若不支持 responsive layout，使用紧凑前后页或分层回流方案，并在等价 320 CSS px/200% 下证明没有页面级横向溢出。

## Query v5 占位数据

```ts
useQuery({
  queryKey,
  queryFn: ({ signal }) => fetchPage(state, signal),
  placeholderData: (previousData, previousQuery) =>
    sameBaseQuery(previousQuery?.queryKey, queryKey) ? previousData : undefined
})
```

- `sameBaseQuery` 只允许纯页码变化复用旧值；sort/filter/pageSize/语言/target 变化不显示无关旧内容。
- `isPlaceholderData` 为 true 时内容只读，所有副作用入口禁用。
- Query 不负责 URL canonicalization、服务端稳定排序、运行时响应校验或列偏好；这些分别属于 Router adapter、endpoint adapter 与纯状态模块。

## 条件依赖

排序图标优先使用项目已经声明的图标库。只有真实列重排需求时才增加 `@dnd-kit/core` 和 `@dnd-kit/sortable`，并按项目规则检查版本、许可证、体积和锁文件；不依赖全局包或未声明的传递依赖。
