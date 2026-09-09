import type { EnvironmentBaseUrls, ProjectConfig } from "../types.ts"
import { environmentFiles } from "./environment.ts"
import { tsString } from "./helpers.ts"
import { httpFiles } from "./http.ts"
import { loggingFiles } from "./logging.ts"
import { paginationFiles } from "./pagination.ts"

// 执行 renderExtensionBrand 函数的处理逻辑。
export function renderExtensionBrand(config: ProjectConfig): string {
  return `/** 保存项目身份与 Extension 品牌展示常量。 */
export const BRAND = {
  name: ${tsString(config.name)},
  id: ${tsString(config.id)},
  description: ${tsString(config.description)},
  primaryColor: ${tsString(config.brand.primaryColor)}
} as const
`
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
    ...httpFiles(config),
    ...loggingFiles(config.projectType),
    ...paginationFiles(config),
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
      "src/state.ts",
      `import { atom } from "jotai"

export const launchCountAtom = atom(0)
`
    ],
    [
      "src/i18n.ts",
      `import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { initialApplicationLanguage, initializeLanguage } from "./i18n/language"

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: initialApplicationLanguage(),
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        popupReady: "Chrome extension ready",
        optionsReady: "Extension settings",
        action: "Test local state",
        buildVersion: "Build version: {{version}}",
        count: "Interaction count: {{count}}",
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
        popupReady: "Chrome 扩展已就绪",
        optionsReady: "扩展设置",
        action: "测试本地状态",
        buildVersion: "构建版本：{{version}}",
        count: "交互次数：{{count}}",
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
import { MantineProvider, createTheme, type MantineColorsTuple } from "@mantine/core"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import { BRAND } from "./brand"
import { createLogger } from "./observability/logger"

const brandScale = Array.from({ length: 10 }, () => BRAND.primaryColor) as unknown as MantineColorsTuple
const theme = createTheme({ colors: { brand: brandScale }, primaryColor: "brand" })
const logger = createLogger("query")
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => logger.error("query_failed", { component: "tanstack-query", error })
  }),
  mutationCache: new MutationCache({
    onError: (error) => logger.error("mutation_failed", { component: "tanstack-query", error })
  })
})

/** 说明 Providers 的稳定结构与职责边界。 */
export function Providers({ children }: PropsWithChildren) {
  return (
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>{children}</JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
`
    ],
    [
      "src/ExtensionShell.tsx",
      `import { Badge, Button, Group, Image, Paper, Stack, Text, Title } from "@mantine/core"
import { useQuery } from "@tanstack/react-query"
import { useAtom } from "jotai"
import { useTranslation } from "react-i18next"
import { useEffect } from "react"
import { BRAND } from "./brand"
import { BUILD_VERSION } from "./buildVersion"
import { createLogger } from "./observability/logger"
import { launchCountAtom } from "./state"

/** 说明 ExtensionShellProps 的稳定结构与职责边界。 */
interface ExtensionShellProps {
  iconUrl: string
  surface: "popup" | "options"
}

/** 说明 ExtensionShell 的稳定结构与职责边界。 */
export function ExtensionShell({ iconUrl, surface }: ExtensionShellProps) {
  const { t } = useTranslation()
  const [count, setCount] = useAtom(launchCountAtom)
  const project = useQuery({
    queryKey: ["extension", BRAND.id],
    queryFn: async () => BRAND,
    staleTime: Number.POSITIVE_INFINITY
  })

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
            <Image src={iconUrl} alt={BRAND.name} w={64} h={64} radius="lg" />
            <Badge color="brand" variant="light">
              {t(surface === "popup" ? "popupReady" : "optionsReady")}
            </Badge>
          </Group>
          <div>
            <Title order={2}>{project.data?.name ?? BRAND.name}</Title>
            <Text c="dimmed" mt="xs">{BRAND.description}</Text>
          </div>
          <Button onClick={() => setCount((value) => value + 1)}>{t("action")}</Button>
          <Text size="sm" fw={600}>{t("count", { count })}</Text>
          <Text c="dimmed" size="xs">{t("buildVersion", { version: BUILD_VERSION })}</Text>
        </Stack>
      </Paper>
    </main>
  )
}
`
    ],
    [
      "src/ExtensionShell.test.tsx",
      `// @vitest-environment jsdom
import "./i18n"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { BRAND } from "./brand"
import { ExtensionShell } from "./ExtensionShell"
import { Providers } from "./providers"

/** 验证当前场景的核心成功或风险边界。 */
test("renders the branded popup interaction", async () => {
  const user = userEvent.setup()
  /** 说明当前方法的稳定职责与行为边界。 */
  render(
    <Providers><ExtensionShell iconUrl="data:image/png;base64,test" surface="popup" /></Providers>
  )

  expect(screen.getByRole("heading", { name: BRAND.name })).toBeInTheDocument()
  expect(screen.getByText("Build version: development")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Test local state" }))
  expect(screen.getByText("Interaction count: 1")).toBeInTheDocument()
})
`
    ],
    [
      "src/popup.tsx",
      `${entryStyles}import iconUrl from "data-base64:../assets/icon.png"
import { ExtensionShell } from "./ExtensionShell"
import { AppErrorBoundary } from "./observability/AppErrorBoundary"
import { Providers } from "./providers"

/** 说明 Popup 的稳定结构与职责边界。 */
export default function Popup() {
  return <AppErrorBoundary><Providers><ExtensionShell iconUrl={iconUrl} surface="popup" /></Providers></AppErrorBoundary>
}
`
    ],
    [
      "src/options.tsx",
      `${entryStyles}import iconUrl from "data-base64:../assets/icon.png"
import { ExtensionShell } from "./ExtensionShell"
import { AppErrorBoundary } from "./observability/AppErrorBoundary"
import { Providers } from "./providers"

/** 说明 Options 的稳定结构与职责边界。 */
export default function Options() {
  return <AppErrorBoundary><Providers><ExtensionShell iconUrl={iconUrl} surface="options" /></Providers></AppErrorBoundary>
}
`
    ],
    [
      "src/style.css",
      `:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; background: light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8)); }
.popup-shell { box-sizing: border-box; width: 380px; padding: 1rem; }
.options-shell { box-sizing: border-box; max-width: 760px; margin: 0 auto; padding: 3rem 1rem; }
`
    ]
  ])
}
