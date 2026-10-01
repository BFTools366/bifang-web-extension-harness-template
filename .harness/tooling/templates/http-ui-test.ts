import type { ProjectType } from "../types.ts"

/** 在真实宿主 Providers、Router 和 QueryClient 上验证安全错误反馈。 */
export function httpUiTest(projectType: ProjectType): string {
  const imports =
    projectType === "web"
      ? `import { AppProviders as Providers } from "../../app/AppProviders"
import { Route as RootRoute } from "../../routes/__root"
import { routeStateDefaults } from "../../features/route-state/RouteState"`
      : `import { Providers } from "../../providers"
import { createExtensionRouter } from "../../extension-router"`
  const routerTests = projectType === "web" ? WEB_ROUTER_TEST : EXTENSION_ROUTER_TEST
  return `// @vitest-environment jsdom
import "../../i18n"
import i18n from "../../i18n"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { getDefaultStore } from "jotai"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { ApiError, HTTP_HEADERS, createLoginUnauthorizedHandler } from "./httpClient"
import { HttpErrorView } from "./HttpErrorView"
import { clearHttpFeedback, httpFeedbackAtom, reportHttpError } from "./httpFeedback"
import { applicationHttp, configureUnauthorizedHandler, requestHttpQuery } from "./httpRuntime"
${imports}

let queryClient: QueryClient | undefined

/** 使用实际 QueryClient，场景结束时精确回收测试数据。 */
function ClientCapture() { queryClient = useQueryClient(); return <p>Retained content</p> }

/** 给协议失败保留安全元数据，私有异常正文不能进入 UI。 */
function failure(status: number): ApiError {
  return new ApiError({ kind: "http", code: "test_failure", status, retryable: status >= 500, message: "private server detail" })
}

/** 只替换网络响应，不替换 Ky、会话或错误 UI 的生产实现。 */
function response(status: number): Response {
  const value = new Response(null, { status })
  Object.defineProperty(value, "url", { value: "https://api.example.com/v1/items" })
  return value
}

beforeEach(async () => {
  clearHttpFeedback()
  await i18n.changeLanguage("en")
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); queryClient?.clear(); queryClient = undefined; clearHttpFeedback(); applicationHttp.clearSession(); vi.restoreAllMocks() })

/** primitive 异常也能由局部状态接管，固定文案不显示远端文本。 */
test("deduplicates local and global unknown failures safely", async () => {
  reportHttpError("private primitive error")
  render(<Providers><HttpErrorView error="private primitive error" /></Providers>)
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to open this page")
  expect(screen.getAllByRole("alert")).toHaveLength(1)
  expect(screen.queryByText("private primitive error")).not.toBeInTheDocument()
})

/** 同语义合并播报后，旧局部视图不能清掉最新并发失败。 */
test("keeps the latest failure owner when presentation semantics repeat", () => {
  const oldError = failure(403)
  const latestError = failure(403)
  reportHttpError(oldError)
  const first = getDefaultStore().get(httpFeedbackAtom)
  reportHttpError(latestError)
  expect(getDefaultStore().get(httpFeedbackAtom)).toBe(first)
  clearHttpFeedback(oldError)
  expect(getDefaultStore().get(httpFeedbackAtom)).toBe(first)
  clearHttpFeedback(latestError)
  expect(getDefaultStore().get(httpFeedbackAtom)).toBeNull()
})

/** 401 无虚构登录动作，403 保留页面内容；实时切换语言使用既有资源。 */
test("localizes authentication and permission feedback with a dismiss action", async () => {
  const user = userEvent.setup()
  render(<Providers><ClientCapture /></Providers>)
  act(() => reportHttpError(failure(401)))
  expect(await screen.findByRole("alert")).toHaveTextContent("Authentication required")
  expect(screen.queryByRole("button", { name: "Authenticate" })).not.toBeInTheDocument()
  act(() => reportHttpError(failure(403)))
  await act(async () => { await i18n.changeLanguage("zh") })
  expect(screen.getByRole("alert")).toHaveTextContent("没有访问权限")
  expect(screen.getByText("Retained content")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "关闭错误提示" }))
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

/** Query 的中间 500 由唯一重试 owner 处理，随后成功不留下虚假的失败提示。 */
test("retries a read through Query without leaving intermediate global feedback", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(500)).mockResolvedValue(response(200))
  render(<Providers><ClientCapture /></Providers>)
  if (!queryClient) throw new Error("Missing QueryClient")
  const result = await queryClient.fetchQuery({ queryKey: ["http-recovery"], queryFn: ({ signal }) => requestHttpQuery("items", { signal }), retryDelay: 0 })
  expect(result.status).toBe(200)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

/** 后台刷新失败保留此前成功内容，同时呈现最终失败提示。 */
test("retains successful Query content after a failed background refresh", async () => {
  const queryFn = vi.fn().mockResolvedValueOnce("Saved content").mockRejectedValue(failure(500))
  /** 页面保持 Query 结果的唯一 owner，不用 Jotai 镜像数据。 */
  function Page() {
    const result = useQuery({ queryKey: ["background-read"], queryFn, staleTime: Infinity, retry: false })
    return <h1>{result.data ?? "Loading content"}</h1>
  }
  render(<Providers><ClientCapture /><Page /></Providers>)
  expect(await screen.findByRole("heading", { name: "Saved content" })).toBeInTheDocument()
  await act(async () => { await queryClient?.invalidateQueries({ queryKey: ["background-read"] }) })
  expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable")
  expect(screen.getByRole("heading", { name: "Saved content" })).toBeInTheDocument()
})

/** 最终 500 读取有界为三次，401/403 和 mutation 均不会自动重放。 */
test("reports final Query and mutation errors with bounded retry", async () => {
  render(<Providers><ClientCapture /></Providers>)
  if (!queryClient) throw new Error("Missing QueryClient")
  const serverRead = vi.fn().mockRejectedValue(failure(500))
  await act(async () => { await queryClient?.fetchQuery({ queryKey: ["bounded-read"], queryFn: serverRead, retryDelay: 0 }).catch(() => undefined) })
  expect(serverRead).toHaveBeenCalledTimes(3)
  expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable")
  for (const status of [401, 403]) {
    const rejectedRead = vi.fn().mockRejectedValue(failure(status))
    await act(async () => { await queryClient?.fetchQuery({ queryKey: ["no-retry", status], queryFn: rejectedRead, retryDelay: 0 }).catch(() => undefined) })
    expect(rejectedRead).toHaveBeenCalledTimes(1)
  }
  const mutationFn = vi.fn().mockRejectedValue(failure(500))
  const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn })
  await act(async () => { await mutation.execute(undefined).catch(() => undefined) })
  expect(mutationFn).toHaveBeenCalledTimes(1)
  expect(screen.getByText("Retained content")).toBeInTheDocument()
})

/** 默认直接请求反馈、显式 Token 写入和旧 401 静默共享真实运行时会话。 */
test("does not restore an old authentication alert after a new login", async () => {
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { finish = resolve })
  const handler = vi.fn(() => gate)
  configureUnauthorizedHandler({ handleUnauthorized: handler })
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(401)).mockResolvedValue(response(200))
  render(<Providers><ClientCapture /></Providers>)
  applicationHttp.setAuthToken("initial-token")
  const pending = applicationHttp.request("items").catch((error: unknown) => error)
  await waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
  expect(screen.getByRole("alert")).toHaveTextContent("Authentication required")
  act(() => applicationHttp.setAuthToken("new-token"))
  await act(async () => { finish?.(); await pending })
  expect(await pending).toMatchObject({ status: 401, ignoreGlobalFeedback: true })
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  await applicationHttp.request("items")
  const dispatched = vi.mocked(globalThis.fetch).mock.calls[1]?.[0]
  expect(dispatched).toBeInstanceOf(Request)
  expect((dispatched as Request).headers.get(HTTP_HEADERS.authToken)).toBe("new-token")
})

/** 只有已经声明的真实测试登录 route 才注入 adapter，401 导航由实际 Router 执行。 */
test("navigates a 401 through an explicitly configured authentication route", async () => {
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <h1>Private page</h1> })
  const signIn = createRoute({ getParentRoute: () => root, path: "/sign-in", component: () => <h1>Authentication entry</h1> })
  const router = createRouter({ routeTree: root.addChildren([home, signIn]), history: createMemoryHistory({ initialEntries: ["/"] }) })
  configureUnauthorizedHandler(createLoginUnauthorizedHandler({ loginUrl: "/sign-in", navigate: (url) => {
    if (url !== "/sign-in") throw new Error("Unapproved authentication target")
    router.history.push(url)
    return router.load()
  } }))
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401))
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Private page" })
  applicationHttp.setAuthToken("expired-token")
  await act(async () => { await applicationHttp.request("items").catch(() => undefined) })
  expect(await screen.findByRole("heading", { name: "Authentication entry" })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/sign-in")
})

/** 异步恢复动作失败继续进入反馈，不泄漏异常正文或产生未处理 Promise。 */
test("contains rejected UI recovery actions", async () => {
  const user = userEvent.setup()
  render(<Providers><HttpErrorView error={failure(500)} onRetry={() => Promise.reject(failure(403))} /></Providers>)
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  expect(await screen.findByText("Access denied")).toBeInTheDocument()
  expect(screen.queryByText("private server detail")).not.toBeInTheDocument()
})
${routerTests}
`
}

