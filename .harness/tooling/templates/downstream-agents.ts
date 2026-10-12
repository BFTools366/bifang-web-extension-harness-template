import type { ProjectConfig } from "../types.ts"

/** 按当前宿主生成终端 Agent 入口与 Skill 路由。 */
export function downstreamAgents(config: ProjectConfig): string {
  // 保存 hostSources 变量供当前逻辑使用。
  const hostSources =
    config.projectType === "web"
      ? "- `src/routes/`: file-route source; `src/routeTree.gen.ts` is generated, Git-ignored, and never edited by hand.\n"
      : ""
  // 保存 hostSkills 变量供当前宿主专用 Skill 地图使用。
  const hostSkills =
    config.projectType === "web"
      ? "- `$web-implement-list-view`：创建、修改或审查可恢复、可访问的 React Web 列表页。\n"
      : "- `$web-review-extension-compatibility`：只读审查受影响宿主消费者的 Chrome MV3 / Firefox MV2 兼容证据。\n"
  // 保存 versionDescription 变量供当前宿主构建版本约束说明使用。
  const versionDescription =
    config.projectType === "web"
      ? "上海时区 `YYMMDDHHMMSS`"
      : "`package.json.version` 的稳定 SemVer（`X.Y.Z`）"
  // 保存 hostMinimumReading 变量供当前宿主专用任务路由使用。
  const hostMinimumReading =
    config.projectType === "web"
      ? "For a list, data table, admin list, or search-results task, read both `docs/MANTINE_UI_GUIDELINES.md` and `docs/DATA_ACCESS.md`, then invoke `$web-implement-list-view` alongside the implementation workflow.\n\n"
      : "For Extension changes that affect browser APIs, messaging, Storage, background lifecycle, permissions, CSP or resources, invoke `$web-review-extension-compatibility`; the implementation workflow owns fixes, tests and candidate gates.\n\n"
  return `# Project Agent Instructions

This repository is the terminal \`${config.projectType}\` project **${config.name}**. Keep it flat and single-package. Do not add project-generation commands, a workspace layout, or a second project type.

## Minimum reading

Always inspect the workspace and protect existing changes. Read this file and \`.harness/project.json\`; read \`docs/AGENT_POLICY.md\` for capability preferences, title lifecycle, persistent planning, parallel work, smoke, or E2E. Read \`docs/ENGINEERING_RULES.md\` before modifying code, tests, docs, or configuration, plus the selected Skill. Read \`docs/MANTINE_UI_GUIDELINES.md\` for theme, page, Popup, Options, layout, component, interaction-state, responsive, or UI-accessibility work. Read \`docs/RUNTIME_CONFIGURATION.md\` for environment work, \`docs/LOGGING.md\` for logging/error handling, and \`docs/DATA_ACCESS.md\` for pagination, HTTP headers, authentication, REST/OpenAPI, GraphQL, SSE, multiple remote endpoints, multi-source event streams, or RxJS. Read \`docs/API.md\` when consulting or adopting the optional foundation API and data-model contract; its inclusion does not configure or connect a service. Read only the additional facts needed.

${hostMinimumReading}When authorized work connects a real HTTP service or migrates an API Mock, invoke \`$web-connect-http-service\`; keep UI/Router presentation and candidate acceptance with the calling workflow.\n\nFor existing Worktree or registry audits, invoke \`$web-audit-worktrees\` from the primary checkout; inspection does not authorize cleanup. For Harness comparisons or upgrade replanning, invoke \`$web-preview-harness-upgrade\`; \`$web-upgrade-harness\` owns approved application and baseline recording.\n\n## Event-driven execution

For new products, new pages, significant interaction redesigns, or requested prototypes, use \`$web-define-product\` to clarify and record the unique Product Spec (PRD), then \`$web-design-prototype\` to present 2–3 interactive HTML alternatives. Wait for explicit user selection of a specific revision; verify \`docs/prototypes/<scope>/review.json\` with \`pnpm prototype:check <scope>\` before business implementation. PRD approval, recommendations, silence, or an ambiguous “continue” cannot replace selection. Reuse a valid selection without asking again; PRD/prototype changes invalidate it. Initialization only distributes project-local Skills, never business PRDs, prototypes, or choices. Implement clear daily fixes and non-UI changes directly and run only the affected checks and related non-empty tests; they cannot bypass a pending selection for the same scope. Multi-step, multi-module, medium-risk, or user-visible work does not by itself create a Work Plan, full-repository check, build, smoke test, or E2E run. Create a persistent plan only when the user explicitly requests one, work must cross sessions, or release/high-risk coordination genuinely needs it. Behavior-preserving refactors run the full unit suite.

Security/privacy, Extension permissions, irreversible data, production/paid/credential side effects, public compatibility contracts, complete candidate validation, and release each enter the dedicated gate required by that event. Parallel write Worktrees require both the user's current explicit request and \`parallel_worktree_subagents: enabled\`. Reuse the confirmed E2E selection across builds, packaging, and fixes in the same release; ask only when neither a selection nor a hard requirement exists. Validate every new artifact again. An explicit release request covers necessary commits, push, and release steps within the existing destination and scope without repeated confirmation; ask only for new destinations or side effects outside that scope.

## User-owned Task binding

\`user_owned_tasks: disabled\` prevents automatic left-sidebar Task creation but never blocks an explicit user request. One user-owned Task owns one stable, verifiable result; delivery type, lifecycle stage, external side effects, forbidden scope, or acceptance ownership changes require a new Task, while tests and same-scope fixes stay with the same result. Only one write-active Task may exist per project, and Task0 coordinates without implementing.

Create a requested Task once with \`Task {序号} | 已分配 | {单一结果}\`. A returned \`clientThreadId\` is setup-pending and authorizes no implementation; continue only after obtaining the real \`threadId\` and verifying its title, \`projectId\`, cwd, and status. Before the first edit, a Git Task must prove the saved project and Task checkout share the same canonical Git common dir, the current top-level is present in \`git worktree list --porcelain\`, and HEAD equals the recorded starting commit. A non-Git Local Task must have cwd exactly equal to the saved project path. Binding failures remain zero-write and never fall back to a plan, Subagent, or ordinary checkout.

## Sources of truth

- \`.harness/project.json\`: project type, identity, and brand metadata.
- \`.harness/brand/logo-1024.png\`: canonical logo; derived assets must be refreshed, not edited independently.
- \`package.json\` and \`pnpm-lock.yaml\`: scripts and dependency versions.
- Product source and tests: executable behavior.
${hostSources}- \`src/pagination/\`: the governed page/pageSize session state and empty-page reconciliation contract.
- \`src/data/\`: API and Cookie, LocalStorage, SessionStorage, Memory and IndexedDB access; REST owns primary interactions, GraphQL owns complex queries and subscriptions, and Dexie is only for IndexedDB. Local capabilities use real implementations without a BaseURL; only remote API operations with unconfigured addresses use Mock, as defined in \`docs/DATA_ACCESS.md\` §3.1.
- \`src/data/storage/\`: centralized browser storage adapters with separate lifecycles and explicit failure handling.
- \`src/data/api/client/\`: the endpoint-free Ky HTTP, request-context, language, token, error, and unauthorized-handler foundation.
- \`docs/API.md\`: the complete optional foundation API and data-model reference, including provenance and adaptation boundaries; adopt and split it only for actual requirements.
- \`docs/api/\`: when requested, \`$web-document-api\` derives one document per API module and an index from current code; keep reference contracts and Mock behavior distinct from implemented HTTP behavior.
- \`docs/DATA_ACCESS.md\`: pagination, request headers, authentication, data access, SSE, optional RxJS, and state ownership boundaries.
- \`docs/MANTINE_UI_GUIDELINES.md\`: Mantine theme, tokens, layout, component semantics, interaction states, responsive behavior, accessibility, and current-host UI rules.
- \`docs/RUNTIME_CONFIGURATION.md\`: the three profiles, public configuration schema, and build mapping.
- \`docs/LOGGING.md\`: structured logging, error boundaries, redaction, and Release inspection.
- \`docs/\`: durable policy, engineering, release, and debt records.
- License files: legal text; the Applicable Project Name must match the current project identity.

## Web Harness 前端 Skill 地图

- \`$web-audit-worktrees\`：从 primary checkout 只读审计 Worktree 与并行登记，不自动清理。
- \`$web-check-development-environment\`：只在首次初始化或命令已报出环境错误时检查 Node.js、pnpm 与按需使用的 Google Chrome/Firefox。
- \`$web-configure-git-commits\`：只在用户明确要求，或下一步将实际创建提交时，检查并配置仓库本地 Git 身份与受管提交模板。
- \`$web-connect-http-service\`：在已初始化下游接入已批准服务，验证域 API、Mock 退出与缓存切换。
- \`$web-define-product\`：在下游澄清需求，将范围和验收标准记录为唯一 Product Spec（PRD）。
- \`$web-design-prototype\`：在下游产出 2–3 个可交互 HTML 原型，等待用户选定具体版本后交接开发。
- \`$web-document-api\`：根据当前 API 实现、类型与相关测试整理 \`docs/api/\`，每个模块独立成文并明确 Mock 和未知边界。
- \`$web-extract-i18n-strings\`：维护基于 i18next 的完整前端国际化文案。
- \`$web-plan-change\`：只在用户明确要求持久计划、跨会话交接或发布/高风险协调确有必要时建立 Todo。
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

项目级 \`.agents/skills/design-taste-frontend/SKILL.md\` 提供落地页、作品集和视觉改版的风格建议；适用设计任务先读取 \`docs/MANTINE_UI_GUIDELINES.md\` 的设计支持边界再调用 \`$design-taste-frontend\`。它独立于 canonical \`web-*\` 维护 Skills，不自动用于数据表、后台工作流或 Extension Popup/Options。项目的 Mantine、纯 TypeScript、Query/Jotai、i18n、宿主权限和日常验证规则优先；上游 Tailwind、Next、动画、字体与组件库偏好不授权新增依赖、远程资源、浏览器检查、构建或其他外部操作。有效已有版本由项目维护，Harness 升级保留它。

## Validation loop

Use \`pnpm harness brand refresh\` after intentional identity changes. Daily work runs only the related non-empty tests or smallest substitute checks required by the change, usually through \`pnpm test:related <changed-source...>\`; a zero-test batch is not evidence, so run the owning test file when dependency discovery finds none. Do not automatically add format, lint, typecheck, repository-wide checks, or builds. Run the full unit suite only through \`pnpm build\`/Release or an explicit behavior-preserving refactor. Reuse the confirmed E2E selection for the current release and pass \`--e2e=enabled|disabled\`. Every artifact-producing build is \`pnpm build\` → \`build:release\`; it owns environment validation, Harness/format/lint/type/full-test gates, ${versionDescription} UI version injection${
    config.projectType === "extension" ? ", browser-bundle self-containment validation," : ""
  } and \`pnpm release:inspect\`. Build commands, UI versions, E2E choices, and test/inspection results stay in command output and the current task report; they do not create or update Work Plans, ADRs, Status, Changelogs, Verifications, or other persistent project memory. Development and test profiles never produce final artifacts. Manually maintained code is reviewed from 501 through 600 lines and must be split from 601 lines. Report skipped or blocked checks explicitly; do not claim success from partial evidence.
`
}
