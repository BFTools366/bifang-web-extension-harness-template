import { expect, test } from "vitest"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 两宿主以前端权限 code 控制入口，后端替身独立验证对象拥有关系。 */
test.each(["web", "extension"] as const)(
  "enforces %s organization ownership",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["organization.manage", "organization.switch"] },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        pagePermissions: { "/": ["home"], "/organization/manage": ["manage-page"] },
        actionPermissions: { "organization.manage": ["manage"] },
        fixtures: {
          accounts: [
            { id: "owner", account: "owner", password: "demo", displayName: "Owner" },
            { id: "viewer", account: "viewer", password: "demo", displayName: "Viewer" }
          ],
          organizations: [
            { id: "own", name: "Personal team", ownerAccountId: "owner" },
            { id: "joined", name: "Another team", ownerAccountId: "another" }
          ],
          organizationUsers: [
            { id: "owner-own", accountId: "owner", organizationId: "own", role: "owner" },
            { id: "owner-joined", accountId: "owner", organizationId: "joined", role: "member" },
            { id: "viewer-own", accountId: "viewer", organizationId: "own", role: "member" }
          ],
          grants: [
            {
              subjectId: "owner-own",
              organizationId: "own",
              codes: ["home", "manage", "manage-page"]
            },
            { subjectId: "owner-joined", organizationId: "joined", codes: [] },
            {
              subjectId: "viewer-own",
              organizationId: "own",
              codes: ["home", "manage", "manage-page"]
            }
          ]
        }
      },
      `import { expect, test, vi } from "vitest"
import { render, screen, within, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import i18n from "./i18n"
import "./i18n/application"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, organizationService, ensureOrganization, permissionSession, applicationScope, actor } from "./features/application/runtime"
import { createOrganizationMock } from "./data/api/organization/mock"
import { permissionMock } from "./data/api/permissions/adapter"
/** 管理操作同时要求当前组织用户与可信权限，名称刷新进入切换弹窗。 */
test("owner rename synchronizes shared context and viewer cannot bypass gates", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "owner", password: "demo" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  const user = userEvent.setup()
  const view = render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Text tool" })
  expect(actor()).toBe("owner-own")
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("link", { name: "Organization settings" }))
  await screen.findByRole("heading", { name: "Organization management" })
  expect(await screen.findByRole("textbox", { name: /Organization name/ })).toHaveAttribute("placeholder", "Enter the organization name")
  await act(async () => { await i18n.changeLanguage("zh") })
  expect(await screen.findByRole("textbox", { name: /组织名称/ })).toHaveAttribute("placeholder", "请输入组织名称")
  await act(async () => { await i18n.changeLanguage("en") })
  const input = await screen.findByRole("textbox", { name: /Organization name/ })
  await user.clear(input)
  await user.type(input, "  Renamed team  ")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Organization updated.")
  expect(input).toHaveValue("Renamed team")
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Renamed team" }))
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByRole("option", { name: "Renamed team" })).toBeDisabled()
  await user.selectOptions(within(dialog).getByLabelText("Current organization"), "joined")
  await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await expect(organizationService.rename("own", "forged")).rejects.toThrow("organization_denied")
  // 恢复页独立于已撤销的业务权限，管理页没有这一豁免。
  await user.click(screen.getByRole("link", { name: "Switch organization" }))
  const recovery = await screen.findByLabelText("Current organization")
  await user.selectOptions(recovery, "own")
  await waitFor(() => expect(actor()).toBe("owner-own"))
  await act(async () => { await identitySession.logout(); await identitySession.login({ account: "viewer", password: "demo" }); await router.navigate({ to: "/" }) })
  await screen.findByRole("heading", { name: "Text tool" })
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await screen.findByRole("menu")
  expect(screen.queryByRole("menuitem", { name: "Switch organization" })).not.toBeInTheDocument()
  // 相同有效 code 具有相同前端入口，不按 viewer/owner 名称区别授权。
  expect(screen.getByRole("link", { name: "Organization settings" })).toBeInTheDocument()
  await user.keyboard("{Escape}")
  await act(async () => { await router.navigate({ to: "/organization/manage" }) })
  await screen.findByRole("heading", { name: "Organization management" })
  await expect(organizationService.rename("own", "forged")).rejects.toThrow("organization_denied")
  await act(async () => { permissionMock.set({ subjectId: "viewer-own", organizationId: "own" }, ["home"]); await permissionSession.refresh(); await router.invalidate({ sync: true }) })
  await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"))
  await expect(organizationService.rename("own", "forged")).rejects.toThrow("organization_denied")
  const revision = applicationScope.getSnapshot().revision
  const permissionRead = vi.spyOn(permissionSession, "refresh")
  await organizationService.switch("own")
  expect(applicationScope.getSnapshot().revision).toBe(revision)
  expect(permissionRead).not.toHaveBeenCalled()
  permissionRead.mockRestore()
  view.unmount()
})
/** 即使绕过 UI 与服务 facade，Mock API 也不接受 viewer、跨组织或空名称写入。 */
test("API revalidates active membership and owner", async () => {
  let account = "owner"
  let authorized = true
  const api = createOrganizationMock(() => account,
    [{ id: "own", name: "Original", ownerAccountId: "owner" }],
    [{ id: "owner-own", accountId: "owner", organizationId: "own", role: "owner" },
     { id: "viewer-own", accountId: "viewer", organizationId: "own", role: "member" }], () => authorized)
  await expect(api.rename("own", "  ")).rejects.toThrow("organization_name_invalid")
  await expect(api.rename("other", "forged")).rejects.toThrow("organization_denied")
  account = "viewer"
  await expect(api.rename("own", "forged")).rejects.toThrow("organization_denied")
  account = "owner"
  authorized = false
  await expect(api.rename("own", "Denied")).rejects.toThrow("organization_denied")
  authorized = true
  await api.rename("own", "Accepted")
  expect((await api.read()).available[0]?.name).toBe("Accepted")
  await ensureOrganization()
})
`
    )
    expect(output).toMatch(/Tests\s+2 passed/)
  },
  90_000
)

