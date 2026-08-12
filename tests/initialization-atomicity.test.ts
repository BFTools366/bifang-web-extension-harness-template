import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
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

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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
  test("blocks the public in-place command before parsing input or writing files", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await temporaryDirectory("harness-blocked-cli-init-")
    await writeFile(path.join(root, "user-file.txt"), "preserve this byte-for-byte\n")
    // 保存 before 变量供当前逻辑使用。
    const before = await snapshotTree(root)

    await expect(runCli(["init"], root)).rejects.toThrow(DOWNSTREAM_ONLY_INITIALIZATION_ERROR)

    expect(await snapshotTree(root)).toEqual(before)
  })

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
    // 保存 before 变量供当前逻辑使用。
    const before = await snapshotTree(root)

    await expect(
      initializeProject(initOptions(root, "extension", "atomic-extension"))
    ).rejects.toThrow(/MANTINE_UI_GUIDELINES\.md/)

    expect(await snapshotTree(root)).toEqual(before)
  })

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
            "const missing = 1\n"
          )
          await validateProject(stagedOptions.root)
          return config
        }
      )
    ).rejects.toThrow(/变量声明必须有紧邻中文注释/)

    await expect(lstat(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      (await readdir(targetParent)).filter(
        /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.startsWith(`.${id}.harness-stage-`)
      )
    ).toEqual([])
  })

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
