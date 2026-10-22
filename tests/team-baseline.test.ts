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
        const response = await fetch(running.url + "/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `${host}-${account}@example.invalid`,
            password: "Password123"
          })
        })
        expect(response.status).toBe(200)
      }
      const options = {
        selection: { host, operations: ["identity.workspace"] },
        homePageSource: HOME_SOURCE,
        dataMode: "adapter" as const,
        pagePermissions: { "/": ["team.manage"] }
      }
      const source = `import { expect, test } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MantineProvider } from "@mantine/core"
import { QueryClientProvider } from "@tanstack/react-query"
import { identitySession, ensureOrganization, permissionSession, organizationService, teamService, currentScope, canManageOrganization } from "./features/application/runtime"
import { api as teams } from "./data/api/organization/adapter"
import { TeamInbox } from "./features/organization/TeamInbox"
import { TeamMembers } from "./features/organization/TeamMembers"
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
  expect(await screen.findByText("Team members")).toBeInTheDocument()
  expect(await screen.findByText(/Pending/)).toBeInTheDocument()
  expect(await screen.findByRole("heading", { name: "Team roles" })).toBeInTheDocument()
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
})`
      const output = await runApplicationFixture(options, source, {
        assemble: (base) => goAccountApplicationFiles(base, options),
        baseUrl: running.url
      })
      expect(output).toMatch(/Tests\s+[1-9]\d* passed/u)
    }
    await stop()
    stop = undefined
    const restarted = await startGoFixture(server, binary)
    stop = restarted.stop
    const login = await fetch(restarted.url + "/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "web-owner@example.invalid", password: "Password123" })
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
