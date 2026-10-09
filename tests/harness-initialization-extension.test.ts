import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { describe, test } from "vitest"
import {
  PAGINATION_I18N_KEYS,
  TEST_BASE_URLS,
  expect,
  expectOptionalIntegrationPackagesNotInstalled,
  format,
  initializeProject,
  mkdir,
  options,
  path,
  readFile,
  readdir,
  resolveConfig,
  seedTemplateRoot,
  sharp,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 验证 terminal dual-browser Extension initialization 的完整回归场景。 */
describe("terminal dual-browser Extension initialization", () => {
  /** 验证 creates a terminal dual-browser extension with local Router and no unused permissions 场景。 */
  test("creates a terminal dual-browser extension with local Router and no unused permissions", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))

    // 保存 icon 变量供当前逻辑使用。
    const icon = await sharp(path.join(root, "assets/icon.png")).metadata()
    expect([icon.width, icon.height]).toEqual([1024, 1024])
    // 保存 popup 变量供当前逻辑使用。
    const popup = await readFile(path.join(root, "src/popup.tsx"), "utf8")
    // 保存 optionsEntry 变量供独立入口路由断言使用。
    const optionsEntry = await readFile(path.join(root, "src/options.tsx"), "utf8")
    // 保存 extensionRouter 变量供路由历史策略断言使用。
    const extensionRouter = await readFile(path.join(root, "src/extension-router.tsx"), "utf8")
    // 保存 extensionBrand 变量供当前逻辑使用。
    const extensionBrand = await readFile(path.join(root, "src/brand.ts"), "utf8")
    // 保存 i18n 变量供当前逻辑使用。
    const i18n = await readFile(path.join(root, "src/i18n.ts"), "utf8")
    // 保存 language 变量供当前逻辑使用。
    const language = await readFile(path.join(root, "src/i18n/language.ts"), "utf8")
    // 保存 httpClient 变量供当前逻辑使用。
    const httpClient = await readFile(path.join(root, "src/api/client/httpClient.ts"), "utf8")
    const httpContracts = await readFile(path.join(root, "src/api/client/httpContracts.ts"), "utf8")
    // 保存 dataAccess 变量供当前逻辑使用。
    const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
    // 保存 engineeringRules 变量供当前逻辑使用。
    const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
    // 保存 releaseRules 变量供 Extension 版本事实断言使用。
    const releaseRules = await readFile(path.join(root, "docs/RELEASE.md"), "utf8")
    // 保存 mantineUiGuidelines 变量供当前逻辑使用。
    const mantineUiGuidelines = await readFile(
      path.join(root, "docs/MANTINE_UI_GUIDELINES.md"),
      "utf8"
    )
    // 保存 developmentEnvironment 变量供当前逻辑使用。
    const developmentEnvironment = await readFile(path.join(root, ".env.development"), "utf8")
    // 保存 releaseEnvironment 变量供当前逻辑使用。
    const releaseEnvironment = await readFile(path.join(root, ".env.production"), "utf8")
    // 保存 extensionShell 变量供当前逻辑使用。
    const extensionShell = await readFile(path.join(root, "src/ExtensionShell.tsx"), "utf8")
    // 保存 buildVersion 变量供 Extension 构建版本契约断言使用。
    const buildVersion = await readFile(path.join(root, "src/buildVersion.ts"), "utf8")
    // 保存 buildTooling 变量供 Extension 单宿主构建断言使用。
    const buildTooling = await readFile(path.join(root, ".harness/tooling/build.ts"), "utf8")
    // 保存 providers 变量供当前逻辑使用。
    const providers = await readFile(path.join(root, "src/providers.tsx"), "utf8")
    // 保存 extensionColorSchemeControl 变量供暗色切换断言使用。
    const extensionColorSchemeControl = await readFile(
      path.join(root, "src/theme/ColorSchemeControl.tsx"),
      "utf8"
    )
    // 保存 logger 变量供当前逻辑使用。
    const logger = await readFile(path.join(root, "src/observability/logger.ts"), "utf8")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(
      path.join(root, "src/pagination/useSessionPagination.ts"),
      "utf8"
    )
    // 保存 paginationControls 变量供当前逻辑使用。
    const paginationControls = await readFile(
      path.join(root, "src/pagination/PaginationControls.tsx"),
      "utf8"
    )
    // 保存 tsconfig 变量供当前逻辑使用。
    const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8")) as {
      include: string[]
    }
    // 保存 extensionStylePath 变量供初始化 CSS 格式稳定性回归使用。
    const extensionStylePath = path.join(root, "src/style.css")
    // 保存 extensionStyle 变量供初始化 CSS 格式稳定性比较使用。
    const extensionStyle = await readFile(extensionStylePath, "utf8")
    // 保存 prettierConfig 变量供初始化 CSS 使用目标仓库正式格式配置。
    const prettierConfig = (await resolveConfig(path.join(root, "package.json"))) ?? {}
    expect(popup).toContain("data-base64:../assets/icon.png")
    expect(popup).toContain('createExtensionRouter("popup", iconUrl)')
    expect(popup).toContain("<RouterProvider router={router} />")
    expect(optionsEntry).toContain('createExtensionRouter("options", iconUrl)')
    expect(extensionRouter).toContain("createMemoryHistory")
    expect(extensionRouter).toContain("createHashHistory")
    expect(extensionBrand).toContain("Aurora Clipper")
    expect(i18n).toContain("initializeLanguage")
    // 保存 key 变量供当前逻辑使用。
    for (const key of PAGINATION_I18N_KEYS) {
      expect(i18n.split(`${key}:`)).toHaveLength(3)
    }
    expect(language).toContain("localStorage")
    expect(language).toContain("document.documentElement")
    expect(httpContracts).toContain('"X-Http-Request"')
    expect(httpContracts).toContain('"X-Lang"')
    expect(httpContracts).toContain('"X-AUTH-TOKEN"')
    expect(httpClient).toContain("unauthorizedHandler")
    expect(httpClient).toContain("createLoginUnauthorizedHandler")
    expect(dataAccess).toContain("`host_permissions`")
    expect(dataAccess).toContain("service worker")
    expect(dataAccess).toContain("`eventsource-client`")
    expect(dataAccess).toContain("`@graphql-codegen/client-preset`")
    expect(dataAccess).toContain("RxJS（按需）")
    expect(dataAccess).toContain("`chrome.runtime`/tabs messaging 或 Port")
    expect(dataAccess).toContain("不能让 service worker 常驻")
    expect(dataAccess).toContain("### 2.6 Query 重试、mutation 与缓存生命周期")
    expect(dataAccess).toContain("requestHttpQuery")
    expect(dataAccess).not.toContain("React Web 路由列表契约")
    expect(dataAccess).not.toContain("$web-implement-list-view")
    expect(engineeringRules).toContain("执行 Agent 在每次开发中自行核对并保证两目标")
    expect(engineeringRules).toContain("最终 manifest 由 Plasmo 动态生成")
    expect(releaseRules).toContain("Chrome MV3 / Firefox MV2")
    expect(engineeringRules).toContain("RxJS 只能编排当前执行上下文内的事件")
    expect(engineeringRules).not.toContain("src/routeTree.gen.ts")
    expect(engineeringRules).toContain("docs/MANTINE_UI_GUIDELINES.md")
    expect(mantineUiGuidelines).toContain("## 3. Theme 与设计令牌")
    expect(mantineUiGuidelines).not.toContain("React Web 重复记录视图")
    expect(mantineUiGuidelines).toContain("## 8. Extension 宿主规范")
    expect(mantineUiGuidelines).not.toContain("## 8. Web 宿主规范")
    expect(mantineUiGuidelines).toContain("基线最小宽 `320px`")
    expect(mantineUiGuidelines).not.toContain("Landing")
    expect(mantineUiGuidelines).not.toContain("404")
    expect(mantineUiGuidelines).not.toContain("src/app/theme.ts")
    expect(mantineUiGuidelines).toContain("TanStack Router")
    expect(developmentEnvironment).toContain("PLASMO_PUBLIC_APP_ENV=development")
    expect(developmentEnvironment).toContain(
      `PLASMO_PUBLIC_API_BASE_URL=${TEST_BASE_URLS.developmentBaseUrl}`
    )
    expect(releaseEnvironment).toContain("PLASMO_PUBLIC_APP_ENV=release")
    expect(await readFile(path.join(root, "src/config/environment.ts"), "utf8")).toContain(
      "process.env.PLASMO_PUBLIC_API_BASE_URL"
    )
    expect(extensionShell).toContain('logger.error("unhandled_rejection"')
    expect(extensionShell).toContain('process.env.PLASMO_PUBLIC_APP_ENV !== "release"')
    expect(extensionShell).toContain("BUILD_VERSION")
    expect(extensionShell).toContain("useState(0)")
    expect(extensionShell).toContain("<Title order={1}>")
    expect(extensionShell).toContain('role="status"')
    expect(extensionShell).not.toContain("useQuery")
    expect(extensionShell).not.toContain("useAtom")
    expect(extensionShell).not.toContain("queryFn: async () => BRAND")
    await expect(readFile(path.join(root, "src/state.ts"), "utf8")).rejects.toThrow()
    expect(i18n).toContain('buildVersion: "Build version: {{version}}"')
    expect(i18n).toContain('buildVersion: "构建版本：{{version}}"')
    expect(buildVersion).toContain("process.env.PLASMO_PUBLIC_BUILD_VERSION")
    expect(buildTooling).toContain("PLASMO_PUBLIC_BUILD_VERSION")
    expect(buildTooling).toContain("readExtensionBuildVersion")
    expect(buildTooling).toContain("stable SemVer X.Y.Z")
    expect(buildTooling).not.toContain("Asia/Shanghai")
    expect(releaseRules).toContain("`package.json.version` 的稳定 SemVer")
    expect(buildTooling).not.toContain("VITE_BUILD_VERSION")
    expect(buildTooling).toContain('args: ["test"]')
    expect(buildTooling).toContain("本次构建完成后是否启用 E2E 测试")
    expect(providers).toContain('logger.error("mutation_failed"')
    expect(providers).toContain('defaultColorScheme="auto"')
    expect(providers).toContain('key: BRAND.id + ":color-scheme:v1"')
    expect(providers).toContain("luminanceThreshold: BRAND_TEXT_LUMINANCE_THRESHOLD")
    expect(providers).toContain("fontFamily")
    expect(providers).not.toContain("JotaiProvider")
    expect(extensionColorSchemeControl).toContain('value: "dark"')
    expect(extensionColorSchemeControl).toContain("<NativeSelect")
    expect(extensionShell).toContain('<ColorSchemeControl compact={surface === "popup"} />')
    expect(logger).toContain(
      'const RELEASE_BUILD = process.env.PLASMO_PUBLIC_APP_ENV === "release"'
    )
    expect(logger).not.toContain("import.meta.env.VITE_APP_ENV")
    expect(pagination).toContain("sessionStorage")
    expect(pagination).toContain("BRAND.id")
    expect(pagination).not.toContain("chrome.storage")
    expect(paginationControls).toContain("onPageSizeChange")
    expect(tsconfig.include[0]).toBe(".plasmo/index.d.ts")
    expect(await format(extensionStyle, { ...prettierConfig, filepath: extensionStylePath })).toBe(
      extensionStyle
    )
    expect(extensionStyle).toContain('data-mantine-color-scheme="dark"')
    expect(extensionStyle).toContain("color-scheme: dark")
    expect(extensionStyle).toContain("var(--mantine-color-body)")
    expect(extensionStyle).toContain("min-width: 320px")
    expect(extensionStyle).toContain("width: min(380px, 100%)")
    expect(extensionStyle).toContain("overflow-wrap: anywhere")
    expect(extensionStyle).toContain("var(--mantine-spacing-md)")
    expect(extensionStyle).not.toContain("font-family")

    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      displayName: string
      manifest: Record<string, unknown>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
      "@parcel/resolver-default": { packageExports: boolean }
    }
    expect(manifest.manifest).not.toHaveProperty("manifest_version")
    expect(manifest.scripts["dev:firefox"]).toBe(
      "plasmo dev --target=firefox-mv2 --env=.env.development"
    )
    // 实际加载终端生成器，避免只用源码字符串证明双目标编排。
    const generatedPlans = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import { createBuildCommandPlan } from ${JSON.stringify(pathToFileURL(path.join(root, ".harness/tooling/build.ts")).href)};
      console.log(JSON.stringify([createBuildCommandPlan("build", "0.1.0"), createBuildCommandPlan("package", "0.1.0")]));`
        ],
        { cwd: root, encoding: "utf8" }
      )
    ) as Array<Array<{ args: string[] }>>
    for (const [index, plan] of generatedPlans.entries()) {
      expect(plan).toHaveLength(9)
      expect(plan[6]?.args).toContain("--target=chrome-mv3")
      expect(plan[7]?.args).toContain("--target=firefox-mv2")
      expect(plan[8]?.args).toEqual(["release:inspect"])
      expect(plan.filter((command) => command.args[0] === "test")).toHaveLength(1)
      expect(plan[6]?.args.includes("--zip")).toBe(index === 1)
      expect(plan[7]?.args.includes("--zip")).toBe(index === 1)
    }
    expect(manifest.displayName).toBe("Aurora Clipper")
    expect(manifest.manifest.description).toBe("__MSG_projectDescription__")
    expect(manifest.manifest).not.toHaveProperty("permissions")
    expect(manifest.manifest).not.toHaveProperty("host_permissions")
    expect(manifest.dependencies).toHaveProperty("@mantine/core", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@mantine/hooks", "9.6.3")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-query", "5.104.0")
    expect(manifest.dependencies).toHaveProperty("ky", "2.1.0")
    expect(manifest.devDependencies).not.toHaveProperty("ky")
    expect(manifest.dependencies).toHaveProperty("@tanstack/react-router")
    expect(manifest["@parcel/resolver-default"]).toEqual({ packageExports: true })
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-cli")
    expect(manifest.devDependencies).not.toHaveProperty("@tanstack/router-plugin")
    expect(manifest).not.toHaveProperty("scripts.routes:generate")
    // 保存 extensionInstalledPackages 变量供 Extension 不继承列表页条件依赖。
    const extensionInstalledPackages = { ...manifest.dependencies, ...manifest.devDependencies }
    expect(extensionInstalledPackages).not.toHaveProperty("@dnd-kit/core")
    expect(extensionInstalledPackages).not.toHaveProperty("@dnd-kit/sortable")
    expect(extensionInstalledPackages).not.toHaveProperty("@tabler/icons-react")
    expectOptionalIntegrationPackagesNotInstalled(manifest)
    expect(manifest.devDependencies.plasmo).toBe("0.90.5")
    expect(manifest.scripts).not.toHaveProperty("build:development")
    expect(manifest.scripts).not.toHaveProperty("build:test")
    expect(manifest.scripts["test:related"]).toBe("vitest related --run")
    expect(manifest.scripts["build:release"]).toBe("tsx .harness/tooling/build.ts build")
    expect(manifest.scripts.package).toBe("tsx .harness/tooling/build.ts package")
    expect(Object.values(manifest.scripts).join("\n")).not.toContain("env:validate -- --profile")
    // 保存 extensionSkills 变量供终端 Skill 集合与 Web-only Skill 裁剪回归使用。
    const extensionSkills = (
      await readdir(path.join(root, ".agents/skills"), {
        withFileTypes: true
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(extensionSkills).toHaveLength(16)
    expect(extensionSkills).toContain("design-taste-frontend")
    expect(extensionSkills).toContain("web-design-prototype")
    expect(extensionSkills).not.toContain("web-implement-list-view")
    await expect(
      readFile(path.join(root, ".agents/skills/web-implement-list-view/SKILL.md"), "utf8")
    ).rejects.toThrow()
    await expect(readFile(path.join(root, "index.html"), "utf8")).rejects.toThrow()
    // 旧构建的版本不能阻断新 SemVer 的预构建校验；产物一致性留给 release:inspect。
    const buildRoot = path.join(root, "build/chrome-mv3-prod")
    await mkdir(buildRoot, { recursive: true })
    await writeFile(path.join(buildRoot, "popup.html"), "<main>Popup</main>\n")
    await writeFile(path.join(buildRoot, "options.html"), "<main>Options</main>\n")
    await writeFile(
      path.join(buildRoot, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "__MSG_projectName__",
        description: "__MSG_projectDescription__",
        default_locale: "en",
        version: "0.0.1",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })
    )
    for (const locale of ["en", "zh_CN"]) {
      await mkdir(path.join(buildRoot, "_locales", locale), { recursive: true })
      await writeFile(
        path.join(buildRoot, "_locales", locale, "messages.json"),
        await readFile(path.join(root, "locales", locale, "messages.json"))
      )
    }
    await expect(validateProject(root)).resolves.toContain("extension")
    // 删除 Parcel 浏览器条件导出时，Harness 必须在构建前阻断。
    const invalidManifest = { ...manifest, "@parcel/resolver-default": { packageExports: false } }
    await writeFile(path.join(root, "package.json"), JSON.stringify(invalidManifest))
    await expect(validateProject(root)).rejects.toThrow(
      "Extension Parcel resolver must enable packageExports"
    )
    await writeFile(path.join(root, "package.json"), JSON.stringify(manifest))
    await writeFile(
      path.join(root, "src/options.tsx"),
      optionsEntry.replaceAll("RouterProvider", "NoRoute")
    )
    await expect(validateProject(root)).rejects.toThrow(
      "Extension options entry must mount its own TanStack Router"
    )
  })
})
