import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadProjectConfig } from "./config.ts"
import { validateEnvironmentFiles } from "./environment.ts"
import { pathExists, walkFiles } from "./files.ts"

// 保存 TEXT_EXTENSIONS 变量供当前逻辑使用。
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt", ".xml"])
// 保存 RELEASE_SENTINELS 变量供当前逻辑使用。
const RELEASE_SENTINELS = [
  "debug_sentinel",
  "info_sentinel",
  "application_started",
  "surface_started",
  "do-not-ship"
] as const
// 保存 RELEASE_LOW_LEVEL_LOG_CALLS 变量供当前逻辑使用。
const RELEASE_LOW_LEVEL_LOG_CALLS = ["console.debug", "console.info"] as const
// 保存 HTTP_URL_PATTERN 变量供当前逻辑使用。
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g
// 保存 BUILD_VERSION_PATTERN 变量供候选版本注入校验使用。
const BUILD_VERSION_PATTERN = /^\d{12}$/
// 保存 RELEASE_POLICY_PATH 变量供下游选择可移植静态文件权限门禁使用。
const RELEASE_POLICY_PATH = ".harness/release-policy.json"

// 定义 ReleaseInspection 接口的结构契约。
export interface ReleaseInspection {
  // 描述 artifactRoot 接口成员的结构契约。
  artifactRoot: string
  // 描述 files 接口成员的结构契约。
  files: number
  // 描述 buildVersion 接口成员的已验证构建版本。
  buildVersion?: string
}

// 定义 ReleaseInspectionOptions 接口承载候选版本期望。
export interface ReleaseInspectionOptions {
  // 描述 expectedBuildVersion 接口成员的当次构建版本。
  expectedBuildVersion?: string
}

/** 判断未知 JSON 值是否是普通记录对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** 读取可选、受保护且失败关闭的下游 Release 权限策略。 */
async function requireOtherReadableWebFiles(root: string): Promise<boolean> {
  const policyPath = path.join(root, RELEASE_POLICY_PATH)
  let status
  try {
    status = await lstat(policyPath)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`Release policy must be a regular file: ${RELEASE_POLICY_PATH}`)
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(policyPath, "utf8")) as unknown
  } catch {
    throw new Error(`Release policy must be valid JSON: ${RELEASE_POLICY_PATH}`)
  }
  if (
    !isRecord(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(["requireOtherReadableWebFiles", "schemaVersion"]) ||
    value.schemaVersion !== 1 ||
    typeof value.requireOtherReadableWebFiles !== "boolean"
  ) {
    throw new Error(`Release policy schema is invalid: ${RELEASE_POLICY_PATH}`)
  }
  return value.requireOtherReadableWebFiles
}

