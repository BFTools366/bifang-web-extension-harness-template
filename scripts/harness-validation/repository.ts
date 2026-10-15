import { execFile } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { RETIRED_PRD_OUTLINE_PATH } from "../../.harness/tooling/config.ts"
import { pathExists, walkFiles } from "../../.harness/tooling/files.ts"
import { DESIGN_SKILL_NAME, validateDesignSkill } from "../../.harness/tooling/design-skill.ts"
import {
  EXPECTED_SKILLS,
  FORBIDDEN_SKILL_IDENTITY_LANGUAGE,
  HAN_CHARACTER,
  MAX_SHORT_DESCRIPTION_LENGTH,
  MIN_SHORT_DESCRIPTION_LENGTH,
  OPENAI_METADATA_PATTERN,
  SKILL_BODY_REQUIREMENTS,
  SKILL_CONTRACTS
} from "./skill-contracts.ts"
import { GOVERNED_MARKDOWN_ROOTS } from "./contracts.ts"
import type { SkillContract } from "./skill-contracts.ts"

/** 保存无需 Shell 的异步 Node 子进程入口。 */
const execFileAsync = promisify(execFile)

/** 锁定列表页纯函数资产必须执行并输出的稳定成功标记。 */
const LIST_VIEW_CONTRACT_SUCCESS = "mantine-list-view executable contracts passed"

/** 将文本换行规范化后再做语义合同比较。 */
function normalizeLineEndings(contents: string): string {
  return contents.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

/** 只转换当前平台的目录分隔符，避免吞掉 POSIX 合法的反斜杠文件名。 */
export function normalizeRepositoryRelativePath(
  relativePath: string,
  separator = path.sep
): string {
  return separator === "/" ? relativePath : relativePath.split(separator).join("/")
}

/** 拒绝不能在 POSIX 与 Windows 之间无歧义表示的仓库路径。 */
export function validateRepositoryPaths(files: string[], errors: string[]): void {
  for (const file of files) {
    if (file.includes("\\")) errors.push(`Repository path must not contain backslash: ${file}`)
  }
}

// 执行 collectFiles 函数的处理逻辑。
export async function collectFiles(root: string): Promise<string[]> {
  const absolutePaths = await walkFiles(root, {
    exclude: (name) => name === ".git" || name === "node_modules"
  })
  return absolutePaths
    .map((absolute) => normalizeRepositoryRelativePath(path.relative(root, absolute)))
    .sort((left, right) => left.localeCompare(right, "en"))
}

// 执行 governedMarkdownFiles 函数的处理逻辑。
export function governedMarkdownFiles(files: string[]): string[] {
  return files.filter((file) => {
    if (!file.endsWith(".md")) return false
    return GOVERNED_MARKDOWN_ROOTS.some(
      (entry) => file === entry || (entry.endsWith(".md") ? false : file.startsWith(`${entry}/`))
    )
  })
}

// 执行 parseFrontmatter 函数的处理逻辑。
export function parseFrontmatter(contents: string): Record<string, string> | undefined {
  const normalized = normalizeLineEndings(contents)
  if (!normalized.startsWith("---\n")) return undefined
  const end = normalized.indexOf("\n---\n", 4)
  if (end < 0) return undefined
  const result: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":")
    if (separator <= 0) return undefined
    const key = line.slice(0, separator).trim()
    if (key in result) return undefined
    result[key] = line.slice(separator + 1).trim()
  }
  return result
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
export function parseQuotedMetadataValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "string" ? value : undefined
  } catch {
    return undefined
  }
}

/** 仅接受固定 interface 层级、字段顺序与双引号字符串。 */
export function parseOpenAiMetadata(contents: string): OpenAiMetadata | undefined {
  const match = normalizeLineEndings(contents).match(OPENAI_METADATA_PATTERN)
  if (match === null) return undefined
  const displayName = parseQuotedMetadataValue(match[1])
  const shortDescription = parseQuotedMetadataValue(match[2])
  const defaultPrompt = parseQuotedMetadataValue(match[3])
  if (displayName === undefined || shortDescription === undefined || defaultPrompt === undefined) {
    return undefined
  }
  return { displayName, shortDescription, defaultPrompt }
}

