import { execFile } from "node:child_process"
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, test, vi } from "vitest"
import { runCli } from "../.harness/tooling/cli.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import {
  DOWNSTREAM_ONLY_INITIALIZATION_ERROR,
  initializeProject
} from "../.harness/tooling/init.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import type { InitOptions } from "../.harness/tooling/types.ts"
import { validateProject } from "../.harness/tooling/validate.ts"

// 保存 temporaryRoots 变量供当前逻辑使用。
const temporaryRoots: string[] = []
// 保存 repositoryRoot 变量供当前逻辑使用。
const repositoryRoot = path.resolve(import.meta.dirname, "..")
// 保存 BASE_URLS 变量供当前逻辑使用。
const BASE_URLS = {
  developmentBaseUrl: "http://localhost:3000/api",
  testBaseUrl: "https://test-api.example.com/v1",
  releaseBaseUrl: "https://api.example.com/v1"
} as const
/** 保存原子初始化测试使用的已决 Agent policy。 */
const TEST_AGENT_POLICY = {
  confirmedBy: "test-owner",
  confirmedAt: "2026-09-09T00:00:00.000Z",
  superpowers: "disabled",
  parallelWorktreeSubagents: "enabled",
  milestoneSmoke: "enabled",
  milestoneE2e: "disabled"
} as const
/** 保存测试 Git 命令的无 Shell 异步入口。 */
const execFileAsync = promisify(execFile)

