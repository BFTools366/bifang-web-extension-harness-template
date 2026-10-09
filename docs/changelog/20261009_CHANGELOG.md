# 2026-10-09 变更记录

本记录保留前次当前记录的变化，并补充仅在下游实际开发运行的 PRD、原型选择与开发交接流程。

## Added

- 下游新增原创 web-design-prototype：默认产出 2–3 个交互 HTML 方案，记录用户选择的具体版本；复用 web-define-product 维护唯一 PRD，选定后交 web-implement-change。Node 标准库 helper 绑定 PRD/候选摘要并阻断未选择或漂移；两类初始化只分发项目级能力，不新增业务问题、PRD、原型或全局安装。源/Web/Extension canonical Skills 分别为 18/16/15；业务原型和选择受升级保护。

- HTTP 增加请求/响应/错误拦截、经校验的显式 Token 写入、403 权限分类和失效周期并发保护；两宿主 Router/Providers 接入本地化错误界面与持续反馈。Query 读取有界重试且仅最终失败播报，mutation 不自动重放；新增实际执行生成客户端及 UI/Router/Query 的回归。

- Extension 单包默认支持 Chrome MV3 与 Firefox MV2：增加 Firefox 开发入口，两目标构建/打包和逐产物检查；最终 manifest 由 Plasmo 动态生成，移除共享 manifest_version 固定值。Harness 工程与派生规则明确后续 Agent 自行保证浏览器差异和兼容，候选证据按目标独立记录。

- 名称与说明支持 `identityI18n` 默认语言及英文/简体中文完整翻译；Web/Extension UI 消费既有 i18next，Extension manifest 使用显式 `default_locale` 和浏览器消息引用，Plasmo locales 从同一项目事实派生。品牌刷新保留翻译和其他产品消息；候选构建后的扫描检查实际消息内容。
- Agent 实例化显式调用品牌 Skill 生成/导入并展示 Logo 候选；汇总和完成输出列出 1024 PNG 母版及 Web Logo/Favicon 或 Extension icon，CLI 保留离线确定性生成路径。

- Web 与 Extension 创建默认在项目内检查 `design-taste-frontend`；缺失时从固定上游快照自动补装原文、MIT 许可证、commit/SHA-256 来源与发现元数据，不额外问询、不全局安装。有效已有版本原样保留，升级视为 `protected`，旧下游未安装时仍可通过维护门禁；设计建议以 Mantine、宿主与工程规范为实施边界。
- React Web 生成本地化路由加载/错误界面、显式重试和统一异常日志；真实 Router 回归覆盖慢加载、loader/渲染失败、持续失败与 404 返回首页。
- Extension Popup/Options 生成 TanStack Router 代码路由，分别使用 memory/hash history，不增加 Chrome 权限或 Web 路由生成器。
- Web 与 Extension 生成品牌十阶色、跟随系统/亮色/暗色切换和项目隔离的外观偏好持久化。
- 新增 Web-only `$web-implement-list-view` Skill、参考与可执行纯函数契约，覆盖 URL/session 启动恢复、响应校验、Query 分页、越界纠页、状态反馈、选择与列偏好；该能力引入时，源 Harness 增至 17 个 canonical Skills，Web 终端为 15 个，Extension 终端为 14 个；当前数量见根 AGENTS.md。
- 新增只读 `$web-summarize-development-history` Skill，依据当前记忆索引和 Git 事实汇总历史，并区分已决定、已实现、已验证、计划与推测。
- `pnpm validate:harness` 新增 `Version.md` 自然日分钟、时区、格式和发布状态校验，并直接复用生产升级器校验 ownership manifest。
- 源 validator 新增 CRLF、Windows 风格相对路径、策略必需片段、终端 Skill 漂移和所有权/版本变异回归。
- 源仓库增加 `.gitattributes`，让规则、模板和脚本在跨平台检出时保持 LF，二进制品牌资产不转换换行。

