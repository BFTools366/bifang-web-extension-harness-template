/** 保存源 Harness 唯一允许的 31 个 Web Skill canonical id。 */
export const EXPECTED_SKILLS = [
  "web-compose-capabilities",
  "web-implement-access-control",
  "web-implement-browser-storage",
  "web-implement-event-stream",
  "web-implement-write-recovery",
  "web-manage-user-tasks",
  "web-review-api-contract",
  "web-review-module-boundaries",
  "web-audit-worktrees",
  "web-check-development-environment",
  "web-configure-git-commits",
  "web-connect-http-service",
  "web-curate-harness-memory",
  "web-define-product",
  "web-design-prototype",
  "web-document-api",
  "web-extract-i18n-strings",
  "web-implement-change",
  "web-implement-list-view",
  "web-instantiate-project",
  "web-plan-change",
  "web-prepare-brand-identity",
  "web-prepare-release",
  "web-preview-harness-upgrade",
  "web-refactor-code",
  "web-review-extension-compatibility",
  "web-run-parallel-worktrees",
  "web-summarize-development-history",
  "web-test-final-artifact-e2e",
  "web-upgrade-harness",
  "web-verify-delivery"
] as const

/** 描述单个源 Skill 的可发现身份与中文 UI 元数据。 */
export interface SkillContract {
  /** 锁定 SKILL.md frontmatter 中的完整中文描述。 */
  description: string
  /** 锁定 SKILL.md 中唯一的一级标题。 */
  title: string
  /** 锁定 Codex Skill 列表中的中文展示名。 */
  displayName: string
  /** 锁定 Codex Skill 列表中的中文简介。 */
  shortDescription: string
  /** 锁定显式调用当前 canonical id 的单句中文默认提示。 */
  defaultPrompt: string
}

