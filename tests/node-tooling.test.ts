import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { validateNodeTooling } from "../scripts/harness-validation/node-tooling.ts"
import { validateHarness } from "../scripts/validate-harness.ts"
import { copyRepository } from "./harness-validator-fixture.ts"

/** 保存独立规则测试的临时根目录。 */
const roots: string[] = []

/** 用实际文件执行工具运行时检查。 */
async function inspect(entries: Record<string, string>): Promise<string[]> {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-node-tooling-"))
  roots.push(root)
  for (const [file, source] of Object.entries(entries)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), source)
  }
  const errors: string[] = []
  await validateNodeTooling(root, Object.keys(entries), errors)
  return errors
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Node-only Harness tooling", () => {
  /** 验证自有 Python 文件和真实解释器入口都被阻断。 */
  test("rejects Python files, shebangs, package entries and process aliases", async () => {
    const errors = await inspect({
      "scripts/tool.py": "print('owned')\n",
      "scripts/legacy": "#!/usr/bin/env python3\n",
      "package.json": JSON.stringify({
        scripts: { legacy: "python3 scripts/tool.py" },
        bin: "scripts/tool.py"
      }),
      "scripts/launch.ts":
        'import { execFile as run } from "node:child_process"\nimport { promisify } from "node:util"\nconst runAsync = promisify(run)\nawait runAsync("python3.12", ["tool.py"])\n',
      "scripts/windows.ts":
        'import * as processes from "node:child_process"\nprocesses.spawn("py.exe", ["tool.py"])\n'
    })
    expect(errors).toHaveLength(6)
    expect(errors.join("\n")).toContain("Node-only tooling")
  })

  /** 验证普通文案、源码夹具、外部包与 Node/native 子进程不会被误判。 */
  test("accepts Node tools and ignores non-executable references and third-party files", async () => {
    expect(
      await inspect({
        "scripts/tool.ts":
          'import { execFile } from "node:child_process"\nexecFile("git", ["status"])\nexecFile("pnpm", ["test"])\nconst fixture = \'execFile("python3", ["fake.py"])\'\n// Python migration history\n',
        "scripts/node": "#!/usr/bin/env node\n",
        "package.json": JSON.stringify({ scripts: { test: "pnpm exec tsx scripts/tool.ts" } }),
        "docs/history.md": "Python tools were removed.\n",
        "node_modules/dependency/tool.py": "external\n",
        ".git/hooks/tool.py": "external\n",
        ".harness/vendor/upstream/tool.py": "external\n"
      })
    ).toEqual([])
  })

  /** 验证源 Harness 总门禁实际调用 Node-only 规则。 */
  test("rejects an owned Python tool through the Harness entry point", async () => {
    const root = await copyRepository()
    await writeFile(path.join(root, "scripts/legacy.py"), "print('legacy')\n")
    await expect(validateHarness(root)).rejects.toThrow(
      /Node-only tooling forbids owned Python files/
    )
  })
})
