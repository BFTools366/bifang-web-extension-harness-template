import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { lstatIfPresent, pathExists } from "./files.ts"

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

/** 校验终端按事件创建的项目记忆；全部缺席是合法初始化状态。 */
export async function validateOptionalProjectMemory(root: string, errors: string[]): Promise<void> {
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
      if (
        !entry.isFile() ||
        !contract.pattern.test(entry.name) ||
        !hasValidMemoryDate(entry.name)
      ) {
        errors.push(`Invalid optional ${contract.label} entry: ${relativeDirectory}/${entry.name}`)
        continue
      }
      datedFiles.push(entry.name)
    }
    if (indexEntry === undefined) continue
    // 保存 index 变量供确认每份正文可从索引发现使用。
    const index = await readFile(path.join(directory, "README.md"), "utf8")
    // 保存 filename 变量供逐个验证索引链接使用。
    for (const filename of datedFiles) {
      if (!index.includes(filename)) {
        errors.push(`Optional ${contract.label} file is missing from index: ${filename}`)
      }
    }
  }
}