/** 锁定 31 个源 Skill 的 frontmatter、H1 与 openai.yaml 唯一合法值。 */
export const SKILL_CONTRACTS = {
  "web-implement-access-control": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，按当前服务端权限契约实现或修复菜单、路由和动作访问控制及撤权处理；只消费既有身份与作用域，不负责登录、凭据存储或权限获取，不把功能开关或前端隐藏当成授权。",
    title: "# Web Harness：实施访问控制",
    displayName: "Web Harness：实施访问控制",
    shortDescription: "按已确认的权限契约统一菜单、路由和动作控制，处理撤权与作用域变化",
    defaultPrompt:
      "使用 $web-implement-access-control 按已有服务端权限契约实现或修复受影响入口的访问控制，保持统一判定、默认拒绝和撤权隔离。"
  },
  "web-implement-browser-storage": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，为真实本地功能实施或修复 Cookie、Web Storage、Memory、IndexedDB 或宿主存储的访问、校验、迁移和失败处理；保持数据与生命周期归属，不预建通用仓库或默认扩大凭据持久化。",
    title: "# Web Harness：实施浏览器存储",
    displayName: "Web Harness：实施浏览器存储",
    shortDescription: "为真实本地功能实现存储校验、迁移和失败处理，保持生命周期与数据归属",
    defaultPrompt:
      "使用 $web-implement-browser-storage 为当前真实功能实施或修复浏览器存储访问、校验、兼容迁移和失败反馈，保持既有领域与凭据边界。"
  },
  "web-implement-event-stream": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，按真实协议实施或修复 SSE、GraphQL Subscription 及持续多来源事件的适配、生命周期、恢复和状态投影；按需采用 RxJS，不从查询接口推断推送，不建立全局事件总线或默认扩大宿主权限。",
    title: "# Web Harness：实施持续事件流",
    displayName: "Web Harness：实施持续事件流",
    shortDescription: "按真实推送协议实现事件适配、连接清理、恢复与单一状态投影",
    defaultPrompt:
      "使用 $web-implement-event-stream 按当前真实事件协议实现或修复连接生命周期、取消恢复、事件校验和状态投影，仅按需采用 RxJS。"
  },
  "web-implement-write-recovery": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，实施或修复写操作的重复提交、并发冲突、超时未知结果与成功后刷新恢复，按真实服务契约处理幂等及作用域；不改变领域允许状态，不自动重放或授予真实资金和生产写入。",
    title: "# Web Harness：实施写操作恢复",
    displayName: "Web Harness：实施写操作恢复",
    shortDescription: "处理重复提交、并发冲突、超时未知结果及写入成功后的精确刷新恢复",
    defaultPrompt:
      "使用 $web-implement-write-recovery 按当前写操作的真实契约完善幂等、未知结果查询、冲突和成功后刷新恢复，避免重复副作用。"
  },
  "web-manage-user-tasks": {
    description:
      "按 Web Harness 或已初始化下游的项目策略管理 Codex 左侧用户可见 Task 的创建、编号、精确绑定、恢复和进度转换；只在长期开关已启用或用户明确要求时创建，不用内部 plan、Subagent 或普通 Worktree 代替，不执行目标 Task 的业务。",
    title: "# Web Harness：管理用户可见 Task",
    displayName: "Web Harness：管理用户可见 Task",
    shortDescription: "按项目策略管理左侧 Task 的创建、编号、绑定、恢复与真实进度转换",
    defaultPrompt:
      "使用 $web-manage-user-tasks 按当前项目策略管理用户可见 Task，核对真实身份与绑定，保留原结果并如实返回状态和证据。"
  },
  "web-review-api-contract": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，只读核对当前操作的可信接口契约与 API 实现、类型、调用方及测试，输出关联、差异和阻断缺口；用于接入前核对或契约漂移审查，不联网、不接入服务、不生成接口文档。",
    title: "# Web Harness：核对 API 契约",
    displayName: "Web Harness：核对 API 契约",
    shortDescription: "只读核对接口契约与 API 实现的关联、差异和当前操作的阻断缺口",
    defaultPrompt:
      "使用 $web-review-api-contract 为当前操作核对可信接口契约与 API 实现，返回来源、关联、差异和待确认项，不联网或修改实现。"
  },
  "web-review-module-boundaries": {
    description:
      "只读审查 Web Harness 工具与模板或 React Web、Plasmo Extension 下游的模块职责、依赖方向、公共边界及状态和副作用归属，输出有代码证据的拆分建议；用于结构评审或重构前定位，不修改源码、不自动重构或测试。",
    title: "# Web Harness：审查模块边界",
    displayName: "Web Harness：审查模块边界",
    shortDescription: "只读定位模块职责、依赖方向与状态归属问题，给出有证据的拆分建议",
    defaultPrompt:
      "使用 $web-review-module-boundaries 只读梳理指定范围的职责、依赖和状态拥有者，给出有代码证据的模块边界与拆分建议。"
  },
  "web-preview-harness-upgrade": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，只读比较已验证 source Harness、当前宿主候选投影和目标基线，冻结所有权与 Git 状态并输出逐路径升级计划。不修改目标工程，可选创建外部计划报告；不应用、记录基线或迁移所有权授权。",
    title: "# Web Harness：预演工程基线升级",
    displayName: "Web Harness：预演工程基线升级",
    shortDescription: "只读比较工程候选与目标基线，输出逐路径冲突和升级影响计划",
    defaultPrompt:
      "使用 $web-preview-harness-upgrade 冻结 source、候选与目标事实，只读输出工程升级计划和需人工处理的路径。"
  },
  "web-audit-worktrees": {
    description:
      "在 Web Harness、React Web 或 Plasmo Extension 仓库中，从 primary checkout 只读审计 Git Worktree、并行单元登记、孤立候选和陈旧记录。用于检查现状、恢复证据或清理前核对；不创建、验证、整合、删除或修复 Worktree，不要求并行创建开关启用。",
    title: "# Web Harness：审计工作树",
    displayName: "Web Harness：审计工作树",
    shortDescription: "只读核对 primary 工作树、并行单元登记及孤立和陈旧记录",
    defaultPrompt:
      "使用 $web-audit-worktrees 只读检查当前项目的工作树与并行登记，并报告恢复证据和待处理问题。"
  },
  "web-check-development-environment": {
    description:
      "检查 Web Harness、纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目所需的 Node.js、pnpm 和 Google Chrome/Firefox 环境。只用于新下游首次初始化，或命令已经失败且错误指向工具链/浏览器环境时的诊断；普通开发与构建前不预探测。",
    title: "# Web Harness：检查前端开发环境",
    displayName: "Web Harness：检查前端开发环境",
    shortDescription: "仅在初始化或环境报错后检查 React Web/Plasmo 工具链",
    defaultPrompt:
      "使用 $web-check-development-environment 仅在新下游首次初始化，或命令已报出疑似环境错误时检查纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 所需的 Node.js、pnpm 与按需使用的 Google Chrome/Firefox。"
  },
  "web-configure-git-commits": {
    description:
      "仅在用户明确要求配置 Git，或下一步将实际创建提交时，为 Web Harness、React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 独立仓库即时检查并补齐仓库本地身份、安装并检查受管提交模板；不得因打开、检查或编辑仓库而提前配置，不修改全局配置，也不自动提交。",
    title: "# Web Harness：配置 Git 提交",
    displayName: "Web Harness：配置 Git 提交",
    shortDescription: "检查并安全配置仓库本地 Git 身份与受管提交模板约定",
    defaultPrompt:
      "使用 $web-configure-git-commits；仅当我明确要求配置 Git，或下一步将实际创建提交时，才检查有效身份、只为缺失字段写仓库本地回退，并安装检查受管提交模板。"
  },
  "web-connect-http-service": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，把已授权服务的类型化 API Mock 迁移到真实 HTTP，或接入已批准的真实 endpoint，处理配置、域契约、响应映射、缓存切换及相关验证；不从 BaseURL 猜接口，不扩张凭据、生产或权限授权。",
    title: "# Web Harness：接入真实 HTTP 服务",
    displayName: "Web Harness：接入真实 HTTP 服务",
    shortDescription: "将已批准的下游 API Mock 接入真实 HTTP 并验证迁移边界",
    defaultPrompt:
      "使用 $web-connect-http-service 接入已批准的真实 HTTP 服务并验证 Mock 迁移、域契约和缓存切换。"
  },
  "web-curate-harness-memory": {
    description:
      "仅在 Web Harness 源根中整理自身 ADR 与 Changelog 历史：把已被后续决定完整取代且不再被当前规范引用的条目原文迁移到同目录只追加历史卷。用于文件超过建议阈值或负责人明确要求整理时；不得随 React Web 或 Plasmo MV3 下游派生。",
    title: "# Web Harness：治理 Harness 自身记忆历史",
    displayName: "Web Harness：治理源记忆历史",
    shortDescription: "仅在源 Harness 中保守迁移已完整取代的 ADR/Changelog",
    defaultPrompt:
      "使用 $web-curate-harness-memory 整理 Web Harness 源中已被完整取代且不再被引用的 ADR 或 Changelog 条目，并原文追加到历史卷。"
  },
  "web-define-product": {
    description:
      "在已初始化的 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游澄清需求，将用户、问题、范围、约束和验收标准记录为 Product Spec（PRD），确认后交给单一桌面原型设计或范围明确的实现。用于新产品、模糊需求或产品边界变化；不参与上游初始化，也不为日常小修复强制编写 PRD。",
    title: "# Web Harness：定义前端产品",
    displayName: "Web Harness：定义前端产品",
    shortDescription: "在下游澄清产品需求并保存唯一 PRD，确认范围后进入单一桌面原型设计",
    defaultPrompt:
      "使用 $web-define-product 在当前已初始化下游澄清需求并记录 Product Spec（PRD），确认范围后进入单一桌面原型设计流程。"
  },
  "web-design-prototype": {
    description:
      "在已初始化的 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游，将已澄清的 PRD 转为一个桌面端可交互 HTML 原型，自查并登记内容摘要后交接开发。用于新产品、新页面、显著交互改版或用户要求原型；不生成 A/B 多方案或 Mobile 布局，不参与上游创建下游，也不为日常小修复强制重做原型。",
    title: "# Web Harness：设计单一桌面原型",
    displayName: "Web Harness：设计单一桌面原型",
    shortDescription: "根据已确认 PRD 生成一个桌面交互原型，自查登记后按已有授权交接开发",
    defaultPrompt:
      "使用 $web-design-prototype 在当前已初始化下游根据 PRD 生成一个桌面端可交互 HTML 原型，自查并登记内容摘要后按已有授权交接开发，不生成 A/B 备选方案或 Mobile 布局。"
  },
  "web-document-api": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，同步导出按业务聚合的 API 与已实现业务流程说明；每次核对已有文档和当前代码差异，以通用结构、API 元数据、接口文档及业务关联交付，不输出本地代码和路径。",
    title: "# Web Harness：同步导出 API 与业务文档",
    displayName: "Web Harness：同步导出 API 与业务文档",
    shortDescription: "按业务聚合 API 与已实现流程，每次核对代码差异并维护双向关联",
    defaultPrompt:
      "使用 $web-document-api 同步导出 API 与已实现业务说明：一份通用结构、一份 API 元数据与按业务聚合的接口文档，维护业务关联，每次核对已有文档和代码差异，不输出本地代码与路径。"
  },
  "web-extract-i18n-strings": {
    description:
      "扫描当前纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端的 TSX 用户可见文案，将硬编码字符串迁移到既有 i18next/react-i18next 资源，同时保持默认语言行为。用于已有 React i18n 基线的前端文案整理；不处理 manifest、本地化之外的品牌元数据或非 React 机制。",
    title: "# Web Harness：提取前端国际化文案",
    displayName: "Web Harness：提取前端国际化文案",
    shortDescription: "将 React Web 或 Plasmo MV3 Extension 可见文案迁移至 i18next",
    defaultPrompt:
      "使用 $web-extract-i18n-strings 将纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端界面中的用户可见文案迁移至 i18next 资源。"
  },
  "web-implement-change": {
    description:
      "在 Web Harness 或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游中直接实施范围清楚的请求，或执行已由独立事件触发的活动 Work Plan，只运行本次变化需要的相关非空测试或最小替代检查；候选验收失败后回到此 Skill 修复。",
    title: "# Web Harness：实施前端变更",
    displayName: "Web Harness：实施前端变更",
    shortDescription: "实施 Web Harness 或其 React Web、Plasmo MV3 前端下游变更",
    defaultPrompt:
      "使用 $web-implement-change 在 Web Harness 或其纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游中实施并验证当前范围内的前端变更。"
  },
  "web-implement-list-view": {
    description:
      "为单 package React Web 下游创建、修改、重构或审查重复记录的列表页、数据表格、后台列表与搜索结果页，并统一路由恢复、Query 分页、状态反馈和可访问性。仅用于 projectType=web；Extension Popup/Options 不调用。",
    title: "# Web Harness：实施 React 列表页",
    displayName: "Web Harness：实施 React 列表页",
    shortDescription: "统一实现可恢复、可访问的 React Web 列表体验",
    defaultPrompt:
      "使用 $web-implement-list-view 创建或审查一个路由、分页、状态反馈和可访问性一致的 React Web 列表页。"
  },
  "web-instantiate-project": {
    description:
      "通过源 Web Harness 唯一公开入口向源外空目录创建全新的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游，安全重置模板身份并建立独立 Git 根。用于创建单一类型前端项目；不得用于原地初始化或修改已初始化项目。",
    title: "# Web Harness：实例化前端项目",
    displayName: "Web Harness：实例化前端项目",
    shortDescription: "从源 Web Harness 创建独立的 React Web 或 Plasmo MV3 前端项目",
    defaultPrompt:
      "使用 $web-instantiate-project 从源 Web Harness 创建独立、单一类型的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目。"
  },
  "web-plan-change": {
    description:
      "为 Web Harness 或纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游创建可直接实施的精简 Todo。只在用户明确要求持久计划、跨会话交接，或发布与高风险工作确需协调时使用；普通日常任务直接实施。",
    title: "# Web Harness：规划前端变更",
    displayName: "Web Harness：规划前端变更",
    shortDescription: "规划 Web Harness 或其 React Web、Plasmo MV3 前端下游变更",
    defaultPrompt:
      "使用 $web-plan-change 为 Web Harness 或其纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游制定可执行的变更计划。"
  },
  "web-prepare-brand-identity": {
    description:
      "为当前唯一的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目创建或更新正式 Logo，并从 .harness/project.json 同步当前宿主的品牌元数据。用于首次实例化、品牌改名、Logo 或用户可见前端产品元数据变化。",
    title: "# Web Harness：准备前端品牌身份",
    displayName: "Web Harness：准备前端品牌身份",
    shortDescription: "同步 React Web 或 Plasmo MV3 Extension 的 Logo 与品牌元数据",
    defaultPrompt:
      "使用 $web-prepare-brand-identity 为当前纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目创建 Logo 并同步品牌元数据。"
  },
  "web-prepare-release": {
    description:
      "为已验收的 Web Harness 或单 package 纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游准备可追溯发布：Harness 绑定精确源码候选，Web 只处理 Vite dist，Extension 只处理 Chrome MV3 / Firefox MV2 zip。用于用户明确要求准备前端发布、检查发布就绪或整理候选元数据；按当前明确发布请求执行既有目的地与范围内的必要步骤，不重复确认。",
    title: "# Web Harness：准备前端发布",
    displayName: "Web Harness：准备前端发布",
    shortDescription: "准备 Web Harness 源码、Vite dist 或 Chrome MV3 / Firefox MV2 zip 前端候选",
    defaultPrompt:
      "使用 $web-prepare-release 评估并整理 Web Harness 源码候选、React Web Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 zip 前端发布候选。"
  },
  "web-refactor-code": {
    description:
      "对 Web Harness 受管前端模板或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游的 TypeScript/TSX 做行为保持重构，处理职责、命名、重复、状态归属、性能和浏览器生命周期风险；不改变公开行为、权限或项目类型。",
    title: "# Web Harness：重构前端代码",
    displayName: "Web Harness：重构前端代码",
    shortDescription: "保持行为不变地重构 Harness 模板或前端下游 TypeScript 代码",
    defaultPrompt:
      "使用 $web-refactor-code 在保持可观察行为不变的前提下重构 Web Harness 受管前端模板或其 React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游代码。"
  },
  "web-review-extension-compatibility": {
    description:
      "只读审查已初始化 Plasmo Extension 下游中受影响功能的 Chrome MV3 / Firefox MV2 兼容性，检查真实消费者、执行上下文、API、消息、权限和生命周期证据；用于专项审查或实施、重构中的宿主边界审查，不自动修改权限、构建或启动浏览器。",
    title: "# Web Harness：审查 Extension 双目标兼容",
    displayName: "Web Harness：审查 Extension 双目标兼容",
    shortDescription: "只读核对扩展真实消费者在 Chrome MV3 与 Firefox MV2 的兼容证据",
    defaultPrompt:
      "使用 $web-review-extension-compatibility 只读审查当前 Extension 变更的双目标兼容证据与必要后续门禁。"
  },
  "web-run-parallel-worktrees": {
    description:
      "在用户当前明确要求且项目策略允许时，把一个 Web Harness、React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension Task 拆为写入所有权不重叠的内部 Subagent Git Worktree，并用可执行登记、guard、postflight 和保守清理阻止越界。",
    title: "# Web Harness：运行前端并行工作树",
    displayName: "Web Harness：运行前端并行工作树",
    shortDescription: "用登记、所有权与 postflight 安全协调内部前端单元",
    defaultPrompt:
      "使用 $web-run-parallel-worktrees 在当前请求明确要求且策略允许时，通过登记的隔离 Git Worktree 协调所有权不重叠的 Web 前端写入单元。"
  },
  "web-summarize-development-history": {
    description:
      "按用户请求只读追溯当前 Web Harness 或其终端下游的 ADR、Changelog、产品规格、状态、计划与 Git 历史，解释开发脉络、现状和有证据的未来方向；不整理或改写项目记忆。",
    title: "# Web Harness：汇总开发历史",
    displayName: "Web Harness：汇总开发历史",
    shortDescription: "追溯 Web Harness 或前端下游的项目记忆与 Git 历史",
    defaultPrompt:
      "使用 $web-summarize-development-history，按当前项目的 ADR、Changelog、产品规格、状态、计划和 Git 历史汇总关键决策与变化，区分已实现、已验证和未来预期，并标注可复核来源。"
  },
  "web-test-final-artifact-e2e": {
    description:
      "按 $web-verify-delivery 已批准的执行契约，在隔离的真实浏览器中（Web 使用 Google Chrome，Extension 使用 Chrome 和 Firefox）对精确 React Web Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端候选执行端到端场景并返回证据。不得自行决定策略、候选准入、Todo 回流或候选验收结论，也不得用于开发预览、规划、普通编码或单元测试替代。",
    title: "# Web Harness：测试前端最终产物 E2E",
    displayName: "Web Harness：测试前端最终产物",
    shortDescription: "逐浏览器测试 Web dist 与 Chrome MV3 / Firefox MV2 扩展候选",
    defaultPrompt:
      "使用 $web-test-final-artifact-e2e 在隔离的真实浏览器中（Web 使用 Google Chrome，Extension 使用 Chrome 和 Firefox）测试精确的 React Web Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 前端候选。"
  },
  "web-upgrade-harness": {
    description:
      "在已实例化的单一类型纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游中，以只读预演和文件所有权分类安全同步较新 Web Harness 工程层，同时保留产品代码、projectType、品牌、项目记忆、策略和本地修改。用于用户要求比较、升级、迁移或刷新前端 Harness；默认不写入。",
    title: "# Web Harness：升级前端工程基线",
    displayName: "Web Harness：升级前端工程基线",
    shortDescription: "将较新 Web Harness 工程层安全同步到单一 React 或 Plasmo MV3 前端下游",
    defaultPrompt:
      "使用 $web-upgrade-harness 先执行只读预演，再将较新 Web Harness 前端工程层安全同步到单一 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游。"
  },
  "web-verify-delivery": {
    description:
      "对 Web Harness 源码候选或单一类型纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游发布候选执行完整真实产物验收：Harness 验证两种独立生成结果，Web 验证 Vite dist，Extension 验证 Chrome MV3 / Firefox MV2 构建/zip；由发布候选、用户明确要求完整验收、当前构建启用 E2E 或浏览器硬要求触发。",
    title: "# Web Harness：验证前端交付",
    displayName: "Web Harness：验证前端交付",
    shortDescription: "验收 Web Harness、Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 前端候选",
    defaultPrompt:
      "使用 $web-verify-delivery 验收 Web Harness 源码候选、React Web Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 前端候选。"
  },
  "web-compose-capabilities": {
    description:
      "在已初始化 React Web 或 Plasmo Extension 下游中，按具体操作组合身份认证、组织、权限、商品、订单、钱包支付与审计的独立知识库和模板库；用于需求、设计或实施涉及这些能力时，不按产品分类自动启用功能。",
    title: "# Web Harness：组合功能模块",
    displayName: "Web Harness：组合功能模块",
    shortDescription: "按需选择独立业务知识与模板，显式组合身份、组织、权限和交易能力",
    defaultPrompt:
      "使用 $web-compose-capabilities 按当前需求选择功能模块及具体操作，读取对应知识与模板，核对真实契约、数据范围和宿主边界，再接回当前需求、设计或实施流程。"
  }
} as const satisfies Record<(typeof EXPECTED_SKILLS)[number], SkillContract>

