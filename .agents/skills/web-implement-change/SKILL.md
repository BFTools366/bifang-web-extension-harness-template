---
name: web-implement-change
description: 在 Web Harness 或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游中直接实施范围清楚的请求，或执行已由独立事件触发的活动 Work Plan，只运行本次变化需要的相关非空测试或最小替代检查；候选验收失败后回到此 Skill 修复。
---

# Web Harness：实施前端变更

完成当前授权范围，保护用户修改，不为了流程或复用想象扩大工程。

## 工作流程

用户可见 Task 的创建、编号、绑定、恢复与进度委托 `$web-manage-user-tasks`；只在项目长期开关或用户明确请求触发时调用，普通实现不创建左侧 Task。内部 Subagent 不占用 Task 编号。

1. 直接实现当前授权范围。多步骤、多模块、中等风险或 Agent 偏好本身不创建 Work Plan、全仓检查、构建、冒烟或 E2E；安全/隐私、Extension 权限、不可逆数据、生产/付费/凭据副作用、对外兼容契约和正式发布分别进入解决该风险所需的专用门禁。
   结果超出当前固定 Task 边界时，先由 Task 管理完成必要创建/绑定；同一结果的测试、review 与同范围修复留在原 Task，不为多步骤拆分。
2. 先识别仓库：存在 `.harness/project.json` 时是唯一类型下游；否则仅在根 manifest 暴露源专用 `instantiate` 入口时按 Harness 源处理。读取 Agent Policy、工程规则、Git 根/分支/状态和受影响代码；创建入口与终端化硬约束直接遵循根 `AGENTS.md`，不在本 Skill 重写全文。只在相关时读取 Product Spec、活动 Work Plan、ADR、Verification 或技术债。
3. 确认 Git 顶层目录等于项目根，先检查 diff 并保留用户修改；重叠无法安全处理时停止。实际左侧 Task 在首次写入前由 `$web-manage-user-tasks` 核对精确身份、项目、非 pinned、cwd、环境与基线；只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入，绑定异常先修复原 Task，不代做。
4. 只有实际创建新下游时调用一次 `$web-check-development-environment`；普通代码、测试、lint、typecheck、最终 Release 构建、新会话或 Agent 切换都直接执行，不做环境预探测。命令已失败且错误明确指向工具链/宿主/Chrome 环境时才调用该 Skill 诊断相关组件；纯文档/元数据任务跳过。
5. 默认单 Agent 实施。只有用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、存在至少两个写入所有权不重叠的单元且 Git 基线干净已提交时才调用 `$web-run-parallel-worktrees`；任何一项缺失都保持单 Agent。
6. 下游的新产品、新页面、显著交互改版或用户要求原型时，先由 `$web-define-product` 澄清并记录唯一 PRD，再由 `$web-design-prototype` 生成一个桌面端可交互 HTML 原型，自查、展示并登记，不做 A/B 选择或 Mobile 设计。业务实现前读取本轮 `docs/prototypes/<scope>/review.json` 并运行 `pnpm prototype:check <scope>`；PRD、原型漂移或尚未登记时不能进入该范围开发。已有有效登记且检查通过就复用，不要求用户选择方案或追加原型批准；用户要求暂缓开发时仍暂缓。范围清楚的日常小修复、无界面变更及 Harness 自身维护不强制重做 PRD/原型，但不能绕过尚未完成自查登记的同一设计范围。
7. 没有活动计划时实现最小完整行为；存在由独立事件触发的活动计划时选择依赖已满足的首个非 `done` Todo，标记 `in_progress`，通过必需检查后才标记 `done`。

