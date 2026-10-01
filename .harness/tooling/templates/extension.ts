import { renderIdentityBrand, extensionIdentityFiles } from "../identity.ts"
import type { EnvironmentBaseUrls, ProjectConfig } from "../types.ts"
import { environmentFiles } from "./environment.ts"
import { httpFiles } from "./http.ts"
import { HTTP_ERROR_TRANSLATIONS } from "./http-errors.ts"
import { loggingFiles } from "./logging.ts"
import { paginationFiles } from "./pagination.ts"
import { themeFiles } from "./theme.ts"

// 执行 renderExtensionBrand 函数的处理逻辑。
export function renderExtensionBrand(config: ProjectConfig): string {
  return renderIdentityBrand(config)
}

// 保存 entryStyles 变量供当前逻辑使用。
const entryStyles = `import "@mantine/core/styles.css"
import "./style.css"
import "./i18n"
`

// 执行 extensionFiles 函数的处理逻辑。
export function extensionFiles(
  config: ProjectConfig,
  baseUrls: EnvironmentBaseUrls
): Map<string, string> {
  return new Map<string, string>([
    ...environmentFiles(config, baseUrls),
    ...extensionIdentityFiles(config),
    ...httpFiles(config),
    ...loggingFiles(config.projectType),
    ...paginationFiles(config),
    ...themeFiles(),
    ["src/brand.ts", renderExtensionBrand(config)],
    [
      "src/plasmo.d.ts",
      `declare module "data-base64:../assets/icon.png" {
  const value: string
  export default value
}

declare module "*.css"

declare namespace NodeJS {
  /** 说明 ProcessEnv 的稳定结构与职责边界。 */
  interface ProcessEnv {
    PLASMO_PUBLIC_APP_ENV?: "development" | "test" | "release"
    PLASMO_PUBLIC_API_BASE_URL?: string
    PLASMO_PUBLIC_BUILD_VERSION?: string
    PLASMO_PUBLIC_LOG_LEVEL?: "debug" | "info" | "warn" | "error"
    PLASMO_PUBLIC_REQUEST_TIMEOUT_MS?: string
  }
}
`
    ],
    [
      "src/buildVersion.ts",
      `export const BUILD_VERSION = process.env.PLASMO_PUBLIC_BUILD_VERSION ?? "development"
`
    ],
    [
      "src/i18n.ts",
      `import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { initialApplicationLanguage, initializeLanguage } from "./i18n/language"
import { BRAND } from "./brand"

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: initialApplicationLanguage(),
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        ...BRAND.identity.en,
        ...${JSON.stringify(HTTP_ERROR_TRANSLATIONS.en)},
        popupReady: "Browser extension ready",
        optionsReady: "Extension settings",
        action: "Test local state",
        buildVersion: "Build version: {{version}}",
        count: "Interaction count: {{count}}",
        colorSchemeLabel: "Appearance",
        colorSchemeAuto: "System",
        colorSchemeLight: "Light",
        colorSchemeDark: "Dark",
        paginationNavigation: "Pagination",
        paginationPage: "Page {{page}}",
        paginationPrevious: "Previous page",
        paginationNext: "Next page",
        paginationPageSize: "Items per page",
        unexpectedError: "The extension surface could not start. Please reopen it."
      }
    },
    zh: {
      translation: {
        ...BRAND.identity.zh,
        ...${JSON.stringify(HTTP_ERROR_TRANSLATIONS.zh)},
        popupReady: "浏览器扩展已就绪",
        optionsReady: "扩展设置",
        action: "测试本地状态",
        buildVersion: "构建版本：{{version}}",
        count: "交互次数：{{count}}",
        colorSchemeLabel: "外观",
        colorSchemeAuto: "跟随系统",
        colorSchemeLight: "亮色",
        colorSchemeDark: "暗色",
        paginationNavigation: "分页",
        paginationPage: "第 {{page}} 页",
        paginationPrevious: "上一页",
        paginationNext: "下一页",
        paginationPageSize: "每页条数",
        unexpectedError: "扩展页面无法启动，请重新打开。"
      }
    }
  }
})

initializeLanguage(i18n)

export default i18n
`
    ],
    [
      "src/providers.tsx",
      `import type { PropsWithChildren } from "react"
import { MantineProvider, createTheme, localStorageColorSchemeManager } from "@mantine/core"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BRAND } from "./brand"
import { createLogger } from "./observability/logger"
import { HttpFeedback } from "./api/client/HttpErrorView"
import { reportHttpError } from "./api/client/httpFeedback"
import { retryHttpQuery } from "./api/client/httpErrors"
import { BRAND_TEXT_LUMINANCE_THRESHOLD, createBrandScale } from "./theme/brandScale"

const theme = createTheme({
  colors: { brand: createBrandScale(BRAND.primaryColor) },
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: BRAND_TEXT_LUMINANCE_THRESHOLD,
  focusRing: "auto",
  respectReducedMotion: true,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  headings: { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }
})
const colorSchemeManager = localStorageColorSchemeManager({
  key: BRAND.id + ":color-scheme:v1"
})
const logger = createLogger("query")
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryHttpQuery }, mutations: { retry: false } },
  queryCache: new QueryCache({
    onError: (error) => { logger.error("query_failed", { component: "tanstack-query", error }); reportHttpError(error) }
  }),
  mutationCache: new MutationCache({
    onError: (error) => { logger.error("mutation_failed", { component: "tanstack-query", error }); reportHttpError(error) }
  })
})

/** 说明 Providers 的稳定结构与职责边界。 */
export function Providers({ children }: PropsWithChildren) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}>
      <QueryClientProvider client={queryClient}><HttpFeedback />{children}</QueryClientProvider>
    </MantineProvider>
  )
}
`
    ],
    [
      "src/ExtensionShell.tsx",
      `import { Badge, Button, Group, Image, Paper, Stack, Text, Title } from "@mantine/core"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { BUILD_VERSION } from "./buildVersion"
import { createLogger } from "./observability/logger"
import { ColorSchemeControl } from "./theme/ColorSchemeControl"

/** 说明 ExtensionShellProps 的稳定结构与职责边界。 */
interface ExtensionShellProps {
  iconUrl: string
  surface: "popup" | "options"
}

/** 说明 ExtensionShell 的稳定结构与职责边界。 */
export function ExtensionShell({ iconUrl, surface }: ExtensionShellProps) {
  const { t } = useTranslation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const logger = createLogger("surface." + surface)
    const handleError = (event: ErrorEvent) => {
      logger.error("window_error", { error: event.error ?? event.message, surface })
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      logger.error("unhandled_rejection", { error: event.reason, surface })
    }
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)
    if (process.env.PLASMO_PUBLIC_APP_ENV !== "release") {
      logger.info("surface_started", { surface })
    }
    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [surface])

  return (
    <main className={surface === "popup" ? "popup-shell" : "options-shell"}>
      <Paper radius="lg" p="lg" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Image src={iconUrl} alt={t("projectName")} w={64} h={64} radius="lg" />
            <Stack gap="xs" align="flex-end" miw={0} maw="100%">
              {surface === "popup" ? (
                <Text c="dimmed" size="xs" fw={600}>{t("popupReady")}</Text>
              ) : (
                <Badge variant="default">{t("optionsReady")}</Badge>
              )}
              <ColorSchemeControl compact={surface === "popup"} />
            </Stack>
          </Group>
          <div>
            <Title order={1}>{t("projectName")}</Title>
            <Text c="dimmed" mt="xs">{t("projectDescription")}</Text>
          </div>
          <Button onClick={() => setCount((value) => value + 1)}>{t("action")}</Button>
          <Text size="sm" fw={600} role="status" aria-live="polite" aria-atomic="true">
            {t("count", { count })}
          </Text>
          <Text c="dimmed" size="xs">{t("buildVersion", { version: BUILD_VERSION })}</Text>
        </Stack>
      </Paper>
    </main>
  )
}
`
    ],
    [
      "src/extension-router.tsx",
      `import {
  Outlet,
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router"
import { ExtensionShell } from "./ExtensionShell"
import { ExtensionRouteErrorPage } from "./api/client/ExtensionRouteErrorPage"
import { createLogger } from "./observability/logger"

const routerLogger = createLogger("router")

/** 约束 Extension 路由所属的独立入口。 */
type ExtensionSurface = "popup" | "options"

/** 为 Popup 和 Options 分别创建单入口路由树与历史记录。 */
export function createExtensionRouter(surface: ExtensionSurface, iconUrl: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ExtensionShell iconUrl={iconUrl} surface={surface} />
  })
  return createRouter({
    defaultErrorComponent: ExtensionRouteErrorPage,
    defaultOnCatch: (error) => routerLogger.error("route_failed", { surface, error }),
    routeTree: rootRoute.addChildren([indexRoute]),
    history: surface === "popup"
      ? createMemoryHistory({ initialEntries: ["/"] })
      : createHashHistory()
  })
}

declare module "@tanstack/react-router" {
  /** 绑定 Extension 代码路由工厂的类型注册。 */
  interface Register {
    router: ReturnType<typeof createExtensionRouter>
  }
}
`
    ],
    [
      "src/ExtensionShell.test.tsx",
      `// @vitest-environment jsdom
import "./i18n"
import { render, screen } from "@testing-library/react"
import { RouterProvider } from "@tanstack/react-router"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { BRAND } from "./brand"
import i18n from "./i18n"
import { ExtensionShell } from "./ExtensionShell"
import { createExtensionRouter } from "./extension-router"
import { Providers } from "./providers"

/** 验证当前场景的核心成功或风险边界。 */
test("renders the branded popup interaction", async () => {
  await i18n.changeLanguage("en")
  const user = userEvent.setup()
  /** 说明当前方法的稳定职责与行为边界。 */
  render(
    <Providers><ExtensionShell iconUrl="data:image/png;base64,test" surface="popup" /></Providers>
  )

  expect(screen.getByRole("heading", { name: BRAND.identity.en.projectName, level: 1 })).toBeInTheDocument()
  expect(screen.getByText("Build version: development")).toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 0")
  await user.click(screen.getByRole("heading", { name: BRAND.identity.en.projectName, level: 1 }))
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 0")
  await user.click(screen.getByRole("button", { name: "Test local state" }))
  expect(screen.getByRole("status")).toHaveTextContent("Interaction count: 1")
  await user.selectOptions(screen.getByRole("combobox", { name: "Appearance" }), "dark")
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark")
  expect(localStorage.getItem(BRAND.id + ":color-scheme:v1")).toBe("dark")
})

/** 验证名称与说明遵循用户应用语言而非固定根身份。 */
test("renders localized extension identity", async () => {
  await i18n.changeLanguage("zh")
  const view = render(<Providers><ExtensionShell iconUrl="data:image/png;base64,test" surface="popup" /></Providers>)
  expect(screen.getByRole("heading", { name: BRAND.identity.zh.projectName })).toBeInTheDocument()
  expect(screen.getByText(BRAND.identity.zh.projectDescription, { selector: "p" })).toBeInTheDocument()
  view.unmount()
  await i18n.changeLanguage("en")
})

/** 验证 Popup 与 Options 各自的代码路由可以挂载页面。 */
test("mounts the popup route", async () => {
  await i18n.changeLanguage("en")
  const router = createExtensionRouter("popup", "data:image/png;base64,test")
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByText("Browser extension ready")).toBeInTheDocument()
})

/** 验证 Options 首次打开没有 hash 时仍进入根路由。 */
test("mounts the options route without a hash", async () => {
  await i18n.changeLanguage("en")
  const originalUrl = window.location.href
  window.history.replaceState(null, "", window.location.pathname + window.location.search)
  try {
    const router = createExtensionRouter("options", "data:image/png;base64,test")
    const view = render(<Providers><RouterProvider router={router} /></Providers>)
    expect(await screen.findByText("Extension settings")).toBeInTheDocument()
    expect(router.history.location.pathname).toBe("/")
    view.unmount()
  } finally {
    window.history.replaceState(null, "", originalUrl)
  }
})

/** 验证 Options 导航写入 hash 后新 Router 能从 URL 恢复。 */
test("restores options hash navigation after a reload", async () => {
  const originalUrl = window.location.href
  window.history.replaceState(null, "", window.location.pathname + window.location.search)
  try {
    const router = createExtensionRouter("options", "data:image/png;base64,test")
    const view = render(<Providers><RouterProvider router={router} /></Providers>)
    expect(await screen.findByText("Extension settings")).toBeInTheDocument()
    await router.navigate({ to: "/", hash: "probe" })
    expect(window.location.hash).toContain("probe")
    view.unmount()

    const reloadedRouter = createExtensionRouter("options", "data:image/png;base64,test")
    render(<Providers><RouterProvider router={reloadedRouter} /></Providers>)
    expect(await screen.findByText("Extension settings")).toBeInTheDocument()
    expect(reloadedRouter.history.location.href).toContain("probe")
  } finally {
    window.history.replaceState(null, "", originalUrl)
  }
})
`
    ],
    [
      "src/popup.tsx",
      `${entryStyles}import { RouterProvider } from "@tanstack/react-router"
import iconUrl from "data-base64:../assets/icon.png"
import { AppErrorBoundary } from "./observability/AppErrorBoundary"
import { createExtensionRouter } from "./extension-router"
import { Providers } from "./providers"

const router = createExtensionRouter("popup", iconUrl)

/** 说明 Popup 的稳定结构与职责边界。 */
export default function Popup() {
  return <AppErrorBoundary><Providers><RouterProvider router={router} /></Providers></AppErrorBoundary>
}
`
    ],
    [
      "src/options.tsx",
      `${entryStyles}import { RouterProvider } from "@tanstack/react-router"
import iconUrl from "data-base64:../assets/icon.png"
import { AppErrorBoundary } from "./observability/AppErrorBoundary"
import { createExtensionRouter } from "./extension-router"
import { Providers } from "./providers"

const router = createExtensionRouter("options", iconUrl)

/** 说明 Options 的稳定结构与职责边界。 */
export default function Options() {
  return <AppErrorBoundary><Providers><RouterProvider router={router} /></Providers></AppErrorBoundary>
}
`
    ],
    [
      "src/style.css",
      `:root[data-mantine-color-scheme="light"] { color-scheme: light; }
:root[data-mantine-color-scheme="dark"] { color-scheme: dark; }
body { margin: 0; background: var(--mantine-color-body); color: var(--mantine-color-text); }
.popup-shell { box-sizing: border-box; min-width: 320px; width: min(380px, 100%); padding: var(--mantine-spacing-md); overflow-wrap: anywhere; }
.options-shell { box-sizing: border-box; max-width: 760px; margin: 0 auto; padding: var(--mantine-spacing-xl) var(--mantine-spacing-md); }
`
    ]
  ])
}
