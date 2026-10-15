import { describe, test } from "vitest"
import {
  HARNESS_ONLY_PATHS,
  cp,
  expect,
  initializeProject,
  mkdir,
  options,
  path,
  readFile,
  refreshBrand,
  repositoryRoot,
  rm,
  seedTemplateRoot,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 终端身份、Skill 分发与 UI 合同共用同一初始化边界，相关反例保留在此内聚测试模块。 */
describe("terminal identity, skills and UI governance", () => {
  /** 验证宿主专用 Skill 必须存在于对应终端，另一宿主注入立即失败。 */
  test.each(["web", "extension"] as const)(
    "enforces host-specific skills for %s",
    async (projectType) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const canonicalRules = await readFile(
        path.join(repositoryRoot, "docs/ENGINEERING_RULES.md"),
        "utf8"
      )
      const moduleStructure = canonicalRules
        .split("### 3.2 文件结构与模块依赖\n")[1]
        ?.split("### 3.3 源码可读性与类型化组合")[0]
        ?.trim()
      if (!moduleStructure) throw new Error("Missing canonical module structure contract")
      expect(await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")).toContain(
        `## 文件结构与模块依赖\n\n${moduleStructure}\n`
      )
      const common = [
        "web-compose-capabilities",
        "web-review-api-contract",
        "web-review-module-boundaries",
        "web-implement-access-control",
        "web-implement-write-recovery",
        "web-implement-browser-storage",
        "web-implement-event-stream",
        "web-manage-user-tasks"
      ]
      for (const skill of common) {
        expect(await readFile(path.join(root, ".agents/skills", skill, "SKILL.md"), "utf8")).toBe(
          await readFile(path.join(repositoryRoot, ".agents/skills", skill, "SKILL.md"), "utf8")
        )
        expect(
          await readFile(path.join(root, ".agents/skills", skill, "agents/openai.yaml"), "utf8")
        ).toBe(
          await readFile(
            path.join(repositoryRoot, ".agents/skills", skill, "agents/openai.yaml"),
            "utf8"
          )
        )
      }
      // 验证两宿主均分发完整文档合同和自包含检查器，且缺失资源会阻断。
      for (const resource of [
        "references/export-contract.md",
        "references/protocol-formats.md",
        "scripts/check-export.ts"
      ]) {
        const relative = path.join(".agents/skills/web-document-api", resource)
        const original = await readFile(path.join(repositoryRoot, relative), "utf8")
        expect(await readFile(path.join(root, relative), "utf8")).toBe(original)
        await rm(path.join(root, relative))
        await expect(validateProject(root)).rejects.toThrow(/Missing|missing/)
        await writeFile(path.join(root, relative), original)
      }
      const recoveryFile = path.join(root, ".agents/skills/web-implement-write-recovery/SKILL.md")
      const recoverySource = await readFile(recoveryFile, "utf8")
      await writeFile(recoveryFile, recoverySource.replace("写操作不自动重放", "写操作可自动重放"))
      await expect(validateProject(root)).rejects.toThrow(/missing required workflow/)
      await writeFile(recoveryFile, recoverySource)
      // 验证真实分发后仍拒绝弱化权限恢复、差异身份或 Mock 协议边界。
      const accessContracts: [string, string][] = [
        ["web-compose-capabilities", "知识库与模板库独立索引"],
        ["web-define-product", "源阶段不写 PRD、产品记录、原型或业务代码"],
        ["web-define-product", "创建确认不批准产品范围"],
        ["web-compose-capabilities", "代码装配与测试由 `$web-implement-change` 负责"],
        ["web-implement-access-control", "已识别但无权限的目标"],
        ["web-implement-access-control", "不依赖被拒绝的业务权限"],
        ["web-document-api", "客户端控制参数不属于 wire 字段"],
        ["web-document-api", "HTTP 待确认项"],
        ["web-document-api", "远端列表查询必须使用 GraphQL"],
        ["web-review-api-contract", "远端列表查询必须使用 GraphQL"],
        ["web-connect-http-service", "远端列表查询必须使用 GraphQL"],
        ["web-document-api", "沿真实消费者追踪业务流程"],
        ["web-document-api", "每次导出都核对已有文档与当前代码差异"]
      ]
      if (projectType === "web")
        accessContracts.push(["web-implement-list-view", "远端列表查询必须使用 GraphQL"])
      for (const [skill, fragment] of accessContracts) {
        const file = path.join(root, ".agents/skills", skill, "SKILL.md")
        const source = await readFile(file, "utf8")
        expect(source).toContain(fragment)
        await writeFile(file, source.replaceAll(fragment, "已删除的交接边界"))
        await expect(validateProject(root)).rejects.toThrow(/missing required workflow/)
        await writeFile(file, source)
      }
      // 两宿主只保留新拥有者的 PRD 与分析参考，旧受管副本会阻断终端验证。
      for (const reference of [
        ".agents/skills/web-define-product/references/prd-outline.md",
        ".agents/skills/web-define-product/references/requirements-analysis.md",
        ".agents/skills/web-compose-capabilities/references/requirements-selection.md"
      ]) {
        const file = path.join(root, reference)
        const source = await readFile(file, "utf8")
        await rm(file)
        await expect(validateProject(root)).rejects.toThrow(/Missing|missing/)
        await writeFile(file, source)
      }
      const retiredPrdOutline = path.join(
        root,
        ".agents/skills/web-design-prototype/references/prd-outline.md"
      )
      await mkdir(path.dirname(retiredPrdOutline), { recursive: true })
      await writeFile(retiredPrdOutline, "obsolete PRD contract\n")
      await expect(validateProject(root)).rejects.toThrow(/retired PRD reference/)
      await rm(retiredPrdOutline)
      const composition = canonicalRules
        .split("### 7.2 Skill 职责、复用与渐进披露\n")[1]
        ?.split("## 8. 依赖与安全")[0]
        ?.trim()
      if (!composition) throw new Error("Missing canonical Skill composition contract")
      expect(await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")).toContain(
        `## Skill 职责、复用与渐进披露\n\n${composition}\n`
      )
      const expected =
        projectType === "web" ? ["web-implement-list-view"] : ["web-review-extension-compatibility"]
      const forbidden =
        projectType === "web" ? ["web-review-extension-compatibility"] : ["web-implement-list-view"]
      for (const skill of [...common, ...expected]) {
        const skillRoot = path.join(root, ".agents/skills", skill)
        await rm(skillRoot, { recursive: true })
        await expect(validateProject(root)).rejects.toThrow(/Terminal Skill/)
        await cp(path.join(repositoryRoot, ".agents/skills", skill), skillRoot, {
          recursive: true
        })
      }
      for (const skill of forbidden) {
        const skillRoot = path.join(root, ".agents/skills", skill)
        await cp(path.join(repositoryRoot, ".agents/skills", skill), skillRoot, {
          recursive: true
        })
        await expect(validateProject(root)).rejects.toThrow(/Terminal Skill directories/)
        await rm(skillRoot, { recursive: true })
      }
      await expect(validateProject(root)).resolves.toContain(projectType)
      const agents = await readFile(path.join(root, "AGENTS.md"), "utf8")
      expect(agents).toContain("$web-connect-http-service")
      expect(agents).toContain("初始化只分发项目级 Skills 与中性工程")
      expect(agents).not.toContain("客户端另有通用认证基线")
      expect(agents.split("## Web Harness 前端 Skill 地图")[1]).toContain(
        "$web-compose-capabilities"
      )
      for (const [skill, reference] of [
        ["web-audit-worktrees", "inspection-contract.md"],
        ["web-preview-harness-upgrade", "preview-contract.md"]
      ] as const) {
        expect(agents).toContain("$" + skill)
        expect(
          await readFile(path.join(root, ".agents/skills", skill, "references", reference), "utf8")
        ).toBe(
          await readFile(
            path.join(repositoryRoot, ".agents/skills", skill, "references", reference),
            "utf8"
          )
        )
      }
      for (const skill of [...common, ...expected]) expect(agents).toContain(`$${skill}`)
      for (const skill of forbidden) expect(agents).not.toContain(`$${skill}`)
      for (const resource of [
        "knowledge/identity.md",
        "templates/identity/session.test.ts.txt",
        "templates/compositions/account-workspace/session.ts.txt",
        "templates/compositions/purchase-checkout/commerce-reference.js"
      ]) {
        const file = path.join(root, ".agents/skills/web-compose-capabilities", resource)
        const contents = await readFile(file, "utf8")
        await rm(file)
        await expect(validateProject(root)).rejects.toThrow(/Capability library/)
        await writeFile(file, contents)
      }
    }
  )
  /** 验证 keeps identity schemas exact while accepting only tooling at or above its baseline 场景。 */
  test("keeps identity schemas exact while accepting only tooling at or above its baseline", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const toolingRoot = await seedTemplateRoot()
    await initializeProject(options(toolingRoot, "web"))
    const manifestPath = path.join(toolingRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    manifest.devDependencies.typescript = "6.0.2"
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(toolingRoot)).rejects.toThrow(
      /typescript minimum must not be lower than 6\.0\.3/
    )

    const schemaRoot = await seedTemplateRoot()
    await initializeProject(options(schemaRoot, "web"))
    const configPath = path.join(schemaRoot, ".harness/project.json")
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.schemaVersion = 2
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await expect(validateProject(schemaRoot)).rejects.toThrow(/Unsupported project config schema/)
  })

  /** 验证 rejects repeat initialization without overwriting the project 场景。 */
  test("rejects repeat initialization without overwriting the project", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    const init = options(root, "web")
    await initializeProject(init)
    await expect(initializeProject(init)).rejects.toThrow(/Refusing to overwrite/)
  })

  /** 验证完整基础契约和数据访问文档必须随终端工程保留。 */
  test.each(["docs/API.md", "docs/DATA_ACCESS.md"])(
    "requires foundation documentation %s in terminal projects",
    async (relativePath) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, "web"))
      await rm(path.join(root, relativePath))

      await expect(validateProject(root)).rejects.toThrow("Missing " + relativePath)
    }
  )

  /** 验证 requires the generated Mantine UI guidelines in terminal projects 场景。 */
  test("requires the generated Mantine UI guidelines in terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    await rm(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateProject(root)).rejects.toThrow(/Missing docs\/MANTINE_UI_GUIDELINES\.md/)
  })

  /** 验证终端产品可替换默认版本展示，但不能破坏宿主构建版本注入。 */
  test.each(["web", "extension"] as const)(
    "allows %s product UI to replace the default build-version presentation",
    async (projectType) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      let versionSurfacePath: string

      if (projectType === "web") {
        await rm(path.join(root, "src/features/welcome"), { recursive: true, force: true })
        versionSurfacePath = path.join(root, "src/routes/index.tsx")
        await writeFile(
          versionSurfacePath,
          `import { createFileRoute } from "@tanstack/react-router"
import { BUILD_VERSION } from "../buildVersion"

/** 渲染产品自定义首页并展示注入的构建版本。 */
function ProductHomePage() {
  return <main>Version {BUILD_VERSION}</main>
}

/** 说明 Route 的稳定结构与职责边界。 */
export const Route = createFileRoute("/")({
  component: ProductHomePage
})
`
        )
        for (const relativePath of ["src/i18n/locales/en.ts", "src/i18n/locales/zh.ts"]) {
          const localePath = path.join(root, relativePath)
          const locale = await readFile(localePath, "utf8")
          await writeFile(localePath, locale.replace(/^\s*buildVersion:.*\n/gmu, ""))
        }
      } else {
        const shellPath = path.join(root, "src/ExtensionShell.tsx")
        versionSurfacePath = shellPath
        const shell = await readFile(shellPath, "utf8")
        await writeFile(
          shellPath,
          shell.replace('t("buildVersion", { version: BUILD_VERSION })', "BUILD_VERSION")
        )
        const i18nPath = path.join(root, "src/i18n.ts")
        const i18n = await readFile(i18nPath, "utf8")
        await writeFile(i18nPath, i18n.replace(/^\s*buildVersion:.*\n/gmu, ""))
      }

      await expect(validateProject(root)).resolves.toContain(projectType)

      const versionSurface = await readFile(versionSurfacePath, "utf8")
      await writeFile(versionSurfacePath, versionSurface.replace("{BUILD_VERSION}", "Product"))
      await expect(validateProject(root)).rejects.toThrow(
        new RegExp(`${projectType === "web" ? "Web" : "Extension"} production TSX surface`)
      )
      await writeFile(versionSurfacePath, versionSurface)

      const buildVersionPath = path.join(root, "src/buildVersion.ts")
      await writeFile(buildVersionPath, 'export const BUILD_VERSION = "custom"\n')
      await expect(validateProject(root)).rejects.toThrow(
        projectType === "web" ? /Vite build injection/ : /Plasmo build injection/
      )
    }
  )

  /** 验证 rejects a missing Chinese declaration comment in a generated %s project 场景。 */
  test.each(["web", "extension"] as const)(
    "rejects a missing Chinese declaration comment in a generated %s project",
    async (projectType) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const governedPath = path.join(
        root,
        projectType === "web" ? "src/features/welcome/WelcomePage.tsx" : "src/ExtensionShell.tsx"
      )
      const governedSource = await readFile(governedPath, "utf8")
      const withoutComment = governedSource.replace(
        /\/\*\*[^*]*\*\/\nexport function (WelcomePage|ExtensionShell)/u,
        "export function $1"
      )
      expect(withoutComment).not.toBe(governedSource)
      await writeFile(governedPath, withoutComment)

      await expect(validateProject(root)).rejects.toThrow(/声明必须具有紧邻且包含汉字的业务注释/)
    }
  )

  /** 验证 rejects terminal Skill directory and Chinese metadata drift 场景。 */
  test("rejects terminal Skill directory and Chinese metadata drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const verifySkillRoot = path.join(root, ".agents/skills/web-verify-delivery")
    await rm(verifySkillRoot, { recursive: true, force: true })
    await expect(validateProject(root)).rejects.toThrow(/Terminal Skill directories must exactly/)

    await cp(path.join(repositoryRoot, ".agents/skills/web-verify-delivery"), verifySkillRoot, {
      recursive: true
    })
    const metadataPath = path.join(verifySkillRoot, "agents/openai.yaml")
    const metadata = await readFile(metadataPath, "utf8")
    await writeFile(
      metadataPath,
      metadata.replace("Web Harness：验证前端交付", "Rust Server：验证交付")
    )
    await expect(validateProject(root)).rejects.toThrow(/Rust\/Server language/)

    await writeFile(metadataPath, metadata)
    const skillPath = path.join(verifySkillRoot, "SKILL.md")
    const skill = await readFile(skillPath, "utf8")
    await writeFile(skillPath, skill.replaceAll("\n", "\r\n"))
    await writeFile(metadataPath, metadata.replaceAll("\n", "\r\n"))
    await expect(validateProject(root)).resolves.toContain("web")

    await writeFile(metadataPath, metadata)
    await writeFile(
      skillPath,
      skill.replace(
        "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
        "smoke 关闭时忽略策略"
      )
    )
    await expect(validateProject(root)).rejects.toThrow(
      /Terminal Skill web-verify-delivery is missing required workflow/
    )
  })

  /** 验证 rejects every source-only path finalized out of terminal projects 场景。 */
  test("rejects every source-only path finalized out of terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const sourceOnlyPaths = HARNESS_ONLY_PATHS

    for (const relativePath of sourceOnlyPaths) {
      const sourceOnlyPath = path.join(root, relativePath)
      await mkdir(path.dirname(sourceOnlyPath), { recursive: true })
      await writeFile(sourceOnlyPath, "source Harness residue\n")

      await expect(validateProject(root)).rejects.toThrow(
        `Terminal project retains ${relativePath}`
      )
      await rm(sourceOnlyPath, { recursive: true, force: true })
    }
  })

  /** 验证终端项目可在独立事件后创建受命名和索引约束的记忆。 */
  test("allows governed project memory after terminal initialization", async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const workPlanRoot = path.join(root, "docs/work_plan")
    await mkdir(workPlanRoot, { recursive: true })
    await writeFile(
      path.join(workPlanRoot, "README.md"),
      "# 工作计划索引\n\n- [当前计划](20260909_work_plan.md)\n"
    )
    await writeFile(path.join(workPlanRoot, "20260909_work_plan.md"), "# 当前计划\n")
    await expect(validateProject(root)).resolves.toContain("web")

    await writeFile(path.join(workPlanRoot, "20260909_scope_work_plan.md"), "# 非法计划\n")
    await expect(validateProject(root)).rejects.toThrow(
      /Invalid optional Work Plan entry: docs\/work_plan\/20260909_scope_work_plan\.md/u
    )
  })

  /** 验证 rejects drift from the shared pagination contract 场景。 */
  test("rejects drift from the shared pagination contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replaceAll('getWebStorage("session")', 'getWebStorage("local")')
    )

    await expect(validateProject(root)).rejects.toThrow(/Pagination contract is missing/)
  })

  /** 验证 requires every shared pagination file in Web projects 场景。 */
  test("requires every shared pagination file in Web projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "src/pagination/useSessionPagination.ts"))

    await expect(validateProject(root)).rejects.toThrow(
      /Missing src\/pagination\/useSessionPagination\.ts/
    )
  })

  /** 验证 rejects a pagination empty-page reconciliation drift 场景。 */
  test("rejects a pagination empty-page reconciliation drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replace("result.items.length === 0", "result.items.length > 0")
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination contract is missing result\.items\.length === 0/
    )
  })

  /** 验证 rejects a missing pagination translation 场景。 */
  test("rejects a missing pagination translation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const localePath = path.join(root, "src/i18n/locales/en.ts")
    const locale = await readFile(localePath, "utf8")
    await writeFile(
      localePath,
      locale.replace('paginationNext: "Next page",', 'paginationForward: "Next page",')
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination translations are missing paginationNext/
    )
  })

  /** 验证 rejects drift from the shared HTTP authentication contract 场景。 */
  test("rejects drift from the shared HTTP authentication contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    const clientPath = path.join(root, "src/data/api/client/httpContracts.ts")
    const client = await readFile(clientPath, "utf8")
    await writeFile(clientPath, client.replace('authToken: "X-AUTH-TOKEN"', 'authToken: "X-Token"'))

    await expect(validateProject(root)).rejects.toThrow(/HTTP client contract is missing/)
  })

  /** 验证 rejects drift from the Web file-route and code-splitting contract 场景。 */
  test("rejects drift from the Web file-route and code-splitting contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const missingPluginRoot = await seedTemplateRoot()
    await initializeProject(options(missingPluginRoot, "web"))
    const manifestPath = path.join(missingPluginRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    delete manifest.devDependencies["@tanstack/router-plugin"]
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(missingPluginRoot)).rejects.toThrow(
      /missing @tanstack\/router-plugin/
    )

    const disabledSplittingRoot = await seedTemplateRoot()
    await initializeProject(options(disabledSplittingRoot, "web"))
    const viteConfigPath = path.join(disabledSplittingRoot, "vite.config.ts")
    const viteConfig = await readFile(viteConfigPath, "utf8")
    await writeFile(
      viteConfigPath,
      viteConfig.replace("autoCodeSplitting: true", "autoCodeSplitting: false")
    )
    await expect(validateProject(disabledSplittingRoot)).rejects.toThrow(/autoCodeSplitting/)
  })

  /** 验证 refreshes generated branding deterministically from edited identity 场景。 */
  test("refreshes generated branding deterministically from edited identity", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const configPath = path.join(root, ".harness/project.json")
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.name = "Renamed Aurora"
    config.id = "renamed-aurora"
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

    await refreshBrand(root)
    const first = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    await refreshBrand(root)
    const second = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    const paginationTest = await readFile(
      path.join(root, "src/pagination/pagination.test.tsx"),
      "utf8"
    )
    expect(first.equals(second)).toBe(true)
    expect(await readFile(path.join(root, "index.html"), "utf8")).toContain("Renamed Aurora")
    expect(paginationTest).toContain('import { BRAND } from "../brand"')
    expect(paginationTest).toContain('BRAND.id + ":pagination:v1:orders"')
    expect(paginationTest).not.toContain("aurora-notes:pagination:v1")
  })
})