// 执行 temporaryDirectory 函数的处理逻辑。
async function temporaryDirectory(prefix: string): Promise<string> {
  // 保存 root 变量供当前逻辑使用。
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

// 执行 initOptions 函数的处理逻辑。
function initOptions(root: string, projectType: "web" | "extension", id: string): InitOptions {
  return {
    root,
    projectType,
    name: "Atomic Initialization",
    id,
    description: "Exercises failure-safe project initialization.",
    brandColor: "#4C6EF5",
    agentPolicy: TEST_AGENT_POLICY,
    ...BASE_URLS,
    skipInstall: true,
    skipGit: true
  }
}

// 执行 snapshotTree 函数的处理逻辑。
async function snapshotTree(root: string): Promise<Record<string, string>> {
  // 保存 snapshot 变量供当前逻辑使用。
  const snapshot: Record<string, string> = {}

  // 执行 visit 函数的处理逻辑。
  async function visit(directory: string, relativeDirectory = ""): Promise<void> {
    // 保存 entries 变量供当前逻辑使用。
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort(
      /* 执行 当前声明 函数的处理逻辑。 */ (left, right) => left.name.localeCompare(right.name)
    )
    // 保存 entry 变量供当前逻辑使用。
    for (const entry of entries) {
      // 保存 relativePath 变量供当前逻辑使用。
      const relativePath =
        relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`
      // 保存 absolutePath 变量供当前逻辑使用。
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        snapshot[relativePath] = "directory"
        await visit(absolutePath, relativePath)
      } else if (entry.isFile()) {
        snapshot[relativePath] = `file:${(await readFile(absolutePath)).toString("base64")}`
      } else {
        snapshot[relativePath] = "other"
      }
    }
  }

  await visit(root)
  return snapshot
}

/** 断言失败初始化没有发布目标或遗留 sibling staging。 */
async function expectNoPublishedTarget(parent: string, id: string): Promise<void> {
  await expect(lstat(path.join(parent, id))).rejects.toMatchObject({ code: "ENOENT" })
  expect(
    (await readdir(parent)).filter((entry) => entry.startsWith(`.${id}.harness-stage-`))
  ).toEqual([])
}

/** 在测试源根执行 Git 并返回标准输出。 */
async function git(root: string, args: string[]): Promise<string> {
  return (
    await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8"
    })
  ).stdout.trim()
}

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    vi.restoreAllMocks()
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)

describe("failure-safe initialization", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  /** 验证 blocks the public in-place command before parsing input or writing files 场景。 */
  test("blocks the public in-place command before parsing input or writing files", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await temporaryDirectory("harness-blocked-cli-init-")
    await writeFile(path.join(root, "user-file.txt"), "preserve this byte-for-byte\n")
    // 保存 before 变量供当前逻辑使用。
    const before = await snapshotTree(root)

    await expect(runCli(["init"], root)).rejects.toThrow(DOWNSTREAM_ONLY_INITIALIZATION_ERROR)

    expect(await snapshotTree(root)).toEqual(before)
  })

  /** 验证 blocks the internal initializer at the source root, child paths, and aliases 场景。 */
  test("blocks the internal initializer at the source root, child paths, and aliases", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(repositoryRoot, "package.json")
    // 保存 tsconfigPath 变量供当前逻辑使用。
    const tsconfigPath = path.join(repositoryRoot, "tsconfig.json")
    // 保存 beforeManifest 变量供当前逻辑使用。
    const beforeManifest = await readFile(manifestPath)
    // 保存 beforeTsconfig 变量供当前逻辑使用。
    const beforeTsconfig = await readFile(tsconfigPath)
    // 保存 aliasParent 变量供当前逻辑使用。
    const aliasParent = await temporaryDirectory("harness-source-alias-")
    // 保存 sourceAlias 变量供当前逻辑使用。
    const sourceAlias = path.join(aliasParent, "source-alias")
    await symlink(repositoryRoot, sourceAlias)

    // 保存 root 变量供当前逻辑使用。
    for (const root of [repositoryRoot, path.join(repositoryRoot, ".harness"), sourceAlias]) {
      await expect(initializeProject(initOptions(root, "web", "blocked-source"))).rejects.toThrow(
        DOWNSTREAM_ONLY_INITIALIZATION_ERROR
      )
    }

    expect(await readFile(manifestPath)).toEqual(beforeManifest)
    expect(await readFile(tsconfigPath)).toEqual(beforeTsconfig)
    await expect(lstat(path.join(repositoryRoot, ".harness/project.json"))).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  /** 验证 preflights missing downstream documentation before the first internal staged write 场景。 */
  test("preflights missing downstream documentation before the first internal staged write", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
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
    // 保存 before 变量供当前逻辑使用。
    const before = await snapshotTree(root)

    await expect(
      initializeProject(initOptions(root, "extension", "atomic-extension"))
    ).rejects.toThrow(/MANTINE_UI_GUIDELINES\.md/)

    expect(await snapshotTree(root)).toEqual(before)
  })

  /** 验证 removes only sibling staging data when copied initialization fails 场景。 */
  test("removes only sibling staging data when copied initialization fails", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await temporaryDirectory("harness-atomic-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/copied-marker.txt"), "copied before failure\n")
    // 保存 targetParent 变量供当前逻辑使用。
    const targetParent = await temporaryDirectory("harness-atomic-target-")
    // 保存 canonicalTargetParent 变量供当前逻辑使用。
    const canonicalTargetParent = await realpath(targetParent)

    // 保存 targetExisted 变量供当前逻辑使用。
    for (const targetExisted of [false, true]) {
      // 保存 id 变量供当前逻辑使用。
      const id = targetExisted ? "existing-empty-target" : "absent-target"
      // 保存 targetRoot 变量供当前逻辑使用。
      const targetRoot = path.join(targetParent, id)
      if (targetExisted) await mkdir(targetRoot)
      // 保存 { root: ignoredRoot, ...init } 变量供当前逻辑使用。
      const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
      void ignoredRoot

      await expect(
        instantiateProject(
          {
            sourceRoot,
            targetRoot,
            init
          },
          // 执行 当前声明 函数的处理逻辑。
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
        (await readdir(targetParent)).filter(
          /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.startsWith(`.${id}.harness-stage-`)
        )
      ).toEqual([])
    }
  })

  /** 验证已存在的空目标在成功发布后保留其冻结权限模式。 */
  test("publishes over the bound empty target with its frozen mode", async () => {
    const sourceRoot = await temporaryDirectory("harness-bound-target-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-bound-target-parent-")
    const id = "bound-empty-target"
    const targetRoot = path.join(targetParent, id)
    await mkdir(targetRoot)
    await chmod(targetRoot, 0o751)
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
    expect(publishedTargetStat.mode).toBe(originalTargetStat.mode)
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
  test("fails closed when the target parent identity changes", async () => {
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

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        await writeFile(path.join(stagedOptions.root, "staged.txt"), "bound staging\n")
        await rename(targetParent, displacedParent)
        await symlink(attackerParent, targetParent)
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

  /** 验证 staging 消失时拒绝发布并保留原空目录的同一身份。 */
  test("preserves the frozen empty-target identity when staging disappears", async () => {
    const sourceRoot = await temporaryDirectory("harness-target-rollback-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "source\n")
    const targetParent = await temporaryDirectory("harness-target-rollback-parent-")
    const id = "rollback-empty-target"
    const targetRoot = path.join(targetParent, id)
    await mkdir(targetRoot)
    await chmod(targetRoot, 0o711)
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
    expect(restoredTargetStat.dev).toBe(originalTargetStat.dev)
    expect(restoredTargetStat.ino).toBe(originalTargetStat.ino)
    expect(restoredTargetStat.mode).toBe(originalTargetStat.mode)
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

  /** 验证源文件在 staging 初始化期间漂移会阻断原子发布。 */
  test("blocks publication when the frozen source changes", async () => {
    const sourceRoot = await temporaryDirectory("harness-source-freeze-")
    await mkdir(path.join(sourceRoot, "docs"))
    const markerPath = path.join(sourceRoot, "docs/source-marker.txt")
    await writeFile(markerPath, "frozen\n")
    const versionPath = path.join(sourceRoot, "Version.md")
    await writeFile(versionPath, "202609090001 Candidate\n")
    const targetParent = await temporaryDirectory("harness-source-freeze-target-")
    const targetRoot = path.join(targetParent, "source-freeze")
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "source-freeze")
    void ignoredRoot

    await expect(
      instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
        expect(
          await readFile(path.join(stagedOptions.root, "docs/source-marker.txt"), "utf8")
        ).toBe("frozen\n")
        await writeFile(versionPath, "202609090002 Candidate\n")
        return createProjectConfig(stagedOptions)
      })
    ).rejects.toThrow(/source changed after its initialization snapshot was frozen/)

    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      (await readdir(targetParent)).filter((entry) =>
        entry.startsWith(".source-freeze.harness-stage-")
      )
    ).toEqual([])
  })

  /** 验证纳入复制的源文件新增、删除、内容或模式漂移均阻断发布。 */
  test("blocks every included source file drift and leaves no publication residue", async () => {
    const mutations = [
      {
        name: "content",
        run: async (sourceRoot: string, markerPath: string) => {
          void sourceRoot
          await writeFile(markerPath, "changed\\n")
        }
      },
      {
        name: "mode",
        run: async (sourceRoot: string, markerPath: string) => {
          void sourceRoot
          await chmod(markerPath, 0o755)
        }
      },
      {
        name: "addition",
        run: async (sourceRoot: string) => {
          await writeFile(path.join(sourceRoot, "docs/added-after-freeze.txt"), "added\\n")
        }
      },
      {
        name: "deletion",
        run: async (sourceRoot: string, markerPath: string) => {
          void sourceRoot
          await unlink(markerPath)
        }
      }
    ]

    for (const mutation of mutations) {
      const sourceRoot = await temporaryDirectory(`harness-source-${mutation.name}-`)
      await mkdir(path.join(sourceRoot, "docs"))
      const markerPath = path.join(sourceRoot, "docs/source-marker.txt")
      await writeFile(markerPath, "frozen\\n")
      const targetParent = await temporaryDirectory(`harness-target-${mutation.name}-`)
      const id = `${mutation.name}-drift`
      const targetRoot = path.join(targetParent, id)
      const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
      void ignoredRoot

      await expect(
        instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
          await mutation.run(sourceRoot, markerPath)
          return createProjectConfig(stagedOptions)
        })
      ).rejects.toThrow(/source changed after its initialization snapshot was frozen/)

      await expectNoPublishedTarget(targetParent, id)
    }
  })

  /** 验证冻结后的 Git HEAD 与完整工作区状态漂移分别阻断发布。 */
  test("blocks Git HEAD and status drift and leaves no publication residue", async () => {
    for (const drift of ["head", "status"] as const) {
      const sourceRoot = await temporaryDirectory(`harness-git-${drift}-`)
      await mkdir(path.join(sourceRoot, "docs/work_plan"), { recursive: true })
      await writeFile(path.join(sourceRoot, "docs/source-marker.txt"), "frozen\\n")
      const gitOnlyPath = path.join(sourceRoot, "docs/work_plan/source-state.md")
      await writeFile(gitOnlyPath, "excluded from downstream copy\\n")
      await writeFile(path.join(sourceRoot, "Version.md"), "202609090001 Candidate\\n")
      await git(sourceRoot, ["init", "-b", "main"])
      await git(sourceRoot, ["add", "."])
      await git(sourceRoot, [
        "-c",
        "user.name=Harness Test",
        "-c",
        "user.email=harness-test@example.invalid",
        "commit",
        "-m",
        "seed source"
      ])

      const targetParent = await temporaryDirectory(`harness-git-target-${drift}-`)
      const id = `git-${drift}-drift`
      const targetRoot = path.join(targetParent, id)
      const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
      void ignoredRoot

      await expect(
        instantiateProject({ sourceRoot, targetRoot, init }, async (stagedOptions) => {
          await writeFile(gitOnlyPath, `${drift} changed\\n`)
          if (drift === "head") {
            await git(sourceRoot, ["add", "docs/work_plan/source-state.md"])
            await git(sourceRoot, [
              "-c",
              "user.name=Harness Test",
              "-c",
              "user.email=harness-test@example.invalid",
              "commit",
              "-m",
              "move source head"
            ])
          }
          return createProjectConfig(stagedOptions)
        })
      ).rejects.toThrow(/source changed after its initialization snapshot was frozen/)

      await expectNoPublishedTarget(targetParent, id)
    }
  })

  /** 验证实例化源根的符号链接别名在首个目标写入前被拒绝。 */
  test("rejects a symbolic-link instantiation source", async () => {
    const sourceRoot = await temporaryDirectory("harness-source-real-")
    const aliasParent = await temporaryDirectory("harness-source-alias-parent-")
    const sourceAlias = path.join(aliasParent, "source")
    await symlink(sourceRoot, sourceAlias)
    const targetParent = await temporaryDirectory("harness-source-alias-target-")
    const targetRoot = path.join(targetParent, "source-alias")
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "source-alias")
    void ignoredRoot

    await expect(instantiateProject({ sourceRoot: sourceAlias, targetRoot, init })).rejects.toThrow(
      /Instantiation source must be a real directory/
    )

    expect(await readdir(targetParent)).toEqual([])
  })

  /** 验证 leaves the target untouched when the staged Chinese comment gate fails 场景。 */
  test("leaves the target untouched when the staged Chinese comment gate fails", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetParent 变量供当前逻辑使用。
    const targetParent = await temporaryDirectory("harness-comment-gate-target-")
    // 保存 id 变量供当前逻辑使用。
    const id = "comment-gate-target"
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(targetParent, id)
    // 保存 { root: ignoredRoot, ...init } 变量供当前逻辑使用。
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot

    await expect(
      instantiateProject(
        { sourceRoot: repositoryRoot, targetRoot, init },
        /* 执行 当前声明 函数的处理逻辑。 */ async (stagedOptions) => {
          // 保存 config 变量供当前逻辑使用。
          const config = await initializeProject(stagedOptions)
          await writeFile(
            path.join(stagedOptions.root, "src/comment-gate-failure.ts"),
            "export function missing(): number { return 1 }\n"
          )
          await validateProject(stagedOptions.root)
          return config
        }
      )
    ).rejects.toThrow(/声明必须具有紧邻且包含汉字的业务注释/)

    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      (await readdir(targetParent)).filter(
        /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.startsWith(`.${id}.harness-stage-`)
      )
    ).toEqual([])
  })

  /** 验证 rejects a downstream target inside the source before creating target or staging data 场景。 */
  test("rejects a downstream target inside the source before creating target or staging data", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await temporaryDirectory("harness-nested-target-source-")
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(sourceRoot, "nested-project")
    // 保存 { root: ignoredRoot, ...init } 变量供当前逻辑使用。
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "nested-project")
    void ignoredRoot

    await expect(instantiateProject({ sourceRoot, targetRoot, init })).rejects.toThrow(
      /Target must be outside the Harness template directory/
    )

    expect(await readdir(sourceRoot)).toEqual([])
    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
  })

  /** 验证 copies only maintained top-level seeds into staging and the committed target 场景。 */
  test("copies only maintained top-level seeds into staging and the committed target", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await temporaryDirectory("harness-seed-source-")
    await mkdir(path.join(sourceRoot, "docs/work_plan"), { recursive: true })
    await writeFile(path.join(sourceRoot, "docs/seed-marker.md"), "maintained seed\n")
    await writeFile(
      path.join(sourceRoot, "docs/work_plan/20260810_work_plan.md"),
      "excluded plan\n"
    )
    await writeFile(path.join(sourceRoot, "Version.md"), "excluded version\n")
    await writeFile(path.join(sourceRoot, "unknown-top-level.txt"), "excluded file\n")
    await mkdir(path.join(sourceRoot, "unknown-top-level-directory"))
    await writeFile(
      path.join(sourceRoot, "unknown-top-level-directory/marker.txt"),
      "excluded directory\n"
    )
    // 保存 directory 变量供当前逻辑使用。
    for (const directory of [".git", ".plasmo", "build", "coverage", "dist", "node_modules"]) {
      await mkdir(path.join(sourceRoot, directory))
      await writeFile(path.join(sourceRoot, directory, "marker.txt"), "excluded artifact\n")
    }

    // 保存 targetParent 变量供当前逻辑使用。
    const targetParent = await temporaryDirectory("harness-seed-target-")
    // 保存 id 变量供当前逻辑使用。
    const id = "allowlisted-seeds"
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(targetParent, id)
    // 保存 { root: ignoredRoot, ...init } 变量供当前逻辑使用。
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot
    // 保存 excludedPaths 变量供当前逻辑使用。
    const excludedPaths = [
      ".git",
      ".plasmo",
      "Version.md",
      "build",
      "coverage",
      "dist",
      "docs/work_plan",
      "node_modules",
      "unknown-top-level-directory",
      "unknown-top-level.txt"
    ]

    await expect(
      instantiateProject(
        { sourceRoot, targetRoot, init },
        /* 执行 当前声明 函数的处理逻辑。 */ async (stagedOptions) => {
          expect(await readFile(path.join(stagedOptions.root, "docs/seed-marker.md"), "utf8")).toBe(
            "maintained seed\n"
          )
          // 保存 relativePath 变量供当前逻辑使用。
          for (const relativePath of excludedPaths) {
            await expect(lstat(path.join(stagedOptions.root, relativePath))).rejects.toMatchObject({
              code: "ENOENT"
            })
          }
          return createProjectConfig(stagedOptions)
        }
      )
    ).resolves.toMatchObject({ id, projectType: "web" })

    expect(await readFile(path.join(targetRoot, "docs/seed-marker.md"), "utf8")).toBe(
      "maintained seed\n"
    )
    // 保存 relativePath 变量供当前逻辑使用。
    for (const relativePath of excludedPaths) {
      await expect(lstat(path.join(targetRoot, relativePath))).rejects.toMatchObject({
        code: "ENOENT"
      })
    }
  })

  /** 验证 rejects symbolic links inside an allowlisted seed 场景。 */
  test("rejects symbolic links inside an allowlisted seed", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await temporaryDirectory("harness-seed-symlink-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "symlink-target.md"), "not copied directly\n")
    await symlink(path.join(sourceRoot, "symlink-target.md"), path.join(sourceRoot, "docs/link.md"))
    // 保存 targetParent 变量供当前逻辑使用。
    const targetParent = await temporaryDirectory("harness-seed-symlink-target-")
    // 保存 id 变量供当前逻辑使用。
    const id = "symlink-seed-target"
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(targetParent, id)
    // 保存 { root: ignoredRoot, ...init } 变量供当前逻辑使用。
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", id)
    void ignoredRoot

    await expect(instantiateProject({ sourceRoot, targetRoot, init })).rejects.toThrow(
      /unsupported symbolic link: docs\/link\.md/
    )
    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      (await readdir(targetParent)).filter(
        /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.startsWith(`.${id}.harness-stage-`)
      )
    ).toEqual([])
  })
})
