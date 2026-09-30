import { readFile } from "node:fs/promises"
import path from "node:path"
import { lstatIfPresent } from "./files.ts"

/** 保存独立于 canonical web-* 维护集合的项目级设计支持 Skill 名称。 */
export const DESIGN_SKILL_NAME = "design-taste-frontend"
/** 保存唯一项目级安装位置，全局 Skill 不参与存在性判断。 */
export const DESIGN_SKILL_PATH = `.agents/skills/${DESIGN_SKILL_NAME}`

/** 解析 Skill 身份所需的 YAML 字符串，支持普通标量、配对引号与折叠/文字块。 */
function skillString(value: string, continuation: string[]): string | undefined {
  const scalar = value.trim()
  if (/^[>|][+-]?(?:\s+#.*)?$/u.test(scalar)) {
    return (
      continuation
        .map((line) => line.trim())
        .join(" ")
        .trim() || undefined
    )
  }
  if (continuation.some((line) => line.trim() !== "" && !/^\s*#/u.test(line))) {
    return undefined
  }
  if (scalar.startsWith('"')) {
    const quoted = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/u.exec(scalar)?.[1]
    if (quoted === undefined) return undefined
    try {
      const decoded: unknown = JSON.parse(quoted)
      return typeof decoded === "string" && decoded.trim() !== "" ? decoded : undefined
    } catch {
      return undefined
    }
  }
  if (scalar.startsWith("'")) {
    const quoted = /^'((?:[^']|'')*)'(?:\s+#.*)?$/u.exec(scalar)?.[1]
    return quoted?.trim() ? quoted.replaceAll("''", "'") : undefined
  }
  const unquoted = scalar.replace(/\s+#.*$/u, "").trim()
  if (
    unquoted === "" ||
    "[]{}&*!|>%@`".includes(unquoted.charAt(0)) ||
    /^(?:null|true|false|~|[-+]?\d+(?:\.\d+)?)$/iu.test(unquoted) ||
    /:\s/u.test(unquoted)
  )
    return undefined
  return unquoted
}

/** 收集顶层身份字段并拒绝重复字段，不把复杂 YAML 当作未经校验的字符串。 */
function skillIdentity(frontmatter: string): Map<string, string> | undefined {
  const fields = new Map<string, { value: string; continuation: string[] }>()
  let current: { value: string; continuation: string[] } | undefined
  for (const line of frontmatter.split("\n")) {
    if (line.trim() === "" || /^\s*#/u.test(line)) continue
    if (/^[ \t]/u.test(line)) {
      if (current === undefined) return undefined
      current.continuation.push(line)
      continue
    }
    const field = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/u.exec(line)
    const key = field?.[1]
    if (key === undefined || fields.has(key)) return undefined
    current = { value: field?.[2] ?? "", continuation: [] }
    fields.set(key, current)
  }
  const identity = new Map<string, string>()
  for (const key of ["name", "description"]) {
    const field = fields.get(key)
    if (field === undefined) return undefined
    const value = skillString(field.value, field.continuation)
    if (value === undefined) return undefined
    identity.set(key, value)
  }
  return identity
}

/** 检查项目级目录和 Skill 身份，保留有效已有版本而拒绝占位或路径链接。 */
export async function inspectDesignSkill(root: string): Promise<"missing" | "present"> {
  for (const relativePath of [".agents", ".agents/skills", DESIGN_SKILL_PATH]) {
    const status = await lstatIfPresent(path.join(root, relativePath))
    if (status === undefined) return "missing"
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error(`Design Skill path must be a regular directory: ${relativePath}`)
    }
  }
  const skillFile = path.join(root, DESIGN_SKILL_PATH, "SKILL.md")
  const status = await lstatIfPresent(skillFile)
  if (status === undefined || !status.isFile() || status.isSymbolicLink()) {
    throw new Error(`Existing ${DESIGN_SKILL_PATH} must contain a regular SKILL.md`)
  }
  const source = (await readFile(skillFile, "utf8")).replaceAll("\r\n", "\n")
  const frontmatter = /^---\n([\s\S]*?)\n---\n/u.exec(source)
  const identity = frontmatter === null ? undefined : skillIdentity(frontmatter[1] ?? "")
  if (
    frontmatter === null ||
    identity?.get("name") !== DESIGN_SKILL_NAME ||
    source.slice(frontmatter[0].length).trim() === ""
  ) {
    throw new Error(`Invalid project design Skill identity: ${DESIGN_SKILL_PATH}/SKILL.md`)
  }
  return "present"
}

/** 为终端门禁报告缺失或损坏，允许用户自行维护有效设计支持版本。 */
export async function validateDesignSkill(root: string, errors: string[]): Promise<void> {
  try {
    if ((await inspectDesignSkill(root)) === "missing") {
      errors.push(`Missing project design Skill: ${DESIGN_SKILL_PATH}/SKILL.md`)
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
}