## Changed

- 未配置对应环境/服务 BaseURL 时，所有需要该服务的数据由 API 层提供完整 Mock；用户要求真实联网后复用已有配置、询问缺失的各环境和实际服务地址，并替换对应 Mock 实现。UI/Query 不内嵌 Mock，真实请求失败不回落 Mock；源规则、实施 Skill、两宿主生成文档与 Web API 边界说明同步，HTTP 和正式 Release 配置门禁继续有效。
- 自有 Harness/Skill 工具统一使用本地 Node.js/TypeScript，并新增拒绝 Python 文件与执行入口的门禁；清点未发现需迁移的自有 Python 工具，第三方附带文件保持原样。
- 人工维护代码硬上限统一为 600 行，601 行起按功能与模块拆分；HTTP、实例化事务、列表、验证器、并行/升级工具及回归测试完成职责拆分，生成代码与新文件分发采用同一约束。
- 升级器自更新前要求新增 helper 已手工收敛并重规划，防止替换 core 后目标 CLI 缺模块而无法启动。

- Web 与 Extension 默认 HTTP 传输采用 Ky，生成项目声明运行时依赖并复用既有受控 BaseURL、认证 revision、401、取消和 ApiError；关闭 Ky 重试、超时与 HTTP 抛错，避免多层策略叠加。新增实际执行生成请求测试的源回归入口。
- 初始化首轮必填项目类型、显示名称、项目标识、目标绝对路径和 Agent 策略；Extension 另需非空简短说明，缺失时条件问询，Web 说明默认使用显示名称，确认来源自动记录“当前用户”，策略提示支持中文“预设/自定义”。三环境 API 地址均可留空并后续配置，正式构建、扫描和运行时仍要求 HTTPS 正式地址，未配置地址的 HTTP client 在 Fetch 前失败。
- 同一发布流程复用已明确的 E2E 选择，重建和打包继续验收新字节；明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认。
- Web 候选页面版本改为上海时间 `YYMMDDHHMMSS`；Extension 构建与打包改为读取 `package.json.version` 的稳定 SemVer，并检查页面、包与两目标 manifest 版本一致。
- 推荐 Agent policy 默认关闭内部 Worktree Subagent 并行，但不影响用户明确创建的左侧 Git Task；任何初始化后的永久策略变更都必须由用户明确确认并写入当日 ADR，同值为幂等 no-op，临时 Task 限制不得持久化。
- 用户可见 Task 统一采用 `Task {序号} | {当前进度} | {单一结果}`；实现 Skill 和生成下游入口补齐真实 `threadId`、Git common dir、登记 Worktree、起始 OID、非 Git cwd、本地提交与 clean 闭环。
- 完整候选验收现在确定性消费 `acceptance_smoke`：硬要求优先，`enabled` 为 `required`，`disabled` 与无硬要求的源 `pending` 为 `not-required`；smoke 与本次发布的 E2E 选择保持独立。
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

## Security

- 浏览器身份消息中的美元使用 JSON Unicode 转义，避免 Plasmo 在解析前将字面 `$变量` 展开为构建环境值；刷新同样保留安全编码。
- Extension build/package 显式固定 Chrome MV3 与 Firefox MV2 target、production tag 和受管输入/输出目录，防止外部变量改变实际产物后扫描旧目录；任一目标缺失或失败阻断整体检查。

## Scope

- 保持 Vite React Web、Plasmo Chrome MV3 / Firefox MV2 Extension、三环境、Ky HTTP、构建与发布协议；Extension 增加已在 Web 基线使用的 TanStack Router，GraphQL 等可选协议依赖仍按需引入。
- 桌面客户端、Rust/Tauri 构建和发布链不进入当前双宿主 Web Harness；源仓库的 `.gitattributes` 不作为下游升级候选，避免旧 ownership manifest 将新顶层文件误判为受保护路径。
