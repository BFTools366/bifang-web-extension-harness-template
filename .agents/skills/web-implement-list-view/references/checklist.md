# React Web 列表页交付自检

逐项记录“通过（Pass）”“失败（Fail）”或“不适用（N/A，理由 + 证据）”。必需项始终适用；条件项仅在括号条件成立时适用。列表专项检查不能替代 Mantine UI、i18n、数据访问和产品验收规则。

## 必需项：数据与状态

- [ ] `listId` 全应用唯一稳定；业务 id 类型在所有页和选择状态一致，React key 使用带类型前缀的业务 id，不用 index。
- [ ] 默认排序确定；允许的排序字段有白名单，服务端对同值追加稳定业务 id 作为同值排序的决胜条件。
- [ ] 复用 `src/pagination/` 的 1-based page/pageSize 契约；page、pageSize、total、响应行数和数值业务 id 均验证为安全整数。
- [ ] 成功响应验证 items、total、当前页和业务 id 一致性；矛盾响应进入契约错误，不伪装成空态。
- [ ] URL/session/localStorage/网络 parser 面对损坏或恶意输入时安全回退，不把非法值送入渲染层。

## 必需项：Router、Query 与分页

- [ ] 原始 URL 含任一 owned key 时只采用合法 URL 值并补默认；完全无 owned key 时才读当前标签页快照。
- [ ] canonical URL 在首次请求前只 replace 一次并保留无关 query；筛选、排序和 pageSize 与 page=1 原子更新。
- [ ] Query key 包含 listId、非 PII scope、规范化筛选、sort、pageSize、page，以及影响结果的语言/target；业务行和总数不复制到 Jotai 或 Storage。
- [ ] 只有纯翻页等待期间可保留占位数据；旧内容只读。换页失败显示目标页错误，同一查询键刷新失败才保留当前数据。
- [ ] 成功且非 placeholder/fetching 时才纠正越界页；零结果规范为 page=1，纠正不污染 Back 历史或循环请求。
- [ ] 分页具有本地化 landmark、控制名称和可见结果范围；窄宽度可以回流且不造成页面级横向溢出。

## 必需项：呈现、四态与交互

- [ ] 选择 Table、卡片或搜索结果形态有真实信息结构理由；没有为命中 Skill 强制二维表格。
- [ ] 首次 loading、后台刷新、筛选无结果、全局无数据、可重试错误、终态错误和正常数据分别表达。
- [ ] 行/卡片子控件拥有自己的动作；父容器不会代理 Button、Link、Switch、Checkbox 或菜单项的动作。
- [ ] 结果、刷新、错误与选择反馈可被辅助技术感知且不会重复播报；键盘和可见焦点可完成核心流程。
- [ ] 中英文、长值、等价 320 CSS px 与 200% 文本缩放下无不可达操作或内容丢失。

## 条件项：二维表格

- [ ] （Table）使用 Mantine Table；粘滞 offset 来自共享布局事实，没有手写 sticky 字面量；`Table.Thead` 有稳定 CSS Module 类，表头 `th` 使用不透明 `var(--mantine-color-body)` 背景，滚动数据不会透出。
- [ ] （Table）局部滚动区有真实 minWidth、本地化区域名称、键盘入口和可见焦点；页面根不横向滚动。
- [ ] （可排序列）排序状态、可见方向图标和 `aria-sort` 一致；清除入口在窄屏仍可感知。
- [ ] （Table）唯一主业务单元格使用 `th scope="row"`，行名称可理解；颜色不是选中或状态的唯一线索。

## 条件项：选择与列偏好

- [ ] （selection != none）有批量 action bar、摘要与清空；服务端重新校验 id、权限和当前状态。
- [ ] （current-page）查询组合变化时清空，同 key 成功刷新后裁剪已消失 id。
- [ ] （cross-page）只保存业务 id，并明确 base query 变化后的清空/保留策略和可见范围。
- [ ] （列偏好）稳定 key 不含 schemaVersion；payload 显式迁移，旧 key 清理，未知/重复列删除，新列追加，必显列恢复。
- [ ] （拖拽列）依赖已项目本地声明；pointer/keyboard/移动按钮复用同一逻辑并播报位置。

## 条件项：验证范围

- [ ] （实现或修改）相关非空 Vitest/Testing Library 测试覆盖成功路径与最高风险失败，并运行适配后的纯函数契约。
- [ ] （真实浏览器由候选或硬要求触发）验证窄宽度、文本缩放、中英文、键盘、Back/Forward/refresh 与服务端错误。
- [ ] （仅审查）按阻断交付、行为错误、无障碍/恢复风险、建议改进分级并提供最小文件/行号证据，不修改源码。
