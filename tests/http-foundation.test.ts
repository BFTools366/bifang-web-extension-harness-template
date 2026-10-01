import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { HTTP_CLIENT_SOURCE } from "../.harness/tooling/templates/http-client.ts"
import { HTTP_CONTRACTS_SOURCE } from "../.harness/tooling/templates/http-contracts.ts"
import { HTTP_PROTOCOL_SOURCE } from "../.harness/tooling/templates/http-protocol.ts"
import { HTTP_CLIENT_TEST } from "../.harness/tooling/templates/http-client-test.ts"
import { HTTP_TRANSPORT_TEST } from "../.harness/tooling/templates/http-transport-test.ts"
import { HTTP_TEST_FIXTURES } from "../.harness/tooling/templates/http-test-fixtures.ts"
import { HTTP_AUTH_TEST } from "../.harness/tooling/templates/http-auth-test.ts"
import { HTTP_ERRORS_SOURCE } from "../.harness/tooling/templates/http-errors.ts"
import { languageSource } from "../.harness/tooling/templates/http-language.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { webFiles } from "../.harness/tooling/templates/web.ts"
import { extensionFiles } from "../.harness/tooling/templates/extension.ts"

describe("generated HTTP foundation", () => {
  /** 在本地依赖可解析的隔离目录执行完整生成测试，覆盖真实 Ky 与既有认证竞态。 */
  test("runs the generated Ky and request-context regressions", async () => {
    // 缓存目录位于项目内，使跨平台解析使用现有本地依赖且无需符号链接或额外安装。
    const cacheRoot = path.resolve(import.meta.dirname, "../node_modules/.cache")
    await mkdir(cacheRoot, { recursive: true })
    // 保存本次隔离测试根，结束时只清理本次创建的目录。
    const root = await mkdtemp(path.join(cacheRoot, "harness-http-"))
    try {
      for (const directory of ["src/api/client", "src/config", "src/i18n", "src/observability"]) {
        await mkdir(path.join(root, directory), { recursive: true })
      }
      await writeFile(path.join(root, "src/api/client/httpClient.ts"), HTTP_CLIENT_SOURCE)
      await writeFile(path.join(root, "src/api/client/httpContracts.ts"), HTTP_CONTRACTS_SOURCE)
      await writeFile(path.join(root, "src/api/client/httpProtocol.ts"), HTTP_PROTOCOL_SOURCE)
      await writeFile(path.join(root, "src/api/client/httpClient.test.ts"), HTTP_CLIENT_TEST)
      await writeFile(path.join(root, "src/api/client/httpTransport.test.ts"), HTTP_TRANSPORT_TEST)
      await writeFile(path.join(root, "src/api/client/httpTestFixtures.ts"), HTTP_TEST_FIXTURES)
      await writeFile(path.join(root, "src/api/client/httpInterception.test.ts"), HTTP_AUTH_TEST)
      await writeFile(path.join(root, "src/api/client/httpErrors.ts"), HTTP_ERRORS_SOURCE)
      await writeFile(path.join(root, "src/i18n/language.ts"), languageSource())
      await writeFile(path.join(root, "src/brand.ts"), 'export const BRAND = { id: "http-test" }\n')
      await writeFile(
        path.join(root, "src/config/environment.ts"),
        'export const APP_CONFIG = { apiBaseUrl: "https://api.example.com/v1", requestTimeoutMs: 1000 }\n'
      )
      await writeFile(
        path.join(root, "src/config/environment.schema.ts"),
        "export interface AppConfig { apiBaseUrl: string; requestTimeoutMs: number }\n"
      )
      await writeFile(
        path.join(root, "src/observability/logger.ts"),
        "export const createLogger = (_scope: string) => ({ warn() {}, error() {} })\n"
      )
      await writeFile(path.join(root, "package.json"), '{"private":true,"type":"module"}\n')
      await writeFile(
        path.join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2023",
            module: "ESNext",
            moduleResolution: "Bundler",
            lib: ["ES2023", "DOM", "DOM.Iterable"],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: ["node", "vitest/globals"]
          },
          include: ["src/**/*.ts"]
        })
      )
      await writeFile(
        path.join(root, "vitest.config.ts"),
        'export default { test: { environment: "node", include: ["src/**/*.test.ts"] } }\n'
      )
      // 使用项目声明的 Vitest CLI，真实执行生成测试且不继承源 Harness 的 include。
      const vitestCli = path.join(
        path.dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
        "vitest.mjs"
      )
      // 模板字符串不会被源 tsc 检查，单独验证生成客户端与真实 Ky 声明的类型兼容。
      const typescriptCli = path.join(
        path.dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))),
        "lib/tsc.js"
      )
      try {
        execFileSync(process.execPath, [typescriptCli, "--noEmit"], {
          cwd: root,
          encoding: "utf8",
          timeout: 20_000,
          stdio: "pipe"
        })
      } catch (error) {
        // TypeScript 把诊断写到 stdout，显式附加以便根测试直接显示失败位置。
        const failure = error as { stdout?: string; stderr?: string }
        throw new Error(
          "Generated HTTP typecheck failed:\n" + (failure.stdout ?? "") + (failure.stderr ?? ""),
          { cause: error }
        )
      }
      // 保留子进程输出，失败时直接展示具体回归而不是将空批次判为通过。
      const output = execFileSync(
        process.execPath,
        [vitestCli, "run", "--config", "vitest.config.ts"],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 20_000,
          env: { ...process.env, NO_COLOR: "1" },
          stdio: "pipe"
        }
      )
      expect(output).toMatch(/Tests\s+[1-9]\d* passed/)
      expect(output).toMatch(/Test Files\s+3 passed/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

for (const projectType of ["web", "extension"] as const) {
  /** 执行真实生成组件与 Router/Query 配置，模板字符串本身不是交互验证。 */
  test("runs generated " + projectType + " HTTP routing and UI regressions", async () => {
    const cacheRoot = path.resolve(import.meta.dirname, "../node_modules/.cache")
    await mkdir(cacheRoot, { recursive: true })
    const root = await mkdtemp(path.join(cacheRoot, "harness-http-ui-"))
    try {
      const config = createProjectConfig({
        projectType,
        name: "Neutral fixture",
        id: "http-fixture",
        description: "Neutral HTTP foundation fixture",
        brandColor: "#2563eb"
      })
      const baseUrls = { developmentBaseUrl: "", testBaseUrl: "", releaseBaseUrl: "" }
      const files =
        projectType === "web" ? webFiles(config, baseUrls) : extensionFiles(config, baseUrls)
      const selected = new Set([
        "src/brand.ts",
        "src/i18n.ts",
        "src/buildVersion.ts",
        "src/plasmo.d.ts",
        "src/app/theme.ts",
        "src/app/AppProviders.tsx",
        "src/app/queryClient.ts",
        "src/routes/__root.tsx",
        "src/features/not-found/NotFoundPage.tsx",
        "src/features/route-state/RouteState.tsx",
        "src/features/route-state/RouteState.test.tsx",
        "src/features/welcome/WelcomePage.tsx",
        "src/features/welcome/WelcomePage.test.tsx",
        "src/providers.tsx",
        "src/ExtensionShell.tsx",
        "src/ExtensionShell.test.tsx",
        "src/ExtensionNotFoundPage.tsx",
        "src/extension-router.tsx",
        "src/config/environment.schema.ts",
        "src/observability/logger.ts"
      ])
      for (const [name, source] of files) {
        if (
          !selected.has(name) &&
          !["src/api/client/", "src/i18n/", "src/theme/"].some((prefix) => name.startsWith(prefix))
        )
          continue
        await mkdir(path.dirname(path.join(root, name)), { recursive: true })
        await writeFile(path.join(root, name), source)
      }
      await writeFile(
        path.join(root, "src/config/environment.ts"),
        'export const APP_CONFIG = { environment: "test", apiBaseUrl: "", requestTimeoutMs: 1000, logLevel: "error" } as const\n'
      )
      await writeFile(path.join(root, "package.json"), '{"private":true,"type":"module"}\n')
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
            noEmit: true,
            skipLibCheck: true,
            types: ["node", "vitest/globals", "vite/client", "@testing-library/jest-dom/vitest"]
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
              include:
                projectType === "web"
                  ? [
                      "src/api/client/httpUi.test.tsx",
                      "src/features/route-state/RouteState.test.tsx",
                      "src/features/welcome/WelcomePage.test.tsx"
                    ]
                  : ["src/api/client/httpUi.test.tsx", "src/ExtensionShell.test.tsx"],
              setupFiles: [path.resolve(import.meta.dirname, "setup.ts")]
            }
          })
      )
      const typescriptCli = path.join(
        path.dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))),
        "lib/tsc.js"
      )
      const vitestCli = path.join(
        path.dirname(fileURLToPath(import.meta.resolve("vitest/package.json"))),
        "vitest.mjs"
      )
      try {
        execFileSync(process.execPath, [typescriptCli, "--noEmit"], {
          cwd: root,
          encoding: "utf8",
          timeout: 20_000,
          stdio: "pipe"
        })
        const output = execFileSync(
          process.execPath,
          [vitestCli, "run", "--config", "vitest.config.ts"],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 20_000,
            env: { ...process.env, NO_COLOR: "1" },
            stdio: "pipe"
          }
        )
        expect(output).toMatch(/Tests\s+[1-9]\d* passed/)
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string }
        throw new Error(
          "Generated " +
            projectType +
            " HTTP UI check failed:\n" +
            (failure.stdout ?? "") +
            (failure.stderr ?? ""),
          { cause: error }
        )
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
