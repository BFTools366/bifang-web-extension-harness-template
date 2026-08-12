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
  test("accepts the complete clean template contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 report 变量供当前逻辑使用。
    const report = await validateHarness(repositoryRoot)
    expect(report.skills).toHaveLength(13)
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
    expect(verifyDelivery).toContain("Extension 候选无论运行时验收使用构建目录还是 zip")
    expect(verifyDelivery).toContain("都必须另运行 `pnpm package`")
    expect(verifyDeliveryMetadata).toContain('display_name: "Web Harness：验证前端交付"')
  })

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

  test("rejects missing, unknown, or invalid Agent Policy fields", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 missingRoot 变量供当前逻辑使用。
    const missingRoot = await copyRepository()
    // 保存 missingPath 变量供当前逻辑使用。
    const missingPath = path.join(missingRoot, "docs/AGENT_POLICY.md")
    // 保存 missingPolicy 变量供当前逻辑使用。
    const missingPolicy = await readFile(missingPath, "utf8")
    await writeFile(missingPath, missingPolicy.replace("standard_work_plan: optional\n", ""))
    await expect(validateHarness(missingRoot)).rejects.toThrow(/is missing standard_work_plan/)

    // 保存 invalidRoot 变量供当前逻辑使用。
    const invalidRoot = await copyRepository()
    // 保存 invalidPath 变量供当前逻辑使用。
    const invalidPath = path.join(invalidRoot, "docs/AGENT_POLICY.md")
    // 保存 invalidPolicy 变量供当前逻辑使用。
    const invalidPolicy = await readFile(invalidPath, "utf8")
    await writeFile(
      invalidPath,
      invalidPolicy.replace("milestone_smoke: optional", "milestone_smoke: automatic")
    )
    await expect(validateHarness(invalidRoot)).rejects.toThrow(/invalid milestone_smoke/)

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
  })

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
  })

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
        'lint: "eslint . && pnpm comments:check"',
        '/* lint: "eslint . && pnpm comments:check" */ lint: "eslint ."'
      )
    )
    await expect(validateHarness(downstreamScriptRoot)).rejects.toThrow(
      /Downstream manifest tooling is missing lint/
    )

    // 保存 initializerRoot 变量供当前逻辑使用。
    const initializerRoot = await copyRepository()
    // 保存 initializerPath 变量供当前逻辑使用。
    const initializerPath = path.join(initializerRoot, ".harness/tooling/init.ts")
    // 保存 initializer 变量供当前逻辑使用。
    const initializer = await readFile(initializerPath, "utf8")
    await writeFile(
      initializerPath,
      initializer.replace(
        "await annotateTypeScriptProject(root)",
        "// await annotateTypeScriptProject(root)\n  void root"
      )
    )
    await expect(validateHarness(initializerRoot)).rejects.toThrow(
      /Harness initializer is missing await annotateTypeScriptProject\(root\)/
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

  test("rejects a template missing the canonical data-access knowledge", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/DATA_ACCESS.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/DATA_ACCESS\.md/
    )
  })

  test("rejects a template missing the canonical Mantine UI guidelines", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/MANTINE_UI_GUIDELINES\.md/
    )
  })

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

  test("rejects a maintained text file over the 2000-line hard split threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 oversizedPath 变量供当前逻辑使用。
    const oversizedPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(oversizedPath, `${"line\n".repeat(2001)}`)

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /docs\/TECH_DEBT\.md has 2002 lines, over the 2000-line hard split threshold/
    )
  })

  test("accepts a maintained text file at exactly the 2000-line threshold", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 boundaryPath 变量供当前逻辑使用。
    const boundaryPath = path.join(targetRoot, "docs/TECH_DEBT.md")
    await writeFile(boundaryPath, `${"line\n".repeat(1999)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  test("does not flag an oversized lock file", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 targetRoot 变量供当前逻辑使用。
    const targetRoot = await copyRepository()
    // 保存 lockPath 变量供当前逻辑使用。
    const lockPath = path.join(targetRoot, "pnpm-lock.yaml")
    await writeFile(lockPath, `${"lockfileVersion: '9.0'\n".repeat(2500)}`)

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

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
