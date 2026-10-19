# 2026-10-19 产品规格

状态：Approved

## 产品使命

本仓库是 Agent-first 的纯 TypeScript Web Harness。它从源根唯一公开入口生成两种互斥终端下游之一：

- 单 package 的 Vite + React/TypeScript Web 应用；
- 单 package 的 Plasmo + React/TypeScript Chrome MV3 / Firefox MV2 Extension。

一个下游只有一个 `projectType`，不生成 monorepo、共享 core、多宿主或宿主切换入口。AI Agent 是工程规则的第一消费者，人类负责产品方向、外部副作用和最终发布授权。

## 用户与核心问题

- 主要用户是需要快速建立一致、可维护前端工程基线的产品负责人和工程 Agent。
- Harness 必须把身份、品牌、环境、数据访问、状态所有权、可访问性、日志、测试、构建、Agent policy 与维护 Skills 变成可验证契约，而不是依赖会话记忆。
- 新项目创建必须原子、可审计且不污染源仓库；下游维护必须保护产品代码、身份、品牌、记忆、策略与本地修改。
- 维护者需要从当前记忆索引和 Git 事实中只读汇总历史，并明确区分已决定、已实现、已验证、计划与推测。

## 固定范围

- 能力采用固定设计模板与代码接线，catalog 按具体操作计算最小依赖。基础用户同时包含登录、用户区、守卫、安全返回、Token 与退出/401；权限码约束页面、路由、菜单和动作元素并在执行前复核；购买自动包含基础用户、目录、订单及钱包，身份不自动启用组织/权限/注册/找回。未决购买不随弹窗关闭丢失，组织权限按可信上下文隔离。

- 默认欢迎页、计数器演示与旧创建与开发 SOP 已移除。保留宿主、挂载、路由、Provider、主题、i18n、HTTP、存储、日志、构建和创建事务等工程基础；根布局只提供正文插槽与构建版本，不附带产品首页。完整创建须根据实际需求实现首页、必要页面及功能，工程事务仅为内部阶段。一次完整范围确认授权下游 PRD、固定设计原型、代码接线、相关类型/行为测试和开发浏览器走查，阶段交接不重复批准。

- 下游产品开发支持需求澄清 → 唯一 Product Spec（PRD）记录与确认 → 一个桌面端可交互 HTML 原型 → 自查、展示并登记 → 按已有授权实施。两类下游初始化安装完整项目级 Skills，并可交接需求原文；正式产品流程在成功下游运行；工程事务不预建业务 PRD/原型/登记记录，完整创建继续按真实事件生成，不写全局 Skills。
- 原型登记按稳定 scope 与修订绑定项目身份、当前 PRD 和唯一 HTML 的 SHA-256；不生成 A/B 备选或 Mobile 布局、不要求用户选择方案。未登记或内容漂移不能开发该设计范围，已有有效登记复用。日常小修复和无界面变更不强制重走流程。详细合同由 web-define-product、web-design-prototype 和 web-implement-change 串联维护。

- Web 使用 Vite、Mantine、TanStack Router 文件路由、TanStack Query、Jotai 与 i18next。
- Extension 使用 Plasmo、Chrome MV3 / Firefox MV2、Mantine、TanStack Router 代码路由、TanStack Query、Jotai 与 i18next；Popup 与 Options 分别持有 Router。
- 源 Harness 保留 Web-only `$web-implement-list-view`；Web 终端保留该 Skill 用于列表页、数据表格、后台列表与搜索结果，Extension 终端必须裁掉它且不复用 Web 列表路由恢复契约。
- 两类项目共享工程契约但不在同一仓库共享业务源码。
- `.harness/project.json` 是名称、标识、说明、唯一 `projectType` 和品牌事实源；Logo 母版固定为 `.harness/brand/logo-1024.png`。
- development、test、release 三环境完整存在；浏览器端只读取当前宿主四个已声明公开变量，逻辑 release 映射 production。
- 初始化器生成 Ky HTTP、1-based 分页、语言/认证 header、超时、401 handler、安全 logger 与 Release 检查基线，不生成业务 endpoint、伪远端 Query、占位事件总线或为展示而设的全局状态。
- 用户可见文案进入 i18next；可分享导航状态由 Router search 管理，会话态进入 `sessionStorage`，远端状态由 Query 管理，必要的跨组件客户端状态才由 Jotai 管理，组件局部交互留在 React；同一状态不得双重归属。Web 路由列表是封闭启动恢复例外：Router 始终是已应用列表状态的运行时 owner，仅在原始 URL 完全没有 owned key 时按 `listId` 读取一次 sessionStorage 快照；业务行和 `total` 只属于 Query。
- 列表形态按真实信息结构选择 Table、卡片或搜索结果，不强制 Table、选择、列偏好或 DnD。工程基础不生成业务列表、假 endpoint 或可选列表依赖。
- 保留 Mantine theme、十阶品牌色与语义令牌，外观偏好基础支持跟随系统、亮色与暗色；真实产品界面按 UI 规范定义标题、可访问状态和交互边界，不通过默认演示页面证明产品设计。

