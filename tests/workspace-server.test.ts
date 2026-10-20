import { execFile } from "node:child_process"
import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { expect, test } from "vitest"
import { generateGoServer } from "../.harness/tooling/workspace-server.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"

/** 直接验证生成的 Go 中间件，不以源码字符串断言替代真实行为。 */
test("生成的 Go 日志保持传输完整、缓冲有界且实际配置不泄漏凭据", async () => {
  const root = await temporaryDirectory("workspace-server-logger-")
  const relative = ".agents/skills/go-implement-service/assets/go-service"
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await cp(path.join(repositoryRoot, relative), path.join(root, relative), { recursive: true })
  await generateGoServer(root, "example_server", "example_server")
  const result = await promisify(execFile)(
    "go",
    ["test", "./internal/middleware", "-run", "TestLogger", "-count=1"],
    {
      cwd: path.join(root, "example_server"),
      env: { ...process.env, GOTOOLCHAIN: "local" },
      timeout: 120_000
    }
  ).catch((error: unknown) => {
    const output = error as { stdout?: string; stderr?: string }
    throw new Error(`${output.stdout ?? ""}\n${output.stderr ?? ""}`, { cause: error })
  })
  expect(result.stdout).toContain("ok")
}, 130_000)