/** 生成当前 canonical Skill 唯一合法的 frontmatter 文本。 */
export function canonicalSkillFrontmatter(skill: string, contract: SkillContract): string {
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
  const headings: string[] = []
  // 遍历每个 Markdown 一级标题并保留完整文本。
  for (const match of contents.matchAll(/^# .+$/gmu)) headings.push(match[0])
  return headings
}

/** 判断 default_prompt 是否为仅含一个中文终止符的单句提示。 */
export function isSingleChineseSentence(value: string): boolean {
  return /^[^。！？]+[。！？]$/u.test(value)
}

// 执行 validateSkills 函数的处理逻辑。
export async function validateSkills(root: string, errors: string[]): Promise<string[]> {
  const skillsRoot = path.join(root, ".agents/skills")
  // PRD 结构已归需求定义，源也必须拒绝旧原型目录恢复第二份合同。
  if (await pathExists(path.join(root, RETIRED_PRD_OUTLINE_PATH))) {
    errors.push("Retired PRD reference must remain absent from web-design-prototype")
  }
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const actual = entries
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
    .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    .sort()
  const expected = [...EXPECTED_SKILLS].sort()
  const canonicalActual = actual.filter((skill) => skill !== DESIGN_SKILL_NAME)
  if (JSON.stringify(canonicalActual) !== JSON.stringify(expected)) {
    errors.push(`Skill directories must exactly match: ${expected.join(", ")}`)
  }
  if (actual.includes(DESIGN_SKILL_NAME)) await validateDesignSkill(root, errors)

  const perSkillErrors = await Promise.all(
    EXPECTED_SKILLS.map(
      /* 逐项校验 canonical Skill 的精确身份与发现元数据。 */ (skill) =>
        validateSkill(skillsRoot, skill, SKILL_CONTRACTS[skill])
    )
  )
  for (const skillErrors of perSkillErrors) errors.push(...skillErrors)
  return actual
}

/** 使用当前 Node 直接执行列表页纯 TypeScript 契约，拒绝状态资产与测试静默漂移。 */
export async function validateListViewSkillContracts(
  root: string,
  errors: string[]
): Promise<void> {
  const skillRoot = path.join(root, ".agents/skills/web-implement-list-view")
  const contractPath = path.join(skillRoot, "assets/ListPage.contracts.test.ts")
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", contractPath],
      { cwd: skillRoot, encoding: "utf8", timeout: 30_000 }
    )
    if (stdout.trim() !== LIST_VIEW_CONTRACT_SUCCESS) {
      errors.push("web-implement-list-view executable contract failed")
    }
  } catch {
    errors.push("web-implement-list-view executable contract failed")
  }
}

/** 拒绝当前规范重新引入已废弃的三档任务路径语义。 */
export async function validateEventDrivenWorkflow(root: string, errors: string[]): Promise<void> {
  /** 保存 currentRuleFiles 变量，只检查当前规范而不扫描 ADR、Changelog 或验证历史。 */
  const currentRuleFiles = [
    "AGENTS.md",
    "README.md",
    "docs/AGENT_POLICY.md",
    "docs/ENGINEERING_RULES.md",
    "docs/RELEASE.md",
    "docs/TS_WEB_TEMPLATE.md",
    "docs/VERIFICATION.md",
    "docs/work_plan/README.md",
    "docs/harness_engineering/agent_first_design.md",
    "docs/harness_engineering/foundations.md",
    "docs/harness_engineering/project_lifecycle.md",
    ...EXPECTED_SKILLS.map((skill) => `.agents/skills/${skill}/SKILL.md`)
  ]
  /** 保存 forbiddenFragments 变量，锁定已由独立事件门禁替代的旧入口名称。 */
  const forbiddenFragments = [
    "每项任务使用一种路径",
    "快速路径",
    "标准路径",
    "里程碑路径",
    "当前任务路径",
    "推荐敏捷预设",
    "Three delivery paths"
  ] as const
  for (const relativePath of currentRuleFiles) {
    if (!(await pathExists(path.join(root, relativePath)))) continue
    const source = await readFile(path.join(root, relativePath), "utf8")
    for (const fragment of forbiddenFragments) {
      if (source.includes(fragment)) {
        errors.push(`obsolete tiered workflow remains in ${relativePath}: ${fragment}`)
      }
    }
  }
}