## Agent-first 执行契约

- 源 Harness 接收自身工程维护、固定初始化字段及可选创建需求输入。先明确 Web / Extension；有文档时由实例化委托需求定义只读分析界面需求，功能组合选择身份、权限、组织和其他独立能力，区分明确要求、建议与待确认项；无文档时澄清实际首页、页面、核心流程、数据模式和验收标准后继续。原文随 staging 事务交接到唯一成功下游，正式 PRD、原型与业务实施仅在下游进行，不要求用户重贴，不在源写产品记录或业务代码。创建与文档输入不授予凭据、浏览器权限、生产或发布授权。
- 日常范围清楚的工作直接实施并运行相关非空测试；行为保持重构追加全量测试。Work Plan 仅在用户明确要求、跨会话交接，或发布/高风险工作确需协调时创建。
- 用户可见左侧 Task 使用 `Task {序号} | {当前进度} | {单一结果}`，进度只取 `已分配`、`运行中`、`检查中`、`已完成`。内部 plan、Subagent 和 Worktree 不占用该序号或标题合同。
- 用户可见 Git Task 必须绑定真实 `threadId`、Git common dir、登记 Worktree 与派发前精确起始 OID；非 Git Task 绑定精确 cwd。首次编辑前复核绑定，写入型 Git Task 以本地提交、clean 工作树和报告 SHA 闭环。
- 推荐 Agent policy 固定为关闭自动用户 Task、关闭 superpowers、关闭内部并行、启用完整候选 smoke、关闭 E2E 建议；内部并行默认关闭不影响用户明确创建的左侧 Git Task。
- 初始化后的永久策略变更必须由用户明确确认并写入当日 ADR；同值按幂等 no-op，临时 Task 限制不得改写持久策略。
- `acceptance_smoke` 只在完整候选验收解析：硬要求优先，`enabled` 为 `required`，`disabled` 为 `not-required`，源 `pending` 在无硬要求时也是 `not-required`。它与本次发布的 E2E 选择相互独立；同一流程内构建、打包及修复重建复用已明确的选择，新字节仍重新验收。
- 初始化按工程规则“渐进式交互引导”逐项收集项目字段，再按条件确认 Agent policy；可靠配置建议可由用户回答接受，项目类型及最终创建不得默认确认；非交互调用必须显式给出全部必需决议。所有写入前冻结 source 文件、模式、Version 与可用 Git 身份，发布 staging 前再次逐字节复核；脚手架验证和裁剪完成后在 staging 建立独立 Git 根、受管 repo-local 身份/模板与恰好一个遵循当前中文提交规范的独立初始化基线提交。
- Git 提交 helper 只补齐缺失的生效身份，复用合法 Unicode/global 配置；模板与配置只写仓库 local/common-dir，失败回滚，不自动提交。
- 下游升级使用受保护双基线、不可弱化所有权、只读三方 plan、路径级批准、每次写后重规划与收敛后 record。
- 源 Harness 与各终端保留的 canonical `web-*` Skills 数量以 `AGENTS.md` Skills 地图为准。Skill 与参考资产是治理契约，不是已生成的产品功能。

## 质量与安全边界

