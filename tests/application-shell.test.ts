import { expect, test } from "vitest"
import { applicationFiles } from "./application-test-adapters.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 未选能力没有模板、菜单或查询；账号设置槽位不会暗中装配资料页。 */
test("account and organization assets follow explicit capability selection", () => {
  const base = { homePageSource: HOME_SOURCE, dataMode: "mock" } as const
  const plain = applicationFiles(new Map(), { ...base, selection: { host: "web", modules: [] } })
  expect(plain.has("src/features/application/AccountMenu.tsx")).toBe(false)
  const identity = applicationFiles(new Map(), {
    ...base,
    selection: { host: "web", operations: ["identity.session"] },
    fixtures: {
      accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }]
    }
  })
  expect(identity.has("src/features/application/AccountMenu.tsx")).toBe(true)
  expect(identity.get("src/features/identity/session.test.ts")).toContain('from "vitest"')
  expect(identity.get("src/features/identity/session.test.ts")).not.toContain('from "node:test"')
  expect(identity.has("src/features/organization/OrganizationContext.tsx")).toBe(false)
  expect(identity.has("src/features/organization/OrganizationManagementPage.tsx")).toBe(false)
  expect(identity.has("src/routes/_application/organization_.manage.tsx")).toBe(false)
  expect(identity.get("src/features/application/Application.tsx")).not.toContain(
    "OrganizationMenuItem"
  )
  expect([...identity.keys()].some((path) => path.includes("profile"))).toBe(false)
})

/** 两宿主实际生成代码固定账号顺序、偏好分区、当前组织和持续外壳。 */
test.each(["web", "extension"] as const)(
  "preserves the fixed %s account and shell structure",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["organization.switch"] },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        fixtures: {
          accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }],
          organizations: [
            { id: "a", name: "Team A", ownerAccountId: "member" },
            { id: "b", name: "Team B", ownerAccountId: "other" }
          ],
          organizationUsers: [
            { id: "member-a", accountId: "member", organizationId: "a", role: "owner" },
            { id: "member-b", accountId: "member", organizationId: "b", role: "member" }
          ]
        }
      },
      `import { test, expect, vi } from "vitest"
import { act, render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Menu } from "@mantine/core"
import { RouterProvider, createRootRoute, createRouter, createMemoryHistory } from "@tanstack/react-router"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"\nimport { queryClient } from "./app/queryClient"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers, queryClient } from "./providers"'}
import { identitySession, applicationScope, organizationService } from "./features/application/runtime"
import { AccountMenu } from "./features/application/AccountMenu"
/** 固定结构和生命周期由真实生成组件验证，不复制下游榜单业务。 */
test("account structure, preferences and persistent shell", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "demo", password: "demo" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  const user = userEvent.setup()
  const view = render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Text tool" })
  await user.type(screen.getByLabelText("Input"), "keep draft")
  let trigger = screen.getByRole("button", { name: "User center: Member" })
  let main = screen.getByRole("main")
  trigger.focus()
  await user.keyboard("{Enter}")
  const menu = await screen.findByRole("menu")
  expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Switch organization", "Sign out"
  ])
  expect(within(menu).queryByRole("menuitem", { name: "Account settings" })).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  await waitFor(() => expect(trigger).toHaveFocus())
  await act(async () => { await router.navigate({ to: "/", search: () => ({ page: 2, q: "123", literal: '{"a":2}' }), hash: "draft" }) })
  const origin = router.state.location.href
  await user.click(screen.getByRole("link", { name: "Settings" }))
  await screen.findByRole("heading", { name: "Settings", level: 1 })
  expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toHaveFocus()
  await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "zh")
  await user.selectOptions(screen.getByRole("combobox", { name: "语言" }), "en")
  await user.click(screen.getByRole("link", { name: "Back" }))
  await screen.findByRole("heading", { name: "Text tool" })
  expect(screen.getByLabelText("Input")).toHaveValue("")
  expect(router.state.location.href).toBe(origin)
  trigger = screen.getByRole("button", { name: "User center: Member" })
  main = screen.getByRole("main")
  await user.click(trigger)
  await screen.findByRole("menu")
  const nextFocus = document.createElement("button")
  nextFocus.textContent = "Next scope focus"
  document.body.append(nextFocus)
  let owned = 0
  act(() => {
    owned = applicationScope.begin()
    nextFocus.focus()
  })
  expect(screen.getByRole("button", { name: "User center: Member" })).toBe(trigger)
  expect(screen.getByRole("main")).toBe(main)
  expect(screen.queryByRole("heading", { name: "Text tool" })).not.toBeInTheDocument()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  // Mantine 在关闭后延迟 10ms 归还焦点；失效关闭必须取消这次归还。
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
  expect(nextFocus).toHaveFocus()
  nextFocus.remove()
  act(() => { applicationScope.finish(owned) })
  await screen.findByRole("heading", { name: "Text tool" })
  await act(async () => { await organizationService.switch("b") })
  expect(screen.getByRole("button", { name: "User center: Member" })).toBe(trigger)
  await user.click(trigger)
  expect(await screen.findByRole("menuitem", { name: "Switch organization" })).toBeInTheDocument()
  await user.click(await screen.findByRole("menuitem", { name: "Switch organization" }))
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByRole("radio", { name: /Team B/ })).toBeDisabled()
  await user.keyboard("{Escape}")
  await waitFor(() => expect(trigger).toHaveFocus())
  await user.click(trigger)
  await user.click(await screen.findByRole("menuitem", { name: "Switch organization" }))
  await screen.findByRole("dialog")
  await user.keyboard("{Escape}")
  const nextInput = screen.getByLabelText("Input")
  nextInput.focus()
  await user.type(nextInput, "keep typing after close")
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
  expect(nextInput).toHaveFocus()
  expect(nextInput).toHaveValue("keep typing after close")
  expect(queryClient.getQueryCache().findAll({ queryKey: ["organization"] }).every((query) => query.meta?.private === true)).toBe(true)
  view.unmount()
  const settings = vi.fn()
  const customRoot = createRootRoute({ component: () => <AccountMenu session={identitySession} scope={applicationScope.getSnapshot().revision}
    avatar="https://images.fixture.invalid/avatar.png" settings={<Menu.Item onClick={settings}>Account settings</Menu.Item>} /> })
  const customRouter = createRouter({ routeTree: customRoot, history: createMemoryHistory({ initialEntries: ["/"] }) })
  const custom = render(<Providers><RouterProvider router={customRouter} /></Providers>)
  await screen.findByRole("button", { name: "User center: Member" })
  expect(custom.container.querySelector("img")).toHaveAttribute("src", "https://images.fixture.invalid/avatar.png")
  await user.click(screen.getByRole("button", { name: "User center: Member" }))
  await user.click(await screen.findByRole("menuitem", { name: "Account settings" }))
  expect(settings).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole("button", { name: "User center: Member" }))
  await user.click(await screen.findByRole("menuitem", { name: "Sign out" }))
  expect(screen.queryByRole("button", { name: "User center: Member" })).not.toBeInTheDocument()
})
`
    )
    expect(output).toMatch(/Tests\s+1 passed/)
  },
  90_000
)
