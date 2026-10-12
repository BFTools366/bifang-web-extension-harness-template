# 可恢复页码列表模式

本模式扩展生成的 `src/pagination/`，不替代它。外部 API 即使使用 offset/cursor，也由 endpoint adapter 映射为当前项目统一的 1-based page/pageSize 契约；只有无法保持语义时才记录并批准例外。

## 1. 服务端数据与稳定排序

每个列表声明稳定 `listId`、业务 id 类型、默认确定性排序和允许的排序字段。同值记录必须追加稳定业务 id tie-breaker，否则翻页可能重复或漏行。adapter 最后一层才计算 offset，并拒绝非安全整数。

成功响应进入 UI 前验证 items 数组、非负安全 total、行数不超过 pageSize/total/当前剩余范围、可信有效页的数据一致性和业务 key 唯一；矛盾响应属于契约错误。

## 2. 类型化 Router 适配层

TanStack Router 的 `validateSearch` 可能已经补默认值，因此“URL 是否显式含 owned key”必须读取原始 search，而不能从补默认后的对象猜测。

恢复顺序只在启动时执行：

1. 原始 URL 含任一 owned key：合法字段采用，缺失/非法字段补默认，不混入旧会话值。
2. URL 完全没有 owned key：读取 `app namespace + listId + non-PII scope + schema` 隔离的 sessionStorage 快照。
3. 没有合法快照：使用 page=1、业务默认 sort/filter 和默认 pageSize。
4. 在首次 Query 前以一次 `replace` 写入 canonical search，并保留同路由其他功能的参数。

只有已应用的搜索/筛选进入 URL/session；输入草稿留在局部状态。Token、秘密、PII、长文本或一次性值不得持久化。后续状态只由 Router 驱动，sessionStorage 是快照，不是第二个可写权威。

## 3. Query 与占位数据

query key 使用稳定 listId、非 PII scope、规范化 filters、sort、pageSize、page，以及影响结果的语言/target。业务行和 total 不复制到 Jotai、Storage 或组件外数组。

占位数据只用于基础查询条件完全相同、仅页码变化的情况。换页失败时展示目标页错误；同一查询键的后台刷新失败才保留当前数据。占位内容不可交互，禁用选择、分页、批量和行内操作。

## 4. 页码纠正与状态

只在成功、非 fetching、非 placeholder 且响应已通过校验时纠正页码。超出非零末页 replace 到末页；totalPages=0 规范为 page=1。loading、error 或 placeholder 不纠正。

区分首次 loading、筛选无结果、全局无数据、错误、真实数据和后台刷新。筛选无结果只在重置动作真实有效时显示重置；终态契约/权限错误不显示假 retry。

## 5. 选择

`none` 不产生选择 UI。`current-page` 在完整 query fingerprint 变化时清空，同 key 成功刷新后裁剪已消失 id。`cross-page` 只保存 id，并声明 base query 变化时清空或保留的策略。批量动作由服务端重新校验 id、权限和当前状态。

## 6. 条件列偏好

只有产品真实需要列显隐/排序时才启用。localStorage key 使用 app namespace + listId + 非 PII preference scope，schemaVersion 只在 payload。读取时验证、显式迁移、清理登记的旧 key、丢弃未知/重复 id、追加新列并恢复必显列；损坏或迁移失败时回退默认。

拖拽和移动按钮复用同一纯更新逻辑。pointer 与 keyboard 路径都有命名手柄、位置播报和可操作 fallback；客户端列偏好不改变后端字段、权限或导出契约。

## 7. 资产与验证

`assets/listPageState.ts`、`assets/listColumnPreferences.ts` 与 `assets/listPageStorage.ts` 提供 URL/session 解析、safe integer、响应校验、页码纠正、选择裁剪和列偏好的可组合纯函数；按当前项目模块边界选取，不要复制为每页私有实现。`assets/ListPage.contracts.test.ts` 是这些纯函数的可执行起点，不是 UI 或产品测试。

组件测试还要覆盖角色/名称、真实点击与键盘、placeholder inert、状态反馈、分页标签、选择及触发的列移动。真实浏览器、服务端或 E2E 未运行时明确标记未验证。
