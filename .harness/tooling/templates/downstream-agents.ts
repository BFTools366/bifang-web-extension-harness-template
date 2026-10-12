import type { ProjectConfig } from "../types.ts"

/** 按当前宿主生成终端 Agent 入口与 Skill 路由。 */
export function downstreamAgents(config: ProjectConfig): string {
  const hostSources =
    config.projectType === "web"
      ? "- `src/routes/`：文件路由源码；`src/routeTree.gen.ts` 是 Git 忽略的生成文件，不得手工编辑。\n"
      : ""
  const hostSkills =
    config.projectType === "web"
      ? "- `$web-implement-list-view`：创建、修改或审查可恢复、可访问的 React Web 列表页。\n- `$web-implement-saas-auth`：仅在明确采用 SaaS 的 Web 中完善或实施客户端/大后台认证 SOP。\n- `$web-implement-saas-commerce`：默认关闭，仅明确选中的 SaaS 客户端购买、订单与钱包 SOP。\n- `$web-implement-saas-admin`：仅明确采用 SaaS 大后台时设计与实施商品分类、组织成员、订单、权限与审计管理。\n"
      : "- `$web-review-extension-compatibility`：只读审查受影响宿主消费者的 Chrome MV3 / Firefox MV2 兼容证据。\n"
  const versionDescription =
    config.projectType === "web"
      ? "上海时区 `YYMMDDHHMMSS`"
      : "`package.json.version` 的稳定 SemVer（`X.Y.Z`）"
  const hostMinimumReading =
    config.projectType === "web"
      ? `Web 业务工作按 [Web 类型与可选能力](.agents/skills/web-design-prototype/references/prd-outline.md#web-类型与可选能力) 复用已确认 PRD 的业务模式和可选能力。宿主身份保持 \`web\`；首次需求读取 README 的“创建交接”并复用明确类型，已有已确认 PRD 时以其当前模式为准，不重复询问。按 [创建与开发 SOP](.agents/skills/web-design-prototype/references/prd-outline.md#创建与开发-sop) 交接；需求、原型、实施与 HTTP 接入复用同一事实。读取领域 Skill 只补充当前阶段的合同，随后返回调用方，不重新启动整套流程。

列表、数据表格、后台列表或搜索结果任务读取 \`docs/MANTINE_UI_GUIDELINES.md\` 与 \`docs/DATA_ACCESS.md\`，并在实施流程中调用 \`$web-implement-list-view\`。

明确采用 SaaS 客户端或大后台认证时，调用 \`$web-implement-saas-auth\`，复用用户操作流程和限定范围的 LocalStorage 凭据例外；工程创建只提供中性基线，不为普通站点自动增加认证。

明确选中 SaaS 客户端可选购买能力时，调用 \`$web-implement-saas-commerce\`。购买默认关闭，功能选择不授予权限。复用服务端钱包支付选项，重试支付前恢复原订单，确认成功后刷新账户数据；该能力不适用于 SaaS 大后台。

明确采用 SaaS 大后台管理时，调用 \`$web-implement-saas-admin\`。管理目标组织不切换操作者身份；保留历史订单快照，钱包/支付默认只读查询，管理命令遵守服务端权限与审计合同。

`
      : "Extension 变更涉及浏览器 API、消息、存储、后台生命周期、权限、CSP 或资源时，调用 `$web-review-extension-compatibility`；修复、测试与候选门禁由实施流程负责。\n\n"
  return `# 项目 Agent 指令

本仓库是已生成的 \`${config.projectType}\` 项目 **${config.name}**。保持平铺单包，不增加项目生成命令、多包工作区或第二种项目类型。

## 最小必读

先检查工作区并保护已有修改。读取本文件、\`.harness/project.json\` 和 \`docs/AGENT_POLICY.md\` 中的能力偏好、标题生命周期、持久计划、并行、冒烟与 E2E 规则。修改代码、测试、文档或配置前读取 \`docs/ENGINEERING_RULES.md\` 及命中的 Skill。主题、页面、Popup、Options、布局、组件、交互状态、响应式或 UI 无障碍工作读取 \`docs/MANTINE_UI_GUIDELINES.md\`；环境工作读取 \`docs/RUNTIME_CONFIGURATION.md\`；日志/错误处理读取 \`docs/LOGGING.md\`；分页、HTTP 请求头、认证、REST/OpenAPI、GraphQL、SSE、多个远端接口、多来源事件流或 RxJS 工作读取 \`docs/DATA_ACCESS.md\`。查阅或采用可选基础 API 与数据模型合同才读取 \`docs/API.md\`，收录文档不代表服务已配置或接入；其他事实按需读取。

${hostMinimumReading}授权范围包含有限 REST/GraphQL HTTP 接入或 API Mock 迁移时，调用 \`$web-connect-http-service\`；UI/路由呈现与候选验收仍由调用流程负责。\n\n既有工作树或登记表审计从主检出目录调用 \`$web-audit-worktrees\`，只读检查不授权清理。比较 Harness 或重新规划升级时调用 \`$web-preview-harness-upgrade\`；已批准的应用与基线登记由 \`$web-upgrade-harness\` 负责。\n\n独立事件分别委托 \`$web-review-api-contract\`、\`$web-review-module-boundaries\`、\`$web-implement-access-control\`、\`$web-implement-write-recovery\`、\`$web-implement-browser-storage\` 与 \`$web-implement-event-stream\`；未命中不调用。传入已确认范围、当前阶段和有效证据，叶子只完成当前职责后返回，不反向重启编排。完整读取命中的 Skill，参考资料只读适用阶段/宿主/协议章节。

## 事件驱动执行

新产品、新页面、显著交互改版或用户要求原型时，先用 \`$web-define-product\` 澄清并记录唯一产品规格（PRD），再用 \`$web-design-prototype\` 展示 2–3 个可交互 HTML 方案。等待用户明确选择具体版本，业务实施前运行 \`pnpm prototype:check <scope>\` 核对 \`docs/prototypes/<scope>/review.json\`。PRD 批准、推荐、沉默或含糊的“继续”不能代替选择。已有有效选择直接复用，不重复询问；PRD/原型变化会使旧选择失效。初始化只分发项目级 Skills，不生成业务 PRD、原型或选择记录。范围清楚的日常修复和无界面变更直接实施，只运行受影响检查与相关非空测试，但不能绕过同一范围内尚未完成的原型选择。多步骤、多模块、中等风险或用户可见本身不触发工作计划、全仓检查、构建、冒烟或 E2E。只有用户明确要求、跨会话交接或发布/高风险协调确有需要时才创建持久计划。行为保持重构运行全量单元测试。

安全/隐私、Extension 权限、不可逆数据、生产/付费/凭据副作用、公开兼容合同、完整候选验收和发布分别进入对应专用门禁。并行写入工作树必须同时满足用户本轮明确要求及 \`parallel_worktree_subagents: enabled\`。同一发布的构建、打包和修复复用已确认的 E2E 选择；没有选择也没有硬要求时才询问。每个新产物重新验证。明确发布请求覆盖既有目标与范围内必要的提交、推送和发布步骤，无需重复确认；仅新增目标或范围外副作用需要另行授权。

## 用户可见 Task 绑定

\`user_owned_tasks: disabled\` 禁止自动创建左侧 Task，但仍响应用户明确创建请求。一个用户可见 Task 交付一个稳定、可验证的结果；交付物类型、生命周期阶段、外部副作用、禁止范围或验收责任变化才新建 Task，同范围测试和修复留在原 Task。每个项目同一时间只允许一个写入型活动 Task，Task0 只协调、不执行业务。

创建、编号、绑定、恢复与状态转换调用 \`$web-manage-user-tasks\`，按当前策略执行并复读真实证据。只返回 \`clientThreadId\` 表示环境仍在准备，不授权实施；未取得真实 id、精确项目、非 pinned、cwd、ready 与适用 Git 基线/登记证据前保持零业务写入。绑定异常先修复原 Task，不创建替代 Task。

## 权威事实来源

- \`.harness/project.json\`：项目类型、身份与品牌元数据。
- \`.harness/brand/logo-1024.png\`：Logo 母版；派生资产必须统一刷新，不独立编辑。
- \`package.json\` 与 \`pnpm-lock.yaml\`：命令与依赖版本。
- 产品源码与测试：可执行行为。
${hostSources}- \`src/pagination/\`：受管 page/pageSize 会话状态与空页纠正合同。
- \`src/data/\`：API 及 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 访问；REST 负责主要交互，GraphQL 负责复杂查询与订阅，Dexie 仅用于 IndexedDB。本地能力无需 BaseURL，直接真实实现；只有未配置地址的远端 API 操作使用 Mock，详见 \`docs/DATA_ACCESS.md\` §3.1。
- \`src/data/storage/\`：集中的浏览器存储适配，保持独立生命周期并明确处理失败。
- \`src/data/api/client/\`：不含业务接口的 Ky HTTP、请求上下文、语言、凭据、错误和未授权处理基础。
- \`docs/API.md\`：完整的可选基础 API 与数据模型参考，包含来源和适配边界；仅按真实需求采用和拆解。
- \`docs/api/\`：按请求或公开 API 实际变化，由 \`$web-document-api\` 从当前代码生成模块文档与索引。实施/HTTP 流程只传入受影响模块与必要索引；参考合同、Mock 和已实现 HTTP 分别标明。
- \`docs/DATA_ACCESS.md\`：分页、请求头、认证、数据访问、SSE、可选 RxJS 与状态归属。
- \`docs/MANTINE_UI_GUIDELINES.md\`：Mantine 主题、令牌、布局、组件语义、交互状态、响应式、无障碍与当前宿主 UI 规范。
- \`docs/RUNTIME_CONFIGURATION.md\`：三环境、公开配置结构与构建映射。
- \`docs/LOGGING.md\`：结构化日志、错误边界、脱敏与正式产物检查。
- \`docs/\`：持久策略、工程、发布与技术债记录。
- 许可文件：法律文本；适用项目名称必须与当前项目身份一致。

## Web Harness 前端 Skill 地图

- \`$web-audit-worktrees\`：从主检出目录只读审计 Worktree 与并行登记，不自动清理。
- \`$web-check-development-environment\`：只在首次初始化或命令已报出环境错误时检查 Node.js、pnpm 与按需使用的 Google Chrome/Firefox。
- \`$web-configure-git-commits\`：只在用户明确要求，或下一步将实际创建提交时，检查并配置仓库本地 Git 身份与受管提交模板。
- \`$web-connect-http-service\`：在已初始化下游接入已批准服务，验证域 API、Mock 退出与缓存切换。
- \`$web-define-product\`：在下游澄清需求，将范围和验收标准记录为唯一产品规格（PRD）。
- \`$web-design-prototype\`：在下游产出 2–3 个可交互 HTML 原型，等待用户选定具体版本后交接开发。
- \`$web-document-api\`：根据当前 API 实现、类型与相关测试整理 \`docs/api/\`，每个模块独立成文并明确 Mock 和未知边界。
- \`$web-extract-i18n-strings\`：维护基于 i18next 的完整前端国际化文案。
- \`$web-plan-change\`：只在用户明确要求持久计划、跨会话交接或发布/高风险协调确有必要时建立 Todo。
- \`$web-review-api-contract\`：只读核对当前接口来源、实现关联与差异，不联网或写文档。
- \`$web-review-module-boundaries\`：只读定位职责、依赖与状态拥有者，返回有证据的拆分建议。
- \`$web-implement-access-control\`：按既有身份和权限统一菜单、路由与动作访问控制。
- \`$web-implement-write-recovery\`：处理当前写操作的防重复、未知查询、冲突及成功后刷新。
- \`$web-implement-browser-storage\`：实现真实本地存储访问、校验、迁移及失败反馈。
- \`$web-implement-event-stream\`：按实际协议实现持续事件的连接、恢复和状态投影。
- \`$web-manage-user-tasks\`：按策略管理左侧 Task 的真实编号、绑定、恢复与进度。
- \`$web-implement-change\`：实施并验证已批准的 Web Harness 前端变更。
${hostSkills}- \`$web-refactor-code\`：在保持行为不变时整理 TypeScript/TSX 前端代码。
- \`$web-prepare-brand-identity\`：同步当前前端宿主的 Logo 与品牌元数据。
- \`$web-run-parallel-worktrees\`：仅在用户当前明确要求且策略启用时，隔离并协调写入范围互不重叠的前端并行工作。
- \`$web-summarize-development-history\`：只读追溯项目记忆与 Git 历史，区分已决定、已实现、已验证与推测。
- \`$web-test-final-artifact-e2e\`：逐个在当前目标的真实 Chrome/Firefox 中测试精确前端候选产物。
- \`$web-prepare-release\`：整理 Web Harness、Vite dist 或 Chrome MV3 / Firefox MV2 zip 发布候选。
- \`$web-preview-harness-upgrade\`：只读比较工程候选与目标，按需保存外部计划报告。
- \`$web-upgrade-harness\`：保留产品所有权并同步较新的 Web Harness 前端工程层。
- \`$web-verify-delivery\`：运行并报告 Web Harness 前端交付门禁。

## 设计风格支持

项目级 \`.agents/skills/design-taste-frontend/SKILL.md\` 提供落地页、作品集和视觉改版的风格建议；适用设计任务先读取 \`docs/MANTINE_UI_GUIDELINES.md\` 的设计支持边界再调用 \`$design-taste-frontend\`。它独立于规范标识为 \`web-*\` 的维护 Skills，不自动用于数据表、后台工作流或 Extension Popup/Options。项目的 Mantine、纯 TypeScript、Query/Jotai、i18n、宿主权限和日常验证规则优先；上游 Tailwind、Next、动画、字体与组件库偏好不授权新增依赖、远程资源、浏览器检查、构建或其他外部操作。有效已有版本由项目维护，Harness 升级保留它。

## 验证闭环

主动修改身份后运行 \`pnpm harness brand refresh\`。日常工作只运行本次所需的相关非空测试或最小替代检查，通常使用 \`pnpm test:related <changed-source...>\`；零测试不是通过证据，依赖图未发现测试时改跑所属测试文件。不自动追加格式、lint、类型、全仓检查或构建。全量单元测试仅由 \`pnpm build\`/正式发布流程或显式行为保持重构触发。同一发布复用已确认 E2E 选择，并传入 \`--e2e=enabled|disabled\`。产物构建统一为 \`pnpm build\` → \`build:release\`，负责环境、Harness、格式、lint、类型、全量测试门禁、${versionDescription} 页面版本注入${
    config.projectType === "extension" ? "、浏览器包自包含检查" : ""
  }及 \`pnpm release:inspect\`。构建命令、页面版本、E2E 选择和测试/检查结果只留在命令输出与当次报告，不创建或更新工作计划、ADR、状态、变更记录、验收记录等持久项目记忆。开发和测试环境不生成最终产物。人工维护代码在 501–600 行复核内聚与职责，601 行起必须拆分。明确报告跳过或阻断的检查，不以局部证据宣称完整通过。
`
}
