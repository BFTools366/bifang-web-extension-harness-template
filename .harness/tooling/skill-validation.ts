import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./files.ts"
import type { ProjectConfig } from "./types.ts"

/** 保存两类终端项目必须精确保留的通用 Web Harness 前端维护 Skill。 */
const EXPECTED_COMMON_TERMINAL_SKILLS = [
  "web-check-development-environment",
  "web-configure-git-commits",
  "web-define-product",
  "web-extract-i18n-strings",
  "web-implement-change",
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

/** 保存仅 React Web 终端项目保留的宿主专用 Skill。 */
const EXPECTED_WEB_ONLY_TERMINAL_SKILLS = ["web-implement-list-view"] as const

/** 锁定终端候选验收 Skill 必须消费的 smoke 策略矩阵。 */
const VERIFY_DELIVERY_REQUIRED_FRAGMENTS = [
  "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`",
  "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
  "用户、产品、安全或渠道硬要求优先于持久值",
  "源 Harness 的 `pending` 不授权可选 smoke"
] as const

/** 将 Skill 与发现元数据换行规范化后再做跨平台语义校验。 */
function normalizeLineEndings(source: string): string {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

/** 从 Codex Skill 元数据中读取一个双引号包裹的单行字段。 */
function quotedSkillMetadataField(source: string, field: string): string | undefined {
  // 保存 match 变量供当前逻辑使用。
  const match = new RegExp(`^\\s*${field}: "([^"]*)"$`, "mu").exec(source)
  return match?.[1]
}

/** 校验终端只暴露当前宿主精确的 Web 前端 Skill 目录及中文调用元数据。 */
export async function validateTerminalSkills(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  // 保存 skillsRoot 变量供当前逻辑使用。
  const skillsRoot = path.join(root, ".agents/skills")
  // 保存 actualSkills 变量供当前逻辑使用。
  let actualSkills: string[]
  try {
    actualSkills = (await readdir(skillsRoot)).sort()
  } catch {
    errors.push("Missing .agents/skills")
    return
  }

  // 保存 expectedSkills 变量供当前逻辑使用。
  const expectedSkills = [
    ...EXPECTED_COMMON_TERMINAL_SKILLS,
    ...(config.projectType === "web" ? EXPECTED_WEB_ONLY_TERMINAL_SKILLS : [])
  ].sort()
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
    errors.push(`Terminal Skill directories must exactly equal ${expectedSkills.join(", ")}`)
  }

  // 保存 skillName 变量供当前逻辑使用。
  for (const skillName of expectedSkills) {
    // 保存 skillPath 变量供当前逻辑使用。
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md")
    // 保存 metadataPath 变量供当前逻辑使用。
    const metadataPath = path.join(skillsRoot, skillName, "agents/openai.yaml")
    // 保存 skillExists 变量供当前逻辑使用。
    const skillExists = await pathExists(skillPath)
    // 保存 metadataExists 变量供当前逻辑使用。
    const metadataExists = await pathExists(metadataPath)
    if (!skillExists) errors.push(`Terminal Skill ${skillName} is missing SKILL.md`)
    if (!metadataExists) errors.push(`Terminal Skill ${skillName} is missing agents/openai.yaml`)
    if (!skillExists || !metadataExists) continue
    // 保存 [skillSource, metadataSource] 变量供当前逻辑使用。
    const [rawSkillSource, rawMetadataSource] = await Promise.all([
      readFile(skillPath, "utf8"),
      readFile(metadataPath, "utf8")
    ])
    // 保存规范化后的 Skill 与发现元数据供跨平台正文契约校验使用。
    const skillSource = normalizeLineEndings(rawSkillSource)
    const metadataSource = normalizeLineEndings(rawMetadataSource)
    // 保存 description 变量供当前逻辑使用。
    const description = /^description: (.+)$/mu.exec(skillSource)?.[1]
    // 保存 displayName 变量供当前逻辑使用。
    const displayName = quotedSkillMetadataField(metadataSource, "display_name")
    // 保存 shortDescription 变量供当前逻辑使用。
    const shortDescription = quotedSkillMetadataField(metadataSource, "short_description")
    // 保存 defaultPrompt 变量供当前逻辑使用。
    const defaultPrompt = quotedSkillMetadataField(metadataSource, "default_prompt")
    if (!skillSource.startsWith(`---\nname: ${skillName}\n`)) {
      errors.push(`Terminal Skill ${skillName} frontmatter name is invalid`)
    }
    if (!skillSource.includes("\n# Web Harness：")) {
      errors.push(`Terminal Skill ${skillName} title must use Web Harness Chinese naming`)
    }
    if (description === undefined || !/\p{Script=Han}/u.test(description)) {
      errors.push(`Terminal Skill ${skillName} description must be Chinese`)
    }
    if (displayName === undefined || !/^Web Harness：\p{Script=Han}/u.test(displayName)) {
      errors.push(`Terminal Skill ${skillName} display_name must use Chinese Web Harness naming`)
    }
    if (shortDescription === undefined || !/\p{Script=Han}/u.test(shortDescription)) {
      errors.push(`Terminal Skill ${skillName} short_description must be Chinese`)
    }
    if (
      defaultPrompt === undefined ||
      !/\p{Script=Han}/u.test(defaultPrompt) ||
      !defaultPrompt.includes(`使用 $${skillName}`)
    ) {
      errors.push(`Terminal Skill ${skillName} default_prompt must call $${skillName}`)
    }
    if (/\b(?:Rust|Server)\b/iu.test(`${description ?? ""}\n${metadataSource}`)) {
      errors.push(`Terminal Skill ${skillName} contains non-Web Rust/Server language`)
    }
    if (skillName === "web-verify-delivery") {
      for (const fragment of VERIFY_DELIVERY_REQUIRED_FRAGMENTS) {
        if (!skillSource.includes(fragment)) {
          errors.push(`Terminal Skill ${skillName} is missing required workflow: ${fragment}`)
        }
      }
    }
  }
}
