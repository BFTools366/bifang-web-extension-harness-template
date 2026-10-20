import { stripVTControlCharacters } from "node:util"
import { describe, expect, test } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { repositoryRoot, path } from "./harness-tooling-support.ts"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readdir, rm, writeFile, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { webFiles } from "../.harness/tooling/templates/web.ts"
describe("account service protocol references", () => {
  /** 验证保留的协议与存储参考独立编译，执行服务合同及最高风险失败回归。 */
  test.each(["", "https://service.invalid"])(
    "账户协议参考通过类型检查和行为回归（测试地址：%s）",
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
        const files = new Map(
          [...base].filter(
            ([name]) =>
              !/\.test\.[jt]sx?$/u.test(name) &&
              (name === "src/brand.ts" ||
                name === "src/vite-env.d.ts" ||
                /^src\/(?:data|config|i18n|observability|pagination|state)\//u.test(name))
          )
        )
        const referenceRoot = path.join(
          repositoryRoot,
          ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace"
        )
        /** 将保留的数据协议参考放入隔离测试工程，不创建第二套应用入口。 */
        async function addReferences(directory: string): Promise<void> {
          for (const entry of await readdir(path.join(referenceRoot, directory), {
            withFileTypes: true
          })) {
            const relative = path.posix.join(directory, entry.name)
            if (entry.isDirectory()) await addReferences(relative)
            else
              files.set(
                "src/" + relative.replace(/\.txt$/u, ""),
                await readFile(path.join(referenceRoot, relative), "utf8")
              )
          }
        }
        await addReferences("data")
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
            stripVTControlCharacters(output)
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

/** 运行独立会话模板的 vitest 测试及严格类型检查，不引入组织、权限或UI。 */
test("standalone identity template compiles and passes lifecycle behavior", async () => {
  // 位于仓库依赖缓存内，模板中的 vitest 导入与下游一样从项目依赖解析。
  const cache = path.join(repositoryRoot, "node_modules/.cache")
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(path.join(cache, "identity-template-"))
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
    const vitest = path.join(
      path.dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
      "vitest.mjs"
    )
    const output = execFileSync(process.execPath, [vitest, "run", "--root", root], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" }
    })
    expect(output).toMatch(/Tests\s+21 passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
