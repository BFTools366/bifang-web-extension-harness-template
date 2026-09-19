import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { lstatIfPresent, pathExists } from "./files.ts"

/** 保存终端项目可选的项目记忆兼容清单路径。 */
const PROJECT_MEMORY_COMPATIBILITY_PATH = ".harness/project-memory-compatibility.json"

/** 描述终端项目按独立事件创建的一类可选项目记忆。 */
interface OptionalProjectMemoryContract {
  /** 保存 docs 下的目录名。 */
  directory: string
  /** 匹配合法的按日正文文件名。 */
  pattern: RegExp
  /** 保存错误消息使用的记忆名称。 */
  label: string
  /** 保存当前允许的只追加历史卷。 */
  historyFiles?: readonly string[]
}

/** 锁定终端后续可创建的五类记忆命名，不要求初始化时预建。 */
const OPTIONAL_PROJECT_MEMORY_CONTRACTS: readonly OptionalProjectMemoryContract[] = [
  { directory: "product_spec", pattern: /^\d{8}_product_spec\.md$/u, label: "Product Spec" },
  { directory: "project_status", pattern: /^\d{8}_product_status\.md$/u, label: "Product Status" },
  { directory: "work_plan", pattern: /^\d{8}_work_plan\.md$/u, label: "Work Plan" },
  {
    directory: "adr",
    pattern: /^\d{8}_ADR\.md$/u,
    label: "ADR",
    historyFiles: ["ADR_history.md"]
  },
  {
    directory: "changelog",
    pattern: /^\d{8}_CHANGELOG\.md$/u,
    label: "Changelog",
    historyFiles: ["CHANGELOG_history.md"]
  }
]

/** 保存所有已保留的只追加历史卷文件名。 */
const PROJECT_MEMORY_HISTORY_FILES = new Set(
  OPTIONAL_PROJECT_MEMORY_CONTRACTS.flatMap((contract) => contract.historyFiles ?? [])
)

/** 判断按日文件的八位前缀是否是有效公历日期。 */
function hasValidMemoryDate(filename: string): boolean {
  // 保存 match 变量供日期字段解析使用。
  const match = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})/u.exec(filename)
  if (match?.groups === undefined) return false
  // 保存 year、month 与 day 变量供 UTC 公历往返校验使用。
  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  // 保存 date 变量供拒绝溢出日期使用。
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  )
}

/** 判断未知 JSON 值是否是普通记录对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** 判断路径文本是否包含 ASCII 控制字符。 */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 0x1f || code === 0x7f)
  })
}

/** 从 Markdown 行内链接中提取当前目录下的精确文件目标。 */
function indexedMarkdownFiles(source: string): Set<string> {
  const targets = new Set<string>()
  const links = source.matchAll(/\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+"[^"\r\n]*")?\s*\)/gu)
  for (const link of links) {
    const rawTarget = link[1] ?? link[2]
    if (rawTarget === undefined || rawTarget.includes("#") || rawTarget.includes("?")) continue
    let decoded: string
    try {
      decoded = decodeURIComponent(rawTarget)
    } catch {
      continue
    }
    const relative = decoded.startsWith("./") ? decoded.slice(2) : decoded
    if (relative !== "" && !relative.includes("/") && relative.endsWith(".md")) {
      targets.add(relative)
    }
  }
  return targets
}

