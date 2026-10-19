import { expect, test } from "vitest"
import { applicationFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 项目正文可替换，仍从注入的唯一 API 和 Query 读取当前作用域数据。 */
const CATALOG_SOURCE = `import { useQuery } from "@tanstack/react-query"
import type { CatalogApi } from "../../data/api/catalog/contracts"
/** 已确认项目的自定义商品正文，沿用固定接线 props。 */
export function CatalogPage({ api, scope }: { api: CatalogApi; scope: number }) {
  const query = useQuery({ queryKey: ["catalog", scope], queryFn: ({ signal }) => api.list(signal) })
  return <section><h1>Project inventory</h1>{query.data?.map((item) => <p key={item.id}>{item.name}</p>)}</section>
}\n`

/** 定制只覆盖显式内容，不能隐藏启用条件、伪造组件或重写身份资源。 */
test("rejects invalid or unselected content without mutating the base", () => {
  const base = new Map([["keep", "original"]])
  const options = {
    selection: { host: "web", modules: [] },
    homePageSource: HOME_SOURCE,
    dataMode: "mock"
  } as const
  expect(() =>
    applicationFiles(base, { ...options, content: { pageSources: { catalog: CATALOG_SOURCE } } })
  ).toThrow(/已选能力/)
  expect(() =>
    applicationFiles(base, {
      ...options,
      selection: { host: "web", modules: ["catalog"] },
      content: { pageSources: { catalog: "export function OtherPage() {}" } }
    })
  ).toThrow(/固定组件/)
  expect(() =>
    applicationFiles(base, {
      ...options,
      content: JSON.parse('{"translations":{"en":{"projectName":"override"}}}')
    })
  ).toThrow(/项目身份/)
  expect([...base]).toEqual([["keep", "original"]])
})

/** 在两种宿主中，定制表单文案和页面正文仍受原路由守卫保护，所有接口零联网。 */
test.each(["web", "extension"] as const)(
  "runs %s customized content through the existing wiring",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, modules: ["identity", "catalog"] },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        content: {
          translations: {
            en: { identityIntroTitle: "Access project tools", catalogTitle: "Subscriptions" }
          },
          pageSources: { catalog: CATALOG_SOURCE }
        },
        fixtures: {
          accounts: [{ id: "u", account: "demo", password: "demo", displayName: "Member" }],
          products: [
            {
              id: "p",
              name: "Custom item",
              description: "Project description",
              category: "Services",
              price: { minor: 1000, currency: "USD" }
            }
          ]
        }
      },
      `import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
/** 内容覆盖不跳过匿名守卫；偏好进入公开设置，离开认证页销毁凭据输入。 */
test("custom content stays guarded and mocked", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
  await i18n.changeLanguage("en")
  const user = userEvent.setup()
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/catalog"] }) })' : 'createExtensionRouter("popup")'}
  render(<Providers><RouterProvider router={router} /></Providers>)
  expect(await screen.findByText("Access project tools")).toBeInTheDocument()
  expect(screen.queryByText("Custom item")).not.toBeInTheDocument()
  await user.type(screen.getByLabelText(/Account/), "demo")
  expect(screen.queryByRole("combobox", { name: "Language" })).not.toBeInTheDocument()
  expect(screen.getByLabelText(/Account/)).toHaveAttribute("placeholder", "Enter your account")
  await user.click(screen.getByRole("link", { name: "Settings" }))
  await screen.findByRole("heading", { name: "Settings", level: 1 })
  await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "zh")
  await user.selectOptions(screen.getByRole("combobox", { name: "语言" }), "en")
  await user.click(screen.getByRole("link", { name: "Back" }))
  await screen.findByRole("heading", { name: "Sign in", level: 1 })
  expect(screen.getByLabelText(/Account/)).toHaveValue("")
  await user.type(screen.getByLabelText(/Account/), "demo")
  await user.type(screen.getByLabelText(/Password/), "demo")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
  await user.click(await screen.findByRole("link", { name: "Subscriptions" }))
  expect(await screen.findByRole("heading", { name: "Project inventory" })).toBeInTheDocument()
  expect(await screen.findByText("Custom item")).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Sign out" }))
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.queryByText("Custom item")).not.toBeInTheDocument()
  vi.unstubAllGlobals()
})
`
    )
    expect(output).toMatch(/Tests\s+1 passed/)
  },
  90_000
)

/** 幂等关联采用结构化主体，分隔符相同不能让其他账号命中旧支付。 */
test("isolates payment request keys across subjects", async () => {
  const output = await runApplicationFixture(
    {
      selection: { host: "web", operations: ["orders.purchase"] },
      homePageSource: HOME_SOURCE,
      dataMode: "mock",
      fixtures: {
        accounts: [{ id: "u", account: "demo", password: "demo", displayName: "Member" }]
      }
    },
    `import { test, expect, vi } from "vitest"
import { createOrdersMock } from "./data/api/orders/mock"
import { createWalletMock } from "./data/api/wallet-payments/mock"
/** 两个主体分别付款，重复提交仍只扣款一次。 */
test("structured payment isolation", async () => {
  vi.stubGlobal("fetch", vi.fn())
  let subject = "a"
  const orders = createOrdersMock(() => subject, [{ id: "p", name: "Item", description: "", price: { minor: 100, currency: "CNY" } }])
  const wallet = createWalletMock(() => subject, { a: { minor: 1000, currency: "CNY" }, "a:b": { minor: 1000, currency: "CNY" } }, orders.settle)
  const first = await orders.api.create("p", "first")
  await wallet.pay(first.id, "b:c")
  subject = "a:b"
  const second = await orders.api.create("p", "second")
  expect((await wallet.pay(second.id, "c")).status).toBe("paid")
  expect((await wallet.pay(second.id, "c")).status).toBe("paid")
  expect((await wallet.read()).minor).toBe(900)
  subject = "a"
  expect((await wallet.read()).minor).toBe(900)
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
`
  )
  expect(output).toMatch(/Tests\s+1 passed/)
}, 90_000)