const WEB_ROUTER_TEST = `for (const status of [401, 403, 500]) {
  /** 真实 Web Router 使用实际 fallback，认证/权限无重试，服务失败能重新加载。 */
  test("routes HTTP " + status + " through the Web recovery UI", async () => {
    const loader = vi.fn().mockRejectedValue(failure(status))
    const root = createRootRoute({ component: RootRoute.options.component, notFoundComponent: RootRoute.options.notFoundComponent })
    const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <h1>Ready home</h1> })
    const protectedRoute = createRoute({ getParentRoute: () => root, path: "/private", loader, component: () => <h1>Recovered route</h1> })
    const router = createRouter({ ...routeStateDefaults, routeTree: root.addChildren([home, protectedRoute]), history: createMemoryHistory({ initialEntries: ["/private"] }) })
    const user = userEvent.setup()
    render(<Providers><RouterProvider router={router} /></Providers>)
    const title = status === 401 ? "Authentication required" : status === 403 ? "Access denied" : "Service unavailable"
    expect(await screen.findByRole("alert")).toHaveTextContent(title)
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument()
    if (status === 500) {
      loader.mockResolvedValue(undefined)
      await user.click(screen.getByRole("button", { name: "Retry page" }))
      expect(await screen.findByRole("heading", { name: "Recovered route" })).toBeInTheDocument()
      expect(loader).toHaveBeenCalledTimes(2)
    } else {
      expect(screen.queryByRole("button", { name: "Retry page" })).not.toBeInTheDocument()
      await user.click(screen.getByRole("link", { name: "Back to home" }))
      expect(await screen.findByRole("heading", { name: "Ready home" })).toBeInTheDocument()
    }
  })
}
`

