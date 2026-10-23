import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { validateInitializationTarget } from "../.harness/tooling/initialization-target.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import type { InstantiateOptions } from "../.harness/tooling/types.ts"
import { isNested } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-snapshot.ts"
import { isNestedPath } from "../.agents/skills/web-run-parallel-worktrees/scripts/parallel-git.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { inspectRepositoryLineLimits } from "../scripts/harness-validation/line-limits.ts"
import { initOptions } from "./initialization-atomicity-fixture.ts"
import { createSymlinkOrSkip } from "./setup.ts"

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
  /** 大小写不敏感磁盘上的源目录别名不能与模板内外链组合绕过门禁。 */
  test("blocks case aliases combined with a source-local outside link", async (context) => {
    const sourceRoot = await sourceFixture()
    const outsideRoot = await sourceFixture()
    const sourceAlias = path.join(path.dirname(sourceRoot), path.basename(sourceRoot).toUpperCase())
    try {
      if ((await realpath(sourceAlias)) !== (await realpath(sourceRoot))) {
        return context.skip("Case alias refers to a different directory")
      }
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT") {
        return context.skip("Filesystem has case-sensitive paths")
      }
      throw error
    }
    await createSymlinkOrSkip(context, outsideRoot, path.join(sourceRoot, "linked-parent"), "dir")
    const parent = path.join(sourceAlias, "linked-parent")
    const id = "boundary-probe"
    const targetRoot = path.join(parent, id)
    await expect(
      validateInitializationTarget(sourceRoot, { targetRoot: parent, id })
    ).rejects.toThrow(/outside the Harness template/)
    await expect(
      runInstantiateCli([parent, "--type", "web", "--server", "none", "--name", "Boundary Probe"], {
        sourceRoot,
        interactive: false
      })
    ).rejects.toThrow(/outside the Harness template/)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    await expect(instantiateProject({ sourceRoot, targetRoot, init })).rejects.toThrow(
      /outside the Harness template/
    )
    expect(await readdir(sourceRoot)).toEqual(["linked-parent"])
    expect(await readdir(outsideRoot)).toEqual([])
  })

  /** 三个创建入口都拒绝请求或真实位置在源内的链接，且不创建目标或暂存。 */
  test("blocks linked downstream locations before writing", async (context) => {
    for (const direction of ["inside-to-outside", "outside-to-inside"]) {
      const sourceRoot = await sourceFixture()
      const outsideRoot = await sourceFixture()
      const linkParent = direction === "inside-to-outside" ? sourceRoot : outsideRoot
      const destination = direction === "inside-to-outside" ? outsideRoot : sourceRoot
      const link = path.join(linkParent, "linked-parent")
      await createSymlinkOrSkip(context, destination, link, "dir")
      const sourceBefore = await readdir(sourceRoot)
      const outsideBefore = await readdir(outsideRoot)
      const id = "boundary-probe"
      const targetRoot = path.join(link, id)
      const initialize = vi.fn(async () => {
        throw new Error("Initializer must not run")
      })
      await expect(
        validateInitializationTarget(sourceRoot, { targetRoot: link, id })
      ).rejects.toThrow(/outside the Harness template/)
      await expect(
        runInstantiateCli([link, "--type", "web", "--server", "none", "--name", "Boundary Probe"], {
          sourceRoot,
          interactive: false,
          instantiate: initialize
        })
      ).rejects.toThrow(/outside the Harness template/)
      const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
      void ignoredRoot
      await expect(
        instantiateProject({ sourceRoot, targetRoot, init }, initialize)
      ).rejects.toThrow(/outside the Harness template/)
      expect(initialize).not.toHaveBeenCalled()
      expect(await readdir(sourceRoot)).toEqual(sourceBefore)
      expect(await readdir(outsideRoot)).toEqual(outsideBefore)
    }
  })

  /** 合法源外链接仍可解析、确认并经事务发布，不扩大为禁止所有符号链接。 */
  test("allows an outside alias to an outside parent", async (context) => {
    const sourceRoot = await sourceFixture()
    const aliasRoot = await sourceFixture()
    const destination = await sourceFixture()
    const link = path.join(aliasRoot, "linked-parent")
    await createSymlinkOrSkip(context, destination, link, "dir")
    const id = "boundary-probe"
    await expect(
      validateInitializationTarget(sourceRoot, { targetRoot: link, id })
    ).resolves.toBeUndefined()
    const instantiate = vi.fn(async (options: InstantiateOptions) =>
      createProjectConfig(options.init)
    )
    await runInstantiateCli(
      [link, "--type", "web", "--server", "none", "--name", "Boundary Probe"],
      { sourceRoot, interactive: false, instantiate, output: () => undefined }
    )
    expect(instantiate).toHaveBeenCalledOnce()
    const targetRoot = path.join(link, id)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    await instantiateProject({ sourceRoot, targetRoot, init }, async (options) =>
      createProjectConfig(options)
    )
    expect(await readdir(sourceRoot)).toEqual([])
    expect(await readdir(destination)).toEqual([id])
    expect(await readdir(path.join(destination, id))).toEqual([])
  })

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
