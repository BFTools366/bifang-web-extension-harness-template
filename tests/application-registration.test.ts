import { expect, test } from "vitest"
import { applicationFiles } from "./application-test-adapters.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 仅隔离测试注入的注册服务，产品生成仍强制真实 adapter。 */
const identityAdapter = `import { ApiError } from "../client/httpClient"
import type { RegistrationInput } from "./registration"
export const flow = { calls: 0, rejectLogin: true, unknown: false, slowLogin: false, loginStarted: false, input: {} as RegistrationInput }
let finishLogin: (() => void) | undefined
/** 测试故意模拟不遵循 AbortSignal 的迟到服务，客户端仍必须阻断采用。 */
export function finishPendingLogin() { finishLogin?.() }
export const registrationPasswordPolicy = { messageKey: "registrationPasswordGoRule", validate: (password: string) => ["Example123", "密码A1"].includes(password) }
export const api = {
  /** 登录失败后允许显式重试，不重放注册。 */
  async login() { flow.loginStarted = true; if (flow.slowLogin) await new Promise<void>((resolve) => { finishLogin = resolve }); if (flow.rejectLogin) throw new Error("login_failed"); return "access" },
  /** 测试身份与注册资源独立，不伪造组织接口。 */
  async validate() { return { id: "member", displayName: "Member" } },
  /** 测试吊销不触碰真实用户。 */
  async logout() {}
}
/** 记录边界输入以核对邮箱归一化与用户名缺席。 */
export async function registerAccount(input: RegistrationInput) {
  flow.calls++; flow.input = input
  if (flow.unknown) throw new ApiError({ kind: "timeout", code: "timeout", message: "timeout", retryable: false })
  return "member"
}
/** 仅该测试替身回执允许明文；真实 adapter 另做环境和 wire 校验。 */
export async function sendRegistrationCode() {
  return { mocked: true as const, code: "000012", codeLength: 6, expiresAt: Date.now() + 300000, resendAfter: 60 }
}
`

/** 默认基础身份不因新增模板自动启用注册、发码或对应路由。 */
test("registration assets remain opt in", () => {
  const files = applicationFiles(new Map(), {
    selection: { host: "web", operations: ["identity.session"] },
    dataMode: "mock",
    homePageSource: HOME_SOURCE
  })
  expect(files.has("src/routes/register.tsx")).toBe(false)
  expect(files.has("src/features/identity/RegistrationPage.tsx")).toBe(false)
  expect(files.get("src/features/application/Application.tsx")).not.toContain(
    "sendRegistrationCode"
  )
  expect(files.get("src/features/application/SettingsLink.tsx")).not.toContain("<Button")
})

/** 不选验证时只有注册；服务规则、本地化及旧账号登录各有独立边界。 */
test.each(["web", "extension"] as const)(
  "registers without verification in %s",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["identity.register"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter",
        adapters: { identity: identityAdapter }
      },
      `import { act, fireEvent, render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryHistory${host === "web" ? ", createRouter" : ""} } from "@tanstack/react-router"
import i18n from "./i18n"
import { flow } from "./data/api/identity/adapter"
import { identitySession } from "./features/application/runtime"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
/** 注册不发验证码；密码规则只作用于新账号，表单跟随语言。 */
test("optional verification and contract password policy", async () => {
  await identitySession.logout()
  await i18n.changeLanguage("zh")
  flow.calls = 0; flow.rejectLogin = false
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/register"] }) })' : 'createExtensionRouter("popup")\n  router.update({ history: createMemoryHistory({ initialEntries: ["/register"] }) })'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByPlaceholderText("请输入邮箱")
  expect(screen.getByPlaceholderText("请再次输入密码")).toBeInTheDocument()
  await act(async () => { await i18n.changeLanguage("en") })
  expect(screen.queryByLabelText(/verification code/)).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Get code" })).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText("Enter your password")).not.toHaveAttribute("minlength")
  expect(screen.getByPlaceholderText("Enter your password again")).not.toHaveAttribute("minlength")
  await user.type(screen.getByPlaceholderText("Enter your email"), "new@example.test")
  await user.type(screen.getByPlaceholderText("Enter your password"), "abcdefgh")
  await user.type(screen.getByPlaceholderText("Enter your password again"), "abcdefgh")
  fireEvent.submit(screen.getByRole("button", { name: "Create account and sign in" }).closest("form")!)
  expect(flow.calls).toBe(0)
  expect(screen.getAllByText("Use 8–64 UTF-8 bytes, including an English letter and a digit.")).toHaveLength(2)
  await user.clear(screen.getByPlaceholderText("Enter your password"))
  await user.type(screen.getByPlaceholderText("Enter your password"), "密码A1")
  await user.clear(screen.getByPlaceholderText("Enter your password again"))
  await user.type(screen.getByPlaceholderText("Enter your password again"), "密码A1")
  await user.click(screen.getByRole("button", { name: "Create account and sign in" }))
  await screen.findByRole("heading", { name: "Text tool" })
  expect(flow.calls).toBe(1)
  expect(flow.input).toEqual({ email: "new@example.test", password: "密码A1" })
  await act(async () => { await identitySession.logout(); await router.navigate({ to: "/login" }) })
  await screen.findByRole("heading", { name: "Sign in" })
  await user.type(screen.getByPlaceholderText("Enter your account"), "legacy")
  await user.type(screen.getByPlaceholderText("Enter your password"), "x")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
  await screen.findByRole("heading", { name: "Text tool" })
})
`
    )
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)

