import { test, expect } from "vitest"
import { applicationFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"
import { resolveCapabilitySelection } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 所选用户只有基础会话，购买依赖闭包不附带组织、权限、注册或找回。 */
test("resolves only explicit operation dependencies", () => {
  const identity = resolveCapabilitySelection({ host: "web", modules: ["identity"] })
  expect(identity.modules.map((item) => item.id)).toEqual(["identity"])
  const purchase = resolveCapabilitySelection({
    host: "extension",
    operations: ["orders.purchase"]
  })
  expect(purchase.resolved).toContain("identity.session")
  expect(purchase.requiredBy["identity.session"]).toContain("orders.create")
  expect(purchase.modules.map((item) => item.id).sort()).toEqual([
    "catalog",
    "identity",
    "orders",
    "wallet-payments"
  ])
  expect(resolveCapabilitySelection({ host: "web", modules: ["orders"] }).resolved).toEqual([
    "orders.read"
  ])
  expect(() =>
    resolveCapabilitySelection({ host: "web", operations: ["identity.register"] })
  ).toThrow(/未知/)
})

/** 没有真实首页、接口实现或可信权限码时，在写入前拒绝伪完成。 */
test("requires a real homepage and complete wiring inputs", () => {
  const base = new Map([["user-file", "keep"]])
  expect(() =>
    applicationFiles(base, {
      selection: { host: "web", modules: [] },
      homePageSource: "",
      dataMode: "mock"
    })
  ).toThrow(/HomePage/)
  expect(() =>
    applicationFiles(base, {
      selection: { host: "web", modules: ["identity"] },
      homePageSource: HOME_SOURCE,
      dataMode: "adapter"
    })
  ).toThrow(/adapter/)
  expect(() =>
    applicationFiles(base, {
      selection: { host: "web", modules: ["permissions"] },
      homePageSource: HOME_SOURCE,
      dataMode: "mock",
      fixtures: {
        accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }]
      }
    })
  ).toThrow(/权限码/)
  expect([...base]).toEqual([["user-file", "keep"]])
})

/** 两宿主基础应用真实运行需求正文，用户能力则额外接入登录、主界面身份和 Token。 */
test.each(["web", "extension"] as const)(
  "compiles and runs %s application wiring",
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
      `import { test, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import "./i18n"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { applicationHttp } from "./data/api/client/httpRuntime"
/** 验证创建结果包含真实业务交互与完整基础认证接线。 */
test("login guards the real home and synchronizes request token", async () => {
  await i18n.changeLanguage("en")
  const user = userEvent.setup()
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByRole("heading", { name: "Sign in", level: 1 })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Text tool" })).not.toBeInTheDocument()
  await user.type(screen.getByLabelText(/Account/), "demo")
  await user.type(screen.getByLabelText(/Password/), "demo")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
  expect(await screen.findByRole("heading", { name: "Text tool" })).toBeInTheDocument()
  expect(screen.getByText("Member")).toBeInTheDocument()
  await user.type(screen.getByLabelText("Input"), "hello")
  await user.click(screen.getByRole("button", { name: "Run" }))
  expect(screen.getByRole("status")).toHaveTextContent("HELLO")
  const fetch = vi.fn(async (request: Request) => { expect(request.headers.get("X-AUTH-TOKEN")).not.toBeNull(); const response = new Response("{}", { status: 200 }); Object.defineProperty(response, "url", { value: request.url }); return response })
  vi.stubGlobal("fetch", fetch)
  await applicationHttp.request("probe")
  expect(fetch).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Sign out" }))
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText("Member")).not.toBeInTheDocument())
  await user.type(screen.getByLabelText(/Account/), "demo")
  await user.type(screen.getByLabelText(/Password/), "demo")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
  expect(await screen.findByRole("heading", { name: "Text tool" })).toBeInTheDocument()
  fetch.mockImplementation(async (request: Request) => {
    const response = new Response(null, { status: 403 })
    Object.defineProperty(response, "url", { value: request.url })
    return response
  })
  await expect(applicationHttp.request("denied")).rejects.toThrow()
  expect(screen.getByText("Member")).toBeInTheDocument()
  fetch.mockImplementation(async (request: Request) => {
    const response = new Response(null, { status: 401 })
    Object.defineProperty(response, "url", { value: request.url })
    return response
  })
  await expect(applicationHttp.request("expired")).rejects.toThrow()
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText("Member")).not.toBeInTheDocument())
  vi.unstubAllGlobals()
})
`
    )
    expect(output).toMatch(/Tests\s+1 passed/)
  },
  90_000
)

