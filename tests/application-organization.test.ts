import { expect, test } from "vitest"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 两宿主使用可信 adapter 的真实契约，覆盖 Mock 默认组织无法触发的恢复分支。 */
test.each(["web", "extension"] as const)(
  "recovers %s organization selection without losing the current identity",
  async (host) => {
    const result = await runApplicationFixture(
      {
        selection: { host, operations: ["organization.switch", "permissions.enforce"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter",
        pagePermissions: { "/": ["home"], "/organization": ["organization"] },
        actionPermissions: { "organization.switch": ["switch"] },
        adapters: {
          permissions: `import type { PermissionApi } from "./contracts"
/** 当前测试角色只提供本轮明确的页面和切换权限。 */
export const api: PermissionApi = {
  /** 所有刷新消费同一可信服务，不授予未选业务权限。 */
  async read() { return ["home", "organization", "switch"] }
}\n`,
          identity: `import type { LoginApi } from "./contracts"
/** 当前测试服务保持独立身份，不通过组织切换替换主体。 */
export const api: LoginApi = {
  /** 签发本次隔离测试的内存凭据。 */
  async login() { return "fixture-credential" },
  /** 返回已经由测试契约确认的最小主体。 */
  async validate() { return { id: "member", displayName: "Member" } },
  /** 当前隔离测试不访问外部认证服务。 */
  async logout() {}
}\n`,
          organization: `import type { OrganizationApi, OrganizationMembership } from "./contracts"
/** 模拟可信服务的当前组织，初始只有一个选项但尚未选择。 */
export const fixture: { current: string | null; available: OrganizationMembership[] } = {
  current: null, available: [{ id: "a", name: "Team A", ownerAccountId: "member", user: { id: "member-a", accountId: "member", organizationId: "a", role: "owner" } }]
}
/** 真实 adapter 契约允许尚未选择组织，写结果仍由后续读取确认。 */
export const api: OrganizationApi = {
  /** 返回服务的当前快照，不复制到第二个前端 owner。 */
  async read() { return { current: fixture.current, available: fixture.available } },
  /** 只改变当前组织，测试在此注入已提交但响应未知的失败。 */
  async switch(id) { fixture.current = id }
}\n`
        }
      },
      `import { test, expect, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
import "./i18n/application"
import i18n from "./i18n"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, organizationService, ensureOrganization, applicationScope, permissionSession, actor } from "./features/application/runtime"
import { api, fixture } from "./data/api/organization/adapter"
import { api as permissionApi } from "./data/api/permissions/adapter"
/** 第一个组织必须可选，服务确认后才恢复私有正文。 */
test("selects a single organization from an unselected context", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "demo", password: "demo" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/organization"] }) })' : 'createExtensionRouter("popup")'}
  ${host === "extension" ? 'await router.navigate({ to: "/organization" })' : ""}
  render(<Providers><RouterProvider router={router} /></Providers>)
  const user = userEvent.setup()
  const radio = await screen.findByRole("radio", { name: /Team A/ })
  expect(radio).toBeEnabled()
  await user.click(radio)
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Switch organization" }))
  await waitFor(() => expect(actor()).toBe("member-a"))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(identitySession.getSnapshot().identity?.id).toBe("member")
})
/** 响应超时先查询；已提交结果成功，明确未提交仍报错且保留已确认身份。 */
test("queries an unknown write exactly once without replay", async () => {
  fixture.available = [{ id: "a", name: "Team A", ownerAccountId: "member", user: { id: "member-a", accountId: "member", organizationId: "a", role: "owner" } }, { id: "b", name: "Team B", ownerAccountId: "other", user: { id: "member-b", accountId: "member", organizationId: "b", role: "member" } }]
  fixture.current = "a"
  await ensureOrganization()
  const read = vi.spyOn(api, "read")
  const write = vi.spyOn(api, "switch").mockImplementationOnce(async (id) => {
    fixture.current = id
    throw new Error("timeout")
  })
  await organizationService.switch("b")
  expect(write).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
  expect(actor()).toBe('member-b')
  expect(applicationScope.getSnapshot().blocked).toBe(false)
  write.mockRejectedValueOnce(new Error("rejected"))
  await expect(organizationService.switch("a")).rejects.toThrow("rejected")
  expect(write).toHaveBeenCalledTimes(2)
  expect(read).toHaveBeenCalledTimes(2)
  expect(actor()).toBe('member-b')
  expect(identitySession.getSnapshot().identity?.id).toBe("member")
  const revision = applicationScope.getSnapshot().revision
  await organizationService.switch("b")
  expect(write).toHaveBeenCalledTimes(2)
  expect(read).toHaveBeenCalledTimes(2)
  expect(applicationScope.getSnapshot().revision).toBe(revision)
  read.mockRestore()
  write.mockRestore()
})
/** 读取失败或返回非法组织时关闭旧私有作用域，不把损坏上下文当作成功。 */
test("fails closed when the authoritative context cannot be confirmed", async () => {
  const read = vi.spyOn(api, "read").mockRejectedValueOnce(new Error("offline"))
  await expect(organizationService.switch("a")).rejects.toThrow("offline")
  expect(identitySession.getSnapshot().identity).toBeNull()
  read.mockRestore()
  await identitySession.login({ account: "demo", password: "demo" })
  const invalidRead = vi.spyOn(api, "read").mockResolvedValueOnce({ current: "unlisted", available: fixture.available })
  await expect(organizationService.switch("a")).rejects.toThrow("organization_invalid")
  expect(identitySession.getSnapshot().identity).toBeNull()
  invalidRead.mockRestore()
})
/** 旧切换的迟到查询不能采用新登录的组织或注销新会话。 */
test("ignores recovery superseded by a new identity revision", async () => {
  await identitySession.login({ account: "demo", password: "demo" })
  let finish: ((value: Awaited<ReturnType<typeof api.read>>) => void) | undefined
  const read = vi.spyOn(api, "read").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = organizationService.switch("b")
  const rejected = expect(pending).rejects.toThrow("organization_superseded")
  await waitFor(() => expect(finish).toBeDefined())
  await identitySession.logout()
  await identitySession.login({ account: "demo", password: "demo" })
  finish?.({ current: "b", available: fixture.available })
  await rejected
  expect(identitySession.getSnapshot().identity?.id).toBe("member")
  expect(applicationScope.getSnapshot().blocked).toBe(false)
  read.mockRestore()
})
/** 组织切换与导航共享同一权限读取，取消导航不能注销已切换身份。 */
test("shares permission recovery with concurrent and cancelled navigation", async () => {
  fixture.current = "a"
  await ensureOrganization()
  let finish: ((codes: readonly string[]) => void) | undefined
  const read = vi.spyOn(permissionApi, "read").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const switching = organizationService.switch("b")
  await waitFor(() => expect(finish).toBeDefined())
  const navigation = permissionSession.refresh()
  const controller = new AbortController()
  const cancelled = permissionSession.refresh(controller.signal)
  controller.abort(new Error("navigation_cancelled"))
  await expect(cancelled).rejects.toThrow("navigation_cancelled")
  finish?.(["home", "organization", "switch"])
  await Promise.all([switching, navigation])
  expect(read).toHaveBeenCalledTimes(1)
  expect(permissionSession.allow(["switch"])).toBe(true)
  expect(identitySession.getSnapshot().identity?.id).toBe("member")
  expect(applicationScope.getSnapshot().blocked).toBe(false)
  read.mockRejectedValueOnce(new Error("permission_unavailable"))
  await expect(organizationService.switch("a")).rejects.toThrow("permission_unavailable")
  expect(identitySession.getSnapshot().identity).toBeNull()
  read.mockRestore()
})
/** 更换 owner 会取消内部读取，旧结果不能重新授予新作用域。 */
test("aborts a shared permission read when the scope owner changes", async () => {
  await identitySession.login({ account: "demo", password: "demo" })
  fixture.current = "a"
  await ensureOrganization()
  let captured: AbortSignal | undefined
  const read = vi.spyOn(permissionApi, "read").mockImplementationOnce((_context, signal) => new Promise((_resolve, reject) => {
    captured = signal
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
  }))
  const pending = permissionSession.refresh()
  const rejected = expect(pending).rejects.toThrow("permission_superseded")
  const owned = applicationScope.begin()
  applicationScope.revoke()
  expect(applicationScope.getSnapshot()).toMatchObject({ revision: owned, blocked: true })
  await rejected
  expect(captured?.aborted).toBe(true)
  expect(permissionSession.allow(["home"])).toBe(false)
  read.mockRestore()
  applicationScope.finish(owned)
  await permissionSession.refresh()
  expect(permissionSession.allow(["home"])).toBe(true)
})
`
    )
    expect(result).toMatch(/Tests\s+6 passed/)
  },
  90_000
)