/** 锁定关键 Skill 正文不可丢失的工作流语义。 */
export const SKILL_BODY_REQUIREMENTS: Partial<
  Record<(typeof EXPECTED_SKILLS)[number], readonly string[]>
> = {
  "web-compose-capabilities": [
    "知识库与模板库独立索引",
    "远端列表查询必须使用 GraphQL",
    "功能选择不授予权限",
    "结果未知时先查询，不自动重放创建订单或支付"
  ],
  "web-review-api-contract": [
    "只读核对不证明服务可达",
    "不修改代码、配置、测试或文档",
    "远端列表查询必须使用 GraphQL",
    "完成后返回调用方"
  ],
  "web-review-module-boundaries": [
    "只读，不移动文件",
    "不以文件数量或行数单独决定拆分",
    "源门禁与运行时门禁"
  ],
  "web-implement-access-control": [
    "功能选择不授予权限",
    "权限未加载、不可解析或缺失时默认拒绝",
    "已识别但无权限的目标",
    "不依赖被拒绝的业务权限",
    "业务 403",
    "返回调用方"
  ],
  "web-document-api": [
    "客户端控制参数不属于 wire 字段",
    "HTTP 待确认项",
    "沿真实消费者追踪业务流程",
    "每次导出都核对已有文档与当前代码差异",
    "远端列表查询必须使用 GraphQL"
  ],
  "web-implement-write-recovery": [
    "写操作不自动重放",
    "未知时先通过已确认",
    "刷新失败只重试读取",
    "返回调用方"
  ],
  "web-implement-browser-storage": [
    "本地能力直接真实实现，不要求 BaseURL",
    "不扩大例外",
    "不得用静默 fallback",
    "完成后返回"
  ],
  "web-implement-event-stream": [
    "不能从查询接口推断支持",
    "只读命中分支",
    "不承诺 MV3 service worker 常驻",
    "返回调用方"
  ],
  "web-manage-user-tasks": [
    "`user_owned_tasks: disabled` 不自动创建或拆分",
    "当前与逐页归档",
    "只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入",
    "git rev-parse --path-format=absolute --git-common-dir",
    "git worktree list --porcelain",
    "git status --porcelain=v1 --untracked-files=all",
    "不置顶"
  ],
  "web-audit-worktrees": [
    "只运行既有 helper 的 `inspect`",
    "从 primary checkout 的精确 cwd",
    "不创建目录、登记、分支、Worktree 或报告文件",
    "orphan/stale 只表示需要调查的证据，不是删除授权"
  ],
  "web-preview-harness-upgrade": [
    "不修改目标工程，可选创建外部计划报告",
    "目标允许已有本地修改",
    "CLI 没有 render 子命令",
    "不调用 `apply`、`record` 或带批准的 `migrate-ownership`"
  ],
  "web-check-development-environment": [
    "新下游首次初始化只检查一次 Node.js/pnpm",
    "最终 Release 构建、新会话、Agent 切换、宿主或版本约束变化都不触发预探测",
    "命令已经失败且错误明确指向",
    "不静默安装或升级"
  ],
  "web-implement-change": [
    "只将依赖该远端 API 的操作",
    "本地能力直接真实实现，不要求 BaseURL",
    "只有实际创建新下游时调用一次 `$web-check-development-environment`",
    "最终 Release 构建、新会话或 Agent 切换都直接执行，不做环境预探测",
    "只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入",
    "$web-manage-user-tasks"
  ],
  "web-connect-http-service": [
    "远端列表查询必须使用 GraphQL",
    "仅用于已初始化且 `projectType=web|extension`",
    "本地实现继续真实运行，不纳入 Mock 迁移",
    "真实请求失败不得回落 Mock",
    "取消相关旧请求并清理对应 Mock Query 缓存",
    "不扩张生产、付费、凭据或不可逆写入授权"
  ],
  "web-review-extension-compatibility": [
    "仅用于已初始化且 `projectType=extension`",
    "不修改代码、测试、manifest、权限或依赖",
    "不自行构建、加载浏览器或创建候选",
    "消费者 × Chrome MV3 / Firefox MV2"
  ],
  "web-design-prototype": [
    "仅在已初始化下游运行",
    "初始化仅分发 Skills",
    "每次只生成一个桌面端原型",
    "不生成 A/B/C 备选方案",
    "不规划、生成或验证 Mobile 支持",
    "pnpm prototype:check",
    "旧摘要失效"
  ],
  "web-implement-list-view": [
    "远端列表查询必须使用 GraphQL",
    "仅用于 projectType=web",
    "完全无 owned key",
    "不是双向状态同步",
    "background-color: var(--mantine-color-body)",
    "assets/listPageState.ts"
  ],
  "web-verify-delivery": [
    "不为最终构建预先调用环境检查",
    "只有命令已经失败且错误明确指向 Node.js、pnpm、原生依赖或宿主环境时",
    "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`",
    "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
    "用户、产品、安全或渠道硬要求优先于持久值",
    "源 Harness 的 `pending` 不授权可选 smoke"
  ]
}

/** 匹配 openai.yaml 唯一允许的 interface 与三个双引号字符串字段。 */
export const OPENAI_METADATA_PATTERN =
  /^interface:\n {2}display_name: ("(?:\\.|[^"\\])*")\n {2}short_description: ("(?:\\.|[^"\\])*")\n {2}default_prompt: ("(?:\\.|[^"\\])*")\n$/u
/** 匹配可以证明元数据真正包含中文的汉字。 */
export const HAN_CHARACTER = /\p{Script=Han}/u
/** 拒绝 Skill 身份与发现元数据中混入其他 Harness 语言。 */
export const FORBIDDEN_SKILL_IDENTITY_LANGUAGE = /\b(?:Rust|Server)\b/iu
/** 保存 Skill 短描述在 Codex 列表中的最小字符数。 */
export const MIN_SHORT_DESCRIPTION_LENGTH = 25
/** 保存 Skill 短描述在 Codex 列表中的最大字符数。 */
export const MAX_SHORT_DESCRIPTION_LENGTH = 64