/** 校验单个源 Skill 的目录、frontmatter、H1 和中文发现元数据。 */
async function validateSkill(
  skillsRoot: string,
  skill: (typeof EXPECTED_SKILLS)[number],
  contract: SkillContract
): Promise<string[]> {
  const skillErrors: string[] = []
  const skillPath = path.join(skillsRoot, skill, "SKILL.md")
  const yamlPath = path.join(skillsRoot, skill, "agents/openai.yaml")
  if (!(await pathExists(skillPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/SKILL.md`)
    return skillErrors
  }
  const skillSource = normalizeLineEndings(await readFile(skillPath, "utf8"))
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

  const headings = collectLevelOneHeadings(skillSource)
  if (headings.length !== 1 || headings[0] !== contract.title) {
    skillErrors.push(`${skill}/SKILL.md H1 must exactly equal ${contract.title}`)
  }

  const requiredBodyFragments = SKILL_BODY_REQUIREMENTS[skill] ?? []
  for (const requiredBodyFragment of requiredBodyFragments) {
    if (!skillSource.includes(requiredBodyFragment)) {
      skillErrors.push(`${skill}/SKILL.md is missing required workflow: ${requiredBodyFragment}`)
    }
  }

  if (!(await pathExists(yamlPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/agents/openai.yaml`)
  } else {
    const yaml = normalizeLineEndings(await readFile(yamlPath, "utf8"))
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

    const frontmatterEnd = skillSource.indexOf("\n---\n", 4)
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
export function cleanLinkTarget(raw: string): string {
  const withoutAngles = raw.trim().replace(/^<|>$/g, "")
  const beforeTitle = withoutAngles.split(/\s+["']/)[0] ?? withoutAngles
  return beforeTitle.split("#")[0] ?? beforeTitle
}

// 执行 validateMarkdownLinks 函数的处理逻辑。
export async function validateMarkdownLinks(
  root: string,
  markdownFiles: string[],
  errors: string[]
): Promise<number> {
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  const perFile = await Promise.all(
    markdownFiles.map(async (relativePath) => {
      const contents = await readFile(path.join(root, relativePath), "utf8")
      const fileErrors: string[] = []
      let checked = 0
      for (const match of contents.matchAll(linkPattern)) {
        const target = cleanLinkTarget(match[1] ?? "")
        if (target === "" || /^(?:https?:|mailto:|data:)/i.test(target)) continue
        checked += 1
        let decoded: string
        try {
          decoded = decodeURIComponent(target)
        } catch {
          fileErrors.push(`${relativePath} contains malformed link: ${target}`)
          continue
        }
        const resolved = path.isAbsolute(decoded)
          ? decoded
          : path.resolve(root, path.dirname(relativePath), decoded)
        if (!(await pathExists(resolved))) {
          fileErrors.push(`${relativePath} has broken local link: ${target}`)
        }
      }
      return { checked, fileErrors }
    })
  )
  let checked = 0
  for (const result of perFile) {
    checked += result.checked
    errors.push(...result.fileErrors)
  }
  return checked
}

// 执行 validateContent 函数的处理逻辑。
export async function validateContent(
  root: string,
  markdownFiles: string[],
  errors: string[]
): Promise<void> {
  const placeholderPatterns = [
    /\[(?:TODO|REPLACE[-_ ]?ME)\]/i,
    /<(?:replace[-_ ]?me|project[-_ ]?name|your[-_ ]?value)>/i,
    /\{\{(?:TODO|REPLACE[-_ ]?ME)[^}]*\}\}/i
  ]
  const perFileMessages = await Promise.all(
    markdownFiles.map(async (relativePath) => {
      const contents = await readFile(path.join(root, relativePath), "utf8")
      return placeholderPatterns.some((pattern) => pattern.test(contents))
        ? `${relativePath} contains unfinished placeholder text`
        : undefined
    })
  )
  for (const message of perFileMessages) {
    if (message !== undefined) errors.push(message)
  }
}
