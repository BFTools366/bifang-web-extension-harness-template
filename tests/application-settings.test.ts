import { expect, test } from "vitest"
import { applicationFiles } from "./application-test-adapters.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 设置属于通用应用，不要求身份能力，不进入受权限约束的业务页面清单。 */
test.each(["web", "extension"] as const)("emits public %s settings without identity", (host) => {
  const files = applicationFiles(new Map(), {
    selection: { host, modules: [] },
    homePageSource: HOME_SOURCE,
    dataMode: "mock"
  })
  expect(files.has("src/features/application/SettingsPage.tsx")).toBe(true)
  expect(files.has("src/features/application/SettingsLink.tsx")).toBe(false)
  const wiring = JSON.parse(files.get(".harness/application-wiring.json") ?? "")
  expect(wiring.pages.some((page: { path: string }) => page.path === "/settings")).toBe(false)
  expect(files.get("src/features/application/settingsNavigation.ts")).toContain(
    'settingsFallback = "/"'
  )
})

/** 实际生成组件证明公开设置无会话请求，修改生效且认证往返保留安全目标。 */
test.each(["web", "extension"] as const)(
  "runs %s public settings and safe authentication return",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["identity.session"] },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        fixtures: {
          accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }]
        }
      },
      `import { act, render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { test, expect, vi, afterEach } from "vitest"
import { RouterProvider, createMemoryHistory${host === "web" ? ", createRouter" : ""} } from "@tanstack/react-router"
import i18n from "./i18n"
import { BRAND } from "./brand"
import { identitySession } from "./features/application/runtime"
import { settingsReturnTo } from "./features/application/settingsNavigation"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
/** 公开设置在 Popup/Options 各自历史中均不执行身份门禁。 */
${host === "web" ? 'test("public settings and auth return", async () => {' : 'test.each(["popup", "options"] as const)("public settings and auth return in %s", async (surface) => {'}
  await identitySession.logout()
  await i18n.changeLanguage("en")
  const ensure = vi.spyOn(identitySession, "ensure")
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  ${host === "web" ? 'const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/settings"] }) })' : 'window.location.hash = "/settings"\n  const router = createExtensionRouter(surface)\n  if (surface === "popup") router.update({ history: createMemoryHistory({ initialEntries: ["/settings"] }) })'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toHaveFocus()
  expect(ensure).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  await user.click(screen.getByRole("radio", { name: "Dark" }))
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark")
  expect(localStorage.getItem(BRAND.id + ":color-scheme:v1")).toBe("dark")
  await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "zh")
  expect(await screen.findByRole("heading", { name: "设置", level: 1 })).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute("lang", "zh")
  await user.selectOptions(screen.getByRole("combobox", { name: "语言" }), "en")
  expect(ensure).not.toHaveBeenCalled()
  await user.click(screen.getByRole("link", { name: "Back" }))
  await screen.findByRole("heading", { name: "Sign in", level: 1 })
  expect(document.title).not.toContain("Settings")
  expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1)
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  expect(screen.getByLabelText(/Account/)).toHaveAttribute("placeholder", "Enter your account")
  expect(screen.getByLabelText(/Password/)).toHaveAttribute("placeholder", "Enter your password")
  expect(screen.queryByText("Demo account mode")).not.toBeInTheDocument()
  expect(screen.queryByText(/Mock API mode/)).not.toBeInTheDocument()
  await act(async () => { await router.navigate({ to: "/login", search: { returnTo: "/" } }) })
  await user.type(screen.getByLabelText(/Account/), "demo")
  await user.type(screen.getByLabelText(/Password/), "draft-password")
  await user.click(screen.getByRole("link", { name: "Settings" }))
  await screen.findByRole("heading", { name: "Settings", level: 1 })
  expect(router.state.location.href).toBe("/settings")
  await user.click(screen.getByRole("link", { name: "Back" }))
  await screen.findByRole("heading", { name: "Sign in", level: 1 })
  expect(router.state.location.search).toMatchObject({ returnTo: "/" })
  expect(screen.getByLabelText(/Account/)).toHaveValue("")
  expect(screen.getByLabelText(/Password/)).toHaveValue("")
  for (const target of [undefined, "https://evil.invalid", "//evil.invalid", "/unknown", "/settings", "/%6cogin", "/app/../login"])
    expect(settingsReturnTo(target)).toBe("/login")
  expect(settingsReturnTo("/login?returnTo=https%3A%2F%2Fevil.invalid&token=secret")).toBe("/login?returnTo=%2F")
})
`
    )
    expect(output).toMatch(host === "web" ? /Tests\s+1 passed/ : /Tests\s+2 passed/)
  },
  90_000
)
