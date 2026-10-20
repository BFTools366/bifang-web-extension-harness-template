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
    const report = await validateHarness(repositoryRoot)
    expect(report.skills).toHaveLength(32)
    expect(report.skills).toContain("web-compose-capabilities")
    expect(report.skills).toContain("web-implement-list-view")
    const verifyDelivery = await readFile(
      path.join(repositoryRoot, ".agents/skills/web-verify-delivery/SKILL.md"),
      "utf8"
    )
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
    const scriptRoot = await copyRepository()
    await updateManifest(scriptRoot, (manifest) => {
      const scripts = manifest.scripts as Record<string, string>
      scripts["harness:init"] = "tsx .harness/tooling/cli.ts init"
    })
    await expect(validateHarness(scriptRoot)).rejects.toThrow(
      /must not expose the in-place harness:init script/
    )

    const cliRoot = await copyRepository()
    const cliPath = path.join(cliRoot, ".harness/tooling/cli.ts")
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

    const initializerRoot = await copyRepository()
    const initializerPath = path.join(initializerRoot, ".harness/tooling/init.ts")
    const initializer = await readFile(initializerPath, "utf8")
    await writeFile(
      initializerPath,
      initializer.replace("await assertDownstreamInitializationRoot(root)", "void root")
    )
    await expect(validateHarness(initializerRoot)).rejects.toThrow(
      /Harness initializer is missing await assertDownstreamInitializationRoot\(root\)/
    )

    const postInitializationRoot = await copyRepository()
    const postInitializationPath = path.join(postInitializationRoot, ".harness/tooling/init.ts")
    const postInitializationSource = await readFile(postInitializationPath, "utf8")
    await writeFile(
      postInitializationPath,
      postInitializationSource.replace('"--prefer-offline"', '"build"')
    )
    await expect(validateHarness(postInitializationRoot)).rejects.toThrow(
      /missing the single install and Git initialization contract/
    )

    const e2eRoot = await copyRepository()
    const e2eEntryPath = path.join(e2eRoot, "scripts/instantiate.ts")
    const e2eEntry = await readFile(e2eEntryPath, "utf8")
    await writeFile(e2eEntryPath, e2eEntry + "\n// usage: --e2e enabled\n")
    await expect(validateHarness(e2eRoot)).rejects.toThrow(
      /Public instantiate entry must not accept an E2E selection/
    )

    const e2eOptionsRoot = await copyRepository()
    const e2eOptionsPath = path.join(e2eOptionsRoot, ".harness/tooling/cli.ts")
    const e2eOptions = await readFile(e2eOptionsPath, "utf8")
    await writeFile(e2eOptionsPath, e2eOptions.replace('"logo",', '"logo",\n  "--e2e",'))
    await expect(validateHarness(e2eOptionsRoot)).rejects.toThrow(
      /Harness initialization options must not accept an E2E selection/
    )

    const environmentSkillRoot = await copyRepository()
    const environmentSkillPath = path.join(
      environmentSkillRoot,
      ".agents/skills/web-check-development-environment/SKILL.md"
    )
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
    const rootScriptRoot = await copyRepository()
    await updateManifest(
      rootScriptRoot,
      /* 删除根 lint 中的中文注释门禁。 */ (manifest) => {
        const scripts = manifest.scripts as Record<string, string>
        scripts.lint = "eslint ."
      }
    )
    await expect(validateHarness(rootScriptRoot)).rejects.toThrow(
      /Source Harness script lint must enforce the governed comment policy/
    )

    const downstreamScriptRoot = await copyRepository()
    const manifestToolingPath = path.join(downstreamScriptRoot, ".harness/tooling/manifest.ts")
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

    const staticTemplateRoot = await copyRepository()
    const staticTemplatePath = path.join(staticTemplateRoot, ".harness/tooling/finalize.ts")
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

    const validatorRoot = await copyRepository()
    const validatorPath = path.join(validatorRoot, ".harness/tooling/validate.ts")
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
    const manifestRoot = await copyRepository()
    const manifestPath = path.join(manifestRoot, ".harness/tooling/manifest.ts")
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

    const validatorRoot = await copyRepository()
    const validatorPath = path.join(validatorRoot, ".harness/tooling/validate.ts")
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

  /** 验证源模板丢失完整基础契约或数据访问文档时失败关闭。 */
  test.each(["docs/API.md", "docs/DATA_ACCESS.md"])(
    "rejects missing foundation documentation %s",
    async (relativePath) => {
      const targetRoot = await copyRepository()
      await rm(path.join(targetRoot, relativePath))

      await expect(validateHarness(targetRoot)).rejects.toThrow(
        "Missing required file: " + relativePath
      )
    }
  )

  /** 验证 rejects a template missing the canonical Mantine UI guidelines 场景。 */
  test("rejects a template missing the canonical Mantine UI guidelines", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/MANTINE_UI_GUIDELINES\.md/
    )
  })

  /** 验证 rejects a template missing a generated data foundation 场景。 */
  test("rejects a template missing a generated data foundation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    for (const relativePath of [
      ".harness/tooling/templates/http.ts",
      ".harness/tooling/templates/pagination.ts"
    ]) {
      const targetRoot = await copyRepository()
      await rm(path.join(targetRoot, relativePath))

      await expect(validateHarness(targetRoot)).rejects.toThrow(
        new RegExp(`Missing required file: ${relativePath.replaceAll(".", "\\.")}`)
      )
    }
  })

  /** 验证 accepts compatible version declarations above every minimum 场景。 */
  test("accepts compatible version declarations above every minimum", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const targetRoot = await copyRepository()
    await updateManifest(targetRoot, (manifest) => {
      manifest.packageManager = "pnpm@12.9.0"
      manifest.engines = { node: ">=27.0.0", pnpm: ">=12.9.0" }
      const devDependencies = manifest.devDependencies as Record<string, string>
      devDependencies.typescript = "^6.1.0"
      devDependencies.vitest = "~5.1.0"
      devDependencies.eslint = "11.0.0"
    })

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects versions below a minimum and non-exact packageManager ranges 场景。 */
  test("rejects versions below a minimum and non-exact packageManager ranges", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const lowNodeRoot = await copyRepository()
    await updateManifest(lowNodeRoot, (manifest) => {
      manifest.engines = { node: ">=23.99.0", pnpm: ">=12.8.1" }
    })
    await expect(validateHarness(lowNodeRoot)).rejects.toThrow(
      /Node engine minimum must not be lower than 24\.0\.0/
    )

    const rangedPnpmRoot = await copyRepository()
    await updateManifest(rangedPnpmRoot, (manifest) => {
      manifest.packageManager = "pnpm@>=12.8.1"
    })
    await expect(validateHarness(rangedPnpmRoot)).rejects.toThrow(
      /packageManager must be an exact pnpm pin/
    )
  })

  /** 验证 requires engines to express an open minimum rather than equality or capped ranges 场景。 */
  test("requires engines to express an open minimum rather than equality or capped ranges", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    for (const node of ["24.0.0", "=24.0.0", "^24.0.0", "~24.0.0", ">=24.0.0 <27.0.0"]) {
      const targetRoot = await copyRepository()
      await updateManifest(targetRoot, (manifest) => {
        manifest.engines = { node, pnpm: ">=12.8.1" }
      })
      await expect(validateHarness(targetRoot)).rejects.toThrow(
        /Node engine minimum must not be lower than 24\.0\.0/
      )
    }
  })

  /** 验证 rejects a maintained text file over the 2000-line hard split threshold 场景。 */
  test("rejects a maintained text file over the 2000-line hard split threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const targetRoot = await copyRepository()
    const oversizedPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(oversizedPath, `${"line\n".repeat(2001)}`)

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /maintained_text file exceeds its hard 2000-line limit: docs\/TECH_DEBT\.md \(2001 lines\)/
    )
  })

  /** 验证 accepts a maintained text file at exactly the 2000-line threshold 场景。 */
  test("accepts a maintained text file at exactly the 2000-line threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const targetRoot = await copyRepository()
    const boundaryPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(boundaryPath, `${"line\n".repeat(2000)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 does not flag an oversized lock file 场景。 */
  test("does not flag an oversized lock file", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const targetRoot = await copyRepository()
    const lockPath = path.join(targetRoot, "pnpm-lock.yaml")
    await writeFile(lockPath, `${"lockfileVersion: '9.0'\n".repeat(2500)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects prerelease or non-canonical versions and a pin below the declared minimum 场景。 */
  test("rejects prerelease or non-canonical versions and a pin below the declared minimum", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const prereleaseRoot = await copyRepository()
    await updateManifest(prereleaseRoot, (manifest) => {
      manifest.engines = { node: ">=27.0.0-beta.1", pnpm: ">=12.8.1" }
    })
    await expect(validateHarness(prereleaseRoot)).rejects.toThrow(/Node engine minimum/)

    const inconsistentPnpmRoot = await copyRepository()
    await updateManifest(inconsistentPnpmRoot, (manifest) => {
      manifest.packageManager = "pnpm@12.8.1"
      manifest.engines = { node: ">=24.0.0", pnpm: ">=12.9.0" }
    })
    await expect(validateHarness(inconsistentPnpmRoot)).rejects.toThrow(
      /packageManager pnpm pin must satisfy engines\.pnpm/
    )
  })
})
