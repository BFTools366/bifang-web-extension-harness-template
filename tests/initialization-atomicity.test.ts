import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile
} from "node:fs/promises"
import path from "node:path"
import { describe, expect, test, vi } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { initializeProject } from "../.harness/tooling/init.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { createSymlinkOrSkip } from "./setup.ts"
import {
  repositoryRoot,
  temporaryDirectory,
  initOptions,
  snapshotTree
} from "./initialization-atomicity-fixture.ts"

/** 验证 failure-safe initialization 的完整回归场景。 */
describe("failure-safe initialization", () => {
  /** 验证 preflights missing downstream documentation before the first internal staged write 场景。 */
  test("preflights missing downstream documentation before the first internal staged write", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await temporaryDirectory("harness-atomic-init-")
    await mkdir(path.join(root, "docs"))
    await writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "template", version: "0.1.0", private: true }, null, 2)}\n`
    )
    await writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: {}, include: ["src/**/*.ts"] }, null, 2)}\n`
    )
    await writeFile(
      path.join(root, "LICENSE.en.md"),
      "Applicable Project Name: Bifang Web Harness Template. Preserve everything else.\n"
    )
    await writeFile(
      path.join(root, "LICENSE.zh-CN.md"),
      "适用项目名称：Bifang Web Harness Template。保留其余内容。\n"
    )
    await writeFile(
      path.join(root, "docs/DATA_ACCESS.md"),
      await readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8")
    )
    await writeFile(
      path.join(root, "docs/AGENT_POLICY.md"),
      await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    )
    await writeFile(
      path.join(root, "docs/ENGINEERING_RULES.md"),
      await readFile(path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"), "utf8")
    )
    const before = await snapshotTree(root)

    await expect(
      initializeProject(initOptions(root, "extension", "atomic-extension"))
    ).rejects.toThrow(/MANTINE_UI_GUIDELINES\.md/)

    expect(await snapshotTree(root)).toEqual(before)
  })

  /** 验证 removes only sibling staging data when copied initialization fails 场景。 */
  test("removes only sibling staging data when copied initialization fails", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const sourceRoot = await temporaryDirectory("harness-atomic-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/copied-marker.txt"), "copied before failure\n")
    const targetParent = await temporaryDirectory("harness-atomic-target-")
    const canonicalTargetParent = await realpath(targetParent)

    for (const targetExisted of [false, true]) {
      const id = targetExisted ? "existing-empty-target" : "absent-target"
      const targetRoot = path.join(targetParent, id)
      if (targetExisted) await mkdir(targetRoot)
      const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
      void ignoredRoot

      await expect(
        instantiateProject(
          {
            sourceRoot,
            targetRoot,
            init
          },
          async (stagedOptions) => {
            expect(stagedOptions.root).not.toBe(targetRoot)
            expect(path.dirname(stagedOptions.root)).toBe(canonicalTargetParent)
            expect(
              await readFile(path.join(stagedOptions.root, "docs/copied-marker.txt"), "utf8")
            ).toBe("copied before failure\n")
            throw new Error("controlled post-copy initialization failure")
          }
        )
      ).rejects.toThrow(/controlled post-copy initialization failure/)

      if (targetExisted) {
        expect(await readdir(targetRoot)).toEqual([])
      } else {
        await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
      }
      expect(
        (await readdir(targetParent)).filter((entry) => entry.startsWith(`.${id}.harness-stage-`))
      ).toEqual([])
    }
  })

  /** 验证已存在的空目标可成功发布，POSIX 额外核对冻结权限模式。 */
  test("publishes over the bound empty target with its frozen mode", async () => {
    const sourceRoot = await temporaryDirectory("harness-bound-target-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-bound-target-parent-")
    const id = "bound-empty-target"
    const targetRoot = path.join(targetParent, id)
    await mkdir(targetRoot)
    if (process.platform !== "win32") await chmod(targetRoot, 0o751)
    const originalTargetStat = await lstat(targetRoot)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await writeFile(path.join(stagedOptions.root, "published.txt"), "published\n")
        return createProjectConfig(stagedOptions)
      })
    ).resolves.toMatchObject({ id, projectType: "web" })

    const publishedTargetStat = await lstat(targetRoot)
    expect(publishedTargetStat.isDirectory()).toBe(true)
    if (process.platform !== "win32") {
      expect(publishedTargetStat.mode).toBe(originalTargetStat.mode)
    }
    expect(await readFile(path.join(targetRoot, "published.txt"), "utf8")).toBe("published\n")
    expect(
      (await readdir(targetParent)).filter(
        (entry) =>
          entry.startsWith("." + id + ".harness-stage-") ||
          entry.startsWith("." + id + ".harness-target-")
      )
    ).toEqual([])
  })

  /** 验证同一目标的第二个合作初始化器会被 sibling 租约阻断。 */
  test("serializes cooperating initializers for the same target", async () => {
    const sourceRoot = await temporaryDirectory("harness-lease-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-lease-target-")
    const id = "leased-target"
    const targetRoot = path.join(targetParent, id)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    let releaseFirst: (() => void) | undefined
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let markFirstReady: (() => void) | undefined
    const firstReady = new Promise<void>((resolve) => {
      markFirstReady = resolve
    })

    const first = instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
      markFirstReady?.()
      await firstCanFinish
      await writeFile(path.join(stagedOptions.root, "published.txt"), "first\n")
      return createProjectConfig(stagedOptions)
    })
    await firstReady

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) =>
        createProjectConfig(stagedOptions)
      )
    ).rejects.toThrow(/already owns target/)

    releaseFirst?.()
    await expect(first).resolves.toMatchObject({ id })
    expect(await readFile(path.join(targetRoot, "published.txt"), "utf8")).toBe("first\n")
    expect((await readdir(targetParent)).filter((entry) => entry.includes(".harness-"))).toEqual([])
  })

  /** 验证冻结父目录被替换后不会发布或递归清理替代树。 */
  test("fails closed when the target parent identity changes", async (context) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const sourceRoot = await temporaryDirectory("harness-parent-swap-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const container = await temporaryDirectory("harness-parent-swap-container-")
    const targetParent = path.join(container, "stable-parent")
    const displacedParent = path.join(container, "displaced-parent")
    const attackerParent = path.join(container, "attacker-parent")
    await Promise.all([mkdir(targetParent), mkdir(attackerParent)])
    await writeFile(path.join(attackerParent, "keep.txt"), "preserve\n")
    const id = "parent-swap-target"
    const targetRoot = path.join(targetParent, id)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    const permissionProbe = path.join(container, "symlink-permission-probe")
    await createSymlinkOrSkip(context, attackerParent, permissionProbe, "dir")
    await unlink(permissionProbe)

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await writeFile(path.join(stagedOptions.root, "staged.txt"), "bound staging\n")
        await rename(targetParent, displacedParent)
        await createSymlinkOrSkip(context, attackerParent, targetParent, "dir")
        return createProjectConfig(stagedOptions)
      })
    ).rejects.toThrow(/staging cleanup also failed/)

    expect(await readFile(path.join(attackerParent, "keep.txt"), "utf8")).toBe("preserve\n")
    expect(await readdir(attackerParent)).toEqual(["keep.txt"])
    await expect(lstat(path.join(attackerParent, id))).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      (await readdir(displacedParent)).some((entry) => entry.includes(".harness-stage-"))
    ).toBe(true)
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/Initialization lease could not be removed safely/)
    )
  })

  /** 验证原本缺席的目标若在提交前出现则保留并阻断发布。 */
  test("preserves an absent target that appears before commit", async () => {
    const sourceRoot = await temporaryDirectory("harness-appeared-target-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-appeared-target-parent-")
    const id = "appeared-target"
    const targetRoot = path.join(targetParent, id)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    let appearedInode: number | undefined

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await mkdir(targetRoot)
        appearedInode = (await lstat(targetRoot)).ino
        return createProjectConfig(stagedOptions)
      })
    ).rejects.toThrow(/Target appeared while project initialization was running/)

    expect((await lstat(targetRoot)).ino).toBe(appearedInode)
    expect(await readdir(targetRoot)).toEqual([])
    expect((await readdir(targetParent)).filter((entry) => entry.includes(".harness-"))).toEqual([])
  })

  /** 验证同路径的新空目录不能伪装成初始化开始时冻结的目标。 */
  test("rejects an empty target replacement without deleting it", async () => {
    const sourceRoot = await temporaryDirectory("harness-target-replacement-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-target-replacement-parent-")
    const id = "replaced-empty-target"
    const targetRoot = path.join(targetParent, id)
    const displacedOriginalRoot = path.join(targetParent, "original-target-preserved")
    await mkdir(targetRoot)
    await chmod(targetRoot, 0o751)
    const originalTargetStat = await lstat(targetRoot)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    let replacementDevice: number | undefined
    let replacementInode: number | undefined
    let replacementMode: number | undefined

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await rename(targetRoot, displacedOriginalRoot)
        await mkdir(targetRoot)
        await chmod(targetRoot, originalTargetStat.mode & 0o7777)
        const replacementTargetStat = await lstat(targetRoot)
        replacementDevice = replacementTargetStat.dev
        replacementInode = replacementTargetStat.ino
        replacementMode = replacementTargetStat.mode
        return createProjectConfig(stagedOptions)
      })
    ).rejects.toThrow(/Target changed while project initialization was running/)

    const preservedReplacementStat = await lstat(targetRoot)
    expect(replacementDevice).toBeDefined()
    expect(replacementInode).toBeDefined()
    expect(replacementMode).toBeDefined()
    expect(preservedReplacementStat.dev).toBe(replacementDevice)
    expect(preservedReplacementStat.ino).toBe(replacementInode)
    expect(preservedReplacementStat.mode).toBe(replacementMode)
    expect(preservedReplacementStat.ino).not.toBe(originalTargetStat.ino)
    expect((await lstat(displacedOriginalRoot)).ino).toBe(originalTargetStat.ino)
    expect(
      (await readdir(targetParent)).filter(
        (entry) =>
          entry.startsWith("." + id + ".harness-stage-") ||
          entry.startsWith("." + id + ".harness-target-")
      )
    ).toEqual([])
  })

  /** 验证 staging 消失时拒绝发布并保留原空目录，POSIX 额外核对身份。 */
  test("preserves the frozen empty-target identity when staging disappears", async () => {
    const sourceRoot = await temporaryDirectory("harness-target-rollback-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-target-rollback-parent-")
    const id = "rollback-empty-target"
    const targetRoot = path.join(targetParent, id)
    await mkdir(targetRoot)
    if (process.platform !== "win32") await chmod(targetRoot, 0o711)
    const originalTargetStat = await lstat(targetRoot)
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await rm(stagedOptions.root, { recursive: true, force: true })
        return createProjectConfig(stagedOptions)
      })
    ).rejects.toThrow(/Staging directory changed while project initialization was running/)

    const restoredTargetStat = await lstat(targetRoot)
    expect(restoredTargetStat.isDirectory()).toBe(true)
    if (process.platform !== "win32") {
      expect(restoredTargetStat.dev).toBe(originalTargetStat.dev)
      expect(restoredTargetStat.ino).toBe(originalTargetStat.ino)
      expect(restoredTargetStat.mode).toBe(originalTargetStat.mode)
    }
    expect(await readdir(targetRoot)).toEqual([])
    expect(
      (await readdir(targetParent)).filter(
        (entry) =>
          entry.startsWith("." + id + ".harness-stage-") ||
          entry.startsWith("." + id + ".harness-target-")
      )
    ).toEqual([])
  })

  /** 验证 Agent policy 非法时在创建目标或 staging 前失败关闭。 */
  test("rejects unresolved policy before the first target write", async () => {
    const sourceRoot = await temporaryDirectory("harness-policy-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-policy-target-")
    const targetRoot = path.join(targetParent, "invalid-policy")
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "invalid-policy")
    void ignoredRoot

    await expect(
      instantiateProject({
        sourceRoot,
        targetRoot,
        init: {
          ...init,
          agentPolicy: { ...init.agentPolicy, confirmedAt: "2026-02-30" }
        }
      })
    ).rejects.toThrow(/Invalid resolved Agent policy/)

    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(targetParent)).toEqual([])
  })
})
