import { WORKSPACE_SKILL_CONTRACTS } from "../.harness/tooling/workspace-skills.ts"
import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { initializeProject } from "../.harness/tooling/init.ts"
import { HARNESS_ONLY_PATHS } from "../.harness/tooling/config.ts"
import ts from "typescript"
import { walkFiles } from "../.harness/tooling/files.ts"
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

/** 收集模块顶层导出名，包括类型、值与重导出。 */
function exportedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)
      : false
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        for (const element of statement.exportClause.elements) names.add(element.name.text)
      continue
    }
    if (!exported) continue
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      names.add(statement.name.text)
  }
  return names
}

/** 静态核对生成终端 tooling 的相对具名导入均有对应导出，替代需要依赖安装的真实链接。 */
async function missingTerminalToolingImports(root: string): Promise<string[]> {
  const tooling = path.join(root, ".harness/tooling")
  const files = await walkFiles(tooling, { filter: (name) => name.endsWith(".ts") })
  const parsed = new Map<string, ts.SourceFile>()
  /** 每个模块只解析一次，导入目标可位于 tooling 之外的终端文件。 */
  async function load(file: string): Promise<ts.SourceFile | undefined> {
    if (!parsed.has(file)) {
      const source = await readFile(file, "utf8").catch(() => undefined)
      if (source === undefined) return undefined
      parsed.set(file, ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true))
    }
    return parsed.get(file)
  }
  const missing: string[] = []
  for (const file of files) {
    const source = await load(file)
    for (const statement of source?.statements ?? []) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue
      const specifier = statement.moduleSpecifier.text
      if (!specifier.startsWith(".")) continue
      const target = path.resolve(path.dirname(file), specifier)
      const relative = path.relative(root, file)
      const targetSource = await load(target)
      if (!targetSource) {
        missing.push(`${relative} -> ${specifier}`)
        continue
      }
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      const exports = exportedNames(targetSource)
      for (const element of bindings.elements) {
        const name = (element.propertyName ?? element.name).text
        if (!exports.has(name)) missing.push(`${relative} -> ${specifier}#${name}`)
      }
    }
  }
  return missing
}

/** 验证 terminal source projection 的完整回归场景。 */
describe("terminal source projection", () => {
  /** 验证 copies a clean template into a governed terminal project 场景。 */
  test("copies a clean template into a governed terminal project", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const parent = await temporaryDirectory("web-harness-copy-")
    const targetRoot = path.join(parent, "terminal-project")
    // 无 Git 创建仍须完整保留交接原文；BOM 与混合换行一次覆盖 LF/CRLF。
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
          skipInstall: true
        }
      },
      initializeProject
    )

    expect(await readdir(targetRoot)).not.toContain(".git")
    // 终端 tooling 由手写模板生成，任一相对具名导入缺少文件或导出都会在真实下游链接失败。
    expect(await missingTerminalToolingImports(targetRoot)).toEqual([])
    // 所有登记为源专用的回归都不能携带到缺少源 fixture 的终端项目。
    for (const sourceTest of HARNESS_ONLY_PATHS.filter((entry) => entry.startsWith("tests/"))) {
      await expect(readFile(path.join(targetRoot, sourceTest))).rejects.toMatchObject({
        code: "ENOENT"
      })
    }
    expect(await readFile(path.join(targetRoot, "docs/requirements/source.txt"))).toEqual(
      Buffer.from(requirements, "utf8")
    )
    expect(
      await readFile(path.join(targetRoot, ".harness/tooling/agent-policy.ts"), "utf8")
    ).not.toContain("AgentPolicyMode")

    const skillEntries = await readdir(path.join(targetRoot, ".agents/skills"), {
      withFileTypes: true
    })
    const skills = skillEntries
      .filter(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.isDirectory())
      .map(/* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.name)
    expect(skills).toHaveLength(47)
    expect(skills).toContain("web-summarize-development-history")
    expect(skills.sort()).toEqual(
      [
        ...Object.keys(WORKSPACE_SKILL_CONTRACTS),
        "design-taste-frontend",
        "web-review-api-contract",
        "web-review-module-boundaries",
        "web-implement-auth-session",
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

    // 两库及显式组合模板按原文分发，工程基础不包含默认演示页面。
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
      "templates/compositions/account-workspace/data/api/auth/mockAuth.ts.txt",
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
    expect(terminalTypes).toContain("export interface IdentityI18n")
    expect(terminalTypes).not.toContain('from "./identity.ts"')
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
