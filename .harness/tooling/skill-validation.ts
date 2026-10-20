import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { DESIGN_SKILL_NAME, validateDesignSkill } from "./design-skill.ts"

/** 保存两类终端项目必须精确保留的通用 Web Harness 前端维护 Skill。 */
const EXPECTED_COMMON_TERMINAL_SKILLS = [
  "web-compose-capabilities",
  "web-implement-auth-session",
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
  "web-define-product",
  "web-design-prototype",
  "web-document-api",
  "web-extract-i18n-strings",
  "web-implement-change",
  "web-plan-change",
  "web-prepare-brand-identity",
  "web-prepare-release",
  "web-preview-harness-upgrade",
  "web-refactor-code",
  "web-run-parallel-worktrees",
  "web-summarize-development-history",
  "web-test-final-artifact-e2e",
  "web-upgrade-harness",
  "web-verify-delivery"
] as const

/** 保存仅 React Web 终端项目保留的宿主专用 Skill。 */
export const EXPECTED_WEB_ONLY_TERMINAL_SKILLS = ["web-implement-list-view"] as const

/** 保存仅 Extension 终端项目保留的双目标审查 Skill。 */
export const EXPECTED_EXTENSION_ONLY_TERMINAL_SKILLS = [
  "web-review-extension-compatibility"
] as const

