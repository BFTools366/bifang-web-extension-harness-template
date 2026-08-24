import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import { pathExists, readJson, walkFiles } from "../.harness/tooling/files.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "../.harness/tooling/version.ts"
import { inspectProjectChineseComments } from "../.harness/tooling/comment-policy.ts"

/** 保存源 Harness 唯一允许的 13 个 Web Skill canonical id。 */
const EXPECTED_SKILLS = [
  "web-check-development-environment",
  "web-define-product",
  "web-extract-i18n-strings",
  "web-implement-change",
  "web-instantiate-project",
  "web-plan-change",
  "web-prepare-brand-identity",
  "web-prepare-release",
  "web-refactor-code",
  "web-run-parallel-worktrees",
  "web-test-final-artifact-e2e",
  "web-upgrade-harness",
  "web-verify-delivery"
] as const

/** 描述单个源 Skill 的可发现身份与中文 UI 元数据。 */
interface SkillContract {
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

/** 锁定 13 个源 Skill 的 frontmatter、H1 与 openai.yaml 唯一合法值。 */
const SKILL_CONTRACTS = {
  "web-check-development-environment": {
    description:
      "检查 Web Harness、纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目所需的 Node.js、pnpm 和 Google Chrome 环境。只用于初始化、最终构建、故障诊断，以及被硬要求的真实浏览器验证；普通开发任务不重复检查。",
    title: "# Web Harness：检查前端开发环境",
    displayName: "Web Harness：检查前端开发环境",
    shortDescription: "检查 React Web 或 Plasmo MV3 Extension 的前端工具链",
    defaultPrompt:
      "使用 $web-check-development-environment 检查纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目所需的 Node.js、pnpm 与 Google Chrome 环境。"
  },
  "web-define-product": {
    description:
      "定义或修订单一纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端产品的用户、问题、范围、约束和可衡量成功标准。用于新前端产品、需求含糊，或产品目标、公开边界、隐私/权限约束和成功标准真实变化；范围清楚的日常实现不调用。",
    title: "# Web Harness：定义前端产品",
    displayName: "Web Harness：定义前端产品",
    shortDescription: "定义 React Web 或 Plasmo MV3 Extension 的单一前端产品范围",
    defaultPrompt:
      "使用 $web-define-product 定义纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 单一前端产品的范围与可衡量成功标准。"
  },
  "web-extract-i18n-strings": {
    description:
      "扫描当前纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端的 TSX 用户可见文案，将硬编码字符串迁移到既有 i18next/react-i18next 资源，同时保持默认语言行为。用于已有 React i18n 基线的前端文案整理；不处理 manifest、本地化之外的品牌元数据或非 React 机制。",
    title: "# Web Harness：提取前端国际化文案",
    displayName: "Web Harness：提取前端国际化文案",
    shortDescription: "将 React Web 或 Plasmo MV3 Extension 可见文案迁移至 i18next",
    defaultPrompt:
      "使用 $web-extract-i18n-strings 将纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端界面中的用户可见文案迁移至 i18next 资源。"
  },
  "web-implement-change": {
    description:
      "在 Web Harness 或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游中实施范围清楚的快速/普通标准请求，或执行活动 Work Plan，并运行风险相称的前端 TypeScript、测试与构建检查；里程碑失败后回到此 Skill 修复。",
    title: "# Web Harness：实施前端变更",
    displayName: "Web Harness：实施前端变更",
    shortDescription: "实施 Web Harness 或其 React Web、Plasmo MV3 前端下游变更",
    defaultPrompt:
      "使用 $web-implement-change 在 Web Harness 或其纯 TypeScript React Web、Plasmo Chrome MV3 Extension 下游中实施并验证当前范围内的前端变更。"
  },
  "web-instantiate-project": {
    description:
      "通过源 Web Harness 唯一公开入口向源外空目录创建全新的纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端下游，安全重置模板身份并建立独立 Git 根。用于创建单一类型前端项目；不得用于原地初始化或修改已初始化项目。",
    title: "# Web Harness：实例化前端项目",
    displayName: "Web Harness：实例化前端项目",
    shortDescription: "从源 Web Harness 创建独立的 React Web 或 Plasmo MV3 前端项目",
    defaultPrompt:
      "使用 $web-instantiate-project 从源 Web Harness 创建独立、单一类型的纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目。"
  },
  "web-plan-change": {
    description:
      "为 Web Harness 或纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游创建可直接实施的精简 Todo。只用于前端里程碑、发布候选或用户明确要求持久计划的任务；普通快速与标准任务直接实施。",
    title: "# Web Harness：规划前端变更",
    displayName: "Web Harness：规划前端变更",
    shortDescription: "规划 Web Harness 或其 React Web、Plasmo MV3 前端下游变更",
    defaultPrompt:
      "使用 $web-plan-change 为 Web Harness 或其纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游制定可执行的变更计划。"
  },
  "web-prepare-brand-identity": {
    description:
      "为当前唯一的纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目创建或更新正式 Logo，并从 .harness/project.json 同步当前宿主的品牌元数据。用于首次实例化、品牌改名、Logo 或用户可见前端产品元数据变化。",
    title: "# Web Harness：准备前端品牌身份",
    displayName: "Web Harness：准备前端品牌身份",
    shortDescription: "同步 React Web 或 Plasmo MV3 Extension 的 Logo 与品牌元数据",
    defaultPrompt:
      "使用 $web-prepare-brand-identity 为当前纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目创建 Logo 并同步品牌元数据。"
  },
  "web-prepare-release": {
    description:
      "为已验收的 Web Harness 或单 package 纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游准备可追溯发布：Harness 绑定精确源码候选，Web 只处理 Vite dist，Extension 只处理 Chrome MV3 zip。用于用户明确要求准备前端发布、检查发布就绪或整理候选元数据；不自动创建标签、推送、上传或发布。",
    title: "# Web Harness：准备前端发布",
    displayName: "Web Harness：准备前端发布",
    shortDescription: "准备 Web Harness 源码、Vite dist 或 Chrome MV3 zip 前端候选",
    defaultPrompt:
      "使用 $web-prepare-release 评估并整理 Web Harness 源码候选、React Web Vite dist 或 Plasmo Chrome MV3 zip 前端发布候选。"
  },
  "web-refactor-code": {
    description:
      "对单 package 纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端的 TypeScript/TSX 做行为保持重构，处理文件职责、功能目录、命名、重复、状态归属、渲染性能和浏览器生命周期风险。仅在存在真实前端结构问题时使用，不改变公开行为、权限或项目类型。",
    title: "# Web Harness：重构前端代码",
    displayName: "Web Harness：重构前端代码",
    shortDescription: "保持行为不变地重构 React Web 或 Plasmo MV3 前端 TypeScript 代码",
    defaultPrompt:
      "使用 $web-refactor-code 在保持可观察行为不变的前提下重构纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端代码。"
  },
  "web-run-parallel-worktrees": {
    description:
      "为 Web Harness 或其 React Web、Plasmo Chrome MV3 Extension 前端下游的已有标准/里程碑计划创建隔离 Git Worktree，并安全整合至少两个写入范围互不重叠的 Todo；也可只读审计或保守清理由本流程创建的 Worktree。创建模式要求用户明确要求且 Git 基线干净已提交。",
    title: "# Web Harness：运行前端并行工作树",
    displayName: "Web Harness：运行前端并行工作树",
    shortDescription: "用隔离 Git 工作树协调互不重叠的 Web Harness 前端任务",
    defaultPrompt:
      "使用 $web-run-parallel-worktrees 通过隔离 Git 工作树协调 Web Harness 或其 React Web、Plasmo Chrome MV3 Extension 前端下游中互不重叠的任务。"
  },
  "web-test-final-artifact-e2e": {
    description:
      "按 $web-verify-delivery 已批准的执行契约，在隔离的真实 Google Chrome 中对精确 React Web Vite dist 或 Plasmo Chrome MV3 Extension 前端候选执行端到端场景并返回证据。不得自行决定策略、候选准入、Todo 回流或里程碑结论，也不得用于开发预览、规划、普通编码或单元测试替代。",
    title: "# Web Harness：测试前端最终产物 E2E",
    displayName: "Web Harness：测试前端最终产物",
    shortDescription: "在真实 Chrome 中测试 Vite dist 或 Plasmo Chrome MV3 前端候选",
    defaultPrompt:
      "使用 $web-test-final-artifact-e2e 在隔离的真实 Google Chrome 中测试精确的 React Web Vite dist 或 Plasmo Chrome MV3 前端候选。"
  },
  "web-upgrade-harness": {
    description:
      "在已实例化的单一类型纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端下游中，以只读预演和文件所有权分类安全同步较新 Web Harness 工程层，同时保留产品代码、projectType、品牌、项目记忆、策略和本地修改。用于用户要求比较、升级、迁移或刷新前端 Harness；默认不写入。",
    title: "# Web Harness：升级前端工程基线",
    displayName: "Web Harness：升级前端工程基线",
    shortDescription: "将较新 Web Harness 工程层安全同步到单一 React 或 Plasmo MV3 前端下游",
    defaultPrompt:
      "使用 $web-upgrade-harness 先执行只读预演，再将较新 Web Harness 前端工程层安全同步到单一 React Web 或 Plasmo Chrome MV3 Extension 下游。"
  },
  "web-verify-delivery": {
    description:
      "对 Web Harness 前端里程碑或单一类型纯 TypeScript React Web、Plasmo Chrome MV3 Extension 下游发布候选执行完整真实产物验收：Harness 验证两种独立生成结果，Web 验证 Vite dist，Extension 验证 Chrome MV3 构建/zip；仅在硬要求时使用真实 Chrome。只在全部 Todo 完成或用户明确要求完整前端验收时使用。",
    title: "# Web Harness：验证前端交付",
    displayName: "Web Harness：验证前端交付",
    shortDescription: "验收 Web Harness、Vite dist 或 Plasmo Chrome MV3 前端候选",
    defaultPrompt:
      "使用 $web-verify-delivery 验收 Web Harness 源码里程碑、React Web Vite dist 或 Plasmo Chrome MV3 前端候选。"
  }
} as const satisfies Record<(typeof EXPECTED_SKILLS)[number], SkillContract>

/** 匹配 openai.yaml 唯一允许的 interface 与三个双引号字符串字段。 */
const OPENAI_METADATA_PATTERN =
  /^interface:\n {2}display_name: ("(?:\\.|[^"\\])*")\n {2}short_description: ("(?:\\.|[^"\\])*")\n {2}default_prompt: ("(?:\\.|[^"\\])*")\n$/u
