# 2026-09-30 产品规格

状态：Approved

## 产品使命

本仓库是 Agent-first 的纯 TypeScript Web Harness。它从源根唯一公开入口生成两种互斥终端下游之一：

- 单 package 的 Vite + React/TypeScript Web 应用；
- 单 package 的 Plasmo + React/TypeScript Chrome MV3 Extension。

一个下游只有一个 `projectType`，不生成 monorepo、共享 core、多宿主或宿主切换入口。AI Agent 是工程规则的第一消费者，人类负责产品方向、外部副作用和最终发布授权。

## 用户与核心问题

- 主要用户是需要快速建立一致、可维护前端工程基线的产品负责人和工程 Agent。
- Harness 必须把身份、品牌、环境、数据访问、状态所有权、可访问性、日志、测试、构建、Agent policy 与维护 Skills 变成可验证契约，而不是依赖会话记忆。
- 新项目创建必须原子、可审计且不污染源仓库；下游维护必须保护产品代码、身份、品牌、记忆、策略与本地修改。
- 维护者需要从当前记忆索引和 Git 事实中只读汇总历史，并明确区分已决定、已实现、已验证、计划与推测。

## 固定范围

- Web 使用 Vite、Mantine、TanStack Router 文件路由、TanStack Query、Jotai 与 i18next。
- Extension 使用 Plasmo、Chrome MV3、Mantine、TanStack Router 代码路由、TanStack Query、Jotai 与 i18next；Popup 与 Options 分别持有 Router。
- 源 Harness 保留 Web-only `$web-implement-list-view`；Web 终端保留该 Skill 用于列表页、数据表格、后台列表与搜索结果，Extension 终端必须裁掉它且不复用 Web 列表路由恢复契约。
- 两类项目共享工程契约但不在同一仓库共享业务源码。
- `.harness/project.json` 是名称、标识、说明、唯一 `projectType` 和品牌事实源；Logo 母版固定为 `.harness/brand/logo-1024.png`。
- development、test、release 三环境完整存在；浏览器端只读取当前宿主四个已声明公开变量，逻辑 release 映射 production。
- 初始化器生成原生 Fetch、1-based 分页、语言/认证 header、超时、401 handler、安全 logger 与 Release 检查基线，不生成业务 endpoint、伪远端 Query、占位事件总线或为展示而设的全局状态。
- 用户可见文案进入 i18next；可分享导航状态由 Router search 管理，会话态进入 `sessionStorage`，远端状态由 Query 管理，必要的跨组件客户端状态才由 Jotai 管理，组件局部交互留在 React；同一状态不得双重归属。Web 路由列表是封闭启动恢复例外：Router 始终是已应用列表状态的运行时 owner，仅在原始 URL 完全没有 owned key 时按 `listId` 读取一次 sessionStorage 快照；业务行和 `total` 只属于 Query。
- 列表形态按真实信息结构选择 Table、卡片或搜索结果，不强制 Table、选择、列偏好或 DnD。中性初始化不生成业务列表、假 endpoint 或可选列表依赖。
- 生成的中性界面使用 Mantine theme 和语义令牌，品牌色形成十阶色阶，默认跟随系统并允许显式亮色/暗色切换；顶层标题层级正确，动态状态可被辅助技术感知，父容器不代理子控件动作。

## Agent-first 执行契约