// 执行 normalizeHttpUrl 函数的处理逻辑。
function normalizeHttpUrl(value: string): string | undefined {
  try {
    // 保存 url 变量供当前逻辑使用。
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}

// 执行 collectHttpUrls 函数的处理逻辑。
function collectHttpUrls(contents: string): Set<string> {
  // 保存 urls 变量供当前逻辑使用。
  const urls = new Set<string>()
  // 保存 match 变量供当前逻辑使用。
  for (const match of contents.matchAll(HTTP_URL_PATTERN)) {
    // 保存 normalized 变量供当前逻辑使用。
    const normalized = normalizeHttpUrl(match[0])
    if (normalized !== undefined) urls.add(normalized)
  }
  return urls
}

// 执行 inspectReleaseArtifact 函数的处理逻辑。
export async function inspectReleaseArtifact(
  rootInput: string,
  options: ReleaseInspectionOptions = {}
): Promise<ReleaseInspection> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 project 变量供当前逻辑使用。
  const project = await loadProjectConfig(root)
  // 保存 enforceOtherReadableWebFiles 变量供应用下游明确选择的权限门禁使用。
  const enforceOtherReadableWebFiles = await requireOtherReadableWebFiles(root)
  // 保存 environments 变量供当前逻辑使用。
  const environments = await validateEnvironmentFiles(root, "release")
  // 保存 relativeArtifactRoot 变量供当前逻辑使用。
  const relativeArtifactRoot = project.projectType === "web" ? "dist" : "build/chrome-mv3-prod"
  // 保存 artifactRoot 变量供当前逻辑使用。
  const artifactRoot = path.join(root, relativeArtifactRoot)
  if (!(await pathExists(artifactRoot))) {
    throw new Error(`Missing release artifact: ${relativeArtifactRoot}`)
  }

  // 保存 files 变量供当前逻辑使用。
  const files = await walkFiles(artifactRoot)
  if (files.length === 0) throw new Error(`Release artifact is empty: ${relativeArtifactRoot}`)
  // 保存 expectedBuildVersion 变量供候选内容校验使用。
  const expectedBuildVersion = options.expectedBuildVersion
  if (expectedBuildVersion !== undefined && !BUILD_VERSION_PATTERN.test(expectedBuildVersion)) {
    throw new Error("Expected build version must use YYYYMMDDHHMM")
  }
  // 保存 releaseBaseUrl 变量供当前逻辑使用。
  const releaseBaseUrl = environments.release.apiBaseUrl
  // 保存 nonReleaseBaseUrls 变量供当前逻辑使用。
  const nonReleaseBaseUrls = new Set(
    [environments.development.apiBaseUrl, environments.test.apiBaseUrl].filter(
      // 执行 当前声明 函数的处理逻辑。
      (value) => value !== releaseBaseUrl
    )
  )

  // 保存 perFileErrors 变量供当前逻辑使用。
  const perFileReports = await Promise.all(
    files.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (absolute) => {
        // 保存 relative 变量供当前逻辑使用。
        const relative = path.relative(root, absolute)
        // 保存 basename 变量供当前逻辑使用。
        const basename = path.basename(absolute)
        // 保存 fileErrors 变量供当前逻辑使用。
        const fileErrors: string[] = []
        if (
          enforceOtherReadableWebFiles &&
          project.projectType === "web" &&
          process.platform !== "win32"
        ) {
          // 保存 status 变量供要求可移植 POSIX Web 静态产物允许 other 读取使用。
          const status = await lstat(absolute)
          if ((status.mode & 0o004) === 0) {
            fileErrors.push(`${relative} must be other-readable in a Web release artifact`)
          }
        }
        if (basename.startsWith(".env") || absolute.endsWith(".map")) {
          fileErrors.push(`${relative} must not be present in a release artifact`)
          return { containsBuildVersion: false, errors: fileErrors }
        }
        if (!TEXT_EXTENSIONS.has(path.extname(absolute))) {
          return { containsBuildVersion: false, errors: fileErrors }
        }
        // 保存 contents 变量供当前逻辑使用。
        const contents = await readFile(absolute, "utf8")
        // 保存 artifactUrls 变量供当前逻辑使用。
        const artifactUrls = collectHttpUrls(contents)
        // 保存 baseUrl 变量供当前逻辑使用。
        for (const baseUrl of nonReleaseBaseUrls) {
          if (artifactUrls.has(baseUrl)) {
            fileErrors.push(`${relative} contains a non-release API BaseURL`)
          }
        }
        // 保存 sentinel 变量供当前逻辑使用。
        for (const sentinel of RELEASE_SENTINELS) {
          if (contents.includes(sentinel)) fileErrors.push(`${relative} contains ${sentinel}`)
        }
        // 保存 logCall 变量供当前逻辑使用。
        for (const logCall of RELEASE_LOW_LEVEL_LOG_CALLS) {
          if (contents.includes(logCall)) fileErrors.push(`${relative} contains ${logCall}`)
        }
        // 保存 withoutUrls 变量供当前逻辑使用。
        const withoutUrls = contents.replace(HTTP_URL_PATTERN, "[URL]")
        if (/\/(?:Users|home)\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+/.test(withoutUrls)) {
          fileErrors.push(`${relative} contains a local absolute path`)
        }
        if (/sourceMappingURL\s*=/.test(contents)) {
          fileErrors.push(`${relative} references a source map`)
        }
        return {
          containsBuildVersion:
            expectedBuildVersion !== undefined && contents.includes(expectedBuildVersion),
          errors: fileErrors
        }
      }
    )
  )
  // 保存 errors 变量供当前逻辑使用。
  const errors = perFileReports.flatMap(
    /* 执行当前文件报告到错误列表的映射。 */ (report) => report.errors
  )
  if (
    expectedBuildVersion !== undefined &&
    !perFileReports.some(
      /* 执行当前文件报告的版本命中判断。 */ (report) => report.containsBuildVersion
    )
  ) {
    errors.push(`Release artifact does not contain build version ${expectedBuildVersion}`)
  }

  if (errors.length > 0) {
    throw new Error(`Release artifact inspection failed:\n- ${errors.join("\n- ")}`)
  }
  return {
    artifactRoot: relativeArtifactRoot,
    buildVersion: expectedBuildVersion,
    files: files.length
  }
}

// 保存 executedPath 变量供当前逻辑使用。
const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  // 保存 [command, ...rest] 变量供当前逻辑使用。
  const [command, ...rest] = process.argv.slice(2)
  if (command !== "inspect" || rest.length > 0) {
    console.error("Usage: pnpm release:inspect")
    process.exitCode = 1
  } else {
    inspectReleaseArtifact(process.cwd(), {
      expectedBuildVersion: process.env.HARNESS_BUILD_VERSION
    })
      .then(
        /* 执行 当前声明 函数的处理逻辑。 */ (report) => {
          console.log(
            `Release artifact inspection passed (${report.artifactRoot}, ${report.files} files)`
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
}