/** 匹配可以证明元数据真正包含中文的汉字。 */
const HAN_CHARACTER = /\p{Script=Han}/u
/** 拒绝 Skill 身份与发现元数据中混入其他 Harness 语言。 */
const FORBIDDEN_SKILL_IDENTITY_LANGUAGE = /\b(?:Rust|Server)\b/iu
/** 保存 Skill 短描述在 Codex 列表中的最小字符数。 */
const MIN_SHORT_DESCRIPTION_LENGTH = 25
/** 保存 Skill 短描述在 Codex 列表中的最大字符数。 */
const MAX_SHORT_DESCRIPTION_LENGTH = 64

// 保存 REQUIRED_FILES 变量供当前逻辑使用。
const REQUIRED_FILES = [
  "AGENTS.md",
  "README.md",
  "LICENSE.en.md",
  "LICENSE.zh-CN.md",
  "Version.md",
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
  ".harness/tooling/cli.ts",
  ".harness/tooling/build.ts",
  ".harness/tooling/comment-policy.ts",
  ".harness/tooling/source-size-policy.ts",
  ".harness/tooling/init.ts",
  ".harness/tooling/instantiate.ts",
  ".harness/tooling/brand.ts",
  ".harness/tooling/environment.ts",
  ".harness/tooling/release.ts",
  ".harness/tooling/templates/build.ts",
  ".harness/tooling/templates/environment.ts",
  ".harness/tooling/templates/http.ts",
  ".harness/tooling/templates/logging.ts",
  ".harness/tooling/templates/pagination.ts",
  ".harness/tooling/version.ts",
  "scripts/instantiate.ts",
  "tests/build-tooling.test.ts",
  "tests/source-size-policy.test.ts"
] as const

// 保存 GOVERNED_MARKDOWN_ROOTS 变量供当前逻辑使用。
const GOVERNED_MARKDOWN_ROOTS = [
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

// 执行 collectFiles 函数的处理逻辑。
async function collectFiles(root: string): Promise<string[]> {
  // 保存 absolutePaths 变量供当前逻辑使用。
  const absolutePaths = await walkFiles(root, {
    // 执行 当前声明 函数的处理逻辑。
    exclude: (name) => name === ".git" || name === "node_modules"
  })
  return absolutePaths.map(
    /* 执行 当前声明 函数的处理逻辑。 */ (absolute) => path.relative(root, absolute)
  )
}

// 执行 governedMarkdownFiles 函数的处理逻辑。
function governedMarkdownFiles(files: string[]): string[] {
  return files.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (file) => {
      if (!file.endsWith(".md")) return false
      return GOVERNED_MARKDOWN_ROOTS.some(
        // 执行 当前声明 函数的处理逻辑。
        (entry) => file === entry || (entry.endsWith(".md") ? false : file.startsWith(`${entry}/`))
      )
    }
  )
}