/** 解析严格的项目记忆兼容清单，并只返回全部校验通过的精确豁免路径。 */
async function loadGrandfatheredProjectMemoryPaths(
  root: string,
  errors: string[]
): Promise<Set<string>> {
  // 保存 harnessDirectoryStatus 变量供拒绝清单祖先符号链接使用。
  const harnessDirectoryStatus = await lstatIfPresent(path.join(root, ".harness"))
  if (harnessDirectoryStatus === undefined) return new Set()
  if (harnessDirectoryStatus.isSymbolicLink() || !harnessDirectoryStatus.isDirectory()) {
    errors.push("Unsafe project-memory compatibility directory: .harness")
    return new Set()
  }
  // 保存 manifestPath 与 manifestStatus 变量供清单存在性和文件类型校验使用。
  const manifestPath = path.join(root, PROJECT_MEMORY_COMPATIBILITY_PATH)
  const manifestStatus = await lstatIfPresent(manifestPath)
  if (manifestStatus === undefined) return new Set()
  if (manifestStatus.isSymbolicLink() || !manifestStatus.isFile()) {
    errors.push(
      `Unsafe project-memory compatibility manifest: ${PROJECT_MEMORY_COMPATIBILITY_PATH}`
    )
    return new Set()
  }

  // 保存 value 变量供清单 JSON 结构校验使用。
  let value: unknown
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown
  } catch {
    errors.push(`Invalid project-memory compatibility JSON: ${PROJECT_MEMORY_COMPATIBILITY_PATH}`)
    return new Set()
  }
  if (!isRecord(value)) {
    errors.push("Project-memory compatibility manifest must be an object")
    return new Set()
  }

  // 保存 keys 变量供拒绝缺失或未知字段使用。
  const keys = Object.keys(value).sort()
  if (JSON.stringify(keys) !== JSON.stringify(["grandfatheredPaths", "schemaVersion"])) {
    errors.push(
      "Project-memory compatibility manifest must contain only schemaVersion and grandfatheredPaths"
    )
    return new Set()
  }
  if (value.schemaVersion !== 1) {
    errors.push("Project-memory compatibility schemaVersion must be 1")
    return new Set()
  }
  if (!Array.isArray(value.grandfatheredPaths)) {
    errors.push("Project-memory compatibility grandfatheredPaths must be an array")
    return new Set()
  }

  // 保存 manifestErrorCount 变量供任一非法项使整个清单失败关闭使用。
  const manifestErrorCount = errors.length
  // 保存 seen 与 grandfatheredPaths 变量供唯一性校验和精确豁免使用。
  const seen = new Set<string>()
  const grandfatheredPaths = new Set<string>()
  // 保存 candidate 变量供逐个校验兼容路径使用。
  for (const candidate of value.grandfatheredPaths) {
    if (typeof candidate !== "string") {
      errors.push("Project-memory compatibility paths must be strings")
      continue
    }
    if (seen.has(candidate)) {
      errors.push(`Duplicate project-memory compatibility path: ${candidate}`)
      continue
    }
    seen.add(candidate)

    // 保存 segments 变量供限定 POSIX 仓库相对的单层 docs 路径使用。
    const segments = candidate.split("/")
    if (
      candidate.includes("\\") ||
      hasControlCharacter(candidate) ||
      path.posix.isAbsolute(candidate) ||
      path.posix.normalize(candidate) !== candidate ||
      segments.length !== 3 ||
      segments[0] !== "docs"
    ) {
      errors.push(`Invalid project-memory compatibility path: ${candidate}`)
      continue
    }
    // 保存 contract 与 filename 变量供类别和文件名契约校验使用。
    const contract = OPTIONAL_PROJECT_MEMORY_CONTRACTS.find(
      (entry) => entry.directory === segments[1]
    )
    const filename = segments[2]
    if (contract === undefined || filename === undefined || !filename.endsWith(".md")) {
      errors.push(`Invalid project-memory compatibility path: ${candidate}`)
      continue
    }
    if (
      filename === "README.md" ||
      PROJECT_MEMORY_HISTORY_FILES.has(filename) ||
      contract.pattern.test(filename)
    ) {
      errors.push(`Canonical project-memory path cannot be grandfathered: ${candidate}`)
      continue
    }

    // 保存 fileStatus 变量供要求目标为实际普通非符号链接文件使用。
    const fileStatus = await lstatIfPresent(path.join(root, ...segments))
    if (fileStatus === undefined || fileStatus.isSymbolicLink() || !fileStatus.isFile()) {
      errors.push(`Missing or unsafe grandfathered project-memory file: ${candidate}`)
      continue
    }
    // 保存 indexPath 与 indexStatus 变量供要求对应索引为实际普通文件使用。
    const indexPath = path.join(root, "docs", contract.directory, "README.md")
    const indexStatus = await lstatIfPresent(indexPath)
    if (indexStatus === undefined || indexStatus.isSymbolicLink() || !indexStatus.isFile()) {
      errors.push(`Grandfathered project-memory file has no safe index: ${candidate}`)
      continue
    }
    // 保存 index 变量供确认兼容正文仍能从对应索引发现使用。
    const index = indexedMarkdownFiles(await readFile(indexPath, "utf8"))
    if (!index.has(filename)) {
      errors.push(`Grandfathered project-memory file is missing from index: ${candidate}`)
      continue
    }
    grandfatheredPaths.add(candidate)
  }

  return errors.length === manifestErrorCount ? grandfatheredPaths : new Set()
}