/** 按能力拥有者保存源与终端共用的正文门禁，不让发现信息替代行为约束。 */
export const SHARED_SKILL_BODY_REQUIREMENTS: Partial<Record<string, readonly string[]>> = {
  "web-define-product": [
    "展示可打开预览并等待用户反馈",
    "需求批准不代替设计反馈",
    "创建前只读分析",
    "源阶段不写 PRD、产品记录、原型或业务代码",
    "只读分析完成后返回调用方",
    "仅工程确认不批准产品范围；完整创建范围确认可复用",
    "references/requirements-analysis.md",
    "references/prd-outline.md"
  ],
  "web-compose-capabilities": [
    "templates/application/files.ts",
    "购买自动包含基础用户系统",
    "固定设计",
    "知识库与模板库独立索引",
    "](../../../docs/DATA_ACCESS.md#列表查询协议强约定)",
    "功能选择不授予权限",
    "结果未知时先查询，不自动重放创建订单或支付",
    "源阶段不取代码模板、不写入工程、不调用组装器",
    "代码装配与测试由 `$web-implement-change` 负责",
    "读取后返回当前调用方"
  ],
  "web-review-api-contract": [
    "只读核对不证明服务可达",
    "不修改代码、配置、测试或文档",
    "](../../../docs/DATA_ACCESS.md#列表查询协议强约定)",
    "完成后返回调用方"
  ],
  "web-review-module-boundaries": [
    "只读，不移动文件",
    "不以文件数量或行数单独决定拆分",
    "源门禁与运行时门禁"
  ],
  "web-implement-auth-session": [
    "不创建第二套会话",
    "迟到登录、恢复或 401 不得覆盖或清理后来会话",
    "HTTP client 的 Header、Token revision 与 401 single-flight 继续由 client 负责",
    "../web-compose-capabilities/knowledge/identity.md",
    "返回调用方"
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
    "](../../../docs/DATA_ACCESS.md#列表查询协议强约定)"
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
    "用户明确要求改变设计、视觉、布局、风格、主题或交互",
    "展示后等待用户反馈，不得先改产品代码",
    "pnpm prototype:check <scope> <设计请求来源>",
    "普通开发授权、需求批准或旧原型登记不能代替本轮设计反馈",
    "只将依赖该远端 API 的操作",
    "本地能力直接真实实现，不要求 BaseURL",
    "只有实际创建新下游时调用一次 `$web-check-development-environment`",
    "最终 Release 构建、新会话或 Agent 切换都直接执行，不做环境预探测",
    "只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入",
    "$web-manage-user-tasks"
  ],
  "web-connect-http-service": [
    "](../../../docs/DATA_ACCESS.md#列表查询协议强约定)",
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
    "展示预览并等待用户反馈",
    "awaiting-feedback",
    "reviewHash",
    "即使旧文件哈希仍匹配，新设计请求也不能复用旧批准",
    ".harness/initial-creation.json",
    "仅在已初始化下游运行",
    "正式 PRD、原型与登记只按各自事件创建",
    "每次只生成一个桌面端原型",
    "不生成 A/B/C 备选方案",
    "不规划、生成或验证 Mobile 支持",
    "pnpm prototype:check",
    "旧摘要失效"
  ],
  "web-implement-list-view": [
    "](../../../docs/DATA_ACCESS.md#列表查询协议强约定)",
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

/** 将 Skill 与发现元数据换行规范化后再做跨平台语义校验。 */
function normalizeLineEndings(source: string): string {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

/** 从 Codex Skill 元数据中读取一个双引号包裹的单行字段。 */
function quotedSkillMetadataField(source: string, field: string): string | undefined {
  const match = new RegExp(`^\\s*${field}: "([^"]*)"$`, "mu").exec(source)
  return match?.[1]
}

/** 判断可选元数据字段存在且含汉字。 */
function hasHan(value: string | undefined): boolean {
  return value !== undefined && /\p{Script=Han}/u.test(value)
}

/** 校验单个终端 Skill 的发现元数据与关键正文，返回该 Skill 的错误列表。 */
async function validateTerminalSkill(skillsRoot: string, skillName: string): Promise<string[]> {
  const errors: string[] = []
  const skillPath = path.join(skillsRoot, skillName, "SKILL.md")
  const metadataPath = path.join(skillsRoot, skillName, "agents/openai.yaml")
  const skillExists = await pathExists(skillPath)
  const metadataExists = await pathExists(metadataPath)
  if (!skillExists) errors.push(`Terminal Skill ${skillName} is missing SKILL.md`)
  if (!metadataExists) errors.push(`Terminal Skill ${skillName} is missing agents/openai.yaml`)
  if (!skillExists || !metadataExists) return errors
  const [rawSkillSource, rawMetadataSource] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(metadataPath, "utf8")
  ])
  // 保存规范化后的 Skill 与发现元数据供跨平台正文契约校验使用。
  const skillSource = normalizeLineEndings(rawSkillSource)
  const metadataSource = normalizeLineEndings(rawMetadataSource)
  const description = /^description: (.+)$/mu.exec(skillSource)?.[1]
  const displayName = quotedSkillMetadataField(metadataSource, "display_name")
  const shortDescription = quotedSkillMetadataField(metadataSource, "short_description")
  const defaultPrompt = quotedSkillMetadataField(metadataSource, "default_prompt")
  if (!skillSource.startsWith(`---\nname: ${skillName}\n`)) {
    errors.push(`Terminal Skill ${skillName} frontmatter name is invalid`)
  }
  if (!skillSource.includes("\n# Web Harness：")) {
    errors.push(`Terminal Skill ${skillName} title must use Web Harness Chinese naming`)
  }
  if (!hasHan(description)) {
    errors.push(`Terminal Skill ${skillName} description must be Chinese`)
  }
  if (displayName === undefined || !/^Web Harness：\p{Script=Han}/u.test(displayName)) {
    errors.push(`Terminal Skill ${skillName} display_name must use Chinese Web Harness naming`)
  }
  if (!hasHan(shortDescription)) {
    errors.push(`Terminal Skill ${skillName} short_description must be Chinese`)
  }
  if (!hasHan(defaultPrompt) || !defaultPrompt?.includes(`使用 $${skillName}`)) {
    errors.push(`Terminal Skill ${skillName} default_prompt must call $${skillName}`)
  }
  if (/\b(?:Rust|Server)\b/iu.test(`${description ?? ""}\n${metadataSource}`)) {
    errors.push(`Terminal Skill ${skillName} contains non-Web Rust/Server language`)
  }
  // 按能力核对终端必须保留的关键正文，避免发现元数据正确而行为门禁丢失。
  const requiredFragments = SHARED_SKILL_BODY_REQUIREMENTS[skillName] ?? []
  for (const fragment of requiredFragments) {
    if (!skillSource.includes(fragment)) {
      errors.push(`Terminal Skill ${skillName} is missing required workflow: ${fragment}`)
    }
  }
  return errors
}

/** 校验终端只暴露当前宿主精确的 Web 前端 Skill 目录及中文调用元数据。 */
export async function validateTerminalSkills(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  const skillsRoot = path.join(root, ".agents/skills")
  let actualSkills: string[]
  try {
    actualSkills = (await readdir(skillsRoot)).sort()
  } catch {
    errors.push("Missing .agents/skills")
    return
  }

  const expectedSkills = [
    ...EXPECTED_COMMON_TERMINAL_SKILLS,
    ...(config.projectType === "web"
      ? EXPECTED_WEB_ONLY_TERMINAL_SKILLS
      : EXPECTED_EXTENSION_ONLY_TERMINAL_SKILLS)
  ].sort()
  // 旧下游升级不补写受保护设计文件；仅在实际存在时将支持 Skill 纳入维护门禁。
  const designSkillPresent = actualSkills.includes(DESIGN_SKILL_NAME)
  const expectedDirectories = [
    ...expectedSkills,
    ...(designSkillPresent ? [DESIGN_SKILL_NAME] : [])
  ].sort()
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedDirectories)) {
    errors.push(`Terminal Skill directories must exactly equal ${expectedDirectories.join(", ")}`)
  }
  if (designSkillPresent) await validateDesignSkill(root, errors)

  // 各 Skill 相互独立，并行校验后按名称顺序合并错误。
  const skillErrors = await Promise.all(
    expectedSkills.map((skillName) => validateTerminalSkill(skillsRoot, skillName))
  )
  errors.push(...skillErrors.flat())
}
