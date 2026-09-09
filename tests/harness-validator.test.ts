import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { validateHarness } from "../scripts/validate-harness.ts"

// 保存 temporaryRoots 变量供当前逻辑使用。
const temporaryRoots: string[] = []
// 保存 repositoryRoot 变量供当前逻辑使用。
const repositoryRoot = path.resolve(import.meta.dirname, "..")

// 执行 copyRepository 函数的处理逻辑。
async function copyRepository(): Promise<string> {
  // 保存 targetRoot 变量供当前逻辑使用。
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "web-harness-validator-"))
  temporaryRoots.push(targetRoot)
  await cp(repositoryRoot, targetRoot, {
    recursive: true,
    // 执行 filter 函数的处理逻辑。
    filter(source) {
      // 保存 relative 变量供当前逻辑使用。
      const relative = path.relative(repositoryRoot, source)
      // 保存 topLevel 变量供当前逻辑使用。
      const topLevel = relative.split(path.sep)[0]
      return topLevel !== ".git" && topLevel !== "node_modules"
    }
  })
  return targetRoot
}

// 执行 updateManifest 函数的处理逻辑。
async function updateManifest(
  root: string,
  update: (manifest: Record<string, unknown>) => void
): Promise<void> {
  // 保存 manifestPath 变量供当前逻辑使用。
  const manifestPath = path.join(root, "package.json")
  // 保存 manifest 变量供当前逻辑使用。
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>
  update(manifest)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

afterEach(
  /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map(
          /* 执行 当前声明 函数的处理逻辑。 */ (root) => rm(root, { recursive: true, force: true })
        )
    )
  }
)

