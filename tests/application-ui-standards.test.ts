import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"
import { applicationFiles } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"
import { HOME_SOURCE, runApplicationFixture } from "./application-wiring-fixture.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"

const mock = readFileSync(
  path.join(repositoryRoot, "tests/fixtures/application-api/identity/mock.ts.txt"),
  "utf8"
)
const adapter =
  'import {createIdentityMock} from "./mock"\nexport const api=createIdentityMock([{id:"member",account:"demo",password:"demo",displayName:"Member"}])\nexport const personalSettingsApi={\n/** 读取测试资料。 */\nasync read(){return {id:"member",email:"demo@example.invalid",nickname:"Member"}},\n/** 保存测试昵称。 */\nasync rename(){},\n/** 修改测试密码。 */\nasync changePassword(){}\n}\n'

/** 每种宿主和账号操作均生成真实代码，菜单弹窗不能改底层地址或丢失焦点。 */
test.each(
  (["web", "extension"] as const).flatMap((host) =>
    (["identity.profile", "identity.password.change"] as const).map((operation) => ({
      host,
      operation
    }))
  )
)(
  "generates $host $operation account dialogs without organization switching",
  async ({ host, operation }) => {
    const web = host === "web",
      label = operation === "identity.profile" ? "Personal settings" : "Change password"
    const opts: ApplicationOptions = {
      selection: { host, operations: [operation] },
      homePageSource: HOME_SOURCE,
      dataMode: "adapter",
      adapters: { identity: adapter }
    }
    const testSource =
      'import {test,expect} from "vitest";import {render,screen,within,waitFor} from "@testing-library/react";import userEvent from "@testing-library/user-event";import {RouterProvider,createRouter,createMemoryHistory} from "@tanstack/react-router";import i18n from "./i18n";import "./i18n/application";import {identitySession} from "./features/application/runtime";' +
      (web
        ? 'import {routeTree} from "./routeTree.gen";import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {createExtensionRouter} from "./extension-router";import {Providers} from "./providers";') +
      'test("account operation without switch",async()=>{await i18n.changeLanguage("en");await identitySession.login({account:"demo",password:"demo"});const router=' +
      (web
        ? 'createRouter({routeTree,history:createMemoryHistory({initialEntries:["/"]})})'
        : 'createExtensionRouter("popup")') +
      ';const user=userEvent.setup();render(<Providers><RouterProvider router={router}/></Providers>);await screen.findByRole("heading",{name:"Text tool"});await user.click(screen.getByRole("button",{name:/User center/}));expect(screen.queryByRole("menuitem",{name:"Switch organization"})).not.toBeInTheDocument();await user.click(screen.getByRole("menuitem",{name:"' +
      label +
      '"}));const dialog=await screen.findByRole("dialog",{name:"' +
      label +
      '"});expect(router.state.location.pathname).toBe("/");' +
      (operation === "identity.profile"
        ? 'await within(dialog).findByRole("textbox",{name:"Email"});'
        : 'expect(within(dialog).getByPlaceholderText("Enter your current password")).toBeInTheDocument();') +
      'await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());await waitFor(()=>expect(screen.getByRole("button",{name:/User center/})).toHaveFocus());});'
    const output = await runApplicationFixture(opts, testSource, {
      baseUrl: "https://api.fixture.invalid/v1",
      /** 只为隔离生成测试补充身份替身，不进入产品装配。 */
      assemble(base) {
        const files = applicationFiles(base, opts)
        files.set("src/data/api/identity/mock.ts", mock)
        return files
      }
    })
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)

/** 默认基础与能力装配共用列表，不允许私有分页或重复地标回归。 */
test.each(["web", "extension"] as const)(
  "generates the standard %s list and footer",
  async (host) => {
    const provider =
      host === "web"
        ? 'import {AppProviders as Providers} from "./app/AppProviders";'
        : 'import {Providers} from "./providers";'
    const testSource =
      'import {test,expect,vi} from "vitest";import {render,screen} from "@testing-library/react";import userEvent from "@testing-library/user-event";import i18n from "./i18n";import {ListSurface,ListTable} from "./pagination/ListSurface";import {ListFooter} from "./pagination/ListFooter";import {Table} from "@mantine/core";' +
      provider +
      'test("neutral list surface and footer use one landmark and both languages",async()=>{await i18n.changeLanguage("zh");const change=vi.fn();const view=(page:number,total:number)=><Providers><ListSurface label="Records" footer={<ListFooter state={{page,pageSize:20}} total={total} change={change}/>}><ListTable><Table.Thead><Table.Tr><Table.Th scope="col">Name</Table.Th></Table.Tr></Table.Thead><Table.Tbody><Table.Tr><Table.Th scope="row">Record</Table.Th></Table.Tr></Table.Tbody></ListTable></ListSurface></Providers>;const rendered=render(view(1,41));expect(screen.getAllByRole("region",{name:"Records"})).toHaveLength(1);expect(screen.getByRole("navigation",{name:"列表分页"})).toBeInTheDocument();expect(screen.getByRole("status")).toHaveTextContent("第 1–20 条，共 41 条");const user=userEvent.setup();await user.click(screen.getByRole("button",{name:"第 3 页"}));expect(change).toHaveBeenLastCalledWith({page:3});await user.click(screen.getByRole("combobox",{name:"每页条数"}));await user.click(screen.getByRole("option",{name:"50"}));expect(change).toHaveBeenLastCalledWith({page:1,pageSize:50});rendered.rerender(view(3,21));expect(screen.queryByRole("status")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"第 3 页"})).not.toBeInTheDocument();rendered.rerender(view(1,0));expect(screen.getByRole("status")).toHaveTextContent("共 0 条");await i18n.changeLanguage("en");expect(await screen.findByRole("navigation",{name:"List pagination"})).toBeInTheDocument();expect(screen.getByRole("combobox",{name:"Rows per page"})).toBeInTheDocument();});'
    const output = await runApplicationFixture(
      { selection: { host, modules: [] }, homePageSource: HOME_SOURCE, dataMode: "mock" },
      testSource
    )
    expect(output).toMatch(/Tests\s+1 passed/u)
  },
  90_000
)
