import { execFileSync } from "node:child_process"
import { symlink } from "node:fs/promises"
import { describe, expect, test } from "vitest"
import { parseArgs } from "../.harness/tooling/args.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import {
  extensionIdentityFiles,
  identityLocales,
  validateIdentityI18n,
  validateIdentityLocales
} from "../.harness/tooling/identity.ts"
import {
  collectPromptedIdentity as collectIdentity,
  formatInstantiationSummary
} from "../.harness/tooling/prompts.ts"

/** 本组测试聚焦原有字段；服务来源在 Workspace 表单用例独立覆盖。 */
const collectPromptedIdentity: typeof collectIdentity = (defaults, ask, validateTarget) =>
  collectIdentity({ serverMode: "create", ...defaults }, ask, validateTarget)
import { inspectReleaseArtifact } from "../.harness/tooling/release.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import {
  initializeProject,
  cp,
  mkdir,
  options,
  path,
  readFile,
  repositoryRoot,
  seedTemplateRoot,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 保存真实提供的简体中文身份翻译，用于成功及漂移回归。 */
const identityI18n = {
  defaultLocale: "en",
  translations: {
    zh_CN: { name: "极光剪藏", description: "保存有用的页面。" }
  }
} as const

describe("localized identity and visible brand initialization", () => {
  /** 验证扩展根身份与翻译的超长输入只重问对应字段，保留其他已确认值。 */
  test.each([
    { field: "name", value: "N".repeat(76), answer: "Clipper", lateType: false },
    { field: "description", value: "D".repeat(133), answer: "Clip useful pages.", lateType: false },
    {
      field: "identityI18n",
      value: JSON.stringify({
        defaultLocale: "en",
        translations: { zh_CN: { name: "名".repeat(76), description: "说明" } }
      }),
      answer: JSON.stringify(identityI18n),
      lateType: false
    },
    {
      field: "identityI18n",
      value: JSON.stringify({
        defaultLocale: "en",
        translations: { zh_CN: { name: "名称", description: "说".repeat(133) } }
      }),
      answer: JSON.stringify(identityI18n),
      lateType: false
    },
    { field: "name", value: "N".repeat(76), answer: "Clipper", lateType: true }
  ])(
    "repairs overlong $field with late type=$lateType",
    async ({ field, value, answer, lateType }) => {
      const questions: string[] = []
      const resolved = await collectPromptedIdentity(
        {
          ...{
            targetRoot: path.resolve("..", "clipper"),
            projectType: lateType ? undefined : "extension",
            name: "Clipper",
            id: "clipper",
            description: "Clip useful pages.",
            policyMode: "预设",
            [field]: value
          },
          requirementsFile: ""
        },
        async (question) => {
          questions.push(question)
          return question.includes("字段： projectType") ? "extension" : answer
        }
      )
      expect(questions).toHaveLength(lateType ? 2 : 1)
      expect(questions.at(-1)).toContain(`字段： ${field}`)
      expect(resolved).toMatchObject({
        name: "Clipper",
        id: "clipper",
        description: "Clip useful pages."
      })
      expect(resolved.inputSources[field]).toBe(field === "identityI18n" ? "交互表单" : "交互问答")
      expect(resolved.inputSources.id).toBe("命令行参数")
      if (field === "identityI18n") expect(resolved.identityI18n).toBe(JSON.stringify(identityI18n))
    }
  )

  /** 验证浏览器身份上限不会错误应用到 Web 身份。 */
  test("preserves long Web identity without extra questions", async () => {
    const resolved = await collectPromptedIdentity(
      {
        ...{
          targetRoot: path.resolve("..", "long-web"),
          projectType: "web",
          name: "N".repeat(76),
          id: "long-web",
          description: "D".repeat(133),
          policyMode: "预设"
        },
        requirementsFile: ""
      },
      async () => {
        throw new Error("Web identity must not be re-prompted")
      }
    )
    expect(resolved.name).toHaveLength(76)
    expect(resolved.description).toHaveLength(133)
  })

  /** 验证 CLI 在创建前拒绝缺失扩展说明，并保留 Web 默认行为。 */
  test("requires extension descriptions before any instantiation write", async () => {
    const args = [
      "--server",
      "create",
      "--type",
      "extension",
      "--name",
      "Clipper",
      "--id",
      "clipper",
      "--policy-mode",
      "预设"
    ]
    for (const suffix of [[], ["--description", " "]]) {
      await expect(
        resolveInitOptions(parseArgs([...args, ...suffix]), "/tmp/clipper", { interactive: false })
      ).rejects.toThrow(/description is required/)
    }
    let writes = 0
    await expect(
      runInstantiateCli([path.join(repositoryRoot, ".."), ...args], {
        sourceRoot: repositoryRoot,
        interactive: false,
        instantiate: async () => {
          writes += 1
          throw new Error("Should never write")
        }
      })
    ).rejects.toThrow(/description is required/)
    expect(writes).toBe(0)
  })

  /** 验证类型已知时只问说明，类型晚解析及空白说明则条件补问。 */
  test("asks only unresolved extension descriptions", async () => {
    const defaults = {
      targetRoot: path.join(repositoryRoot, "..", "clipper"),
      name: "Clipper",
      id: "clipper",
      policyMode: "预设"
    }
    const questions: string[] = []
    const answers = ["extension", " ", "Clip useful pages."]
    const resolved = await collectPromptedIdentity(
      { ...defaults, requirementsFile: "" },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("Unexpected extra question")
        return answer
      }
    )
    expect(questions).toHaveLength(3)
    expect(questions[0]).toContain("字段： projectType")
    expect(questions[0]).not.toContain("字段： description")
    expect(questions[1]).toContain("字段： description")
    expect(questions[1]).not.toContain("字段： name")
    expect(resolved.description).toBe("Clip useful pages.")
    expect(resolved.inputSources.description).toBe("交互问答")
    for (const projectType of [" extension ", " 2 "]) {
      const conditionalQuestions: string[] = []
      await collectPromptedIdentity(
        { ...{ ...defaults, projectType }, requirementsFile: "" },
        async (question) => {
          conditionalQuestions.push(question)
          return JSON.stringify({ description: "Explicit extension description" })
        }
      )
      expect(conditionalQuestions).toHaveLength(1)
      expect(conditionalQuestions[0]).toContain("字段： description")
    }

    await expect(
      collectPromptedIdentity(
        {
          ...{ ...defaults, projectType: "extension", description: "Already supplied" },
          requirementsFile: ""
        },
        async () => {
          throw new Error("Valid supplied description must not be asked again")
        }
      )
    ).resolves.toMatchObject({ description: "Already supplied" })
  })

  /** 验证未知/不完整翻译不能进入配置，默认语言身份不能重复漂移。 */
  test("rejects malformed translations and browser identity lengths", async () => {
    for (const value of [
      null,
      [],
      { defaultLocale: "../en", translations: {} },
      { defaultLocale: "en", translations: { zh_CN: { name: "只有名字" } } },
      { defaultLocale: "en", translations: { en: { name: "Other", description: "Other" } } },
      { defaultLocale: "en", translations: { fr: { name: "Other", description: "Other" } } },
      { ...identityI18n, unexpected: true }
    ]) {
      expect(() => validateIdentityI18n(value)).toThrow()
    }
    const root = await seedTemplateRoot()
    const base = options(root, "extension")
    expect(() => createProjectConfig({ ...base, name: "a".repeat(76) })).toThrow(/75/)
    expect(() =>
      createProjectConfig({
        ...base,
        identityI18n: {
          defaultLocale: "en",
          translations: {
            zh_CN: { name: "扩展", description: "字".repeat(133) }
          }
        }
      })
    ).toThrow(/132/)
    const config = createProjectConfig({ ...base, identityI18n })
    expect(identityLocales(config).zh_CN).toEqual(identityI18n.translations.zh_CN)
    const dollars = extensionIdentityFiles({ ...config, name: "Costs $5", description: "Save $10" })
    expect(JSON.parse(dollars.get("locales/en/messages.json") ?? "{}").projectName.message).toBe(
      "Costs $$5"
    )
    const chinese = createProjectConfig({
      ...base,
      name: "中文名称",
      description: "默认说明",
      identityI18n: { defaultLocale: "zh_CN", translations: {} }
    })
    expect(identityLocales(chinese).en.name).toBe("中文名称")
  })

  /** 模拟 Plasmo 解析前环境展开，消息原始 JSON 不能泄露环境值。 */
  test("protects literal dollar text from Plasmo environment interpolation", async () => {
    const root = await seedTemplateRoot()
    const config = createProjectConfig({
      ...options(root, "extension"),
      name: "Toolkit $HOME",
      description: "Save $PLASMO_PUBLIC_KEY and $10"
    })
    const source = extensionIdentityFiles(config).get("locales/en/messages.json") ?? ""
    const mockEnv: Record<string, string> = {
      HOME: "mock-home-marker",
      PLASMO_PUBLIC_KEY: "mock-key-marker"
    }
    const injected = source.replace(/\$([\w+]+)/gm, (match, key: string) => mockEnv[key] || match)
    expect(injected).toBe(source)
    expect(source).not.toContain("$")
    expect(JSON.parse(injected).projectName.message).toBe("Toolkit $$HOME")
  })

  /** 验证两宿主保留身份翻译资源，扩展使用真实 Plasmo locales 入口。 */
  test.each(["web", "extension"] as const)(
    "generates localized %s identity and brand summary",
    async (projectType) => {
      const root = await seedTemplateRoot()
      const init = { ...options(root, projectType), identityI18n }
      const config = await initializeProject(init)
      await expect(validateProject(root)).resolves.toContain(projectType)
      const brand = await readFile(path.join(root, "src/brand.ts"), "utf8")
      expect(brand).toContain("极光剪藏")
      const locale = await readFile(
        path.join(root, projectType === "web" ? "src/i18n/locales/zh.ts" : "src/i18n.ts"),
        "utf8"
      )
      expect(locale).toContain("...BRAND.identity.zh")
      expect(brand).toContain("projectName")
      expect(brand).toContain("projectDescription")
      const summary = formatInstantiationSummary({
        rawSourceRoot: repositoryRoot,
        canonicalSourceRoot: repositoryRoot,
        rawTargetRoot: root,
        canonicalTargetRoot: root,
        inputSources: {},
        policyMode: "custom",
        init
      })
      expect(summary).toContain(".harness/brand/logo-1024.png")
      expect(summary).toContain(projectType === "web" ? "public/favicon.png" : "assets/icon.png")
      expect(summary).toContain("极光剪藏")
      if (projectType === "extension") {
        const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
        expect(manifest.manifest).toMatchObject({
          default_locale: "en",
          name: "__MSG_projectName__",
          description: "__MSG_projectDescription__"
        })
        expect(
          JSON.parse(await readFile(path.join(root, "locales/zh_CN/messages.json"), "utf8"))
            .projectName.message
        ).toBe("极光剪藏")
        await writeFile(path.join(root, "locales/zh_CN/messages.json"), "{}")
        await expect(validateProject(root)).rejects.toThrow(/Identity locale.*stale/)
        const errors: string[] = []
        await validateIdentityLocales(root, config, "_locales", errors)
        expect(errors).toHaveLength(2)
      }
      await writeFile(path.join(root, "src/brand.ts"), brand.replace("极光剪藏", "过期身份"))
      await expect(validateProject(root)).rejects.toThrow(/localized identity is stale/)
    }
  )

  /** 新产物在构建后检查消息完整性，旧身份不能阻止源码重建。 */
  test("inspects built locales after construction and permits stale artifacts before rebuilding", async () => {
    const root = await seedTemplateRoot()
    await initializeProject({ ...options(root, "extension"), identityI18n })
    const buildRoot = path.join(root, "build/chrome-mv3-prod")
    await mkdir(buildRoot, { recursive: true })
    await writeFile(path.join(buildRoot, "popup.html"), "<main>0.1.0</main>")
    await writeFile(path.join(buildRoot, "options.html"), "<main>Options</main>")
    const metadata = {
      manifest_version: 3,
      version: "0.1.0",
      default_locale: "en",
      name: "__MSG_projectName__",
      description: "__MSG_projectDescription__",
      action: { default_popup: "popup.html" },
      options_ui: { page: "options.html" }
    }
    await writeFile(path.join(buildRoot, "manifest.json"), JSON.stringify(metadata))
    await expect(validateProject(root)).resolves.toContain("extension")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/Missing identity locale/)
    for (const locale of ["en", "zh_CN"]) {
      await mkdir(path.join(buildRoot, "_locales", locale), { recursive: true })
      await writeFile(
        path.join(buildRoot, "_locales", locale, "messages.json"),
        await readFile(path.join(root, "locales", locale, "messages.json"))
      )
    }
    const firefoxRoot = path.join(root, "build/firefox-mv2-prod")
    await cp(buildRoot, firefoxRoot, { recursive: true })
    const firefoxMetadata: Record<string, unknown> = {
      ...metadata,
      manifest_version: 2,
      browser_action: metadata.action
    }
    delete firefoxMetadata.action
    await writeFile(path.join(firefoxRoot, "manifest.json"), JSON.stringify(firefoxMetadata))
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({ buildVersion: "0.1.0" })
    await writeFile(path.join(buildRoot, "_locales/zh_CN/messages.json"), "{}")
    await expect(validateProject(root)).resolves.toContain("extension")
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/Identity locale.*stale/)
    await writeFile(
      path.join(buildRoot, "manifest.json"),
      JSON.stringify({ ...metadata, default_locale: "zh_CN" })
    )
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/default_locale is stale/)
  })

  /** 实际执行生成的终端刷新命令，确认翻译持久化且其他浏览器消息保留。 */
  test("terminal refresh preserves translations and product messages", async () => {
    const root = await seedTemplateRoot()
    await initializeProject({ ...options(root, "extension"), identityI18n })
    await symlink(
      path.join(repositoryRoot, "node_modules"),
      path.join(root, "node_modules"),
      "junction"
    )
    const localePath = path.join(root, "locales/zh_CN/messages.json")
    const messages = JSON.parse(await readFile(localePath, "utf8"))
    await writeFile(
      localePath,
      JSON.stringify({ ...messages, userMessage: { message: "保留 $PLASMO_PUBLIC_QUOTE_AUTHOR" } })
    )
    const configPath = path.join(root, ".harness/project.json")
    const config = JSON.parse(await readFile(configPath, "utf8"))
    config.identityI18n.translations.zh_CN.name = "更新剪藏 $HOME"
    await writeFile(configPath, JSON.stringify(config))
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
      import { refreshBrand } from ${JSON.stringify(path.join(root, ".harness/tooling/brand.ts"))};
      await refreshBrand(${JSON.stringify(root)});
    `
      ],
      { cwd: root }
    )
    expect(
      JSON.parse(await readFile(configPath, "utf8")).identityI18n.translations.zh_CN.name
    ).toBe("更新剪藏 $HOME")
    expect(JSON.parse(await readFile(localePath, "utf8"))).toMatchObject({
      projectName: { message: "更新剪藏 $$HOME" },
      userMessage: { message: "保留 $PLASMO_PUBLIC_QUOTE_AUTHOR" }
    })
    expect(await readFile(localePath, "utf8")).not.toContain("$HOME")
    expect(await readFile(localePath, "utf8")).toContain("$PLASMO_PUBLIC_QUOTE_AUTHOR")
    await expect(validateProject(root)).resolves.toContain("extension")
  })
})
