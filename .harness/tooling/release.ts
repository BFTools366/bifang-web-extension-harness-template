import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { extensionIdentityManifest, validateIdentityLocales } from "./identity.ts"
import { loadProjectConfig } from "./config.ts"
import {
  EXTENSION_TARGETS,
  validateBuiltExtensionManifest,
  findExternalizedRuntimeDependencies,
  type ExtensionTarget
} from "./extension-targets.ts"
import { validateEnvironmentFiles } from "./environment.ts"
import { pathExists, walkFiles, isMainModule } from "./files.ts"
import { isValidExtensionVersion, WEB_BUILD_VERSION_PATTERN } from "./version.ts"

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt", ".xml"])
// 保存版本注入可命中的页面代码文件类型，排除 manifest 与任意元数据。
const VERSION_SURFACE_EXTENSIONS = new Set([".html", ".js", ".mjs"])
const RELEASE_SENTINELS = [
  "debug_sentinel",
  "info_sentinel",
  "application_started",
  "surface_started",
  "do-not-ship"
] as const
const RELEASE_LOW_LEVEL_LOG_CALLS = ["console.debug", "console.info"] as const
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'`<>]+/gi
const RELEASE_POLICY_PATH = ".harness/release-policy.json"

// 定义 ReleaseInspection 接口的结构契约。
export interface ReleaseInspection {
  // 描述 artifactRoot 接口成员的结构契约。
  artifactRoot: string
  // 描述双浏览器候选各自的检查结果；Web 保持单产物。
  artifacts?: ReleaseInspection[]
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
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}

// 执行 collectHttpUrls 函数的处理逻辑。
function collectHttpUrls(contents: string): Set<string> {
  const urls = new Set<string>()
  for (const match of contents.matchAll(HTTP_URL_PATTERN)) {
    const normalized = normalizeHttpUrl(match[0])
    if (normalized !== undefined) urls.add(normalized)
  }
  return urls
}

/** 默认检查完整双浏览器候选，任一目标缺失或失败就拒绝整个 Extension。 */
export async function inspectReleaseArtifact(
  rootInput: string,
  options: ReleaseInspectionOptions = {}
): Promise<ReleaseInspection> {
  const project = await loadProjectConfig(path.resolve(rootInput))
  if (project.projectType === "web") return inspectArtifact(rootInput, options)
  const artifacts: ReleaseInspection[] = []
  for (const target of EXTENSION_TARGETS) {
    artifacts.push(await inspectArtifact(rootInput, options, target))
  }
  return {
    artifactRoot: artifacts.map((artifact) => artifact.artifactRoot).join(", "),
    artifacts,
    buildVersion: artifacts[0]?.buildVersion,
    files: artifacts.reduce((count, artifact) => count + artifact.files, 0)
  }
}

