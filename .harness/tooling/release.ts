import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadProjectConfig } from "./config.ts"
import { validateEnvironmentFiles } from "./environment.ts"
import { pathExists, walkFiles } from "./files.ts"

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt", ".xml"])
const RELEASE_SENTINELS = [
  "debug_sentinel",
  "info_sentinel",
  "application_started",
  "surface_started",
  "do-not-ship"
] as const
const RELEASE_LOW_LEVEL_LOG_CALLS = ["console.debug", "console.info"] as const
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g

export interface ReleaseInspection {
  artifactRoot: string
  files: number
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}

function collectHttpUrls(contents: string): Set<string> {
  const urls = new Set<string>()
  for (const match of contents.matchAll(HTTP_URL_PATTERN)) {
    const normalized = normalizeHttpUrl(match[0])
    if (normalized !== undefined) urls.add(normalized)
  }
  return urls
}

export async function inspectReleaseArtifact(rootInput: string): Promise<ReleaseInspection> {
  const root = path.resolve(rootInput)
  const project = await loadProjectConfig(root)
  const environments = await validateEnvironmentFiles(root, "release")
  const relativeArtifactRoot = project.projectType === "web" ? "dist" : "build/chrome-mv3-prod"
  const artifactRoot = path.join(root, relativeArtifactRoot)
  if (!(await pathExists(artifactRoot))) {
    throw new Error(`Missing release artifact: ${relativeArtifactRoot}`)
  }

  const files = await walkFiles(artifactRoot)
  if (files.length === 0) throw new Error(`Release artifact is empty: ${relativeArtifactRoot}`)
  const releaseBaseUrl = environments.release.apiBaseUrl
  const nonReleaseBaseUrls = new Set(
    [environments.development.apiBaseUrl, environments.test.apiBaseUrl].filter(
      (value) => value !== releaseBaseUrl
    )
  )

  const perFileErrors = await Promise.all(
    files.map(async (absolute) => {
      const relative = path.relative(root, absolute)
      const basename = path.basename(absolute)
      const fileErrors: string[] = []
      if (basename.startsWith(".env") || absolute.endsWith(".map")) {
        fileErrors.push(`${relative} must not be present in a release artifact`)
        return fileErrors
      }
      if (!TEXT_EXTENSIONS.has(path.extname(absolute))) return fileErrors
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
      const withoutUrls = contents.replace(HTTP_URL_PATTERN, "[URL]")
      if (/\/(?:Users|home)\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+/.test(withoutUrls)) {
        fileErrors.push(`${relative} contains a local absolute path`)
      }
      if (/sourceMappingURL\s*=/.test(contents)) {
        fileErrors.push(`${relative} references a source map`)
      }
      return fileErrors
    })
  )
  const errors = perFileErrors.flat()

  if (errors.length > 0) {
    throw new Error(`Release artifact inspection failed:\n- ${errors.join("\n- ")}`)
  }
  return { artifactRoot: relativeArtifactRoot, files: files.length }
}

const executedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executedPath === import.meta.url) {
  const [command, ...rest] = process.argv.slice(2)
  if (command !== "inspect" || rest.length > 0) {
    console.error("Usage: pnpm release:inspect")
    process.exitCode = 1
  } else {
    inspectReleaseArtifact(process.cwd())
      .then((report) => {
        console.log(
          `Release artifact inspection passed (${report.artifactRoot}, ${report.files} files)`
        )
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
