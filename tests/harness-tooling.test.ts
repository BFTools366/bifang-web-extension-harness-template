import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { afterEach, describe, expect, test } from "vitest"
import { parseArgs } from "../.harness/tooling/args.ts"
import { refreshBrand } from "../.harness/tooling/brand.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { profileFromArgs, validateEnvironmentFiles } from "../.harness/tooling/environment.ts"
import { initializeProject } from "../.harness/tooling/init.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { inspectReleaseArtifact } from "../.harness/tooling/release.ts"
import type { InitOptions } from "../.harness/tooling/types.ts"
import { validateProject } from "../.harness/tooling/validate.ts"

const temporaryRoots: string[] = []
const repositoryRoot = path.resolve(import.meta.dirname, "..")
const TEST_BASE_URLS = {
  developmentBaseUrl: "http://localhost:3000/api",
  testBaseUrl: "https://test-api.example.com/v1",
  releaseBaseUrl: "https://api.example.com/v1"
} as const
const OPTIONAL_INTEGRATION_PACKAGES = [
  "ky",
  "axios",
  "openapi-fetch",
  "openapi-typescript",
  "graphql",
  "graphql-request",
  "@graphql-codegen/cli",
  "@graphql-codegen/client-preset",
  "@apollo/client",
  "eventsource-client",
  "@microsoft/fetch-event-source",
  "rxjs"
] as const
const PAGINATION_I18N_KEYS = [
  "paginationNavigation",
  "paginationPage",
  "paginationPrevious",
  "paginationNext",
  "paginationPageSize"
] as const

function expectOptionalIntegrationPackagesNotInstalled(manifest: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): void {
  const installed = { ...manifest.dependencies, ...manifest.devDependencies }
  for (const dependency of OPTIONAL_INTEGRATION_PACKAGES) {
    expect(installed).not.toHaveProperty(dependency)
  }
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(directory)
  return directory
}

async function seedTemplateRoot(): Promise<string> {
  const root = await temporaryDirectory("web-harness-test-")
  await mkdir(path.join(root, "docs"))
  await mkdir(path.join(root, ".harness/tooling"), { recursive: true })
  await writeFile(
    path.join(root, ".gitignore"),
    await readFile(path.join(repositoryRoot, ".gitignore"), "utf8")
  )
  await writeFile(
    path.join(root, "docs/DATA_ACCESS.md"),
    await readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/version.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/version.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/environment.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/environment.ts"), "utf8")
  )
  await writeFile(
    path.join(root, ".harness/tooling/release.ts"),
    await readFile(path.join(repositoryRoot, ".harness/tooling/release.ts"), "utf8")
  )
  await writeFile(
    path.join(root, "package.json"),
    await readFile(path.join(repositoryRoot, "package.json"), "utf8")
  )
  await writeFile(
    path.join(root, "tsconfig.json"),
    await readFile(path.join(repositoryRoot, "tsconfig.json"), "utf8")
  )
  await writeFile(
    path.join(root, "LICENSE.en.md"),
    "Applicable Project Name: Bifang Web Harness Template. Preserve everything else.\n"
  )
  await writeFile(
    path.join(root, "LICENSE.zh-CN.md"),
    "适用项目名称：Bifang Web Harness Template。保留其余内容。\n"
  )
  return root
}

