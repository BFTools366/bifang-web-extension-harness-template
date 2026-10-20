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
  /** 验证公开入口凭基础信息与宿主条件选择生成项目，未提供地址保持空值。 */
  test.each(["web", "extension"] as const)(
    "creates %s engineering foundations with only required public inputs",
    async (projectType) => {
      const parent = await temporaryDirectory("harness-minimal-public-")
      const id = `minimal-${projectType}`
      const targetRoot = path.join(parent, id)
      const config = await runInstantiateCli(
        [
          parent,
          "--server",
          "create",
          "--type",
          projectType,
          "--name",
          "示例项目",
          "--english-name",
          `Minimal ${projectType}`,
          "--policy-mode",
          "预设",
          ...(projectType === "extension" ? ["--description", "示例项目"] : [])
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
      expect(config).toMatchObject({ name: "示例项目", id, description: "示例项目" })
      expect(config).not.toHaveProperty("englishName")
      const apiContract = await readFile(path.join(repositoryRoot, "docs/API.md"), "utf8")
      expect(await readFile(path.join(targetRoot, "docs/API.md"), "utf8")).toBe(apiContract)
      await expect(
        readFile(path.join(targetRoot, "tests/web-routing-policy.test.ts"), "utf8")
      ).rejects.toThrow()
      expect(await readFile(path.join(targetRoot, "docs/README.md"), "utf8")).toContain("(API.md)")
      expect(await readFile(path.join(targetRoot, "AGENTS.md"), "utf8")).toContain("docs/API.md")
      // 两宿主按拥有者分发需求、PRD 与能力合同，旧原型目录不保留第二份需求规则。
      for (const reference of [
        ".agents/skills/web-define-product/references/prd-outline.md",
        ".agents/skills/web-define-product/references/requirements-analysis.md",
        ".agents/skills/web-compose-capabilities/references/requirements-selection.md"
      ]) {
        expect(await readFile(path.join(targetRoot, reference), "utf8")).toBe(
          await readFile(path.join(repositoryRoot, reference), "utf8")
        )
      }
      await expect(
        readFile(
          path.join(targetRoot, ".agents/skills/web-design-prototype/references/prd-outline.md"),
          "utf8"
        )
      ).rejects.toThrow()
      expect(config).not.toHaveProperty("webType")
      expect(config).not.toHaveProperty("saasCommerce")
      const identity = JSON.parse(
        await readFile(path.join(targetRoot, ".harness/project.json"), "utf8")
      )
      expect(identity).not.toHaveProperty("webType")
      expect(identity).not.toHaveProperty("saasCommerce")
      const readme = await readFile(path.join(targetRoot, "README.md"), "utf8")
      expect(readme).toContain("功能组合")
      expect(readme).not.toContain("saas-commerce:")
      expect(
        await readFile(
          path.join(targetRoot, ".agents/skills/web-compose-capabilities/catalog.json"),
          "utf8"
        )
      ).toBe(
        await readFile(
          path.join(repositoryRoot, ".agents/skills/web-compose-capabilities/catalog.json"),
          "utf8"
        )
      )
      if (projectType === "web")
        expect((await readdir(path.join(targetRoot, "src/routes"))).sort()).toEqual([
          "__root.tsx",
          "index.tsx"
        ])
      for (const directory of ["product_spec", "prototypes"]) {
        await expect(readdir(path.join(targetRoot, "docs", directory))).rejects.toMatchObject({
          code: "ENOENT"
        })
      }
      for (const relativePath of ["README.md", "docs/README.md", "AGENTS.md"]) {
        const entryPath = path.join(targetRoot, relativePath)
        const entry = await readFile(entryPath, "utf8")
        expect(entry).not.toMatch(/SaaS.*(?:预留|暂未开放|待开放|不开放)/)
        expect(entry).toContain("$web-document-api")
        expect(entry).toContain("web-compose-capabilities")
        expect(entry).not.toContain("web-implement-saas-")
        for (const [, destination] of entry.matchAll(/\]\(([^)]+)\)/g)) {
          if (!destination || /^(?:https?:|#)/.test(destination)) continue
          const [linkedPath] = destination.split("#")
          if (!linkedPath) throw new Error(`Missing local link target in ${relativePath}`)
          await expect(
            readFile(path.resolve(path.dirname(entryPath), linkedPath), "utf8")
          ).resolves.not.toBe("")
        }
      }
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
  /** 验证两类宿主继承同一模块合同、支持跨平台换行，并拒绝缺失或空章节。 */
  test.each(["web", "extension"] as const)(
    "derives module structure from canonical engineering rules for %s",
    async (projectType) => {
      const config: ProjectConfig = {
        schemaVersion: 1,
        projectType,
        name: "Module Contract",
        id: "module-contract",
        description: "Module contract fixture.",
        brand: {
          primaryColor: "#4C6EF5",
          logoSource: "generated",
          masterLogo: ".harness/brand/logo-1024.png"
        },
        initializedAt: "2026-10-12T00:00:00.000Z"
      }
      const [dataAccess, uiGuidelines, engineeringRules] = await Promise.all([
        readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8"),
        readFile(path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"), "utf8"),
        readFile(path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"), "utf8")
      ])
      const start = "### 3.2 文件结构与模块依赖"
      const end = "### 3.3 源码可读性与类型化组合"
      const updatedRules = engineeringRules.replace(start, `${start}\n\n- 源章节增量传播标记。`)
      const expectedSection = updatedRules.split(`${start}\n`)[1]?.split(end)[0]?.trim()
      expect(expectedSection).toBeTruthy()
      for (const newline of ["\n", "\r\n"]) {
        const files = downstreamGovernanceFiles(config, {
          dataAccess,
          mantineUiGuidelines: uiGuidelines,
          engineeringRules: updatedRules.replace(/\r?\n/g, newline)
        })
        const section = files
          .get("docs/ENGINEERING_RULES.md")
          ?.split("## 文件结构与模块依赖\n")[1]
          ?.split("## 源码可读性与类型化组合")[0]
          ?.trim()
        expect(section).toBe(expectedSection)
      }
      for (const invalidRules of [
        engineeringRules.replace(start, ""),
        engineeringRules.replace(end, ""),
        `${start}\n\n${end}\n`
      ]) {
        expect(() =>
          downstreamGovernanceFiles(config, {
            dataAccess,
            mantineUiGuidelines: uiGuidelines,
            engineeringRules: invalidRules
          })
        ).toThrow(/ENGINEERING_RULES\.md.*module structure/)
      }
    }
  )

  /** 验证 keeps the Extension package inspection as a hard candidate gate 场景。 */
  test("keeps the Extension package inspection as a hard candidate gate", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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
    const files = downstreamGovernanceFiles(config, {
      dataAccess: await readFile(path.join(repositoryRoot, "docs/DATA_ACCESS.md"), "utf8"),
      mantineUiGuidelines: await readFile(
        path.join(repositoryRoot, "docs/MANTINE_UI_GUIDELINES.md"),
        "utf8"
      ),
      engineeringRules: await readFile(
        path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"),
        "utf8"
      )
    })
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
    const sourceRoot = await seedTemplateRoot()
    const parent = await temporaryDirectory("web-harness-preflight-")
    const invalidTarget = path.join(parent, "invalid-environment")
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
    const hiddenTarget = path.join(parent, "hidden-environment")
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
    for (const failedCommand of ["pnpm", "git"] as const) {
      const parent = await temporaryDirectory(`web-harness-${failedCommand}-failure-`)
      const id = `${failedCommand}-failure`
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
          (initOptions, preparedLogo) =>
            initializeProject(initOptions, preparedLogo, async (command) => {
              if (command === failedCommand) throw new Error(`${command} failed`)
            })
        )
      ).rejects.toThrow(`${failedCommand} failed`)
      await expect(readdir(targetRoot)).rejects.toThrow()
      expect(
        (await readdir(parent)).filter((entry) => entry.startsWith(`.${id}.harness-stage-`))
      ).toEqual([])
    }
  })

  /** 验证 rejects a non-empty target 场景。 */
  test("rejects a non-empty target", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const parent = await temporaryDirectory("web-harness-target-")
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
    const parent = await temporaryDirectory("web-harness-path-")
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
    const realTarget = path.join(parent, "real-target")
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
