import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { isNested } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import { isNestedPath } from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-git.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { inspectRepositoryLineLimits } from "../scripts/harness-validation/line-limits.ts"
import { initOptions } from "./initialization-atomicity-fixture.ts"

const roots: string[] = []

/** 创建只包含本次路径边界用例的隔离源根。 */
async function sourceFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-path-containment-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("目录段级路径包含关系", () => {
  /** 验证名称以双点开头的普通子目录仍在源内，公开入口在任何写入前拒绝。 */
  test("rejects dot-prefixed source descendants at the public entry", async () => {
    const sourceRoot = await sourceFixture()
    await expect(
      runInstantiateCli(
        [
          path.join(sourceRoot, "..ordinary-directory"),
          "--server",
          "create",
          "--type",
          "web",
          "--name",
          "Boundary Probe",
          "--policy-mode",
          "预设"
        ],
        {
          sourceRoot,
          interactive: false,
          instantiate: async () => {
            throw new Error("Initializer must not run")
          }
        }
      )
    ).rejects.toThrow(/outside the Harness template/)
    expect(await readdir(sourceRoot)).toEqual([])
  })

  /** 验证内部实例化门禁独立拒绝同一目录名称，且不会创建暂存目录。 */
  test("rejects dot-prefixed source descendants at the internal entry", async () => {
    const sourceRoot = await sourceFixture()
    const targetRoot = path.join(sourceRoot, "..ordinary-directory", "boundary-probe")
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "boundary-probe")
    void ignoredRoot
    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async () => {
        throw new Error("Initializer must not run")
      })
    ).rejects.toThrow(/outside the Harness template/)
    expect(await readdir(sourceRoot)).toEqual([])
  })

  /** 验证升级和并行审计同时识别普通双点前缀目录、父目录及同名前缀 sibling。 */
  test("distinguishes ordinary names from parent segments across helpers", () => {
    const root = path.resolve("boundary-root")
    expect(isNested(root, root)).toBe(true)
    expect(isNestedPath(root, root)).toBe(false)
    for (const candidate of [path.join(root, "..ordinary"), path.join(root, "..ordinary/file")]) {
      expect(isNested(root, candidate)).toBe(true)
      expect(isNestedPath(root, candidate)).toBe(true)
    }
    for (const candidate of [
      path.dirname(root),
      path.resolve(root, "../sibling"),
      `${root}-sibling`
    ]) {
      expect(isNested(root, candidate)).toBe(false)
      expect(isNestedPath(root, candidate)).toBe(false)
    }
  })

  /** 验证行数扫描不误拒合法双点前缀目录，同时继续拒绝真实越界路径。 */
  test("checks maintained files inside dot-prefixed directories", async () => {
    const root = await sourceFixture()
    await mkdir(path.join(root, "..ordinary"))
    await writeFile(path.join(root, "..ordinary/guide.md"), "# Guide\n")
    const report = await inspectRepositoryLineLimits(root, ["..ordinary/guide.md"])
    expect(report).toMatchObject({ ok: true, checkedTextFiles: 1, errors: [] })
    expect((await inspectRepositoryLineLimits(root, ["../escaped.md"])).errors).toHaveLength(1)
  })
})
