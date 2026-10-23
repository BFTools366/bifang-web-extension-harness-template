import { execFileSync, spawnSync } from "node:child_process"
import { collectPromptedIdentity as collectIdentity } from "../.harness/tooling/prompts.ts"

/** 本组测试聚焦原有字段；服务来源在 Workspace 表单用例独立覆盖。 */
const collectPromptedIdentity: typeof collectIdentity = (defaults, ask, validateTarget) =>
  collectIdentity({ serverMode: "create", ...defaults }, ask, validateTarget)
import { describe, test } from "vitest"
import {
  TEST_BASE_URLS,
  expect,
  initializeProject,
  options,
  parseArgs,
  repositoryRoot,
  resolveInitOptions,
  validateEnvironmentFiles,
  path,
  readFile,
  readdir,
  seedTemplateRoot,
  sharp,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 验证初始化只完整分发下游原型工作流，业务记录与原型不在创建时产生。 */
async function expectPrototypeWorkflowDistributed(root: string): Promise<void> {
  for (const skillPath of [
    ".agents/skills/web-design-prototype/SKILL.md",
    ".agents/skills/web-design-prototype/agents/openai.yaml",
    ".agents/skills/web-design-prototype/scripts/prototype-review.ts",
    ".agents/skills/web-define-product/references/prd-outline.md",
    ".agents/skills/web-define-product/references/requirements-analysis.md",
    ".agents/skills/web-compose-capabilities/references/requirements-selection.md"
  ]) {
    expect(await readFile(path.join(root, skillPath), "utf8")).toBe(
      await readFile(path.join(repositoryRoot, skillPath), "utf8")
    )
  }
  for (const directory of ["docs/product_spec", "docs/prototypes"]) {
    await expect(readdir(path.join(root, directory))).rejects.toThrow()
  }
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>
  }
  expect(manifest.scripts["prototype:check"]).toContain("prototype-review.ts check")
  const reviewCli = spawnSync(
    process.execPath,
    [
      path.join(root, ".agents/skills/web-design-prototype/scripts/prototype-review.ts"),
      "check",
      "settings"
    ],
    { cwd: root, encoding: "utf8" }
  )
  expect(reviewCli.status).toBe(1)
  expect(reviewCli.stderr).toContain("No prototype review")
  expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain(
    "不做 A/B 选择或 Mobile 设计"
  )
}

/** 验证两宿主的产品远端读取失败关闭，本地功能与隔离测试边界保持明确。 */
async function expectRealRemoteAndLocalBoundaryDocs(root: string): Promise<void> {
  const dataAccess = await readFile(path.join(root, "docs/DATA_ACCESS.md"), "utf8")
  const runtimeRules = await readFile(path.join(root, "docs/RUNTIME_CONFIGURATION.md"), "utf8")
  const implementationSkill = await readFile(
    path.join(root, ".agents/skills/web-implement-change/SKILL.md"),
    "utf8"
  )
  expect(dataAccess).toContain("产品运行路径不装配业务 Mock")
  expect(dataAccess).toContain("禁止失败后自动回落 Mock")
  expect(runtimeRules).toContain("DATA_ACCESS.md")
  expect(runtimeRules).toContain("逐项补问本次操作依赖的环境与服务 BaseURL/target")
  expect(implementationSkill).toContain("$web-connect-http-service")
  const connectionSkill = await readFile(
    path.join(root, ".agents/skills/web-connect-http-service/SKILL.md"),
    "utf8"
  )
  expect(connectionSkill).toContain("逐项补问阻断缺项")
  const engineeringRules = await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8")
  expect(engineeringRules).toContain("## 渐进式交互引导")
  expect(engineeringRules).toContain("沉默、超时或预选项不算批准")
  expect(connectionSkill).toContain("真实请求失败不得回落 Mock")
  expect(connectionSkill).toContain("本地实现继续真实运行，不纳入 Mock 迁移")
  expect(implementationSkill).toContain("产品运行路径只用真实 typed API")
  for (const source of [
    dataAccess,
    runtimeRules,
    implementationSkill,
    connectionSkill,
    await readFile(path.join(root, "docs/ENGINEERING_RULES.md"), "utf8"),
    await readFile(path.join(root, "src/data/README.md"), "utf8")
  ]) {
    expect(source).toContain("本地能力直接真实实现，不要求 BaseURL")
    expect(source).not.toMatch(
      /(?:未配置|为空|空地址).{0,80}(?:进入 Mock|由 API 层 Mock 提供|仅 Mock 远端边界)/u
    )
  }
  for (const relative of ["AGENTS.md", "src/data/api/README.md"]) {
    const source = await readFile(path.join(root, relative), "utf8")
    expect(source).toContain("本地能力无需 BaseURL，直接真实实现")
  }
}

