/** 保存源 Harness 唯一允许的 17 个 Web Skill canonical id。 */
export const EXPECTED_SKILLS = [
  "web-check-development-environment",
  "web-configure-git-commits",
  "web-curate-harness-memory",
  "web-define-product",
  "web-extract-i18n-strings",
  "web-implement-change",
  "web-implement-list-view",
  "web-instantiate-project",
  "web-plan-change",
  "web-prepare-brand-identity",
  "web-prepare-release",
  "web-refactor-code",
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

/** 锁定 17 个源 Skill 的 frontmatter、H1 与 openai.yaml 唯一合法值。 */
export const SKILL_CONTRACTS = {
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
      "定义或修订单一纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端产品的用户、问题、范围、约束和可衡量成功标准。用于新前端产品、需求含糊，或产品目标、公开边界、隐私/权限约束和成功标准真实变化；范围清楚的日常实现不调用。",
    title: "# Web Harness：定义前端产品",
    displayName: "Web Harness：定义前端产品",
    shortDescription: "定义 React Web 或 Plasmo MV3 Extension 的单一前端产品范围",
    defaultPrompt:
      "使用 $web-define-product 定义纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 单一前端产品的范围与可衡量成功标准。"
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
  }
} as const satisfies Record<(typeof EXPECTED_SKILLS)[number], SkillContract>

/** 锁定关键 Skill 正文不可丢失的工作流语义。 */
export const SKILL_BODY_REQUIREMENTS: Partial<
  Record<(typeof EXPECTED_SKILLS)[number], readonly string[]>
