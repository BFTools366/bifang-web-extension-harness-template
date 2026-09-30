# 2026-09-30 变更记录

本记录汇总自上一正式版本以来的 Harness 变化，包含 2026-09-22 的 Web 列表能力和 2026-09-30 的 Extension 路由与主题基线。

## Added

- React Web 生成本地化路由加载/错误界面、显式重试和统一异常日志；真实 Router 回归覆盖慢加载、loader/渲染失败、持续失败与 404 返回首页。
- Extension Popup/Options 生成 TanStack Router 代码路由，分别使用 memory/hash history，不增加 Chrome 权限或 Web 路由生成器。
- Web 与 Extension 生成品牌十阶色、跟随系统/亮色/暗色切换和项目隔离的外观偏好持久化。
- 新增 Web-only `$web-implement-list-view` Skill、参考与可执行纯函数契约，覆盖 URL/session 启动恢复、响应校验、Query 分页、越界纠页、状态反馈、选择与列偏好；源 Harness 现在维护 17 个 canonical Skills，Web 终端保留 15 个，Extension 终端保留 14 个。
- 新增只读 `$web-summarize-development-history` Skill，依据当前记忆索引和 Git 事实汇总历史，并区分已决定、已实现、已验证、计划与推测。
- `pnpm validate:harness` 新增 `Version.md` 自然日分钟、时区、格式和发布状态校验，并直接复用生产升级器校验 ownership manifest。
- 源 validator 新增 CRLF、Windows 风格相对路径、策略必需片段、终端 Skill 漂移和所有权/版本变异回归。
- 源仓库增加 `.gitattributes`，让规则、模板和脚本在跨平台检出时保持 LF，二进制品牌资产不转换换行。

## Changed

- Web 候选页面版本改为上海时间 `YYMMDDHHMMSS`；Extension 构建与打包改为读取 `package.json.version` 的稳定 SemVer，并检查页面、包与 MV3 manifest 版本一致。
- 推荐 Agent policy 默认关闭内部 Worktree Subagent 并行，但不影响用户明确创建的左侧 Git Task；任何初始化后的永久策略变更都必须由用户明确确认并写入当日 ADR，同值为幂等 no-op，临时 Task 限制不得持久化。
- 用户可见 Task 统一采用 `Task {序号} | {当前进度} | {单一结果}`；实现 Skill 和生成下游入口补齐真实 `threadId`、Git common dir、登记 Worktree、起始 OID、非 Git cwd、本地提交与 clean 闭环。
- 完整候选验收现在确定性消费 `acceptance_smoke`：硬要求优先，`enabled` 为 `required`，`disabled` 与无硬要求的源 `pending` 为 `not-required`；smoke 与每次构建单独取得的 E2E 选择保持独立。
- Web/Extension 中性模板移除展示性全局计数状态和 Extension 伪 Query，局部交互改用 React state；数据规范明确 Router search、`sessionStorage`、Query、Jotai 与组件局部状态的唯一所有者。
- React Web 路由列表建立封闭恢复例外：Router search 始终是已应用列表状态的运行时 owner，原始 URL 完全无 owned key 时才按 `listId` 读取一次 sessionStorage 快照；rows/`total` 只属于 Query。Extension 不保留该 Skill 或复用这项恢复契约。
- 列表治理复用 `src/pagination/` 的 1-based page/pageSize 基础，但不强制 Table、选择、列偏好或 DnD；中性初始化不生成业务列表或预装图标/DnD 依赖。
- 受管运行时基线升级为 Mantine `9.6.3` 与 TanStack Query `5.104.0`，不因列表 Skill 增加新的第三方包。
- 源与生成下游的工具链基线升级至 Node.js `>=26.10.0`、pnpm `12.8.1`，并以单包 `pnpm-workspace.yaml` 的 `allowBuilds` 管理依赖构建脚本；Plasmo 保持 `0.90.5`，TypeScript 保持兼容的 `6.0.3`。
- 生成界面统一由 Mantine theme 管理默认 auto、字体和语义令牌；语言切换同步 `<html lang>`，动态计数使用 live region，Extension 使用顶层 `h1`，并以行为测试锁定子控件与外围容器的交互边界。
- Web Landing 与 Extension Popup/Options 的中性状态 Badge 使用 Mantine 默认对比令牌；品牌色现在生成十阶色阶。
- 品牌、运行时配置和数据访问文档不再把日常变化自动升级为构建；只有显式候选、完整验收或硬要求触发构建门禁。
- `web-refactor-code` 明确覆盖源 Harness 管理的前端模板；文件遍历和治理解析对 LF/CRLF、POSIX/Windows 路径使用稳定规范化。
- Web 列表的粘滞表头 `th` 使用随主题变化的不透明 `var(--mantine-color-body)` 背景，避免滚动行从表头透出。
- 源验证器独立锚定下游升级所有权下限；即使运行时规则与清单同时弱化，也会拒绝候选。Windows 缺少符号链接权限时只跳过相应测试用例，POSIX 权限位断言仅在适用平台执行。

## Scope

- 保持 Vite React Web、Plasmo Chrome MV3 Extension、三环境、原生 Fetch、构建与发布协议；Extension 增加已在 Web 基线使用的 TanStack Router，GraphQL 等可选协议依赖仍按需引入。
- 桌面客户端、Rust/Tauri 构建和发布链不进入当前双宿主 Web Harness；源仓库的 `.gitattributes` 不作为下游升级候选，避免旧 ownership manifest 将新顶层文件误判为受保护路径。
