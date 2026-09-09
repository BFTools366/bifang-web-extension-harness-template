import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import {
  INSTANTIATION_ONLY_EXCLUDED_PATHS,
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
  seedTemplateRoot,
  symlink,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"
import type { ProjectConfig } from "./harness-tooling-support.ts"

describe("safe template instantiation", /* 执行 当前声明 函数的处理逻辑。 */ () => {
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

  /** 验证 copies a clean template into a governed terminal project 场景。 */
  test("copies a clean template into a governed terminal project", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 parent 变量供当前逻辑使用。
    const parent = await temporaryDirectory("web-harness-copy-")
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = path.join(parent, "terminal-project")
    await instantiateProject({
      sourceRoot: repositoryRoot,
      targetRoot,
      init: {
        projectType: "web",
        name: "Terminal Project",
        id: "terminal-project",
        description: "A terminal Web application.",
        brandColor: "#4C6EF5",
        agentPolicy: TEST_AGENT_POLICY,
        ...TEST_BASE_URLS,
        skipInstall: true,
        skipGit: false
      }
    })

    // 保存 git 函数，用无 Shell 的真实命令验证 staging 随项目一起原子发布。
    const git = (args: string[]): string =>
      execFileSync("git", args, { cwd: targetRoot, encoding: "utf8" }).trim()
    expect(git(["branch", "--show-current"])).toBe("main")
    expect(git(["rev-list", "--count", "HEAD"])).toBe("1")
    expect(git(["status", "--porcelain=v1"])).toBe("")
    expect(git(["remote"])).toBe("")
    expect(git(["config", "--local", "--get", "core.commentString"])).toBe("#")

    // 保存 skillEntries 变量供当前逻辑使用。
    const skillEntries = await readdir(path.join(targetRoot, ".agents/skills"), {
      withFileTypes: true
    })
    // 保存 skills 变量供当前逻辑使用。
    const skills = skillEntries
      .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
      .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    expect(skills).toHaveLength(13)
    expect(skills.sort()).toEqual(
      [
        "web-check-development-environment",
        "web-configure-git-commits",
        "web-define-product",
        "web-extract-i18n-strings",
        "web-implement-change",
        "web-plan-change",
        "web-prepare-brand-identity",
        "web-prepare-release",
        "web-refactor-code",
        "web-run-parallel-worktrees",
        "web-test-final-artifact-e2e",
        "web-upgrade-harness",
        "web-verify-delivery"
      ].sort()
    )
    expect(skills).not.toContain("initialize-web-project")
    expect(skills).not.toContain("instantiate-project")
    expect(skills).not.toContain("web-instantiate-project")
    expect(skills).not.toContain("web-curate-harness-memory")
    expect(skills).not.toContain("manage-project-surfaces")

    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.harness).toContain(".harness/tooling/cli.ts")
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    expect(manifest.scripts).not.toHaveProperty("validate:harness")
    // 保存 removedCreationPath 变量供当前逻辑使用。
    for (const removedCreationPath of [
      ".harness/tooling/init.ts",
      ".harness/tooling/instantiate.ts",
      "scripts/instantiate.ts"
    ]) {
      await expect(readFile(path.join(targetRoot, removedCreationPath), "utf8")).rejects.toThrow()
    }
    await expect(
      readFile(path.join(targetRoot, ".harness/tooling/manifest.ts"), "utf8")
    ).rejects.toThrow()
    await expect(
      readFile(path.join(targetRoot, "tests/extension-runtime.test.ts"), "utf8")
    ).rejects.toThrow()
    await expect(
      readFile(path.join(targetRoot, "tests/harness-memory.test.ts"), "utf8")
    ).rejects.toThrow()
    await expect(
      readFile(path.join(targetRoot, "tests/harness-agents-entrypoint.test.ts"), "utf8")
    ).rejects.toThrow()
    // 保存 retainedTest 变量供当前逻辑使用。
    for (const retainedTest of [
      "tests/build-tooling.test.ts",
      "tests/release-inspection.test.ts",
      "tests/source-size-policy.test.ts",
      "tests/version.test.ts"
    ]) {
      await expect(readFile(path.join(targetRoot, retainedTest), "utf8")).resolves.toContain(
        "test("
      )
    }
    // 保存 downstreamAgents 变量供当前逻辑使用。
    const downstreamAgents = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8")
    expect(downstreamAgents).toContain("## Web Harness 前端 Skill 地图")
    expect(downstreamAgents).toContain("docs/DATA_ACCESS.md")
    expect(downstreamAgents).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamAgents).toContain("interaction-state, responsive, or UI-accessibility work")
    expect(downstreamAgents).toContain("multi-source event streams, or RxJS")
    expect(downstreamAgents).toContain("`src/routes/`")
    expect(downstreamAgents).toContain("`src/api/client/`")
    expect(downstreamAgents).toContain("`src/pagination/`")
    expect(downstreamAgents).toContain("Create a persistent plan only when the user explicitly")
    expect(downstreamAgents).toContain("## Event-driven execution")
    expect(downstreamAgents).toContain("parallel_worktree_subagents: enabled")
    expect(downstreamAgents).toContain("$web-configure-git-commits")
    expect(downstreamAgents).not.toContain("Three delivery paths")
    expect(downstreamAgents).not.toContain("Milestone work")
    expect(downstreamAgents).toContain("Every artifact build asks the user")
    expect(downstreamAgents).toContain("they do not create or update Work Plans")
    expect(downstreamAgents).toContain("只在首次初始化或命令已报出环境错误时检查")
    // 保存 downstreamVerifyDeliveryMetadata 变量供当前逻辑使用。
    const downstreamVerifyDeliveryMetadata = await readFile(
      path.join(targetRoot, ".agents/skills/web-verify-delivery/agents/openai.yaml"),
      "utf8"
    )
    expect(downstreamVerifyDeliveryMetadata).toContain('display_name: "Web Harness：验证前端交付"')
    expect(downstreamVerifyDeliveryMetadata).toContain("使用 $web-verify-delivery 验收 Web Harness")
    // 保存 skillName 变量供当前逻辑使用。
    for (const skillName of skills) {
      // 保存 metadata 变量供当前逻辑使用。
      const metadata = await readFile(
        path.join(targetRoot, ".agents/skills", skillName, "agents/openai.yaml"),
        "utf8"
      )
      expect(metadata).toMatch(/display_name: "Web Harness：[^"]+"/u)
      expect(metadata).toContain(`使用 $${skillName}`)
      expect(metadata).not.toMatch(/\b(?:Rust|Server)\b/iu)
    }
    // 保存 downstreamReadme 变量供当前逻辑使用。
    const downstreamReadme = await readFile(path.join(targetRoot, "README.md"), "utf8")
    expect(downstreamReadme).toContain("React, Vite, Mantine")
    expect(downstreamReadme).toContain("native Fetch and pagination foundations")
    expect(downstreamReadme).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamReadme).toContain("pnpm routes:generate")
    expect(downstreamReadme).toContain("pnpm test:related <changed-source...>")
    expect(downstreamReadme).toContain("single Release artifact entry point")
    expect(downstreamReadme).toContain("YYYYMMDDHHMM")
    expect(downstreamReadme).toContain("--e2e=enabled|disabled")
    // 保存 downstreamPolicy 变量供当前逻辑使用。
    const downstreamPolicy = await readFile(path.join(targetRoot, "docs/AGENT_POLICY.md"), "utf8")
    expect(downstreamPolicy).toContain("schema_version: 1")
    expect(downstreamPolicy).toContain("confirmed_by: test-owner")
    expect(downstreamPolicy).toContain("confirmed_at: 2026-09-09T00:00:00.000Z")
    expect(downstreamPolicy).toContain("parallel_worktree_subagents: enabled")
    expect(downstreamPolicy).toContain("milestone_smoke: enabled")
    expect(downstreamPolicy).toContain("milestone_e2e: disabled")
    expect(downstreamPolicy).not.toContain("standard_work_plan")
    expect(downstreamPolicy).toContain("{序号}|{Task简述}|{当前进度} |{功能摘要}")
    expect(downstreamPolicy).toContain("构建、E2E、扫描和验收继续完全遵循当前仓库")
    // 保存 downstreamEngineering 变量供当前逻辑使用。
    const downstreamEngineering = await readFile(
      path.join(targetRoot, "docs/ENGINEERING_RULES.md"),
      "utf8"
    )
    expect(downstreamEngineering).toContain("日常任务只运行本次变化需要的相关非空测试")
    expect(downstreamEngineering).toContain("不得自动追加格式、lint、类型、全仓检查或构建")
    expect(downstreamEngineering).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamEngineering).toContain("1001 行起必须按业务逻辑拆分")
    expect(downstreamEngineering).toContain("`pnpm build` 是唯一最终产物入口")
    expect(downstreamEngineering).toContain("不创建或更新 Work Plan、ADR、Status")
    // 保存 downstreamRuntime 变量供工具链探测边界回归使用。
    const downstreamRuntime = await readFile(
      path.join(targetRoot, "docs/RUNTIME_CONFIGURATION.md"),
      "utf8"
    )
    expect(downstreamRuntime).toContain("普通开发、构建、新会话或 Agent 切换不预探测")
    // 保存 downstreamMantineUi 变量供当前逻辑使用。
    const downstreamMantineUi = await readFile(
      path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
    expect(downstreamMantineUi).toContain("## 8. Web 宿主规范")
    expect(downstreamMantineUi).not.toContain("## 9. Extension 宿主规范")
    expect(downstreamMantineUi).toContain("## 9. 交付检查")
    expect(downstreamMantineUi).not.toContain("Popup")
    expect(downstreamMantineUi).not.toContain("Options")
    expect(downstreamMantineUi).not.toContain("src/providers.tsx")
    expect(downstreamMantineUi).not.toContain("MV3/CSP")
    // 保存 downstreamRelease 变量供当前逻辑使用。
    const downstreamRelease = await readFile(path.join(targetRoot, "docs/RELEASE.md"), "utf8")
    expect(downstreamRelease).toContain("当次 E2E 选择 `enabled`")
    expect(downstreamRelease).toContain("构建操作本身不写入 ADR")
    // 保存 downstreamLogging 变量供当前逻辑使用。
    const downstreamLogging = await readFile(path.join(targetRoot, "docs/LOGGING.md"), "utf8")
    expect(downstreamLogging).toContain("被硬要求的真实 Chrome 候选验证")
    // 保存 downstreamDocsReadme 变量供当前逻辑使用。
    const downstreamDocsReadme = await readFile(path.join(targetRoot, "docs/README.md"), "utf8")
    expect(downstreamDocsReadme).toContain("DATA_ACCESS.md")
    expect(downstreamDocsReadme).toContain("MANTINE_UI_GUIDELINES.md")
    expect(downstreamDocsReadme).toContain("RxJS")
    expect(downstreamDocsReadme).toContain("RUNTIME_CONFIGURATION.md")
    expect(downstreamDocsReadme).toContain("LOGGING.md")
    // 保存 downstreamTechDebt 变量供当前逻辑使用。
    const downstreamTechDebt = await readFile(path.join(targetRoot, "docs/TECH_DEBT.md"), "utf8")
    expect(downstreamTechDebt).not.toContain("## 当前记录")
    expect(downstreamTechDebt).not.toContain("初始化时没有登记")
    expect(downstreamTechDebt).not.toContain("DEP0205")

    // 保存 terminalDocs 变量供当前逻辑使用。
    const terminalDocs = [
      "README.md",
      "AGENTS.md",
      "docs/README.md",
      "docs/AGENT_POLICY.md",
      "docs/DATA_ACCESS.md",
      "docs/ENGINEERING_RULES.md",
      "docs/MANTINE_UI_GUIDELINES.md",
      "docs/LOGGING.md",
      "docs/RELEASE.md",
      "docs/RUNTIME_CONFIGURATION.md",
      "docs/TECH_DEBT.md"
    ]
    // 保存 relativePath 变量供当前逻辑使用。
    for (const relativePath of terminalDocs) {
      // 保存 contents 变量供当前逻辑使用。
      const contents = await readFile(path.join(targetRoot, relativePath), "utf8")
      expect(contents).not.toContain("pnpm instantiate")
      expect(contents).not.toContain("pnpm harness:init")
      expect(contents).not.toContain("Bifang Web Harness Template")
      expect(contents).not.toContain("$web-instantiate-project")
      // 保存 historicalMarker 变量供当前逻辑使用。
      for (const historicalMarker of [
        "intentionally removed",
        "Retained Skill map",
        "由源 Harness",
        "已删除的项目生成流程",
        "may have been changed during creation"
      ]) {
        expect(contents).not.toContain(historicalMarker)
      }
    }
    // 保存 removedDoc 变量供当前逻辑使用。
    for (const removedDoc of [
      "Version.md",
      "docs/TS_WEB_TEMPLATE.md",
      "docs/HARNESS_ENGINEERING.md"
    ]) {
      await expect(readFile(path.join(targetRoot, removedDoc), "utf8")).rejects.toThrow()
    }
    // 保存 excludedPath 变量供所有一次性源记忆与验证路径排除回归使用。
    for (const excludedPath of INSTANTIATION_ONLY_EXCLUDED_PATHS) {
      await expect(readFile(path.join(targetRoot, excludedPath), "utf8")).rejects.toThrow()
      await expect(readdir(path.join(targetRoot, excludedPath))).rejects.toThrow()
    }

    // 保存 sourceLicense 变量供当前逻辑使用。
    const sourceLicense = await readFile(path.join(repositoryRoot, "LICENSE.en.md"), "utf8")
    // 保存 expectedLicense 变量供当前逻辑使用。
    const expectedLicense = sourceLicense.replace(
      "Applicable Project Name: Bifang Web Harness Template.",
      "Applicable Project Name: Terminal Project."
    )
    expect(await readFile(path.join(targetRoot, "LICENSE.en.md"), "utf8")).toBe(expectedLicense)
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

  /** 验证 requires target basename to match id and rejects symlink targets 场景。 */
  test("requires target basename to match id and rejects symlink targets", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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

    // 保存 realTarget 变量供当前逻辑使用。
    const realTarget = path.join(parent, "real-target")
    // 保存 linkTarget 变量供当前逻辑使用。
    const linkTarget = path.join(parent, "linked-project")
    await mkdir(realTarget)
    await symlink(realTarget, linkTarget)
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
