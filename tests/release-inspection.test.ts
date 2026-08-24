import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { inspectReleaseArtifact } from "../.harness/tooling/release.ts"

// 定义 BaseUrls 接口的结构契约。
interface BaseUrls {
  // 描述 development 接口成员的结构契约。
  development: string
  // 描述 test 接口成员的结构契约。
  test: string
  // 描述 release 接口成员的结构契约。
  release: string
}

// 保存 roots 变量供当前逻辑使用。
const roots: string[] = []
// 保存 publicEnvironmentKeys 变量供当前逻辑使用。
const publicEnvironmentKeys = [
  "VITE_APP_ENV",
  "VITE_API_BASE_URL",
  "VITE_LOG_LEVEL",
  "VITE_REQUEST_TIMEOUT_MS"
] as const
// 保存 savedEnvironment 变量供当前逻辑使用。
const savedEnvironment = new Map<string, string | undefined>()

// 执行 environmentFile 函数的处理逻辑。
function environmentFile(environment: keyof BaseUrls, baseUrl: string): string {
  // 保存 logLevel 变量供当前逻辑使用。
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

// 执行 createFixture 函数的处理逻辑。
async function createFixture(
  baseUrls: BaseUrls,
  contents: string
): Promise<{ artifactRoot: string; root: string }> {
  // 保存 root 变量供当前逻辑使用。
  const root = await mkdtemp(path.join(os.tmpdir(), "release-inspection-"))
  roots.push(root)
  // 保存 artifactRoot 变量供当前逻辑使用。
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
      // 执行 当前声明 函数的处理逻辑。
      async ([environment, baseUrl]) => {
        // 保存 filename 变量供当前逻辑使用。
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

beforeEach(
  /* 执行 当前声明 函数的处理逻辑。 */ () => {
    savedEnvironment.clear()
    // 保存 key 变量供当前逻辑使用。
    for (const key of publicEnvironmentKeys) {
      savedEnvironment.set(key, process.env[key])
      delete process.env[key]
    }
  }
)

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 key 变量供当前逻辑使用。
    for (const key of publicEnvironmentKeys) {
      // 保存 value 变量供当前逻辑使用。
      const value = savedEnvironment.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await Promise.all(
      roots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)

describe("release URL inspection", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  // 保存 baseUrls 变量供当前逻辑使用。
  const baseUrls: BaseUrls = {
    development: "https://api.example.com",
    test: "https://test-api.example.com/v1",
    release: "https://api.example.com/v1"
  }

  test("compares complete URLs without prefix, path-version, similar-host, or URL-path false positives", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 { root } 变量供当前逻辑使用。
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
  ])(
    "rejects the complete %s BaseURL",
    /* 执行 当前声明 函数的处理逻辑。 */ async (_label, leakedUrl) => {
      // 保存 { root } 变量供当前逻辑使用。
      const { root } = await createFixture(
        baseUrls,
        `<script>const leakedApi = "${leakedUrl}"</script>\n`
      )

      await expect(inspectReleaseArtifact(root)).rejects.toThrow(/non-release API BaseURL/)
    }
  )

  test("retains low-level log, sentinel, source-map, environment-file, and local-path gates", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 safeContents 变量供当前逻辑使用。
    const safeContents = '<a href="https://public.example.com/Users/alice/project">Safe URL</a>\n'
    // 保存 { artifactRoot, root } 变量供当前逻辑使用。
    const { artifactRoot, root } = await createFixture(baseUrls, safeContents)
    // 保存 indexPath 变量供当前逻辑使用。
    const indexPath = path.join(artifactRoot, "index.html")
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ files: 1 })

    await writeFile(indexPath, "<script>console.info({ safe: true })</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/console\.info/)

    await writeFile(indexPath, "<script>const event = 'surface_started'</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/surface_started/)

    await writeFile(indexPath, "<script>//# sourceMappingURL=app.js.map</script>\n")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/references a source map/)

    await writeFile(indexPath, safeContents)
    // 保存 sourceMapPath 变量供当前逻辑使用。
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

  test("requires the current YYYYMMDDHHMM build version in the artifact", /* 执行当前测试用例的验证逻辑。 */ async () => {
    // 保存 { root } 变量供版本注入断言使用。
    const { root } = await createFixture(
      baseUrls,
      '<script>const buildVersion = "202608241234"</script>\n'
    )

    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "202608241234" })
    ).resolves.toMatchObject({ buildVersion: "202608241234" })
    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "202608241235" })
    ).rejects.toThrow(/does not contain build version/)
    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "2026-08-24" })
    ).rejects.toThrow(/must use YYYYMMDDHHMM/)
  })
})
