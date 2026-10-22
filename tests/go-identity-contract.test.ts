import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { installUsers } from "../.agents/skills/go-implement-service/scripts/install-users.ts"
import { webFiles } from "../.harness/tooling/templates/web.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { GO_TRANSPORT_SOURCE } from "../.harness/tooling/workspace-http.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"
import { startGoFixture } from "./go-identity-support.ts"

/** 编译真实生成的 Go 服务及客户端，验证 HTTP 合同与重启后的持久化。 */
test("Go identity adapter uses authoritative wire contracts and durable account revocation", async () => {
  const cache = path.join(repositoryRoot, "node_modules/.cache")
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(path.join(cache, "go-identity-"))
  const server = path.join(root, "contract_server")
  const run = promisify(execFile)
  const options = {
    cwd: server,
    env: { ...process.env, GOTOOLCHAIN: "local", APP_ENV: "dev", APP_VERIFICATION_MOCK: "true" },
    timeout: 120_000
  }
  let stop: (() => Promise<void>) | undefined
  try {
    const assets = ".agents/skills/go-implement-service/assets/go-service"
    await cp(path.join(repositoryRoot, assets), path.join(root, assets), { recursive: true })
    await generateGoServer(root, "contract_server", "contract_server")
    await mkdir(path.join(root, ".harness"), { recursive: true })
    await writeFile(
      path.join(root, ".harness/workspace.json"),
      JSON.stringify({
        kind: "workspace",
        id: "contract",
        members: [{ type: "server", directory: "contract_server" }],
        service: { mode: "create" }
      })
    )
    await installUsers(root, false, [
      "register",
      "login",
      "profile",
      "logout",
      "refresh",
      "password.change",
      "verification"
    ])
    expect(await readFile(path.join(server, "internal/pkg/notify/smtp.go"), "utf8")).not.toMatch(
      /排行榜|毕方/u
    )
    expect(await readFile(path.join(server, "internal/service/auth.go"), "utf8")).not.toContain(
      "Leaderboard"
    )
    await run("go", ["mod", "tidy"], options)
    await run("go", ["test", "./..."], options)
    await run(
      "go",
      ["test", "-race", "./internal/service", "./internal/config", "./internal/pkg/notify"],
      options
    )
    const binary = path.join(server, process.platform === "win32" ? "fixture.exe" : "fixture")
    await run("go", ["build", "-o", binary, "./cmd/server"], options)
    const developmentDelivery = {
      APP_VERIFICATION_ENABLED: "true",
      APP_VERIFICATION_MOCK: "true",
      APP_VERIFICATION_RESEND_INTERVAL: "0s"
    }
    const running = await startGoFixture(server, binary, developmentDelivery)
    stop = running.stop
    const base = webFiles(
      createProjectConfig({
        projectType: "web",
        id: "contract",
        name: "Contract",
        description: "Contract",
        brandColor: "#2563eb"
      }),
      { developmentBaseUrl: "", testBaseUrl: "", releaseBaseUrl: "" }
    )
    const files = new Map(
      [...base].filter(
        ([name]) =>
          name.startsWith("src/data/") ||
          name.startsWith("src/i18n/") ||
          name.startsWith("src/observability/") ||
          name === "src/brand.ts" ||
          name === "src/config/environment.schema.ts"
      )
    )
    for (const name of [...files.keys()]) if (/\.test\./u.test(name)) files.delete(name)
    const recipe =
      ".agents/skills/web-compose-capabilities/templates/compositions/account-workspace/data/api/"
    const copies = {
      "src/data/api/identity/adapter.ts":
        ".agents/skills/workspace-implement-users/assets/go-identity-adapter.ts.txt",
      "src/data/api/identity/verification.ts":
        ".agents/skills/workspace-implement-users/assets/registration-verification.ts.txt",
      "src/data/api/identity/verification.test.ts":
        ".agents/skills/workspace-implement-users/assets/registration-verification.test.ts.txt",
      "src/data/api/identity/goContract.ts": recipe + "auth/serviceContract.ts.txt",
      "src/data/api/foundationProtocol.ts": recipe + "foundationProtocol.ts.txt",
      "src/features/identity/session.ts":
        ".agents/skills/web-compose-capabilities/templates/identity/session.ts.txt",
      "src/data/api/identity/contracts.ts":
        ".agents/skills/web-compose-capabilities/templates/application/files/identity/contracts.ts.txt",
      "src/data/api/identity/adapter.test.ts": "tests/fixtures/go-identity.test.ts.txt"
    }
    for (const [target, source] of Object.entries(copies))
      files.set(target, await readFile(path.join(repositoryRoot, source), "utf8"))
    files.set("src/data/api/client/goTransport.ts", GO_TRANSPORT_SOURCE)
    files.set(
      "src/fixture-env.d.ts",
      "interface ImportMeta { readonly env: Record<string, string | boolean | undefined> }"
    )
    files.set(
      "src/config/environment.ts",
      `export const APP_CONFIG = { environment: "development", apiBaseUrl: ${JSON.stringify(running.url)}, requestTimeoutMs: 3000, logLevel: "error" } as const`
    )
    for (const [name, source] of files) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await writeFile(path.join(root, name), source)
    }
    await writeFile(path.join(root, "package.json"), '{"private":true,"type":"module"}')
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2023",
          module: "ESNext",
          moduleResolution: "Bundler",
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
      'export default { test: { environment: "node", include: ["src/**/*.test.ts"] } }'
    )
    for (const [pkg, script, args] of [
      ["typescript", "lib/tsc.js", ["--noEmit"]],
      ["vitest", "vitest.mjs", ["run"]]
    ] as const) {
      const cli = path.join(
        path.dirname(fileURLToPath(import.meta.resolve(pkg + "/package.json"))),
        script
      )
      const result = await run(process.execPath, [cli, ...args], {
        cwd: root,
        timeout: 40_000,
        env: { ...process.env, NO_COLOR: "1" }
      })
      if (pkg === "vitest") expect(result.stdout).toMatch(/Tests\s+[1-9]\d* passed/u)
    }
    await stop()
    stop = undefined
    const restarted = await startGoFixture(server, binary, developmentDelivery)
    stop = restarted.stop
    const response = await fetch(restarted.url + "/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "contract@example.invalid", password: "Changed123" })
    })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.data.account).toMatchObject({
      username: expect.stringMatching(/^user_/u),
      nickname: "New nickname",
      phone: null
    })
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string }
    throw new Error((output.stdout ?? "") + (output.stderr ?? ""), { cause: error })
  } finally {
    await stop?.()
    await rm(root, { recursive: true, force: true })
  }
}, 240_000)
