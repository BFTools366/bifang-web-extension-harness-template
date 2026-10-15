import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { initializeProject } from "../.harness/tooling/init.ts"
import { runCommand } from "../.harness/tooling/process.ts"
import { checkCommitConfiguration } from "../.agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts"
import {
  INSTANTIATION_ONLY_EXCLUDED_PATHS,
  TEST_BASE_URLS,
  TEST_AGENT_POLICY,
  expect,
  instantiateProject,
  mkdir,
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
    const parent = await temporaryDirectory("web-harness-copy-")
    const targetRoot = path.join(parent, "terminal-project")
    // 用真实 Git 基线证明交接原文不会遗漏在提交之外；BOM 与混合换行一次覆盖 LF/CRLF。
    const requirements = "\uFEFF# 创建需求\r\n\n仅公开介绍页，无账户或组织功能。\r\n"
    await instantiateProject(
      {
        sourceRoot: repositoryRoot,
        targetRoot,
        requirements: {
          content: requirements,
          sha256: createHash("sha256").update(requirements).digest("hex")
        },
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
      },
      (options, logo) =>
        initializeProject(options, logo, async (command, args, root) => {
          await runCommand(command, args, root)
          // 模拟启用自动换行转换的真实 Git，规则必须在首次 add 前生效。
          if (command === "git" && args[0] === "init") {
            await runCommand("git", ["config", "--local", "core.autocrlf", "true"], root)
          }
        })
    )

    // 保存 git 函数，用无 Shell 的真实命令验证 staging 随项目一起原子发布。
    const git = (args: string[]): string =>
      execFileSync("git", args, { cwd: targetRoot, encoding: "utf8" }).trim()
    expect(git(["branch", "--show-current"])).toBe("main")
    expect(git(["rev-list", "--count", "HEAD"])).toBe("1")
    expect(git(["status", "--porcelain=v1"])).toBe("")
    expect(git(["remote"])).toBe("")
    expect(git(["show", "HEAD:docs/requirements/source.txt"])).toBe(requirements.trim())
    expect(git(["ls-files", "docs/requirements/source.txt"])).toBe("docs/requirements/source.txt")
    // 基线 Git blob 与再次检出的文件必须保留 BOM/CRLF，与确认摘要一致。
    const committedRequirements = execFileSync(
      "git",
      ["show", "HEAD:docs/requirements/source.txt"],
      {
        cwd: targetRoot
      }
    )
    expect(committedRequirements).toEqual(Buffer.from(requirements, "utf8"))
    const checkoutRoot = path.join(parent, "requirements-checkout")
    await mkdir(checkoutRoot)
    execFileSync(
      "git",
      ["checkout-index", "--prefix", checkoutRoot + path.sep, "--", "docs/requirements/source.txt"],
      {
        cwd: targetRoot
      }
    )
    expect(await readFile(path.join(checkoutRoot, "docs/requirements/source.txt"))).toEqual(
      committedRequirements
    )
    expect(git(["config", "--local", "--get", "core.commentString"])).toBe("#")
    await expect(checkCommitConfiguration(targetRoot)).resolves.toMatchObject({ status: "ok" })
    expect(
      await readFile(path.join(targetRoot, ".harness/tooling/agent-policy.ts"), "utf8")
    ).not.toContain("AgentPolicyMode")

    const skillEntries = await readdir(path.join(targetRoot, ".agents/skills"), {
      withFileTypes: true
    })
    const skills = skillEntries
      .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
      .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    expect(skills).toHaveLength(29)
    expect(skills).toContain("web-summarize-development-history")
    expect(skills.sort()).toEqual(
      [
        "design-taste-frontend",
        "web-review-api-contract",
        "web-review-module-boundaries",
        "web-implement-access-control",
        "web-implement-write-recovery",
        "web-implement-browser-storage",
        "web-implement-event-stream",
        "web-manage-user-tasks",
        "web-audit-worktrees",
        "web-check-development-environment",
        "web-configure-git-commits",
        "web-connect-http-service",
        "web-define-product",
        "web-design-prototype",
        "web-document-api",
        "web-compose-capabilities",
        "web-extract-i18n-strings",
        "web-implement-change",
        "web-implement-list-view",
        "web-plan-change",
        "web-prepare-brand-identity",
        "web-prepare-release",
        "web-preview-harness-upgrade",
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
    expect(skills).not.toContain("web-review-extension-compatibility")
    expect(skills).not.toContain("manage-project-surfaces")

    // 两库及显式组合模板按原文分发，产品源码仍为中性起点。
    for (const file of [
      "SKILL.md",
      "agents/openai.yaml",
      "catalog.json",
      "scripts/capabilities.ts",
      "knowledge/identity.md",
      "knowledge/organization.md",
      "knowledge/permissions.md",
      "knowledge/catalog.md",
      "knowledge/orders.md",
      "knowledge/wallet-payments.md",
      "knowledge/audit.md",
      "templates/identity/session.ts.txt",
      "templates/compositions/account-workspace/files.ts",
      "templates/compositions/purchase-checkout/commerce-reference.js"
    ]) {
      const relativePath = path.join(".agents/skills/web-compose-capabilities", file)
      expect(await readFile(path.join(targetRoot, relativePath), "utf8")).toBe(
        await readFile(path.join(repositoryRoot, relativePath), "utf8")
      )
    }
    expect(await readFile(path.join(targetRoot, "docs/DATA_ACCESS.md"), "utf8")).toContain(
      "### 1.3.1 Web 身份认证凭据持久化例外"
    )

    const listViewSkillRoot = path.join(targetRoot, ".agents/skills/web-implement-list-view")
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
    const listViewContractOutput = execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        path.join(listViewSkillRoot, "assets/ListPage.contracts.test.ts")
      ],
      { cwd: listViewSkillRoot, encoding: "utf8" }
    ).trim()
    expect(listViewContractOutput).toBe("mantine-list-view executable contracts passed")

    const manifest = JSON.parse(await readFile(path.join(targetRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.harness).toContain(".harness/tooling/cli.ts")
    expect(manifest.scripts).not.toHaveProperty("harness:init")
    expect(manifest.scripts).not.toHaveProperty("instantiate")
    expect(manifest.scripts).not.toHaveProperty("validate:harness")
    const terminalTypes = await readFile(path.join(targetRoot, ".harness/tooling/types.ts"), "utf8")
    expect(terminalTypes).toContain('export type AgentPolicyChoice = "enabled" | "disabled"')
    expect(terminalTypes).toContain("export interface AgentPolicySelection")
    for (const removedCreationPath of [
      ".harness/tooling/init.ts",
      ".harness/tooling/initialization-input.ts",
      "tests/initialization-guidance.test.ts",
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
    const downstreamAgents = await readFile(path.join(targetRoot, "AGENTS.md"), "utf8")
    expect(downstreamAgents).toContain("## Web Harness 前端 Skill 地图")
    expect(downstreamAgents).toContain("docs/DATA_ACCESS.md")
    expect(downstreamAgents).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamAgents).toContain("交互状态、响应式或 UI 无障碍工作")
    expect(downstreamAgents).toContain("多来源事件流或 RxJS")
    expect(downstreamAgents).toContain("`src/routes/`")
    expect(downstreamAgents).toContain("`src/data/api/client/`")
    expect(downstreamAgents).toContain("`src/pagination/`")
    expect(downstreamAgents).toContain("只有用户明确要求")
    expect(downstreamAgents).toContain("## 事件驱动执行")
    expect(downstreamAgents).toContain("## 用户可见 Task 绑定")
    expect(downstreamAgents).toContain("只返回 `clientThreadId` 表示环境仍在准备")
    expect(downstreamAgents).toContain("$web-manage-user-tasks")
    expect(downstreamAgents).toContain("每个项目同一时间只允许一个写入型活动 Task")
    expect(downstreamAgents).toContain("parallel_worktree_subagents: enabled")
    expect(downstreamAgents).toContain("$web-configure-git-commits")
    expect(downstreamAgents).not.toContain("Three delivery paths")
    expect(downstreamAgents).not.toContain("Milestone work")
    expect(downstreamAgents).toContain("同一发布的构建、打包和修复复用已确认的 E2E 选择")
    expect(downstreamAgents).toContain("明确发布请求覆盖既有目标与范围内必要的提交、推送")
    expect(downstreamAgents).not.toContain("Every artifact build asks the user")
    expect(downstreamAgents).toContain("不创建或更新工作计划、ADR、状态、变更记录、验收记录")
    expect(downstreamAgents).toContain("只在首次初始化或命令已报出环境错误时检查")
    const downstreamVerifyDeliveryMetadata = await readFile(
      path.join(targetRoot, ".agents/skills/web-verify-delivery/agents/openai.yaml"),
      "utf8"
    )
    expect(downstreamVerifyDeliveryMetadata).toContain('display_name: "Web Harness：验证前端交付"')
    expect(downstreamVerifyDeliveryMetadata).toContain("使用 $web-verify-delivery 验收 Web Harness")
    for (const skillName of skills.filter((skill) => skill.startsWith("web-"))) {
      const metadata = await readFile(
        path.join(targetRoot, ".agents/skills", skillName, "agents/openai.yaml"),
        "utf8"
      )
      expect(metadata).toMatch(/display_name: "Web Harness：[^"]+"/u)
      expect(metadata).toContain(`使用 $${skillName}`)
      expect(metadata).not.toMatch(/\b(?:Rust|Server)\b/iu)
    }
    const downstreamReadme = await readFile(path.join(targetRoot, "README.md"), "utf8")
    expect(downstreamReadme).toContain("## 技术基线")
    expect(downstreamReadme).toContain("React、Vite、Mantine")
    expect(downstreamReadme).toContain("Ky HTTP 与分页基础")
    expect(downstreamReadme).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamReadme).toContain("pnpm routes:generate")
    expect(downstreamReadme).toContain("pnpm test:related <changed-source...>")
    expect(downstreamReadme).toContain("唯一正式产物入口")
    expect(downstreamReadme).toContain("YYMMDDHHMMSS")
    expect(downstreamReadme).toContain("--e2e=enabled|disabled")
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
    const downstreamEngineering = await readFile(
      path.join(targetRoot, "docs/ENGINEERING_RULES.md"),
      "utf8"
    )
    expect(downstreamEngineering).toContain("日常任务只运行本次变化需要的相关非空测试")
    expect(downstreamEngineering).toContain("不得自动追加格式、lint、类型、全仓检查或构建")
    expect(downstreamEngineering).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(downstreamEngineering).toContain("601 行起必须按业务逻辑拆分")
    expect(downstreamEngineering).toContain("文档、标题、注释、帮助和提示优先使用准确自然的中文")
    expect(downstreamEngineering).toContain("`pnpm build` 是唯一最终产物入口")
    expect(downstreamEngineering).toContain("不创建或更新 Work Plan、ADR、Status")
    const downstreamRuntime = await readFile(
      path.join(targetRoot, "docs/RUNTIME_CONFIGURATION.md"),
      "utf8"
    )
    expect(downstreamRuntime).toContain("普通开发、构建、新会话或 Agent 切换不预探测")
    const downstreamMantineUi = await readFile(
      path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
    expect(downstreamMantineUi).toContain("## 8. Web 宿主规范")
    expect(downstreamMantineUi).not.toContain("## 9. Extension 宿主规范")
    expect(downstreamMantineUi).toContain("## 9. 交付检查")
    expect(downstreamMantineUi).not.toContain("Popup")
    // 独立 Options 界面不可泄漏，路由属性 activeOptions 不属于扩展宿主。
    expect(downstreamMantineUi).not.toMatch(/\bOptions\b/u)
    expect(downstreamMantineUi).not.toContain("src/providers.tsx")
    expect(downstreamMantineUi).not.toContain("MV3/CSP")
    const downstreamRelease = await readFile(path.join(targetRoot, "docs/RELEASE.md"), "utf8")
    expect(downstreamRelease).toContain("当次 E2E 选择 `enabled`")
    expect(downstreamRelease).toContain("构建操作本身不写入 ADR")
    const downstreamLogging = await readFile(path.join(targetRoot, "docs/LOGGING.md"), "utf8")
    expect(downstreamLogging).toContain("被硬要求的真实 Chrome 候选验证")
    const downstreamDocsReadme = await readFile(path.join(targetRoot, "docs/README.md"), "utf8")
    expect(downstreamDocsReadme).toContain("DATA_ACCESS.md")
    expect(downstreamDocsReadme).toContain("MANTINE_UI_GUIDELINES.md")
    expect(downstreamDocsReadme).toContain("RxJS")
    expect(downstreamDocsReadme).toContain("RUNTIME_CONFIGURATION.md")
    expect(downstreamDocsReadme).toContain("LOGGING.md")
    const downstreamTechDebt = await readFile(path.join(targetRoot, "docs/TECH_DEBT.md"), "utf8")
    expect(downstreamTechDebt).not.toContain("## 当前记录")
    expect(downstreamTechDebt).not.toContain("初始化时没有登记")
    expect(downstreamTechDebt).not.toContain("DEP0205")

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
    for (const relativePath of terminalDocs) {
      const contents = await readFile(path.join(targetRoot, relativePath), "utf8")
      expect(contents).not.toContain("pnpm instantiate")
      expect(contents).not.toContain("pnpm harness:init")
      expect(contents).not.toContain("Bifang Web Harness Template")
      expect(contents).not.toContain("$web-instantiate-project")
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
    for (const removedDoc of [
      "Version.md",
      "docs/TS_WEB_TEMPLATE.md",
      "docs/HARNESS_ENGINEERING.md"
    ]) {
      await expect(readFile(path.join(targetRoot, removedDoc), "utf8")).rejects.toThrow()
    }
    for (const excludedPath of INSTANTIATION_ONLY_EXCLUDED_PATHS) {
      await expect(readFile(path.join(targetRoot, excludedPath), "utf8")).rejects.toThrow()
      await expect(readdir(path.join(targetRoot, excludedPath))).rejects.toThrow()
    }

    const sourceLicense = await readFile(path.join(repositoryRoot, "LICENSE.en.md"), "utf8")
    const expectedLicense = sourceLicense.replace(
      "Applicable Project Name: Bifang Web Harness Template.",
      "Applicable Project Name: Terminal Project."
    )
    expect(await readFile(path.join(targetRoot, "LICENSE.en.md"), "utf8")).toBe(expectedLicense)
  })
})