/** 校验终端按事件创建的项目记忆；全部缺席是合法初始化状态。 */
export async function validateOptionalProjectMemory(root: string, errors: string[]): Promise<void> {
  // 保存 rootStatus 与 docsStatus 变量供拒绝项目根和 docs 祖先符号链接使用。
  const rootStatus = await lstatIfPresent(root)
  if (rootStatus === undefined || rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    errors.push("Unsafe project-memory root")
    return
  }
  const docsStatus = await lstatIfPresent(path.join(root, "docs"))
  if (docsStatus !== undefined && (docsStatus.isSymbolicLink() || !docsStatus.isDirectory())) {
    errors.push("Unsafe optional project-memory directory: docs")
    return
  }
  // 保存 grandfatheredPaths 变量供只对清单内精确路径绕过规范命名校验使用。
  const grandfatheredPaths = await loadGrandfatheredProjectMemoryPaths(root, errors)
  // 保存 legacyPath 变量供拒绝已废弃的单体增长日志使用。
  for (const legacyPath of [
    "CHANGELOG.md",
    "docs/DECISIONS.md",
    "docs/PRODUCT_SPEC.md",
    "docs/PROJECT_STATUS.md",
    "docs/WORK_PLAN.md"
  ]) {
    if (await pathExists(path.join(root, legacyPath))) {
      errors.push(`Legacy growing project-memory path is forbidden: ${legacyPath}`)
    }
  }
  // 保存 contract 变量供逐类可选记忆校验使用。
  for (const contract of OPTIONAL_PROJECT_MEMORY_CONTRACTS) {
    // 保存 relativeDirectory 与 directory 变量供路径校验和消息使用。
    const relativeDirectory = `docs/${contract.directory}`
    const directory = path.join(root, relativeDirectory)
    // 保存 directoryStatus 变量供区分缺席、目录与符号链接使用。
    const directoryStatus = await lstatIfPresent(directory)
    if (directoryStatus === undefined) continue
    if (directoryStatus.isSymbolicLink() || !directoryStatus.isDirectory()) {
      errors.push(`Unsafe optional ${contract.label} directory: ${relativeDirectory}`)
      continue
    }
    // 保存 entries 变量供索引、文件名与非文件条目检查使用。
    const entries = await readdir(directory, { withFileTypes: true })
    // 保存 indexEntry 变量供索引存在性校验使用。
    const indexEntry = entries.find(
      /** 判断 README.md 是否是当前记忆目录的普通文件索引。 */ (entry) =>
        entry.name === "README.md" && entry.isFile()
    )
    if (indexEntry === undefined) {
      errors.push(`Missing optional ${contract.label} index: ${relativeDirectory}/README.md`)
    }
    // 保存 datedFiles 变量供索引引用一致性校验使用。
    const datedFiles: string[] = []
    // 保存 entry 变量供逐项检查项目记忆目录内容使用。
    for (const entry of entries) {
      if (entry.name === "README.md") continue
      if (entry.isFile() && contract.historyFiles?.includes(entry.name) === true) continue
      // 保存 relativePath 变量供兼容清单只匹配精确仓库相对路径使用。
      const relativePath = `${relativeDirectory}/${entry.name}`
      if (
        !entry.isFile() ||
        (!grandfatheredPaths.has(relativePath) &&
          (!contract.pattern.test(entry.name) || !hasValidMemoryDate(entry.name)))
      ) {
        errors.push(`Invalid optional ${contract.label} entry: ${relativePath}`)
        continue
      }
      datedFiles.push(entry.name)
    }
    if (indexEntry === undefined) continue
    // 保存 index 变量供确认每份正文可从索引发现使用。
    const indexedFiles = indexedMarkdownFiles(
      await readFile(path.join(directory, "README.md"), "utf8")
    )
    // 保存 filename 变量供逐个验证索引链接使用。
    for (const filename of datedFiles) {
      if (!indexedFiles.has(filename)) {
        errors.push(`Optional ${contract.label} file is missing from index: ${filename}`)
      }
    }
  }
}
