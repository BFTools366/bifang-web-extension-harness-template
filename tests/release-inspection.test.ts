import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { inspectReleaseArtifact } from "../.harness/tooling/release.ts"

interface BaseUrls {
  development: string
  test: string
  release: string
}

const roots: string[] = []
const publicEnvironmentKeys = [
  "VITE_APP_ENV",
  "VITE_API_BASE_URL",
  "VITE_LOG_LEVEL",
  "VITE_REQUEST_TIMEOUT_MS"
] as const
const savedEnvironment = new Map<string, string | undefined>()

function environmentFile(environment: keyof BaseUrls, baseUrl: string): string {
  const logLevel =
    environment === "development" ? "debug" : environment === "test" ? "info" : "warn"
  return [
    `VITE_APP_ENV=${environment}`,
    `VITE_API_BASE_URL=${baseUrl}`,
    `VITE_LOG_LEVEL=${logLevel}`,
    "VITE_REQUEST_TIMEOUT_MS=10000",
    ""
  ].join("\n")
}

async function createFixture(
  baseUrls: BaseUrls,
  contents: string
): Promise<{ artifactRoot: string; root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-inspection-"))
  roots.push(root)
  const artifactRoot = path.join(root, "dist")
  await mkdir(path.join(root, ".harness"), { recursive: true })
  await mkdir(artifactRoot)
  await writeFile(
    path.join(root, ".harness/project.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        projectType: "web",
        name: "Release inspection fixture",
        id: "release-inspection-fixture",
        description: "Exercises release URL scanning.",
        brand: {
          primaryColor: "#4C6EF5",
          logoSource: "generated",
          masterLogo: ".harness/brand/logo-1024.png"
        },
        initializedAt: "2026-08-10T00:00:00.000Z"
      },
      null,
      2
    )}\n`
  )
  await Promise.all(
    (Object.entries(baseUrls) as Array<[keyof BaseUrls, string]>).map(
      async ([environment, baseUrl]) => {
        const filename =
          environment === "development"
            ? ".env.development"
            : environment === "test"
              ? ".env.test"
              : ".env.production"
        await writeFile(path.join(root, filename), environmentFile(environment, baseUrl))
      }
    )
  )
  await writeFile(path.join(artifactRoot, "index.html"), contents)
  return { artifactRoot, root }
}

beforeEach(() => {
  savedEnvironment.clear()
  for (const key of publicEnvironmentKeys) {
    savedEnvironment.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(async () => {
  for (const key of publicEnvironmentKeys) {
    const value = savedEnvironment.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("release URL inspection", () => {
  const baseUrls: BaseUrls = {
    development: "https://api.example.com",
    test: "https://test-api.example.com/v1",
    release: "https://api.example.com/v1"
  }

  test("compares complete URLs without prefix, path-version, similar-host, or URL-path false positives", async () => {
    const { root } = await createFixture(
      baseUrls,
      [
        `<script>const releaseApi = "${baseUrls.release}"</script>`,
        '<a href="https://api.example.com/v10">Path version</a>',
        '<a href="https://api.example.com.evil/v1">Similar host</a>',
        '<a href="https://public.example.com/home/alice/project">Public URL path</a>'
      ].join("\n")
    )

    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({
      artifactRoot: "dist",
      files: 1
    })
  })

  test.each([
    ["development", baseUrls.development],
    ["test with a normalized trailing slash", `${baseUrls.test}/`]
  ])("rejects the complete %s BaseURL", async (_label, leakedUrl) => {
    const { root } = await createFixture(
      baseUrls,
      `<script>const leakedApi = "${leakedUrl}"</script>\n`
    )

    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/non-release API BaseURL/)
  })

  test("retains low-level log, sentinel, source-map, environment-file, and local-path gates", async () => {
    const safeContents = '<a href="https://public.example.com/Users/alice/project">Safe URL</a>\n'
    const { artifactRoot, root } = await createFixture(baseUrls, safeContents)
    const indexPath = path.join(artifactRoot, "index.html")
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ files: 1 })

    await writeFile(indexPath, "<script>console.info({ safe: true })</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/console\.info/)

    await writeFile(indexPath, "<script>const event = 'surface_started'</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/surface_started/)

    await writeFile(indexPath, "<script>//# sourceMappingURL=app.js.map</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/references a source map/)

    await writeFile(indexPath, safeContents)
    const sourceMapPath = path.join(artifactRoot, "app.js.map")
    await writeFile(sourceMapPath, "{}\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/must not be present/)
    await rm(sourceMapPath)

    await writeFile(path.join(artifactRoot, ".env.production"), "VITE_APP_ENV=release\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/must not be present/)

    await rm(path.join(artifactRoot, ".env.production"))
    await writeFile(indexPath, '<script>const localPath = "/home/alice/project"</script>\n')
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/local absolute path/)
  })
})