/** 只选管理时真实 adapter 只需 read+rename，不能强迫实现未选的切换。 */
test.each(["web", "extension"] as const)(
  "supports %s management without switch API",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["organization.manage"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter",
        pagePermissions: { "/": ["read"], "/organization/manage": ["manage"] },
        actionPermissions: { "organization.manage": ["manage"] },
        adapters: {
          identity: `import type { LoginApi } from "./contracts"
/** 隔离测试只签发固定身份，不连接远端。 */
export const api: LoginApi = {
  /** 演示凭据仅供当前测试。 */
  async login() { return "fixture" },
  /** 固定账号与组织拥有者一致。 */
  async validate() { return { id: "owner" } },
  /** 当前测试没有远端吊销。 */
  async logout() {}
}`,
          permissions: `import type { PermissionApi } from "./contracts"
/** 明确只授予管理与读取，没有切换权限要求。 */
export const api: PermissionApi = {
  /** 当前组织用户的显式授权。 */
  async read() { return ["read", "manage"] }
}`,
          organization: `import type { OrganizationManagementApi } from "./contracts"
let name = "Only team"
/** 最小可信管理 adapter 没有 switch 方法。 */
export const api: OrganizationManagementApi = {
  /** 按当前账号返回唯一拥有者成员关系。 */
  async read() { return { current: "own", available: [{ id: "own", name, ownerAccountId: "owner", user: { id: "owner-own", accountId: "owner", organizationId: "own", role: "owner" } }] } },
  /** 服务端仍负责真实 owner 校验，本测试只隔离前端最小方法合同。 */
  async rename(_id, value) { name = value }
}`
        }
      },
      `import { test, expect, vi } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import i18n from "./i18n"
import "./i18n/application"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, organizationService } from "./features/application/runtime"
import { api } from "./data/api/organization/adapter"
import { OrganizationManagementPage } from "./features/organization/OrganizationManagementPage"
/** 写入成功但刷新失败保留新名称，恢复只读且不重放改名。 */
test("management needs no switch and recovers a failed post-save read", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "owner", password: "fixture" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/organization/manage"] }) })' : 'createExtensionRouter("popup")'}
  ${host === "extension" ? 'await router.navigate({ to: "/organization/manage" })' : ""}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  const input = await screen.findByRole("textbox", { name: /Organization name/ })
  expect(input).toHaveValue("Only team")
  const reading = vi.spyOn(api, "read").mockRejectedValueOnce(new Error("offline"))
  const writing = vi.spyOn(api, "rename")
  await user.clear(input)
  await user.type(input, "Saved team")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Name saved. Refresh organization details to synchronize the display.")
  expect(input).toHaveValue("Saved team")
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
  reading.mockRestore()
  // 读取错误面板和成功写入恢复提示各有重试；任意一个只读取，不再次写。
  await user.click(screen.getAllByRole("button", { name: "Retry" })[0]!)
  await screen.findByText("Organization updated.")
  expect(screen.queryByText("Name saved. Refresh organization details to synchronize the display.")).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole("textbox", { name: /Organization name/ })).toHaveValue("Saved team"))
  expect(writing).toHaveBeenCalledTimes(1)
  await expect(organizationService.switch("own")).rejects.toThrow("organization_switch_unavailable")
  await user.click(screen.getByRole("button", { name: /User center/ }))
  expect(await screen.findByRole("link", { name: "Organization settings" })).toBeInTheDocument()
  expect(screen.queryByRole("menuitem", { name: "Switch organization" })).not.toBeInTheDocument()
})
/** 编辑草稿会撤销旧恢复提示的所有权，不把未提交文字标成已保存。 */
test("late read recovery cannot mark a new draft saved", async () => {
  const user = userEvent.setup()
  const context = { current: "own", available: [{ id: "own", name: "Confirmed", ownerAccountId: "owner", user: { id: "owner-own", accountId: "owner", organizationId: "own", role: "owner" as const } }] }
  const reading = vi.fn(async () => context)
  const writing = vi.fn(async (_id: string, name: string) => ({ name, refreshed: false }))
  render(<Providers><OrganizationManagementPage api={{ read: reading, rename: writing }} scope={999} authorize={() => {}} isCurrent={() => true} /></Providers>)
  const input = await screen.findByRole("textbox", { name: /Organization name/ })
  await user.clear(input)
  await user.type(input, "Committed")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Name saved. Refresh organization details to synchronize the display.")
  let finish: ((value: typeof context) => void) | undefined
  reading.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(finish).toBeDefined()
  await user.clear(input)
  await user.type(input, "Unsubmitted draft")
  await act(async () => { finish?.({ ...context, available: context.available.map((row) => ({ ...row, name: "Committed" })) }) })
  expect(input).toHaveValue("Unsubmitted draft")
  expect(screen.queryByText("Organization updated.")).not.toBeInTheDocument()
  expect(writing).toHaveBeenCalledTimes(1)
})

/** 保存期间的旧错误恢复入口不能撤销当前写入的结果所有权。 */
test("read recovery during a pending save cannot strand the form", async () => {
  const user = userEvent.setup()
  const context = { current: "own", available: [{ id: "own", name: "Confirmed", ownerAccountId: "owner", user: { id: "owner-own", accountId: "owner", organizationId: "own", role: "owner" as const } }] }
  const reading = vi.fn(async () => context)
  const writing = vi.fn(async (_id: string, name: string) => ({ name, refreshed: false }))
  render(<Providers><OrganizationManagementPage api={{ read: reading, rename: writing }} scope={1001} authorize={() => {}} isCurrent={() => true} /></Providers>)
  const input = await screen.findByRole("textbox", { name: /Organization name/ })
  await user.clear(input)
  await user.type(input, "First save")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Name saved. Refresh organization details to synchronize the display.")
  reading.mockRejectedValueOnce(new Error("offline"))
  await user.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByRole("alert")
  await user.clear(input)
  await user.type(input, "Second save")
  let finishWrite: ((value: { name: string; refreshed: boolean }) => void) | undefined
  writing.mockImplementationOnce(() => new Promise((resolve) => { finishWrite = resolve }))
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  expect(input).toBeDisabled()
  const reads = reading.mock.calls.length
  await user.click(screen.getByRole("button", { name: "Retry page" }))
  expect(reading).toHaveBeenCalledTimes(reads)
  await act(async () => { finishWrite?.({ name: "Second save", refreshed: true }) })
  await screen.findByText("Organization updated.")
  expect(input).not.toBeDisabled()
  expect(input).toHaveValue("Second save")
  expect(writing).toHaveBeenCalledTimes(2)
})

`
    )
    expect(output).toMatch(/Tests\s+3 passed/)
  },
  90_000
)
