import { describe, expect, test } from "vitest"
import { collectPromptedIdentity, formatInstantiationSummary } from "../.harness/tooling/prompts.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { parseArgs } from "../.harness/tooling/args.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { repositoryRoot, temporaryDirectory, path, readdir } from "./harness-tooling-support.ts"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { webFiles } from "../.harness/tooling/templates/web.ts"
import { saasClientFiles } from "../.harness/tooling/templates/saas-client.ts"
import {
  initializeProject,
  options,
  seedTemplateRoot,
  readFile
} from "./harness-tooling-support.ts"

/** 提供完整客户端身份，让每轮问答仅关注购买选择。 */
const CLIENT = {
  projectType: "web",
  webType: "saas-client",
  name: "SaaS Client",
  id: "saas-client",
  targetRoot: path.resolve("..", "saas-client"),
  policyMode: "预设"
}

/** 在隔离回归中绑定真实文件路由，保留父子关系与严格上下文类型。 */
function saasFileRouteTreeFixture(): string {
  const routes = [
    {
      name: "Index",
      file: "index",
      id: "/",
      path: "/",
      fullPath: "/",
      parent: "rootRoute",
      localId: "/"
    },
    {
      name: "Auth",
      file: "_auth",
      id: "/_auth",
      path: "",
      fullPath: "/",
      parent: "rootRoute",
      localId: "/_auth"
    },
    {
      name: "Login",
      file: "_auth.login",
      id: "/_auth/login",
      path: "/login",
      fullPath: "/login",
      parent: "AuthRoute",
      localId: "/login"
    },
    {
      name: "Register",
      file: "_auth.register",
      id: "/_auth/register",
      path: "/register",
      fullPath: "/register",
      parent: "AuthRoute",
      localId: "/register"
    },
    {
      name: "Reset",
      file: "_auth.forgot-password",
      id: "/_auth/forgot-password",
      path: "/forgot-password",
      fullPath: "/forgot-password",
      parent: "AuthRoute",
      localId: "/forgot-password"
    },
    {
      name: "App",
      file: "app",
      id: "/app",
      path: "/app",
      fullPath: "/app",
      parent: "rootRoute",
      localId: "/app"
    },
    {
      name: "AppIndex",
      file: "app.index",
      id: "/app/",
      path: "/",
      fullPath: "/app/",
      parent: "AppRoute",
      localId: "/"
    },
    {
      name: "Dashboard",
      file: "app.dashboard",
      id: "/app/dashboard",
      path: "/dashboard",
      fullPath: "/app/dashboard",
      parent: "AppRoute",
      localId: "/dashboard"
    },
    {
      name: "Account",
      file: "app.account",
      id: "/app/account",
      path: "/account",
      fullPath: "/app/account",
      parent: "AppRoute",
      localId: "/account"
    },
    {
      name: "NoAccess",
      file: "no-access",
      id: "/no-access",
      path: "/no-access",
      fullPath: "/no-access",
      parent: "rootRoute",
      localId: "/no-access"
    }
  ]
  let source = 'import { Route as rootRoute } from "./routes/__root"\n'
  for (const route of routes)
    source += `import { Route as ${route.name}RouteImport } from "./routes/${route.file}"\n`
  for (const route of routes) {
    const routePath = route.path === "" ? "" : `path: ${JSON.stringify(route.path)}, `
    source += `const ${route.name}Route = ${route.name}RouteImport.update({ ...${route.name}RouteImport.options, ...{ id: ${JSON.stringify(route.localId)}, ${routePath}getParentRoute: () => ${route.parent} } })\n`
  }
  source += 'declare module "@tanstack/react-router" { interface FileRoutesByPath {\n'
  for (const route of routes)
    source += `${JSON.stringify(route.id)}: { id: ${JSON.stringify(route.id)}; path: ${JSON.stringify(route.path)}; fullPath: ${JSON.stringify(route.fullPath)}; preLoaderRoute: typeof ${route.name}RouteImport; parentRoute: typeof ${route.parent} }\n`
  source +=
    "} }\nexport const routeTree = rootRoute.addChildren([IndexRoute, AuthRoute.addChildren([LoginRoute, RegisterRoute, ResetRoute]), AppRoute.addChildren([AppIndexRoute, DashboardRoute, AccountRoute]), NoAccessRoute])\n"
  return source
}

