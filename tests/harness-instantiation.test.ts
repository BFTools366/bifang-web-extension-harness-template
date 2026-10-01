import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { validateHarness } from "../scripts/validate-harness.ts"
import { REQUIRED_FILES } from "../scripts/harness-validation/contracts.ts"
import {
  TEST_BASE_URLS,
  TEST_AGENT_POLICY,
  downstreamGovernanceFiles,
  expect,
  initializeProject,
  instantiateProject,
  mkdir,
  options,
  path,
  readFile,
  readdir,
  repositoryRoot,
  rm,
  seedTemplateRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"
import type { ProjectConfig } from "./harness-tooling-support.ts"
import { createSymlinkOrSkip } from "./setup.ts"
import {
  LIST_VIEW_REQUIRED_FILES,
  copyRepositoryForValidation
} from "./harness-instantiation-fixture.ts"

/** 验证 minimal public instantiation inputs 的完整回归场景。 */
describe("minimal public instantiation inputs", () => {
  /** 验证公开入口仅凭五项基础信息即可生成两种宿主，未提供地址保持空值。 */
  test.each(["web", "extension"] as const)(
    "creates %s with only required public inputs",
    async (projectType) => {
      const parent = await temporaryDirectory("harness-minimal-public-")
      const id = `minimal-${projectType}`
      const targetRoot = path.join(parent, id)
      const config = await runInstantiateCli(
        [
          targetRoot,
          "--type",
          projectType,
          "--name",
          "Minimal Project",
          "--id",
          id,
          "--policy-mode",
          "预设",
          ...(projectType === "extension" ? ["--description", "Minimal Project"] : [])
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: false,
          output: () => undefined,
          instantiate: (supplied) =>
            instantiateProject({
              ...supplied,
              init: { ...supplied.init, skipInstall: true, skipGit: true }
            })
        }
      )
      expect(config.description).toBe("Minimal Project")
      const prefix = projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
      for (const filename of [".env.development", ".env.test", ".env.production"]) {
        expect(await readFile(path.join(targetRoot, filename), "utf8")).toContain(
          `${prefix}API_BASE_URL=\n`
        )
      }
      expect(await readFile(path.join(targetRoot, "docs/AGENT_POLICY.md"), "utf8")).toContain(
        "confirmed_by: 当前用户"
      )
      expect(await readdir(targetRoot)).not.toContain("dist")
      expect(await readdir(targetRoot)).not.toContain("build")
      const terminalPolicy = await readFile(
        path.join(targetRoot, ".harness/tooling/agent-policy.ts"),
        "utf8"
      )
      expect(terminalPolicy).not.toContain("AgentPolicyMode")
      expect(terminalPolicy).not.toContain("parsePolicyMode")
      expect(terminalPolicy).toContain("validateAgentPolicyDocument")
    }
  )

  /** 验证暂存提交模板异常在原子发布前失败，保留缺席或空目标。 */
  test.each([false, true])(
    "rejects a changed staged template with empty target %s",
    async (exists) => {
      const parent = await temporaryDirectory("harness-template-binding-")
      const targetRoot = path.join(parent, "template-binding")
      if (exists) await mkdir(targetRoot)
      const { root: ignoredRoot, ...init } = options(targetRoot, "web")
      void ignoredRoot
      await expect(
        instantiateProject(
          {
            sourceRoot: repositoryRoot,
            targetRoot,
            init: { ...init, id: "template-binding", skipGit: false }
          },
          async (stagedOptions, logo) => {
            const config = await initializeProject(stagedOptions, logo)
            execFileSync(
              "git",
              ["config", "--local", "commit.template", "unexpected-template.txt"],
              {
                cwd: stagedOptions.root
              }
            )
            return config
          }
        )
      ).rejects.toThrow(/Local Git config commit.template/)
      if (exists) expect(await readdir(targetRoot)).toEqual([])
      else await expect(readdir(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
      expect(
        (await readdir(parent)).filter((entry) => entry.startsWith(".template-binding."))
      ).toEqual([])
    }
  )
})

/** 验证 safe template instantiation 的完整回归场景。 */
describe("safe template instantiation", () => {
  /** 验证 keeps the Extension package inspection as a hard candidate gate 场景。 */
  test("keeps the Extension package inspection as a hard candidate gate", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 config 变量供当前逻辑使用。
    const config: ProjectConfig = {
      schemaVersion: 1,
      projectType: "extension",
      name: "Terminal Extension",
      id: "terminal-extension",
      description: "A terminal Chrome extension.",
      brand: {
        primaryColor: "#4C6EF5",
        logoSource: "generated",
        masterLogo: ".harness/brand/logo-1024.png"
      },
      initializedAt: "2026-08-12T00:00:00.000Z"
    }
    // 保存 files 变量供当前逻辑使用。
    const files = downstreamGovernanceFiles(
      config,
      await readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8"),
      await readFile(path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"), "utf8")
    )
    // 保存 release 变量供当前逻辑使用。
    const release = files.get("docs/RELEASE.md")

    expect(release).toContain("`pnpm package`")
    expect(release).toContain("自动执行 `pnpm harness validate` 与 `pnpm release:inspect`")
    expect(release).toContain("当次 E2E 选择 `enabled`")
  })

  /** 验证源 Harness 必需清单覆盖列表页 Skill 的两份资产与三份参考资料。 */
  test("requires every list-view skill asset and reference", async () => {
    expect(REQUIRED_FILES).toEqual(expect.arrayContaining([...LIST_VIEW_REQUIRED_FILES]))
    for (const relativePath of LIST_VIEW_REQUIRED_FILES) {
      await expect(readFile(path.join(repositoryRoot, relativePath), "utf8")).resolves.not.toBe("")
    }

    const missingRoot = await copyRepositoryForValidation()
    const missingAsset = LIST_VIEW_REQUIRED_FILES[0]
    await rm(path.join(missingRoot, missingAsset))
    await expect(validateHarness(missingRoot)).rejects.toThrow(
      /web-implement-list-view\/assets\/ListPage\.contracts\.test\.ts/
    )
  })

  /** 验证 Web-only 路由恢复与状态权威语义受正文契约保护。 */
  test("rejects drift in the list-view workflow semantics", async () => {
    const root = await copyRepositoryForValidation()
    const skillPath = path.join(root, ".agents/skills/web-implement-list-view/SKILL.md")
    const skill = await readFile(skillPath, "utf8")
    for (const required of [
      "projectType=web",
      "完全无 owned key",
      "不是双向状态同步",
      "assets/listPageState.ts"
    ]) {
      expect(skill).toContain(required)
    }
    await writeFile(skillPath, skill.replace("完全无 owned key", "没有列表参数"))
    await expect(validateHarness(root)).rejects.toThrow(
      /web-implement-list-view\/SKILL\.md is missing required workflow/
    )
  })

  /** 验证纯 TypeScript 列表状态资产的可执行契约不能随实现漂移。 */
  test("rejects drift in the executable list-state contract", async () => {
    const root = await copyRepositoryForValidation()
    const stateAssetPath = path.join(
      root,
      ".agents/skills/web-implement-list-view/assets/listPageState.ts"
    )
    const stateAsset = await readFile(stateAssetPath, "utf8")
    expect(stateAsset).toContain("[10, 20, 50, 100]")
    await writeFile(stateAssetPath, stateAsset.replace("[10, 20, 50, 100]", "[10, 20, 50]"))
    await expect(validateHarness(root)).rejects.toThrow()
  })

  /** 验证 preflights environment failures before creating the target 场景。 */
  test("preflights environment failures before creating the target", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await seedTemplateRoot()
    // 保存 parent 变量供当前逻辑使用。
    const parent = await temporaryDirectory("web-harness-preflight-")
    // 保存 invalidTarget 变量供当前逻辑使用。
    const invalidTarget = path.join(parent, "invalid-environment")
    // 保存 { root: invalidRoot, ...invalidInit } 变量供当前逻辑使用。
    const { root: invalidRoot, ...invalidInit } = options(invalidTarget, "web")
    void invalidRoot
    await expect(
      instantiateProject({
        sourceRoot,
        targetRoot: invalidTarget,
        init: {
          ...invalidInit,
          id: "invalid-environment",
          releaseBaseUrl: "http://unsafe.example.com"
        }
      })
    ).rejects.toThrow(/Release API_BASE_URL must use https/)
    await expect(readdir(invalidTarget)).rejects.toThrow()

    await writeFile(path.join(sourceRoot, ".env.local"), "VITE_API_TOKEN=do-not-ship\n")
    // 保存 hiddenTarget 变量供当前逻辑使用。
    const hiddenTarget = path.join(parent, "hidden-environment")
    // 保存 { root: hiddenRoot, ...hiddenInit } 变量供当前逻辑使用。
    const { root: hiddenRoot, ...hiddenInit } = options(hiddenTarget, "web")
    void hiddenRoot
    await expect(
      instantiateProject({
        sourceRoot,
        targetRoot: hiddenTarget,
        init: {
          ...hiddenInit,
          id: "hidden-environment"
        }
      })
    ).rejects.toThrow(/generated or forbidden environment \.env\.local/)
    await expect(readdir(hiddenTarget)).rejects.toThrow()
  })

  /** 验证 keeps the target atomic when install or Git initialization fails 场景。 */
  test("keeps the target atomic when install or Git initialization fails", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 failedCommand 变量供两类后置命令失败回归使用。
    for (const failedCommand of ["pnpm", "git"] as const) {
      // 保存 parent 变量供失败原子性测试使用。
      const parent = await temporaryDirectory(`web-harness-${failedCommand}-failure-`)
      // 保存 id 变量供目标和 staging 命名使用。
      const id = `${failedCommand}-failure`
      // 保存 targetRoot 变量供目标零发布断言使用。
      const targetRoot = path.join(parent, id)
      // 保存 { root: ignoredRoot, ...init } 变量构造真实模板初始化输入。
      const { root: ignoredRoot, ...init } = options(targetRoot, "web")
      void ignoredRoot
      await expect(
        instantiateProject(
          {
            sourceRoot: repositoryRoot,
            targetRoot,
            init: {
              ...init,
              id,
              skipInstall: false,
              skipGit: false
            }
          },
          // 执行 当前声明 函数的处理逻辑。
          (initOptions, preparedLogo) =>
            initializeProject(
              initOptions,
              preparedLogo,
              // 执行 当前声明 函数的处理逻辑。
              async (command) => {
                if (command === failedCommand) throw new Error(`${command} failed`)
              }
            )
        )
      ).rejects.toThrow(`${failedCommand} failed`)
      await expect(readdir(targetRoot)).rejects.toThrow()
      expect(
        (await readdir(parent)).filter(
          // 执行 当前声明 函数的处理逻辑。
          (entry) => entry.startsWith(`.${id}.harness-stage-`)
        )
      ).toEqual([])
    }
  })

  /** 验证 rejects a non-empty target 场景。 */
  test("rejects a non-empty target", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 parent 变量供当前逻辑使用。
    const parent = await temporaryDirectory("web-harness-target-")
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(parent, "aurora-notes")
    await mkdir(targetRoot)
    await writeFile(path.join(targetRoot, "keep.txt"), "user data")
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot,
        init: {
          projectType: "web",
          name: "Aurora Notes",
          id: "aurora-notes",
          description: "A focused notes workspace.",
          brandColor: "#5B5BD6",
          agentPolicy: TEST_AGENT_POLICY,
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/must be empty/)
    expect(await readFile(path.join(targetRoot, "keep.txt"), "utf8")).toBe("user data")
  })

  /** 验证目标目录名必须与项目 id 一致。 */
  test("requires target basename to match id", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 parent 变量供当前逻辑使用。
    const parent = await temporaryDirectory("web-harness-path-")
    // 保存 wrongTarget 变量供当前逻辑使用。
    const wrongTarget = path.join(parent, "wrong-name")
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot: wrongTarget,
        init: {
          projectType: "web",
          name: "Right Name",
          id: "right-name",
          description: "A safe project",
          brandColor: "#4C6EF5",
          agentPolicy: TEST_AGENT_POLICY,
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/must exactly match project id/)
  })

  /** 验证符号链接目标不会被当作可写项目目录。 */
  test("rejects symlink targets", async (context) => {
    const parent = await temporaryDirectory("web-harness-path-link-")
    // 保存 realTarget 变量供当前逻辑使用。
    const realTarget = path.join(parent, "real-target")
    // 保存 linkTarget 变量供当前逻辑使用。
    const linkTarget = path.join(parent, "linked-project")
    await mkdir(realTarget)
    await createSymlinkOrSkip(context, realTarget, linkTarget, "dir")
    await expect(
      instantiateProject({
        sourceRoot: repositoryRoot,
        targetRoot: linkTarget,
        init: {
          projectType: "web",
          name: "Linked Project",
          id: "linked-project",
          description: "Must be rejected",
          brandColor: "#4C6EF5",
          agentPolicy: TEST_AGENT_POLICY,
          ...TEST_BASE_URLS,
          skipInstall: true,
          skipGit: true
        }
      })
    ).rejects.toThrow(/symbolic link/)
  })
})
