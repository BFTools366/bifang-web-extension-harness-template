import { describe, test } from "vitest"
import { execFileSync } from "node:child_process"
import {
  TEST_BASE_URLS,
  expect,
  initializeProject,
  inspectReleaseArtifact,
  mkdir,
  options,
  path,
  profileFromArgs,
  readFile,
  runPostInitialization,
  seedTemplateRoot,
  temporaryDirectory,
  validateEnvironmentFiles,
  validateProject,
  writeFile
} from "./harness-tooling-support.ts"

/** 验证 terminal runtime and release governance 的完整回归场景。 */
describe("terminal runtime and release governance", () => {
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
      "PLASMO_PUBLIC_API_BASE_URL=\nPLASMO_PUBLIC_LOG_LEVEL=info\nPLASMO_PUBLIC_REQUEST_TIMEOUT_MS=10000\n"
    )

    await expect(validateProject(root)).rejects.toThrow(/APP_ENV must be test/)
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
    await expect(validateProject(sourceRoot)).rejects.toThrow(/manifest_version must be derived/)

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
    await expect(validateProject(builtRoot)).resolves.toContain("extension")
    await expect(inspectReleaseArtifact(builtRoot)).rejects.toThrow(/Extension build name is stale/)
  })
})