// 执行 parseFrontmatter 函数的处理逻辑。
function parseFrontmatter(contents: string): Record<string, string> | undefined {
  if (!contents.startsWith("---\n")) return undefined
  // 保存 end 变量供当前逻辑使用。
  const end = contents.indexOf("\n---\n", 4)
  if (end < 0) return undefined
  // 保存 result 变量供当前逻辑使用。
  const result: Record<string, string> = {}
  // 保存 line 变量供当前逻辑使用。
  for (const line of contents.slice(4, end).split("\n")) {
    // 保存 separator 变量供当前逻辑使用。
    const separator = line.indexOf(":")
    if (separator <= 0) return undefined
    // 保存 key 变量供当前逻辑使用。
    const key = line.slice(0, separator).trim()
    if (key in result) return undefined
    result[key] = line.slice(separator + 1).trim()
  }
  return result
}

// 保存 AGENT_POLICY_FIELDS 变量供当前逻辑使用。
const AGENT_POLICY_FIELDS = {
  schema_version: ["2"],
  decision_mode: ["reuse_then_infer_then_ask"],
  standard_work_plan: ["disabled"],
  parallel_worktree_subagents: ["disabled"],
  milestone_smoke: ["disabled"],
  milestone_e2e: ["ask"]
} as const

// 执行 validateAgentPolicy 函数的处理逻辑。
async function validateAgentPolicy(root: string, errors: string[]): Promise<void> {
  // 保存 relativePath 变量供当前逻辑使用。
  const relativePath = "docs/AGENT_POLICY.md"
  // 保存 frontmatter 变量供当前逻辑使用。
  const frontmatter = parseFrontmatter(await readFile(path.join(root, relativePath), "utf8"))
  if (frontmatter === undefined) {
    errors.push(`${relativePath} has invalid or duplicate frontmatter fields`)
    return
  }

  // 保存 [key, allowed] 变量供当前逻辑使用。
  for (const [key, allowed] of Object.entries(AGENT_POLICY_FIELDS)) {
    // 保存 value 变量供当前逻辑使用。
    const value = frontmatter[key]
    if (value === undefined) errors.push(`${relativePath} is missing ${key}`)
    else if (!(allowed as readonly string[]).includes(value)) {
      errors.push(`${relativePath} has invalid ${key}: ${value}`)
    }
  }
  // 保存 key 变量供当前逻辑使用。
  for (const key of Object.keys(frontmatter)) {
    if (!(key in AGENT_POLICY_FIELDS)) errors.push(`${relativePath} has unknown field: ${key}`)
  }
}

/** 描述从 agents/openai.yaml 严格解析出的三个发现字段。 */
interface OpenAiMetadata {
  /** 保存 Codex Skill 列表展示名。 */
  displayName: string
  /** 保存 Codex Skill 列表短描述。 */
  shortDescription: string
  /** 保存 Codex 调用 Skill 时的默认提示。 */
  defaultPrompt: string
}

/** 将 openai.yaml 中受限的 JSON 风格双引号值解析为字符串。 */
function parseQuotedMetadataValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  try {
    // 保存 value 变量供当前逻辑使用。
    const value: unknown = JSON.parse(raw)
    return typeof value === "string" ? value : undefined
  } catch {
    return undefined
  }
}

/** 仅接受固定 interface 层级、字段顺序与双引号字符串。 */
function parseOpenAiMetadata(contents: string): OpenAiMetadata | undefined {
  // 保存 match 变量供当前逻辑使用。
  const match = contents.match(OPENAI_METADATA_PATTERN)
  if (match === null) return undefined
  // 保存 displayName 变量供当前逻辑使用。
  const displayName = parseQuotedMetadataValue(match[1])
  // 保存 shortDescription 变量供当前逻辑使用。
  const shortDescription = parseQuotedMetadataValue(match[2])
  // 保存 defaultPrompt 变量供当前逻辑使用。
  const defaultPrompt = parseQuotedMetadataValue(match[3])
  if (displayName === undefined || shortDescription === undefined || defaultPrompt === undefined) {
    return undefined
  }
  return { displayName, shortDescription, defaultPrompt }
}

/** 生成当前 canonical Skill 唯一合法的 frontmatter 文本。 */
function canonicalSkillFrontmatter(skill: string, contract: SkillContract): string {
  return `---\nname: ${skill}\ndescription: ${contract.description}\n---\n`
}

/** 生成当前 canonical Skill 唯一合法的 openai.yaml 文本。 */
function canonicalOpenAiMetadata(contract: SkillContract): string {
  return [
    "interface:",
    `  display_name: ${JSON.stringify(contract.displayName)}`,
    `  short_description: ${JSON.stringify(contract.shortDescription)}`,
    `  default_prompt: ${JSON.stringify(contract.defaultPrompt)}`,
    ""
  ].join("\n")
}

/** 收集 SKILL.md 中所有一级标题，用于拒绝标题漂移或重复身份。 */
function collectLevelOneHeadings(contents: string): string[] {
  // 保存 headings 变量供当前逻辑使用。
  const headings: string[] = []
  // 遍历每个 Markdown 一级标题并保留完整文本。
  for (const match of contents.matchAll(/^# .+$/gmu)) headings.push(match[0])
  return headings
}

/** 判断 default_prompt 是否为仅含一个中文终止符的单句提示。 */
function isSingleChineseSentence(value: string): boolean {
  return /^[^。！？]+[。！？]$/u.test(value)
}

// 执行 validateSkills 函数的处理逻辑。
async function validateSkills(root: string, errors: string[]): Promise<string[]> {
  // 保存 skillsRoot 变量供当前逻辑使用。
  const skillsRoot = path.join(root, ".agents/skills")
  // 保存 entries 变量供当前逻辑使用。
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  // 保存 actual 变量供当前逻辑使用。
  const actual = entries
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
    .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    .sort()
  // 保存 expected 变量供当前逻辑使用。
  const expected = [...EXPECTED_SKILLS].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`Skill directories must exactly match: ${expected.join(", ")}`)
  }

  // 保存 perSkillErrors 变量供当前逻辑使用。
  const perSkillErrors = await Promise.all(
    EXPECTED_SKILLS.map(
      /* 逐项校验 canonical Skill 的精确身份与发现元数据。 */ (skill) =>
        validateSkill(skillsRoot, skill, SKILL_CONTRACTS[skill])
    )
  )
  // 保存 skillErrors 变量供当前逻辑使用。
  for (const skillErrors of perSkillErrors) errors.push(...skillErrors)
  return actual
}