/** 只读服务无需实现未选的写接口，基础主界面仍必须具备真实需求功能。 */
test.each(["web", "extension"] as const)(
  "supports %s readonly adapters without user or write APIs",
  async (host) => {
    const result = await runApplicationFixture(
      {
        selection: { host, operations: ["orders.read"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter",
        adapters: {
          orders: `import type { OrdersReadApi } from "./contracts"
/** 当前只读契约的测试实现，没有创建或恢复写接口。 */
export const api: OrdersReadApi = {
  /** 返回真实服务契约允许的空读取结果。 */
  async list() { return [] }
}\n`
        }
      },
      `import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import "./i18n"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
/** 未启用身份时直接运行真实工具正文，所选只读页有独立路由。 */
test("real home and independent readonly page", async () => {
  await i18n.changeLanguage("en")
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByRole("heading", { name: "Text tool" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  await user.type(screen.getByLabelText("Input"), "local")
  await user.click(screen.getByRole("button", { name: "Run" }))
  expect(screen.getByRole("status")).toHaveTextContent("LOCAL")
  await user.click(screen.getByRole("link", { name: "Orders" }))
  expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument()
  expect(await screen.findByText("No records yet.")).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/orders")
  expect(screen.queryByRole("button", { name: "Purchase" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("link", { name: "Settings" }))
  expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument()
  await user.click(screen.getByRole("link", { name: "Back" }))
  expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument()
})
`
    )
    expect(result).toMatch(/Tests\s+1 passed/)
  },
  90_000
)

/** 组合内部写节点不冒充独立已接线功能，购买 recipe 的宿主不受旧演示限制。 */
test("rejects internal write requests and resolves purchase recipes on both hosts", () => {
  for (const operation of ["orders.create", "wallet-payments.pay"]) {
    expect(() => resolveCapabilitySelection({ host: "web", operations: [operation] })).toThrow(
      /内部接线操作/
    )
  }
  for (const host of ["web", "extension"] as const) {
    expect(resolveCapabilitySelection({ host, recipe: "purchase-checkout" }).resolved).toEqual(
      resolveCapabilitySelection({ host, operations: ["orders.purchase"] }).resolved
    )
  }
})

/** 重复装配或遇到既有业务路由时零改写，防止能力升级覆盖产品。 */
test("refuses full initialization over an existing product", () => {
  const options = {
    selection: { host: "web", modules: [] },
    homePageSource: HOME_SOURCE,
    dataMode: "mock"
  } as const
  for (const name of [
    ".harness/application-wiring.json",
    "src/routes/custom.tsx",
    "src/features/home/HomePage.tsx"
  ]) {
    const existing = new Map([[name, "user-owned"]])
    expect(() => applicationFiles(existing, options)).toThrow(/已有/)
    expect(existing.get(name)).toBe("user-owned")
  }
})

/** 返回快照包含旧中性入口的删除差异，避免实际文件路由生成发生根首页冲突。 */
test("replaces neutral routes while preserving unrelated baseline files", () => {
  const base = new Map([
    ["src/routes/index.tsx", 'export const Route = createFileRoute("/")({})'],
    ["src/routes/__root.tsx", "neutral root"],
    ["src/app/RootLayout.tsx", "neutral layout"],
    ["src/app/RootLayout.test.tsx", "neutral layout test"],
    ["src/features/local/owned.ts", "keep"]
  ])
  const files = applicationFiles(base, {
    selection: { host: "web", modules: [] },
    homePageSource: HOME_SOURCE,
    dataMode: "mock"
  })
  for (const name of [
    "src/routes/index.tsx",
    "src/app/RootLayout.tsx",
    "src/app/RootLayout.test.tsx"
  ])
    expect(files.has(name), name).toBe(false)
  expect(files.has("src/routes/_application/index.tsx")).toBe(true)
  expect(files.get("src/features/local/owned.ts")).toBe("keep")
  expect(base.get("src/routes/__root.tsx")).toBe("neutral root")
})

/** 动态生成的会话、接口和接线文件同样拒绝覆盖已有实现。 */
test.each(["web", "extension"] as const)("protects generated %s capability owners", (host) => {
  const options = {
    selection: { host, operations: ["orders.purchase"] },
    homePageSource: HOME_SOURCE,
    dataMode: "mock",
    fixtures: {
      accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }]
    }
  } satisfies ApplicationOptions
  for (const target of [
    "src/features/application/runtime.ts",
    "src/features/application/Application.tsx",
    "src/features/application/routeAccess.ts",
    "src/features/application/settingsNavigation.ts",
    "src/features/application/navigation.ts",
    "src/i18n/application.ts",
    "src/features/identity/session.ts",
    "src/features/identity/session.test.ts",
    "src/features/orders/purchase.ts",
    "src/features/orders/PurchasePanel.tsx",
    "src/data/api/identity/mock.ts",
    "src/data/api/commerce/price.ts"
  ]) {
    const existing = new Map([[target, "user-owned"]])
    expect(() => applicationFiles(existing, options), target).toThrow(/已有/)
    expect([...existing]).toEqual([[target, "user-owned"]])
  }
  const adapter = "src/data/api/orders/adapter.ts"
  const existing = new Map([[adapter, "user-owned"]])
  expect(() =>
    applicationFiles(existing, {
      selection: { host, operations: ["orders.read"] },
      homePageSource: HOME_SOURCE,
      dataMode: "adapter",
      adapters: { orders: "export const api = { async list() { return [] } }" }
    })
  ).toThrow(/已有/)
  expect([...existing]).toEqual([[adapter, "user-owned"]])
})
