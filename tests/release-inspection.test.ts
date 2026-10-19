import { cp, readFile, chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
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
  "VITE_REQUEST_TIMEOUT_MS",
  "PLASMO_PUBLIC_APP_ENV",
  "PLASMO_PUBLIC_API_BASE_URL",
  "PLASMO_PUBLIC_LOG_LEVEL",
  "PLASMO_PUBLIC_REQUEST_TIMEOUT_MS"
] as const
// 保存 savedEnvironment 变量供当前逻辑使用。
const savedEnvironment = new Map<string, string | undefined>()

// 执行 environmentFile 函数的处理逻辑。
function environmentFile(
  environment: keyof BaseUrls,
  baseUrl: string,
  projectType: "web" | "extension" = "web"
): string {
  // 保存 logLevel 变量供当前逻辑使用。
  const logLevel =
    environment === "development" ? "debug" : environment === "test" ? "info" : "warn"
  const prefix = projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
  return [
    `${prefix}APP_ENV=${environment}`,
    `${prefix}API_BASE_URL=${baseUrl}`,
    `${prefix}LOG_LEVEL=${logLevel}`,
    `${prefix}REQUEST_TIMEOUT_MS=10000`,
    ""
  ].join("\n")
}

// 执行 createFixture 函数的处理逻辑。
async function createFixture(
  baseUrls: BaseUrls,
  contents: string,
  options: { requireOtherReadableWebFiles?: boolean; projectType?: "web" | "extension" } = {}
): Promise<{ artifactRoot: string; root: string }> {
  // 保存 root 变量供当前逻辑使用。
  const root = await mkdtemp(path.join(os.tmpdir(), "release-inspection-"))
  roots.push(root)
  // 保存 artifactRoot 变量供当前逻辑使用。
  const projectType = options.projectType ?? "web"
  const artifactRoot = path.join(root, projectType === "web" ? "dist" : "build/chrome-mv3-prod")
  await mkdir(path.join(root, ".harness"), { recursive: true })
  await mkdir(artifactRoot, { recursive: true })
  await writeFile(
    path.join(root, ".harness/project.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        projectType,
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
  if (options.requireOtherReadableWebFiles !== undefined) {
    await writeFile(
      path.join(root, ".harness/release-policy.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        requireOtherReadableWebFiles: options.requireOtherReadableWebFiles
      })}\n`
    )
  }
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
        await writeFile(
          path.join(root, filename),
          environmentFile(environment, baseUrl, projectType)
        )
      }
    )
  )
  const pagePath = path.join(artifactRoot, projectType === "web" ? "index.html" : "popup.html")
  await writeFile(pagePath, contents)
  if (projectType === "extension") {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ version: "1.2.3", dependencies: { react: "19.2.0" } })
    )
    await writeFile(
      path.join(artifactRoot, "manifest.json"),
      JSON.stringify({
        version: "1.2.3",
        manifest_version: 3,
        name: "__MSG_projectName__",
        description: "__MSG_projectDescription__",
        default_locale: "en",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })
    )
    for (const locale of ["en", "zh_CN"]) {
      const directory = path.join(artifactRoot, "_locales", locale)
      await mkdir(directory, { recursive: true })
      await writeFile(
        path.join(directory, "messages.json"),
        JSON.stringify({
          projectName: { message: "Release inspection fixture" },
          projectDescription: { message: "Exercises release URL scanning." }
        })
      )
    }
  }
  if (projectType === "extension") {
    await writeFile(path.join(artifactRoot, "options.html"), "<!doctype html><p>Options</p>")
    const firefoxRoot = path.join(root, "build/firefox-mv2-prod")
    await cp(artifactRoot, firefoxRoot, { recursive: true })
    const manifest = JSON.parse(await readFile(path.join(artifactRoot, "manifest.json"), "utf8"))
    delete manifest.action
    await writeFile(
      path.join(firefoxRoot, "manifest.json"),
      JSON.stringify({
        ...manifest,
        manifest_version: 2,
        browser_action: { default_popup: "popup.html" }
      })
    )
  }
  if (process.platform !== "win32") {
    await chmod(pagePath, 0o644)
  }
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
      else Object.assign(process.env, { [key]: value })
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
  /** 验证不能接受只有 Chrome 的候选或仅 Firefox 中出现的版本/入口/泄漏错误。 */
  test("rejects missing or incompatible Firefox release artifacts", async () => {
    const { root } = await createFixture(
      { development: "", test: "", release: "https://api.example.com" },
      "<p>Release 1.2.3</p>",
      { projectType: "extension" }
    )
    const firefoxRoot = path.join(root, "build/firefox-mv2-prod")
    const manifestPath = path.join(firefoxRoot, "manifest.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    for (const [patch, expected] of [
      [{ manifest_version: 3 }, /firefox-mv2.*manifest_version must equal 2/],
      [{ version: "1.2.4" }, /version does not match/],
      [{ browser_action: { default_popup: "wrong.html" } }, /missing popup entry/],
      [{ background: { service_worker: "worker.js" } }, /MV2 background/],
      [{ host_permissions: ["https://example.com/*"] }, /permissions for host access/]
    ] as const) {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, ...patch }))
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(expected)
    }
    await writeFile(manifestPath, JSON.stringify(manifest))
    await writeFile(path.join(firefoxRoot, "_locales/zh_CN/messages.json"), "{}")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/Identity locale.*stale/)
    await cp(
      path.join(root, "build/chrome-mv3-prod/_locales"),
      path.join(firefoxRoot, "_locales"),
      { recursive: true }
    )
    await writeFile(path.join(firefoxRoot, "popup.html"), "<p>1.2.3 debug_sentinel</p>")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/debug_sentinel/)
    await writeFile(path.join(firefoxRoot, "popup.html"), "<p>1.2.3</p>")
    await writeFile(path.join(firefoxRoot, "popup.js"), '{"react/jsx-runtime":"react/jsx-runtime"}')
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/unresolved browser dependency/)
    await rm(firefoxRoot, { recursive: true })
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(
      /Missing release artifact: build\/firefox-mv2-prod/
    )
  })

  /** 验证正式扫描允许开发和测试地址留空，但不会放过缺失或不安全的正式地址。 */
  test.each(["web", "extension"] as const)(
    "requires a configured HTTPS release API for %s",
    async (projectType) => {
      const { root } = await createFixture(
        { development: "", test: "", release: "https://api.example.com" },
        "<!doctype html><p>Release 1.2.3</p>",
        { projectType }
      )
      await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({
        files: projectType === "web" ? 1 : 10
      })
      for (const release of ["", "http://api.example.com"]) {
        await writeFile(
          path.join(root, ".env.production"),
          environmentFile("release", release, projectType)
        )
        await expect(inspectReleaseArtifact(root)).rejects.toThrow(/Release API_BASE_URL/)
      }
    }
  )

  // 保存 baseUrls 变量供当前逻辑使用。
  const baseUrls: BaseUrls = {
    development: "https://api.example.com",
    test: "https://test-api.example.com/v1",
    release: "https://api.example.com/v1"
  }

  /** 验证 compares complete URLs without prefix, path-version, similar-host, or URL-path false positives 场景。 */
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

  /** 验证 rejects the complete %s BaseURL 场景。 */
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

  /** 验证 retains low-level log, sentinel, source-map, environment-file, and local-path gates 场景。 */
  test("retains low-level log, sentinel, source-map, environment-file, and local-path gates", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 safeContents 变量供当前逻辑使用。
    const safeContents =
      '<a href="https://public.example.com/Users/alice/project">Safe URL</a>\n' +
      '<script>const home = require("../home/HomePage"); const image = "./Users/avatar.svg"</script>\n'
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
    for (const localPath of [
      "/Users/alice/project",
      "file:///home/alice/project",
      "file:///Users/alice/project",
      "file://localhost/home/alice/project",
      "FILE:///Users/alice/project",
      "C:\\Users\\alice\\project"
    ]) {
      await writeFile(
        indexPath,
        `<script>const localPath = ${JSON.stringify(localPath)}</script>\n`
      )
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(/local absolute path/)
    }
  })

  /** 验证 Web 产物包含当次 YYMMDDHHMMSS 版本并拒绝旧字段顺序。 */
  test("requires the current YYMMDDHHMMSS Web version in the artifact", /* 执行当前测试用例的验证逻辑。 */ async () => {
    // 保存 { root } 变量供版本注入断言使用。
    const { root } = await createFixture(
      baseUrls,
      '<script>const buildVersion = "260824123459"</script>\n'
    )

    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "260824123459" })
    ).resolves.toMatchObject({ buildVersion: "260824123459" })
    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "260824123500" })
    ).rejects.toThrow(/does not contain build version/)
    await expect(
      inspectReleaseArtifact(root, { expectedBuildVersion: "202608241234" })
    ).rejects.toThrow(/must use YYMMDDHHMMSS/)
  })

  /** 验证 Web 元数据、样式和文本中的版本不能替代页面或脚本版本。 */
  test.each(["metadata.json", "theme.css", "version.txt"])(
    "rejects Web version only in %s",
    async (filename) => {
      const { artifactRoot, root } = await createFixture(baseUrls, "<main>Release</main>\n")
      const expectedBuildVersion = "261013123459"
      await writeFile(path.join(artifactRoot, filename), expectedBuildVersion)
      await expect(inspectReleaseArtifact(root, { expectedBuildVersion })).rejects.toThrow(
        /does not contain build version/
      )
      await writeFile(
        path.join(artifactRoot, "app.js"),
        `const buildVersion = "${expectedBuildVersion}";`
      )
      await expect(inspectReleaseArtifact(root, { expectedBuildVersion })).resolves.toMatchObject({
        buildVersion: expectedBuildVersion
      })
    }
  )

  /** 验证 Extension 的 package、manifest 与界面版本必须使用同一 SemVer。 */
  test("matches Extension SemVer across package, manifest, and UI", /* 执行当前测试用例的验证逻辑。 */ async () => {
    const { artifactRoot, root } = await createFixture(
      baseUrls,
      '<script>const buildVersion = "1.2.3"</script>\n',
      { projectType: "extension" }
    )
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ buildVersion: "1.2.3" })
    await expect(inspectReleaseArtifact(root, { expectedBuildVersion: "1.2.4" })).rejects.toThrow(
      /must equal package.json.version/
    )
    await writeFile(path.join(artifactRoot, "manifest.json"), JSON.stringify({ version: "1.2.4" }))
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/manifest version does not match/)
    await writeFile(
      path.join(artifactRoot, "manifest.json"),
      JSON.stringify({
        version: "1.2.3",
        manifest_version: 3,
        name: "__MSG_projectName__",
        description: "__MSG_projectDescription__",
        default_locale: "en",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })
    )
    await writeFile(path.join(artifactRoot, "popup.html"), "<main>Release</main>\n")
    await writeFile(path.join(artifactRoot, "metadata.json"), JSON.stringify({ note: "1.2.3" }))
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/does not contain build version/)
    for (const version of ["1.2.3-beta.1", "0.0.0", "65536.0.0"]) {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ version }))
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(/stable SemVer/)
    }
  })

  /** 验证 POSIX Web 候选的每个静态文件都必须允许 other 读取。 */
  test.runIf(process.platform !== "win32")(
    "requires POSIX Web artifact files to be other-readable",
    /* 执行当前测试用例的验证逻辑。 */ async () => {
      // 保存 { artifactRoot, root } 变量供切换精确产物权限使用。
      const { artifactRoot, root } = await createFixture(baseUrls, "<main>Release</main>\n")
      // 保存 indexPath 变量供分别验证 0600 拒绝与 0644 通过使用。
      const indexPath = path.join(artifactRoot, "index.html")

      await chmod(indexPath, 0o600)
      await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ files: 1 })

      await writeFile(
        path.join(root, ".harness/release-policy.json"),
        `${JSON.stringify({ schemaVersion: 1, requireOtherReadableWebFiles: true })}\n`
      )
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(/must be other-readable/)

      await chmod(indexPath, 0o644)
      await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ files: 1 })
    }
  )

  /** 验证可选 Release 权限策略存在时必须严格匹配 schema。 */
  test("rejects an invalid Release permission policy", async () => {
    // 保存 { root } 变量供篡改受保护策略使用。
    const { root } = await createFixture(baseUrls, "<main>Release</main>\n", {
      requireOtherReadableWebFiles: true
    })
    await writeFile(
      path.join(root, ".harness/release-policy.json"),
      '{"schemaVersion":1,"requireOtherReadableWebFiles":"yes"}\n'
    )

    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/Release policy schema is invalid/)
  })
})
