import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { pathExists, readJson, walkFiles } from "../.harness/tooling/files.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "../.harness/tooling/version.ts"

const EXPECTED_SKILLS = [
  "check-development-environment",
  "define-product",
  "extract-i18n-strings",
  "implement-change",
  "initialize-web-project",
  "instantiate-project",
  "plan-change",
  "prepare-brand-identity",
  "prepare-release",
  "refactor-code",
  "run-parallel-worktrees",
  "test-final-artifact-e2e",
  "upgrade-harness",
  "verify-delivery"
] as const

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
  "docs/RELEASE.md",
  "docs/RUNTIME_CONFIGURATION.md",
  "docs/TECH_DEBT.md",
  "docs/TS_WEB_TEMPLATE.md",
  ".harness/tooling/cli.ts",
  ".harness/tooling/init.ts",
  ".harness/tooling/instantiate.ts",
  ".harness/tooling/brand.ts",
  ".harness/tooling/environment.ts",
  ".harness/tooling/release.ts",
  ".harness/tooling/templates/environment.ts",
  ".harness/tooling/templates/http.ts",
  ".harness/tooling/templates/logging.ts",
  ".harness/tooling/templates/pagination.ts",
  ".harness/tooling/version.ts",
  "scripts/instantiate.ts"
] as const

const GOVERNED_MARKDOWN_ROOTS = [
  "AGENTS.md",
  "README.md",
  "Version.md",
  "LICENSE.en.md",
  "LICENSE.zh-CN.md",
  "docs",
  ".agents/skills"
] as const

export interface HarnessValidationReport {
  files: number
  skills: string[]
  markdownLinks: number
}

async function collectFiles(root: string): Promise<string[]> {
  const absolutePaths = await walkFiles(root, {
    exclude: (name) => name === ".git" || name === "node_modules"
  })
  return absolutePaths.map((absolute) => path.relative(root, absolute))
}

function governedMarkdownFiles(files: string[]): string[] {
  return files.filter((file) => {
    if (!file.endsWith(".md")) return false
    return GOVERNED_MARKDOWN_ROOTS.some(
      (entry) => file === entry || (entry.endsWith(".md") ? false : file.startsWith(`${entry}/`))
    )
  })
}

function parseFrontmatter(contents: string): Record<string, string> | undefined {
  if (!contents.startsWith("---\n")) return undefined
  const end = contents.indexOf("\n---\n", 4)
  if (end < 0) return undefined
  const result: Record<string, string> = {}
  for (const line of contents.slice(4, end).split("\n")) {
    const separator = line.indexOf(":")
    if (separator > 0) result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return result
}

async function validateSkills(root: string, errors: string[]): Promise<string[]> {
  const skillsRoot = path.join(root, ".agents/skills")
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const actual = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const expected = [...EXPECTED_SKILLS].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`Skill directories must exactly match: ${expected.join(", ")}`)
  }

  const perSkillErrors = await Promise.all(actual.map((skill) => validateSkill(skillsRoot, skill)))
  for (const skillErrors of perSkillErrors) errors.push(...skillErrors)
  return actual
}

async function validateSkill(skillsRoot: string, skill: string): Promise<string[]> {
  const skillErrors: string[] = []
  const skillPath = path.join(skillsRoot, skill, "SKILL.md")
  const yamlPath = path.join(skillsRoot, skill, "agents/openai.yaml")
  if (!(await pathExists(skillPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/SKILL.md`)
    return skillErrors
  }
  const frontmatter = parseFrontmatter(await readFile(skillPath, "utf8"))
  if (frontmatter === undefined) skillErrors.push(`${skill}/SKILL.md has invalid frontmatter`)
  else {
    if (frontmatter.name !== skill)
      skillErrors.push(`${skill}/SKILL.md frontmatter name is incorrect`)
    if (frontmatter.description === undefined || frontmatter.description.length < 20) {
      skillErrors.push(`${skill}/SKILL.md needs a meaningful description`)
    }
  }
  if (!(await pathExists(yamlPath))) {
    skillErrors.push(`Missing .agents/skills/${skill}/agents/openai.yaml`)
  } else {
    const yaml = await readFile(yamlPath, "utf8")
    for (const key of ["interface:", "display_name:", "short_description:", "default_prompt:"]) {
      if (!yaml.includes(key)) skillErrors.push(`${skill}/agents/openai.yaml is missing ${key}`)
    }
  }
  return skillErrors
}

function cleanLinkTarget(raw: string): string {
  const withoutAngles = raw.trim().replace(/^<|>$/g, "")
  const beforeTitle = withoutAngles.split(/\s+["']/)[0] ?? withoutAngles
  return beforeTitle.split("#")[0] ?? beforeTitle
}

async function validateMarkdownLinks(
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

async function validateContent(
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
  ".env.production.local",
  "Cargo.toml",
  "src-tauri"
] as const

async function validateToolingContract(root: string, errors: string[]): Promise<void> {
  const requiredExists = await Promise.all(
    REQUIRED_FILES.map((required) => pathExists(path.join(root, required)))
  )
  REQUIRED_FILES.forEach((required, index) => {
    if (!requiredExists[index]) errors.push(`Missing required file: ${required}`)
  })
  const forbiddenExists = await Promise.all(
    FORBIDDEN_TEMPLATE_PATHS.map((forbidden) => pathExists(path.join(root, forbidden)))
  )
  FORBIDDEN_TEMPLATE_PATHS.forEach((forbidden, index) => {
    if (forbiddenExists[index]) errors.push(`Clean template must not contain ${forbidden}`)
  })

  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if ("workspaces" in manifest) errors.push("Template package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  const scripts = manifest.scripts as Record<string, unknown> | undefined
  for (const script of ["harness", "harness:init", "instantiate", "validate:harness"]) {
    if (typeof scripts?.[script] !== "string")
      errors.push(`package.json is missing script ${script}`)
  }
  const devDependencies = manifest.devDependencies as Record<string, unknown> | undefined
  for (const [dependency, version] of [
    ["typescript", "6.0.3"],
    ["vitest", "4.1.10"],
    ["eslint", "10.8.1"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies?.[dependency], version)) {
      errors.push(`${dependency} minimum must not be lower than ${version}`)
    }
  }
  const cli = await readFile(path.join(root, ".harness/tooling/cli.ts"), "utf8")
  for (const contract of ["brand", "refresh", "validate", "--type"]) {
    if (!cli.includes(contract)) errors.push(`Harness CLI is missing ${contract} contract`)
  }
}

export async function validateHarness(rootInput: string): Promise<HarnessValidationReport> {
  const root = path.resolve(rootInput)
  const errors: string[] = []
  const files = await collectFiles(root)
  const markdownFiles = governedMarkdownFiles(files)
  const skills = await validateSkills(root, errors)
  await validateContent(root, markdownFiles, errors)
  const markdownLinks = await validateMarkdownLinks(root, markdownFiles, errors)
  await validateToolingContract(root, errors)
  if (errors.length > 0) throw new Error(`Harness validation failed:\n- ${errors.join("\n- ")}`)
  return { files: files.length, skills, markdownLinks }
}

const executed =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  validateHarness(process.cwd())
    .then((report) => {
      console.log(
        `Harness validation passed (${report.skills.length} skills, ${report.markdownLinks} local links)`
      )
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
