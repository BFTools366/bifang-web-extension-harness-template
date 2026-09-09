import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import { realpath } from "node:fs/promises"
import { collectPromptedIdentity, confirmInstantiation } from "../.harness/tooling/prompts.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import {
  HARNESS_ONLY_PATHS,
  TEST_BASE_URLS,
  cp,
  expect,
  initializeProject,
  inspectReleaseArtifact,
  mkdir,
  options,
  parseArgs,
  path,
  profileFromArgs,
  readFile,
  readdir,
  refreshBrand,
  repositoryRoot,
  resolveInitOptions,
  rm,
  runPostInitialization,
  seedTemplateRoot,
  temporaryDirectory,
  validateEnvironmentFiles,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

describe("single-package Harness validation and governance", () => {
  /** 验证交互初始化首轮批量收集且只重问错误基础字段。 */
  test("collects missing basics in one round and only re-asks invalid fields", async () => {
    const questions: string[] = []
    const answers = [
      JSON.stringify({
        targetRoot: path.join(repositoryRoot, "..", "interactive-web"),
        projectType: "web",
        name: "Interactive Web",
        id: "Invalid_ID",
        description: "Interactive form contract.",
        developmentBaseUrl: TEST_BASE_URLS.developmentBaseUrl,
        testBaseUrl: TEST_BASE_URLS.testBaseUrl,
        releaseBaseUrl: "http://unsafe.example.com",
        policyMode: "custom",
        confirmedBy: "interactive-owner"
      }),
      JSON.stringify({
        id: "interactive-web",
        releaseBaseUrl: TEST_BASE_URLS.releaseBaseUrl
      }),
      "unexpected",
      "disabled",
      "enabled",
      "enabled",
      "disabled"
    ]
    const resolved = await collectPromptedIdentity({}, async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("Unexpected extra initialization question")
      return answer
    })

    expect(questions[0]).toContain("1. 源 Harness 外的目标目录")
    expect(questions[0]).toContain("JSON key: projectType")
    expect(questions[0]).toContain("JSON key: name")
    expect(questions[0]).toContain("JSON key: releaseBaseUrl")
    expect(questions[1]).toContain("JSON key: id")
    expect(questions[1]).toContain("JSON key: releaseBaseUrl")
    expect(questions[1]).not.toContain("JSON key: name")
    expect(questions[1]).not.toContain("JSON key: developmentBaseUrl")
    expect(questions[2]).toContain("Superpowers")
    expect(questions[3]).toContain("superpowers must be enabled or disabled")
    expect(questions[4]).toContain("并行 Worktree/Subagent")
    expect(questions[5]).toContain("完整候选冒烟")
    expect(questions[6]).toContain("构建 E2E 建议默认值")
    expect(answers).toEqual([])
    expect(resolved).toMatchObject({
      targetRoot: path.join(repositoryRoot, "..", "interactive-web"),
      projectType: "web",
      name: "Interactive Web",
      id: "interactive-web",
      brandColor: "#4C6EF5",
      inputSources: {
        id: "交互表单",
        releaseBaseUrl: "交互表单",
        superpowers: "交互条件问询"
      },
      agentPolicy: {
        confirmedBy: "interactive-owner",
        superpowers: "disabled",
        parallelWorktreeSubagents: "enabled",
        milestoneSmoke: "enabled",
        milestoneE2e: "disabled"
      }
    })
  })

  /** 验证公共创建入口拒绝相对目标与内部测试跳过参数。 */
  test("rejects relative targets and public skip flags before instantiation", async () => {
    let instantiated = false
    await expect(
      runInstantiateCli(["relative-target"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/absolute path/)
    await expect(
      runInstantiateCli([path.join(repositoryRoot, "public-skip"), "--skip-install"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/Unknown option\(s\): --skip-install/)
    await expect(
      runInstantiateCli([path.join(repositoryRoot, "public-skip"), "--skip-git"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/Unknown option\(s\): --skip-git/)
    expect(instantiated).toBe(false)
  })

  /** 验证交互入口把缺失目标与其他基础字段放入同一首轮表单。 */
  test("collects an omitted interactive target in the same first-round form", async () => {
    const parent = await temporaryDirectory("web-harness-target-form-")
    const targetRoot = path.join(parent, "form-target")
    const basicQuestions: string[] = []
    let instantiated = false
    await expect(
      runInstantiateCli(
        [
          "--type",
          "web",
          "--description",
          "Collects the target with missing identity fields.",
          "--development-base-url",
          TEST_BASE_URLS.developmentBaseUrl,
          "--test-base-url",
          TEST_BASE_URLS.testBaseUrl,
          "--release-base-url",
          TEST_BASE_URLS.releaseBaseUrl,
          "--policy-mode",
          "recommended",
          "--confirmed-by",
          "interactive-owner"
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async (question) => {
              basicQuestions.push(question)
              return JSON.stringify({
                targetRoot,
                name: "Form Target",
                id: "form-target"
              })
            }),
          confirm: async (summary) => {
            expect(summary.rawTargetRoot).toBe(targetRoot)
            expect(summary.inputSources.targetRoot).toBe("交互表单")
            return false
          },
          instantiate: async () => {
            instantiated = true
            throw new Error("must not instantiate")
          }
        }
      )
    ).rejects.toThrow(/cancelled before any target write/)

    expect(basicQuestions).toHaveLength(1)
    expect(basicQuestions[0]).toContain("JSON key: targetRoot")
    expect(basicQuestions[0]).toContain("JSON key: name")
    expect(basicQuestions[0]).toContain("JSON key: id")
    expect(basicQuestions[0]).not.toContain("JSON key: projectType")
    expect(instantiated).toBe(false)
    await expect(readdir(targetRoot)).rejects.toThrow()
  })

  /** 验证交互式完整汇总只确认一次且拒绝时保持目标零写入。 */
  test("confirms the complete interactive summary exactly once before writes", async () => {
    const parent = await temporaryDirectory("web-harness-confirmation-")
    const targetRoot = path.join(parent, "confirmed-web")
    const argv = [
      targetRoot,
      "--type",
      "web",
      "--name",
      "Confirmed Web",
      "--id",
      "confirmed-web",
      "--description",
      "Confirms all inputs before writing.",
      "--development-base-url",
      TEST_BASE_URLS.developmentBaseUrl,
      "--test-base-url",
      TEST_BASE_URLS.testBaseUrl,
      "--release-base-url",
      TEST_BASE_URLS.releaseBaseUrl,
      "--policy-mode",
      "recommended",
      "--confirmed-by",
      "interactive-owner"
    ]
    let confirmationCount = 0
    let instantiated = false
    await expect(
      runInstantiateCli(argv, {
        sourceRoot: repositoryRoot,
        interactive: true,
        promptIdentity: (defaults) =>
          collectPromptedIdentity(defaults, async () => {
            throw new Error("All supplied fields must be reused without another basic question")
          }),
        confirm: async (summary) => {
          expect(summary.rawSourceRoot).toBe(repositoryRoot)
          expect(summary.canonicalSourceRoot).toBe(repositoryRoot)
          expect(summary.rawTargetRoot).toBe(targetRoot)
          expect(summary.canonicalTargetRoot).toBe(
            path.join(await realpath(parent), "confirmed-web")
          )
          expect(summary.inputSources.targetRoot).toBe("命令行绝对位置参数")
          expect(summary.inputSources.brandColor).toBe("Harness 默认值")
          expect(summary.inputSources.superpowers).toBe("recommended 确定性预设")
          expect(summary.init.agentPolicy.confirmedBy).toBe("interactive-owner")
          return confirmInstantiation(summary, async (question) => {
            confirmationCount += 1
            expect(question).toContain(`源路径（原始）：${repositoryRoot}`)
            expect(question).toContain(`目标路径（原始）：${targetRoot}`)
            expect(question).toContain("targetRoot: 命令行绝对位置参数")
            expect(question).toContain("按此创建？")
            return "no"
          })
        },
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/cancelled before any target write/)

    expect(confirmationCount).toBe(1)
    expect(instantiated).toBe(false)
    await expect(readdir(targetRoot)).rejects.toThrow()
    expect(
      (await readdir(parent)).filter((entry) => entry.startsWith(".confirmed-web.harness-stage-"))
    ).toEqual([])
  })

  /** 验证 rejects combined, invalid, and repeated type options 场景。 */
  test("rejects combined, invalid, and repeated type options", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await expect(
      initializeProject({ ...options(root, "web"), projectType: "both" as "web" })
    ).rejects.toThrow(/exactly "web" or "extension"/)
    expect(
      /* 执行 当前声明 函数的处理逻辑。 */ () => parseArgs(["--type", "web", "--type", "extension"])
    ).toThrow(/only be provided once/)
    await expect(
      resolveInitOptions(
        parseArgs([
          "--type",
          "web,extension",
          "--name",
          "Mixed",
          "--id",
          "mixed",
          "--description",
          "Mixed project",
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
    ).rejects.toThrow(/exactly "web" or "extension"/)
  })

  /** 验证 rejects a non-Release artifact script in a generated %s project 场景。 */
  test.each(["web", "extension"] as const)(
    "rejects a non-Release artifact script in a generated %s project",
    /* 执行 当前声明 函数的处理逻辑。 */ async (projectType) => {
      // 保存 root 变量供当前逻辑使用。
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      // 保存 manifestPath 变量供当前逻辑使用。
      const manifestPath = path.join(root, "package.json")
      // 保存 manifest 变量供当前逻辑使用。
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        scripts: Record<string, string>
      }
      manifest.scripts["build:test"] = "echo forbidden"
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

      await expect(validateProject(root)).rejects.toThrow(
        /Final artifacts must be Release-only; remove build:test/
      )
    }
  )

  /** 验证 parses the profile arguments exactly as pnpm forwards them 场景。 */
  test("parses the profile arguments exactly as pnpm forwards them", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(profileFromArgs([])).toBeUndefined()
    expect(profileFromArgs(["--profile", "test"])).toBe("test")
    expect(
      /* 执行 当前声明 函数的处理逻辑。 */ () => profileFromArgs(["--", "--profile", "test"])
    ).toThrow(/Usage/)
  })

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
          "--description",
          "No environment URLs"
        ]),
        root
      )
    ).rejects.toThrow(/--development-base-url/)
  })

  /** 验证 installs once without formatting or building and stops before Git on failure 场景。 */
  test("installs once without formatting or building and stops before Git on failure", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供创建期命令计划测试使用。
    const root = await temporaryDirectory("web-harness-post-init-")
    // 保存 commands 变量记录创建期实际请求的外部命令。
    const commands: Array<{ command: string; args: string[]; root: string }> = []
    // 保存 commandRunner 变量并定义无副作用的命令观察器。
    const commandRunner = async (
      command: string,
      args: string[],
      commandRoot: string
    ): Promise<void> => {
      commands.push({ command, args, root: commandRoot })
    }
    await runPostInitialization(
      { ...options(root, "web"), skipInstall: false, skipGit: false },
      commandRunner,
      async () => undefined
    )
    expect(commands).toEqual([
      {
        command: "pnpm",
        args: ["install", "--no-frozen-lockfile", "--prefer-offline"],
        root
      },
      { command: "git", args: ["init", "-b", "main"], root }
    ])
    // 保存 requestedArguments 变量汇总全部创建期命令参数。
    const requestedArguments = commands.flatMap(
      /* 执行 当前声明 函数的处理逻辑。 */ (entry) => entry.args
    )
    expect(requestedArguments).not.toContain("format")
    expect(requestedArguments).not.toContain("build")

    // 保存 failedCommands 变量记录安装失败后的短路行为。
    const failedCommands: string[] = []
    // 保存 failingRunner 变量并定义确定性安装失败替身。
    const failingRunner = async (command: string): Promise<void> => {
      failedCommands.push(command)
      throw new Error("install failed")
    }
    await expect(
      runPostInitialization(
        { ...options(root, "web"), skipInstall: false, skipGit: false },
        failingRunner
      )
    ).rejects.toThrow("install failed")
    expect(failedCommands).toEqual(["pnpm"])
  })

  /** 验证公开初始化的 Git 阶段形成唯一、干净、受管且无远端的本地基线。 */
  test("creates one governed local baseline commit", async () => {
    const root = await temporaryDirectory("web-harness-git-baseline-")
    await writeFile(path.join(root, "README.md"), "# Generated project\n")

    await runPostInitialization({
      ...options(root, "web"),
      skipInstall: true,
      skipGit: false
    })

    // 保存 git 函数，用无 Shell 的真实命令读取临时仓库事实。
    const git = (args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
    expect(git(["branch", "--show-current"])).toBe("main")
    expect(git(["rev-list", "--count", "HEAD"])).toBe("1")
    expect(git(["log", "-1", "--pretty=%s"])).toBe("chore: initialize project")
    expect(git(["status", "--porcelain=v1"])).toBe("")
    expect(git(["remote"])).toBe("")
    expect(git(["config", "--local", "--get", "core.commentString"])).toBe("#")
  })

  /** 验证 rejects invalid or colliding environment configuration before completion 场景。 */
  test("rejects invalid or colliding environment configuration before completion", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 invalidRoot 变量供当前逻辑使用。
    const invalidRoot = await seedTemplateRoot()
    await expect(
      initializeProject({
        ...options(invalidRoot, "web"),
        releaseBaseUrl: "http://insecure.example.com/api"
      })
    ).rejects.toThrow(/Release API_BASE_URL must use https/)
    await expect(
      readFile(path.join(invalidRoot, ".harness/project.json"), "utf8")
    ).rejects.toThrow()

    // 保存 collisionRoot 变量供当前逻辑使用。
    const collisionRoot = await seedTemplateRoot()
    await writeFile(path.join(collisionRoot, ".env.test"), "USER_OWNED=true\n")
    await expect(initializeProject(options(collisionRoot, "web"))).rejects.toThrow(
      /Refusing to overwrite/
    )
    expect(await readFile(path.join(collisionRoot, ".env.test"), "utf8")).toBe("USER_OWNED=true\n")
  })

  /** 验证 rejects incomplete environment files during project validation 场景。 */
  test("rejects incomplete environment files during project validation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    await writeFile(
      path.join(root, ".env.test"),
      "PLASMO_PUBLIC_APP_ENV=test\nPLASMO_PUBLIC_LOG_LEVEL=info\nPLASMO_PUBLIC_REQUEST_TIMEOUT_MS=10000\n"
    )

    await expect(validateProject(root)).rejects.toThrow(/API_BASE_URL is required/)
  })

  /** 验证 rejects hidden environment overrides and undeclared public browser values 场景。 */
  test("rejects hidden environment overrides and undeclared public browser values", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 localOverrideRoot 变量供当前逻辑使用。
    const localOverrideRoot = await seedTemplateRoot()
    await initializeProject(options(localOverrideRoot, "web"))
    await writeFile(
      path.join(localOverrideRoot, ".env.production.local"),
      "VITE_API_BASE_URL=https://shadow.example.com\n"
    )
    await expect(validateProject(localOverrideRoot)).rejects.toThrow(
      /can silently override the governed profiles/
    )

    // 保存 publicSecretRoot 变量供当前逻辑使用。
    const publicSecretRoot = await seedTemplateRoot()
    await initializeProject(options(publicSecretRoot, "extension"))
    // 保存 environmentPath 变量供当前逻辑使用。
    const environmentPath = path.join(publicSecretRoot, ".env.test")
    // 保存 environment 变量供当前逻辑使用。
    const environment = await readFile(environmentPath, "utf8")
    await writeFile(environmentPath, `${environment}PLASMO_PUBLIC_API_TOKEN=do-not-ship\n`)
    await expect(validateProject(publicSecretRoot)).rejects.toThrow(
      /undeclared public configuration: PLASMO_PUBLIC_API_TOKEN/
    )

    // 保存 processOverrideRoot 变量供当前逻辑使用。
    const processOverrideRoot = await seedTemplateRoot()
    await initializeProject(options(processOverrideRoot, "web"))
    process.env.VITE_PRIVATE_TOKEN = "do-not-ship"
    try {
      await expect(validateEnvironmentFiles(processOverrideRoot, "release")).rejects.toThrow(
        /process environment contains undeclared public configuration: VITE_PRIVATE_TOKEN/
      )
    } finally {
      delete process.env.VITE_PRIVATE_TOKEN
    }
  })

  /** 验证 inspects release artifacts for profile leakage and source-only information 场景。 */
  test("inspects release artifacts for profile leakage and source-only information", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 artifactRoot 变量供当前逻辑使用。
    const artifactRoot = path.join(root, "dist")
    await mkdir(artifactRoot)
    await writeFile(
      path.join(artifactRoot, "index.html"),
      `<!doctype html><p>${TEST_BASE_URLS.releaseBaseUrl}</p><a href="https://public.example.com/home/user">Public route</a><script>console.warn("kept");console.error("kept")</script>\n`
    )
    await expect(inspectReleaseArtifact(root)).resolves.toMatchObject({
      artifactRoot: "dist",
      files: 1
    })

    await writeFile(
      path.join(artifactRoot, "index.html"),
      `<!doctype html><p>${TEST_BASE_URLS.developmentBaseUrl}</p>\n`
    )
    await expect(inspectReleaseArtifact(root)).rejects.toThrow(/non-release API BaseURL/)

    // 保存 method 变量供当前逻辑使用。
    for (const method of ["debug", "info"] as const) {
      await writeFile(
        path.join(artifactRoot, "index.html"),
        `<!doctype html><script>console.${method}("must not ship")</script>\n`
      )
      await expect(inspectReleaseArtifact(root)).rejects.toThrow(new RegExp(`console\\.${method}`))
    }
  })

  /** 验证 rejects drift from the release-safe structured logging contract 场景。 */
  test("rejects drift from the release-safe structured logging contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 loggerPath 变量供当前逻辑使用。
    const loggerPath = path.join(root, "src/observability/logger.ts")
    // 保存 logger 变量供当前逻辑使用。
    const logger = await readFile(loggerPath, "utf8")
    await writeFile(loggerPath, logger.replaceAll("SENSITIVE_KEY", "UNSAFE_KEY"))

    await expect(validateProject(root)).rejects.toThrow(
      /Structured logger is missing SENSITIVE_KEY/
    )
  })

  /** 验证 keeps extension protocol and built identity values as exact gates 场景。 */
  test("keeps extension protocol and built identity values as exact gates", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 sourceRoot 变量供当前逻辑使用。
    const sourceRoot = await seedTemplateRoot()
    await initializeProject(options(sourceRoot, "extension"))
    // 保存 sourceManifestPath 变量供当前逻辑使用。
    const sourceManifestPath = path.join(sourceRoot, "package.json")
    // 保存 sourceManifest 变量供当前逻辑使用。
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8")) as {
      manifest: Record<string, unknown>
    }
    sourceManifest.manifest.manifest_version = 4
    await writeFile(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`)
    await expect(validateProject(sourceRoot)).rejects.toThrow(/manifest_version must equal 3/)

    // 保存 builtRoot 变量供当前逻辑使用。
    const builtRoot = await seedTemplateRoot()
    await initializeProject(options(builtRoot, "extension"))
    // 保存 artifactRoot 变量供当前逻辑使用。
    const artifactRoot = path.join(builtRoot, "build/chrome-mv3-prod")
    await mkdir(artifactRoot, { recursive: true })
    await writeFile(path.join(artifactRoot, "popup.html"), "<!doctype html>\n")
    await writeFile(path.join(artifactRoot, "options.html"), "<!doctype html>\n")
    await writeFile(
      path.join(artifactRoot, "manifest.json"),
      `${JSON.stringify({
        manifest_version: 3,
        name: "Stale name",
        description: "Clip useful pages.",
        version: "0.1.0",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" }
      })}\n`
    )
    await expect(validateProject(builtRoot)).rejects.toThrow(/Extension build name is stale/)
  })

  /** 验证 keeps identity schemas exact while accepting only tooling at or above its baseline 场景。 */
  test("keeps identity schemas exact while accepting only tooling at or above its baseline", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 toolingRoot 变量供当前逻辑使用。
    const toolingRoot = await seedTemplateRoot()
    await initializeProject(options(toolingRoot, "web"))
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(toolingRoot, "package.json")
    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    manifest.devDependencies.typescript = "6.0.2"
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(toolingRoot)).rejects.toThrow(
      /typescript minimum must not be lower than 6\.0\.3/
    )

    // 保存 schemaRoot 变量供当前逻辑使用。
    const schemaRoot = await seedTemplateRoot()
    await initializeProject(options(schemaRoot, "web"))
    // 保存 configPath 变量供当前逻辑使用。
    const configPath = path.join(schemaRoot, ".harness/project.json")
    // 保存 config 变量供当前逻辑使用。
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.schemaVersion = 2
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await expect(validateProject(schemaRoot)).rejects.toThrow(/Unsupported project config schema/)
  })

  /** 验证 rejects repeat initialization without overwriting the project 场景。 */
  test("rejects repeat initialization without overwriting the project", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    // 保存 init 变量供当前逻辑使用。
    const init = options(root, "web")
    await initializeProject(init)
    await expect(initializeProject(init)).rejects.toThrow(/Refusing to overwrite/)
  })

  /** 验证 requires the generated data-access and event-stream knowledge in terminal projects 场景。 */
  test("requires the generated data-access and event-stream knowledge in terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "docs/DATA_ACCESS.md"))

    await expect(validateProject(root)).rejects.toThrow(/Missing docs\/DATA_ACCESS\.md/)
  })

  /** 验证 requires the generated Mantine UI guidelines in terminal projects 场景。 */
  test("requires the generated Mantine UI guidelines in terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    await rm(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateProject(root)).rejects.toThrow(/Missing docs\/MANTINE_UI_GUIDELINES\.md/)
  })

  /** 验证 rejects a missing Chinese declaration comment in a generated %s project 场景。 */
  test.each(["web", "extension"] as const)(
    "rejects a missing Chinese declaration comment in a generated %s project",
    /* 执行 当前声明 函数的处理逻辑。 */ async (projectType) => {
      // 保存 root 变量供当前逻辑使用。
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      // 保存 governedPath 变量供当前宿主的导出组件注释篡改使用。
      const governedPath = path.join(
        root,
        projectType === "web" ? "src/features/welcome/WelcomePage.tsx" : "src/ExtensionShell.tsx"
      )
      // 保存 governedSource 变量供移除真正受管的结构声明注释使用。
      const governedSource = await readFile(governedPath, "utf8")
      // 保存 withoutComment 变量供当前逻辑使用。
      const withoutComment = governedSource.replace(
        /\/\*\*[^*]*\*\/\nexport function (WelcomePage|ExtensionShell)/u,
        "export function $1"
      )
      expect(withoutComment).not.toBe(governedSource)
      await writeFile(governedPath, withoutComment)

      await expect(validateProject(root)).rejects.toThrow(/声明必须具有紧邻且包含汉字的业务注释/)
    }
  )

  /** 验证 rejects terminal Skill directory and Chinese metadata drift 场景。 */
  test("rejects terminal Skill directory and Chinese metadata drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 verifySkillRoot 变量供当前逻辑使用。
    const verifySkillRoot = path.join(root, ".agents/skills/web-verify-delivery")
    await rm(verifySkillRoot, { recursive: true, force: true })
    await expect(validateProject(root)).rejects.toThrow(/Terminal Skill directories must exactly/)

    await cp(path.join(repositoryRoot, ".agents/skills/web-verify-delivery"), verifySkillRoot, {
      recursive: true
    })
    // 保存 metadataPath 变量供当前逻辑使用。
    const metadataPath = path.join(verifySkillRoot, "agents/openai.yaml")
    // 保存 metadata 变量供当前逻辑使用。
    const metadata = await readFile(metadataPath, "utf8")
    await writeFile(
      metadataPath,
      metadata.replace("Web Harness：验证前端交付", "Rust Server：验证交付")
    )
    await expect(validateProject(root)).rejects.toThrow(/Rust\/Server language/)
  })

  /** 验证 rejects every source-only path finalized out of terminal projects 场景。 */
  test("rejects every source-only path finalized out of terminal projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 sourceOnlyPaths 变量供当前逻辑使用。
    const sourceOnlyPaths = HARNESS_ONLY_PATHS

    // 保存 relativePath 变量供当前逻辑使用。
    for (const relativePath of sourceOnlyPaths) {
      // 保存 sourceOnlyPath 变量供当前逻辑使用。
      const sourceOnlyPath = path.join(root, relativePath)
      await mkdir(path.dirname(sourceOnlyPath), { recursive: true })
      await writeFile(sourceOnlyPath, "source Harness residue\n")

      await expect(validateProject(root)).rejects.toThrow(
        `Terminal project retains ${relativePath}`
      )
      await rm(sourceOnlyPath, { recursive: true, force: true })
    }
  })

  /** 验证终端项目可在独立事件后创建受命名和索引约束的记忆。 */
  test("allows governed project memory after terminal initialization", async () => {
    // 保存 root 变量供终端可选记忆正反例使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 workPlanRoot 变量供创建合法索引与正文使用。
    const workPlanRoot = path.join(root, "docs/work_plan")
    await mkdir(workPlanRoot, { recursive: true })
    await writeFile(
      path.join(workPlanRoot, "README.md"),
      "# 工作计划索引\n\n- [当前计划](20260909_work_plan.md)\n"
    )
    await writeFile(path.join(workPlanRoot, "20260909_work_plan.md"), "# 当前计划\n")
    await expect(validateProject(root)).resolves.toContain("web")

    await writeFile(path.join(workPlanRoot, "20260909_scope_work_plan.md"), "# 非法计划\n")
    await expect(validateProject(root)).rejects.toThrow(
      /Invalid optional Work Plan entry: docs\/work_plan\/20260909_scope_work_plan\.md/u
    )
  })

  /** 验证 rejects drift from the shared pagination contract 场景。 */
  test("rejects drift from the shared pagination contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 paginationPath 变量供当前逻辑使用。
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(paginationPath, pagination.replaceAll("sessionStorage", "localStorage"))

    await expect(validateProject(root)).rejects.toThrow(/Pagination state must use/)
  })

  /** 验证 requires every shared pagination file in Web projects 场景。 */
  test("requires every shared pagination file in Web projects", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    await rm(path.join(root, "src/pagination/useSessionPagination.ts"))

    await expect(validateProject(root)).rejects.toThrow(
      /Missing src\/pagination\/useSessionPagination\.ts/
    )
  })

  /** 验证 rejects a pagination empty-page reconciliation drift 场景。 */
  test("rejects a pagination empty-page reconciliation drift", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    // 保存 paginationPath 变量供当前逻辑使用。
    const paginationPath = path.join(root, "src/pagination/useSessionPagination.ts")
    // 保存 pagination 变量供当前逻辑使用。
    const pagination = await readFile(paginationPath, "utf8")
    await writeFile(
      paginationPath,
      pagination.replace("result.items.length === 0", "result.items.length > 0")
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination contract is missing result\.items\.length === 0/
    )
  })

  /** 验证 rejects a missing pagination translation 场景。 */
  test("rejects a missing pagination translation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 localePath 变量供当前逻辑使用。
    const localePath = path.join(root, "src/i18n/locales/en.ts")
    // 保存 locale 变量供当前逻辑使用。
    const locale = await readFile(localePath, "utf8")
    await writeFile(
      localePath,
      locale.replace('paginationNext: "Next page",', 'paginationForward: "Next page",')
    )

    await expect(validateProject(root)).rejects.toThrow(
      /Pagination translations are missing paginationNext/
    )
  })

  /** 验证 rejects drift from the shared HTTP authentication contract 场景。 */
  test("rejects drift from the shared HTTP authentication contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "extension"))
    // 保存 clientPath 变量供当前逻辑使用。
    const clientPath = path.join(root, "src/api/client/httpClient.ts")
    // 保存 client 变量供当前逻辑使用。
    const client = await readFile(clientPath, "utf8")
    await writeFile(clientPath, client.replace('authToken: "X-AUTH-TOKEN"', 'authToken: "X-Token"'))

    await expect(validateProject(root)).rejects.toThrow(/HTTP client contract is missing/)
  })

  /** 验证 rejects drift from the Web file-route and code-splitting contract 场景。 */
  test("rejects drift from the Web file-route and code-splitting contract", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 missingPluginRoot 变量供当前逻辑使用。
    const missingPluginRoot = await seedTemplateRoot()
    await initializeProject(options(missingPluginRoot, "web"))
    // 保存 manifestPath 变量供当前逻辑使用。
    const manifestPath = path.join(missingPluginRoot, "package.json")
    // 保存 manifest 变量供当前逻辑使用。
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      devDependencies: Record<string, string>
    }
    delete manifest.devDependencies["@tanstack/router-plugin"]
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(validateProject(missingPluginRoot)).rejects.toThrow(
      /missing @tanstack\/router-plugin/
    )

    // 保存 disabledSplittingRoot 变量供当前逻辑使用。
    const disabledSplittingRoot = await seedTemplateRoot()
    await initializeProject(options(disabledSplittingRoot, "web"))
    // 保存 viteConfigPath 变量供当前逻辑使用。
    const viteConfigPath = path.join(disabledSplittingRoot, "vite.config.ts")
    // 保存 viteConfig 变量供当前逻辑使用。
    const viteConfig = await readFile(viteConfigPath, "utf8")
    await writeFile(
      viteConfigPath,
      viteConfig.replace("autoCodeSplitting: true", "autoCodeSplitting: false")
    )
    await expect(validateProject(disabledSplittingRoot)).rejects.toThrow(/autoCodeSplitting/)
  })

  /** 验证 refreshes generated branding deterministically from edited identity 场景。 */
  test("refreshes generated branding deterministically from edited identity", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    // 保存 configPath 变量供当前逻辑使用。
    const configPath = path.join(root, ".harness/project.json")
    // 保存 config 变量供当前逻辑使用。
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
    config.name = "Renamed Aurora"
    config.id = "renamed-aurora"
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

    await refreshBrand(root)
    // 保存 first 变量供当前逻辑使用。
    const first = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    await refreshBrand(root)
    // 保存 second 变量供当前逻辑使用。
    const second = await readFile(path.join(root, ".harness/brand/logo-1024.png"))
    // 保存 paginationTest 变量供当前逻辑使用。
    const paginationTest = await readFile(
      path.join(root, "src/pagination/pagination.test.tsx"),
      "utf8"
    )
    expect(first.equals(second)).toBe(true)
    expect(await readFile(path.join(root, "index.html"), "utf8")).toContain("Renamed Aurora")
    expect(paginationTest).toContain('import { BRAND } from "../brand"')
    expect(paginationTest).toContain('BRAND.id + ":pagination:v1:orders"')
    expect(paginationTest).not.toContain("aurora-notes:pagination:v1")
  })
})