- 源 Harness 只接收自身工程维护与当前表单固定初始化字段；下游产品目的、用户场景、业务、专属 UI/文案/数据、远程凭据、产品构建或发布需求必须在分析或记录前拒绝，并要求实例化或切换到既有下游后重新提出。
- 日常范围清楚的工作直接实施并运行相关非空测试；行为保持重构追加全量测试。Work Plan 仅在用户明确要求、跨会话交接，或发布/高风险工作确需协调时创建。
- 用户可见左侧 Task 使用 `Task {序号} | {当前进度} | {单一结果}`，进度只取 `已分配`、`运行中`、`检查中`、`已完成`。内部 plan、Subagent 和 Worktree 不占用该序号或标题合同。
- 用户可见 Git Task 必须绑定真实 `threadId`、Git common dir、登记 Worktree 与派发前精确起始 OID；非 Git Task 绑定精确 cwd。首次编辑前复核绑定，写入型 Git Task 以本地提交、clean 工作树和报告 SHA 闭环。
- 推荐 Agent policy 固定为关闭自动用户 Task、关闭 superpowers、关闭内部并行、启用完整候选 smoke、关闭 E2E 建议；内部并行默认关闭不影响用户明确创建的左侧 Git Task。
- 初始化后的永久策略变更必须由用户明确确认并写入当日 ADR；同值按幂等 no-op，临时 Task 限制不得改写持久策略。
- `acceptance_smoke` 只在完整候选验收解析：硬要求优先，`enabled` 为 `required`，`disabled` 为 `not-required`，源 `pending` 在无硬要求时也是 `not-required`。它与每次构建单独取得的 E2E 选择相互独立。
- 初始化先完成首轮项目字段收集，再按条件确认 Agent policy；非交互调用必须显式给出全部必需决议。所有写入前冻结 source 文件、模式、Version 与可用 Git 身份，发布 staging 前再次逐字节复核；脚手架验证和裁剪完成后在 staging 建立独立 Git 根、受管 repo-local 身份/模板与恰好一个 `chore: initialize project` 中性基线提交。
- Git 提交 helper 只补齐缺失的生效身份，复用合法 Unicode/global 配置；模板与配置只写仓库 local/common-dir，失败回滚，不自动提交。
- 下游升级使用受保护双基线、不可弱化所有权、只读三方 plan、路径级批准、每次写后重规划与收敛后 record。
- 源 Harness 维护 17 个 canonical `web-*` Skills；Web 终端保留 15 个维护 Skills，Extension 终端保留 14 个。Skill 与参考资产是治理契约，不是已生成的产品功能。

## 质量与安全边界

- 受管 TypeScript/TSX 的稳定声明使用紧邻中文注释；不在运行时自动注入无意义注释。
- 人工维护前端代码 501–1000 行提示职责复核，1001 行起失败；其他受管文本 501–2000 行提示，2001 行起失败。
- 行为变化必须覆盖核心成功路径和最高风险失败路径；零相关测试不构成通过。
- 源 validator 必须跨 LF/CRLF 和 POSIX/Windows 风格相对路径稳定，并直接校验 `Version.md` 结构与升级 ownership manifest 的生产解析器合同。
- 源 validator 必须校验 Web 列表 Skill 的 canonical id、路由、必需 references/资产、可执行契约与宿主裁剪，防止只保留空目录或把 Web-only 能力泄漏到 Extension。
- 初始化目标必须位于源外空目录，并经同目标合作租约、身份绑定 sibling staging、单次安装、Git 初始化、唯一 local root commit 和原子 rename 发布；结果保持 clean 且无远端。父目录漂移时失败关闭且不清理替代树。Node 标准库不具备跨平台目录 no-replace flag，故意绕过租约的同机竞态不属于本协议保证。
- Extension 只申请真实功能所需最小权限，不使用远程托管可执行代码。
- 不在浏览器配置、日志、候选或提交中泄漏秘密；Release logger 仅保留批准字段并脱敏 URL、路径、Error stack/cause。
- 发布、推送、tag、部署、上传、商店提交、生产数据与不可逆副作用分别需要明确授权。

## 明确排除

- Rust、Tauri、桌面 GUI、桌面 CLI/TUI/MCP、安装器、签名、公证和桌面发布链。
- 同仓库 Web + Extension、workspace、`apps/`、`packages/` 或创建第二宿主的入口。
- 初始化期间选择 E2E 或生成最终候选；最终构建必须在下游另行取得当次选择。
- 全局依赖安装、自动升级 Node.js/pnpm/Chrome、自动创建 PR/tag/发布或静默改写 Git 全局配置。

## 成功标准

- 源 Harness 验证器可确定性证明 Skills、治理文档、模板、初始化、环境、注释、行数、版本、升级所有权和安全边界一致。
- Web 与 Extension 均能从源外独立实例化，生成仓库只有其单一宿主所需文件、不保留派生入口，并各自拥有恰好一个中性本地基线提交且无远端。
- Web 生成结果保留 `$web-implement-list-view` 及完整参考资产，Extension 结果不含该 Skill；两者的中性 UI 都没有业务列表或未被真实消费的图标/DnD 依赖。
- 两类中性界面用行为测试证明局部交互、语言同步、标题层级、live region 与子控件边界；不以伪 Query 或不必要的 Jotai 冒充架构示例。
- 两类下游在形成 Release 候选时通过各自格式、lint、类型、非空测试、构建、敏感信息扫描，以及当次 E2E 和完整候选 smoke 决议要求的真实 Chrome 验收。
- 源发布提交与 `Version.md`、远端默认分支可回读一致；未实际执行的候选、E2E、发布和外部渠道操作保持 `Not run` 或 `Unverified`。