- 受管 TypeScript/TSX 的稳定声明使用紧邻中文注释；不在运行时自动注入无意义注释。
- 人工维护前端代码 501–600 行提示职责复核，601 行起失败；其他受管文本 501–2000 行提示，2001 行起失败。
- 行为变化必须覆盖核心成功路径和最高风险失败路径；零相关测试不构成通过。
- 源 validator 必须跨 LF/CRLF 和 POSIX/Windows 风格相对路径稳定，并直接校验 `Version.md` 结构与升级 ownership manifest 的生产解析器合同。
- 源 validator 必须校验 Web 列表 Skill 的 canonical id、路由、必需 references/资产、可执行契约与宿主裁剪，防止只保留空目录或把 Web-only 能力泄漏到 Extension。
- 初始化目标必须位于源外空目录，并经同目标合作租约、身份绑定 sibling staging、单次安装、Git 初始化、唯一 local root commit 和原子 rename 发布；结果保持 clean 且无远端。父目录漂移时失败关闭且不清理替代树。Node 标准库不具备跨平台目录 no-replace flag，故意绕过租约的同机竞态不属于本协议保证。
- Extension 只申请真实功能所需最小权限，不使用远程托管可执行代码。
- Node.js、pnpm 与独立 CLI 工具全局安装或升级；项目运行时/开发依赖按 manifest 与锁文件本地安装，脚本使用声明版本。工具变更仅在已有授权范围内执行，完成后核对实际版本与可执行文件路径。
- 不在浏览器配置、日志、候选或提交中泄漏秘密；Release logger 仅保留批准字段并脱敏 URL、路径、Error stack/cause。
- 明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；新增目的地或范围外的生产数据、付费及不可逆副作用才补充授权。

## 明确排除

- Rust、Tauri、桌面 GUI、桌面 CLI/TUI/MCP、安装器、签名、公证和桌面发布链。
- 同仓库 Web + Extension、workspace、`apps/`、`packages/` 或创建第二宿主的入口。
- 初始化期间选择 E2E 或生成最终候选；最终构建在下游解析或复用本次发布的 E2E 选择。
- 将项目依赖改为全局安装、未经授权安装或升级工具、自动创建 PR/tag/发布或静默改写 Git 全局配置。

## 成功标准

- Web 和 Extension 都完整保留原型 Skill、发现元数据、PRD 参考及 Node 标准库摘要登记 helper；初始化表单增加可选详细需求输入，原文以冻结快照进入唯一项目基线、取消保持目标零写入、失败随事务回收，初始化输出没有业务 PRD、原型或登记记录。独立认证不默认带组织或权限，未选操作不生成；CLI 只交接原文，语义分析由 Agent 执行。摘要登记能阻断多文件输入、旧多方案记录、PRD/原型漂移、过期规格及无效文件输入。脚本只证明记录与文件绑定；是否继续实施由 Agent 依据用户原请求或暂缓指令决定，无需用户选型步骤。

- 源 Harness 验证器可确定性证明 Skills、治理文档、模板、初始化、环境、注释、行数、版本、升级所有权和安全边界一致。
- Web 与 Extension 均能从源外独立实例化，生成仓库只有其单一宿主所需文件、不保留派生入口，并各自拥有恰好一个独立本地基线提交且无远端。
- Web 生成结果保留 `$web-implement-list-view` 及完整参考资产，Extension 结果不含该 Skill；两者都不生成默认欢迎页、演示计数器、业务列表或未被真实消费的图标/DnD 依赖。
- 两类宿主用行为测试证明根布局挂载、语言同步、主题偏好、路由恢复与错误边界；不以默认演示页面、伪 Query 或不必要的 Jotai 证明产品完成。
- 两类下游在形成 Release 候选时通过各自格式、lint、类型、非空测试、构建、敏感信息扫描，以及当次 E2E 和完整候选 smoke 决议要求的真实 Chrome/Firefox 验收。
- 源发布提交与 `Version.md`、远端默认分支可回读一致；未实际执行的候选、E2E、发布和外部渠道操作保持 `Not run` 或 `Unverified`。

## 本轮确认依据

2026-10-19 用户明确确认“删除旧 SOP 和演示页面，保留工程基础”，新的初始化流程之后重新梳理。

2026-10-19 用户确认完整首版创建方案并要求各项能力采用固定设计与代码接线，购买依赖基础身份，权限控制路由和元素。此前 2026-10-15 用户明确要求调整现有模板：创建时询问 Web / 扩展，允许提供详细需求并分析基础布局、身份认证、权限和组织等能力；没有需求继续现有选择方式。随后用户要求重新梳理 Skill 归属；本轮将输入事务、需求/PRD、模块选择、实际原型和代码实施分别归现有独立拥有者，保留其余有效内容。
