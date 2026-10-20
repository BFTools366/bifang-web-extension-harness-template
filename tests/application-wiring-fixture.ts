import type { TestApplicationOptions as ApplicationOptions } from "./application-test-adapters.ts"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inspectChineseComments } from "../.harness/tooling/comment-policy.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { webFiles } from "../.harness/tooling/templates/web.ts"
import { extensionFiles } from "../.harness/tooling/templates/extension.ts"
import { applicationFiles } from "./application-test-adapters.ts"
import type { ApplicationWiring } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"

/** 真实本地功能作为首版需求输入，固定模板不生成这个产品正文。 */
export const HOME_SOURCE = `import { useState } from "react"
/** 需求要求的文本转换工具，真实输入输出不使用 API Mock。 */
export function HomePage() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  return <section><h1>Text tool</h1><label>Input<input value={input} onChange={(event) => setInput(event.currentTarget.value)} /></label><button onClick={() => setOutput(input.toUpperCase())}>Run</button><output>{output}</output></section>
}\n`
/** 将固定 Web 文件路由绑定到真实 Router 类型，不为源测试安装下游工具。 */
function routeTreeFixture(wiring: ApplicationWiring): string {
  const routes = [
    {
      name: "Settings",
      file: "settings",
      id: "/settings",
      path: "/settings",
      fullPath: "/settings",
      parent: "rootRoute",
      localId: "/settings"
    },
    {
      name: "Application",
      file: "_application",
      id: "/_application",
      path: "",
      fullPath: "/",
      parent: "rootRoute",
      localId: "/_application"
    },
    ...wiring.pages.map((page, index) => ({
      name: "Page" + index,
      file: "_application/" + page.file,
      id: "/_application/" + (page.file === "index" ? "" : page.file.replaceAll(".", "/")),
      path: page.path,
      fullPath: page.path,
      parent: "ApplicationRoute",
      localId: page.path
    })),
    ...(wiring.resolved.includes("identity.session")
      ? [
          {
            name: "Login",
            file: "login",
            id: "/login",
            path: "/login",
            fullPath: "/login",
            parent: "rootRoute",
            localId: "/login"
          }
        ]
      : []),
    ...(wiring.resolved.includes("permissions.enforce")
      ? [
          {
            name: "Forbidden",
            file: "_application/forbidden",
            id: "/_application/forbidden",
            path: "/forbidden",
            fullPath: "/forbidden",
            parent: "ApplicationRoute",
            localId: "/forbidden"
          }
        ]
      : [])
  ]
  let source = 'import { Route as rootRoute } from "./routes/__root"\n'
  for (const route of routes)
    source += `import { Route as ${route.name}RouteImport } from "./routes/${route.file}"\n`
  for (const route of routes)
    source += `const ${route.name}Route = ${route.name}RouteImport.update({ ...${route.name}RouteImport.options, ...{ id: ${JSON.stringify(route.localId)}, ${route.path ? "path: " + JSON.stringify(route.path) + "," : ""}getParentRoute: () => ${route.parent} } })\n`
  source += 'declare module "@tanstack/react-router" { interface FileRoutesByPath {\n'
  for (const route of routes)
    source += `${JSON.stringify(route.id)}: { id: ${JSON.stringify(route.id)}; path: ${JSON.stringify(route.path)}; fullPath: ${JSON.stringify(route.fullPath)}; preLoaderRoute: typeof ${route.name}RouteImport; parentRoute: typeof ${route.parent} }\n`
  const children = routes
    .filter((route) => route.parent === "ApplicationRoute")
    .map((route) => route.name + "Route")
  source += `} }\nexport const routeTree = rootRoute.addChildren([ApplicationRoute.addChildren([${children.join(",")}]),SettingsRoute${wiring.resolved.includes("identity.session") ? ",LoginRoute" : ""}])\n`
  return source
}
/** 对实际生成资产执行编译与行为测试，临时工程仅存在于受忽略 cache。 */
export async function runApplicationFixture(
  options: ApplicationOptions,
  testSource: string
): Promise<string> {
  const repository = path.resolve(import.meta.dirname, "..")
  const cache = path.join(repository, "node_modules/.cache")
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(path.join(cache, "application-wiring-"))
  try {
    const config = createProjectConfig({
      projectType: options.selection.host,
      name: "Wiring fixture",
      id: "wiring-fixture",
      description: "Typed application wiring",
      brandColor: "#2563eb"
    })
    const urls = { developmentBaseUrl: "", testBaseUrl: "", releaseBaseUrl: "" }
    const base =
      config.projectType === "web" ? webFiles(config, urls) : extensionFiles(config, urls)
    const files = applicationFiles(base, options)
    const wiring = JSON.parse(
      files.get(".harness/application-wiring.json") ?? ""
    ) as ApplicationWiring
    for (const [name, contents] of files) {
      if (!name.startsWith("src/")) continue
      // 此套回归只执行创建接线场景；底层既有回归由自己的源测试运行。
      if (/\.(test|spec)\.[jt]sx?$/u.test(name)) {
        if (!base.has(name)) {
          const report = inspectChineseComments(contents, name)
          if (report.errors.length || report.violations.length)
            throw new Error(JSON.stringify({ name, report }))
        }
        continue
      }
      if (["src/main.tsx", "src/popup.tsx", "src/options.tsx"].includes(name)) continue
      // 未改动的中性基线由自身源测试治理，这里只检查装配产生或改写的源码。
      if (/\.tsx?$/u.test(name) && base.get(name) !== contents) {
        const report = inspectChineseComments(contents, name)
        if (report.errors.length || report.violations.length)
          throw new Error(JSON.stringify({ name, report }))
      }
      await mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await writeFile(
        path.join(root, name),
        name === "src/vite-env.d.ts"
          ? contents.replace(/^\/\/\/ <reference types="vite\/client" \/>\r?\n/u, "")
          : ["src/app/AppProviders.tsx", "src/providers.tsx"].includes(name)
            ? contents.replace("<MantineProvider", '<MantineProvider env="test"')
            : contents
      )
    }
    if (config.projectType === "web")
      await writeFile(path.join(root, "src/routeTree.gen.ts"), routeTreeFixture(wiring))
    // Vite 的类型在真实下游提供 CSS Modules 声明；本回归不安装 Vite，仅补等价的类型边界。
    if (config.projectType === "web")
      await writeFile(
        path.join(root, "src/style.d.ts"),
        'declare module "*.module.css" { const classes: Record<string, string>; export default classes }\n'
      )
    await writeFile(
      path.join(root, "src/config/environment.ts"),
      `export const APP_CONFIG: Readonly<{environment: "test";apiBaseUrl:string;requestTimeoutMs:number;logLevel:"error"}> = Object.freeze({ environment: "test", apiBaseUrl: "https://api.fixture.invalid/v1", requestTimeoutMs: 1000, logLevel: "error" })\n`
    )
    await writeFile(path.join(root, "src/application.test.tsx"), testSource)
    await writeFile(
      path.join(root, "eslint.config.mjs"),
      await readFile(path.join(repository, "eslint.config.mjs"), "utf8")
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
          // 与源根 tsconfig 一致：下游工程启用索引访问检查。
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
            include: ["src/application.test.tsx"],
            setupFiles: [path.join(repository, "tests/setup.ts")],
            testTimeout: 15_000
          }
        })
    )
    const node = process.execPath
    const tsc = path.join(
      path.dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))),
      "lib/tsc.js"
    )
    const vitest = path.join(
      path.dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
      "vitest.mjs"
    )
    const eslint = path.join(
      path.dirname(fileURLToPath(import.meta.resolve("eslint/package.json"))),
      "bin/eslint.js"
    )
    // 异步执行不阻塞测试 worker 的超时计时；测试文件已并行，三项检查保持顺序以免加剧争用。
    const run = (args: string[]) =>
      promisify(execFile)(node, args, {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, NO_COLOR: "1" }
      })
    try {
      await run([eslint, "src", "--ignore-pattern", "src/application.test.tsx"])
      await run([tsc, "--noEmit"])
      return (await run([vitest, "run"])).stdout
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string }
      throw new Error((result.stdout ?? "") + (result.stderr ?? ""), { cause: error })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
