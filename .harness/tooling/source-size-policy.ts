import { readFile } from "node:fs/promises"
import path from "node:path"
import { walkFiles, isMainModule } from "./files.ts"

/** 保存需要复核职责的建议行数上限。 */
export const SOURCE_SIZE_REVIEW_LIMIT = 500
/** 保存必须拆分的强制行数上限。 */
export const SOURCE_SIZE_HARD_LIMIT = 600

/** 描述单个源码文件的体积检查结果。 */
export interface SourceSizeFinding {
  /** 保存源码文件相对于项目根的路径。 */
  file: string
  /** 保存源码文件的物理行数。 */
  lines: number
  /** 区分建议复核与强制失败。 */
  severity: "review" | "error"
}

/** 保存只允许跳过的精确生成文件。 */
const EXACT_EXCLUDED_FILES = new Set(["src/routeTree.gen.ts"])
/** 保存不参与人工源码体积门禁的生成或外部目录。 */
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".plasmo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules"
])

/** 将跨平台路径统一为稳定的 POSIX 相对路径。 */
function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/")
}

/** 判断文件是否属于明确排除的生成物或外部内容。 */
export function isSourceSizePolicyExcluded(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath)
  if (EXACT_EXCLUDED_FILES.has(normalized)) return true
  return normalized
    .split("/")
    .some(/* 执行 当前声明 函数的处理逻辑。 */ (segment) => EXCLUDED_DIRECTORIES.has(segment))
}

/** 计算源码文本的物理行数，不把末尾换行计为额外空行。 */
export function countSourceLines(source: string): number {
  if (source.length === 0) return 0
  const normalized = source.replace(/\r\n?/gu, "\n")
  return normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0)
}

/** 根据行数返回建议复核或强制失败结果。 */
export function inspectSourceSize(file: string, source: string): SourceSizeFinding | undefined {
  const lines = countSourceLines(source)
  if (lines > SOURCE_SIZE_HARD_LIMIT) return { file, lines, severity: "error" }
  if (lines > SOURCE_SIZE_REVIEW_LIMIT) return { file, lines, severity: "review" }
  return undefined
}

/** 保存受同一体积门禁管理的前端和 Node 工具代码扩展名。 */
const SOURCE_CODE_SUFFIXES = new Set([
  ".astro",
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".jsx",
  ".less",
  ".mjs",
  ".mts",
  ".sass",
  ".scss",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue"
])

/** 扫描项目内全部人工维护的前端和 Node 工具代码。 */
export async function inspectProjectSourceSizes(rootInput: string): Promise<SourceSizeFinding[]> {
  const root = path.resolve(rootInput)
  const files = await walkFiles(root, {
    exclude: (name) => EXCLUDED_DIRECTORIES.has(name),
    filter: (name) => SOURCE_CODE_SUFFIXES.has(path.extname(name).toLowerCase())
  })
  const findings = await Promise.all(
    files.map(async (absolutePath) => {
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
      if (isSourceSizePolicyExcluded(relativePath)) return undefined
      const source = await readFile(absolutePath, "utf8")
      return inspectSourceSize(relativePath, source)
    })
  )
  return findings
    .filter((finding): finding is SourceSizeFinding => finding !== undefined)
    .sort(/* 执行 当前声明 函数的处理逻辑。 */ (left, right) => left.file.localeCompare(right.file))
}

/** 执行源码体积门禁并输出建议项。 */
async function assertProjectSourceSizes(rootInput: string): Promise<void> {
  const findings = await inspectProjectSourceSizes(rootInput)
  const reviews = findings.filter((finding) => finding.severity === "review")
  const errors = findings.filter((finding) => finding.severity === "error")
  if (reviews.length > 0) {
    console.warn(
      `建议复核文件规模：\n${reviews
        .map((finding) => `- ${finding.file}: ${finding.lines} 行；请复核业务内聚性与单一职责`)
        .join("\n")}`
    )
  }
  if (errors.length > 0) {
    throw new Error(
      `文件规模检查失败：\n${errors
        .map(
          (finding) => `- ${finding.file}: ${finding.lines} 行；请在同一模块目录内按业务职责拆分`
        )
        .join("\n")}`
    )
  }
}

/** 执行源码体积检查命令行入口。 */
async function runCli(): Promise<void> {
  const command = process.argv[2]
  if (command !== "check" || process.argv.length > 3) {
    throw new Error("用法：tsx .harness/tooling/source-size-policy.ts check")
  }
  await assertProjectSourceSizes(process.cwd())
  console.log("文件规模检查通过")
}

if (isMainModule(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