/** 校验单个源 Skill 的目录、frontmatter、H1 和中文发现元数据。 */
async function validateSkill(
  skillsRoot: string,
  skill: string,
  contract: SkillContract
): Promise<string[]> {
  // 保存 skillErrors 变量供当前逻辑使用。
  const skillErrors: string[] = []
  // 保存 skillPath 变量供当前逻辑使用。
  const skillPath = path.join(skillsRoot, skill, "SKILL.md")
  // 保存 yamlPath 变量供当前逻辑使用。
  const yamlPath = path.join(skillsRoot, skill, "agents/openai.yaml")
  if (!(await pathExists(skillPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/SKILL.md`)
    return skillErrors
  }
  // 保存 skillSource 变量供当前逻辑使用。
  const skillSource = await readFile(skillPath, "utf8")
  // 保存 frontmatter 变量供当前逻辑使用。
  const frontmatter = parseFrontmatter(skillSource)
  if (frontmatter === undefined) skillErrors.push(`${skill}/SKILL.md has invalid frontmatter`)
  else {
    if (frontmatter.name !== skill)
      skillErrors.push(`${skill}/SKILL.md frontmatter name is incorrect`)
    if (frontmatter.description !== contract.description) {
      skillErrors.push(`${skill}/SKILL.md frontmatter description must exactly match its contract`)
    }
  }
  if (!skillSource.startsWith(canonicalSkillFrontmatter(skill, contract))) {
    skillErrors.push(`${skill}/SKILL.md frontmatter must contain exactly name and description`)
  }

  // 保存 headings 变量供当前逻辑使用。
  const headings = collectLevelOneHeadings(skillSource)
  if (headings.length !== 1 || headings[0] !== contract.title) {
    skillErrors.push(`${skill}/SKILL.md H1 must exactly equal ${contract.title}`)
  }

  if (!(await pathExists(yamlPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/agents/openai.yaml`)
  } else {
    // 保存 yaml 变量供当前逻辑使用。
    const yaml = await readFile(yamlPath, "utf8")
    // 保存 metadata 变量供当前逻辑使用。
    const metadata = parseOpenAiMetadata(yaml)
    if (metadata === undefined) {
      skillErrors.push(
        `${skill}/agents/openai.yaml must contain exactly interface and three quoted metadata fields`
      )
    } else {
      if (
        !metadata.displayName.startsWith("Web Harness：") ||
        !HAN_CHARACTER.test(metadata.displayName)
      ) {
        skillErrors.push(
          `${skill}/agents/openai.yaml display_name must use Chinese Web Harness naming`
        )
      }
      if (
        !HAN_CHARACTER.test(metadata.shortDescription) ||
        metadata.shortDescription.length < MIN_SHORT_DESCRIPTION_LENGTH ||
        metadata.shortDescription.length > MAX_SHORT_DESCRIPTION_LENGTH
      ) {
        skillErrors.push(
          `${skill}/agents/openai.yaml short_description must be 25-64 characters and contain Chinese`
        )
      }
      if (!HAN_CHARACTER.test(metadata.defaultPrompt)) {
        skillErrors.push(`${skill}/agents/openai.yaml default_prompt must contain Chinese`)
      }
      if (!metadata.defaultPrompt.includes(`$${skill}`)) {
        skillErrors.push(`${skill}/agents/openai.yaml default_prompt must call $${skill}`)
      }
      if (!isSingleChineseSentence(metadata.defaultPrompt)) {
        skillErrors.push(`${skill}/agents/openai.yaml default_prompt must be one Chinese sentence`)
      }
      if (
        metadata.displayName !== contract.displayName ||
        metadata.shortDescription !== contract.shortDescription ||
        metadata.defaultPrompt !== contract.defaultPrompt
      ) {
        skillErrors.push(`${skill}/agents/openai.yaml metadata must exactly match its contract`)
      }
    }
    if (yaml !== canonicalOpenAiMetadata(contract)) {
      skillErrors.push(`${skill}/agents/openai.yaml must use the canonical exact YAML form`)
    }

    // 保存 frontmatterEnd 变量供当前逻辑使用。
    const frontmatterEnd = skillSource.indexOf("\n---\n", 4)
    // 保存 identitySource 变量供当前逻辑使用。
    const identitySource = [
      frontmatterEnd < 0 ? "" : skillSource.slice(0, frontmatterEnd + 5),
      headings.join("\n"),
      yaml
    ].join("\n")
    if (FORBIDDEN_SKILL_IDENTITY_LANGUAGE.test(identitySource)) {
      skillErrors.push(`${skill} identity metadata contains non-Web Rust/Server language`)
    }
  }
  return skillErrors
}

// 执行 cleanLinkTarget 函数的处理逻辑。
function cleanLinkTarget(raw: string): string {
  // 保存 withoutAngles 变量供当前逻辑使用。
  const withoutAngles = raw.trim().replace(/^<|>$/g, "")
  // 保存 beforeTitle 变量供当前逻辑使用。
  const beforeTitle = withoutAngles.split(/\s+["']/)[0] ?? withoutAngles
  return beforeTitle.split("#")[0] ?? beforeTitle
}

// 执行 validateMarkdownLinks 函数的处理逻辑。
async function validateMarkdownLinks(
  root: string,
  markdownFiles: string[],
  errors: string[]
): Promise<number> {
  // 保存 linkPattern 变量供当前逻辑使用。
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  // 保存 perFile 变量供当前逻辑使用。
  const perFile = await Promise.all(
    markdownFiles.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (relativePath) => {
        // 保存 contents 变量供当前逻辑使用。
        const contents = await readFile(path.join(root, relativePath), "utf8")
        // 保存 fileErrors 变量供当前逻辑使用。
        const fileErrors: string[] = []
        // 保存 checked 变量供当前逻辑使用。
        let checked = 0
        // 保存 match 变量供当前逻辑使用。
        for (const match of contents.matchAll(linkPattern)) {
          // 保存 target 变量供当前逻辑使用。
          const target = cleanLinkTarget(match[1] ?? "")
          if (target === "" || /^(?:https?:|mailto:|data:)/i.test(target)) continue
          checked += 1
          // 保存 decoded 变量供当前逻辑使用。
          let decoded: string
          try {
            decoded = decodeURIComponent(target)
          } catch {
            fileErrors.push(`${relativePath} contains malformed link: ${target}`)
            continue
          }
          // 保存 resolved 变量供当前逻辑使用。
          const resolved = path.isAbsolute(decoded)
            ? decoded
            : path.resolve(root, path.dirname(relativePath), decoded)
          if (!(await pathExists(resolved))) {
            fileErrors.push(`${relativePath} has broken local link: ${target}`)
          }
        }
        return { checked, fileErrors }
      }
    )
  )
  // 保存 checked 变量供当前逻辑使用。
  let checked = 0
  // 保存 result 变量供当前逻辑使用。
  for (const result of perFile) {
    checked += result.checked
    errors.push(...result.fileErrors)
  }
  return checked
}

// 执行 validateContent 函数的处理逻辑。
async function validateContent(
  root: string,
  markdownFiles: string[],
  errors: string[]
): Promise<void> {
  // 保存 placeholderPatterns 变量供当前逻辑使用。
  const placeholderPatterns = [
    /\[(?:TODO|REPLACE[-_ ]?ME)\]/i,
    /<(?:replace[-_ ]?me|project[-_ ]?name|your[-_ ]?value)>/i,
    /\{\{(?:TODO|REPLACE[-_ ]?ME)[^}]*\}\}/i
  ]
  // 保存 perFileMessages 变量供当前逻辑使用。
  const perFileMessages = await Promise.all(
    markdownFiles.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (relativePath) => {
        // 保存 contents 变量供当前逻辑使用。
        const contents = await readFile(path.join(root, relativePath), "utf8")
        return placeholderPatterns.some(
          /* 执行 当前声明 函数的处理逻辑。 */ (pattern) => pattern.test(contents)
        )
          ? `${relativePath} contains unfinished placeholder text`
          : undefined
      }
    )
  )
  // 保存 message 变量供当前逻辑使用。
  for (const message of perFileMessages) {
    if (message !== undefined) errors.push(message)
  }
}

