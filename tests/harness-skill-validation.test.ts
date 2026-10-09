import { readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { validateHarness } from "../scripts/validate-harness.ts"
import { copyRepository } from "./harness-validator-fixture.ts"

/** 验证 Harness Skill and Agent policy validation 的完整回归场景。 */
describe("Harness Skill and Agent policy validation", () => {
  // 验证新工作流不能缺失选择门禁、参考或可执行工具而仍被声明完整。
  test("requires prototype selection guidance and complete project-local resources", async () => {
    const targetRoot = await copyRepository()
    const skillPath = path.join(targetRoot, ".agents/skills/web-design-prototype/SKILL.md")
    const skillSource = await readFile(skillPath, "utf8")
    await writeFile(skillPath, skillSource.replace("必须等待用户明确选定", "自动采用推荐方案"))
    await expect(validateHarness(targetRoot)).rejects.toThrow(/missing required workflow/)
    for (const relative of ["references/prd-outline.md", "scripts/prototype-review.ts"]) {
      const resourceRoot = await copyRepository()
      await rm(path.join(resourceRoot, ".agents/skills/web-design-prototype", relative))
      await expect(validateHarness(resourceRoot)).rejects.toThrow(/Missing required file/)
    }
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
      /Skill directories must exactly match:/
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
    await writeFile(
      descriptionPath,
      descriptionSource.replace(/^description: .+$/mu, "description: 改写后的描述")
    )
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
        /^ {2}short_description: .+$/mu,
        '  short_description: "Define one React Web or Plasmo MV3 Extension product scope"'
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
    await writeFile(driftPath, driftSource.replace("澄清产品需求", "明确产品需求"))
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
      sentenceSource.replace('原型选择流程。"', '原型选择流程。不要扩大范围。"')
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
      invalidPolicy.replace("acceptance_smoke: pending", "acceptance_smoke: automatic")
    )
    await expect(validateHarness(invalidRoot)).rejects.toThrow(
      /Agent policy acceptance_smoke must be enabled, disabled, or pending/
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
})