/** 验证 single-package Harness initialization 的完整回归场景。 */
describe("single-package Harness initialization", () => {
  /** 验证 uses the stable color default and keeps E2E outside initialization 场景。 */
  test("uses the stable color default and keeps E2E outside initialization", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    const resolved = await resolveInitOptions(
      parseArgs([
        "--server",
        "create",
        "--type",
        "web",
        "--name",
        "Default Brand",
        "--id",
        "default-brand",
        "--description",
        "Uses the default color",
        "--development-base-url",
        TEST_BASE_URLS.developmentBaseUrl,
        "--test-base-url",
        TEST_BASE_URLS.testBaseUrl,
        "--release-base-url",
        TEST_BASE_URLS.releaseBaseUrl,
        "--policy-mode",
        "recommended",
        "--confirmed-by",
        "test-owner"
      ]),
      root
    )
    expect(resolved.brandColor).toBe("#4C6EF5")
    expect(resolved).not.toHaveProperty("e2e")
    await expect(resolveInitOptions(parseArgs(["--e2e", "disabled"]), root)).rejects.toThrow(
      /Unknown option\(s\): --e2e/
    )
    await expect(
      resolveInitOptions(
        parseArgs(["--name", "Missing Type", "--id", "missing-type", "--description", "No type"]),
        root
      )
    ).rejects.toThrow(/--type/)

    await expect(
      resolveInitOptions(
        parseArgs([
          "--server",
          "create",
          "--type",
          "web",
          "--name",
          "Missing URLs",
          "--id",
          "missing-urls",
          "--policy-mode",
          "预设"
        ]),
        root
      )
    ).resolves.toMatchObject({
      description: "Missing URLs",
      developmentBaseUrl: "",
      testBaseUrl: "",
      releaseBaseUrl: "",
      agentPolicy: { confirmedBy: "当前用户" }
    })
  })

  /** 验证逐项普通回答与建议值可完成初始化，可选字段无需补问。 */
  test("collects only required identity and Chinese preset fields", async () => {
    const questions: string[] = []
    const answers = ["web", "Simple Web", path.join(repositoryRoot, "..", "simple-web")]
    const resolved = await collectPromptedIdentity(
      { ...{ confirmedBy: " " }, requirementsFile: "" },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("Unexpected extra initialization question")
        return answer
      }
    )
    const fields = ["projectType", "name", "targetRoot"]
    expect(questions).toHaveLength(fields.length)
    for (const [index, field] of fields.entries()) {
      expect(questions[index]).toContain(`字段： ${field}`)
      expect(questions[index]?.match(/字段：/g)).toHaveLength(1)
    }
    expect(resolved.id).toBe("simple-web")
    expect(questions.join("\n")).not.toContain("字段： policyMode")
    for (const key of [
      "description",
      "identityI18n",
      "brandColor",
      "developmentBaseUrl",
      "testBaseUrl",
      "releaseBaseUrl",
      "confirmedBy"
    ]) {
      expect(questions.join("\n")).not.toContain(`字段： ${key}`)
    }
    expect(answers).toEqual([])
    expect(resolved).toMatchObject({
      description: "Simple Web",
      developmentBaseUrl: "",
      testBaseUrl: "",
      releaseBaseUrl: "",
      policyMode: "recommended",
      agentPolicy: { confirmedBy: "当前用户" },
      inputSources: {
        id: "英文名称自动生成",
        policyMode: "默认预设",
        description: "默认使用显示名称",
        confirmedBy: "当前用户（自动记录）"
      }
    })
  })

  /** 验证双宿主可在地址全部留空时初始化，正式 profile 仍要求 HTTPS 地址。 */
  test.each(["web", "extension"] as const)(
    "initializes %s with deferred API configuration",
    async (projectType) => {
      const root = await seedTemplateRoot()
      const resolved = await resolveInitOptions(
        parseArgs([
          "--server",
          "create",
          "--type",
          projectType,
          "--name",
          "Deferred API",
          "--id",
          "deferred-api",
          "--policy-mode",
          "预设",
          ...(projectType === "extension" ? ["--description", "Deferred API extension"] : [])
        ]),
        root,
        { interactive: false }
      )
      await initializeProject({ ...resolved, skipInstall: true, skipGit: true })
      await expect(validateProject(root)).resolves.toContain(projectType)
      await expectPrototypeWorkflowDistributed(root)
      await expectRealRemoteAndLocalBoundaryDocs(root)
      for (const profile of [undefined, "development", "test"] as const) {
        const configs = await validateEnvironmentFiles(root, profile)
        expect(configs.development.apiBaseUrl).toBe("")
        expect(configs.test.apiBaseUrl).toBe("")
        expect(configs.release.apiBaseUrl).toBe("")
      }
      await expect(validateEnvironmentFiles(root, "release")).rejects.toThrow(
        /Release API_BASE_URL is required/
      )
      const prefix = projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
      const productionPath = path.join(root, ".env.production")
      const production = await readFile(productionPath, "utf8")
      await writeFile(
        productionPath,
        production.replace(
          `${prefix}API_BASE_URL=`,
          `${prefix}API_BASE_URL=https://api.example.com`
        )
      )
      await expect(validateEnvironmentFiles(root, "release")).resolves.toMatchObject({
        release: { apiBaseUrl: "https://api.example.com" }
      })
      execFileSync(process.execPath, [
        "--input-type=module",
        "--eval",
        `
      import assert from "node:assert/strict";
      import { createAppConfig } from ${JSON.stringify(path.join(root, "src/config/environment.schema.ts"))};
      for (const appEnv of ["development", "test"]) {
        assert.equal(createAppConfig({ appEnv, apiBaseUrl: "", logLevel: "info", requestTimeoutMs: "10000" }).apiBaseUrl, "");
      }
      for (const apiBaseUrl of [undefined, "", "http://api.example.com"]) {
        assert.throws(() => createAppConfig({ appEnv: "release", apiBaseUrl, logLevel: "warn", requestTimeoutMs: "10000" }));
      }
    `
      ])
    }
  )

  /** 验证 reuses a preflighted uploaded Logo without reopening its source 场景。 */
  test("reuses a preflighted uploaded Logo without reopening its source", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    // 保存 preparedLogo 变量模拟源 Harness 已完成的单次上传压缩结果。
    const preparedLogo = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 38, g: 70, b: 83, alpha: 1 }
      }
    })
      .png()
      .toBuffer()
    await initializeProject(
      {
        ...options(root, "extension"),
        logoPath: path.join(root, "already-removed-upload.png")
      },
      preparedLogo
    )
    expect(await readFile(path.join(root, ".harness/brand/logo-1024.png"))).toEqual(preparedLogo)
    expect(await readFile(path.join(root, "assets/icon.png"))).toEqual(preparedLogo)
  })
})