describe("SaaS 创建购买交接", () => {
  /** 原有装配入口漂移必须在生成时失败，不能交付未挂载的会话能力。 */
  test("装配入口缺失时阻断客户端生成", () => {
    const base = new Map([
      ["src/app/router.tsx", "export const router = createRouter({ changed: true })"],
      ["src/app/AppProviders.tsx", "export const AppProviders = () => null"]
    ])
    expect(() => saasClientFiles(base)).toThrow(/session wiring must be updated/)
  })
  /** 普通站点和大后台继续使用各自中性基线，避免客户端认证能力串入。 */
  test.each(["tool-site", "saas-admin"] as const)("%s 不生成客户端认证", (webType) => {
    const config = createProjectConfig({
      projectType: "web",
      name: "Neutral fixture",
      id: "neutral-fixture",
      description: "Neutral fixture",
      brandColor: "#2563eb"
    })
    const files = webFiles(
      config,
      { developmentBaseUrl: "", testBaseUrl: "", releaseBaseUrl: "" },
      webType
    )
    expect(files.has("src/features/welcome/WelcomePage.tsx")).toBe(true)
    expect(files.has("src/data/api/auth/api.ts")).toBe(false)
    expect(files.get("src/routes/index.tsx")).toContain("WelcomePage")
  })
  /** 真实初始化必须产出 SaaS 界面，不能只验证 webType 参数透传。 */
  test.each(["enabled", "disabled"] as const)(
    "客户端创建生成认证与主工作区，购买=%s",
    async (saasCommerce) => {
      const root = await seedTemplateRoot()
      await initializeProject({ ...options(root, "web"), webType: "saas-client", saasCommerce })
      for (const file of [
        "src/routes/_auth.login.tsx",
        "src/routes/_auth.register.tsx",
        "src/routes/_auth.forgot-password.tsx",
        "src/routes/app.tsx",
        "src/routes/app.dashboard.tsx",
        "src/routes/no-access.tsx",
        "src/features/auth/session.test.ts"
      ]) {
        expect(await readFile(path.join(root, file), "utf8")).not.toBe("")
      }
      await expect(
        readFile(path.join(root, "src/features/welcome/WelcomePage.tsx"), "utf8")
      ).rejects.toThrow()
      expect(await readFile(path.join(root, "src/routes/index.tsx"), "utf8")).toContain(
        'to: "/login"'
      )
      expect(
        await readFile(path.join(root, "src/features/workspace/Workspace.tsx"), "utf8")
      ).toContain("BUILD_VERSION")
      const readme = await readFile(path.join(root, "README.md"), "utf8")
      expect(readme).toContain("已生成的 SaaS 客户端")
      expect(readme).toContain("Demo-only-24")
      expect(readme).not.toContain("初始化未实现登录")
    }
  )

  /** 执行实际生成的认证代码，覆盖状态、持久化、撤权和零联网边界。 */
  test.each(["", "https://service.invalid"])(
    "生成的 SaaS 认证通过类型检查和行为回归（测试地址：%s）",
    async (apiBaseUrl) => {
      const cache = path.join(repositoryRoot, "node_modules/.cache")
      await mkdir(cache, { recursive: true })
      const root = await mkdtemp(path.join(cache, "saas-starter-"))
      try {
        const config = createProjectConfig({
          projectType: "web",
          name: "SaaS fixture",
          id: "saas-fixture",
          description: "SaaS fixture",
          brandColor: "#2563eb"
        })
        const files = webFiles(
          config,
          { developmentBaseUrl: "", testBaseUrl: apiBaseUrl, releaseBaseUrl: "" },
          "saas-client"
        )
        for (const [name, source] of files) {
          if (!name.startsWith("src/")) continue
          await mkdir(path.dirname(path.join(root, name)), { recursive: true })
          await writeFile(
            path.join(root, name),
            name === "src/vite-env.d.ts"
              ? source.replace(/^\/\/\/ <reference types="vite\/client" \/>\n/u, "")
              : source
          )
        }
        await writeFile(
          path.join(root, "src/config/environment.ts"),
          `export const APP_CONFIG = { environment: "test", apiBaseUrl: ${JSON.stringify(apiBaseUrl)}, requestTimeoutMs: 1000, logLevel: "error" } as const\n`
        )
        await writeFile(path.join(root, "package.json"), '{"private":true,"type":"module"}\n')
        await writeFile(path.join(root, "src/routeTree.gen.ts"), saasFileRouteTreeFixture())
        await writeFile(
          path.join(root, "src/fixture-env.d.ts"),
          'interface ImportMeta { readonly hot?: { dispose(callback: () => void): void } }\ndeclare module "*.css" {}\n'
        )
        await writeFile(
          path.join(root, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              target: "ES2023",
              module: "ESNext",
              moduleResolution: "Bundler",
              jsx: "react-jsx",
              lib: ["ES2023", "DOM", "DOM.Iterable"],
              strict: true,
              noUncheckedIndexedAccess: true,
              noEmit: true,
              skipLibCheck: true,
              types: ["node", "vitest/globals", "@testing-library/jest-dom/vitest"]
            },
            include: ["src/**/*.ts", "src/**/*.tsx"]
          })
        )
        await writeFile(
          path.join(root, "vitest.config.ts"),
          "export default " +
            JSON.stringify({
              test: {
                environment: "jsdom",
                setupFiles: [path.join(repositoryRoot, "tests/setup.ts")],
                include: ["src/**/*.test.{ts,tsx}"],
                testTimeout: 10_000
              }
            })
        )
        const typescript = path.join(
          path.dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))),
          "lib/tsc.js"
        )
        const vitest = path.join(
          path.dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
          "vitest.mjs"
        )
        try {
          execFileSync(process.execPath, [typescript, "--noEmit"], {
            cwd: root,
            encoding: "utf8",
            stdio: "pipe",
            timeout: 40_000
          })
        } catch (error) {
          const output = error as { stdout?: string; stderr?: string }
          throw new Error(((output.stdout ?? "") + (output.stderr ?? "")).slice(-10_000), {
            cause: error
          })
        }
        try {
          const output = execFileSync(process.execPath, [vitest, "run"], {
            cwd: root,
            encoding: "utf8",
            stdio: "pipe",
            timeout: 40_000,
            env: { ...process.env, DEBUG_PRINT_LIMIT: "1200", NO_COLOR: "1" }
          })
          expect(output).toMatch(/Tests\s+\d+ passed/)
          console.info(
            output
              .split("\n")
              .filter((line) => /^\s*(Test Files|Tests)/u.test(line))
              .join("\n")
          )
        } catch (error) {
          const output = error as { stdout?: string; stderr?: string }
          throw new Error(((output.stdout ?? "") + (output.stderr ?? "")).slice(-10_000), {
            cause: error
          })
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    60_000
  )

  /** 验证建议必须实际询问并接受，非法值仅重问购买项，其他输入保留。 */
  test.each(["", "enabled", "disabled", '{"saasCommerce":"enabled"}'])(
    "补问并解析 %j",
    async (answer) => {
      const questions: string[] = []
      const answers = ["maybe", answer]
      const identity = await collectPromptedIdentity(CLIENT, async (question) => {
        questions.push(question)
        const next = answers.shift()
        if (next === undefined) throw new Error("不应重复询问合法字段")
        return next
      })
      expect(questions).toHaveLength(2)
      for (const question of questions) {
        expect(question).toContain("字段： saasCommerce")
        expect(question).toContain("商品选择、订单管理和钱包管理")
        expect(question).toContain("建议/默认：disabled；回车采用")
        expect(question).not.toContain("五项预设")
      }
      expect(identity.name).toBe(CLIENT.name)
      expect(identity.saasCommerce).toBe(answer.includes("enabled") ? "enabled" : "disabled")
      expect(identity.inputSources.saasCommerce).toBe(
        answer === "" ? "交互接受默认值" : answer.startsWith("{") ? "交互表单" : "交互问答"
      )
    }
  )

  /** 验证明示启用或关闭在交互和非交互公开入口均不补问，并进入汇总与实际初始化参数。 */
  test.each(["enabled", "disabled"] as const)("公开入口透传 %s", async (choice) => {
    for (const interactive of [false, true]) {
      const parent = await temporaryDirectory("saas-choice-")
      const output: string[] = []
      let creations = 0
      await runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--web-type",
          "saas-client",
          "--saas-commerce",
          choice,
          "--name",
          "SaaS Client",
          "--policy-mode",
          "预设"
        ],
        {
          sourceRoot: repositoryRoot,
          interactive,
          output: (line) => output.push(line),
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async () => {
              throw new Error("已有选择不能重问")
            }),
          confirm: async (summary) => {
            expect(summary.init.saasCommerce).toBe(choice)
            expect(summary.inputSources.saasCommerce).toBe("命令行参数")
            expect(formatInstantiationSummary(summary)).toContain(
              `商品购买模块：${choice}（商品选择、订单管理、钱包管理）`
            )
            expect(formatInstantiationSummary(summary)).toContain(
              "创建基线：通用登录、注册、找回和受保护主工作区"
            )
            return true
          },
          instantiate: async (supplied) => {
            creations += 1
            expect(supplied.init.saasCommerce).toBe(choice)
            return createProjectConfig(supplied.init)
          }
        }
      )
      expect(creations).toBe(1)
      expect(output.join("\n")).toContain(`商品购买模块：${choice}`)
      expect(await readdir(parent)).toEqual([])
    }
  })

  /** 验证非交互缺少或非法购买值在初始化之前失败，不用默认关闭吞掉问题。 */
  test.each([undefined, "maybe"])("拒绝客户端缺失或非法值 %s", async (choice) => {
    const parent = await temporaryDirectory("saas-missing-")
    await expect(
      runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--web-type",
          "saas-client",
          "--name",
          "SaaS Client",
          "--policy-mode",
          "预设",
          ...(choice === undefined ? [] : ["--saas-commerce", choice])
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: false,
          instantiate: async () => {
            throw new Error("不应写入")
          }
        }
      )
    ).rejects.toThrow(/--saas-commerce/)
    expect(await readdir(parent)).toEqual([])
  })

  /** 验证其他宿主与模式既不询问购买，也拒绝显式传入任一购买值。 */
  test.each([
    ["web", "tool-site"],
    ["web", "saas-admin"],
    ["extension", undefined]
  ] as const)("限制 %s %s 的字段", async (projectType, webType) => {
    const defaults = { ...CLIENT, projectType, webType, description: "A project" }
    const identity = await collectPromptedIdentity(defaults, async () => {
      throw new Error("不应询问购买")
    })
    expect(identity.saasCommerce).toBeUndefined()
    expect(identity.inputSources.saasCommerce).toBe("不适用")
    for (const choice of ["enabled", "disabled"]) {
      for (const interactive of [false, true]) {
        await expect(
          resolveInitOptions(
            parseArgs([
              "--type",
              projectType,
              ...(webType === undefined ? [] : ["--web-type", webType]),
              "--name",
              CLIENT.name,
              "--policy-mode",
              "预设",
              "--description",
              "A project",
              "--saas-commerce",
              choice
            ]),
            CLIENT.targetRoot,
            {
              interactive,
              promptIdentity: (values) =>
                collectPromptedIdentity(values, async () => {
                  throw new Error("不应补问")
                })
            }
          )
        ).rejects.toThrow(/仅适用于 Web SaaS 客户端/)
      }
    }
  })
})
