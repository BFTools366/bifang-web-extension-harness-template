import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile
} from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { runCli } from "../.harness/tooling/cli.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import {
  DOWNSTREAM_ONLY_INITIALIZATION_ERROR,
  initializeProject
} from "../.harness/tooling/init.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { initializeWorkspace } from "../.harness/tooling/workspace.ts"
import { validateProject } from "../.harness/tooling/validate.ts"
import { createSymlinkOrSkip } from "./setup.ts"
import {
  repositoryRoot,
  temporaryDirectory,
  initOptions,
  snapshotTree,
  expectNoPublishedTarget,
  git
} from "./initialization-atomicity-fixture.ts"

/** 验证 initialization source isolation and snapshot protection 的完整回归场景。 */
describe("initialization source isolation and snapshot protection", () => {
  /** 模板位于其他仓库子目录时仍按源文件快照创建，不强制其自身为 Git 顶层。 */
  test("accepts a source directory inside an unrelated Git repository", async () => {
    const enclosing = await temporaryDirectory("harness-enclosing-git-")
    await git(enclosing, ["init", "-b", "main"])
    const sourceRoot = path.join(enclosing, "template")
    await mkdir(path.join(sourceRoot, "docs"), { recursive: true })
    await writeFile(path.join(sourceRoot, "docs/example.md"), "# Template source\n")
    const parent = await temporaryDirectory("harness-nested-source-target-")
    const targetRoot = path.join(parent, "nested-source")
    const { root: ignoredRoot, ...init } = initOptions(targetRoot, "web", "nested-source")
    void ignoredRoot
    await instantiateProject({ sourceRoot, targetRoot, init }, async (options) =>
      createProjectConfig(options)
    )
    expect(await readFile(path.join(targetRoot, "docs/example.md"), "utf8")).toBe(
      "# Template source\n"
    )
    expect(await readdir(targetRoot)).not.toContain(".git")
  })

  /** 内部单包及 Workspace 初始化不能借模板内链接把下游移到外部生成。 */
  test("blocks source-local links to outside roots in both initializers", async (context) => {
    const fixture = await mkdtemp(path.join(repositoryRoot, "..harness-link-boundary-"))
    const external = await temporaryDirectory("harness-outside-linked-root-")
    const link = path.join(fixture, "downstream")
    try {
      await createSymlinkOrSkip(context, external, link, "dir")
      for (const initialize of [initializeProject, initializeWorkspace]) {
        await expect(initialize(initOptions(link, "web", "blocked-source"))).rejects.toThrow(
          DOWNSTREAM_ONLY_INITIALIZATION_ERROR
        )
      }
      expect(await readdir(external)).toEqual([])
      expect(await readdir(fixture)).toEqual(["downstream"])
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })

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

  /** 验证源根及其子路径不会被内部初始化器写入。 */
  test("blocks the internal initializer at the source root and child paths", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(repositoryRoot, "package.json")
    // 保存 tsconfigPath 变量供当前逻辑使用。
    const tsconfigPath = path.join(repositoryRoot, "tsconfig.json")
    // 保存 beforeManifest 变量供当前逻辑使用。
    const beforeManifest = await readFile(manifestPath)
    // 保存 beforeTsconfig 变量供当前逻辑使用。
    const beforeTsconfig = await readFile(tsconfigPath)
    // 保存 root 变量供当前逻辑使用。
    for (const root of [repositoryRoot, path.join(repositoryRoot, ".harness")]) {
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

  /** 验证内部初始化器不会把源内双点前缀目录误认为父目录跳转。 */
  test("blocks initialization in an ordinary dot-prefixed source directory", async () => {
    const root = await mkdtemp(path.join(repositoryRoot, "..harness-boundary-"))
    try {
      await expect(initializeProject(initOptions(root, "web", "blocked-source"))).rejects.toThrow(
        DOWNSTREAM_ONLY_INITIALIZATION_ERROR
      )
      expect(await readdir(root)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  /** 验证源根的符号链接别名也无法绕过内部初始化门禁。 */
  test("blocks the internal initializer through a source alias", async (context) => {
    const aliasParent = await temporaryDirectory("harness-source-alias-")
    const sourceAlias = path.join(aliasParent, "source-alias")
    await createSymlinkOrSkip(context, repositoryRoot, sourceAlias, "dir")
    await expect(
      initializeProject(initOptions(sourceAlias, "web", "blocked-source"))
    ).rejects.toThrow(DOWNSTREAM_ONLY_INITIALIZATION_ERROR)
    await expect(lstat(path.join(repositoryRoot, ".harness/project.json"))).rejects.toMatchObject({
      code: "ENOENT"
    })
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
      ...(process.platform === "win32"
        ? []
        : [
            {
              name: "mode",
              run: async (sourceRoot: string, markerPath: string) => {
                void sourceRoot
                await chmod(markerPath, 0o755)
              }
            }
          ]),
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
  test("rejects a symbolic-link instantiation source", async (context) => {
    const sourceRoot = await temporaryDirectory("harness-source-real-")
    const aliasParent = await temporaryDirectory("harness-source-alias-parent-")
    const sourceAlias = path.join(aliasParent, "source")
    await createSymlinkOrSkip(context, sourceRoot, sourceAlias, "dir")
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
    await mkdir(path.join(sourceRoot, "docs/requirements"))
    await writeFile(path.join(sourceRoot, "docs/requirements/source.txt"), "old input\n")
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
      "docs/requirements",
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
  test("rejects symbolic links inside an allowlisted seed", /* 执行 当前声明 函数的处理逻辑。 */ async (context) => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await temporaryDirectory("harness-seed-symlink-source-")
    await mkdir(path.join(sourceRoot, "docs"))
    await writeFile(path.join(sourceRoot, "symlink-target.md"), "not copied directly\n")
    await createSymlinkOrSkip(
      context,
      path.join(sourceRoot, "symlink-target.md"),
      path.join(sourceRoot, "docs/link.md"),
      "file"
    )
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
