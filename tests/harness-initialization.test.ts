import { describe, test } from "vitest"
import {
  HARNESS_ONLY_PATHS,
  PAGINATION_I18N_KEYS,
  TEST_BASE_URLS,
  expect,
  expectOptionalIntegrationPackagesNotInstalled,
  format,
  initializeProject,
  mkdir,
  options,
  path,
  readFile,
  readdir,
  resolveConfig,
  seedTemplateRoot,
  sharp,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

describe("single-package Harness initialization", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  /** 验证 creates a terminal Web project with synchronized identity and scaled assets 场景。 */
  test("creates a terminal Web project with synchronized identity and scaled assets", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))

    // 保存 master 变量供当前逻辑使用。
    const master = await sharp(path.join(root, ".harness/brand/logo-1024.png")).metadata()
    // 保存 logo 变量供当前逻辑使用。
    const logo = await sharp(path.join(root, "public/logo.png")).metadata()
    // 保存 favicon 变量供当前逻辑使用。
    const favicon = await sharp(path.join(root, "public/favicon.png")).metadata()
    expect([master.width, master.height]).toEqual([1024, 1024])
    expect([logo.width, logo.height]).toEqual([512, 512])
    expect([favicon.width, favicon.height]).toEqual([64, 64])

    // 保存 index 变量供当前逻辑使用。
    const index = await readFile(path.join(root, "index.html"), "utf8")
    // 保存 landing 变量供当前逻辑使用。
    const landing = await readFile(path.join(root, "src/features/welcome/WelcomePage.tsx"), "utf8")
    // 保存 indexRoute 变量供当前逻辑使用。
    const indexRoute = await readFile(path.join(root, "src/routes/index.tsx"), "utf8")
    // 保存 rootRoute 变量供当前逻辑使用。
    const rootRoute = await readFile(path.join(root, "src/routes/__root.tsx"), "utf8")
    // 保存 router 变量供当前逻辑使用。
    const router = await readFile(path.join(root, "src/app/router.tsx"), "utf8")
    // 保存 viteConfig 变量供当前逻辑使用。
    const viteConfig = await readFile(path.join(root, "vite.config.ts"), "utf8")
    // 保存 i18n 变量供当前逻辑使用。
    const i18n = await readFile(path.join(root, "src/i18n/index.ts"), "utf8")
    // 保存 englishLocale 变量供当前逻辑使用。
    const englishLocale = await readFile(path.join(root, "src/i18n/locales/en.ts"), "utf8")
    // 保存 chineseLocale 变量供当前逻辑使用。
    const chineseLocale = await readFile(path.join(root, "src/i18n/locales/zh.ts"), "utf8")
    // 保存 language 变量供当前逻辑使用。
    const language = await readFile(path.join(root, "src/i18n/language.ts"), "utf8")
    // 保存 httpClient 变量供当前逻辑使用。
    const httpClient = await readFile(path.join(root, "src/api/client/httpClient.ts"), "utf8")
    // 保存 apiBoundary 变量供当前逻辑使用。
    const apiBoundary = await readFile(path.join(root, "src/api/README.md"), "utf8")
    // 保存 gitignore 变量供当前逻辑使用。
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8")
    // 保存 dataAccess 变量供当前逻辑使用。
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    // 保存 engineeringRules 变量供当前逻辑使用。
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    // 保存 mantineUiGuidelines 变量供当前逻辑使用。
    const mantineUiGuidelines = await readFile(
      path.join(root, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
    // 保存 developmentEnvironment 变量供当前逻辑使用。
    const developmentEnvironment = await readFile(path.join(root, ".env.development"), "utf8")
    // 保存 testEnvironment 变量供当前逻辑使用。
    const testEnvironment = await readFile(path.join(root, ".env.test"), "utf8")
    // 保存 releaseEnvironment 变量供当前逻辑使用。
    const releaseEnvironment = await readFile(path.join(root, ".env.production"), "utf8")
    // 保存 logger 变量供当前逻辑使用。
    const logger = await readFile(path.join(root, "src/observability/logger.ts"), "utf8")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(
      path.join(root, "src/pagination/useSessionPagination.ts"),
      "utf8"
    )
    // 保存 paginationControls 变量供当前逻辑使用。
    const paginationControls = await readFile(
      path.join(root, "src/pagination/PaginationControls.tsx"),
      "utf8"
    )
    // 保存 queryClient 变量供当前逻辑使用。
    const queryClient = await readFile(path.join(root, "src/app/queryClient.ts"), "utf8")
    // 保存 providers 变量供当前逻辑使用。
    const providers = await readFile(path.join(root, "src/app/AppProviders.tsx"), "utf8")
    // 保存 theme 变量供当前逻辑使用。
    const theme = await readFile(path.join(root, "src/app/theme.ts"), "utf8")
    // 保存 colorSchemeControl 变量供双主题入口断言使用。
    const colorSchemeControl = await readFile(
      path.join(root, "src/theme/ColorSchemeControl.tsx"),
      "utf8"
    )
    // 保存 brandScale 变量供品牌色阶断言使用。
    const brandScale = await readFile(path.join(root, "src/theme/brandScale.ts"), "utf8")
    // 保存 styles 变量供当前逻辑使用。
    const styles = await readFile(path.join(root, "src/styles.css"), "utf8")
    // 保存 main 变量供当前逻辑使用。
    const main = await readFile(path.join(root, "src/main.tsx"), "utf8")
    // 核对真实 Web 根入口绑定安全的 React 错误上报，而非只生成未消费文件。
    const reactRoot = await readFile(path.join(root, "src/observability/reactRoot.ts"), "utf8")
    // 保存 buildVersion 变量供 Web 构建版本契约断言使用。
    const buildVersion = await readFile(path.join(root, "src/buildVersion.ts"), "utf8")
    // 保存 buildTooling 变量供统一构建入口断言使用。
    const buildTooling = await readFile(path.join(root, ".harness/tooling/build.ts"), "utf8")
    // 保存 tsconfig 变量供当前逻辑使用。
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    // 保存 terminalConfig 变量供当前逻辑使用。
    const terminalConfig = await readFile(path.join(root, ".harness/tooling/config.ts"), "utf8")
    // 保存 webRouteEntries 变量，锁定中性 Web 不继承桌面赞助页或关于页。
    const webRouteEntries = (await readdir(path.join(root, "src/routes"))).sort()
    expect(index).toContain("<title>Aurora Notes</title>")
    expect(index).toContain('content="A focused notes workspace."')
    expect(index).toContain('content="#5B5BD6"')
    expect(landing).toContain("BRAND.description")
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
    expect(mantineUiGuidelines).toContain("### 8.2 页面标题、焦点与滚动")
    expect(dataAccess).toContain("### 2.6 Query 重试、mutation 与缓存生命周期")
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
    // 保存 key 变量供当前逻辑使用。
    for (const key of PAGINATION_I18N_KEYS) {
      expect(englishLocale).toContain(`${key}:`)
      expect(chineseLocale).toContain(`${key}:`)
    }
    expect(language).toContain("localStorage")
    expect(language).toContain("changeApplicationLanguage")
    expect(language).toContain("getRequestLanguage")
    expect(language).toContain("document.documentElement")
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
    expect(dataAccess).toContain("### 2.5 React Web 路由列表契约")
    expect(dataAccess).toContain("$web-implement-list-view")
    expect(dataAccess).not.toContain("由源 Harness")
    expect(engineeringRules).toContain("RxJS 只在多来源或复杂时序需求出现时")
    expect(engineeringRules).toContain("src/routeTree.gen.ts")
    expect(engineeringRules).toContain("route 级自动拆包")
    expect(engineeringRules).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(mantineUiGuidelines).toContain("## 3. Theme 与设计令牌")
    expect(mantineUiGuidelines).toContain("### 5.4 React Web 重复记录视图")
    expect(mantineUiGuidelines).toContain("$web-implement-list-view")
    expect(mantineUiGuidelines).toContain("## 8. Web 宿主规范")
    expect(mantineUiGuidelines).not.toContain("## 9. Extension 宿主规范")
    expect(mantineUiGuidelines).toContain('Container size="lg/xl"')
    expect(mantineUiGuidelines).not.toContain("Popup")
    expect(mantineUiGuidelines).not.toContain("Options")
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
    expect(pagination).toContain("sessionStorage")
    expect(pagination).toContain("BRAND.id")
    expect(pagination).toContain("requestedPageSize")
    expect(pagination).toContain("isPlaceholderData")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(paginationControls).toContain("labels")
    expect(queryClient).toContain('logger.error("query_failed"')
    expect(providers).toContain('defaultColorScheme="auto"')
    expect(providers).toContain('key: BRAND.id + ":color-scheme:v1"')
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
    // 保存 sourceOnlyPath 变量供当前逻辑使用。
    for (const sourceOnlyPath of HARNESS_ONLY_PATHS) {
      expect(terminalConfig).toContain(JSON.stringify(sourceOnlyPath))
    }

    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      engines: Record<string, string>
    }
    expect(manifest.engines).toEqual({ node: ">=26.10.0", pnpm: ">=12.8.1" })
    expect(manifest.dependencies).toHaveProperty("@mantine/core", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@mantine/hooks", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-query", "5.104.0")
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
    expect(manifest.scripts.test).toBe("vitest run")
    expect(manifest.scripts["test:related"]).toBe("vitest related --run")
    // 保存 webInstalledPackages 变量供列表页条件依赖不得预装的回归使用。
    const webInstalledPackages = { ...manifest.dependencies, ...manifest.devDependencies }
    expect(webInstalledPackages).not.toHaveProperty("@dnd-kit/core")
    expect(webInstalledPackages).not.toHaveProperty("@dnd-kit/sortable")
    expect(webInstalledPackages).not.toHaveProperty("@tabler/icons-react")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    await expect(readFile(path.join(root, ".harness/tooling/init.ts"), "utf8")).rejects.toThrow()
    await expect(readFile(path.join(root, "scripts/instantiate.ts"), "utf8")).rejects.toThrow()
    // 保存 prettierConfig 变量供动态输出格式回归使用。
    const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
    // 保存 formattedPaths 变量覆盖 TypeScript 与 Markdown 动态输出。
    const formattedPaths = ["src/i18n/language.ts", "docs/RUNTIME_CONFIGURATION.md"]
    // 保存 relativePath 变量供逐文件格式断言使用。
    for (const relativePath of formattedPaths) {
      // 保存 absolutePath 变量供 Prettier parser 选择使用。
      const absolutePath = path.join(root, relativePath)
      // 保存 source 变量供格式稳定性比较使用。
      const source = await readFile(absolutePath, "utf8")
      expect(await format(source, { ...prettierConfig, filepath: absolutePath })).toBe(source)
    }
    expect(await readFile(path.join(root, "LICENSE.en.md"), "utf8")).toBe(
      "Applicable Project Name: Aurora Notes. Preserve everything else.\n"
    )
  })

  /** 验证 creates a terminal Chrome extension with local Router and no unused permissions 场景。 */
  test("creates a terminal Chrome extension with local Router and no unused permissions", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))

    // 保存 icon 变量供当前逻辑使用。
    const icon = await sharp(path.join(root, "assets/icon.png")).metadata()
    expect([icon.width, icon.height]).toEqual([1024, 1024])
    // 保存 popup 变量供当前逻辑使用。
    const popup = await readFile(path.join(root, "src/popup.tsx"), "utf8")
    // 保存 optionsEntry 变量供独立入口路由断言使用。
    const optionsEntry = await readFile(path.join(root, "src/options.tsx"), "utf8")
    // 保存 extensionRouter 变量供路由历史策略断言使用。
    const extensionRouter = await readFile(path.join(root, "src/extension-router.tsx"), "utf8")
    // 保存 extensionBrand 变量供当前逻辑使用。
    const extensionBrand = await readFile(path.join(root, "src/brand.ts"), "utf8")
    // 保存 i18n 变量供当前逻辑使用。
    const i18n = await readFile(path.join(root, "src/i18n.ts"), "utf8")
    // 保存 language 变量供当前逻辑使用。
    const language = await readFile(path.join(root, "src/i18n/language.ts"), "utf8")
    // 保存 httpClient 变量供当前逻辑使用。
    const httpClient = await readFile(path.join(root, "src/api/client/httpClient.ts"), "utf8")
    // 保存 dataAccess 变量供当前逻辑使用。
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    // 保存 engineeringRules 变量供当前逻辑使用。
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    // 保存 releaseRules 变量供 Extension 版本事实断言使用。
    const releaseRules = await readFile(path.join(root, "docs/RELEASE.md"), "utf8")
    // 保存 mantineUiGuidelines 变量供当前逻辑使用。
    const mantineUiGuidelines = await readFile(
      path.join(root, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
    // 保存 developmentEnvironment 变量供当前逻辑使用。
    const developmentEnvironment = await readFile(path.join(root, ".env.development"), "utf8")
    // 保存 releaseEnvironment 变量供当前逻辑使用。
    const releaseEnvironment = await readFile(path.join(root, ".env.production"), "utf8")
    // 保存 extensionShell 变量供当前逻辑使用。
    const extensionShell = await readFile(path.join(root, "src/ExtensionShell.tsx"), "utf8")
    // 保存 buildVersion 变量供 Extension 构建版本契约断言使用。
    const buildVersion = await readFile(path.join(root, "src/buildVersion.ts"), "utf8")
    // 保存 buildTooling 变量供 Extension 单宿主构建断言使用。
    const buildTooling = await readFile(path.join(root, ".harness/tooling/build.ts"), "utf8")
    // 保存 providers 变量供当前逻辑使用。
    const providers = await readFile(path.join(root, "src/providers.tsx"), "utf8")
    // 保存 extensionColorSchemeControl 变量供暗色切换断言使用。
    const extensionColorSchemeControl = await readFile(
      path.join(root, "src/theme/ColorSchemeControl.tsx"),
      "utf8"
    )
    // 保存 logger 变量供当前逻辑使用。
    const logger = await readFile(path.join(root, "src/observability/logger.ts"), "utf8")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(
      path.join(root, "src/pagination/useSessionPagination.ts"),
      "utf8"
    )
    // 保存 paginationControls 变量供当前逻辑使用。
    const paginationControls = await readFile(
      path.join(root, "src/pagination/PaginationControls.tsx"),
      "utf8"
    )
    // 保存 tsconfig 变量供当前逻辑使用。
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    // 保存 extensionStylePath 变量供初始化 CSS 格式稳定性回归使用。
    const extensionStylePath = path.join(root, "src/style.css")
    // 保存 extensionStyle 变量供初始化 CSS 格式稳定性比较使用。
    const extensionStyle = await readFile(extensionStylePath, "utf8")
    // 保存 prettierConfig 变量供初始化 CSS 使用目标仓库正式格式配置。
    const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
    expect(popup).toContain("data-base64:../assets/icon.png")
    expect(popup).toContain('createExtensionRouter("popup", iconUrl)')
    expect(popup).toContain("<RouterProvider router={router} />")
    expect(optionsEntry).toContain('createExtensionRouter("options", iconUrl)')
    expect(extensionRouter).toContain("createMemoryHistory")
    expect(extensionRouter).toContain("createHashHistory")
    expect(extensionBrand).toContain("Aurora Clipper")
    expect(i18n).toContain("initializeLanguage")
    // 保存 key 变量供当前逻辑使用。
    for (const key of PAGINATION_I18N_KEYS) {
      expect(i18n.split(`${key}:`)).toHaveLength(3)
    }
    expect(language).toContain("localStorage")
    expect(language).toContain("document.documentElement")
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
    expect(dataAccess).not.toContain("React Web 路由列表契约")
    expect(dataAccess).not.toContain("$web-implement-list-view")
    expect(engineeringRules).toContain("RxJS 只能编排当前执行上下文内的事件")
    expect(engineeringRules).not.toContain("src/routeTree.gen.ts")
    expect(engineeringRules).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(mantineUiGuidelines).toContain("## 3. Theme 与设计令牌")
    expect(mantineUiGuidelines).not.toContain("React Web 重复记录视图")
    expect(mantineUiGuidelines).toContain("## 8. Extension 宿主规范")
    expect(mantineUiGuidelines).not.toContain("## 8. Web 宿主规范")
    expect(mantineUiGuidelines).toContain("基线最小宽 `320px`")
    expect(mantineUiGuidelines).not.toContain("Landing")
    expect(mantineUiGuidelines).not.toContain("404")
    expect(mantineUiGuidelines).not.toContain("src/app/theme.ts")
    expect(mantineUiGuidelines).toContain("TanStack Router")
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
    expect(extensionShell).toContain("BUILD_VERSION")
    expect(extensionShell).toContain("useState(0)")
    expect(extensionShell).toContain("<Title order={1}>")
    expect(extensionShell).toContain('role="status"')
    expect(extensionShell).not.toContain("useQuery")
    expect(extensionShell).not.toContain("useAtom")
    expect(extensionShell).not.toContain("queryFn: async () => BRAND")
    await expect(readFile(path.join(root, "src/state.ts"), "utf8")).rejects.toThrow()
    expect(i18n).toContain('buildVersion: "Build version: {{version}}"')
    expect(i18n).toContain('buildVersion: "构建版本：{{version}}"')
    expect(buildVersion).toContain("process.env.PLASMO_PUBLIC_BUILD_VERSION")
    expect(buildTooling).toContain("PLASMO_PUBLIC_BUILD_VERSION")
    expect(buildTooling).toContain("readExtensionBuildVersion")
    expect(buildTooling).toContain("stable SemVer X.Y.Z")
    expect(buildTooling).not.toContain("Asia/Shanghai")
    expect(releaseRules).toContain("`package.json.version` 的稳定 SemVer")
    expect(buildTooling).not.toContain("VITE_BUILD_VERSION")
    expect(buildTooling).toContain('args: ["test"]')
    expect(buildTooling).toContain("本次构建完成后是否启用 E2E 测试")
    expect(providers).toContain('logger.error("mutation_failed"')
    expect(providers).toContain('defaultColorScheme="auto"')
    expect(providers).toContain('key: BRAND.id + ":color-scheme:v1"')
    expect(providers).toContain("luminanceThreshold: BRAND_TEXT_LUMINANCE_THRESHOLD")
    expect(providers).toContain("fontFamily")
    expect(providers).not.toContain("JotaiProvider")
    expect(extensionColorSchemeControl).toContain('value: "dark"')
    expect(extensionColorSchemeControl).toContain("<NativeSelect")
    expect(extensionShell).toContain('<ColorSchemeControl compact={surface === "popup"} />')
    expect(logger).toContain(
      'const RELEASE_BUILD = process.env.PLASMO_PUBLIC_APP_ENV === "release"'
    )
    expect(logger).not.toContain("import.meta.env.VITE_APP_ENV")
    expect(pagination).toContain("sessionStorage")
    expect(pagination).toContain("BRAND.id")
    expect(pagination).not.toContain("chrome.storage")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(tsconfig.include[0]).toBe(".plasmo/index.d.ts")
    expect(await format(extensionStyle, { ...prettierConfig, filepath: extensionStylePath })).toBe(
      extensionStyle
    )
    expect(extensionStyle).toContain('data-mantine-color-scheme="dark"')
    expect(extensionStyle).toContain("color-scheme: dark")
    expect(extensionStyle).toContain("var(--mantine-color-body)")
    expect(extensionStyle).toContain("min-width: 320px")
    expect(extensionStyle).toContain("width: min(380px, 100%)")
    expect(extensionStyle).toContain("overflow-wrap: anywhere")
    expect(extensionStyle).toContain("var(--mantine-spacing-md)")
    expect(extensionStyle).not.toContain("font-family")

    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      displayName: string
      manifest: Record<string, unknown>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
      "@parcel/resolver-default": { packageExports: boolean }
    }
    expect(manifest.displayName).toBe("Aurora Clipper")
    expect(manifest.manifest.description).toBe("Clip useful pages.")
    expect(manifest.manifest).not.toHaveProperty("permissions")
    expect(manifest.manifest).not.toHaveProperty("host_permissions")
    expect(manifest.dependencies).toHaveProperty("@mantine/core", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@mantine/hooks", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-query", "5.104.0")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-router")
    expect(manifest["@parcel/resolver-default"]).toEqual({ packageExports: true })
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-cli")
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-plugin")
    expect(manifest).not.toHaveProperty("scripts.routes:generate")
    // 保存 extensionInstalledPackages 变量供 Extension 不继承列表页条件依赖。
    const extensionInstalledPackages = { ...manifest.dependencies, ...manifest.devDependencies }
    expect(extensionInstalledPackages).not.toHaveProperty("@dnd-kit/core")
    expect(extensionInstalledPackages).not.toHaveProperty("@dnd-kit/sortable")
    expect(extensionInstalledPackages).not.toHaveProperty("@tabler/icons-react")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.devDependencies.plasmo).toBe("0.90.5")
    expect(manifest.scripts).not.toHaveProperty("build:development")
    expect(manifest.scripts).not.toHaveProperty("build:test")
    expect(manifest.scripts["test:related"]).toBe("vitest related --run")
    expect(manifest.scripts["build:release"]).toBe("tsx .harness/tooling/build.ts build")
    expect(manifest.scripts.package).toBe("tsx .harness/tooling/build.ts package")
    expect(Object.values(manifest.scripts).join("\n")).not.toContain("env:validate -- --profile")
    // 保存 extensionSkills 变量供终端 Skill 集合与 Web-only Skill 裁剪回归使用。
    const extensionSkills = (
      await readdir(path.join(root, ".agents/skills"), {
        withFileTypes: true
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(extensionSkills).toHaveLength(14)
    expect(extensionSkills).not.toContain("web-implement-list-view")
    await expect(
      readFile(path.join(root, ".agents/skills/web-implement-list-view/SKILL.md"), "utf8")
    ).rejects.toThrow()
    await expect(readFile(path.join(root, "index.html"), "utf8")).rejects.toThrow()
    // 旧构建的版本不能阻断新 SemVer 的预构建校验；产物一致性留给 release:inspect。
    const buildRoot = path.join(root, "build/chrome-mv3-prod")
    await mkdir(buildRoot, { recursive: true })
    await writeFile(path.join(buildRoot, "popup.html"), "<main>Popup</main>\n")
    await writeFile(path.join(buildRoot, "options.html"), "<main>Options</main>\n")
    await writeFile(
      path.join(buildRoot, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Aurora Clipper",
        description: "Clip useful pages.",
        version: "0.0.1",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })
    )
    await expect(validateProject(root)).resolves.toContain("extension")
    // 删除 Parcel 浏览器条件导出时，Harness 必须在构建前阻断。
    const invalidManifest = { ...manifest, "@parcel/resolver-default": { packageExports: false } }
    await writeFile(path.join(root, "package.json"), JSON.stringify(invalidManifest))
    await expect(validateProject(root)).rejects.toThrow(
      "Extension Parcel resolver must enable packageExports"
    )
    await writeFile(path.join(root, "package.json"), JSON.stringify(manifest))
    await writeFile(
      path.join(root, "src/options.tsx"),
      optionsEntry.replaceAll("RouterProvider", "NoRoute")
    )
    await expect(validateProject(root)).rejects.toThrow(
      "Extension options entry must mount its own TanStack Router"
    )
  })

  /** 验证 reuses a preflighted uploaded Logo without reopening its source 场景。 */
  test("reuses a preflighted uploaded Logo without reopening its source", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供预处理 Logo 复用测试使用。
    const root = await seedTemplateRoot()
    // 保存 preparedLogo 变量模拟源 Harness 已完成的单次上传压缩结果。
    const preparedLogo = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 38, g: 70, b: 83, alpha: 1 }
      }
    })
      .png()
      .toBuffer()
    await initializeProject(
      {
        ...options(root, "extension"),
        logoPath: path.join(root, "already-removed-upload.png")
      },
      preparedLogo
    )
    expect(await readFile(path.join(root, ".harness/brand/logo-1024.png"))).toEqual(preparedLogo)
    expect(await readFile(path.join(root, "assets/icon.png"))).toEqual(preparedLogo)
  })
})