/** 对单个目标目录执行精确版本、身份、协议和 Release 内容检查。 */
async function inspectArtifact(
  rootInput: string,
  options: ReleaseInspectionOptions,
  target?: ExtensionTarget
): Promise<ReleaseInspection> {
  const root = path.resolve(rootInput)
  const project = await loadProjectConfig(root)
  const enforceOtherReadableWebFiles = await requireOtherReadableWebFiles(root)
  const environments = await validateEnvironmentFiles(root, "release")
  const relativeArtifactRoot =
    project.projectType === "web" ? "dist" : `build/${target?.target}-prod`
  const artifactRoot = path.join(root, relativeArtifactRoot)
  if (!(await pathExists(artifactRoot))) {
    throw new Error(`Missing release artifact: ${relativeArtifactRoot}`)
  }

  const files = await walkFiles(artifactRoot)
  if (files.length === 0) throw new Error(`Release artifact is empty: ${relativeArtifactRoot}`)
  let expectedBuildVersion = options.expectedBuildVersion
  let runtimeDependencies: string[] = []
  if (project.projectType === "web") {
    if (
      expectedBuildVersion !== undefined &&
      !WEB_BUILD_VERSION_PATTERN.test(expectedBuildVersion)
    ) {
      throw new Error("Expected Web build version must use YYMMDDHHMMSS")
    }
  } else {
    // Extension 的软件版本以当前 package.json 为准，独立复查时也必须精确匹配。
    const packageManifest: unknown = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8")
    )
    if (isRecord(packageManifest) && isRecord(packageManifest.dependencies))
      runtimeDependencies = Object.keys(packageManifest.dependencies)
    const packageVersion =
      packageManifest !== null &&
      typeof packageManifest === "object" &&
      "version" in packageManifest
        ? packageManifest.version
        : undefined
    if (!isValidExtensionVersion(packageVersion)) {
      throw new Error(
        "Extension package.json.version must use Chrome-compatible stable SemVer X.Y.Z"
      )
    }
    if (expectedBuildVersion !== undefined && expectedBuildVersion !== packageVersion) {
      throw new Error("Expected Extension build version must equal package.json.version")
    }
    expectedBuildVersion = packageVersion
  }
  const releaseBaseUrl = environments.release.apiBaseUrl
  const nonReleaseBaseUrls = new Set(
    [environments.development.apiBaseUrl, environments.test.apiBaseUrl].filter(
      (value) => value !== "" && value !== releaseBaseUrl
    )
  )

  const perFileReports = await Promise.all(
    files.map(async (absolute) => {
      const relative = path.relative(root, absolute)
      const basename = path.basename(absolute)
      const fileErrors: string[] = []
      if (
        enforceOtherReadableWebFiles &&
        project.projectType === "web" &&
        process.platform !== "win32"
      ) {
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
      const contents = await readFile(absolute, "utf8")
      const artifactUrls = collectHttpUrls(contents)
      for (const baseUrl of nonReleaseBaseUrls) {
        if (artifactUrls.has(baseUrl)) {
          fileErrors.push(`${relative} contains a non-release API BaseURL`)
        }
      }
      for (const sentinel of RELEASE_SENTINELS) {
        if (contents.includes(sentinel)) fileErrors.push(`${relative} contains ${sentinel}`)
      }
      for (const logCall of RELEASE_LOW_LEVEL_LOG_CALLS) {
        if (contents.includes(logCall)) fileErrors.push(`${relative} contains ${logCall}`)
      }
      // 先还原 JSON 转义斜线，使 "\/Users\/name" 与远端 URL 都按真实路径判定。
      const withoutUrls = contents.replaceAll("\\/", "/").replace(HTTP_URL_PATTERN, "[URL]")
      // Parcel 相对模块路径不属于本机路径；仍拒绝绝对路径、file URL 与转义后的 Windows 路径。
      if (
        /file:\/\/[^/\s"'<>]*\/(?:Users|home)\/[^/\s]+|(?<![A-Za-z0-9_./-])\/(?:Users|home)\/[^/\s]+|[A-Za-z]:\\+Users\\+[^\\\s]+/i.test(
          withoutUrls
        )
      ) {
        fileErrors.push(`${relative} contains a local absolute path`)
      }
      if (project.projectType === "extension" && [".js", ".mjs"].includes(path.extname(absolute))) {
        for (const dependency of findExternalizedRuntimeDependencies(
          contents,
          runtimeDependencies
        )) {
          fileErrors.push(`${relative} leaves ${dependency} as an unresolved browser dependency`)
        }
      }
      if (/sourceMappingURL\s*=/.test(contents)) {
        fileErrors.push(`${relative} references a source map`)
      }
      return {
        containsBuildVersion:
          expectedBuildVersion !== undefined &&
          VERSION_SURFACE_EXTENSIONS.has(path.extname(absolute)) &&
          contents.includes(expectedBuildVersion),
        errors: fileErrors
      }
    })
  )
  const errors = perFileReports.flatMap(
    /* 执行当前文件报告到错误列表的映射。 */ (report) => report.errors
  )
  if (project.projectType === "extension") {
    const builtManifestPath = path.join(artifactRoot, "manifest.json")
    if (!(await pathExists(builtManifestPath))) {
      errors.push("Extension release artifact is missing manifest.json")
    } else {
      const builtManifest: unknown = JSON.parse(await readFile(builtManifestPath, "utf8"))
      const builtVersion =
        builtManifest !== null && typeof builtManifest === "object" && "version" in builtManifest
          ? builtManifest.version
          : undefined
      const metadata = builtManifest as Record<string, unknown> | null
      if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
        errors.push("Extension release manifest is invalid")
      } else {
        if (target !== undefined) validateBuiltExtensionManifest(metadata, target, errors)
        for (const [field, expected] of Object.entries(extensionIdentityManifest(project))) {
          if (metadata[field] !== expected) errors.push(`Extension build ${field} is stale`)
        }
      }
      if (builtVersion !== expectedBuildVersion) {
        errors.push("Extension manifest version does not match package.json.version")
      }
    }
  }
  if (project.projectType === "extension") {
    await validateIdentityLocales(artifactRoot, project, "_locales", errors)
    for (const entry of ["popup.html", "options.html"]) {
      if (!(await pathExists(path.join(artifactRoot, entry))))
        errors.push(`Extension release artifact is missing ${entry}`)
    }
  }
  if (
    expectedBuildVersion !== undefined &&
    !perFileReports.some(
      /* 执行当前文件报告的版本命中判断。 */ (report) => report.containsBuildVersion
    )
  ) {
    errors.push(`Release artifact does not contain build version ${expectedBuildVersion}`)
  }

  if (errors.length > 0) {
    throw new Error(
      `Release artifact inspection failed (${relativeArtifactRoot}):\n- ${errors.join("\n- ")}`
    )
  }
  return {
    artifactRoot: relativeArtifactRoot,
    buildVersion: expectedBuildVersion,
    files: files.length
  }
}

if (isMainModule(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2)
  if (command !== "inspect" || rest.length > 0) {
    console.error("用法：pnpm release:inspect")
    process.exitCode = 1
  } else {
    inspectReleaseArtifact(process.cwd(), {
      expectedBuildVersion: process.env.HARNESS_BUILD_VERSION
    })
      .then((report) => {
        console.log(`正式产物检查通过（${report.artifactRoot}，${report.files} 个文件）`)
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