// 保存 MAINTAINED_TEXT_EXTENSIONS 变量供当前逻辑使用。
const MAINTAINED_TEXT_EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".yaml", ".yml", ".css"] as const
// 保存 FILE_SIZE_HARD_LIMIT 变量供当前逻辑使用。
const FILE_SIZE_HARD_LIMIT = 2000
// 保存 EXCLUDED_FILE_SIZE_PATHS 变量供当前逻辑使用。
const EXCLUDED_FILE_SIZE_PATHS = ["pnpm-lock.yaml"] as const

/** 将受管 TypeScript 源码解析为可忽略注释文本的结构化语法树。 */
function parseTypeScriptSource(contents: string, filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** 返回指定语法范围内具名函数声明。 */
function findFunctionDeclaration(
  sourceFile: ts.SourceFile,
  name: string
): ts.FunctionDeclaration | undefined {
  // 保存 found 变量供当前逻辑使用。
  let found: ts.FunctionDeclaration | undefined
  /** 遍历源码并捕获第一个匹配的函数声明。 */
  function visit(node: ts.Node): void {
    if (found !== undefined) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/** 收集指定范围内直接调用某个标识符且参数源码精确匹配的位置。 */
function identifierCallPositions(
  scope: ts.Node,
  sourceFile: ts.SourceFile,
  callee: string,
  argumentTexts: readonly string[]
): number[] {
  // 保存 positions 变量供当前逻辑使用。
  const positions: number[] = []
  /** 遍历语法节点并收集结构匹配的函数调用。 */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee &&
      node.arguments.length === argumentTexts.length &&
      node.arguments.every(
        /* 比较当前调用参数的规范源码。 */ (argument, index) =>
          argument.getText(sourceFile) === argumentTexts[index]
      )
    ) {
      positions.push(node.getStart(sourceFile))
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return positions
}

/** 判断语法树中是否真实存在指定标识符，忽略注释与字符串文本。 */
function containsIdentifier(scope: ts.Node, name: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历语法节点并查找真实标识符。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isIdentifier(node) && node.text === name) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断语法树中是否真实存在指定字符串字面量，忽略注释文本。 */
function containsStringLiteral(scope: ts.Node, value: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历语法节点并查找真实字符串字面量。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === value
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断具名函数体顶层是否直接抛出错误。 */
function hasDirectThrow(sourceFile: ts.SourceFile, functionName: string): boolean {
  // 保存 declaration 变量供当前逻辑使用。
  const declaration = findFunctionDeclaration(sourceFile, functionName)
  return (
    declaration?.body?.statements.some(
      /* 检查函数顶层是否存在 throw statement。 */ (statement) => ts.isThrowStatement(statement)
    ) === true
  )
}

/** 收集指定属性访问调用且参数源码精确匹配的位置。 */
function propertyAccessCallPositions(
  scope: ts.Node,
  sourceFile: ts.SourceFile,
  owner: string,
  property: string,
  argumentTexts: readonly string[]
): number[] {
  // 保存 positions 变量供当前逻辑使用。
  const positions: number[] = []
  /** 遍历语法节点并收集结构匹配的属性调用。 */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === owner &&
      node.expression.name.text === property &&
      node.arguments.length === argumentTexts.length &&
      node.arguments.every(
        /* 比较属性调用参数的规范源码。 */ (argument, index) =>
          argument.getText(sourceFile) === argumentTexts[index]
      )
    ) {
      positions.push(node.getStart(sourceFile))
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return positions
}

/** 返回函数体顶层直接 await 指定调用的位置。 */
function directAwaitedCallPosition(
  declaration: ts.FunctionDeclaration | undefined,
  sourceFile: ts.SourceFile,
  callee: string,
  argumentTexts: readonly string[]
): number | undefined {
  if (declaration?.body === undefined) return undefined
  // 保存 statement 变量供当前逻辑使用。
  for (const statement of declaration.body.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression)) {
      continue
    }
    // 保存 expression 变量供当前逻辑使用。
    const expression = statement.expression.expression
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === callee &&
      expression.arguments.length === argumentTexts.length &&
      expression.arguments.every(
        /* 比较顶层 await 调用参数的规范源码。 */ (argument, index) =>
          argument.getText(sourceFile) === argumentTexts[index]
      )
    ) {
      return statement.getStart(sourceFile)
    }
  }
  return undefined
}

/** 提取具名函数直接返回的字符串或无插值模板正文。 */
function directFunctionReturnText(
  sourceFile: ts.SourceFile,
  functionName: string
): string | undefined {
  // 保存 declaration 变量供当前逻辑使用。
  const declaration = findFunctionDeclaration(sourceFile, functionName)
  if (declaration?.body === undefined) return undefined
  // 保存 statement 变量供当前逻辑使用。
  for (const statement of declaration.body.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression !== undefined &&
      (ts.isStringLiteral(statement.expression) ||
        ts.isNoSubstitutionTemplateLiteral(statement.expression))
    ) {
      return statement.expression.text
    }
  }
  return undefined
}

