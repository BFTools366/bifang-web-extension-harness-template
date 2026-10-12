// 生成 Web 的统一路由状态界面及真实 Router 行为回归。
export function webRouteStateFiles(): Map<string, string> {
  return new Map([
    ["src/features/route-state/RouteState.tsx", ROUTE_STATE_SOURCE],
    ["src/features/route-state/RouteState.test.tsx", ROUTE_STATE_TEST]
  ])
}

const ROUTE_STATE_SOURCE = `import { Anchor, Container, Loader, Paper, Stack, Text } from "@mantine/core"
import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { HttpErrorView } from "../../data/api/client/HttpErrorView"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { createLogger } from "../../observability/logger"

const logger = createLogger("router")

/** 呈现慢路由的本地化加载状态，具体数据刷新仍由消费它的 feature 管理。 */
export function RoutePendingPage() {
  const { t } = useTranslation()
  return (
    <main className="page-shell">
      <Container size="sm">
        <Stack align="center" role="status" aria-live="polite" aria-atomic="true">
          <Loader aria-hidden="true" />
          <Text>{t("routeLoading")}</Text>
        </Stack>
      </Container>
    </main>
  )
}

/** 隐藏原始异常，以显式重试恢复路由和 Query 边界，不重放 mutation。 */
export function RouteErrorPage({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { reset } = useQueryErrorResetBoundary()
  const [retrying, setRetrying] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    reset()
    return () => { mounted.current = false }
  }, [reset])

  /** 等待路由重新加载，防止重复点击并避免卸载后更新界面。 */
  async function retry(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setRetrying(true)
    try {
      reset()
      await router.invalidate({ sync: true })
    } catch {
      logger.error("route_retry_failed", { surface: "web", reason: "retry_failed" })
    } finally {
      inFlight.current = false
      if (mounted.current) setRetrying(false)
    }
  }

  return (
    <main className="page-shell">
      <Container size="sm">
        <Paper radius="lg" p="xl" withBorder>
          <HttpErrorView error={error} headingOrder={1} onRetry={retry} retrying={retrying} homeLink={<Anchor component={Link} to="/">{t("backHome")}</Anchor>} />
        </Paper>
      </Container>
    </main>
  )
}

/** 默认状态只接管路由加载和渲染，404 保留独立语义，异常统一进入安全日志。 */
export const routeStateDefaults = {
  defaultPendingComponent: RoutePendingPage,
  defaultErrorComponent: RouteErrorPage,
  defaultOnCatch: (error: unknown) => logger.error("route_failed", { surface: "web", error })
}
`

const ROUTE_STATE_TEST = `// @vitest-environment jsdom
import "../../i18n"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useQuery } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { AppProviders } from "../../app/AppProviders"
import { Route as RootRoute } from "../../routes/__root"
import { routeStateDefaults } from "./RouteState"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 使用真实根路由和生产状态配置，只替换测试所需的页面与 loader。 */
function testRouter(options: { loader?: () => Promise<unknown>; component?: () => ReactElement } = {}) {
  const root = createRootRoute({
    component: RootRoute.options.component,
    notFoundComponent: RootRoute.options.notFoundComponent
  })
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    loader: options.loader,
    component: options.component ?? (() => <h1>Ready route</h1>)
  })
  return createRouter({
    ...routeStateDefaults,
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0
  })
}

/** 验证加载状态可感知且解析后呈现真正页面。 */
test("announces a slow loader and then shows the loaded route", async () => {
  let finish: (() => void) | undefined
  const pending = new Promise<void>((resolve) => { finish = resolve })
  const router = testRouter({ loader: () => pending })
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  expect(await screen.findByRole("status")).toHaveTextContent("Loading page")
  await act(async () => { finish?.(); await pending })
  expect(await screen.findByRole("heading", { name: "Ready route" })).toBeInTheDocument()
  expect(screen.queryByRole("status")).not.toBeInTheDocument()
})

/** 验证首次加载失败不会暴露异常，重试真正重新执行 loader。 */
test("recovers a failed loader through the retry action", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const loader = vi.fn().mockRejectedValueOnce(new Error("private server failure"))
    .mockResolvedValue(undefined)
  const router = testRouter({ loader })
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to open this page")
  expect(screen.queryByText("private server failure")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  expect(await screen.findByRole("heading", { name: "Ready route" })).toBeInTheDocument()
  expect(loader).toHaveBeenCalledTimes(2)
})

/** 验证持续失败保留恢复入口，连续重试都会重新执行 loader。 */
test("keeps persistent loader failures recoverable", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const loader = vi.fn().mockRejectedValue(new Error("private repeated failure"))
  const router = testRouter({ loader })
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  await screen.findByRole("alert")
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry page" })).toBeEnabled())
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to open this page")
  expect(screen.queryByText("private repeated failure")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  await waitFor(() => expect(loader).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry page" })).toBeEnabled())
})

/** 验证真实 Query 连续失败后，每次重试都能重置读取边界并最终恢复。 */
test("resets failed Query reads on every retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const queryFn = vi.fn().mockRejectedValueOnce(new Error("first query failure"))
    .mockRejectedValueOnce(new Error("second query failure"))
    .mockResolvedValue("Recovered query")
  /** 用真实 Query 的抛错行为验证路由 fallback 与缓存边界协作。 */
  function QueryPage() {
    const { data } = useQuery({
      queryKey: ["route-state-retry-test"], queryFn, retry: false,
      throwOnError: true, staleTime: Infinity, gcTime: 0
    })
    return <h1>{data ?? "Loading query"}</h1>
  }
  const router = testRouter({ component: QueryPage })
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  await screen.findByRole("alert")
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  await screen.findByRole("alert")
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  expect(await screen.findByRole("heading", { name: "Recovered query" })).toBeInTheDocument()
  expect(queryFn).toHaveBeenCalledTimes(3)
})

/** 验证慢重试期间双击不会再次执行 loader。 */
test("prevents repeated retry while the loader is pending", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  let finish: (() => void) | undefined
  const pending = new Promise<void>((resolve) => { finish = resolve })
  const loader = vi.fn().mockRejectedValueOnce(new Error("initial failure"))
    .mockImplementation(() => pending)
  const router = testRouter({ loader })
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  await screen.findByRole("alert")
  await user.dblClick(screen.getByRole("button", { name: "Retry page" }))
  expect(loader).toHaveBeenCalledTimes(2)
  await act(async () => { finish?.(); await pending })
  expect(await screen.findByRole("heading", { name: "Ready route" })).toBeInTheDocument()
})

/** 验证页面渲染异常由路由安全接管，修复原因后可以重新呈现。 */
test("contains route render errors and recovers after retry", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
  let broken = true
  /** 模拟页面渲染边界，不把原始错误交给用户界面。 */
  function Page() {
    if (broken) throw new Error("private render failure")
    return <h1>Recovered render</h1>
  }
  const router = testRouter({ component: Page })
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  await screen.findByRole("alert")
  expect(screen.queryByText("private render failure")).not.toBeInTheDocument()
  expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ event: "route_failed" }))
  broken = false
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  expect(await screen.findByRole("heading", { name: "Recovered render" })).toBeInTheDocument()
})

/** 验证未知地址走 404 而非系统错误，首页链接仍能完成真实导航。 */
test("returns home from an unknown route without an error retry", async () => {
  const router = testRouter()
  router.history.replace("/missing")
  const user = userEvent.setup()
  render(<AppProviders><RouterProvider router={router} /></AppProviders>)
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Retry page" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("link", { name: "Back to home" }))
  expect(await screen.findByRole("heading", { name: "Ready route" })).toBeInTheDocument()
})
`
