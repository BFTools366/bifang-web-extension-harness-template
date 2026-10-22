import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { expect, test } from "vitest"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { installUsers } from "../.agents/skills/go-implement-service/scripts/install-users.ts"
import { goAccountApplicationFiles } from "../.agents/skills/workspace-implement-users/scripts/assemble-account.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"
import { startGoFixture } from "./go-identity-support.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"

/** 在真实生成服务上验证两宿主团队 UI、HTTP adapter、权限与持久化，没有产品 Mock。 */
test("完整账号基线在 Web/Extension 复用真实团队归属与权限服务", async () => {
  const cache = path.join(repositoryRoot, "node_modules/.cache")
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(path.join(cache, "team-baseline-"))
  const server = path.join(root, "ownership_server")
  const run = promisify(execFile)
  const goOptions = {
    cwd: server,
    env: { ...process.env, GOTOOLCHAIN: "local", APP_ENV: "dev" },
    timeout: 120_000
  }
  let stop: (() => Promise<void>) | undefined
  try {
    const assets = ".agents/skills/go-implement-service/assets/go-service"
    await cp(path.join(repositoryRoot, assets), path.join(root, assets), { recursive: true })
    await generateGoServer(root, "ownership_server", "ownership_server")
    await mkdir(path.join(root, ".harness"), { recursive: true })
    await writeFile(
      path.join(root, ".harness/workspace.json"),
      JSON.stringify({
        kind: "workspace",
        id: "ownership",
        members: [{ type: "server", directory: "ownership_server" }],
        service: { mode: "create" }
      })
    )
    await installUsers(root)
    await run(
      "go",
      ["test", "-race", "./internal/service", "-run", "TestTeam", "-count=1"],
      goOptions
    )
    const binary = path.join(server, process.platform === "win32" ? "fixture.exe" : "fixture")
    await run("go", ["build", "-o", binary, "./cmd/server"], goOptions)
    const running = await startGoFixture(server, binary)
    stop = running.stop
    for (const host of ["web", "extension"] as const) {
      for (const account of ["owner", "member", "outsider"]) {
        const email = `${host}-${account}@example.invalid`
        const sent = await fetch(running.url + "/api/v1/auth/verification-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: email, target_type: "email", scene: "register" })
        })
        expect(sent.status).toBe(200)
        const receipt = (await sent.json()) as { data: { code: string; mock: boolean } }
        expect(receipt.data.mock).toBe(true)
        expect(receipt.data.code).toMatch(/^\d{6}$/)
        const response = await fetch(running.url + "/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "Password123",
            code: receipt.data.code
          })
        })
        expect(response.status).toBe(200)
      }
      const options = {
        selection: { host, operations: ["identity.workspace", "identity.register"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter" as const,
        pagePermissions: { "/": ["team.manage"] }
      }
      const source = `import { expect, test, vi } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MantineProvider } from "@mantine/core"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory${host === "web" ? ", createRouter" : ""} } from "@tanstack/react-router"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, ensureOrganization, permissionSession, organizationService, teamService, currentScope, canManageOrganization } from "./features/application/runtime"
import { api as teams } from "./data/api/organization/adapter"
import { TeamInbox } from "./features/organization/TeamInbox"
import { TeamMembers } from "./features/organization/TeamMembers"
import { PersonalSettingsPage } from "./features/identity/PersonalSettingsPage"
import { ApiError } from "./data/api/client/httpClient"
import i18n from "./i18n"
import "./i18n/application"
import { queryClient } from "${host === "web" ? "./app/queryClient" : "./providers"}"

test("mutual membership keeps ownership and rejects cross-team authority", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "${host}-owner@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  const owner = await teams.read(), org = owner.current
  expect(canManageOrganization()).toBe(true)
  await teamService.invite(org, "${host}-member@example.invalid")
  const sent = await teams.invitations(org, 1, 20)
  expect(sent.items).toHaveLength(1)
  const ownerView = render(<MantineProvider env="test"><QueryClientProvider client={queryClient}><TeamMembers api={teamService} organizationId={org} scope={currentScope()} isCurrent={() => true} /></QueryClientProvider></MantineProvider>)
  expect(await screen.findByText("Organization members")).toBeInTheDocument()
  expect(await screen.findByText(/Pending/)).toBeInTheDocument()
  expect(await screen.findByRole("heading", { name: "Organization roles" })).toBeInTheDocument()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Role code/), "reviewer")
  await user.type(screen.getByLabelText(/Role name/), "Reviewers")
  await user.click(screen.getByRole("button", { name: "Create role" }))
  expect(await screen.findByText("reviewer")).toBeInTheDocument()
  expect((await teams.roles(org, 1, 100)).items).toHaveLength(3)
  ownerView.unmount()
  await identitySession.logout()
  await identitySession.login({ account: "${host}-outsider@example.invalid", password: "Password123" })
  await ensureOrganization()
  await expect(teams.resolve(sent.items[0]!, "accept")).rejects.toBeDefined()
  await expect(teams.members(org, 1, 20)).rejects.toBeDefined()
  await identitySession.logout()
  await identitySession.login({ account: "${host}-member@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  const own = (await teams.read()).current
  await expect(organizationService.switch(org)).rejects.toBeDefined()
  const inboxView = render(<MantineProvider env="test"><QueryClientProvider client={queryClient}><TeamInbox api={teamService} scope={currentScope()} isCurrent={() => true} /></QueryClientProvider></MantineProvider>)
  await user.click(await screen.findByRole("button", { name: "Accept" }))
  await waitFor(() => expect(screen.getByText(/Accepted/)).toBeInTheDocument())
  inboxView.unmount()
  const joined = await teams.read()
  expect(joined.current).toBe(own)
  expect(joined.available).toHaveLength(2)
  await act(async () => { await organizationService.switch(org) })
  expect(canManageOrganization()).toBe(false)
  expect(permissionSession.getSnapshot().codes).toEqual(["team.leave"])
  await expect(teams.members(org, 1, 20)).rejects.toBeDefined()
  await expect(teams.rename(org, "Unauthorized rename")).rejects.toBeDefined()
  const member = (await teams.read()).available.find((row) => row.id === org)!.user
  await identitySession.logout()
  await identitySession.login({ account: "${host}-owner@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  await teamService.createRole(org, "manager", "Manager", ["team.manage"])
  const manager = (await teams.roles(org, 1, 100)).items.find((role) => role.code === "manager")!
  await teamService.assignRoles(member, [manager.id])
  await identitySession.logout()
  await identitySession.login({ account: "${host}-member@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  expect(canManageOrganization()).toBe(true)
  const managerMember = (await teams.read()).available.find((row) => row.id === org)!.user
  await expect(teamService.assignRoles(managerMember, [])).rejects.toThrow("team_superseded")
  expect(canManageOrganization()).toBe(false)
  const leaving = (await teams.read()).available.find((row) => row.id === org)!.user
  await expect(teamService.remove(leaving)).rejects.toThrow("team_superseded")
  await ensureOrganization()
  expect((await teams.read()).current).toBe(own)
  expect((await teams.read()).available).toHaveLength(1)
  await identitySession.logout()
})
/** 实际主壳保留四项账号内容，组织入口分层，昵称和改密均请求真实后端。 */
test("account menu, organization navigation and personal settings", async () => {
  await identitySession.login({ account: "${host}-owner@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  const context = await teams.read()
  const orgName = context.available.find((item) => item.id === context.current)!.name
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  const user = userEvent.setup()
  render(<Providers><RouterProvider router={router} /></Providers>)
  await screen.findByRole("heading", { name: "Text tool" })
  const navigation = screen.getByRole("navigation", { name: "Application navigation" })
  const group = within(navigation).getByText("Organization management").closest("details")!
  expect(within(group).getAllByRole("link").map((link) => link.textContent)).toEqual(["Organization settings", "Join an organization"])
  await user.click(screen.getByRole("button", { name: /User center/ }))
  let menu = await screen.findByRole("menu")
  expect(within(menu).getByText("${host}-owner@example.invalid")).toBeInTheDocument()
  expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([orgName, "Personal settings", "⇥Sign out"])
  await user.click(within(menu).getByRole("menuitem", { name: orgName }))
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByRole("option", { name: orgName })).toBeDisabled()
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: /User center/ }))
  menu = await screen.findByRole("menu")
  await user.click(within(menu).getByRole("menuitem", { name: "Personal settings" }))
  await screen.findByRole("heading", { name: "Personal settings" })
  const email = await screen.findByLabelText("Email")
  expect(email).toHaveValue("${host}-owner@example.invalid")
  expect(email).toHaveAttribute("readonly")
  const nickname = screen.getByPlaceholderText("Enter your nickname")
  await user.clear(nickname); await user.type(nickname, "Changed nickname")
  expect(nickname).toHaveValue("Changed nickname")
  await user.click(screen.getByRole("button", { name: "Save nickname" }))
  await screen.findByText("Nickname saved.")
  expect(await screen.findByRole("button", { name: "User center: Changed nickname" })).toBeInTheDocument()
  await user.type(screen.getByPlaceholderText("Enter your current password"), "WrongPassword")
  await user.type(screen.getByPlaceholderText("Enter a new password"), "Password456")
  await user.type(screen.getByPlaceholderText("Enter your password again"), "Password456")
  await user.click(screen.getByRole("button", { name: "Change password" }))
  await screen.findByText("Unable to change the password. Check your current and new passwords.")
  expect(identitySession.getSnapshot().identity).not.toBeNull()
  await user.clear(screen.getByPlaceholderText("Enter your current password"))
  await user.type(screen.getByPlaceholderText("Enter your current password"), "Password123")
  await user.click(screen.getByRole("button", { name: "Change password" }))
  await screen.findByRole("heading", { name: "Sign in" })
  expect(identitySession.getSnapshot().identity).toBeNull()
})
/** 超时不能重放昵称写入，核对后必须展示服务实际保存的昵称。 */
test("unknown nickname writes recover by reading the authoritative value", async () => {
  await identitySession.login({ account: "${host}-outsider@example.invalid", password: "Password123" })
  const accountId = identitySession.getSnapshot().identity!.id
  queryClient.removeQueries({ queryKey: ["accountProfile"] })
  const rename = vi.fn(async () => { throw new ApiError({ kind: "timeout", code: "timeout", message: "timeout", retryable: false }) })
  const api = { read: async () => ({ id: accountId, email: "${host}-outsider@example.invalid", nickname: "Stored name" }), rename }
  render(<MantineProvider env="test"><QueryClientProvider client={queryClient}><PersonalSettingsPage api={api} session={identitySession} canChangePassword={false} onPasswordChanged={async () => {}} /></QueryClientProvider></MantineProvider>)
  const user = userEvent.setup()
  const input = await screen.findByPlaceholderText("Enter your nickname")
  await user.clear(input); await user.type(input, "Attempted name")
  await user.click(screen.getByRole("button", { name: "Save nickname" }))
  await screen.findByText("The result needs checking. Refresh your profile before saving again.")
  expect(rename).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Save nickname" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Refresh profile" }))
  await waitFor(() => expect(input).toHaveValue("Stored name"))
  expect(rename).toHaveBeenCalledTimes(1)
  await act(async () => { await identitySession.logout() })
})
/** 页面离开后，迟到的资料读取不得启动新的身份校验。 */
test("leaving personal settings cancels the post-write session refresh", async () => {
  await identitySession.login({ account: "${host}-outsider@example.invalid", password: "Password123" })
  const profile = { id: identitySession.getSnapshot().identity!.id, email: "${host}-outsider@example.invalid", nickname: "Stored name" }
  queryClient.removeQueries({ queryKey: ["accountProfile"] })
  let finish = () => {}
  const read = vi.fn(async (_signal: AbortSignal) => {
    if (read.mock.calls.length === 1) return profile
    return await new Promise<typeof profile>((resolve) => { finish = () => resolve(profile) })
  })
  const check = vi.spyOn(identitySession, "check")
  const api = { read, rename: async () => {} }
  const view = render(<MantineProvider env="test"><QueryClientProvider client={queryClient}><PersonalSettingsPage api={api} session={identitySession} canChangePassword={false} onPasswordChanged={async () => {}} /></QueryClientProvider></MantineProvider>)
  const user = userEvent.setup()
  const input = await screen.findByPlaceholderText("Enter your nickname")
  await user.clear(input); await user.type(input, "Attempted name")
  await user.click(screen.getByRole("button", { name: "Save nickname" }))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  view.unmount()
  await act(async () => { finish(); await Promise.resolve() })
  expect(check).not.toHaveBeenCalled()
  check.mockRestore()
  await identitySession.logout()
})`
      const output = await runApplicationFixture(options, source, {
        assemble: (base) => {
          const files = goAccountApplicationFiles(base, options)
          expect(files.get("src/features/application/Application.tsx")).toContain(
            "sendRegistrationCode"
          )
          expect(files.has("src/features/identity/RegistrationPage.tsx")).toBe(true)
          return files
        },
        baseUrl: running.url
      })
      expect(output).toMatch(/Tests\s+[1-9]\d* passed/u)
      const coreOptions = { ...options, selection: { host, operations: ["identity.register"] } }
      const coreOutput = await runApplicationFixture(
        coreOptions,
        `import { expect, test, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryHistory${host === "web" ? ", createRouter" : ""} } from "@tanstack/react-router"
${host === "web" ? 'import { routeTree } from "./routeTree.gen"\nimport { AppProviders as Providers } from "./app/AppProviders"' : 'import { createExtensionRouter } from "./extension-router"\nimport { Providers } from "./providers"'}
import { identitySession, ensureOrganization, permissionSession } from "./features/application/runtime"
import { api as teams } from "./data/api/organization/adapter"
import i18n from "./i18n"
/** 收敛协作仍保留自有组织、真实本人资料与改密，不请求协作集合。 */
test("core account keeps ownership and settings without collaboration", async () => {
  await i18n.changeLanguage("en")
  await identitySession.login({ account: "${host}-outsider@example.invalid", password: "Password123" })
  await ensureOrganization(); await permissionSession.refresh()
  const context = await teams.read()
  expect(context.available).toHaveLength(1)
  const members = vi.spyOn(teams, "members"), invitations = vi.spyOn(teams, "invitations"), roles = vi.spyOn(teams, "roles")
  const router = ${host === "web" ? 'createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })' : 'createExtensionRouter("popup")'}
  render(<Providers><RouterProvider router={router} /></Providers>)
  const user = userEvent.setup()
  await screen.findByRole("heading", { name: "Text tool" })
  const navigation = screen.getByRole("navigation", { name: "Application navigation" })
  expect(within(navigation).queryByRole("link", { name: "Join an organization" })).toBeNull()
  expect(within(navigation).queryByRole("link", { name: "Organization settings" })).toBeNull()
  await user.click(screen.getByRole("button", { name: /User center/ }))
  await user.click(await screen.findByRole("menuitem", { name: "Personal settings" }))
  const nickname = await screen.findByPlaceholderText("Enter your nickname")
  await user.clear(nickname); await user.type(nickname, "Core nickname")
  expect(nickname).toHaveValue("Core nickname")
  await user.click(screen.getByRole("button", { name: "Save nickname" }))
  await screen.findByText("Nickname saved.")
  expect(await screen.findByRole("button", { name: "User center: Core nickname" })).toBeInTheDocument()
  await user.type(screen.getByPlaceholderText("Enter your current password"), "Password123")
  await user.type(screen.getByPlaceholderText("Enter a new password"), "PasswordCore456")
  await user.type(screen.getByPlaceholderText("Enter your password again"), "PasswordCore456")
  await user.click(screen.getByRole("button", { name: "Change password" }))
  await screen.findByRole("heading", { name: "Sign in" })
  expect(identitySession.getSnapshot().identity).toBeNull()
  expect(members).not.toHaveBeenCalled(); expect(invitations).not.toHaveBeenCalled(); expect(roles).not.toHaveBeenCalled()
})`,
        {
          assemble: (base) => {
            const files = goAccountApplicationFiles(base, coreOptions)
            const wiringSource = files.get(".harness/application-wiring.json")
            if (wiringSource === undefined) throw new Error("装配结果缺少能力接线记录")
            const wiring = JSON.parse(wiringSource)
            for (const operation of [
              "identity.workspace",
              "organization.invite",
              "organization.accept",
              "organization.members",
              "permissions.roles"
            ])
              expect(wiring.resolved).not.toContain(operation)
            expect(files.has("src/features/organization/TeamWorkspace.tsx")).toBe(false)
            return files
          },
          baseUrl: running.url
        }
      )
      expect(coreOutput).toMatch(/Tests\s+[1-9]\d* passed/u)
    }
    await stop()
    stop = undefined
    const restarted = await startGoFixture(server, binary)
    stop = restarted.stop
    const login = await fetch(restarted.url + "/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "web-owner@example.invalid", password: "Password456" })
    })
    expect(login.status).toBe(200)
    const account = await login.json()
    const context = await fetch(restarted.url + "/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + account.data.token.access_token
      },
      body: JSON.stringify({ query: "{ teamContext { current available { id user { role } } } }" })
    })
    const data = await context.json()
    expect(data.errors).toBeUndefined()
    expect(data.data.teamContext.available).toHaveLength(1)
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string }
    throw new Error(
      (output.stdout ?? "") + (output.stderr ?? "") ||
        (error instanceof Error ? error.message : "团队基线验证失败"),
      { cause: error }
    )
  } finally {
    await stop?.()
    await rm(root, { recursive: true, force: true })
  }
}, 300_000)