> = {
  "web-check-development-environment": [
    "新下游首次初始化只检查一次 Node.js/pnpm",
    "最终 Release 构建、新会话、Agent 切换、宿主或版本约束变化都不触发预探测",
    "命令已经失败且错误明确指向",
    "不静默安装或升级"
  ],
  "web-implement-change": [
    "只有实际创建新下游时调用一次 `$web-check-development-environment`",
    "最终 Release 构建、新会话或 Agent 切换都直接执行，不做环境预探测",
    "git rev-parse --path-format=absolute --git-common-dir",
    "git worktree list --porcelain",
    "只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入",
    "git status --porcelain=v1 --untracked-files=all"
  ],
  "web-implement-list-view": [
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

// 保存 REQUIRED_FILES 变量供当前逻辑使用。
export const REQUIRED_FILES = [
  ".harness/tooling/design-skill.ts",
  ".harness/tooling/install-design-skill.ts",
  ".harness/vendor/design-taste-frontend/SKILL.md",
  ".harness/vendor/design-taste-frontend/LICENSE",
  ".harness/vendor/design-taste-frontend/UPSTREAM.json",
  "tests/design-skill-installation.test.ts",
  ".gitattributes",
  "AGENTS.md",
  "README.md",
  "LICENSE.en.md",
  "LICENSE.zh-CN.md",
  "Version.md",
  "pnpm-workspace.yaml",
  "docs/README.md",
  "docs/AGENT_POLICY.md",
  "docs/DATA_ACCESS.md",
  "docs/ENGINEERING_RULES.md",
  "docs/HARNESS_ENGINEERING.md",
  "docs/LOGGING.md",
  "docs/MANTINE_UI_GUIDELINES.md",
  "docs/RELEASE.md",
  "docs/RUNTIME_CONFIGURATION.md",
  "docs/TECH_DEBT.md",
  "docs/TS_WEB_TEMPLATE.md",
  "docs/VERIFICATION.md",
  "docs/harness_engineering/agent_first_design.md",
  "docs/harness_engineering/foundations.md",
  "docs/harness_engineering/project_lifecycle.md",
  "docs/product_spec/README.md",
  "docs/project_status/README.md",
  "docs/work_plan/README.md",
  "docs/adr/README.md",
  "docs/changelog/README.md",
  ".harness/tooling/cli.ts",
  ".harness/tooling/agent-policy.ts",
  ".harness/tooling/build.ts",
  ".harness/tooling/comment-policy.ts",
  ".harness/tooling/source-size-policy.ts",
  ".harness/tooling/source-snapshot.ts",
  ".harness/tooling/init.ts",
  ".harness/tooling/instantiate.ts",
  ".harness/tooling/project-memory.ts",
  ".harness/tooling/pnpm-policy.ts",
  ".harness/tooling/brand.ts",
  ".harness/tooling/identity.ts",
  ".harness/tooling/extension-targets.ts",
  ".harness/tooling/environment.ts",
  ".harness/tooling/release.ts",
  ".harness/tooling/skill-validation.ts",
  ".harness/tooling/templates/build.ts",
  ".harness/tooling/templates/environment.ts",
  ".harness/tooling/templates/downstream-docs.ts",
  ".harness/tooling/templates/http-client.ts",
  ".harness/tooling/templates/http-client-test.ts",
  ".harness/tooling/templates/http-auth-test.ts",
  ".harness/tooling/templates/http-errors.ts",
  ".harness/tooling/templates/http-ui.ts",
  ".harness/tooling/templates/http-ui-test.ts",
  ".harness/tooling/templates/http-language.ts",
  ".harness/tooling/templates/http.ts",
  ".harness/tooling/templates/logging.ts",
  ".harness/tooling/templates/pagination.ts",
  ".harness/tooling/version.ts",
  ".agents/skills/web-configure-git-commits/assets/commit-template.txt",
  ".agents/skills/web-configure-git-commits/references/commit-convention.md",
  ".agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts",
  ".agents/skills/web-implement-list-view/assets/ListPage.contracts.test.ts",
  ".agents/skills/web-implement-list-view/assets/listPageState.ts",
  ".agents/skills/web-implement-list-view/references/checklist.md",
  ".agents/skills/web-implement-list-view/references/mantine-api.md",
  ".agents/skills/web-implement-list-view/references/offset-list-pattern.md",
  ".agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts",
  ".agents/skills/web-upgrade-harness/references/ownership-manifest.json",
  ".agents/skills/web-upgrade-harness/references/ownership-policy.md",
  ".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-core.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-mutation.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-types.ts",
  "scripts/instantiate.ts",
  "scripts/harness-validation/contracts.ts",
  "scripts/harness-validation/governance-policy.ts",
  "scripts/harness-validation/line-limits.ts",
  "scripts/harness-validation/memory.ts",
  "scripts/harness-validation/repository.ts",
  "scripts/harness-validation/tooling.ts",
  "scripts/harness-validation/typescript-contracts.ts",
  "scripts/harness-validation/upgrade-ownership.ts",
  "scripts/harness-validation/version.ts",
  "tests/agent-policy.test.ts",
  "tests/build-tooling.test.ts",
  "tests/git-commit-configuration.test.ts",
  "tests/harness-memory.test.ts",
  "tests/harness-ownership-validation.test.ts",
  "tests/harness-upgrade.test.ts",
  "tests/initialization-atomicity.test.ts",
  "tests/parallel-worktrees.test.ts",
  "tests/source-size-policy.test.ts",
  ".harness/tooling/instantiate-target.ts",
  "tests/harness-project-validation.test.ts",
  "tests/harness-terminal-governance.test.ts",
  "tests/harness-initialization-web.test.ts",
  "tests/harness-initialization-extension.test.ts",
  "tests/harness-instantiation-fixture.ts",
  "tests/harness-instantiation-terminal.test.ts",
  "tests/harness-validator-fixture.ts",
  "tests/harness-skill-validation.test.ts",
  "tests/project-memory-compatibility.test.ts",
  "tests/initialization-atomicity-fixture.ts",
  "tests/initialization-source-boundary.test.ts",
  "tests/node-tooling.test.ts",
  ".harness/tooling/validate-helpers.ts",
  ".harness/tooling/validate-brand.ts",
  ".harness/tooling/validate-hosts.ts",
  "tests/harness-upgrade-fixture.ts",
  "tests/harness-upgrade-ownership.test.ts",
  "tests/harness-upgrade-cli.test.ts",
  "tests/parallel-worktree-fixture.ts",
  "tests/parallel-worktree-recovery.test.ts",
  ".agents/skills/web-run-parallel-worktrees/scripts/parallel-types.ts",
  ".agents/skills/web-run-parallel-worktrees/scripts/parallel-registry.ts",
  ".agents/skills/web-run-parallel-worktrees/scripts/parallel-git.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-planning.ts",
  ".agents/skills/web-upgrade-harness/scripts/upgrade-glob.ts",
  ".agents/skills/web-implement-list-view/assets/listPageStorage.ts",
  ".agents/skills/web-implement-list-view/assets/listColumnPreferences.ts",
  ".harness/tooling/validate-http.ts",
  ".harness/tooling/validate.ts",
  "scripts/harness-validation/node-tooling.ts",
  ".harness/tooling/templates/http-contracts.ts",
  ".harness/tooling/templates/http-protocol.ts",
  ".harness/tooling/templates/http-test-fixtures.ts",
  ".harness/tooling/templates/http-transport-test.ts"
] as const

// 保存 GOVERNED_MARKDOWN_ROOTS 变量供当前逻辑使用。
export const GOVERNED_MARKDOWN_ROOTS = [
  "AGENTS.md",
  "README.md",
  "Version.md",
  "LICENSE.en.md",
  "LICENSE.zh-CN.md",
  "docs",
  ".agents/skills"
] as const

// 定义 HarnessValidationReport 接口的结构契约。
export interface HarnessValidationReport {
  // 描述 files 接口成员的结构契约。
  files: number
  // 描述 skills 接口成员的结构契约。
  skills: string[]
  // 描述 markdownLinks 接口成员的结构契约。
  markdownLinks: number
}
