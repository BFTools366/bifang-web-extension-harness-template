import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import { checkCommitConfiguration } from "../.agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"
import {
  INSTANTIATION_ONLY_EXCLUDED_PATHS,
  TEST_BASE_URLS,
  TEST_AGENT_POLICY,
  expect,
  instantiateProject,
  path,
  readFile,
  readdir,
  repositoryRoot,
  temporaryDirectory
} from "./harness-tooling-support.ts"
import "./harness-instantiation-fixture.ts"

/** 验证 terminal source projection 的完整回归场景。 */
describe("terminal source projection", () => {
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
    await expect(checkCommitConfiguration(targetRoot)).resolves.toMatchObject({ status: "ok" })
    expect(
      await readFile(path.join(targetRoot, ".harness/tooling/agent-policy.ts"), "utf8")
    ).not.toContain("AgentPolicyMode")

    // 保存 skillEntries 变量供当前逻辑使用。
    const skillEntries = await readdir(path.join(targetRoot, ".agents/skills"), {
      withFileTypes: true
    })
    // 保存 skills 变量供当前逻辑使用。
    const skills = skillEntries
      .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
      .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    expect(skills).toHaveLength(16)
    expect(skills).toContain("web-summarize-development-history")
    expect(skills.sort()).toEqual(
      [
        "design-taste-frontend",
        "web-check-development-environment",
        "web-configure-git-commits",
        "web-define-product",
        "web-extract-i18n-strings",
        "web-implement-change",
        "web-implement-list-view",
        "web-plan-change",
        "web-prepare-brand-identity",
        "web-prepare-release",
        "web-refactor-code",
        "web-run-parallel-worktrees",
        "web-summarize-development-history",
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

    // 保存 listViewSkillRoot 变量供 Web-only Skill 完整资产回归使用。
    const listViewSkillRoot = path.join(targetRoot, ".agents/skills/web-implement-list-view")
    // 保存 listViewSkillFiles 变量供逐个验证终端必须保留的执行资产与参考资料。
    const listViewSkillFiles = [
      "SKILL.md",
      "agents/openai.yaml",
      "assets/ListPage.contracts.test.ts",
      "assets/listPageState.ts",
      "references/checklist.md",
      "references/mantine-api.md",
      "references/offset-list-pattern.md"
    ] as const
    for (const relativePath of listViewSkillFiles) {
      await expect(readFile(path.join(listViewSkillRoot, relativePath), "utf8")).resolves.not.toBe(
        ""
      )
    }
    // 保存 listViewContractOutput 变量供下游纯 TypeScript 契约可执行性回归使用。
    const listViewContractOutput = execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        path.join(listViewSkillRoot, "assets/ListPage.contracts.test.ts")
      ],
      { cwd: listViewSkillRoot, encoding: "utf8" }
    ).trim()
    expect(listViewContractOutput).toBe("mantine-list-view executable contracts passed")

    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.harness).toContain(".harness/tooling/cli.ts")
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    expect(manifest.scripts).not.toHaveProperty("validate:harness")
    // 保存 terminalTypes 变量供保留下游 Agent policy 类型契约回归使用。
    const terminalTypes = await readFile(path.join(targetRoot, ".harness/tooling/types.ts"), "utf8")
    expect(terminalTypes).toContain('export type AgentPolicyChoice = "enabled" | "disabled"')
    expect(terminalTypes).toContain("export interface AgentPolicySelection")
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
    expect(downstreamAgents).toContain("## User-owned Task binding")
    expect(downstreamAgents).toContain("A returned `clientThreadId` is setup-pending")
    expect(downstreamAgents).toContain("canonical Git common dir")
    expect(downstreamAgents).toContain("Only one write-active Task may exist per project")
    expect(downstreamAgents).toContain("parallel_worktree_subagents: enabled")
    expect(downstreamAgents).toContain("$web-configure-git-commits")
    expect(downstreamAgents).not.toContain("Three delivery paths")
    expect(downstreamAgents).not.toContain("Milestone work")
    expect(downstreamAgents).toContain("Reuse the confirmed E2E selection across builds")
    expect(downstreamAgents).toContain("An explicit release request covers necessary commits, push")
    expect(downstreamAgents).not.toContain("Every artifact build asks the user")
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
    for (const skillName of skills.filter((skill) => skill.startsWith("web-"))) {
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
    expect(downstreamReadme).toContain("Ky HTTP and pagination foundations")
    expect(downstreamReadme).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamReadme).toContain("pnpm routes:generate")
    expect(downstreamReadme).toContain("pnpm test:related <changed-source...>")
    expect(downstreamReadme).toContain("single Release artifact entry point")
    expect(downstreamReadme).toContain("YYMMDDHHMMSS")
    expect(downstreamReadme).toContain("--e2e=enabled|disabled")
    // 保存 downstreamPolicy 变量供当前逻辑使用。
    const downstreamPolicy = await readFile(path.join(targetRoot, "docs/AGENT_POLICY.md"), "utf8")
    expect(downstreamPolicy).toContain("schema_version: 3")
    expect(downstreamPolicy).not.toMatch(/^schema_version: 1$/mu)
    expect(downstreamPolicy).toContain("confirmed_by: test-owner")
    expect(downstreamPolicy).toContain("confirmed_at: 2026-09-09T00:00:00.000Z")
    expect(downstreamPolicy).toContain("user_owned_tasks: disabled")
    expect(downstreamPolicy).toContain("parallel_worktree_subagents: enabled")
    expect(downstreamPolicy).toContain("acceptance_smoke: enabled")
    expect(downstreamPolicy).toContain(
      "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`"
    )
    expect(downstreamPolicy).toContain(
      "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`"
    )
    expect(downstreamPolicy).toContain("e2e_hint: disabled")
    expect(downstreamPolicy).not.toMatch(/^milestone_smoke:/mu)
    expect(downstreamPolicy).not.toMatch(/^milestone_e2e:/mu)
    expect(downstreamPolicy).not.toContain("standard_work_plan")
    expect(downstreamPolicy).toContain("Task {序号} | {当前进度} | {单一结果}")
    expect(downstreamPolicy).not.toContain("{序号}|{Task简述}|{当前进度} |{功能摘要}")
    expect(downstreamPolicy).toContain("构建、E2E、扫描和验收继续完全遵循当前仓库")
    // 保存 downstreamEngineering 变量供当前逻辑使用。
    const downstreamEngineering = await readFile(
      path.join(targetRoot, "docs/ENGINEERING_RULES.md"),
      "utf8"
    )
    expect(downstreamEngineering).toContain("日常任务只运行本次变化需要的相关非空测试")
    expect(downstreamEngineering).toContain("不得自动追加格式、lint、类型、全仓检查或构建")
    expect(downstreamEngineering).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamEngineering).toContain("601 行起必须按业务逻辑拆分")
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
})
