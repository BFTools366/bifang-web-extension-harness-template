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
  // 保存 normalized 变量供当前逻辑使用。
  const normalized = normalizeRelativePath(relativePath)
  if (EXACT_EXCLUDED_FILES.has(normalized)) return true
  return normalized
    .split("/")
    .some(/* 执行 当前声明 函数的处理逻辑。 */ (segment) => EXCLUDED_DIRECTORIES.has(segment))
}

/** 计算源码文本的物理行数，不把末尾换行计为额外空行。 */
export function countSourceLines(source: string): number {
  if (source.length === 0) return 0
  // 保存 normalized 变量供当前逻辑使用。
  const normalized = source.replace(/\r\n?/gu, "\n")
  return normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0)
}

/** 根据行数返回建议复核或强制失败结果。 */
export function inspectSourceSize(file: string, source: string): SourceSizeFinding | undefined {
  // 保存 lines 变量供当前逻辑使用。
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
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 files 变量供当前逻辑使用。
  const files = await walkFiles(root, {
    // 执行 当前声明 函数的处理逻辑。
    exclude: (name) => EXCLUDED_DIRECTORIES.has(name),
    // 执行 当前声明 函数的处理逻辑。
    filter: (name) => SOURCE_CODE_SUFFIXES.has(path.extname(name).toLowerCase())
  })
  // 保存 findings 变量供当前逻辑使用。
  const findings = await Promise.all(
    files.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (absolutePath) => {
        // 保存 relativePath 变量供当前逻辑使用。
        const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
        if (isSourceSizePolicyExcluded(relativePath)) return undefined
        // 保存 source 变量供当前逻辑使用。
        const source = await readFile(absolutePath, "utf8")
        return inspectSourceSize(relativePath, source)
      }
    )
  )
  return findings
    .filter(
      /* 执行 当前声明 函数的处理逻辑。 */ (finding): finding is SourceSizeFinding =>
        finding !== undefined
    )
    .sort(/* 执行 当前声明 函数的处理逻辑。 */ (left, right) => left.file.localeCompare(right.file))
}

/** 执行源码体积门禁并输出建议项。 */
async function assertProjectSourceSizes(rootInput: string): Promise<void> {
  // 保存 findings 变量供当前逻辑使用。
  const findings = await inspectProjectSourceSizes(rootInput)
  // 保存 reviews 变量供当前逻辑使用。
  const reviews = findings.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (finding) => finding.severity === "review"
  )
  // 保存 errors 变量供当前逻辑使用。
  const errors = findings.filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (finding) => finding.severity === "error"
  )
  if (reviews.length > 0) {
    console.warn(
      `Source size review recommended:\n${reviews
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (finding) =>
            `- ${finding.file}: ${finding.lines} lines; review business cohesion and single responsibility`
        )
        .join("\n")}`
    )
  }
  if (errors.length > 0) {
    throw new Error(
      `Source size policy failed:\n${errors
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (finding) =>
            `- ${finding.file}: ${finding.lines} lines; split by business responsibility within the same module directory`
        )
        .join("\n")}`
    )
  }
}

/** 执行源码体积检查命令行入口。 */
async function runCli(): Promise<void> {
  // 保存 command 变量供当前逻辑使用。
  const command = process.argv[2]
  if (command !== "check" || process.argv.length > 3) {
    throw new Error("Usage: tsx .harness/tooling/source-size-policy.ts check")
  }
  await assertProjectSourceSizes(process.cwd())
  console.log("Source size policy passed")
}

if (isMainModule(import.meta.url)) {
  runCli().catch(
    /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  )
}
