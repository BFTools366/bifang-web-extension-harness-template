import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { TextDecoder } from "node:util"

/** 枚举行数门禁支持的文件职责配置。 */
export type LineLimitProfileName = "frontend" | "maintained_text"

/** 描述单个行数门禁配置。 */
export interface LineLimitProfile {
  /** 保存稳定配置名。 */
  name: LineLimitProfileName
  /** 保存建议职责复核的阈值。 */
  reviewThreshold: number
  /** 保存必须拆分的硬上限。 */
  hardLimit: number
}

/** 描述单个行数检查发现。 */
export interface LineLimitFinding {
  /** 保存仓库相对路径。 */
  path: string
  /** 保存物理行数。 */
  lines: number
  /** 保存命中的职责配置。 */
  profile: LineLimitProfileName
  /** 保存建议复核阈值。 */
  threshold: number
  /** 保存强制拆分上限。 */
  limit: number
}

/** 描述完整仓库行数检查报告。 */
export interface LineLimitReport {
  /** 表示是否不存在读取错误与硬超限。 */
  ok: boolean
  /** 保存规范化检查根。 */
  root: string
  /** 保存成功检查的文本文件数量。 */
  checkedTextFiles: number
  /** 保存跳过的生成锁文件。 */
  excludedGeneratedFiles: string[]
  /** 保存跳过的二进制文件数量。 */
  skippedBinaryFiles: number
  /** 保存跳过的缺失或符号链接数量。 */
  skippedUnsafeFiles: number
  /** 保存需要按需语义复核的软候选。 */
  reviewCandidates: LineLimitFinding[]
  /** 保存强制拆分项。 */
  violations: LineLimitFinding[]
  /** 保存无法安全检查的错误。 */
  errors: string[]
}

/** 锁定前端与其他人工维护文本的软硬阈值。 */
export const LINE_LIMIT_PROFILES: Record<LineLimitProfileName, LineLimitProfile> = {
  frontend: { name: "frontend", reviewThreshold: 500, hardLimit: 1000 },
  maintained_text: { name: "maintained_text", reviewThreshold: 500, hardLimit: 2000 }
}

/** 保存属于前端源码或配置的文件扩展名。 */
const FRONTEND_CODE_SUFFIXES = new Set([
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
/** 保存工具生成且禁止人工编辑的锁文件名。 */
const GENERATED_LOCKFILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"])

/** 计算文本物理行数且不把末尾换行视为额外空行。 */
export function countPhysicalLines(source: string): number {
  if (source.length === 0) return 0
  const normalized = source.replace(/\r\n?/gu, "\n")
  return normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0)
}

/** 按扩展名选择确定性的行数职责配置。 */
export function lineLimitProfile(relativePath: string): LineLimitProfile {
  return FRONTEND_CODE_SUFFIXES.has(path.extname(relativePath).toLowerCase())
    ? LINE_LIMIT_PROFILES.frontend
    : LINE_LIMIT_PROFILES.maintained_text
}

/** 检查已枚举的仓库路径并返回稳定报告。 */
export async function inspectRepositoryLineLimits(
  rootInput: string,
  files: readonly string[]
): Promise<LineLimitReport> {
  const root = path.resolve(rootInput)
  const report: LineLimitReport = {
    ok: false,
    root,
    checkedTextFiles: 0,
    excludedGeneratedFiles: [],
    skippedBinaryFiles: 0,
    skippedUnsafeFiles: 0,
    reviewCandidates: [],
    violations: [],
    errors: []
  }
  try {
    const status = await lstat(root)
    if (status.isSymbolicLink()) throw new Error("项目根不得是符号链接")
    if (!status.isDirectory()) throw new Error("项目根不是目录")
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
    return report
  }

  for (const relativePath of [...new Set(files)].sort()) {
    if (relativePath === "" || path.isAbsolute(relativePath)) {
      report.errors.push(`非法仓库相对路径: ${JSON.stringify(relativePath)}`)
      continue
    }
    const absolutePath = path.resolve(root, relativePath)
    if (path.relative(root, absolutePath).startsWith("..")) {
      report.errors.push(`仓库路径越过项目根: ${relativePath}`)
      continue
    }
    let status
    try {
      status = await lstat(absolutePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        report.skippedUnsafeFiles += 1
        continue
      }
      report.errors.push(
        `${relativePath}: ${error instanceof Error ? error.message : String(error)}`
      )
      continue
    }
    if (status.isSymbolicLink() || !status.isFile()) {
      report.skippedUnsafeFiles += 1
      continue
    }
    if (GENERATED_LOCKFILE_NAMES.has(path.basename(relativePath))) {
      report.excludedGeneratedFiles.push(relativePath)
      continue
    }
    try {
      const bytes = await readFile(absolutePath)
      if (bytes.includes(0)) {
        report.skippedBinaryFiles += 1
        continue
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      report.checkedTextFiles += 1
      const lines = countPhysicalLines(source)
      const profile = lineLimitProfile(relativePath)
      const finding: LineLimitFinding = {
        path: relativePath,
        lines,
        profile: profile.name,
        threshold: profile.reviewThreshold,
        limit: profile.hardLimit
      }
      if (lines > profile.hardLimit) report.violations.push(finding)
      else if (lines > profile.reviewThreshold) report.reviewCandidates.push(finding)
    } catch (error) {
      report.errors.push(
        `${relativePath}: 无法按 UTF-8 文本检查: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  report.excludedGeneratedFiles.sort()
  report.reviewCandidates.sort((left, right) => left.path.localeCompare(right.path))
  report.violations.sort((left, right) => left.path.localeCompare(right.path))
  report.errors.sort()
  report.ok = report.errors.length === 0 && report.violations.length === 0
  return report
}

/** 把仓库行数检查中的运行错误与硬超限追加到 Harness 错误集合。 */
export async function validateRepositoryLineLimits(
  root: string,
  files: readonly string[],
  errors: string[]
): Promise<void> {
  const report = await inspectRepositoryLineLimits(root, files)
  errors.push(...report.errors.map((error) => `file line-limit checker error: ${error}`))
  errors.push(
    ...report.violations.map(
      (finding) =>
        `${finding.profile} file exceeds its hard ${finding.limit}-line limit: ${finding.path} (${finding.lines} lines)`
    )
  )
}
