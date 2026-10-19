import { expect, test } from "vitest"
import { applicationFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 只读订单只生成读取实现，不带未选择的身份、购买或写入代码。 */
test.each(["web", "extension"] as const)(
  "keeps %s readonly orders minimal and recoverable",
  async (host) => {
    const options = {
      selection: { host, operations: ["orders.read"] },
      homePageSource: HOME_SOURCE,
      dataMode: "mock",
      fixtures: {
        orders: {
          "": [
            {
              id: "public-order",
              productId: "p",
              total: { minor: 100, currency: "USD" },
              status: "paid",
              requestId: "r"
            }
          ]
        }
      }
    } satisfies ApplicationOptions
    const files = applicationFiles(new Map(), options)
    expect(files.has("src/data/api/orders/readMock.ts")).toBe(true)
    for (const name of [
      "src/data/api/orders/mock.ts",
      "src/features/orders/purchase.ts",
      "src/features/orders/PurchasePanel.tsx",
      "src/features/identity/session.ts"
    ])
      expect(files.has(name), name).toBe(false)
    const output = await runApplicationFixture(
      options,
      `import { test, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { createOrdersReadMock } from "./data/api/orders/readMock"
import { ordersApi } from "./features/application/runtime"
import { OrdersPage } from "./features/orders/OrdersPage"
import { ApiError } from "./data/api/client/httpClient"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { AppProviders as Providers } from "./app/AppProviders"\nimport { queryClient } from "./app/queryClient"' : 'import { Providers, queryClient } from "./providers"'}
/** 读取快照和取消具有真实语义，未选写入方法在运行时也不存在。 */
test("readonly fixture isolates subjects and snapshots", async () => {
  const rows = await ordersApi.list()
  expect(rows.map((row) => row.id)).toEqual(["public-order"])
  expect(Object.keys(ordersApi)).toEqual(["list"])
  rows[0].total.minor = 999
  expect((await ordersApi.list())[0].total.minor).toBe(100)
  let actor: string | null = "member"
  const api = createOrdersReadMock(() => actor, { member: rows })
  expect(await api.list()).toHaveLength(1)
  actor = "other"
  expect(await api.list()).toEqual([])
  const controller = new AbortController(); controller.abort()
  await expect(api.list(controller.signal)).rejects.toThrow()
})
/** adapter 的403使用既有错误分类，不把拒绝访问当作可重放读取。 */
test("forbidden adapter feedback has no retry", async () => {
  await i18n.changeLanguage("en")
  const list = vi.fn(async () => { throw new ApiError({ kind: "http", status: 403, code: "forbidden", retryable: false, message: "private detail" }) })
  render(<Providers><OrdersPage api={{ list }} scope={700} /></Providers>)
  await screen.findByRole("alert")
  expect(screen.queryByRole("button", { name: /Retry/i })).not.toBeInTheDocument()
  expect(screen.queryByText("private detail")).not.toBeInTheDocument()
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  expect(queryClient.getQueryState(["orders", 700, "en"])?.status).toBe("error")
})
`
    )
    expect(output).toMatch(/Tests\s+2 passed/)
  },
  90_000
)