describe("Harness template validator", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  /** 验证 accepts the complete clean template contract 场景。 */
  test("accepts the complete clean template contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 report 变量供当前逻辑使用。
    const report = await validateHarness(repositoryRoot)
    expect(report.skills).toHaveLength(15)
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

  /** 验证 rejects a restored pre-namespace Skill directory 场景。 */
  test("rejects a restored pre-namespace Skill directory", /* 执行当前旧目录负例测试。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 skillsRoot 变量供当前逻辑使用。
    const skillsRoot = path.join(targetRoot, ".agents/skills")
    await rename(
      path.join(skillsRoot, "web-define-product"),
      path.join(skillsRoot, "define-product")
    )

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Skill directories must exactly match: web-check-development-environment/
    )
  })

  /** 验证当前规范不能重新引入已废弃的三档任务路径。 */
  test("rejects obsolete tiered workflow language in current rules", async () => {
    // 保存 targetRoot 与 readmePath 变量供注入旧路径语义使用。
    const targetRoot = await copyRepository()
    const readmePath = path.join(targetRoot, "README.md")
    await writeFile(readmePath, `${await readFile(readmePath, "utf8")}\n## 快速路径\n`)

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /obsolete tiered workflow remains in README\.md: 快速路径/
    )
  })

  /** 验证 rejects Skill frontmatter identity and description drift 场景。 */
  test("rejects Skill frontmatter identity and description drift", /* 执行当前 frontmatter 负例测试。 */ async () => {
    // 保存 nameRoot 变量供当前逻辑使用。
    const nameRoot = await copyRepository()
    // 保存 namePath 变量供当前逻辑使用。
    const namePath = path.join(nameRoot, ".agents/skills/web-define-product/SKILL.md")
    // 保存 nameSource 变量供当前逻辑使用。
    const nameSource = await readFile(namePath, "utf8")
    await writeFile(
      namePath,
      nameSource.replace("name: web-define-product", "name: define-product")
    )
    await expect(validateHarness(nameRoot)).rejects.toThrow(/frontmatter name is incorrect/)

    // 保存 descriptionRoot 变量供当前逻辑使用。
    const descriptionRoot = await copyRepository()
    // 保存 descriptionPath 变量供当前逻辑使用。
    const descriptionPath = path.join(descriptionRoot, ".agents/skills/web-define-product/SKILL.md")
    // 保存 descriptionSource 变量供当前逻辑使用。
    const descriptionSource = await readFile(descriptionPath, "utf8")
    await writeFile(descriptionPath, descriptionSource.replace("定义或修订单一", "规划或修订单一"))
    await expect(validateHarness(descriptionRoot)).rejects.toThrow(
      /frontmatter description must exactly match its contract/
    )
  })

  /** 验证 rejects a drifting or duplicate Skill H1 场景。 */
  test("rejects a drifting or duplicate Skill H1", /* 执行当前 H1 负例测试。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 skillPath 变量供当前逻辑使用。
    const skillPath = path.join(targetRoot, ".agents/skills/web-define-product/SKILL.md")
    // 保存 skillSource 变量供当前逻辑使用。
    const skillSource = await readFile(skillPath, "utf8")
    await writeFile(
      skillPath,
      skillSource.replace(
        "# Web Harness：定义前端产品",
        "# Web Harness：定义产品\n\n# Web Harness：重复身份"
      )
    )

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /H1 must exactly equal # Web Harness：定义前端产品/
    )
  })

  /** 验证 rejects English or non-canonical openai.yaml metadata 场景。 */
  test("rejects English or non-canonical openai.yaml metadata", /* 执行当前发现元数据负例测试。 */ async () => {
    // 保存 englishRoot 变量供当前逻辑使用。
    const englishRoot = await copyRepository()
    // 保存 englishPath 变量供当前逻辑使用。
    const englishPath = path.join(
      englishRoot,
      ".agents/skills/web-define-product/agents/openai.yaml"
    )
    // 保存 englishSource 变量供当前逻辑使用。
    const englishSource = await readFile(englishPath, "utf8")
    await writeFile(
      englishPath,
      englishSource.replace(
        "定义 React Web 或 Plasmo MV3 Extension 的单一前端产品范围",
        "Define one React Web or Plasmo MV3 Extension product scope"
      )
    )
    await expect(validateHarness(englishRoot)).rejects.toThrow(
      /short_description must be 25-64 characters and contain Chinese/
    )

    // 保存 driftRoot 变量供当前逻辑使用。
    const driftRoot = await copyRepository()
    // 保存 driftPath 变量供当前逻辑使用。
    const driftPath = path.join(driftRoot, ".agents/skills/web-define-product/agents/openai.yaml")
    // 保存 driftSource 变量供当前逻辑使用。
    const driftSource = await readFile(driftPath, "utf8")
    await writeFile(driftPath, driftSource.replace("的单一前端产品范围", "的明确单一前端产品范围"))
    await expect(validateHarness(driftRoot)).rejects.toThrow(
      /metadata must exactly match its contract/
    )
  })

  /** 验证 requires the exact Skill call in one Chinese default_prompt sentence 场景。 */
  test("requires the exact Skill call in one Chinese default_prompt sentence", /* 执行当前默认提示负例测试。 */ async () => {
    // 保存 callRoot 变量供当前逻辑使用。
    const callRoot = await copyRepository()
    // 保存 metadataPath 变量供当前逻辑使用。
    const metadataPath = path.join(callRoot, ".agents/skills/web-define-product/agents/openai.yaml")
    // 保存 metadataSource 变量供当前逻辑使用。
    const metadataSource = await readFile(metadataPath, "utf8")
    await writeFile(metadataPath, metadataSource.replace("$web-define-product", "$web-plan-change"))
    await expect(validateHarness(callRoot)).rejects.toThrow(
      /default_prompt must call \$web-define-product/
    )

    // 保存 sentenceRoot 变量供当前逻辑使用。
    const sentenceRoot = await copyRepository()
    // 保存 sentencePath 变量供当前逻辑使用。
    const sentencePath = path.join(
      sentenceRoot,
      ".agents/skills/web-define-product/agents/openai.yaml"
    )
    // 保存 sentenceSource 变量供当前逻辑使用。
    const sentenceSource = await readFile(sentencePath, "utf8")
    await writeFile(
      sentencePath,
      sentenceSource.replace('可衡量成功标准。"', '可衡量成功标准。不要扩大范围。"')
    )
    await expect(validateHarness(sentenceRoot)).rejects.toThrow(
      /default_prompt must be one Chinese sentence/
    )
  })

  /** 验证 rejects Rust or Server language only in Skill identity metadata 场景。 */
  test("rejects Rust or Server language only in Skill identity metadata", /* 执行当前越界身份负例测试。 */ async () => {
    // 逐项证明两个其他 Harness 身份关键词都会被拒绝。
    for (const forbidden of ["Rust", "Server"]) {
      // 保存 targetRoot 变量供当前逻辑使用。
      const targetRoot = await copyRepository()
      // 保存 metadataPath 变量供当前逻辑使用。
      const metadataPath = path.join(
        targetRoot,
        ".agents/skills/web-define-product/agents/openai.yaml"
      )
      // 保存 metadataSource 变量供当前逻辑使用。
      const metadataSource = await readFile(metadataPath, "utf8")
      await writeFile(
        metadataPath,
        metadataSource.replace(
          "Web Harness：定义前端产品",
          `Web Harness：定义前端产品 ${forbidden}`
        )
      )
      await expect(validateHarness(targetRoot)).rejects.toThrow(
        /identity metadata contains non-Web Rust\/Server language/
      )
    }

    // 保存 bodyRoot 变量供当前逻辑使用。
    const bodyRoot = await copyRepository()
    // 保存 bodyPath 变量供当前逻辑使用。
    const bodyPath = path.join(bodyRoot, ".agents/skills/web-test-final-artifact-e2e/SKILL.md")
    // 保存 bodySource 变量供当前逻辑使用。
    const bodySource = await readFile(bodyPath, "utf8")
    await writeFile(bodyPath, `${bodySource}\n可以说明 Vite dev server 不能代替最终产物。\n`)
    await expect(validateHarness(bodyRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects missing, unknown, or invalid Agent Policy fields 场景。 */
  test("rejects missing, unknown, or invalid Agent Policy fields", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 missingRoot 变量供当前逻辑使用。
    const missingRoot = await copyRepository()
    // 保存 missingPath 变量供当前逻辑使用。
    const missingPath = path.join(missingRoot, "docs/AGENT_POLICY.md")
    // 保存 missingPolicy 变量供当前逻辑使用。
    const missingPolicy = await readFile(missingPath, "utf8")
    await writeFile(missingPath, missingPolicy.replace("confirmed_by: pending\n", ""))
    await expect(validateHarness(missingRoot)).rejects.toThrow(
      /Agent policy is missing confirmed_by/
    )

    // 保存 invalidRoot 变量供当前逻辑使用。
    const invalidRoot = await copyRepository()
    // 保存 invalidPath 变量供当前逻辑使用。
    const invalidPath = path.join(invalidRoot, "docs/AGENT_POLICY.md")
    // 保存 invalidPolicy 变量供当前逻辑使用。
    const invalidPolicy = await readFile(invalidPath, "utf8")
    await writeFile(
      invalidPath,
      invalidPolicy.replace("milestone_smoke: pending", "milestone_smoke: automatic")
    )
    await expect(validateHarness(invalidRoot)).rejects.toThrow(
      /Agent policy milestone_smoke must be enabled, disabled, or pending/
    )

    // 保存 unknownRoot 变量供当前逻辑使用。
    const unknownRoot = await copyRepository()
    // 保存 unknownPath 变量供当前逻辑使用。
    const unknownPath = path.join(unknownRoot, "docs/AGENT_POLICY.md")
    // 保存 unknownPolicy 变量供当前逻辑使用。
    const unknownPolicy = await readFile(unknownPath, "utf8")
    await writeFile(
      unknownPath,
      unknownPolicy.replace("decision_mode:", "extra_switch: enabled\ndecision_mode:")
    )
    await expect(validateHarness(unknownRoot)).rejects.toThrow(/unknown field: extra_switch/)

    // 保存 resolvedSourceRoot 变量供源默认值漂移负例使用。
    const resolvedSourceRoot = await copyRepository()
    // 保存 resolvedSourcePath 变量供源默认值篡改使用。
    const resolvedSourcePath = path.join(resolvedSourceRoot, "docs/AGENT_POLICY.md")
    // 保存 resolvedSourcePolicy 变量供源默认值篡改使用。
    const resolvedSourcePolicy = await readFile(resolvedSourcePath, "utf8")
    await writeFile(
      resolvedSourcePath,
      resolvedSourcePolicy.replace(
        "parallel_worktree_subagents: pending",
        "parallel_worktree_subagents: enabled"
      )
    )
    await expect(validateHarness(resolvedSourceRoot)).rejects.toThrow(
      /Harness source Agent policy parallel_worktree_subagents must default to pending/
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
        manifest.packageManager = "pnpm@10.34.0"
        manifest.engines = { node: ">=23.0.0", pnpm: ">=10.34.0" }
        // 保存 devDependencies 变量供当前逻辑使用。
        const devDependencies = manifest.devDependencies as Record<string, string>
        devDependencies.typescript = "^6.1.0"
        devDependencies.vitest = "~4.2.0"
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
        manifest.engines = { node: ">=22.22.1", pnpm: ">=10.33.3" }
      }
    )
    await expect(validateHarness(lowNodeRoot)).rejects.toThrow(
      /Node engine minimum must not be lower than 22\.22\.2/
    )

    // 保存 rangedPnpmRoot 变量供当前逻辑使用。
    const rangedPnpmRoot = await copyRepository()
    await updateManifest(
      rangedPnpmRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.packageManager = "pnpm@>=10.33.3"
      }
    )
    await expect(validateHarness(rangedPnpmRoot)).rejects.toThrow(
      /packageManager must be an exact pnpm pin/
    )
  })

  /** 验证 requires engines to express an open minimum rather than equality or capped ranges 场景。 */
  test("requires engines to express an open minimum rather than equality or capped ranges", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 node 变量供当前逻辑使用。
    for (const node of ["22.22.2", "=22.22.2", "^22.22.2", "~22.22.2", ">=22.22.2 <23.0.0"]) {
      // 保存 targetRoot 变量供当前逻辑使用。
      const targetRoot = await copyRepository()
      await updateManifest(
        targetRoot,
        /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
          manifest.engines = { node, pnpm: ">=10.33.3" }
        }
      )
      await expect(validateHarness(targetRoot)).rejects.toThrow(
        /Node engine minimum must not be lower than 22\.22\.2/
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
        manifest.engines = { node: ">=23.0.0-beta.1", pnpm: ">=10.33.3" }
      }
    )
    await expect(validateHarness(prereleaseRoot)).rejects.toThrow(/Node engine minimum/)

    // 保存 inconsistentPnpmRoot 变量供当前逻辑使用。
    const inconsistentPnpmRoot = await copyRepository()
    await updateManifest(
      inconsistentPnpmRoot,
      /* 执行 当前声明 函数的处理逻辑。 */ (manifest) => {
        manifest.packageManager = "pnpm@10.33.3"
        manifest.engines = { node: ">=22.22.2", pnpm: ">=10.34.0" }
      }
    )
    await expect(validateHarness(inconsistentPnpmRoot)).rejects.toThrow(
      /packageManager pnpm pin must satisfy engines\.pnpm/
    )
  })
})
