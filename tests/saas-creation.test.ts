import { describe, expect, test } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { repositoryRoot, path, temporaryDirectory } from "./harness-tooling-support.ts"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { webFiles } from "../.harness/tooling/templates/web.ts"
import { accountWorkspaceFiles } from "../.agents/skills/web-compose-capabilities/templates/compositions/account-workspace/files.ts"

/** 在隔离回归中绑定真实文件路由，保留父子关系与严格上下文类型。 */
function accountFileRouteTreeFixture(): string {
  const routes = [
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
      file: "_auth/login",
      id: "/_auth/login",
      path: "/login",
      fullPath: "/login",
      parent: "AuthRoute",
      localId: "/login"
    },
    {
      name: "Register",
      file: "_auth/register",
      id: "/_auth/register",
      path: "/register",
      fullPath: "/register",
      parent: "AuthRoute",
      localId: "/register"
    },
    {
      name: "Reset",
      file: "_auth/forgot-password",
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
      name: "Dashboard",
      file: "app/dashboard",
      id: "/app/dashboard",
      path: "/dashboard",
      fullPath: "/app/dashboard",
      parent: "AppRoute",
      localId: "/dashboard"
    },
    {
      name: "Account",
      file: "app/account",
      id: "/app/account",
      path: "/account",
      fullPath: "/app/account",
      parent: "AppRoute",
      localId: "/account"
    },
    {
      name: "NoAccess",
      file: "app/forbidden",
      id: "/app/forbidden",
      path: "/forbidden",
      fullPath: "/app/forbidden",
      parent: "AppRoute",
      localId: "/forbidden"
    },
    {
      name: "TestPage",
      file: "app/test",
      id: "/app/test",
      path: "/test",
      fullPath: "/app/test",
      parent: "AppRoute",
      localId: "/test"
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
    "} }\nexport const routeTree = rootRoute.addChildren([AuthRoute.addChildren([LoginRoute, RegisterRoute, ResetRoute]), AppRoute.addChildren([DashboardRoute, AccountRoute, NoAccessRoute, TestPageRoute])])\n"
  return source
}

describe("explicit account workspace composition", () => {
  /** 验证显式组合模板实际编译并运行身份、组织与权限回归。 */
  test.each(["", "https://service.invalid"])(
    "生成的 账户组合 认证通过类型检查和行为回归（测试地址：%s）",
    async (apiBaseUrl) => {
      const cache = path.join(repositoryRoot, "node_modules/.cache")
      await mkdir(cache, { recursive: true })
      const root = await mkdtemp(path.join(cache, "account-starter-"))
      try {
        const config = createProjectConfig({
          projectType: "web",
          name: "账户组合 fixture",
          id: "account-fixture",
          description: "账户组合 fixture",
          brandColor: "#2563eb"
        })
        const base = webFiles(config, {
          developmentBaseUrl: "",
          testBaseUrl: apiBaseUrl,
          releaseBaseUrl: ""
        })
        const files = accountWorkspaceFiles(base)
        files.delete("src/routes/index.tsx")
        files.delete("src/features/welcome/WelcomePage.tsx")
        files.delete("src/features/welcome/WelcomePage.test.tsx")
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
        await writeFile(path.join(root, "src/routeTree.gen.ts"), accountFileRouteTreeFixture())
        await writeFile(
          path.join(root, "src/fixture-env.d.ts"),
          'interface ImportMeta { readonly hot?: { dispose(callback: () => void): void } }\ndeclare module "*.css" { const classes: Record<string, string>; export default classes }\n'
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
              .replace(/\x1b\[[0-9;]*m/gu, "")
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
})

/** 运行独立会话模板的标准库测试及严格类型检查，不引入组织、权限或UI。 */
test("standalone identity template compiles and passes lifecycle behavior", async () => {
  const root = await temporaryDirectory("identity-template-")
  try {
    for (const name of ["session.ts", "session.test.ts"])
      await writeFile(
        path.join(root, name),
        await readFile(
          path.join(
            repositoryRoot,
            ".agents/skills/web-compose-capabilities/templates/identity",
            name + ".txt"
          ),
          "utf8"
        )
      )
    const typescript = path.join(
      path.dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))),
      "lib/tsc.js"
    )
    execFileSync(
      process.execPath,
      [
        typescript,
        "--ignoreConfig",
        "--strict",
        "--noEmit",
        "--target",
        "ES2023",
        "--module",
        "NodeNext",
        "--types",
        "node",
        "--allowImportingTsExtensions",
        path.join(root, "session.ts"),
        path.join(root, "session.test.ts")
      ],
      { cwd: repositoryRoot, stdio: "pipe", timeout: 40_000 }
    )
    const output = execFileSync(process.execPath, ["--test", path.join(root, "session.test.ts")], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: 10_000
    })
    expect(output).toMatch(/fail 0/)
    expect(output).toMatch(/pass 21/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
