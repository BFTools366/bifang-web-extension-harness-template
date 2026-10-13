import { renderIdentityBrand } from "../identity.ts"
import type { EnvironmentBaseUrls, ProjectConfig, WebCreationType } from "../types.ts"
import { saasClientFiles } from "./saas-client.ts"
import { environmentFiles } from "./environment.ts"
import { escapeHtml } from "./helpers.ts"
import { httpFiles } from "./http.ts"
import { dataFiles } from "./data.ts"
import { HTTP_ERROR_TRANSLATIONS } from "./http-errors.ts"
import { loggingFiles } from "./logging.ts"
import { paginationFiles } from "./pagination.ts"
import { themeFiles } from "./theme.ts"
import { webReactRootFiles } from "./web-react-root.ts"
import { webRouteStateFiles } from "./web-route-state.ts"

// 执行 renderWebIndex 函数的处理逻辑。
export function renderWebIndex(config: ProjectConfig): string {
  // 保存 name 变量供当前逻辑使用。
  const name = escapeHtml(config.name)
  // 保存 description 变量供当前逻辑使用。
  const description = escapeHtml(config.description)
  // 保存 color 变量供当前逻辑使用。
  const color = escapeHtml(config.brand.primaryColor)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="${color}" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

// 执行 renderWebBrand 函数的处理逻辑。
export function renderWebBrand(config: ProjectConfig): string {
  return renderIdentityBrand(config)
}

// 执行 webFiles 函数的处理逻辑。
export function webFiles(
  config: ProjectConfig,
  baseUrls: EnvironmentBaseUrls,
  webType?: WebCreationType
): Map<string, string> {
  const files = new Map<string, string>([
    ...environmentFiles(config, baseUrls),
    ...httpFiles(config),
    ...dataFiles(),
    ...loggingFiles(config.projectType),
    ...paginationFiles(config),
    ...themeFiles(),
    ...webReactRootFiles(),
    ...webRouteStateFiles(),
    ["index.html", renderWebIndex(config)],
    [
      "vite.config.ts",
      `import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePattern: "\\\\.(test|spec)\\\\.[cm]?[jt]sx?$",
      autoCodeSplitting: true
    }),
    react()
  ],
  build: {
    sourcemap: false,
    rolldownOptions: {
      treeshake:
        mode === "production"
          ? { manualPureFunctions: ["console.debug", "console.info"] }
          : undefined
    }
  }
}))
`
    ],
    ["src/brand.ts", renderWebBrand(config)],
    [
      "src/vite-env.d.ts",
      `/// <reference types="vite/client" />

/** 说明 ImportMetaEnv 的稳定结构与职责边界。 */
interface ImportMetaEnv {
  readonly VITE_APP_ENV: "development" | "test" | "release"
  readonly VITE_API_BASE_URL: string
  readonly VITE_BUILD_VERSION?: string
  readonly VITE_LOG_LEVEL: "debug" | "info" | "warn" | "error"
  readonly VITE_REQUEST_TIMEOUT_MS: string
}

/** 说明 ImportMeta 的稳定结构与职责边界。 */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
`
    ],
    [
      "src/buildVersion.ts",
      `export const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION ?? "development"
`
    ],
    [
      "src/i18n/locales/en.ts",
      `import { BRAND } from "../../brand"

export const en = {
  ...BRAND.identity.en,
  ...${JSON.stringify(HTTP_ERROR_TRANSLATIONS.en)},
  eyebrow: "Harness project ready",
  action: "Test local state",
  count: "Interaction count: {{count}}",
  notFoundTitle: "Page not found",
  notFoundDescription: "The requested page does not exist.",
  backHome: "Back to home",
  buildVersion: "Build version: {{version}}",
  colorSchemeLabel: "Appearance",
  colorSchemeAuto: "System",
  colorSchemeLight: "Light",
  colorSchemeDark: "Dark",
  paginationNavigation: "Pagination",
  paginationPage: "Page {{page}}",
  paginationPrevious: "Previous page",
  paginationNext: "Next page",
  paginationPageSize: "Items per page",
  routeLoading: "Loading page…",
  routeErrorTitle: "Unable to open this page",
  routeErrorDescription: "Please retry the page or return home.",
  routeRetry: "Retry page",
  unexpectedError: "The application could not start. Please reopen the page."
} as const
`
    ],
    [
      "src/i18n/locales/zh.ts",
      `import { BRAND } from "../../brand"

export const zh = {
  ...BRAND.identity.zh,
  ...${JSON.stringify(HTTP_ERROR_TRANSLATIONS.zh)},
  eyebrow: "Harness 项目已就绪",
  action: "测试本地状态",
  count: "交互次数：{{count}}",
  notFoundTitle: "页面不存在",
  notFoundDescription: "你访问的页面不存在。",
  backHome: "返回首页",
  buildVersion: "构建版本：{{version}}",
  colorSchemeLabel: "外观",
  colorSchemeAuto: "跟随系统",
  colorSchemeLight: "亮色",
  colorSchemeDark: "暗色",
  paginationNavigation: "分页",
  paginationPage: "第 {{page}} 页",
  paginationPrevious: "上一页",
  paginationNext: "下一页",
  paginationPageSize: "每页条数",
  routeLoading: "正在加载页面…",
  routeErrorTitle: "页面暂时无法打开",
  routeErrorDescription: "请重试加载页面，或返回首页。",
  routeRetry: "重新加载页面",
  unexpectedError: "应用无法启动，请重新打开页面。"
} as const
`
    ],
    [
      "src/i18n/index.ts",
      `import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { initialApplicationLanguage, initializeLanguage } from "./language"
import { en } from "./locales/en"
import { zh } from "./locales/zh"

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: initialApplicationLanguage(),
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: en },
    zh: { translation: zh }
  }
})

initializeLanguage(i18n)

export default i18n
`
    ],
    [
      "src/app/queryClient.ts",
      `import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { createLogger } from "../observability/logger"
import { reportHttpError } from "../data/api/client/httpFeedback"
import { retryHttpQuery } from "../data/api/client/httpErrors"

const logger = createLogger("query")

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryHttpQuery }, mutations: { retry: false } },
  queryCache: new QueryCache({
    onError: (error) => { logger.error("query_failed", { component: "tanstack-query", error }); reportHttpError(error) }
  }),
  mutationCache: new MutationCache({
    onError: (error) => { logger.error("mutation_failed", { component: "tanstack-query", error }); reportHttpError(error) }
  })
})
`
    ],
    [
      "src/app/theme.ts",
      `import { createTheme } from "@mantine/core"
import { BRAND } from "../brand"
import { BRAND_TEXT_LUMINANCE_THRESHOLD, createBrandScale } from "../theme/brandScale"

const SYSTEM_SANS = "ui-sans-serif, system-ui, -apple-system, sans-serif"

export const theme = createTheme({
  colors: { brand: createBrandScale(BRAND.primaryColor) },
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: BRAND_TEXT_LUMINANCE_THRESHOLD,
  focusRing: "auto",
  respectReducedMotion: true,
  black: "#16181d",
  defaultRadius: "md",
  shadows: {
    xs: "0 1px 2px rgba(22, 24, 29, 0.06)",
    sm: "0 2px 8px rgba(22, 24, 29, 0.08)",
    md: "0 8px 24px rgba(22, 24, 29, 0.1)"
  },
  fontFamily: SYSTEM_SANS,
  headings: { fontFamily: SYSTEM_SANS }
})
`
    ],
    [
      "src/app/AppProviders.tsx",
      `import { MantineProvider } from "@mantine/core"
import { QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { colorSchemeManager } from "../data/storage/colorScheme"
import { queryClient } from "./queryClient"
import { HttpFeedback } from "../data/api/client/HttpErrorView"
import { theme } from "./theme"


/** 说明 AppProvidersProps 的稳定结构与职责边界。 */
interface AppProvidersProps {
  children: ReactNode
}

/** 说明 AppProviders 的稳定结构与职责边界。 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}>
      <QueryClientProvider client={queryClient}><HttpFeedback />{children}</QueryClientProvider>
    </MantineProvider>
  )
}
`
    ],
    [
      "src/app/router.tsx",
      `import { createRouter } from "@tanstack/react-router"
import { routeTree } from "../routeTree.gen"
import { routeStateDefaults } from "../features/route-state/RouteState"

export const router = createRouter({ routeTree, ...routeStateDefaults })

declare module "@tanstack/react-router" {
  /** 说明 Register 的稳定结构与职责边界。 */
  interface Register {
    router: typeof router
  }
}
`
    ],
    [
      "src/features/welcome/WelcomePage.tsx",
      `import { Badge, Button, Container, Group, Image, Paper, Stack, Text, Title } from "@mantine/core"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BRAND } from "../../brand"
import { BUILD_VERSION } from "../../buildVersion"
import { ColorSchemeControl } from "../../theme/ColorSchemeControl"

/** 说明 WelcomePage 的稳定结构与职责边界。 */
export function WelcomePage() {
  const { t } = useTranslation()
  const [count, setCount] = useState(0)

  return (
    <main className="page-shell">
      <Container size="sm">
        <Paper radius="lg" p="xl" withBorder>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Image src={BRAND.logoPath} alt={t("projectName")} w={88} h={88} radius="lg" />
              <Stack gap="xs" align="flex-end">
                <Badge variant="default">{t("eyebrow")}</Badge>
                <ColorSchemeControl />
              </Stack>
            </Group>
            <div>
              <Title order={1}>{t("projectName")}</Title>
              <Text c="dimmed" mt="sm" size="lg">
                {t("projectDescription")}
              </Text>
            </div>
            <Group>
              <Button onClick={() => setCount((value) => value + 1)}>{t("action")}</Button>
              <Text fw={600} role="status" aria-live="polite" aria-atomic="true">
                {t("count", { count })}
              </Text>
            </Group>
            <Text c="dimmed" size="xs">
              {t("buildVersion", { version: BUILD_VERSION })}
            </Text>
          </Stack>
        </Paper>
      </Container>
    </main>
  )
}
`
    ],
    [
      "src/features/welcome/WelcomePage.test.tsx",
      `// @vitest-environment jsdom
import "../../i18n"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { AppProviders } from "../../app/AppProviders"
import { BRAND } from "../../brand"
import i18n from "../../i18n"
import { WelcomePage } from "./WelcomePage"

/** 验证当前场景的核心成功或风险边界。 */
test("renders the branded landing interaction", async () => {
  await i18n.changeLanguage("en")
  const user = userEvent.setup()
  /** 说明当前方法的稳定职责与行为边界。 */
  render(
    <AppProviders>
      <WelcomePage />
    </AppProviders>
  )

  expect(screen.getByRole("heading", { name: BRAND.identity.en.projectName, level: 1 })).toBeInTheDocument()
  expect(screen.getByText("Build version: development")).toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 0")
  await user.click(screen.getByRole("heading", { name: BRAND.identity.en.projectName, level: 1 }))
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 0")
  await user.click(screen.getByRole("button", { name: "Test local state" }))
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 1")
  await user.click(screen.getByText("Dark"))
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark")
  expect(localStorage.getItem(BRAND.id + ":color-scheme:v1")).toBe("dark")
})

/** 验证 Web 品牌名称与说明随应用语言切换。 */
test("renders localized web identity", async () => {
  await i18n.changeLanguage("zh")
  const view = render(<AppProviders><WelcomePage /></AppProviders>)
  expect(screen.getByRole("heading", { name: BRAND.identity.zh.projectName })).toBeInTheDocument()
  expect(screen.getByText(BRAND.identity.zh.projectDescription, { selector: "p" })).toBeInTheDocument()
  view.unmount()
  await i18n.changeLanguage("en")
})
`
    ],
    [
      "src/features/not-found/NotFoundPage.tsx",
      `import { Anchor, Container, Paper, Stack, Text, Title } from "@mantine/core"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

/** 说明 NotFoundPage 的稳定结构与职责边界。 */
export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main className="page-shell">
      <Container size="sm">
        <Paper radius="lg" p="xl" withBorder>
          <Stack gap="md">
            <Title order={1}>{t("notFoundTitle")}</Title>
            <Text c="dimmed">{t("notFoundDescription")}</Text>
            <Anchor component={Link} to="/">
              {t("backHome")}
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    </main>
  )
}
`
    ],
    [
      "src/routes/__root.tsx",
      `import { Outlet, createRootRoute } from "@tanstack/react-router"
import { NotFoundPage } from "../features/not-found/NotFoundPage"

/** 说明 Route 的稳定结构与职责边界。 */
export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage
})
`
    ],
    [
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router"
import { WelcomePage } from "../features/welcome/WelcomePage"

/** 说明 Route 的稳定结构与职责边界。 */
export const Route = createFileRoute("/")({
  component: WelcomePage
})
`
    ],
    [
      "src/main.tsx",
      `import "@mantine/core/styles.css"
import "./styles.css"
import "./i18n"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppProviders } from "./app/AppProviders"
import { router } from "./app/router"
import { AppErrorBoundary } from "./observability/AppErrorBoundary"
import { createLogger } from "./observability/logger"
import { reactRootErrorHandlers } from "./observability/reactRoot"

const root = document.getElementById("root")
const logger = createLogger("bootstrap")

const handleWindowError = (event: ErrorEvent) => {
  logger.error("window_error", { error: event.error ?? event.message, surface: "web" })
}
const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  logger.error("unhandled_rejection", { error: event.reason, surface: "web" })
}
window.addEventListener("error", handleWindowError)
window.addEventListener("unhandledrejection", handleUnhandledRejection)
import.meta.hot?.dispose(() => {
  window.removeEventListener("error", handleWindowError)
  window.removeEventListener("unhandledrejection", handleUnhandledRejection)
})

if (root === null) throw new Error("Missing #root element")

if (import.meta.env.VITE_APP_ENV !== "release") {
  logger.info("application_started", { surface: "web" })
}

createRoot(root, reactRootErrorHandlers).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  </StrictMode>
)
`
    ],
    [
      "src/styles.css",
      `:root[data-mantine-color-scheme="light"] {
  color-scheme: light;
}

:root[data-mantine-color-scheme="dark"] {
  color-scheme: dark;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}
.page-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--mantine-spacing-xl) var(--mantine-spacing-md);
  background: var(--mantine-color-body);
  color: var(--mantine-color-text);
  overflow-wrap: anywhere;
}
.page-shell > * {
  min-width: 0;
  max-width: 100%;
}
`
    ]
  ])
  if (webType === "saas-client") {
    files.delete("src/features/welcome/WelcomePage.tsx")
    files.delete("src/features/welcome/WelcomePage.test.tsx")
    for (const [name, contents] of saasClientFiles(files)) files.set(name, contents)
  }
  return files
}
