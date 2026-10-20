import { applicationFiles as productionFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import { expect, test } from "vitest"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 固定页面在两种真实生成路由下验证购买、权限元素与组织隔离。 */
test.each(["web", "extension"] as const)(
  "composes %s fixed capability pages and scoped behavior",
  async (host) => {
    const codes = ["home", "catalog", "orders", "wallet", "organization", "audit", "buy", "switch"]
    const result = await runApplicationFixture(
      {
        selection: {
          host,
          operations: [
            "orders.purchase",
            "organization.switch",
            "permissions.enforce",
            "audit.read"
          ]
        },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        pagePermissions: {
          "/": ["home"],
          "/catalog": ["catalog"],
          "/orders": ["orders"],
          "/wallet": ["wallet"],
          "/organization": ["organization"],
          "/audit": ["audit"]
        },
        actionPermissions: { "orders.purchase": ["buy"], "organization.switch": ["switch"] },
        fixtures: {
          accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }],
          products: [
            {
              id: "product",
              name: "Notebook",
              description: "Useful paper",
              category: "Stationery",
              price: { minor: 1250, currency: "USD" }
            },
            {
              id: "other",
              name: "Storage add-on",
              description: "Another category",
              category: "Resources",
              price: { minor: 500, currency: "USD" }
            }
          ],
          organizations: [
            { id: "a", name: "Team A", ownerAccountId: "member" },
            { id: "b", name: "Team B", ownerAccountId: "other" }
          ],
          organizationUsers: [
            { id: "member-a", accountId: "member", organizationId: "a", role: "owner" },
            { id: "member-b", accountId: "member", organizationId: "b", role: "member" }
          ],
          grants: [
            { subjectId: "member-a", organizationId: "a", codes },
            { subjectId: "member-b", organizationId: "b", codes: ["home"] }
          ],
          balances: {
            "member-a": { minor: 5000, currency: "USD" },
            "member-b": { minor: 10000, currency: "USD" }
          }
        }
      },
      `import { test, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import "./i18n"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, permissionSession, permissionMock, walletApi, ordersApi, actor } from "./features/application/runtime"
import { createPurchaseRegistry } from "./features/orders/purchase"
import { createIdentitySession } from "./features/identity/session"
import { createIdentityRuntime } from "./features/identity/runtime"
import { createIdentityCredentials } from "./data/storage/identityCredentials"
import type { Order } from "./data/api/commerce/price"
/** 实际页面接线：购买扣一次款，撤权撤下弹窗，组织切换改变同一主体授权。 */
test("wired purchase and permissions follow the current organization", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "demo", password: "demo" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/catalog"] }) })' : 'createExtensionRouter("popup")'}
  ${host === "extension" ? 'await router.navigate({ to: "/catalog" })' : ""}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByText("Notebook")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Resources" }))
  expect(screen.queryByText("Notebook")).not.toBeInTheDocument()
  expect(screen.getByText("Storage add-on")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Stationery" }))
  expect(screen.queryByText("Storage add-on")).not.toBeInTheDocument()
  expect(screen.getByText("$12.50")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Purchase" }))
  await user.click(await screen.findByRole("button", { name: "Confirm purchase" }))
  expect(await screen.findByText("Paid")).toBeInTheDocument()
  expect((await walletApi.read()).minor).toBe(3750)
  expect(await ordersApi.list()).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: "Close" }))
  await user.click(screen.getByRole("button", { name: "Purchase" }))
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  permissionMock.set({ subjectId: "member-a", organizationId: "a" }, ${JSON.stringify(codes.filter((code) => code !== "buy"))})
  await permissionSession.refresh()
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.queryByRole("button", { name: "Purchase" })).not.toBeInTheDocument()
  // 撤销全部组织业务权限后，账号仍可打开组织切换恢复入口。
  permissionMock.set({ subjectId: "member-a", organizationId: "a" }, [])
  await permissionSession.refresh()
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Switch organization" }))
  await user.selectOptions(await screen.findByLabelText("Current organization"), "b")
  expect(await screen.findByText("Access denied")).toBeInTheDocument()
  expect(actor()).toBe('member-b')
  expect(permissionSession.allow(["buy"])).toBe(false)
  expect(screen.queryByRole("link", { name: "Products" })).not.toBeInTheDocument()
  expect(screen.getByText("Member")).toBeInTheDocument()
  await router.navigate({ to: "/orders" })
  await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"))
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Sign out" }))
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument()
})
/** 关闭、重挂载与查询恢复复用同一未决请求；绝不因弹窗生命周期重放付款。 */
test("pending purchase survives reopening without replay", async () => {
  let stored: Order | null = null
  const create = vi.fn(async (_product: string, requestId: string): Promise<Order> => {
    stored = { id: "order", productId: "product", total: { minor: 1250, currency: "USD" }, status: "unpaid", requestId }
    return stored
  })
  const find = vi.fn(async () => stored)
  const pay = vi.fn(async (): Promise<Order> => { if (!stored) throw new Error("missing"); stored = { ...stored, status: "paid" }; throw new Error("timeout") })
  let scope = 1
  const registry = createPurchaseRegistry({ create, find, list: async () => [] }, { pay, read: async () => ({ minor: 0, currency: "USD" }) }, () => scope, () => {})
  const first = registry.get("product")
  await first.submit("product")
  expect(first.getSnapshot().phase).toBe("unknown")
  const reopened = registry.get("product")
  expect(reopened).toBe(first)
  await reopened.submit("product")
  expect(create).toHaveBeenCalledTimes(1)
  expect(pay).toHaveBeenCalledTimes(1)
  await reopened.recover()
  expect(reopened.getSnapshot().phase).toBe("paid")
  expect(find).toHaveBeenCalledTimes(1)
  scope += 1
  expect(registry.get("product")).not.toBe(first)
})
/** Token 接线失败不提交本次凭据，失败签发仍能窄化吊销。 */
test("transport rejection leaves no restorable credential", async () => {
  const storage = createIdentityCredentials()
  const revokeIssued = vi.fn(async () => {})
  const session = createIdentitySession({ login: async () => "bad-token", validate: async () => ({ id: "member" }), logout: async () => {}, revokeIssued }, storage, { setAuthToken() { throw new Error("invalid token") }, clearSession() {} })
  await expect(session.login({})).rejects.toThrow()
  expect(storage.read()).toBeNull()
  expect(revokeIssued).toHaveBeenCalledWith("bad-token")
})
/** 退出后的登录路由不能复用上一个作用域的挂起导航校验。 */
test("identity restore single flight is scoped", async () => {
  let finish: ((value: { id: string }) => void) | undefined
  const storage = createIdentityCredentials()
  storage.compareAndSet(null, "token")
  const runtime = createIdentityRuntime({ api: { login: async () => "next", validate: () => new Promise((resolve) => { finish = resolve }), logout: async () => {} }, storage, transport: { setAuthToken() {}, clearSession() {} }, clearPrivateData() {} })
  const previous = runtime.ensure()
  const rejected = expect(previous).rejects.toMatchObject({ code: "superseded" })
  await runtime.logout()
  const next = runtime.ensure()
  expect(next).not.toBe(previous)
  await expect(next).rejects.toMatchObject({ code: "anonymous" })
  finish?.({ id: "member" })
  await rejected
})
`
    )
    expect(result).toMatch(/Tests\s+4 passed/)
  },
  90_000
)

/** 扩展操作没有实际页面时不能被模板的 resolved 清单伪装成已实现。 */
test("rejects production Mock and delegates unsupported operations to domain implementation", () => {
  expect(() =>
    productionFiles(new Map(), {
      selection: { host: "web", operations: ["identity.register"] },
      homePageSource: HOME_SOURCE,
      dataMode: "adapter",
      adapters: { identity: "export const api = {}" }
    })
  ).toThrow("领域 Skill")
  expect(() =>
    productionFiles(new Map(), {
      selection: { host: "web", modules: [] },
      homePageSource: HOME_SOURCE,
      dataMode: "mock" as "adapter"
    })
  ).toThrow("禁止业务 Mock")
})
