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

/** 验证 terminal identity, skills and UI governance 的完整回归场景。 */
describe("terminal identity, skills and UI governance", () => {
  /** 验证宿主专用 Skill 必须存在于对应终端，另一宿主注入立即失败。 */
  test.each(["web", "extension"] as const)(
    "enforces host-specific skills for %s",
    async (projectType) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const expected =
        projectType === "web" ? "web-implement-list-view" : "web-review-extension-compatibility"
      const forbidden =
        projectType === "web" ? "web-review-extension-compatibility" : "web-implement-list-view"
      const expectedRoot = path.join(root, ".agents/skills", expected)
      await rm(expectedRoot, { recursive: true })
      await expect(validateProject(root)).rejects.toThrow(/Terminal Skill/)
      await cp(path.join(repositoryRoot, ".agents/skills", expected), expectedRoot, {
        recursive: true
      })
      const forbiddenRoot = path.join(root, ".agents/skills", forbidden)
      await cp(path.join(repositoryRoot, ".agents/skills", forbidden), forbiddenRoot, {
        recursive: true
      })
      await expect(validateProject(root)).rejects.toThrow(/Terminal Skill directories/)
      await rm(forbiddenRoot, { recursive: true })
      await expect(validateProject(root)).resolves.toContain(projectType)
      const agents = await readFile(path.join(root, "AGENTS.md"), "utf8")
      expect(agents).toContain("$web-connect-http-service")
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
      expect(agents).toContain(`$${expected}`)
      expect(agents).not.toContain(`$${forbidden}`)
    }
  )
  /** 验证 keeps identity schemas exact while accepting only tooling at or above its baseline 场景。 */
  test("keeps identity schemas exact while accepting only tooling at or above its baseline", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 toolingRoot 变量供当前逻辑使用。
    const toolingRoot = await seedTemplateRoot()
    await initializeProject(options(toolingRoot, "web"))
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(toolingRoot, "package.json")
    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    manifest.devDependencies.typescript = "6.0.2"
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(toolingRoot)).rejects.toThrow(
      /typescript minimum must not be lower than 6\.0\.3/
    )

    // 保存 schemaRoot 变量供当前逻辑使用。
    const schemaRoot = await seedTemplateRoot()
    await initializeProject(options(schemaRoot, "web"))
    // 保存 configPath 变量供当前逻辑使用。
    const configPath = path.join(schemaRoot, ".harness/project.json")
    // 保存 config 变量供当前逻辑使用。
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.schemaVersion = 2
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await expect(validateProject(schemaRoot)).rejects.toThrow(/Unsupported project config schema/)
  })

  /** 验证 rejects repeat initialization without overwriting the project 场景。 */
  test("rejects repeat initialization without overwriting the project", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    // 保存 init 变量供当前逻辑使用。
    const init = options(root, "web")
    await initializeProject(init)
    await expect(initializeProject(init)).rejects.toThrow(/Refusing to overwrite/)
  })

  /** 验证完整基础契约和数据访问文档必须随终端工程保留。 */
  test.each(["docs/API.md", "docs/DATA_ACCESS.md"])(
    "requires foundation documentation %s in terminal projects",
    async (relativePath) => {
      // 保存 root 变量供当前逻辑使用。
      const root = await seedTemplateRoot()
      await initializeProject(options(root, "web"))
      await rm(path.join(root, relativePath))

      await expect(validateProject(root)).rejects.toThrow("Missing " + relativePath)
    }
  )

  /** 验证 requires the generated Mantine UI guidelines in terminal projects 场景。 */
  test("requires the generated Mantine UI guidelines in terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
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
      // 保存 versionSurfacePath 变量供验证自定义展示与完全移除展示两种边界使用。
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

      // 保存 versionSurface 变量供证明完全移除 UI 消费会失败使用。
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
    /* 执行 当前声明 函数的处理逻辑。 */ async (projectType) => {
      // 保存 root 变量供当前逻辑使用。
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      // 保存 governedPath 变量供当前宿主的导出组件注释篡改使用。
      const governedPath = path.join(
        root,
        projectType === "web" ? "src/features/welcome/WelcomePage.tsx" : "src/ExtensionShell.tsx"
      )
      // 保存 governedSource 变量供移除真正受管的结构声明注释使用。
      const governedSource = await readFile(governedPath, "utf8")
      // 保存 withoutComment 变量供当前逻辑使用。
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
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 verifySkillRoot 变量供当前逻辑使用。
    const verifySkillRoot = path.join(root, ".agents/skills/web-verify-delivery")
    await rm(verifySkillRoot, { recursive: true, force: true })
    await expect(validateProject(root)).rejects.toThrow(/Terminal Skill directories must exactly/)

    await cp(path.join(repositoryRoot, ".agents/skills/web-verify-delivery"), verifySkillRoot, {
      recursive: true
    })
    // 保存 metadataPath 变量供当前逻辑使用。
    const metadataPath = path.join(verifySkillRoot, "agents/openai.yaml")
    // 保存 metadata 变量供当前逻辑使用。
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
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 sourceOnlyPaths 变量供当前逻辑使用。
    const sourceOnlyPaths = HARNESS_ONLY_PATHS

    // 保存 relativePath 变量供当前逻辑使用。
    for (const relativePath of sourceOnlyPaths) {
      // 保存 sourceOnlyPath 变量供当前逻辑使用。
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
    // 保存 root 变量供终端可选记忆正反例使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 workPlanRoot 变量供创建合法索引与正文使用。
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
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 paginationPath 变量供当前逻辑使用。
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replaceAll('getWebStorage("session")', 'getWebStorage("local")')
    )

    await expect(validateProject(root)).rejects.toThrow(/Pagination contract is missing/)
  })

  /** 验证 requires every shared pagination file in Web projects 场景。 */
  test("requires every shared pagination file in Web projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "src/pagination/useSessionPagination.ts"))

    await expect(validateProject(root)).rejects.toThrow(
      /Missing src\/pagination\/useSessionPagination\.ts/
    )
  })

  /** 验证 rejects a pagination empty-page reconciliation drift 场景。 */
  test("rejects a pagination empty-page reconciliation drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    // 保存 paginationPath 变量供当前逻辑使用。
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    // 保存 pagination 变量供当前逻辑使用。
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
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 localePath 变量供当前逻辑使用。
    const localePath = path.join(root, "src/i18n/locales/en.ts")
    // 保存 locale 变量供当前逻辑使用。
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
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    // 保存 clientPath 变量供当前逻辑使用。
    const clientPath = path.join(root, "src/data/api/client/httpContracts.ts")
    // 保存 client 变量供当前逻辑使用。
    const client = await readFile(clientPath, "utf8")
    await writeFile(clientPath, client.replace('authToken: "X-AUTH-TOKEN"', 'authToken: "X-Token"'))

    await expect(validateProject(root)).rejects.toThrow(/HTTP client contract is missing/)
  })

  /** 验证 rejects drift from the Web file-route and code-splitting contract 场景。 */
  test("rejects drift from the Web file-route and code-splitting contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 missingPluginRoot 变量供当前逻辑使用。
    const missingPluginRoot = await seedTemplateRoot()
    await initializeProject(options(missingPluginRoot, "web"))
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(missingPluginRoot, "package.json")
    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    delete manifest.devDependencies["@tanstack/router-plugin"]
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(missingPluginRoot)).rejects.toThrow(
      /missing @tanstack\/router-plugin/
    )

    // 保存 disabledSplittingRoot 变量供当前逻辑使用。
    const disabledSplittingRoot = await seedTemplateRoot()
    await initializeProject(options(disabledSplittingRoot, "web"))
    // 保存 viteConfigPath 变量供当前逻辑使用。
    const viteConfigPath = path.join(disabledSplittingRoot, "vite.config.ts")
    // 保存 viteConfig 变量供当前逻辑使用。
    const viteConfig = await readFile(viteConfigPath, "utf8")
    await writeFile(
      viteConfigPath,
      viteConfig.replace("autoCodeSplitting: true", "autoCodeSplitting: false")
    )
    await expect(validateProject(disabledSplittingRoot)).rejects.toThrow(/autoCodeSplitting/)
  })

  /** 验证 refreshes generated branding deterministically from edited identity 场景。 */
  test("refreshes generated branding deterministically from edited identity", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 configPath 变量供当前逻辑使用。
    const configPath = path.join(root, ".harness/project.json")
    // 保存 config 变量供当前逻辑使用。
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.name = "Renamed Aurora"
    config.id = "renamed-aurora"
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

    await refreshBrand(root)
    // 保存 first 变量供当前逻辑使用。
    const first = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    await refreshBrand(root)
    // 保存 second 变量供当前逻辑使用。
    const second = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    // 保存 paginationTest 变量供当前逻辑使用。
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
