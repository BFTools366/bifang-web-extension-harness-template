import { execFileSync } from "node:child_process"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"
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
  seedTemplateRoot,
  sharp,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 验证 single-package Harness initialization 的完整回归场景。 */
describe("single-package Harness initialization", () => {
  /** 验证 uses the stable color default and keeps E2E outside initialization 场景。 */
  test("uses the stable color default and keeps E2E outside initialization", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    // 保存 resolved 变量供当前逻辑使用。
    const resolved = await resolveInitOptions(
      parseArgs([
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

  /** 验证精简表单无需说明、地址与确认来源，且中文预设只需一轮。 */
  test("collects only required identity and Chinese preset fields", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity({ confirmedBy: " " }, async (question) => {
      questions.push(question)
      return JSON.stringify({
        targetRoot: path.join(repositoryRoot, "..", "simple-web"),
        projectType: "web",
        name: "Simple Web",
        id: "simple-web",
        policyMode: "预设"
      })
    })
    expect(questions).toHaveLength(1)
    expect(questions[0]?.match(/JSON key:/g)).toHaveLength(5)
    for (const key of ["projectType", "name", "id", "targetRoot", "policyMode"]) {
      expect(questions[0]).toContain(`JSON key: ${key}`)
    }
    expect(questions[0]).not.toContain("JSON key: brandColor")
    for (const key of [
      "description",
      "developmentBaseUrl",
      "testBaseUrl",
      "releaseBaseUrl",
      "confirmedBy"
    ]) {
      expect(questions[0]).not.toContain(`JSON key: ${key}`)
    }
    expect(resolved).toMatchObject({
      description: "Simple Web",
      developmentBaseUrl: "",
      testBaseUrl: "",
      releaseBaseUrl: "",
      policyMode: "recommended",
      agentPolicy: { confirmedBy: "当前用户" },
      inputSources: { description: "默认使用显示名称", confirmedBy: "当前用户（自动记录）" }
    })
  })

  /** 验证双宿主可在地址全部留空时初始化，正式 profile 仍要求 HTTPS 地址。 */
  test.each(["web", "extension"] as const)(
    "initializes %s with deferred API configuration",
    async (projectType) => {
      const root = await seedTemplateRoot()
      const resolved = await resolveInitOptions(
        parseArgs([
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
    // 保存 root 变量供预处理 Logo 复用测试使用。
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
