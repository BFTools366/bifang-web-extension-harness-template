import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { DESIGN_SKILL_NAME, validateDesignSkill } from "./design-skill.ts"

/** 保存两类终端项目必须精确保留的通用 Web Harness 前端维护 Skill。 */
const EXPECTED_COMMON_TERMINAL_SKILLS = [
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

/** 按能力拥有者保存终端正文门禁，不让发现信息替代行为约束。 */
const TERMINAL_SKILL_BODY_REQUIREMENTS: Partial<Record<string, readonly string[]>> = {
  "web-define-product": [
    "源阶段不写 PRD、产品记录、原型或业务代码",
    "只读分析完成后返回调用方",
    "创建确认不批准产品范围",
    "references/prd-outline.md"
  ],
  "web-compose-capabilities": [
    "知识库与模板库独立索引",
    "远端列表查询必须使用 GraphQL",
    "源阶段不取代码模板、不写入工程、不调用组装器",
    "代码装配与测试由 `$web-implement-change` 负责",
    "读取后返回当前调用方"
  ],
  "web-review-api-contract": [
    "只读核对不证明服务可达",
    "不修改代码、配置、测试或文档",
    "远端列表查询必须使用 GraphQL"
  ],
  "web-review-module-boundaries": ["只读，不移动文件", "源门禁与运行时门禁"],
  "web-implement-access-control": [
    "功能选择不授予权限",
    "权限未加载、不可解析或缺失时默认拒绝",
    "已识别但无权限的目标",
    "不依赖被拒绝的业务权限"
  ],
  "web-connect-http-service": ["远端列表查询必须使用 GraphQL"],
  "web-implement-list-view": ["远端列表查询必须使用 GraphQL"],
  "web-document-api": [
    "客户端控制参数不属于 wire 字段",
    "HTTP 待确认项",
    "沿真实消费者追踪业务流程",
    "每次导出都核对已有文档与当前代码差异",
    "远端列表查询必须使用 GraphQL"
  ],
  "web-implement-write-recovery": ["写操作不自动重放", "未知时先通过已确认"],
  "web-implement-browser-storage": ["本地能力直接真实实现，不要求 BaseURL"],
  "web-implement-event-stream": ["不能从查询接口推断支持"],
  "web-manage-user-tasks": [
    "`user_owned_tasks: disabled` 不自动创建或拆分",
    "只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入"
  ],
  // 锁定终端候选验收 Skill 必须消费的 smoke 策略优先级。
  "web-verify-delivery": [
    "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
    "用户、产品、安全或渠道硬要求优先于持久值",
    "源 Harness 的 `pending` 不授权可选 smoke"
  ]
  // 锁定可选购买的启用边界、安全续付与付费授权语义。
  // 锁定管理目标与身份隔离、权限与审计边界。
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
  const requiredFragments = TERMINAL_SKILL_BODY_REQUIREMENTS[skillName] ?? []
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
