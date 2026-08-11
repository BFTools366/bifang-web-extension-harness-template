import type { EnvironmentBaseUrls, ProjectConfig } from "../types.ts"
import { environmentFiles } from "./environment.ts"
import { escapeHtml, tsString } from "./helpers.ts"
import { httpFiles } from "./http.ts"
import { loggingFiles } from "./logging.ts"
import { paginationFiles } from "./pagination.ts"

export function renderWebIndex(config: ProjectConfig): string {
  const name = escapeHtml(config.name)
  const description = escapeHtml(config.description)
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

export function renderWebBrand(config: ProjectConfig): string {
  return `export const BRAND = {
  name: ${tsString(config.name)},
  id: ${tsString(config.id)},
  description: ${tsString(config.description)},
  primaryColor: ${tsString(config.brand.primaryColor)},
  logoPath: "/logo.png"
} as const
`
}

export function webFiles(
  config: ProjectConfig,
  baseUrls: EnvironmentBaseUrls
): Map<string, string> {
  return new Map<string, string>([
    ...environmentFiles(config, baseUrls),
    ...httpFiles(config),
    ...loggingFiles(config.projectType),
    ...paginationFiles(config),
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

interface ImportMetaEnv {
  readonly VITE_APP_ENV: "development" | "test" | "release"
  readonly VITE_API_BASE_URL: string
  readonly VITE_LOG_LEVEL: "debug" | "info" | "warn" | "error"
  readonly VITE_REQUEST_TIMEOUT_MS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
`
    ],
    [
      "src/api/README.md",
      `# API module boundary

The endpoint-free \`client/httpClient.ts\` foundation owns the governed Fetch, header, timeout, cancellation, error, Token, and unauthorized-handler behavior. Do not bypass it with page-local fetch calls or mutable global headers.

- \`client/\` owns transport concerns such as approved base URLs, dynamic authentication, cancellation, timeouts, and normalized API errors; it does not declare a business endpoint or login URL.
- \`<domain>/\` owns typed endpoint functions, request and response contracts, and runtime boundary validation for one business domain.
- Feature hooks own TanStack Query keys, cache policy, mutations, invalidation, and UI-facing orchestration.
- TanStack Query owns server state. Do not mirror the same remote data into Jotai.
- React components and route files never concatenate arbitrary URLs or depend on transport-library error classes.

Do not add placeholder requests, a second client, or a \`services/\` layer. Follow \`docs/DATA_ACCESS.md\` when the first real API, GraphQL, SSE, or event-stream consumer is introduced.
`
    ],
    [
      "src/i18n/locales/en.ts",
      `export const en = {
  eyebrow: "Harness project ready",
  action: "Test local state",
  count: "Interaction count: {{count}}",
  notFoundTitle: "Page not found",
  notFoundDescription: "The requested page does not exist.",
  backHome: "Back to home",
  paginationNavigation: "Pagination",
  paginationPage: "Page {{page}}",
  paginationPrevious: "Previous page",
  paginationNext: "Next page",
  paginationPageSize: "Items per page",
  unexpectedError: "The application could not start. Please try again."
} as const
`
    ],
    [
      "src/i18n/locales/zh.ts",
      `export const zh = {
  eyebrow: "Harness 项目已就绪",
  action: "测试本地状态",
  count: "交互次数：{{count}}",
  notFoundTitle: "页面不存在",
  notFoundDescription: "你访问的页面不存在。",
  backHome: "返回首页",
  paginationNavigation: "分页",
  paginationPage: "第 {{page}} 页",
  paginationPrevious: "上一页",
  paginationNext: "下一页",
  paginationPageSize: "每页条数",
  unexpectedError: "应用无法启动，请重试。"
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

const logger = createLogger("query")

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => logger.error("query_failed", { component: "tanstack-query", error })
  }),
  mutationCache: new MutationCache({
    onError: (error) => logger.error("mutation_failed", { component: "tanstack-query", error })
  })
})
`
    ],
    [
      "src/app/theme.ts",
      `import { createTheme, type MantineColorsTuple } from "@mantine/core"
import { BRAND } from "../brand"

const brandScale = Array.from(
  { length: 10 },
  () => BRAND.primaryColor
) as unknown as MantineColorsTuple

export const theme = createTheme({
  colors: { brand: brandScale },
  primaryColor: "brand"
})
`
    ],
    [
      "src/app/AppProviders.tsx",
      `import { MantineProvider } from "@mantine/core"
import { QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import type { ReactNode } from "react"
import { queryClient } from "./queryClient"
import { theme } from "./theme"

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
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
      "src/app/router.tsx",
      `import { createRouter } from "@tanstack/react-router"
import { routeTree } from "../routeTree.gen"

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
`
    ],
    [
      "src/features/welcome/welcomeCount.atom.ts",
      `import { atom } from "jotai"

export const welcomeCountAtom = atom(0)
`
    ],
    [
      "src/features/welcome/WelcomePage.tsx",
      `import { Badge, Button, Container, Group, Image, Paper, Stack, Text, Title } from "@mantine/core"
import { useAtom } from "jotai"
import { useTranslation } from "react-i18next"
import { BRAND } from "../../brand"
import { welcomeCountAtom } from "./welcomeCount.atom"

export function WelcomePage() {
  const { t } = useTranslation()
  const [count, setCount] = useAtom(welcomeCountAtom)

  return (
    <main className="page-shell">
      <Container size="sm">
        <Paper className="hero-card" radius="xl" p="xl" shadow="lg">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Image src={BRAND.logoPath} alt={BRAND.name} w={88} h={88} radius="xl" />
              <Badge variant="light" color="brand">
                {t("eyebrow")}
              </Badge>
            </Group>
            <div>
              <Title order={1}>{BRAND.name}</Title>
              <Text c="dimmed" mt="sm" size="lg">
                {BRAND.description}
              </Text>
            </div>
            <Group>
              <Button onClick={() => setCount((value) => value + 1)}>{t("action")}</Button>
              <Text fw={600}>{t("count", { count })}</Text>
            </Group>
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
import { WelcomePage } from "./WelcomePage"

test("renders the branded landing interaction", async () => {
  const user = userEvent.setup()
  render(
    <AppProviders>
      <WelcomePage />
    </AppProviders>
  )

  expect(screen.getByRole("heading", { name: BRAND.name })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Test local state" }))
  expect(screen.getByText("Interaction count: 1")).toBeInTheDocument()
})
`
    ],
    [
      "src/features/not-found/NotFoundPage.tsx",
      `import { Anchor, Container, Paper, Stack, Text, Title } from "@mantine/core"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main className="page-shell">
      <Container size="sm">
        <Paper className="hero-card" radius="xl" p="xl" shadow="lg">
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

createRoot(root).render(
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
      `:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
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
  padding: 3rem 1rem;
  background: radial-gradient(
    circle at top,
    color-mix(in srgb, var(--mantine-color-brand-5) 22%, transparent),
    transparent 55%
  );
}
.hero-card {
  border: 1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5));
}
`
    ]
  ])
}