/** 编译并实际运行两宿主的注册、登录重试、未知结果及验证码迟到隔离。 */
test.each(["web", "extension"] as const)(
  "generates working %s email registration",
  async (host) => {
    const result = await runApplicationFixture(
      {
        selection: { host, operations: ["identity.register", "identity.verification"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter",
        adapters: { identity: identityAdapter }
      },
      `import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { RouterProvider, createMemoryHistory${host === "web" ? ", createRouter" : ""} } from "@tanstack/react-router"
import i18n from "./i18n"
import { identitySession } from "./features/application/runtime"
import { flow, finishPendingLogin } from "./data/api/identity/adapter"
import { useEmailVerification } from "./features/identity/useEmailVerification"
import type { RegistrationCodeReceipt } from "./data/api/identity/registration"
import { settingsReturnTo } from "./features/application/settingsNavigation"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
afterEach(() => { cleanup(); vi.restoreAllMocks() })
/** 实际路由显示邮箱和验证码，已创建账号在登录失败后只重试登录。 */
test("email code registration retries only sign in", async () => {
  await identitySession.logout()
  await i18n.changeLanguage("en")
  flow.calls = 0; flow.rejectLogin = true; flow.unknown = false
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/register?returnTo=%2F"] }) })' : 'createExtensionRouter("popup")\n  router.update({ history: createMemoryHistory({ initialEntries: ["/register?returnTo=%2F"] }) })'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Create account" })
  expect(screen.queryByLabelText(/Username/)).not.toBeInTheDocument()
  expect(screen.getByLabelText(/verification code/)).toHaveAttribute("maxlength", "10")
  expect(screen.getByLabelText(/verification code/)).toHaveAttribute("pattern", "[0-9]{4,10}")
  expect(settingsReturnTo("/register?returnTo=%2F&password=secret")).toBe("/register?returnTo=%2F")
  await user.type(screen.getByPlaceholderText("Enter your email"), "NEW@EXAMPLE.TEST")
  await user.click(screen.getByRole("button", { name: "Get code" }))
  await user.click(await screen.findByRole("button", { name: "Fill code" }))
  expect(screen.getByLabelText(/verification code/)).toHaveValue("000012")
  expect(screen.getByLabelText(/verification code/)).toHaveAttribute("pattern", "[0-9]{6}")
  await user.type(screen.getByLabelText(/^Password/u), "Example123")
  await user.type(screen.getByLabelText(/Confirm password/), "Example123")
  fireEvent.submit(screen.getByRole("button", { name: "Create account and sign in" }).closest("form")!)
  await screen.findByText("Account created. Enter your password to continue signing in.")
  expect(flow.calls).toBe(1)
  expect(flow.input).toEqual({ email: "new@example.test", password: "Example123", code: "000012" })
  expect(screen.queryByLabelText(/verification code/)).not.toBeInTheDocument()
  flow.rejectLogin = false
  await user.type(screen.getByLabelText(/^Password/u), "Example123")
  await user.click(screen.getByRole("button", { name: "Continue signing in" }))
  await screen.findByRole("heading", { name: "Text tool" })
  expect(flow.calls).toBe(1)
  ${host === "web" ? 'expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeInTheDocument()' : 'expect(screen.queryByRole("navigation", { name: "Sidebar" })).not.toBeInTheDocument()'}
})
/** 写入无响应时不自动重试创建，并保留登录恢复入口。 */
test("unknown registration blocks duplicate create", async () => {
  await identitySession.logout()
  flow.calls = 0; flow.unknown = true
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/register"] }) })' : 'createExtensionRouter("popup")\n  router.update({ history: createMemoryHistory({ initialEntries: ["/register"] }) })'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Create account" })
  await user.type(screen.getByPlaceholderText("Enter your email"), "unknown@example.test")
  await user.type(screen.getByLabelText(/verification code/), "123456")
  await user.type(screen.getByLabelText(/^Password/u), "Example123")
  await user.type(screen.getByLabelText(/Confirm password/), "Example123")
  fireEvent.submit(screen.getByRole("button", { name: "Create account and sign in" }).closest("form")!)
  await screen.findByText("Registration could not be confirmed. Try signing in to check the result.")
  expect(screen.getByRole("button", { name: "Create account and sign in" })).toBeDisabled()
  expect(flow.calls).toBe(1)
  expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument()
})
/** A→B→A 旧请求的迟到成功和 finally 均无权覆盖新请求。 */
test("leaving registration cancels slow sign in adoption", async () => {
  await identitySession.logout()
  flow.calls = 0; flow.unknown = false; flow.rejectLogin = false; flow.slowLogin = true; flow.loginStarted = false
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/register"] }) })' : 'createExtensionRouter("popup")\n  router.update({ history: createMemoryHistory({ initialEntries: ["/register"] }) })'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Create account" })
  await user.type(screen.getByPlaceholderText("Enter your email"), "slow@example.test")
  await user.type(screen.getByLabelText(/verification code/), "123456")
  await user.type(screen.getByLabelText(/^Password/u), "Example123")
  await user.type(screen.getByLabelText(/Confirm password/), "Example123")
  fireEvent.submit(screen.getByRole("button", { name: "Create account and sign in" }).closest("form")!)
  await screen.findByRole("button", { name: "Continue signing in" })
  expect(flow.loginStarted).toBe(true)
  await user.click(screen.getByRole("link", { name: "Settings" }))
  await screen.findByRole("heading", { name: "Settings", level: 1 })
  await act(async () => { finishPendingLogin() })
  expect(identitySession.getSnapshot().identity).toBeNull()
  expect(router.state.location.pathname).toBe("/settings")
  flow.slowLogin = false
})
/** A→B→A 旧请求的迟到成功和 finally 均无权覆盖新请求。 */
test("verification owns email generation", async () => {
  const pending: ((value: RegistrationCodeReceipt) => void)[] = []
  const send = vi.fn(() => new Promise<RegistrationCodeReceipt>((resolve) => pending.push(resolve)))
  const { result, rerender } = renderHook(({ email }) => useEmailVerification(email, true, send), { initialProps: { email: "a@example.test" } })
  act(() => { void result.current.send() })
  act(() => result.current.changeTarget("b@example.test")); rerender({ email: "b@example.test" })
  act(() => result.current.changeTarget("a@example.test")); rerender({ email: "a@example.test" })
  act(() => { void result.current.send() })
  await act(async () => pending[0]?.({ mocked: true, code: "111111", codeLength: 6, expiresAt: Date.now() + 300000, resendAfter: 60 }))
  expect(result.current.receipt).toBeNull(); expect(result.current.sending).toBe(true)
  await act(async () => pending[1]?.({ mocked: true, code: "222222", codeLength: 6, expiresAt: Date.now() + 300000, resendAfter: 60 }))
  expect(result.current.receipt).toMatchObject({ code: "222222" }); expect(result.current.sending).toBe(false)
})
`
    )
    expect(result).toMatch(/Tests\s+4 passed/u)
  },
  90_000
)
