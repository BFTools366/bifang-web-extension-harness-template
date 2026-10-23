import { describe, test } from "vitest"
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
  readdir,
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
    async (projectType) => {
      const root = await seedTemplateRoot()
      await initializeProject(options(root, projectType))
      const manifestPath = path.join(root, "package.json")
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
    expect(() => profileFromArgs(["--", "--profile", "test"])).toThrow(/Usage/)
  })

  /** 初始化只安装依赖，不执行 Git 或身份配置，安装失败保持短路。 */
  test("installs once without Git, formatting or building", async () => {
    const root = await temporaryDirectory("web-harness-post-init-")
    const commands: Array<{ command: string; args: string[]; root: string }> = []
    await runPostInitialization(
      { ...options(root, "web"), skipInstall: false },
      async (command, args, commandRoot) => {
        commands.push({ command, args, root: commandRoot })
      }
    )
    expect(commands).toEqual([
      {
        command: "pnpm",
        args: ["install", "--no-frozen-lockfile", "--prefer-offline"],
        root
      }
    ])
    const failedCommands: string[] = []
    await expect(
      runPostInitialization({ ...options(root, "web"), skipInstall: false }, async (command) => {
        failedCommands.push(command)
        throw new Error("install failed")
      })
    ).rejects.toThrow("install failed")
    expect(failedCommands).toEqual(["pnpm"])
  })

  /** 无需身份或仓库即可完成初始化后处理，已有工程文件保持原样。 */
  test("does not create Git metadata or require a Git identity", async () => {
    const root = await temporaryDirectory("web-harness-no-git-")
    await writeFile(path.join(root, "README.md"), "# Generated project\n")
    await runPostInitialization({ ...options(root, "web"), skipInstall: true }, async () => {
      throw new Error("No external command should run")
    })
    expect(await readdir(root)).toEqual(["README.md"])
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("# Generated project\n")
  })

  /** 验证 rejects invalid or colliding environment configuration before completion 场景。 */
  test("rejects invalid or colliding environment configuration before completion", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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

    const collisionRoot = await seedTemplateRoot()
    await writeFile(path.join(collisionRoot, ".env.test"), "USER_OWNED=true\n")
    await expect(initializeProject(options(collisionRoot, "web"))).rejects.toThrow(
      /Refusing to overwrite/
    )
    expect(await readFile(path.join(collisionRoot, ".env.test"), "utf8")).toBe("USER_OWNED=true\n")
  })

  /** 验证 rejects incomplete environment files during project validation 场景。 */
  test("rejects incomplete environment files during project validation", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
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
    const localOverrideRoot = await seedTemplateRoot()
    await initializeProject(options(localOverrideRoot, "web"))
    await writeFile(
      path.join(localOverrideRoot, ".env.production.local"),
      "VITE_API_BASE_URL=https://shadow.example.com\n"
    )
    await expect(validateProject(localOverrideRoot)).rejects.toThrow(
      /can silently override the governed profiles/
    )

    const publicSecretRoot = await seedTemplateRoot()
    await initializeProject(options(publicSecretRoot, "extension"))
    const environmentPath = path.join(publicSecretRoot, ".env.test")
    const environment = await readFile(environmentPath, "utf8")
    await writeFile(environmentPath, `${environment}PLASMO_PUBLIC_API_TOKEN=do-not-ship\n`)
    await expect(validateProject(publicSecretRoot)).rejects.toThrow(
      /undeclared public configuration: PLASMO_PUBLIC_API_TOKEN/
    )

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
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
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
    const root = await seedTemplateRoot()
    await initializeProject(options(root, "web"))
    const loggerPath = path.join(root, "src/observability/logger.ts")
    const logger = await readFile(loggerPath, "utf8")
    await writeFile(loggerPath, logger.replaceAll("SENSITIVE_KEY", "UNSAFE_KEY"))

    await expect(validateProject(root)).rejects.toThrow(
      /Structured logger is missing SENSITIVE_KEY/
    )
  })

  /** 验证 keeps extension protocol and built identity values as exact gates 场景。 */
  test("keeps extension protocol and built identity values as exact gates", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const sourceRoot = await seedTemplateRoot()
    await initializeProject(options(sourceRoot, "extension"))
    const sourceManifestPath = path.join(sourceRoot, "package.json")
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8")) as {
      manifest: Record<string, unknown>
    }
    sourceManifest.manifest.manifest_version = 4
    await writeFile(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`)
    await expect(validateProject(sourceRoot)).rejects.toThrow(/manifest_version must be derived/)

    const builtRoot = await seedTemplateRoot()
    await initializeProject(options(builtRoot, "extension"))
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