const EXTENSION_ROUTER_TEST = `for (const surface of ["popup", "options"] as const) {
  for (const status of [401, 403, 500]) {
    /** 直接使用实际 Extension 工厂，分别覆盖 memory 与 hash history 的失败和恢复。 */
    test("routes HTTP " + status + " through the " + surface + " recovery UI", async () => {
      window.history.replaceState({}, "", "/#/")
      const configured = createExtensionRouter(surface, "data:image/png;base64,")
      const root = createRootRoute({ component: configured.options.routeTree?.options.component })
      const loader = vi.fn().mockRejectedValue(failure(status))
      const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <h1>Ready home</h1> })
      const privateRoute = createRoute({ getParentRoute: () => root, path: "/private", loader, component: () => <h1>Recovered route</h1> })
      const router = createRouter({ defaultErrorComponent: configured.options.defaultErrorComponent, defaultOnCatch: configured.options.defaultOnCatch, routeTree: root.addChildren([home, privateRoute]), history: configured.history })
      router.history.replace("/private")
      const user = userEvent.setup()
      render(<Providers><RouterProvider router={router} /></Providers>)
      const title = status === 401 ? "Authentication required" : status === 403 ? "Access denied" : "Service unavailable"
      expect(await screen.findByRole("alert")).toHaveTextContent(title)
      expect(screen.queryByText("private server detail")).not.toBeInTheDocument()
      loader.mockResolvedValue(undefined)
      if (status === 500) {
        await user.click(screen.getByRole("button", { name: "Retry page" }))
        expect(await screen.findByRole("heading", { name: "Recovered route" })).toBeInTheDocument()
        expect(loader).toHaveBeenCalledTimes(2)
      }
      else {
        expect(screen.queryByRole("button", { name: "Retry page" })).not.toBeInTheDocument()
        await user.click(screen.getByRole("link", { name: "Back to home" }))
        expect(await screen.findByRole("heading", { name: "Ready home" })).toBeInTheDocument()
        expect(loader).toHaveBeenCalledTimes(1)
      }
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
      router.history.destroy()
    })
  }
}
`
