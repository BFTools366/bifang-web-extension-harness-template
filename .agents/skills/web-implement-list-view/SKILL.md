---
name: web-implement-list-view
description: 为单 package React Web 下游创建、修改、重构或审查重复记录的列表页、数据表格、后台列表与搜索结果页，并统一路由恢复、Query 分页、状态反馈和可访问性。仅用于 projectType=web；Extension Popup/Options 不调用。
---

# Web Harness：实施 React 列表页

## 适用边界

- 创建、修改、重构或审查 `projectType=web` 的列表页、数据表格、后台列表或搜索结果页时使用；用户没有写“表格”，但任务实质是检索、浏览或管理重复记录时同样适用。
- 先读 [`docs/MANTINE_UI_GUIDELINES.md`](../../../docs/MANTINE_UI_GUIDELINES.md) 的当前 UI 规则与 [`docs/DATA_ACCESS.md`](../../../docs/DATA_ACCESS.md) 的列表状态和数据边界。本 Skill 只编排列表工作，不建立第二份 UI、分页或数据事实源。
- Extension Popup/Options 继续使用 `$web-implement-change` 与 Extension 宿主规范；不要为复用本 Skill 给 Extension 安装 Router、列表依赖或复杂表格。

## 开始前确定

1. 稳定 `listId`、规范业务 id 类型、总数契约、默认确定性排序、允许的排序字段和同值记录的稳定 id tie-breaker。
2. 页面是二维数据表、卡片列表还是搜索结果；不要为命中 Skill 强制改成 Table。
3. 由当前列表拥有的 Router search keys、非列表 query 参数保留方式，以及首次 canonical `replace` 的时机。
4. 选择是 `none`、`current-page` 还是 `cross-page`；若启用，批量动作、清空入口和服务端 id/权限/状态重验是什么。
5. 只有真实需要时才启用列显隐/顺序偏好；确认稳定 scope、schema 迁移、旧 key 清理与键盘替代操作。

答案会改变产品边界、权限或服务端契约且无法从 Product Spec、类型或接口确认时停止询问；普通实现细节按现有事实推进。

## 不可省略的行为契约

### 路由、分页与 Query

- 复用 `src/pagination/` 的 1-based `page`、`pageSize` 和 `[10, 20, 50, 100]` 契约。外部 cursor/offset 只在 endpoint adapter 映射，不建立页面私有分页标准。
- Router search 是已应用搜索、筛选、排序、页码和 pageSize 的运行时权威。原始 URL 含任一 owned key 时只采用合法 URL 值并以默认值补齐；完全无 owned key 时才读取按 `listId` 隔离的 sessionStorage 恢复快照。这是单向启动恢复，不是双向状态同步。
- canonicalization、清除失效排序和成功越界纠页使用 `replace`，保留不属于当前列表的 query 参数，并避免首次请求命中非法状态。搜索、筛选、排序和 pageSize 变化与 `page=1` 原子提交。
- 业务行、总数、错误和请求结果只属于 TanStack Query。query key 至少包含 `listId`、非 PII scope、规范化筛选、sort、pageSize、page 与影响结果的语言/target。
- page、pageSize、total、响应行数和数值业务 id 都按安全整数校验；成功响应验证行数、总数、当前页和业务 id 一致性。默认排序和每个可排序字段都追加稳定业务 id tie-breaker。

### 呈现与恢复

- 首次 loading、后台刷新、筛选无结果、全局无数据、可重试错误和终态错误分别表达；只为可重试错误提供真实 retry。动态结果使用稳定 live region，避免重复播报。
- 只有二维关系确实需要表格时使用 Mantine Table。粘滞表头 offset 来自共享布局事实；`Table.Thead` 使用稳定 CSS Module 类，其 `th` 以 `background-color: var(--mantine-color-body)` 提供随主题变化的不透明背景，避免滚动数据透出。二维内容在有名称、可聚焦且焦点可见的局部滚动区内滚动，页面根不横向滚动。
- React key 使用带类型前缀的稳定业务 id，不用数组 index。行或卡片本身不因 hover 高亮自动变成按钮；子控件拥有自己的动作和焦点。
- 纯翻页 pending 可以显示上一页 placeholder，但旧内容必须只读；选择、分页、批量与行内副作用禁用。换页失败显示目标页错误，同 key 后台刷新失败才保留当前数据。
- 用户可见文案与可访问名称进入 i18next；窄宽度、200% 文本缩放、键盘路径和长值保持可用。

### 条件能力

- 启用选择时必须同时提供摘要、清空和可访问批量动作。current-page 在查询组合变化时清空并在同 key 成功刷新后裁剪；cross-page 只保存业务 id 并声明失效策略。
- 启用列偏好时，稳定 localStorage key 不包含 schemaVersion；版本只在 payload，升级使用显式 migration。损坏值安全回退，未知/重复列丢弃，新列追加，必显列恢复。
- 拖拽只有真实列重排需求时才增加项目本地 `@dnd-kit/core` 与 `@dnd-kit/sortable`；同时提供 keyboard sensor、命名手柄、移动按钮和位置播报。新增第三方依赖前遵守项目依赖评审与授权规则。

## 实施步骤

1. 完整读取 [offset-list-pattern.md](references/offset-list-pattern.md) 与 [checklist.md](references/checklist.md)；使用 Mantine Table/Pagination 时再读 [mantine-api.md](references/mantine-api.md)。
2. 确认下游实际为 React Web，并满足 React 19.2+、`@mantine/core >=9.6.1 <10`、`@tanstack/react-query >=5.102.8 <6`。版本不满足时先按项目依赖规则升级，或实现并测试等价 fallback。
3. 需要 URL/session 恢复、响应校验、选择裁剪或列迁移时，从 `assets/listPageState.ts` 选取并适配到一个项目级共享列表模块；运行 `assets/ListPage.contracts.test.ts` 作为纯函数起点。资产不是必须整份复制的 UI 模板，也不替代产品测试。
4. 先接类型化 Router adapter 与服务端稳定排序，再接 Query/四态/分页，最后只按真实需求接选择和列偏好；不留下假按钮、占位 endpoint 或不可达分支。
5. 更新相关非空 Vitest/Testing Library 测试；同时运行适配后的可执行契约。普通实现不因此自动构建、E2E 或完整验收。

## 交付判定

按 [checklist.md](references/checklist.md) 逐项记录 `Pass`、`Fail` 或带证据的 `N/A`。Required 或已触发 Conditional 失败时不能声称列表页通过；纯审查只报告证据，不修改实现。