function options(root: string, projectType: "web" | "extension"): InitOptions {
  return {
    root,
    projectType,
    name: projectType === "web" ? "Aurora Notes" : "Aurora Clipper",
    id: projectType === "web" ? "aurora-notes" : "aurora-clipper",
    description: projectType === "web" ? "A focused notes workspace." : "Clip useful pages.",
    brandColor: "#5B5BD6",
    ...TEST_BASE_URLS,
    skipInstall: true,
    skipGit: true
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("single-package Harness initialization", () => {
  test("creates a terminal Web project with synchronized identity and scaled assets", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))

    const master = await sharp(path.join(root, ".harness/brand/logo-1024.png")).metadata()
    const logo = await sharp(path.join(root, "public/logo.png")).metadata()
    const favicon = await sharp(path.join(root, "public/favicon.png")).metadata()
    expect([master.width, master.height]).toEqual([1024, 1024])
    expect([logo.width, logo.height]).toEqual([512, 512])
    expect([favicon.width, favicon.height]).toEqual([64, 64])

    const index = await readFile(path.join(root, "index.html"), "utf8")
    const landing = await readFile(path.join(root, "src/features/welcome/WelcomePage.tsx"), "utf8")
    const indexRoute = await readFile(path.join(root, "src/routes/index.tsx"), "utf8")
    const rootRoute = await readFile(path.join(root, "src/routes/__root.tsx"), "utf8")
    const router = await readFile(path.join(root, "src/app/router.tsx"), "utf8")
    const viteConfig = await readFile(path.join(root, "vite.config.ts"), "utf8")
    const i18n = await readFile(path.join(root, "src/i18n/index.ts"), "utf8")
    const englishLocale = await readFile(path.join(root, "src/i18n/locales/en.ts"), "utf8")
    const chineseLocale = await readFile(path.join(root, "src/i18n/locales/zh.ts"), "utf8")
    const language = await readFile(path.join(root, "src/i18n/language.ts"), "utf8")
    const httpClient = await readFile(path.join(root, "src/api/client/httpClient.ts"), "utf8")
    const apiBoundary = await readFile(path.join(root, "src/api/README.md"), "utf8")
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8")
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    const developmentEnvironment = await readFile(path.join(root, ".env.development"), "utf8")
    const testEnvironment = await readFile(path.join(root, ".env.test"), "utf8")
    const releaseEnvironment = await readFile(path.join(root, ".env.production"), "utf8")
    const logger = await readFile(path.join(root, "src/observability/logger.ts"), "utf8")
    const pagination = await readFile(
      path.join(root, "src/pagination/useSessionPagination.ts"),
      "utf8"
    )
    const paginationControls = await readFile(
      path.join(root, "src/pagination/PaginationControls.tsx"),
      "utf8"
    )
    const queryClient = await readFile(path.join(root, "src/app/queryClient.ts"), "utf8")
    const main = await readFile(path.join(root, "src/main.tsx"), "utf8")
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    expect(index).toContain("<title>Aurora Notes</title>")
    expect(index).toContain('content="A focused notes workspace."')
    expect(index).toContain('content="#5B5BD6"')
    expect(landing).toContain("BRAND.description")
    expect(indexRoute).toContain('createFileRoute("/")')
    expect(indexRoute).toContain("WelcomePage")
    expect(rootRoute).toContain("createRootRoute")
    expect(router).toContain('from "../routeTree.gen"')
    expect(viteConfig).toContain("@tanstack/router-plugin/vite")
    expect(viteConfig.indexOf("tanstackRouter(")).toBeLessThan(viteConfig.indexOf("react()"))
    expect(viteConfig).toContain("autoCodeSplitting: true")
    expect(viteConfig).toContain('manualPureFunctions: ["console.debug", "console.info"]')
    expect(viteConfig).toContain('mode === "production"')
    expect(viteConfig).toContain("rolldownOptions")
    expect(viteConfig).not.toContain("esbuild:")
    expect(viteConfig).toContain("sourcemap: false")
    expect(apiBoundary).toContain("Do not add placeholder requests")
    expect(apiBoundary).toContain("TanStack Query owns server state")
    expect(gitignore.split(/\r?\n/)).toContain("src/routeTree.gen.ts")
    await expect(readFile(path.join(root, "src/routeTree.gen.ts"), "utf8")).rejects.toThrow()
    expect(i18n).toContain("initializeLanguage")
    expect(i18n).toContain('fallbackLng: "en"')
    expect(i18n).toContain("zh: { translation: zh }")
    for (const key of PAGINATION_I18N_KEYS) {
      expect(englishLocale).toContain(`${key}:`)
      expect(chineseLocale).toContain(`${key}:`)
    }
    expect(language).toContain("localStorage")
    expect(language).toContain("changeApplicationLanguage")
    expect(language).toContain("getRequestLanguage")
    expect(httpClient).toContain('"X-Http-Request"')
    expect(httpClient).toContain('"X-Lang"')
    expect(httpClient).toContain('"X-AUTH-TOKEN"')
    expect(httpClient).toContain("extractAuthToken")
    expect(httpClient).toContain("unauthorizedHandler")
    expect(httpClient).toContain("createLoginUnauthorizedHandler")
    expect(httpClient).toContain("response.clone()")
    expect(dataAccess).toContain("`ky`")
    expect(dataAccess).toContain("`openapi-fetch`")
    expect(dataAccess).toContain("`graphql-request`")
    expect(dataAccess).toContain("`GraphqlTarget`")
    expect(dataAccess).toContain("`gcTime: 0`")
    expect(dataAccess).toContain("registry 初始化时校验 URL")
    expect(dataAccess).toContain("CORS")
    expect(dataAccess).toContain("eventsource-client")
    expect(dataAccess).toContain("RxJS（按需）")
    expect(dataAccess).toContain("`Subject` 保持私有")
    expect(dataAccess).toContain("`invalidateQueries`")
    expect(dataAccess).toContain("X-Http-Request")
    expect(dataAccess).toContain("sessionStorage")
    expect(dataAccess).toContain("UnauthorizedHandler")
    expect(engineeringRules).toContain("RxJS 只在多来源或复杂时序需求出现时")
    expect(engineeringRules).toContain("src/routeTree.gen.ts")
    expect(engineeringRules).toContain("route 级自动拆包")
    expect(developmentEnvironment).toContain("VITE_APP_ENV=development")
    expect(developmentEnvironment).toContain(
      `VITE_API_BASE_URL=${TEST_BASE_URLS.developmentBaseUrl}`
    )
    expect(testEnvironment).toContain("VITE_APP_ENV=test")
    expect(releaseEnvironment).toContain("VITE_APP_ENV=release")
    expect(releaseEnvironment).toContain("VITE_LOG_LEVEL=warn")
    expect(await readFile(path.join(root, "src/config/environment.ts"), "utf8")).toContain(
      "import.meta.env.VITE_API_BASE_URL"
    )
    expect(logger).toContain("RELEASE_ALLOWED_KEYS")
    expect(logger).toContain("[REDACTED]")
    expect(logger).toContain('const RELEASE_BUILD = import.meta.env.VITE_APP_ENV === "release"')
    expect(logger).not.toContain("PLASMO_PUBLIC_APP_ENV")
    expect(pagination).toContain("sessionStorage")
    expect(pagination).toContain("BRAND.id")
    expect(pagination).toContain("requestedPageSize")
    expect(pagination).toContain("isPlaceholderData")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(paginationControls).toContain("labels")
    expect(queryClient).toContain('logger.error("query_failed"')
    expect(main).toContain('logger.error("unhandled_rejection"')
    expect(main).toContain('import.meta.env.VITE_APP_ENV !== "release"')
    expect(main).not.toContain("IS_RELEASE_BUILD")
    expect(tsconfig.include).not.toContain(".plasmo/index.d.ts")

    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      engines: Record<string, string>
    }
    expect(manifest.engines).toEqual({ node: ">=22.22.2", pnpm: ">=10.33.3" })
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-router")
    expect(manifest.devDependencies).toHaveProperty("@tanstack/router-cli", "1.167.27")
    expect(manifest.devDependencies).toHaveProperty("@tanstack/router-plugin", "1.168.29")
    expect(manifest.scripts["routes:generate"]).toBe("tsr generate")
    expect(manifest.scripts["env:validate"]).toBe("tsx .harness/tooling/environment.ts validate")
    expect(manifest.scripts.build).toBe("pnpm build:release")
    expect(manifest.scripts["release:inspect"]).toBe("tsx .harness/tooling/release.ts inspect")
    expect(manifest.scripts["build:development"]).toContain("--profile development")
    expect(manifest.scripts["build:test"]).toContain("--profile test")
    expect(manifest.scripts["build:release"]).toContain("--profile release")
    expect(manifest.scripts["build:release"]).toContain("pnpm release:inspect")
    expect(Object.values(manifest.scripts).join("\n")).not.toContain("env:validate -- --profile")
    expect(manifest.scripts.typecheck).toContain("pnpm routes:generate")
    expect(manifest.scripts.test).toContain("pnpm routes:generate")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    await expect(readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")).rejects.toThrow()
    await expect(readFile(path.join(root, "scripts/instantiate.ts"), "utf8")).rejects.toThrow()
    expect(await readFile(path.join(root, "LICENSE.en.md"), "utf8")).toBe(
      "Applicable Project Name: Aurora Notes. Preserve everything else.\n"
    )
  })

  test("creates a terminal Chrome extension without Router or unused permissions", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))

    const icon = await sharp(path.join(root, "assets/icon.png")).metadata()
    expect([icon.width, icon.height]).toEqual([1024, 1024])
    const popup = await readFile(path.join(root, "src/popup.tsx"), "utf8")
    const extensionBrand = await readFile(path.join(root, "src/brand.ts"), "utf8")
    const i18n = await readFile(path.join(root, "src/i18n.ts"), "utf8")
    const language = await readFile(path.join(root, "src/i18n/language.ts"), "utf8")
    const httpClient = await readFile(path.join(root, "src/api/client/httpClient.ts"), "utf8")
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    const developmentEnvironment = await readFile(path.join(root, ".env.development"), "utf8")
    const releaseEnvironment = await readFile(path.join(root, ".env.production"), "utf8")
    const extensionShell = await readFile(path.join(root, "src/ExtensionShell.tsx"), "utf8")
    const providers = await readFile(path.join(root, "src/providers.tsx"), "utf8")
    const logger = await readFile(path.join(root, "src/observability/logger.ts"), "utf8")
    const pagination = await readFile(
      path.join(root, "src/pagination/useSessionPagination.ts"),
      "utf8"
    )
    const paginationControls = await readFile(
      path.join(root, "src/pagination/PaginationControls.tsx"),
      "utf8"
    )
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    expect(popup).toContain("data-base64:../assets/icon.png")
    expect(popup).toContain('surface="popup"')
    expect(extensionBrand).toContain("Aurora Clipper")
    expect(i18n).toContain("initializeLanguage")
    for (const key of PAGINATION_I18N_KEYS) {
      expect(i18n.split(`${key}:`)).toHaveLength(3)
    }
    expect(language).toContain("localStorage")
    expect(httpClient).toContain('"X-Http-Request"')
    expect(httpClient).toContain('"X-Lang"')
    expect(httpClient).toContain('"X-AUTH-TOKEN"')
    expect(httpClient).toContain("unauthorizedHandler")
    expect(httpClient).toContain("createLoginUnauthorizedHandler")
    expect(dataAccess).toContain("`host_permissions`")
    expect(dataAccess).toContain("service worker")
    expect(dataAccess).toContain("`eventsource-client`")
    expect(dataAccess).toContain("`@graphql-codegen/client-preset`")
    expect(dataAccess).toContain("RxJS（按需）")
    expect(dataAccess).toContain("`chrome.runtime`/tabs messaging 或 Port")
    expect(dataAccess).toContain("不能让 service worker 常驻")
    expect(engineeringRules).toContain("RxJS 只能编排当前执行上下文内的事件")
    expect(engineeringRules).not.toContain("src/routeTree.gen.ts")
    expect(developmentEnvironment).toContain("PLASMO_PUBLIC_APP_ENV=development")
    expect(developmentEnvironment).toContain(
      `PLASMO_PUBLIC_API_BASE_URL=${TEST_BASE_URLS.developmentBaseUrl}`
    )
    expect(releaseEnvironment).toContain("PLASMO_PUBLIC_APP_ENV=release")
    expect(await readFile(path.join(root, "src/config/environment.ts"), "utf8")).toContain(
      "process.env.PLASMO_PUBLIC_API_BASE_URL"
    )
    expect(extensionShell).toContain('logger.error("unhandled_rejection"')
    expect(extensionShell).toContain('process.env.PLASMO_PUBLIC_APP_ENV !== "release"')
    expect(providers).toContain('logger.error("mutation_failed"')
    expect(logger).toContain(
      'const RELEASE_BUILD = process.env.PLASMO_PUBLIC_APP_ENV === "release"'
    )
    expect(logger).not.toContain("import.meta.env.VITE_APP_ENV")
    expect(pagination).toContain("sessionStorage")
    expect(pagination).toContain("BRAND.id")
    expect(pagination).not.toContain("chrome.storage")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(tsconfig.include[0]).toBe(".plasmo/index.d.ts")

    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      displayName: string
      manifest: Record<string, unknown>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }
    expect(manifest.displayName).toBe("Aurora Clipper")
    expect(manifest.manifest.description).toBe("Clip useful pages.")
    expect(manifest.manifest).not.toHaveProperty("permissions")
    expect(manifest.manifest).not.toHaveProperty("host_permissions")
    expect(manifest.dependencies).not.toHaveProperty("@tanstack/react-router")
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-cli")
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-plugin")
    expect(manifest).not.toHaveProperty("scripts.routes:generate")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.devDependencies.plasmo).toBe("0.90.5")
    expect(Object.values(manifest.scripts).join("\n")).not.toContain("env:validate -- --profile")
    await expect(readFile(path.join(root, "index.html"), "utf8")).rejects.toThrow()
  })

  test("rejects combined, invalid, and repeated type options", async () => {
    const root = await seedTemplateRoot()
    await expect(
      initializeProject({ ...options(root, "web"), projectType: "both" as "web" })
    ).rejects.toThrow(/exactly "web" or "extension"/)
    expect(() => parseArgs(["--type", "web", "--type", "extension"])).toThrow(
      /only be provided once/
    )
    await expect(
      resolveInitOptions(
        parseArgs([
          "--type",
          "web,extension",
          "--name",
          "Mixed",
          "--id",
          "mixed",
          "--description",
          "Mixed project",
          "--development-base-url",
          TEST_BASE_URLS.developmentBaseUrl,
          "--test-base-url",
          TEST_BASE_URLS.testBaseUrl,
          "--release-base-url",
          TEST_BASE_URLS.releaseBaseUrl
        ]),
        root
      )
    ).rejects.toThrow(/exactly "web" or "extension"/)
  })

  test("parses the profile arguments exactly as pnpm forwards them", () => {
    expect(profileFromArgs([])).toBeUndefined()
    expect(profileFromArgs(["--profile", "test"])).toBe("test")
    expect(() => profileFromArgs(["--", "--profile", "test"])).toThrow(/Usage/)
  })

  test("uses the stable color default but requires type and identity when non-interactive", async () => {
    const root = await seedTemplateRoot()
    const resolved = await resolveInitOptions(
      parseArgs([
        "--type",
        "web",
        "--name",
        "Default Brand",
        "--id",
        "default-brand",
        "--description",
        "Uses the default color",
        "--development-base-url",
        TEST_BASE_URLS.developmentBaseUrl,
        "--test-base-url",
        TEST_BASE_URLS.testBaseUrl,
        "--release-base-url",
        TEST_BASE_URLS.releaseBaseUrl
      ]),
      root
    )
    expect(resolved.brandColor).toBe("#4C6EF5")
    await expect(
      resolveInitOptions(
        parseArgs(["--name", "Missing Type", "--id", "missing-type", "--description", "No type"]),
        root
      )
    ).rejects.toThrow(/--type/)

    await expect(
      resolveInitOptions(
        parseArgs([
          "--type",
          "web",
          "--name",
          "Missing URLs",
          "--id",
          "missing-urls",
          "--description",
          "No environment URLs"
        ]),
        root
      )
    ).rejects.toThrow(/--development-base-url/)
  })

  test("rejects invalid or colliding environment configuration before completion", async () => {
    const invalidRoot = await seedTemplateRoot()
    await expect(
      initializeProject({
        ...options(invalidRoot, "web"),
        releaseBaseUrl: "http://insecure.example.com/api"
      })
    ).rejects.toThrow(/Release API_BASE_URL must use https/)
    await expect(
      readFile(path.join(invalidRoot, ".harness/project.json"), "utf8")
    ).rejects.toThrow()

    const collisionRoot = await seedTemplateRoot()
    await writeFile(path.join(collisionRoot, ".env.test"), "USER_OWNED=true\n")
    await expect(initializeProject(options(collisionRoot, "web"))).rejects.toThrow(
      /Refusing to overwrite/
    )
    expect(await readFile(path.join(collisionRoot, ".env.test"), "utf8")).toBe("USER_OWNED=true\n")
  })

  test("rejects incomplete environment files during project validation", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    await writeFile(
      path.join(root, ".env.test"),
      "PLASMO_PUBLIC_APP_ENV=test\nPLASMO_PUBLIC_LOG_LEVEL=info\nPLASMO_PUBLIC_REQUEST_TIMEOUT_MS=10000\n"
    )

    await expect(validateProject(root)).rejects.toThrow(/API_BASE_URL is required/)
  })

  test("rejects hidden environment overrides and undeclared public browser values", async () => {
    const localOverrideRoot = await seedTemplateRoot()
    await initializeProject(options(localOverrideRoot, "web"))
    await writeFile(
      path.join(localOverrideRoot, ".env.production.local"),
      "VITE_API_BASE_URL=https://shadow.example.com\n"
    )
    await expect(validateProject(localOverrideRoot)).rejects.toThrow(
      /can silently override the governed profiles/
    )

    const publicSecretRoot = await seedTemplateRoot()
    await initializeProject(options(publicSecretRoot, "extension"))
    const environmentPath = path.join(publicSecretRoot, ".env.test")
    const environment = await readFile(environmentPath, "utf8")
    await writeFile(environmentPath, `${environment}PLASMO_PUBLIC_API_TOKEN=do-not-ship\n`)
    await expect(validateProject(publicSecretRoot)).rejects.toThrow(
      /undeclared public configuration: PLASMO_PUBLIC_API_TOKEN/
    )

    const processOverrideRoot = await seedTemplateRoot()
    await initializeProject(options(processOverrideRoot, "web"))
    process.env.VITE_PRIVATE_TOKEN = "do-not-ship"
    try {
      await expect(validateEnvironmentFiles(processOverrideRoot, "release")).rejects.toThrow(
        /process environment contains undeclared public configuration: VITE_PRIVATE_TOKEN/
      )
    } finally {
      delete process.env.VITE_PRIVATE_TOKEN
    }
  })

  test("inspects release artifacts for profile leakage and source-only information", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const artifactRoot = path.join(root, "dist")
    await mkdir(artifactRoot)
    await writeFile(
      path.join(artifactRoot, "index.html"),
      `<!doctype html><p>${TEST_BASE_URLS.releaseBaseUrl}</p><a href="https://public.example.com/home/user">Public route</a><script>console.warn("kept");console.error("kept")</script>\n`
    )
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({
      artifactRoot: "dist",
      files: 1
    })

    await writeFile(
      path.join(artifactRoot, "index.html"),
      `<!doctype html><p>${TEST_BASE_URLS.developmentBaseUrl}</p>\n`
    )
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/non-release API BaseURL/)

    for (const method of ["debug", "info"] as const) {
      await writeFile(
        path.join(artifactRoot, "index.html"),
        `<!doctype html><script>console.${method}("must not ship")</script>\n`
      )
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(new RegExp(`console\\.${method}`))
    }
  })

  test("rejects drift from the release-safe structured logging contract", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const loggerPath = path.join(root, "src/observability/logger.ts")
    const logger = await readFile(loggerPath, "utf8")
    await writeFile(loggerPath, logger.replaceAll("SENSITIVE_KEY", "UNSAFE_KEY"))

    await expect(validateProject(root)).rejects.toThrow(
      /Structured logger is missing SENSITIVE_KEY/
    )
  })

  test("keeps extension protocol and built identity values as exact gates", async () => {
    const sourceRoot = await seedTemplateRoot()
    await initializeProject(options(sourceRoot, "extension"))
    const sourceManifestPath = path.join(sourceRoot, "package.json")
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8")) as {
      manifest: Record<string, unknown>
    }
    sourceManifest.manifest.manifest_version = 4
    await writeFile(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`)
    await expect(validateProject(sourceRoot)).rejects.toThrow(/manifest_version must equal 3/)

    const builtRoot = await seedTemplateRoot()
    await initializeProject(options(builtRoot, "extension"))
    const artifactRoot = path.join(builtRoot, "build/chrome-mv3-prod")
    await mkdir(artifactRoot, { recursive: true })
    await writeFile(path.join(artifactRoot, "popup.html"), "<!doctype html>\n")
    await writeFile(path.join(artifactRoot, "options.html"), "<!doctype html>\n")
    await writeFile(
      path.join(artifactRoot, "manifest.json"),
      `${JSON.stringify({
        manifest_version: 3,
        name: "Stale name",
        description: "Clip useful pages.",
        version: "0.1.0",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })}\n`
    )
    await expect(validateProject(builtRoot)).rejects.toThrow(/Extension build name is stale/)
  })

  test("keeps identity schemas exact while accepting only tooling at or above its baseline", async () => {
    const toolingRoot = await seedTemplateRoot()
    await initializeProject(options(toolingRoot, "web"))
    const manifestPath = path.join(toolingRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    manifest.devDependencies.typescript = "6.0.2"
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(toolingRoot)).rejects.toThrow(
      /typescript minimum must not be lower than 6\.0\.3/
    )

    const schemaRoot = await seedTemplateRoot()
    await initializeProject(options(schemaRoot, "web"))
    const configPath = path.join(schemaRoot, ".harness/project.json")
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.schemaVersion = 2
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await expect(validateProject(schemaRoot)).rejects.toThrow(/Unsupported project config schema/)
  })

  test("rejects repeat initialization without overwriting the project", async () => {
    const root = await seedTemplateRoot()
    const init = options(root, "web")
    await initializeProject(init)
    await expect(initializeProject(init)).rejects.toThrow(/Refusing to overwrite/)
  })

  test("requires the generated data-access and event-stream knowledge in terminal projects", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "docs/DATA_ACCESS.md"))

    await expect(validateProject(root)).rejects.toThrow(/Missing docs\/DATA_ACCESS\.md/)
  })

  test("rejects every source-only path finalized out of terminal projects", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const sourceOnlyPaths = [
      ".agents/skills/initialize-web-project",
      ".agents/skills/instantiate-project",
      ".agents/skills/manage-project-surfaces",
      ".harness/tooling/init.ts",
      ".harness/tooling/instantiate.ts",
      ".harness/tooling/manifest.ts",
      ".harness/tooling/process.ts",
      ".harness/tooling/prompts.ts",
      ".harness/tooling/templates",
      "scripts/instantiate.ts",
      "scripts/validate-harness.ts",
      "tests/extension-runtime.test.ts",
      "tests/harness-tooling.test.ts",
      "tests/harness-validator.test.ts",
      "tests/initialization-atomicity.test.ts",
      "docs/TS_WEB_TEMPLATE.md",
      "docs/HARNESS_ENGINEERING.md",
      "docs/work_plan",
      "Version.md",
      ".harness/tooling/finalize.ts"
    ] as const
    const sourceOnlyDirectories = new Set([
      ".agents/skills/initialize-web-project",
      ".agents/skills/instantiate-project",
      ".agents/skills/manage-project-surfaces",
      ".harness/tooling/templates",
      "docs/work_plan"
    ])

    for (const relativePath of sourceOnlyPaths) {
      const sourceOnlyPath = path.join(root, relativePath)
      if (sourceOnlyDirectories.has(relativePath)) {
        await mkdir(sourceOnlyPath, { recursive: true })
      } else {
        await mkdir(path.dirname(sourceOnlyPath), { recursive: true })
        await writeFile(sourceOnlyPath, "source Harness residue\n")
      }

      await expect(validateProject(root)).rejects.toThrow(
        `Terminal project retains ${relativePath}`
      )
      await rm(sourceOnlyPath, { recursive: true, force: true })
    }
  })

  test("rejects drift from the shared pagination contract", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(paginationPath, pagination.replaceAll("sessionStorage", "localStorage"))

    await expect(validateProject(root)).rejects.toThrow(/Pagination state must use/)
  })

  test("requires every shared pagination file in Web projects", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "src/pagination/useSessionPagination.ts"))

    await expect(validateProject(root)).rejects.toThrow(
      /Missing src\/pagination\/useSessionPagination\.ts/
    )
  })

  test("rejects a pagination empty-page reconciliation drift", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replace("result.items.length === 0", "result.items.length > 0")
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination contract is missing result\.items\.length === 0/
    )
  })

  test("rejects a missing pagination translation", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const localePath = path.join(root, "src/i18n/locales/en.ts")
    const locale = await readFile(localePath, "utf8")
    await writeFile(
      localePath,
      locale.replace('paginationNext: "Next page",', 'paginationForward: "Next page",')
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination translations are missing paginationNext/
    )
  })

  test("rejects drift from the shared HTTP authentication contract", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const clientPath = path.join(root, "src/api/client/httpClient.ts")
    const client = await readFile(clientPath, "utf8")
    await writeFile(clientPath, client.replace('authToken: "X-AUTH-TOKEN"', 'authToken: "X-Token"'))

    await expect(validateProject(root)).rejects.toThrow(/HTTP client contract is missing/)
  })

  test("rejects drift from the Web file-route and code-splitting contract", async () => {
    const missingPluginRoot = await seedTemplateRoot()
    await initializeProject(options(missingPluginRoot, "web"))
    const manifestPath = path.join(missingPluginRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    delete manifest.devDependencies["@tanstack/router-plugin"]
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(missingPluginRoot)).rejects.toThrow(
      /missing @tanstack\/router-plugin/
    )

    const disabledSplittingRoot = await seedTemplateRoot()
    await initializeProject(options(disabledSplittingRoot, "web"))
    const viteConfigPath = path.join(disabledSplittingRoot, "vite.config.ts")
    const viteConfig = await readFile(viteConfigPath, "utf8")
    await writeFile(
      viteConfigPath,
      viteConfig.replace("autoCodeSplitting: true", "autoCodeSplitting: false")
    )
    await expect(validateProject(disabledSplittingRoot)).rejects.toThrow(/autoCodeSplitting/)
  })

  test("refreshes generated branding deterministically from edited identity", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const configPath = path.join(root, ".harness/project.json")
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.name = "Renamed Aurora"
    config.id = "renamed-aurora"
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

    await refreshBrand(root)
    const first = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    await refreshBrand(root)
    const second = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    const paginationTest = await readFile(
      path.join(root, "src/pagination/pagination.test.tsx"),
      "utf8"
    )
    expect(first.equals(second)).toBe(true)
    expect(await readFile(path.join(root, "index.html"), "utf8")).toContain("Renamed Aurora")
    expect(paginationTest).toContain('import { BRAND } from "../brand"')
    expect(paginationTest).toContain('BRAND.id + ":pagination:v1:orders"')
    expect(paginationTest).not.toContain("aurora-notes:pagination:v1")
  })
})

describe("safe template instantiation", () => {
  test("preflights environment failures before creating the target", async () => {
    const sourceRoot = await seedTemplateRoot()
    const parent = await temporaryDirectory("web-harness-preflight-")
    const invalidTarget = path.join(parent, "invalid-environment")
    const { root: invalidRoot, ...invalidInit } = options(invalidTarget, "web")
    void invalidRoot
    await expect(
      instantiateProject({
        sourceRoot,
        targetRoot: invalidTarget,
        init: {
          ...invalidInit,
          id: "invalid-environment",
          releaseBaseUrl: "http://unsafe.example.com"
        }
      })
    ).rejects.toThrow(/Release API_BASE_URL must use https/)
    await expect(readdir(invalidTarget)).rejects.toThrow()

    await writeFile(path.join(sourceRoot, ".env.local"), "VITE_API_TOKEN=do-not-ship\n")
    const hiddenTarget = path.join(parent, "hidden-environment")
    const { root: hiddenRoot, ...hiddenInit } = options(hiddenTarget, "web")
    void hiddenRoot
    await expect(
      instantiateProject({
        sourceRoot,
        targetRoot: hiddenTarget,
        init: {
          ...hiddenInit,
          id: "hidden-environment"
        }
      })
    ).rejects.toThrow(/generated or forbidden environment \.env\.local/)
    await expect(readdir(hiddenTarget)).rejects.toThrow()
  })

  test("copies a clean template into a governed terminal project", async () => {
    const parent = await temporaryDirectory("web-harness-copy-")
    const targetRoot = path.join(parent, "terminal-project")
    await instantiateProject({
      sourceRoot: repositoryRoot,
      targetRoot,
      init: {
        projectType: "web",
        name: "Terminal Project",
        id: "terminal-project",
        description: "A terminal Web application.",
        brandColor: "#4C6EF5",
        ...TEST_BASE_URLS,
        skipInstall: true,
        skipGit: true
      }
    })

    const skillEntries = await readdir(path.join(targetRoot, ".agents/skills"), {
      withFileTypes: true
    })
    const skills = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    expect(skills).toHaveLength(12)
    expect(skills).not.toContain("initialize-web-project")
    expect(skills).not.toContain("instantiate-project")
    expect(skills).not.toContain("manage-project-surfaces")

    const manifest = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.harness).toContain(".harness/tooling/cli.ts")
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    expect(manifest.scripts).not.toHaveProperty("validate:harness")
    await expect(
      readFile(path.join(targetRoot, ".harness/tooling/manifest.ts"), "utf8")
    ).rejects.toThrow()
    await expect(
      readFile(path.join(targetRoot, "tests/extension-runtime.test.ts"), "utf8")
    ).rejects.toThrow()
    for (const retainedTest of ["tests/release-inspection.test.ts", "tests/version.test.ts"]) {
      await expect(readFile(path.join(targetRoot, retainedTest), "utf8")).resolves.toContain(
        "test("
      )
    }
    const downstreamAgents = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8")
    expect(downstreamAgents).toContain("## Retained Skill map")
    expect(downstreamAgents).toContain("docs/DATA_ACCESS.md")
    expect(downstreamAgents).toContain("multi-source event streams, or RxJS")
    expect(downstreamAgents).toContain("`src/routes/`")
    expect(downstreamAgents).toContain("`src/api/client/`")
    expect(downstreamAgents).toContain("`src/pagination/`")
    const downstreamReadme = await readFile(path.join(targetRoot, "README.md"), "utf8")
    expect(downstreamReadme).toContain("React, Vite, Mantine")
    expect(downstreamReadme).toContain("native Fetch and pagination foundations")
    expect(downstreamReadme).toContain("pnpm routes:generate")
    const downstreamDocsReadme = await readFile(path.join(targetRoot, "docs/README.md"), "utf8")
    expect(downstreamDocsReadme).toContain("DATA_ACCESS.md")
    expect(downstreamDocsReadme).toContain("RxJS")
    expect(downstreamDocsReadme).toContain("RUNTIME_CONFIGURATION.md")
    expect(downstreamDocsReadme).toContain("LOGGING.md")

    const terminalDocs = [
      "README.md",
      "AGENTS.md",
      "docs/README.md",
      "docs/AGENT_POLICY.md",
      "docs/DATA_ACCESS.md",
      "docs/ENGINEERING_RULES.md",
      "docs/LOGGING.md",
      "docs/RELEASE.md",
      "docs/RUNTIME_CONFIGURATION.md",
      "docs/TECH_DEBT.md"
    ]
    for (const relativePath of terminalDocs) {
      const contents = await readFile(path.join(targetRoot, relativePath), "utf8")
      expect(contents).not.toContain("pnpm instantiate")
      expect(contents).not.toContain("pnpm harness:init")
      expect(contents).not.toContain("Bifang Web Harness Template")
    }
    for (const removedDoc of [
      "Version.md",
      "docs/TS_WEB_TEMPLATE.md",
      "docs/HARNESS_ENGINEERING.md"
    ]) {
      await expect(readFile(path.join(targetRoot, removedDoc), "utf8")).rejects.toThrow()
    }
    await expect(readdir(path.join(targetRoot, "docs/work_plan"))).rejects.toThrow()

    const sourceLicense = await readFile(path.join(repositoryRoot, "LICENSE.en.md"), "utf8")
    const expectedLicense = sourceLicense.replace(
      "Applicable Project Name: Bifang Web Harness Template.",
      "Applicable Project Name: Terminal Project."
    )
    expect(await readFile(path.join(targetRoot, "LICENSE.en.md"), "utf8")).toBe(expectedLicense)
  })

  test("rejects a non-empty target", async () => {
    const parent = await temporaryDirectory("web-harness-target-")
    const targetRoot = path.join(parent, "aurora-notes")
    await mkdir(targetRoot)
    await writeFile(path.join(targetRoot, "keep.txt"), "user data")
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot,
        init: {
          projectType: "web",
          name: "Aurora Notes",
          id: "aurora-notes",
          description: "A focused notes workspace.",
          brandColor: "#5B5BD6",
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/must be empty/)
    expect(await readFile(path.join(targetRoot, "keep.txt"), "utf8")).toBe("user data")
  })

  test("requires target basename to match id and rejects symlink targets", async () => {
    const parent = await temporaryDirectory("web-harness-path-")
    const wrongTarget = path.join(parent, "wrong-name")
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot: wrongTarget,
        init: {
          projectType: "web",
          name: "Right Name",
          id: "right-name",
          description: "A safe project",
          brandColor: "#4C6EF5",
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/must exactly match project id/)

    const realTarget = path.join(parent, "real-target")
    const linkTarget = path.join(parent, "linked-project")
    await mkdir(realTarget)
    await symlink(realTarget, linkTarget)
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot: linkTarget,
        init: {
          projectType: "web",
          name: "Linked Project",
          id: "linked-project",
          description: "Must be rejected",
          brandColor: "#4C6EF5",
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/symbolic link/)
  })
})
