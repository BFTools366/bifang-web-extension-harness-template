import { describe, test } from "vitest"
import {
  HARNESS_ONLY_PATHS,
  PAGINATION_I18N_KEYS,
  TEST_BASE_URLS,
  expect,
  expectOptionalIntegrationPackagesNotInstalled,
  format,
  initializeProject,
  options,
  path,
  readFile,
  readdir,
  resolveConfig,
  seedTemplateRoot,
  sharp
} from "./harness-tooling-support.ts"

/** 验证 terminal Web initialization 的完整回归场景。 */
describe("terminal Web initialization", () => {
  /** 验证 creates a terminal Web project with synchronized identity and scaled assets 场景。 */
  test("creates a terminal Web project with synchronized identity and scaled assets", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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
    const httpClient = await readFile(path.join(root, "src/data/api/client/httpClient.ts"), "utf8")
    const httpContracts = await readFile(
      path.join(root, "src/data/api/client/httpContracts.ts"),
      "utf8"
    )
    const apiBoundary = await readFile(path.join(root, "src/data/api/README.md"), "utf8")
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8")
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    const mantineUiGuidelines = await readFile(
      path.join(root, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
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
    const providers = await readFile(path.join(root, "src/app/AppProviders.tsx"), "utf8")
    const theme = await readFile(path.join(root, "src/app/theme.ts"), "utf8")
    const colorSchemeControl = await readFile(
      path.join(root, "src/theme/ColorSchemeControl.tsx"),
      "utf8"
    )
    const brandScale = await readFile(path.join(root, "src/theme/brandScale.ts"), "utf8")
    const styles = await readFile(path.join(root, "src/styles.css"), "utf8")
    const main = await readFile(path.join(root, "src/main.tsx"), "utf8")
    // 核对真实 Web 根入口绑定安全的 React 错误上报，而非只生成未消费文件。
    const reactRoot = await readFile(path.join(root, "src/observability/reactRoot.ts"), "utf8")
    const buildVersion = await readFile(path.join(root, "src/buildVersion.ts"), "utf8")
    const buildTooling = await readFile(path.join(root, ".harness/tooling/build.ts"), "utf8")
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    const terminalConfig = await readFile(path.join(root, ".harness/tooling/config.ts"), "utf8")
    // 保存 webRouteEntries 变量，锁定中性 Web 不继承桌面赞助页或关于页。
    const webRouteEntries = (await readdir(path.join(root, "src/routes"))).sort()
    expect(index).toContain("<title>Aurora Notes</title>")
    expect(index).toContain('content="A focused notes workspace."')
    expect(index).toContain('content="#5B5BD6"')
    expect(landing).toContain('t("projectDescription")')
    expect(landing).toContain("BUILD_VERSION")
    expect(landing).toContain("useState(0)")
    expect(landing).toContain('role="status"')
    expect(landing).not.toContain("useAtom")
    await expect(
      readFile(path.join(root, "src/features/welcome/welcomeCount.atom.ts"), "utf8")
    ).rejects.toThrow()
    expect(englishLocale).toContain('buildVersion: "Build version: {{version}}"')
    expect(chineseLocale).toContain('buildVersion: "构建版本：{{version}}"')
    expect(buildVersion).toContain("import.meta.env.VITE_BUILD_VERSION")
    expect(buildTooling).toContain('args: ["test"]')
    expect(buildTooling).toContain("本次构建完成后是否启用 E2E 测试")
    expect(buildTooling).toContain("HARNESS_BUILD_VERSION")
    expect(buildTooling).toContain("VITE_BUILD_VERSION")
    expect(buildTooling).toContain("YYMMDDHHMMSS")
    expect(buildTooling).not.toContain("readExtensionBuildVersion")
    expect(buildTooling).not.toContain("PLASMO_PUBLIC_BUILD_VERSION")
    expect(indexRoute).toContain('createFileRoute("/")')
    expect(indexRoute).toContain("WelcomePage")
    expect(rootRoute).toContain("createRootRoute")
    expect(main).toContain("createRoot(root, reactRootErrorHandlers)")
    expect(reactRoot).toContain("onCaughtError")
    expect(reactRoot).toContain("onUncaughtError")
    expect(reactRoot).toContain("onRecoverableError")
    expect(webRouteEntries).toEqual(["__root.tsx", "index.tsx"])
    expect(router).toContain('from "../routeTree.gen"')
    expect(router).toContain("...routeStateDefaults")
    const routeState = await readFile(
      path.join(root, "src/features/route-state/RouteState.tsx"),
      "utf8"
    )
    const routeStateTest = await readFile(
      path.join(root, "src/features/route-state/RouteState.test.tsx"),
      "utf8"
    )
    expect(routeState).toContain("defaultPendingComponent: RoutePendingPage")
    expect(routeState).toContain("defaultErrorComponent: RouteErrorPage")
    expect(routeState).toContain("router.invalidate({ sync: true })")
    expect(routeStateTest).toContain("createMemoryHistory")
    expect(englishLocale).toContain('routeRetry: "Retry page"')
    expect(chineseLocale).toContain('routeRetry: "重新加载页面"')
    expect(styles).toContain("overflow-wrap: anywhere")
    expect(mantineUiGuidelines).toContain("### 8.3 页面标题、焦点与滚动")
    expect(dataAccess).toContain("### 2.6 Query 重试、mutation 与缓存生命周期")
    expect(viteConfig).toContain("@tanstack/router-plugin/vite")
    expect(viteConfig.indexOf("tanstackRouter(")).toBeLessThan(viteConfig.indexOf("react()"))
    expect(viteConfig).toContain("autoCodeSplitting: true")
    expect(viteConfig).toContain('routeFileIgnorePattern: "\\\\.(test|spec)\\\\.[cm]?[jt]sx?$"')
    expect(viteConfig).toContain('manualPureFunctions: ["console.debug", "console.info"]')
    expect(viteConfig).toContain('mode === "production"')
    expect(viteConfig).toContain("rolldownOptions")
    expect(viteConfig).not.toContain("esbuild:")
    expect(viteConfig).toContain("sourcemap: false")
    expect(apiBoundary).toContain("不增加占位请求")
    expect(apiBoundary).toContain("TanStack Query 负责 REST/GraphQL 缓存查询")
    expect(apiBoundary).toContain("缓存已解析校验的领域数据")
    expect(gitignore.split(/\r?\n/)).toContain("src/routeTree.gen.ts")
    await expect(readFile(path.join(root, "src/routeTree.gen.ts"), "utf8")).rejects.toThrow()
    expect(i18n).toContain("initializeLanguage")
    expect(i18n).toContain('fallbackLng: "en"')
    expect(i18n).toContain("zh: { translation: zh }")
    for (const key of PAGINATION_I18N_KEYS) {
      expect(englishLocale).toContain(`${key}:`)
      expect(chineseLocale).toContain(`${key}:`)
    }
    expect(language).toContain('getWebStorage("local")')
    expect(language).toContain("changeApplicationLanguage")
    expect(language).toContain("getRequestLanguage")
    expect(language).toContain("document.documentElement")
    expect(httpContracts).toContain('"X-Http-Request"')
    expect(httpContracts).toContain('"X-Lang"')
    expect(httpContracts).toContain('"X-AUTH-TOKEN"')
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
    expect(dataAccess).toContain("### 2.5 React Web 路由列表契约")
    expect(dataAccess).toContain("$web-implement-list-view")
    expect(dataAccess).not.toContain("由源 Harness")
    expect(engineeringRules).toContain("RxJS 只在多来源或复杂时序需求出现时")
    expect(engineeringRules).toContain("src/routeTree.gen.ts")
    expect(engineeringRules).toContain("route 级自动拆包")
    expect(engineeringRules).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(mantineUiGuidelines).toContain("## 3. 主题与设计令牌")
    expect(mantineUiGuidelines).toContain("### 5.4 React Web 重复记录视图")
    expect(mantineUiGuidelines).toContain("$web-implement-list-view")
    expect(mantineUiGuidelines).toContain("## 8. Web 宿主规范")
    expect(mantineUiGuidelines).not.toContain("## 9. Extension 宿主规范")
    expect(mantineUiGuidelines).toContain('Container size="lg/xl"')
    expect(mantineUiGuidelines).not.toContain("Popup")
    // 独立 Options 界面不可泄漏，路由属性 activeOptions 不属于扩展宿主。
    expect(mantineUiGuidelines).not.toMatch(/\bOptions\b/u)
    expect(mantineUiGuidelines).not.toContain("src/providers.tsx")
    expect(mantineUiGuidelines).not.toContain("MV3/CSP")
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
    expect(pagination).toContain('getWebStorage("session")')
    expect(pagination).toContain("BRAND.id")
    expect(pagination).toContain("requestedPageSize")
    expect(pagination).toContain("isPlaceholderData")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(paginationControls).toContain("labels")
    expect(queryClient).toContain('logger.error("query_failed"')
    expect(providers).toContain('defaultColorScheme="auto"')
    expect(providers).toContain("data/storage/colorScheme")
    expect(await readFile(path.join(root, "src/data/storage/colorScheme.ts"), "utf8")).toContain(
      'key: BRAND.id + ":color-scheme:v1"'
    )
    expect(providers).not.toContain("JotaiProvider")
    expect(theme).toContain("createBrandScale(BRAND.primaryColor)")
    expect(theme).toContain("luminanceThreshold: BRAND_TEXT_LUMINANCE_THRESHOLD")
    expect(theme).toContain("fontFamily")
    expect(brandScale).toContain("MantineColorsTuple")
    expect(brandScale).toContain("BRAND_TEXT_LUMINANCE_THRESHOLD = 0.179")
    expect(colorSchemeControl).toContain('value: "dark"')
    expect(landing).toContain("<ColorSchemeControl />")
    expect(styles).toContain('data-mantine-color-scheme="dark"')
    expect(styles).toContain("color-scheme: dark")
    expect(styles).toContain("var(--mantine-color-body)")
    expect(styles).toContain("var(--mantine-spacing-xl)")
    expect(styles).not.toContain("font-family")
    expect(landing).not.toContain('shadow="lg"')
    expect(main).toContain('logger.error("unhandled_rejection"')
    expect(main).toContain('import.meta.env.VITE_APP_ENV !== "release"')
    expect(main).not.toContain("IS_RELEASE_BUILD")
    expect(tsconfig.include).not.toContain(".plasmo/index.d.ts")
    expect(terminalConfig).toContain("export const HARNESS_ONLY_PATHS")
    for (const sourceOnlyPath of HARNESS_ONLY_PATHS) {
      expect(terminalConfig).toContain(JSON.stringify(sourceOnlyPath))
    }

    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      engines: Record<string, string>
    }
    expect(manifest.engines).toEqual({ node: ">=24.0.0", pnpm: ">=12.8.1" })
    expect(manifest.dependencies).toHaveProperty("@mantine/core", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@mantine/hooks", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-query", "5.104.0")
    expect(manifest.dependencies).toHaveProperty("ky", "2.1.0")
    expect(manifest.devDependencies).not.toHaveProperty("ky")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-router")
    expect(manifest.devDependencies).toHaveProperty("@tanstack/router-cli", "1.167.39")
    expect(manifest.devDependencies).toHaveProperty("@tanstack/router-plugin", "1.168.41")
    expect(manifest.scripts["routes:generate"]).toBe("tsr generate")
    expect(manifest.scripts["env:validate"]).toBe("tsx .harness/tooling/environment.ts validate")
    expect(manifest.scripts.build).toBe("pnpm build:release")
    expect(manifest.scripts["release:inspect"]).toBe("tsx .harness/tooling/release.ts inspect")
    expect(manifest.scripts["source-size:check"]).toBe(
      "tsx .harness/tooling/source-size-policy.ts check"
    )
    expect(manifest.scripts.lint).toBe("eslint . && pnpm comments:check && pnpm source-size:check")
    expect(manifest.scripts).not.toHaveProperty("build:development")
    expect(manifest.scripts).not.toHaveProperty("build:test")
    expect(manifest.scripts["build:release"]).toBe("tsx .harness/tooling/build.ts build")
    expect(Object.values(manifest.scripts).join("\n")).not.toContain("env:validate -- --profile")
    expect(manifest.scripts.typecheck).toContain("pnpm routes:generate")
    expect(manifest.scripts.test).toBe("pnpm routes:generate && vitest run")
    expect(manifest.scripts["test:related"]).toBe("pnpm routes:generate && vitest related --run")
    const webInstalledPackages = { ...manifest.dependencies, ...manifest.devDependencies }
    expect(webInstalledPackages).not.toHaveProperty("@dnd-kit/core")
    expect(webInstalledPackages).not.toHaveProperty("@dnd-kit/sortable")
    expect(webInstalledPackages).not.toHaveProperty("@tabler/icons-react")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    await expect(readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")).rejects.toThrow()
    await expect(readFile(path.join(root, "scripts/instantiate.ts"), "utf8")).rejects.toThrow()
    const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
    // 保存 formattedPaths 变量覆盖 TypeScript 与 Markdown 动态输出。
    const formattedPaths = ["src/i18n/language.ts", "docs/RUNTIME_CONFIGURATION.md"]
    for (const relativePath of formattedPaths) {
      const absolutePath = path.join(root, relativePath)
      const source = await readFile(absolutePath, "utf8")
      expect(await format(source, { ...prettierConfig, filepath: absolutePath })).toBe(source)
    }
    expect(await readFile(path.join(root, "LICENSE.en.md"), "utf8")).toBe(
      "Applicable Project Name: Aurora Notes. Preserve everything else.\n"
    )
  })
})
