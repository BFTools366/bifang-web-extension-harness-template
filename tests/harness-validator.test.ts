import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { validateHarness } from "../scripts/validate-harness.ts"
import {
  governedMarkdownFiles,
  normalizeRepositoryRelativePath,
  parseFrontmatter,
  parseOpenAiMetadata,
  validateRepositoryPaths
} from "../scripts/harness-validation/repository.ts"
import { repositoryRoot, copyRepository, updateManifest } from "./harness-validator-fixture.ts"

/** 验证 Harness template validator 的完整回归场景。 */
describe("Harness template validator", () => {
  /** 验证 accepts the complete clean template contract 场景。 */
  test("accepts the complete clean template contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 report 变量供当前逻辑使用。
    const report = await validateHarness(repositoryRoot)
    expect(report.skills).toHaveLength(17)
    expect(report.skills).toContain("web-implement-list-view")
    // 保存 verifyDelivery 变量供当前逻辑使用。
    const verifyDelivery = await readFile(
      path.join(repositoryRoot, ".agents/skills/web-verify-delivery/SKILL.md"),
      "utf8"
    )
    // 保存 verifyDeliveryMetadata 变量供当前逻辑使用。
    const verifyDeliveryMetadata = await readFile(
      path.join(repositoryRoot, ".agents/skills/web-verify-delivery/agents/openai.yaml"),
      "utf8"
    )
    expect(verifyDelivery).toContain("# Web Harness：验证前端交付")
    expect(verifyDelivery).toContain("Extension 候选另以当次选择运行 `pnpm package")
    expect(verifyDelivery).toContain("生成同一 Release profile 的受验收 zip")
    expect(verifyDeliveryMetadata).toContain('display_name: "Web Harness：验证前端交付"')
  })

  /** 验证 Windows checkout 的路径分隔符与 CRLF 不改变治理语义。 */
  test("normalizes Windows paths and CRLF governance files", () => {
    const windowsFiles = ["docs\\README.md", ".agents\\skills\\x\\SKILL.md"].map((file) =>
      normalizeRepositoryRelativePath(file, "\\")
    )
    expect(governedMarkdownFiles(windowsFiles)).toEqual([
      "docs/README.md",
      ".agents/skills/x/SKILL.md"
    ])
    expect(normalizeRepositoryRelativePath("docs\\README.md", "/")).toBe("docs\\README.md")
    const pathErrors: string[] = []
    validateRepositoryPaths(["docs\\README.md"], pathErrors)
    expect(pathErrors).toEqual(["Repository path must not contain backslash: docs\\README.md"])
    expect(
      parseFrontmatter("---\r\nname: example\r\ndescription: 示例\r\n---\r\n# 标题\r\n")
    ).toEqual({ name: "example", description: "示例" })
    expect(
      parseOpenAiMetadata(
        'interface:\r\n  display_name: "Web Harness：示例"\r\n  short_description: "这是一个足够长度的中文示例短描述用于验证换行兼容"\r\n  default_prompt: "使用 $web-example 执行示例。"\r\n'
      )
    ).toEqual({
      displayName: "Web Harness：示例",
      shortDescription: "这是一个足够长度的中文示例短描述用于验证换行兼容",
      defaultPrompt: "使用 $web-example 执行示例。"
    })
  })

  /** 验证 POSIX 合法但跨平台有歧义的反斜杠文件名不能逃逸治理。 */
  test("rejects ambiguous backslash repository paths on POSIX", async () => {
    if (path.sep !== "/") return
    const root = await copyRepository()
    await writeFile(path.join(root, "docs\\rogue.md"), "# Rogue\n")
    await expect(validateHarness(root)).rejects.toThrow(
      /Repository path must not contain backslash: docs\\rogue\.md/
    )
  })

  /** 验证 Version.md 的日历、时区、格式与状态都是精确事实。 */
  test("rejects invalid Harness version facts", async () => {
    for (const [from, to, message] of [
      [/(?<=- 当前版本：`)\d{12}(?=`)/, "202613011041", "valid 12-digit Shanghai minute"],
      ["Asia/Shanghai", "UTC", "timezone must exactly equal Asia/Shanghai"],
      ["YYYYMMDDHHMM", "YYYYMMDD", "format must exactly equal YYYYMMDDHHMM"],
      [
        /发布状态：(?:Released|Unreleased)/,
        "发布状态：Ready",
        "status must be exactly Released or Unreleased"
      ]
    ] as const) {
      const root = await copyRepository()
      const versionPath = path.join(root, "Version.md")
      const source = await readFile(versionPath, "utf8")
      await writeFile(versionPath, source.replace(from, to))
      await expect(validateHarness(root)).rejects.toThrow(message)
    }

    for (const [duplicate, message] of [
      ["- 当前版本：not-a-version", "valid 12-digit Shanghai minute"],
      ["- 版本时区：UTC", "timezone must exactly equal Asia/Shanghai"],
      ["- 版本格式：YYYYMMDD", "format must exactly equal YYYYMMDDHHMM"]
    ] as const) {
      const root = await copyRepository()
      const versionPath = path.join(root, "Version.md")
      const source = await readFile(versionPath, "utf8")
      await writeFile(versionPath, `${source.trimEnd()}\n${duplicate}\n`)
      await expect(validateHarness(root)).rejects.toThrow(message)
    }
  })

  /** 验证日常 Harness 门禁复用生产升级器的所有权清单约束。 */
  test("rejects a weakened upgrade ownership manifest", async () => {
    const schemaRoot = await copyRepository()
    const schemaPath = path.join(
      schemaRoot,
      ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
    )
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>
    schema.schemaVersion = 2
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`)
    await expect(validateHarness(schemaRoot)).rejects.toThrow(
      /upgrade ownership contract is invalid/
    )

    const ruleRoot = await copyRepository()
    const rulePath = path.join(
      ruleRoot,
      ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
    )
    const manifest = JSON.parse(await readFile(rulePath, "utf8")) as {
      rules: Array<{ pattern: string }>
    }
    manifest.rules = manifest.rules.filter(
      (rule) => rule.pattern !== ".agents/skills/web-summarize-development-history/**"
    )
    await writeFile(rulePath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateHarness(ruleRoot)).rejects.toThrow(
      /web-summarize-development-history.*must be managed/
    )
  })

  /** 验证 rejects restored in-place creation entry points and removed deep gates 场景。 */
  test("rejects restored in-place creation entry points and removed deep gates", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 scriptRoot 变量供当前逻辑使用。
    const scriptRoot = await copyRepository()
    await updateManifest(
      scriptRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        // 保存 scripts 变量供当前逻辑使用。
        const scripts = manifest.scripts as Record<string, string>
        scripts["harness:init"] = "tsx .harness/tooling/cli.ts init"
      }
    )
    await expect(validateHarness(scriptRoot)).rejects.toThrow(
      /must not expose the in-place harness:init script/
    )

    // 保存 cliRoot 变量供当前逻辑使用。
    const cliRoot = await copyRepository()
    // 保存 cliPath 变量供当前逻辑使用。
    const cliPath = path.join(cliRoot, ".harness/tooling/cli.ts")
    // 保存 cli 变量供当前逻辑使用。
    const cli = await readFile(cliPath, "utf8")
    await writeFile(
      cliPath,
      cli.replace(
        'if (command === "init") return rejectInPlaceInitialization()',
        '// if (command === "init") return rejectInPlaceInitialization()\n  if (command === "init") return'
      )
    )
    await expect(validateHarness(cliRoot)).rejects.toThrow(
      /Harness CLI must structurally reject the init command/
    )

    // 保存 initializerRoot 变量供当前逻辑使用。
    const initializerRoot = await copyRepository()
    // 保存 initializerPath 变量供当前逻辑使用。
    const initializerPath = path.join(initializerRoot, ".harness/tooling/init.ts")
    // 保存 initializer 变量供当前逻辑使用。
    const initializer = await readFile(initializerPath, "utf8")
    await writeFile(
      initializerPath,
      initializer.replace("await assertDownstreamInitializationRoot(root)", "void root")
    )
    await expect(validateHarness(initializerRoot)).rejects.toThrow(
      /Harness initializer is missing await assertDownstreamInitializationRoot\(root\)/
    )

    // 保存 postInitializationRoot 变量供创建期重复命令负例使用。
    const postInitializationRoot = await copyRepository()
    // 保存 postInitializationPath 变量供初始化器命令篡改使用。
    const postInitializationPath = path.join(postInitializationRoot, ".harness/tooling/init.ts")
    // 保存 postInitializationSource 变量供初始化器命令篡改使用。
    const postInitializationSource = await readFile(postInitializationPath, "utf8")
    await writeFile(
      postInitializationPath,
      postInitializationSource.replace('"--prefer-offline"', '"build"')
    )
    await expect(validateHarness(postInitializationRoot)).rejects.toThrow(
      /missing the single install and Git initialization contract/
    )

    // 保存 e2eRoot 变量供初始化 E2E 参数回归负例使用。
    const e2eRoot = await copyRepository()
    // 保存 e2eEntryPath 变量供公开入口篡改使用。
    const e2eEntryPath = path.join(e2eRoot, "scripts/instantiate.ts")
    // 保存 e2eEntry 变量供公开入口篡改使用。
    const e2eEntry = await readFile(e2eEntryPath, "utf8")
    await writeFile(e2eEntryPath, e2eEntry.replace('"logo",', '"logo",\n    "--e2e",'))
    await expect(validateHarness(e2eRoot)).rejects.toThrow(
      /Public instantiate entry must not accept an E2E selection/
    )

    // 保存 environmentSkillRoot 变量供环境探测正文漂移负例使用。
    const environmentSkillRoot = await copyRepository()
    // 保存 environmentSkillPath 变量供环境 Skill 篡改使用。
    const environmentSkillPath = path.join(
      environmentSkillRoot,
      ".agents/skills/web-check-development-environment/SKILL.md"
    )
    // 保存 environmentSkillSource 变量供环境触发条件篡改使用。
    const environmentSkillSource = await readFile(environmentSkillPath, "utf8")
    await writeFile(
      environmentSkillPath,
      environmentSkillSource.replace(
        "最终 Release 构建、新会话、Agent 切换、宿主或版本约束变化都不触发预探测",
        "最终 Release 构建前重新探测"
      )
    )
    await expect(validateHarness(environmentSkillRoot)).rejects.toThrow(
      /web-check-development-environment\/SKILL\.md is missing required workflow/
    )

    // 保存 smokeSkillRoot 变量供候选 smoke 策略正文漂移负例使用。
    const smokeSkillRoot = await copyRepository()
    const smokeSkillPath = path.join(smokeSkillRoot, ".agents/skills/web-verify-delivery/SKILL.md")
    const smokeSkillSource = await readFile(smokeSkillPath, "utf8")
    await writeFile(
      smokeSkillPath,
      smokeSkillSource.replace(
        "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`",
        "smoke 默认不运行"
      )
    )
    await expect(validateHarness(smokeSkillRoot)).rejects.toThrow(
      /web-verify-delivery\/SKILL\.md is missing required workflow/
    )
  })

  /** 验证 rejects Chinese comment gate wiring drift 场景。 */
  test("rejects Chinese comment gate wiring drift", /* 执行中文注释门禁接线负例测试。 */ async () => {
    // 保存 rootScriptRoot 变量供当前逻辑使用。
    const rootScriptRoot = await copyRepository()
    await updateManifest(
      rootScriptRoot,
      /* 删除根 lint 中的中文注释门禁。 */ (manifest) => {
        // 保存 scripts 变量供当前逻辑使用。
        const scripts = manifest.scripts as Record<string, string>
        scripts.lint = "eslint ."
      }
    )
    await expect(validateHarness(rootScriptRoot)).rejects.toThrow(
      /Source Harness script lint must enforce the governed comment policy/
    )

    // 保存 downstreamScriptRoot 变量供当前逻辑使用。
    const downstreamScriptRoot = await copyRepository()
    // 保存 manifestToolingPath 变量供当前逻辑使用。
    const manifestToolingPath = path.join(downstreamScriptRoot, ".harness/tooling/manifest.ts")
    // 保存 manifestTooling 变量供当前逻辑使用。
    const manifestTooling = await readFile(manifestToolingPath, "utf8")
    await writeFile(
      manifestToolingPath,
      manifestTooling.replace(
        'lint: "eslint . && pnpm comments:check && pnpm source-size:check"',
        '/* governed lint removed */ lint: "eslint ."'
      )
    )
    await expect(validateHarness(downstreamScriptRoot)).rejects.toThrow(
      /Downstream manifest tooling is missing lint/
    )

    // 保存 staticTemplateRoot 变量供静态模板注释负例使用。
    const staticTemplateRoot = await copyRepository()
    // 保存 staticTemplatePath 变量供品牌模板篡改使用。
    const staticTemplatePath = path.join(staticTemplateRoot, ".harness/tooling/finalize.ts")
    // 保存 staticTemplate 变量供品牌模板篡改使用。
    const staticTemplate = await readFile(staticTemplatePath, "utf8")
    await writeFile(
      staticTemplatePath,
      staticTemplate.replace(
        "/** 说明 refreshBrand 的稳定结构与职责边界。 */\nexport async function refreshBrand",
        "export async function refreshBrand"
      )
    )
    await expect(validateHarness(staticTemplateRoot)).rejects.toThrow(
      /Downstream brand template must contain static Chinese structure comments/
    )

    // 保存 validatorRoot 变量供当前逻辑使用。
    const validatorRoot = await copyRepository()
    // 保存 validatorPath 变量供当前逻辑使用。
    const validatorPath = path.join(validatorRoot, ".harness/tooling/validate.ts")
    // 保存 validatorSource 变量供当前逻辑使用。
    const validatorSource = await readFile(validatorPath, "utf8")
    await writeFile(
      validatorPath,
      validatorSource.replace(
        "inspectProjectChineseComments(root)",
        "/* inspectProjectChineseComments(root) */ Promise.resolve([])"
      )
    )
    await expect(validateHarness(validatorRoot)).rejects.toThrow(
      /Downstream validator is missing inspectProjectChineseComments\(root\)/
    )
  })

  /** 验证 rejects Release-only and source-size gate wiring drift 场景。 */
  test("rejects Release-only and source-size gate wiring drift", /* 执行终端构建与体积门禁接线负例测试。 */ async () => {
    // 保存 manifestRoot 变量供当前逻辑使用。
    const manifestRoot = await copyRepository()
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(manifestRoot, ".harness/tooling/manifest.ts")
    // 保存 manifestSource 变量供当前逻辑使用。
    const manifestSource = await readFile(manifestPath, "utf8")
    await writeFile(
      manifestPath,
      manifestSource.replace(
        '"test:related": "vitest related --run",',
        '"test:related": "vitest run",'
      )
    )
    await expect(validateHarness(manifestRoot)).rejects.toThrow(
      /Downstream manifest tooling is missing test:related/
    )

    // 保存 validatorRoot 变量供当前逻辑使用。
    const validatorRoot = await copyRepository()
    // 保存 validatorPath 变量供当前逻辑使用。
    const validatorPath = path.join(validatorRoot, ".harness/tooling/validate.ts")
    // 保存 validatorSource 变量供当前逻辑使用。
    const validatorSource = await readFile(validatorPath, "utf8")
    await writeFile(
      validatorPath,
      validatorSource.replace(
        "assertReleaseOnlyBuildScripts(scripts, errors)",
        "/* Release-only gate removed */ void scripts"
      )
    )
    await expect(validateHarness(validatorRoot)).rejects.toThrow(
      /Downstream validator is missing the Release-only build-script gate/
    )
  })

  /** 验证 rejects a template missing the canonical data-access knowledge 场景。 */
  test("rejects a template missing the canonical data-access knowledge", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/DATA_ACCESS.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/DATA_ACCESS\.md/
    )
  })

  /** 验证 rejects a template missing the canonical Mantine UI guidelines 场景。 */
  test("rejects a template missing the canonical Mantine UI guidelines", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/MANTINE_UI_GUIDELINES\.md/
    )
  })

  /** 验证 rejects a template missing a generated data foundation 场景。 */
  test("rejects a template missing a generated data foundation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 relativePath 变量供当前逻辑使用。
    for (const relativePath of [
      ".harness/tooling/templates/http.ts",
      ".harness/tooling/templates/pagination.ts"
    ]) {
      // 保存 targetRoot 变量供当前逻辑使用。
      const targetRoot = await copyRepository()
      await rm(path.join(targetRoot, relativePath))

      await expect(validateHarness(targetRoot)).rejects.toThrow(
        new RegExp(`Missing required file: ${relativePath.replaceAll(".", "\\.")}`)
      )
    }
  })

  /** 验证 accepts compatible version declarations above every minimum 场景。 */
  test("accepts compatible version declarations above every minimum", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    await updateManifest(
      targetRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.packageManager = "pnpm@12.9.0"
        manifest.engines = { node: ">=27.0.0", pnpm: ">=12.9.0" }
        // 保存 devDependencies 变量供当前逻辑使用。
        const devDependencies = manifest.devDependencies as Record<string, string>
        devDependencies.typescript = "^6.1.0"
        devDependencies.vitest = "~5.1.0"
        devDependencies.eslint = "11.0.0"
      }
    )

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects versions below a minimum and non-exact packageManager ranges 场景。 */
  test("rejects versions below a minimum and non-exact packageManager ranges", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 lowNodeRoot 变量供当前逻辑使用。
    const lowNodeRoot = await copyRepository()
    await updateManifest(
      lowNodeRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.engines = { node: ">=26.9.0", pnpm: ">=12.8.1" }
      }
    )
    await expect(validateHarness(lowNodeRoot)).rejects.toThrow(
      /Node engine minimum must not be lower than 26\.10\.0/
    )

    // 保存 rangedPnpmRoot 变量供当前逻辑使用。
    const rangedPnpmRoot = await copyRepository()
    await updateManifest(
      rangedPnpmRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.packageManager = "pnpm@>=12.8.1"
      }
    )
    await expect(validateHarness(rangedPnpmRoot)).rejects.toThrow(
      /packageManager must be an exact pnpm pin/
    )
  })

  /** 验证 requires engines to express an open minimum rather than equality or capped ranges 场景。 */
  test("requires engines to express an open minimum rather than equality or capped ranges", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 node 变量供当前逻辑使用。
    for (const node of ["26.10.0", "=26.10.0", "^26.10.0", "~26.10.0", ">=26.10.0 <27.0.0"]) {
      // 保存 targetRoot 变量供当前逻辑使用。
      const targetRoot = await copyRepository()
      await updateManifest(
        targetRoot,
        /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
          manifest.engines = { node, pnpm: ">=12.8.1" }
        }
      )
      await expect(validateHarness(targetRoot)).rejects.toThrow(
        /Node engine minimum must not be lower than 26\.10\.0/
      )
    }
  })

  /** 验证 rejects a maintained text file over the 2000-line hard split threshold 场景。 */
  test("rejects a maintained text file over the 2000-line hard split threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 oversizedPath 变量供当前逻辑使用。
    const oversizedPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(oversizedPath, `${"line\n".repeat(2001)}`)

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /maintained_text file exceeds its hard 2000-line limit: docs\/TECH_DEBT\.md \(2001 lines\)/
    )
  })

  /** 验证 accepts a maintained text file at exactly the 2000-line threshold 场景。 */
  test("accepts a maintained text file at exactly the 2000-line threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 boundaryPath 变量供当前逻辑使用。
    const boundaryPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(boundaryPath, `${"line\n".repeat(2000)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 does not flag an oversized lock file 场景。 */
  test("does not flag an oversized lock file", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 lockPath 变量供当前逻辑使用。
    const lockPath = path.join(targetRoot, "pnpm-lock.yaml")
    await writeFile(lockPath, `${"lockfileVersion: '9.0'\n".repeat(2500)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects prerelease or non-canonical versions and a pin below the declared minimum 场景。 */
  test("rejects prerelease or non-canonical versions and a pin below the declared minimum", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 prereleaseRoot 变量供当前逻辑使用。
    const prereleaseRoot = await copyRepository()
    await updateManifest(
      prereleaseRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.engines = { node: ">=27.0.0-beta.1", pnpm: ">=12.8.1" }
      }
    )
    await expect(validateHarness(prereleaseRoot)).rejects.toThrow(/Node engine minimum/)

    // 保存 inconsistentPnpmRoot 变量供当前逻辑使用。
    const inconsistentPnpmRoot = await copyRepository()
    await updateManifest(
      inconsistentPnpmRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.packageManager = "pnpm@12.8.1"
        manifest.engines = { node: ">=26.10.0", pnpm: ">=12.9.0" }
      }
    )
    await expect(validateHarness(inconsistentPnpmRoot)).rejects.toThrow(
      /packageManager pnpm pin must satisfy engines\.pnpm/
    )
  })
})