/** 判断源码是否从目标模块导入了指定标识符。 */
function hasNamedImport(sourceFile: ts.SourceFile, modulePath: string, name: string): boolean {
  return sourceFile.statements.some(
    /* 检查单条 import declaration 的模块与具名绑定。 */ (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === modulePath &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        /* 检查导入元素保留的本地标识符。 */ (element) => element.name.text === name
      )
  )
}

/** 判断源码对象字面量中存在指定字符串脚本值。 */
function hasStringProperty(scope: ts.Node, name: string, value: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历对象属性并匹配规范脚本键值。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isPropertyAssignment(node)) {
      // 保存 propertyName 变量供当前逻辑使用。
      const propertyName = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : undefined
      if (
        propertyName === name &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
        node.initializer.text === value
      ) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断 requirePaths 的数组参数精确包含目标受管路径。 */
function requirePathsContains(scope: ts.Node, requiredPath: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历 requirePaths 调用并检查第二参数数组。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "requirePaths" &&
      node.arguments[1] !== undefined &&
      ts.isArrayLiteralExpression(node.arguments[1]) &&
      node.arguments[1].elements.some(
        /* 匹配必需路径字符串。 */ (element) =>
          ts.isStringLiteral(element) && element.text === requiredPath
      )
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 提取源码顶层具名常量中的无插值模板正文。 */
function noSubstitutionTemplateValue(
  sourceFile: ts.SourceFile,
  variableName: string
): string | undefined {
  // 保存 value 变量供当前逻辑使用。
  let value: string | undefined
  /** 遍历变量声明并提取目标模板文本。 */
  function visit(node: ts.Node): void {
    if (value !== undefined) return
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer !== undefined &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    ) {
      value = node.initializer.text
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return value
}

/** 判断 runCli 对指定命令执行直接 return 调用，而不是仅在注释保留字符串。 */
function hasCommandReturnDispatch(
  sourceFile: ts.SourceFile,
  commandValue: string,
  callee: string,
  argumentTexts: readonly string[]
): boolean {
  // 保存 runCli 变量供当前逻辑使用。
  const runCli = findFunctionDeclaration(sourceFile, "runCli")
  if (runCli?.body === undefined) return false
  return runCli.body.statements.some(
    /* 检查命令比较与 return 调用的结构。 */ (statement) => {
      if (!ts.isIfStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false
      // 保存 condition 变量供当前逻辑使用。
      const condition = statement.expression
      if (
        condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
        !ts.isIdentifier(condition.left) ||
        condition.left.text !== "command" ||
        !ts.isStringLiteral(condition.right) ||
        condition.right.text !== commandValue ||
        !ts.isReturnStatement(statement.thenStatement) ||
        statement.thenStatement.expression === undefined
      ) {
        return false
      }
      // 保存 returned 变量供当前逻辑使用。
      const returned = statement.thenStatement.expression
      return (
        ts.isCallExpression(returned) &&
        ts.isIdentifier(returned.expression) &&
        returned.expression.text === callee &&
        returned.arguments.length === argumentTexts.length &&
        returned.arguments.every(
          /* 比较 return 调用的规范参数。 */ (argument, index) =>
            argument.getText(sourceFile) === argumentTexts[index]
        )
      )
    }
  )
}

// 执行 validateFileSize 函数的处理逻辑。
async function validateFileSize(root: string, files: string[], errors: string[]): Promise<void> {
  // 保存 candidates 变量供当前逻辑使用。
  const candidates = files.filter(
    // 执行 当前声明 函数的处理逻辑。
    (file) =>
      MAINTAINED_TEXT_EXTENSIONS.some(
        /* 执行 当前声明 函数的处理逻辑。 */ (extension) => file.endsWith(extension)
      ) && !EXCLUDED_FILE_SIZE_PATHS.includes(file as (typeof EXCLUDED_FILE_SIZE_PATHS)[number])
  )
  // 保存 perFileLineCounts 变量供当前逻辑使用。
  const perFileLineCounts = await Promise.all(
    candidates.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (relativePath) => {
        // 保存 contents 变量供当前逻辑使用。
        const contents = await readFile(path.join(root, relativePath), "utf8")
        return { relativePath, lines: contents.split("\n").length }
      }
    )
  )
  // 保存 { relativePath, lines } 变量供当前逻辑使用。
  for (const { relativePath, lines } of perFileLineCounts) {
    if (lines > FILE_SIZE_HARD_LIMIT) {
      errors.push(
        `${relativePath} has ${lines} lines, over the ${FILE_SIZE_HARD_LIMIT}-line hard split threshold (ENGINEERING_RULES.md §4)`
      )
    }
  }
}

// 保存 FORBIDDEN_TEMPLATE_PATHS 变量供当前逻辑使用。
const FORBIDDEN_TEMPLATE_PATHS = [
  "pnpm-workspace.yaml",
  "apps",
  "packages",
  ".harness/project.json",
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
  ".env.production",
  ".env.production.local"
] as const

// 执行 validateToolingContract 函数的处理逻辑。
async function validateToolingContract(root: string, errors: string[]): Promise<void> {
  // 保存 requiredExists 变量供当前逻辑使用。
  const requiredExists = await Promise.all(
    REQUIRED_FILES.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (required) => pathExists(path.join(root, required))
    )
  )
  REQUIRED_FILES.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (required, index) => {
      if (!requiredExists[index]) errors.push(`Missing required file: ${required}`)
    }
  )
  // 保存 forbiddenExists 变量供当前逻辑使用。
  const forbiddenExists = await Promise.all(
    FORBIDDEN_TEMPLATE_PATHS.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (forbidden) => pathExists(path.join(root, forbidden))
    )
  )
  FORBIDDEN_TEMPLATE_PATHS.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (forbidden, index) => {
      if (forbiddenExists[index]) errors.push(`Clean template must not contain ${forbidden}`)
    }
  )

  // 保存 manifest 变量供当前逻辑使用。
  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if ("workspaces" in manifest) errors.push("Template package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = manifest.scripts as Record<string, unknown> | undefined
  // 保存 script 变量供当前逻辑使用。
  for (const script of ["harness", "instantiate", "validate:harness", "comments:check", "lint"]) {
    if (typeof scripts?.[script] !== "string")
      errors.push(`package.json is missing script ${script}`)
  }
  if (scripts?.["harness:init"] !== undefined) {
    errors.push("Source Harness must not expose the in-place harness:init script")
  }
  if (scripts?.harness !== "tsx .harness/tooling/cli.ts") {
    errors.push("Source Harness script harness must use the governed CLI")
  }
  if (scripts?.instantiate !== "tsx scripts/instantiate.ts") {
    errors.push("Source Harness script instantiate must use the governed downstream creator")
  }
  if (scripts?.["comments:check"] !== "tsx .harness/tooling/comment-policy.ts check") {
    errors.push("Source Harness script comments:check must use the governed comment policy")
  }
  if (scripts?.lint !== "eslint . && pnpm comments:check") {
    errors.push("Source Harness script lint must enforce the governed comment policy")
  }
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies = manifest.devDependencies as Record<string, unknown> | undefined
  // 保存 [dependency, version] 变量供当前逻辑使用。
  for (const [dependency, version] of [
    ["typescript", "6.0.3"],
    ["vitest", "4.1.10"],
    ["eslint", "10.8.1"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies?.[dependency], version)) {
      errors.push(`${dependency} minimum must not be lower than ${version}`)
    }
  }
  // 保存 cli 变量供当前逻辑使用。
  const cli = await readFile(path.join(root, ".harness/tooling/cli.ts"), "utf8")
  // 保存 cliSourceFile 变量供当前逻辑使用。
  const cliSourceFile = parseTypeScriptSource(cli, ".harness/tooling/cli.ts")
  // 保存 usageText 变量供当前逻辑使用。
  const usageText = directFunctionReturnText(cliSourceFile, "usage")
  if (usageText === undefined || !usageText.includes("pnpm instantiate")) {
    errors.push("Harness CLI is missing the pnpm instantiate help contract")
  }
  // 保存 runBrand 变量供当前逻辑使用。
  const runBrand = findFunctionDeclaration(cliSourceFile, "runBrand")
  if (
    runBrand === undefined ||
    !containsStringLiteral(runBrand, "refresh") ||
    !containsIdentifier(runBrand, "refreshBrand")
  ) {
    errors.push("Harness CLI is missing the brand refresh command contract")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "init", "rejectInPlaceInitialization", [])) {
    errors.push("Harness CLI must structurally reject the init command")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "brand", "runBrand", ["rest", "root"])) {
    errors.push("Harness CLI is missing the brand command dispatch")
  }
  if (!hasCommandReturnDispatch(cliSourceFile, "validate", "runValidate", ["rest", "root"])) {
    errors.push("Harness CLI is missing the validate command dispatch")
  }
  if (containsIdentifier(cliSourceFile, "initializeProject")) {
    errors.push("Harness CLI must not dispatch directly to initializeProject")
  }
  // 保存 initializer 变量供当前逻辑使用。
  const initializer = await readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")
  // 保存 initializerSourceFile 变量供当前逻辑使用。
  const initializerSourceFile = parseTypeScriptSource(initializer, ".harness/tooling/init.ts")
  // 保存 initializeProject 变量供当前逻辑使用。
  const initializeProject = findFunctionDeclaration(initializerSourceFile, "initializeProject")
  // 保存 initializationCalls 变量供当前逻辑使用。
  const initializationCalls = [
    {
      callee: "assertDownstreamInitializationRoot",
      args: ["root"],
      contract: "await assertDownstreamInitializationRoot(root)"
    },
    {
      callee: "annotateTypeScriptProject",
      args: ["root"],
      contract: "await annotateTypeScriptProject(root)"
    },
    {
      callee: "validateProject",
      args: ["root"],
      contract: "await validateProject(root)"
    },
    {
      callee: "runPostInitialization",
      args: ["resolvedOptions"],
      contract: "await runPostInitialization(resolvedOptions)"
    }
  ] as const
  // 保存 initializationPositions 变量供当前逻辑使用。
  const initializationPositions = initializationCalls.map(
    /* 提取初始化函数中顶层 await 调用的位置。 */ ({ callee, args }) =>
      directAwaitedCallPosition(initializeProject, initializerSourceFile, callee, args)
  )
  initializationCalls.forEach(
    /* 报告任何被删除或仅留在注释中的初始化门禁。 */ ({ contract }, index) => {
      if (initializationPositions[index] === undefined) {
        errors.push(`Harness initializer is missing ${contract} downstream-only gate`)
      }
    }
  )
  if (
    initializationPositions.every(
      /* 确认全部关键调用都已解析到真实位置。 */ (position) => position !== undefined
    ) &&
    !initializationPositions.every(
      /* 确认注释、校验与后置命令保持安全顺序。 */ (position, index, positions) =>
        index === 0 || (positions[index - 1] as number) < (position as number)
    )
  ) {
    errors.push(
      "Harness initializer must await root gate, annotation, validation, and post checks in order"
    )
  }
  // 保存 downstreamRootGate 变量供当前逻辑使用。
  const downstreamRootGate = findFunctionDeclaration(
    initializerSourceFile,
    "assertDownstreamInitializationRoot"
  )
  if (
    downstreamRootGate === undefined ||
    !containsIdentifier(downstreamRootGate, "SOURCE_HARNESS_ROOT") ||
    !containsIdentifier(downstreamRootGate, "rejectInPlaceInitialization") ||
    !hasDirectThrow(initializerSourceFile, "rejectInPlaceInitialization")
  ) {
    errors.push("Harness initializer is missing its executable source-root rejection contract")
  }
  // 保存 finalizer 变量供当前逻辑使用。
  const finalizer = await readFile(path.join(root, ".harness/tooling/finalize.ts"), "utf8")
  // 保存 finalizerSourceFile 变量供当前逻辑使用。
  const finalizerSourceFile = parseTypeScriptSource(finalizer, ".harness/tooling/finalize.ts")
  if (
    propertyAccessCallPositions(finalizerSourceFile, finalizerSourceFile, "JSON", "stringify", [
      "HARNESS_ONLY_PATHS"
    ]).length === 0
  ) {
    errors.push("Downstream config must retain the source-only path tombstones for validation")
  }
  // 保存 terminalBrand 变量供当前逻辑使用。
  const terminalBrand = noSubstitutionTemplateValue(finalizerSourceFile, "TERMINAL_BRAND")
  // 保存 terminalBrandSourceFile 变量供当前逻辑使用。
  const terminalBrandSourceFile =
    terminalBrand === undefined
      ? undefined
      : parseTypeScriptSource(terminalBrand, ".harness/tooling/terminal-brand.ts")
  if (
    terminalBrandSourceFile === undefined ||
    !hasNamedImport(terminalBrandSourceFile, "./comment-policy.ts", "annotateTypeScriptSource") ||
    identifierCallPositions(
      terminalBrandSourceFile,
      terminalBrandSourceFile,
      "annotateTypeScriptSource",
      ["brandModule(config)", '"src/brand.ts"']
    ).length === 0
  ) {
    errors.push("Downstream brand refresh must retain the governed Chinese comment annotator")
  }
  // 保存 manifestTooling 变量供当前逻辑使用。
  const manifestTooling = await readFile(path.join(root, ".harness/tooling/manifest.ts"), "utf8")
  // 保存 manifestToolingSourceFile 变量供当前逻辑使用。
  const manifestToolingSourceFile = parseTypeScriptSource(
    manifestTooling,
    ".harness/tooling/manifest.ts"
  )
  // 保存 commonScripts 变量供当前逻辑使用。
  const commonScripts = findFunctionDeclaration(manifestToolingSourceFile, "commonScripts")
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "comments:check",
      "tsx .harness/tooling/comment-policy.ts check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing comments:check")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "source-size:check",
      "tsx .harness/tooling/source-size-policy.ts check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing source-size:check")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(
      commonScripts,
      "lint",
      "eslint . && pnpm comments:check && pnpm source-size:check"
    )
  ) {
    errors.push("Downstream manifest tooling is missing lint")
  }
  if (commonScripts === undefined || !hasStringProperty(commonScripts, "test", "vitest run")) {
    errors.push("Downstream manifest tooling is missing the full test script")
  }
  if (
    commonScripts === undefined ||
    !hasStringProperty(commonScripts, "test:related", "vitest related --run")
  ) {
    errors.push("Downstream manifest tooling is missing test:related")
  }
  // 保存 buildProjectManifest 变量供当前逻辑使用。
  const buildProjectManifest = findFunctionDeclaration(
    manifestToolingSourceFile,
    "buildProjectManifest"
  )
  if (
    buildProjectManifest === undefined ||
    containsStringLiteral(buildProjectManifest, "build:development") ||
    containsStringLiteral(buildProjectManifest, "build:test")
  ) {
    errors.push("Downstream manifest tooling must not generate non-Release build scripts")
  }
  // 遍历终端产物脚本并锁定唯一 Release 构建链。
  for (const [name, value] of [
    ["build", "pnpm build:release"],
    ["build:release", "tsx .harness/tooling/build.ts build"],
    ["package", "tsx .harness/tooling/build.ts package"]
  ] as const) {
    if (
      buildProjectManifest === undefined ||
      !hasStringProperty(buildProjectManifest, name, value)
    ) {
      errors.push(`Downstream manifest tooling is missing governed ${name}`)
    }
  }
  // 保存 downstreamValidator 变量供当前逻辑使用。
  const downstreamValidator = await readFile(
    path.join(root, ".harness/tooling/validate.ts"),
    "utf8"
  )
  // 保存 downstreamValidatorSourceFile 变量供当前逻辑使用。
  const downstreamValidatorSourceFile = parseTypeScriptSource(
    downstreamValidator,
    ".harness/tooling/validate.ts"
  )
  // 保存 validateProject 变量供当前逻辑使用。
  const validateProject = findFunctionDeclaration(downstreamValidatorSourceFile, "validateProject")
  // 保存 assertReleaseOnlyBuildScripts 变量供当前逻辑使用。
  const assertReleaseOnlyBuildScripts = findFunctionDeclaration(
    downstreamValidatorSourceFile,
    "assertReleaseOnlyBuildScripts"
  )
  if (
    !hasNamedImport(
      downstreamValidatorSourceFile,
      "./comment-policy.ts",
      "inspectProjectChineseComments"
    )
  ) {
    errors.push("Downstream validator is missing the comment policy import")
  }
  if (
    validateProject === undefined ||
    !requirePathsContains(validateProject, ".harness/tooling/comment-policy.ts")
  ) {
    errors.push("Downstream validator is missing .harness/tooling/comment-policy.ts")
  }
  if (
    validateProject === undefined ||
    !requirePathsContains(validateProject, ".harness/tooling/source-size-policy.ts")
  ) {
    errors.push("Downstream validator is missing .harness/tooling/source-size-policy.ts")
  }
  if (
    validateProject === undefined ||
    identifierCallPositions(
      validateProject,
      downstreamValidatorSourceFile,
      "inspectProjectChineseComments",
      ["root"]
    ).length === 0
  ) {
    errors.push("Downstream validator is missing inspectProjectChineseComments(root)")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "comments:check",
      "tsx .harness/tooling/comment-policy.ts check"
    )
  ) {
    errors.push("Downstream validator is missing comments:check")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "source-size:check",
      "tsx .harness/tooling/source-size-policy.ts check"
    )
  ) {
    errors.push("Downstream validator is missing source-size:check")
  }
  if (
    validateProject === undefined ||
    !hasStringProperty(
      validateProject,
      "lint",
      "eslint . && pnpm comments:check && pnpm source-size:check"
    )
  ) {
    errors.push("Downstream validator is missing lint")
  }
  if (
    assertReleaseOnlyBuildScripts === undefined ||
    validateProject === undefined ||
    identifierCallPositions(
      validateProject,
      downstreamValidatorSourceFile,
      "assertReleaseOnlyBuildScripts",
      ["scripts", "errors"]
    ).length === 0
  ) {
    errors.push("Downstream validator is missing the Release-only build-script gate")
  }
}

