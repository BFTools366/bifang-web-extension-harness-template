import { execFileSync } from "node:child_process"
import { cp, mkdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"

/** 构造根运行时实际读取的最小成员，不依赖安装或构建。 */
async function runtimeFixture(
  policy: string,
  development = 'VITE_API_BASE_URL="https://api.example.test"\n'
) {
  const root = await realpath(await temporaryDirectory("workspace-runtime-"))
  const member = path.join(root, "example_web")
  await mkdir(path.join(root, ".harness/runtime"), { recursive: true })
  for (const name of ["workspace.mjs", "release.mjs", "archive.mjs"])
    await cp(
      path.join(repositoryRoot, ".harness/runtime", name),
      path.join(root, ".harness/runtime", name)
    )
  await mkdir(path.join(member, ".harness"), { recursive: true })
  await mkdir(path.join(member, "src/data/api/client"), { recursive: true })
  await writeFile(
    path.join(root, ".harness/workspace.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "workspace",
      id: "example",
      members: [{ type: "web", directory: "example_web" }],
      service: { mode: "existing", developmentBaseUrl: "https://api.example.test" }
    })
  )
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "example",
      private: true,
      scripts: { dev: "node runtime.mjs" }
    })
  )
  await writeFile(path.join(member, "package.json"), JSON.stringify({ name: "example_web" }))
  await writeFile(
    path.join(member, ".harness/project.json"),
    JSON.stringify({ id: "example_web", projectType: "web" })
  )
  await writeFile(path.join(root, "pnpm-workspace.yaml"), policy)
  await writeFile(path.join(member, ".env.development"), development)
  for (const file of [".env.test", ".env.production", "src/data/api/client/httpRuntime.ts"])
    await writeFile(path.join(member, file), "")
  return root
}

/** 通过真实 Node 入口运行发布前的结构校验。 */
function validate(root: string): void {
  execFileSync(
    process.execPath,
    [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
    { cwd: root, stdio: "pipe" }
  )
}

describe("Workspace 运行时配置边界", () => {
  /** 注释、重复声明和未登记包都不能充当真实成员清单。 */
  test.each([
    'packages:\n  - "unregistered_web"\n# "example_web"\nallowBuilds:\n  sharp: true\n',
    'packages:\n  - "example_web"\n  - "unregistered_web"\nallowBuilds:\n  sharp: true\n',
    'packages:\n  - "example_web"\npackages: []\nallowBuilds:\n  sharp: true\n',
    'packages:\n  - "example_web"\n  - "example_web"\nallowBuilds:\n  sharp: true\n'
  ])("拒绝不精确的 pnpm 清单 %#", async (policy) => {
    const awaitedRoot = await runtimeFixture(policy)
    expect(() => validate(awaitedRoot)).toThrow(/pnpm/)
  })

  /** 与前端环境加载器使用相同的 dotenv 语义并支持 CRLF。 */
  test.each([
    "VITE_API_BASE_URL='https://api.example.test'\n",
    "VITE_API_BASE_URL=https://api.example.test # selected API\n",
    'VITE_API_BASE_URL="https://api.example.test"\r\n'
  ])("接受合法环境写法 %#", async (development) => {
    const root = await runtimeFixture(
      'packages:\r\n  - "example_web"\r\nallowBuilds:\r\n  sharp: true\r\n',
      development
    )
    expect(() => validate(root)).not.toThrow()
  })

  /** 重复环境键按最终有效值校验，不能放行真实地址漂移。 */
  test("拒绝被后续环境键覆盖的服务地址", async () => {
    const root = await runtimeFixture(
      'packages:\n  - "example_web"\n',
      'VITE_API_BASE_URL="https://api.example.test"\nVITE_API_BASE_URL="https://other.example.test"\n'
    )
    expect(() => validate(root)).toThrow(/BaseURL/)
  })
})