已初始化 Web 的业务工作按 [Web 类型与可选能力](../web-design-prototype/references/prd-outline.md#web-类型与可选能力) 恢复唯一 PRD 的类型和购买开关，仅对本次受影响的 SaaS 认证、已选客户端购买或后台管理读取对应 Skill 合同。范围清楚的日常修复直接复用，不重启产品定义；未选择购买不生成相应菜单、路由或 API。此规则不适用于 Harness 自身维护或 Extension。

## 实现边界

1. 下游只修改 `.harness/project.json` 声明的唯一类型，不增加另一类型入口、项目派生入口、workspace package 或跨项目共享层；源 Harness 模板契约遵守根 `AGENTS.md` 的唯一源外创建入口与两个互斥生成结果硬约束。
2. 按功能内聚组织 TypeScript：
   - 文件结构与模块边界遵循 `docs/ENGINEERING_RULES.md` 的“文件结构与模块依赖”（源 §3.2）：按功能或工具职责拆解，保持单一职责、单向无环依赖和明确公共契约；不以行数达标代替结构判断。
   - React 组件拥有展示、表单输入和局部交互；可复用 feature hook/service 拥有该功能的请求、缓存、持久化和协调。
   - TanStack Query 统一管理 REST/GraphQL 有限读取的请求前缓存与远端/异步服务状态；feature 共享 Query options 和当前上下文 QueryClient，缓存已校验领域数据，Ky/client 不建结果缓存。新鲜度与入口按 `docs/DATA_ACCESS.md` §2.7；Jotai 只管理确需跨组件共享的客户端交互状态，不镜像 Query 数据。
   - API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 统一在 `src/data/`；存储访问经 `data/storage/`，REST 主交互、GraphQL 复杂查询/订阅与 Dexie 的 IndexedDB 边界按 `docs/DATA_ACCESS.md` §1.1–1.3 执行。
   - 业务判断放在最靠近真实功能且可单测的模块，不塞进 JSX、通用 `utils` 或无领域含义的 manager。
3. 主题、页面、Popup、Options、布局、组件、交互状态、响应式或 UI 无障碍变化先读取 `docs/MANTINE_UI_GUIDELINES.md`，复用 Mantine theme、语义令牌和当前宿主模式，不散落品牌常量、不建立第二套基础组件系统。`projectType=web` 的列表页、数据表格、后台列表或搜索结果还必须调用 `$web-implement-list-view`；Extension Popup/Options 不调用该 Skill。
4. Web 使用 Vite/React 的既有路由与页面约定，不替换 Mantine、TanStack Router/Query、Jotai 或 i18next 技术基线。路由布局、正文插槽、稳定 shell 与类型化 Link 组合按 UI 规范；路由目录只放生产路由，不使用测试后缀命名业务页。源码可读性与类型化组合按工程规则，不以断言或压缩格式规避合同。
5. Extension 保持同一 Plasmo 单包的 Chrome MV3 / Firefox MV2 合同。已初始化下游的变更触及浏览器 API、消息、Storage、后台、权限、CSP 或资源时调用 `$web-review-extension-compatibility`；调用方负责修复与相关双目标测试，源模板维护按工程事实源核对兼容。最终 manifest 由 Plasmo 动态派生，共享 override 不固定 manifest_version。新增或扩大权限必须取得明确批准，并经既有候选链执行权限、安全及两个真实浏览器专项门禁。
6. 面向用户的新文案通过既有 `i18next`/`react-i18next` 资源，不引入第二套 i18n 机制。
7. 环境或 endpoint 变化读取 `RUNTIME_CONFIGURATION.md`：业务代码只读 `APP_CONFIG`，保持 development/test/release 三份配置、宿主前缀和构建前全量校验；禁止隐式环境覆盖，浏览器公开变量不承载秘密。已初始化下游授权包含有限 REST/GraphQL HTTP 接入或 Mock 迁移时，域 API 部分委托 `$web-connect-http-service`；源 Harness 不接收产品地址或接口。
8. 日志或错误处理变化读取 `LOGGING.md`：产品代码通过统一 logger，新增稳定作用域、事件名和最小上下文；覆盖 Release 级别、允许字段清单、脱敏与产物扫描，不新增散落 `console.*`。
9. 集合分页与 HTTP client 基础维护读取 `DATA_ACCESS.md`，复用 `src/pagination/` 与 `src/data/api/client/`。Query 使用 `requestHttpQuery` 并只反馈最终失败；通用集合使用 session 状态机，Web 路由列表按 `$web-implement-list-view` 由 Router 拥有运行时状态，sessionStorage 只在原始 URL 无 owned key 时启动恢复。业务行与 `total` 归 Query/feature；真实接入的响应/分页映射由 `$web-connect-http-service` 在域 API 边界完成。
10. 未配置对应 BaseURL 时，按 `DATA_ACCESS.md` §3.1 只将依赖该远端 API 的操作放在 `src/data/api/<domain>/` 的类型化异步 Mock API；UI、route、hook 和 Query 只消费这些 API 函数。本地能力直接真实实现，不要求 BaseURL，纯业务逻辑留在 feature，真实存储访问经 `src/data/storage/`；混合流程仅隔离未配置的远端边界，不把本地部分一并 Mock。Mock 是当前远端 API 契约的完整实现，不是 stub 或占位；已接入真实 HTTP 的服务移除运行路径中的 Mock，失败不回落 Mock。不得留下 stub、占位分支、假产物路径或只在源码中存在但真实入口不可达的能力，也不得把 Mock 结果声明为真实联网通过。
11. 下游公开 API 操作新增、移除或请求/响应、认证、错误、副作用及传输方式实际变化时，委托 `$web-document-api` 同步**受影响模块与必要索引**，明确传入范围，避免默认扫描全项目。仅内部重构且公开契约未变时不强制重写文档；参考契约仍不能作为实现证据。

## 按事件委托独立能力

只委托当前变化实际需要的部分，传入已确认范围、事实来源、当前阶段与已有验证；叶子完成后返回此处，不重新启动定义/原型/实施/接入。

| 当前事件                     | 委托与结果                                                             |
| ---------------------------- | ---------------------------------------------------------------------- |
| 模块耦合、职责或依赖需要审查 | `$web-review-module-boundaries` 返回只读地图与建议；简单实现不强制审查 |
| 当前接口契约缺失、冲突或漂移 | `$web-review-api-contract` 返回关联与缺口；不联网                      |
| 权限入口或撤权变化           | `$web-implement-access-control` 统一菜单、路由与动作判定               |
| 重复提交、写入未知或冲突     | `$web-implement-write-recovery` 处理当前领域恢复，不改变允许状态       |
| 真实本地存储访问或迁移       | `$web-implement-browser-storage` 实施数据访问与失败语义                |
| 真实持续推送或多来源时序     | `$web-implement-event-stream` 实施适用协议与生命周期                   |

## 测试与验证

1. 行为变化新增或更新非空测试：成功路径、最高风险失败和缺陷回归。组件交互用 Testing Library；纯函数/服务用 Vitest；Extension 对受影响目标分别覆盖消息、storage、权限拒绝和不支持/异步差异，单一 Chrome mock 不能证明 Firefox 兼容。
2. 日常实现只运行第 1 项新增或更新的相关非空测试；通常使用 `pnpm test:related <changed-source...>`，零测试时改跑所属测试文件或记录相称最小替代检查，不得把空批次声明为通过。实际左侧 Task 的检查/修复状态转换由 `$web-manage-user-tasks` 处理；纯文档、元数据或机械变化只做证明解析或差异完整的必要检查。
3. 日常开发不得自动追加格式化、lint、typecheck、集成/契约、全仓测试、构建、文件行数、中文声明注释、冒烟或 E2E。只有本次变化确实需要、用户明确请求，或正式候选/产品/安全/权限/渠道硬要求时才运行对应门禁；任一已经运行的检查失败仍在当前授权范围内修复并重跑。行为保持重构按 `$web-refactor-code` 运行全量测试。
4. 只有用户明确请求最终产物/完整验收、当前任务正在形成发布候选，或产品、安全、权限、渠道存在真实候选硬要求时才运行唯一 `pnpm build`。同一发布流程复用已明确的 E2E 选择并传入 `--e2e=enabled|disabled`；尚无选择且无硬要求时才询问一次，有硬要求时执行 `enabled`。重建或打包后仍重新验收新候选。构建固定委托 `build:release`，并拥有环境、Harness、格式、lint、类型、全量测试、Web 上海时间 `YYMMDDHHMMSS` 或 Extension `package.json.version` 稳定 SemVer 的版本注入、生产构建和 `release:inspect` 门禁。模板输出契约需要完整验收时，还要在隔离目录生成并验证 Web 与 Extension，但每个下游只生成自身 Release 候选，不生成 development/test 产物。
5. 本次变化确实涉及职责或体积时，检查人工维护文件：终端下游 501–600 行复核业务高内聚与单一职责，601 行起必须按业务职责拆分到同一功能或工具模块目录；源 Harness 代码同样使用 500/600，其他受管文本按 `docs/ENGINEERING_RULES.md` 的 500/2000 边界执行。不得压缩格式或建立跨模块兜底目录规避。
6. 修复范围内失败并重跑。涉及 Release 构建时确认 `build:release`（及 Extension `package`）在宿主命令后自动通过 `pnpm release:inspect`，并验证两目标页面包含当次构建版本，两个目标构建或检查任何一个失败都必须修复；需要复核既有产物时直接运行该脚本。本 Skill 不直接运行冒烟或 E2E；当次选择 `enabled` 时把精确候选交给 `$web-verify-delivery` 执行批准的 E2E，选择 `disabled` 时记录 `Not run`，不把开发服务器或单元测试声明为真实产物验收。
7. 发布候选、用户明确要求完整验收、当前构建启用 E2E 或浏览器硬要求时交给 `$web-verify-delivery`；存在活动 Work Plan 时先要求相关 Todo 全部 `done`。没有这些独立事件的日常实现，在本次必要测试或最小替代检查通过后直接报告。

## 项目记忆

只按独立事件触发：范围变化转 `$web-define-product`；长期决定/硬例外写 ADR；真实发布完成、重要阻断、跨会话交接或用户要求时写 Status；用户可见新增/变化/移除/安全事项按 Changelog 索引规则处理。普通缺陷修复、纯重构、格式和测试补强不自动创建这些文件；构建命令、时间版本、E2E 选择与构建/验收结果只在命令输出和当前任务交付说明中报告，不创建或更新 Work Plan、ADR、Status、Changelog、Verification 或其他持久项目记忆。

## 完成输出

报告路径、变更、每项公开行为的“入口 → 实现 → 测试”映射、权限变化、实际检查与修复、Todo 状态、未运行项和剩余风险。实际用户可见 Task 的适用提交、clean 与完成状态由 `$web-manage-user-tasks` 核对，不复制创建/状态流程。明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；仅要求实施不触发外部发布，新增目的地或范围外副作用才补充授权。