// 执行 validateHarness 函数的处理逻辑。
export async function validateHarness(rootInput: string): Promise<HarnessValidationReport> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 errors 变量供当前逻辑使用。
  const errors: string[] = []
  // 保存 files 变量供当前逻辑使用。
  const files = await collectFiles(root)
  // 保存 markdownFiles 变量供当前逻辑使用。
  const markdownFiles = governedMarkdownFiles(files)
  // 保存 skills 变量供当前逻辑使用。
  const skills = await validateSkills(root, errors)
  await validateAgentPolicy(root, errors)
  await validateContent(root, markdownFiles, errors)
  // 保存 markdownLinks 变量供当前逻辑使用。
  const markdownLinks = await validateMarkdownLinks(root, markdownFiles, errors)
  await validateToolingContract(root, errors)
  await validateFileSize(root, files, errors)
  // 保存 commentViolations 变量供当前逻辑使用。
  const commentViolations = await inspectProjectChineseComments(root)
  errors.push(
    ...commentViolations.map(
      // 执行 当前声明 函数的处理逻辑。
      (violation) => `${violation.file}:${violation.line}:${violation.column} ${violation.message}`
    )
  )
  if (errors.length > 0) throw new Error(`Harness validation failed:\n- ${errors.join("\n- ")}`)
  return { files: files.length, skills, markdownLinks }
}

// 保存 executed 变量供当前逻辑使用。
const executed =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  validateHarness(process.cwd())
    .then(
      /* 执行 当前声明 函数的处理逻辑。 */ (report) => {
        console.log(
          `Harness validation passed (${report.skills.length} skills, ${report.markdownLinks} local links)`
        )
      }
    )
    .catch(
      /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
}
