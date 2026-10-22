import { expect, test } from "vitest"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 两宿主共享细权限，成员有相同有效码即可管理；最小设置不要求协作或切换接口。 */
test.each(["web", "extension"] as const)(
  "runs %s granular organization settings",
  async (host) => {
    const output = await runApplicationFixture(
      {
        selection: { host, operations: ["organization.manage"] },
        homePageSource: HOME_SOURCE,
        dataMode: "mock",
        pagePermissions: { "/": ["home"] },
        fixtures: {
          accounts: [{ id: "member", account: "demo", password: "demo", displayName: "Member" }],
          organizations: [{ id: "joined", name: "Joined team", ownerAccountId: "another" }],
          organizationUsers: [
            { id: "member-joined", accountId: "member", organizationId: "joined", role: "member" }
          ],
          grants: [
            {
              subjectId: "member-joined",
              organizationId: "joined",
              codes: ["home", "team.settings.read", "team.settings.update"]
            }
          ]
        }
      },
      `import { test, expect, vi } from "vitest"
import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider${host === "web" ? ", createRouter, createMemoryHistory" : ""} } from "@tanstack/react-router"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, organizationService, permissionSession, currentDataOwnership } from "./features/application/runtime"
import { permissionMock } from "./data/api/permissions/adapter"
import { api } from "./data/api/organization/adapter"
import { ApiError } from "./data/api/client/httpClient"
import i18n from "./i18n"
import "./i18n/application"
/** 真实页面按code授权；409保留草稿，未知写只读核对，撤权不注销身份。 */
test("member settings and write recovery", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "demo", password: "demo" })
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/organization/settings"] }) })' : 'createExtensionRouter("popup")'}
  ${host === "extension" ? 'await router.navigate({ to: "/organization/settings" })' : ""}
  const user = userEvent.setup()
  const view = render(<Providers><RouterProvider router={router} /></Providers>)
  let input = await screen.findByRole("textbox", { name: /Organization name/ })
  expect(input).toHaveValue("Joined team")
  expect(currentDataOwnership()?.organizationUserId).toBe("member-joined")
  const write = vi.spyOn(api, "rename")
  await user.clear(input); await user.type(input, "Renamed by member")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Updated.")
  expect((await api.read()).available[0]?.name).toBe("Renamed by member")
  write.mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, code: "conflict", message: "conflict", retryable: false }))
  await user.clear(input); await user.type(input, "Keep this draft")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText(/Another operation changed this record/)
  await user.click(screen.getByRole("button", { name: "Check result" }))
  expect(input).toHaveValue("Keep this draft")
  write.mockRejectedValueOnce(new ApiError({ kind: "timeout", code: "timeout", message: "timeout", retryable: false }))
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("The result needs checking. Refresh the data before another operation.")
  const count = write.mock.calls.length
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Check result" }))
  await waitFor(() => expect(input).toHaveValue("Renamed by member"))
  expect(write).toHaveBeenCalledTimes(count)
  // 已成功改名但读取失败仍保留表单恢复，禁止二次写入。
  const read = vi.spyOn(api, "read").mockRejectedValueOnce(new Error("offline"))
  await user.clear(input); await user.type(input, "Saved despite offline read")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("The result needs checking. Refresh the data before another operation.")
  expect(input).toHaveValue("Saved despite offline read")
  const savedCount = write.mock.calls.length
  read.mockRestore()
  await user.click(screen.getByRole("button", { name: "Check result" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled())
  expect(write).toHaveBeenCalledTimes(savedCount)
  await act(async () => { permissionMock.set({ subjectId: "member-joined", organizationId: "joined" }, ["home", "team.settings.read"]); await permissionSession.refresh(); await router.invalidate({ sync: true }) })
  input = await screen.findByRole("textbox", { name: /Organization name/ })
  expect(input).toHaveAttribute("readonly")
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
  await expect(organizationService.rename("joined", "forged")).rejects.toThrow("organization_denied")
  expect(identitySession.getSnapshot().identity?.id).toBe("member")
  await act(async () => { permissionMock.set({ subjectId: "member-joined", organizationId: "joined" }, ["home"]); await permissionSession.refresh(); await router.invalidate({ sync: true }) })
  await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"))
  view.unmount()
})
`
    )
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)
