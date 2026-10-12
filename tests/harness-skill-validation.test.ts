import { readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { validateHarness } from "../scripts/validate-harness.ts"
import { copyRepository } from "./harness-validator-fixture.ts"

/** 验证 Harness Skill and Agent policy validation 的完整回归场景。 */
describe("Harness Skill and Agent policy validation", () => {
  /** 验证拆分后的只读、授权、恢复和绑定边界仍受源门禁约束。 */
  test.each([
    ["web-review-api-contract", "不修改代码、配置、测试或文档"],
    ["web-review-module-boundaries", "只读，不移动文件"],
    ["web-implement-access-control", "权限未加载、不可解析或缺失时默认拒绝"],
    ["web-implement-access-control", "已识别但无权限的目标"],
    ["web-implement-access-control", "不依赖被拒绝的业务权限"],
    ["web-implement-saas-auth", "权限差异测试矩阵"],
    ["web-document-api", "客户端控制参数不属于 wire 字段"],
    ["web-document-api", "HTTP 待确认项"],
    ["web-implement-write-recovery", "刷新失败只重试读取"],
    ["web-implement-browser-storage", "不扩大例外"],
    ["web-implement-event-stream", "不能从查询接口推断支持"],
    ["web-manage-user-tasks", "当前与逐页归档"]
  ])("rejects a weakened leaf workflow in %s", async (skill, fragment) => {
    const root = await copyRepository()
    const file = path.join(root, ".agents/skills", skill, "SKILL.md")
    await writeFile(file, (await readFile(file, "utf8")).replaceAll(fragment, "被弱化的边界"))
    await expect(validateHarness(root)).rejects.toThrow(/missing required workflow/)
  })

  /** 验证后台管理三份合同缺一都会阻断源分发。 */
  test.each(["pages-and-sop.md", "management-contract.md", "neutral-ui-design.md"])(
    "requires SaaS admin resource %s",
    async (reference) => {
      const root = await copyRepository()
      await rm(path.join(root, ".agents/skills/web-implement-saas-admin/references", reference))
      await expect(validateHarness(root)).rejects.toThrow(/Missing required file/)
    }
  )

  /** 验证管理目标不冒充身份、历史保护与服务端审计不能静默丢失。 */
  test.each([
    "组织管理不切换管理员登录组织或冒充客户",
    "改价与下架不改写历史订单快照",
    "管理写操作由服务端校验并留存审计"
  ])("requires SaaS admin workflow %s", async (fragment) => {
    const root = await copyRepository()
    const file = path.join(root, ".agents/skills/web-implement-saas-admin/SKILL.md")
    await writeFile(file, (await readFile(file, "utf8")).replace(fragment, "缺失的管理边界"))
    await expect(validateHarness(root)).rejects.toThrow(/missing required workflow/)
  })

  /** 验证可选购买的每份参考与离线资产均属于完整源分发合同。 */
  test.each([
    "references/requirements-and-sop.md",
    "references/order-and-wallet-contract.md",
    "references/neutral-ui-design.md",
    "assets/commerce-reference.html",
    "assets/commerce-reference.css",
    "assets/commerce-reference.js"
  ])("requires commerce resource %s", async (resource) => {
    const root = await copyRepository()
    await rm(path.join(root, ".agents/skills/web-implement-saas-commerce", resource))
    await expect(validateHarness(root)).rejects.toThrow(/Missing required file/)
  })

  /** 验证默认关闭与未知结果先查询不能在维护中被移除。 */
  test.each(["默认关闭，只有明确选中后才应用", "结果未知时先查询，不自动重放创建订单或支付"])(
    "requires commerce workflow %s",
    async (fragment) => {
      const root = await copyRepository()
      const file = path.join(root, ".agents/skills/web-implement-saas-commerce/SKILL.md")
      await writeFile(file, (await readFile(file, "utf8")).replace(fragment, "缺失的购买合同"))
      await expect(validateHarness(root)).rejects.toThrow(/missing required workflow/)
    }
  )

  /** 验证 SaaS 的需求/SOP 与会话合同均为不可缺失的源分发资源。 */
  test.each(["requirements-and-sop.md", "session-contract.md"])(
    "requires SaaS reference %s",
    async (reference) => {
      const root = await copyRepository()
      await rm(path.join(root, ".agents/skills/web-implement-saas-auth/references", reference))
      await expect(validateHarness(root)).rejects.toThrow(/Missing required file/)
    }
  )
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
    const targetRoot = await copyRepository()
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
    const targetRoot = await copyRepository()
    const readmePath = path.join(targetRoot, "README.md")
    await writeFile(readmePath, `${await readFile(readmePath, "utf8")}\n## 快速路径\n`)

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /obsolete tiered workflow remains in README\.md: 快速路径/
    )
  })

  /** 验证 rejects Skill frontmatter identity and description drift 场景。 */
  test("rejects Skill frontmatter identity and description drift", /* 执行当前 frontmatter 负例测试。 */ async () => {
    const nameRoot = await copyRepository()
    const namePath = path.join(nameRoot, ".agents/skills/web-define-product/SKILL.md")
    const nameSource = await readFile(namePath, "utf8")
    await writeFile(
      namePath,
      nameSource.replace("name: web-define-product", "name: define-product")
    )
    await expect(validateHarness(nameRoot)).rejects.toThrow(/frontmatter name is incorrect/)

    const descriptionRoot = await copyRepository()
    const descriptionPath = path.join(descriptionRoot, ".agents/skills/web-define-product/SKILL.md")
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
    const targetRoot = await copyRepository()
    const skillPath = path.join(targetRoot, ".agents/skills/web-define-product/SKILL.md")
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
    const englishRoot = await copyRepository()
    const englishPath = path.join(
      englishRoot,
      ".agents/skills/web-define-product/agents/openai.yaml"
    )
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

    const driftRoot = await copyRepository()
    const driftPath = path.join(driftRoot, ".agents/skills/web-define-product/agents/openai.yaml")
    const driftSource = await readFile(driftPath, "utf8")
    await writeFile(driftPath, driftSource.replace("澄清产品需求", "明确产品需求"))
    await expect(validateHarness(driftRoot)).rejects.toThrow(
      /metadata must exactly match its contract/
    )
  })

  /** 验证 requires the exact Skill call in one Chinese default_prompt sentence 场景。 */
  test("requires the exact Skill call in one Chinese default_prompt sentence", /* 执行当前默认提示负例测试。 */ async () => {
    const callRoot = await copyRepository()
    const metadataPath = path.join(callRoot, ".agents/skills/web-define-product/agents/openai.yaml")
    const metadataSource = await readFile(metadataPath, "utf8")
    await writeFile(metadataPath, metadataSource.replace("$web-define-product", "$web-plan-change"))
    await expect(validateHarness(callRoot)).rejects.toThrow(
      /default_prompt must call \$web-define-product/
    )

    const sentenceRoot = await copyRepository()
    const sentencePath = path.join(
      sentenceRoot,
      ".agents/skills/web-define-product/agents/openai.yaml"
    )
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
      const targetRoot = await copyRepository()
      const metadataPath = path.join(
        targetRoot,
        ".agents/skills/web-define-product/agents/openai.yaml"
      )
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

    const bodyRoot = await copyRepository()
    const bodyPath = path.join(bodyRoot, ".agents/skills/web-test-final-artifact-e2e/SKILL.md")
    const bodySource = await readFile(bodyPath, "utf8")
    await writeFile(bodyPath, `${bodySource}\n可以说明 Vite dev server 不能代替最终产物。\n`)
    await expect(validateHarness(bodyRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  /** 验证 rejects missing, unknown, or invalid Agent Policy fields 场景。 */
  test("rejects missing, unknown, or invalid Agent Policy fields", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const missingRoot = await copyRepository()
    const missingPath = path.join(missingRoot, "docs/AGENT_POLICY.md")
    const missingPolicy = await readFile(missingPath, "utf8")
    await writeFile(missingPath, missingPolicy.replace("confirmed_by: pending\n", ""))
    await expect(validateHarness(missingRoot)).rejects.toThrow(
      /Agent policy is missing confirmed_by/
    )

    const invalidRoot = await copyRepository()
    const invalidPath = path.join(invalidRoot, "docs/AGENT_POLICY.md")
    const invalidPolicy = await readFile(invalidPath, "utf8")
    await writeFile(
      invalidPath,
      invalidPolicy.replace("acceptance_smoke: pending", "acceptance_smoke: automatic")
    )
    await expect(validateHarness(invalidRoot)).rejects.toThrow(
      /Agent policy acceptance_smoke must be enabled, disabled, or pending/
    )

    const unknownRoot = await copyRepository()
    const unknownPath = path.join(unknownRoot, "docs/AGENT_POLICY.md")
    const unknownPolicy = await readFile(unknownPath, "utf8")
    await writeFile(
      unknownPath,
      unknownPolicy.replace("decision_mode:", "extra_switch: enabled\ndecision_mode:")
    )
    await expect(validateHarness(unknownRoot)).rejects.toThrow(/unknown field: extra_switch/)

    const resolvedSourceRoot = await copyRepository()
    const resolvedSourcePath = path.join(resolvedSourceRoot, "docs/AGENT_POLICY.md")
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
