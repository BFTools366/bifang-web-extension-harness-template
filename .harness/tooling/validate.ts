import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { derivedLogoPaths } from "./brand.ts"
import { HARNESS_ONLY_PATHS, loadProjectConfig, MASTER_LOGO_PATH } from "./config.ts"
import { pathExists, readJson, walkFiles } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { deriveLogoAssets } from "./logo.ts"
import { ENVIRONMENT_FILES, validateEnvironmentFiles } from "./environment.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "./version.ts"
import { inspectProjectChineseComments } from "./comment-policy.ts"

/** 保存终端项目必须精确保留的 Web Harness 前端维护 Skill。 */
const EXPECTED_TERMINAL_SKILLS = [
  "web-check-development-environment",
  "web-define-product",
  "web-extract-i18n-strings",
  "web-implement-change",
  "web-plan-change",
  "web-prepare-brand-identity",
  "web-prepare-release",
  "web-refactor-code",
  "web-run-parallel-worktrees",
  "web-test-final-artifact-e2e",
  "web-upgrade-harness",
  "web-verify-delivery"
] as const

/** 从 Codex Skill 元数据中读取一个双引号包裹的单行字段。 */
function quotedSkillMetadataField(source: string, field: string): string | undefined {
  // 保存 match 变量供当前逻辑使用。
  const match = new RegExp(`^\\s*${field}: "([^"]*)"$`, "mu").exec(source)
  return match?.[1]
}

/** 校验终端只暴露精确的 Web 前端 Skill 目录及中文调用元数据。 */
async function validateTerminalSkills(root: string, errors: string[]): Promise<void> {
  // 保存 skillsRoot 变量供当前逻辑使用。
  const skillsRoot = path.join(root, ".agents/skills")
  // 保存 actualSkills 变量供当前逻辑使用。
  let actualSkills: string[]
  try {
    actualSkills = (await readdir(skillsRoot)).sort()
  } catch {
    errors.push("Missing .agents/skills")
    return
  }

  // 保存 expectedSkills 变量供当前逻辑使用。
  const expectedSkills = [...EXPECTED_TERMINAL_SKILLS].sort()
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
    errors.push(
      `Terminal Skill directories must exactly equal ${EXPECTED_TERMINAL_SKILLS.join(", ")}`
    )
  }

  // 保存 skillName 变量供当前逻辑使用。
  for (const skillName of EXPECTED_TERMINAL_SKILLS) {
    // 保存 skillPath 变量供当前逻辑使用。
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md")
    // 保存 metadataPath 变量供当前逻辑使用。
    const metadataPath = path.join(skillsRoot, skillName, "agents/openai.yaml")
    // 保存 skillExists 变量供当前逻辑使用。
    const skillExists = await pathExists(skillPath)
    // 保存 metadataExists 变量供当前逻辑使用。
    const metadataExists = await pathExists(metadataPath)
    if (!skillExists) errors.push(`Terminal Skill ${skillName} is missing SKILL.md`)
    if (!metadataExists) errors.push(`Terminal Skill ${skillName} is missing agents/openai.yaml`)
    if (!skillExists || !metadataExists) continue
    // 保存 [skillSource, metadataSource] 变量供当前逻辑使用。
    const [skillSource, metadataSource] = await Promise.all([
      readFile(skillPath, "utf8"),
      readFile(metadataPath, "utf8")
    ])
    // 保存 description 变量供当前逻辑使用。
    const description = /^description: (.+)$/mu.exec(skillSource)?.[1]
    // 保存 displayName 变量供当前逻辑使用。
    const displayName = quotedSkillMetadataField(metadataSource, "display_name")
    // 保存 shortDescription 变量供当前逻辑使用。
    const shortDescription = quotedSkillMetadataField(metadataSource, "short_description")
    // 保存 defaultPrompt 变量供当前逻辑使用。
    const defaultPrompt = quotedSkillMetadataField(metadataSource, "default_prompt")
    if (!skillSource.startsWith(`---\nname: ${skillName}\n`)) {
      errors.push(`Terminal Skill ${skillName} frontmatter name is invalid`)
    }
    if (!skillSource.includes("\n# Web Harness：")) {
      errors.push(`Terminal Skill ${skillName} title must use Web Harness Chinese naming`)
    }
    if (description === undefined || !/\p{Script=Han}/u.test(description)) {
      errors.push(`Terminal Skill ${skillName} description must be Chinese`)
    }
    if (displayName === undefined || !/^Web Harness：\p{Script=Han}/u.test(displayName)) {
      errors.push(`Terminal Skill ${skillName} display_name must use Chinese Web Harness naming`)
    }
    if (shortDescription === undefined || !/\p{Script=Han}/u.test(shortDescription)) {
      errors.push(`Terminal Skill ${skillName} short_description must be Chinese`)
    }
    if (
      defaultPrompt === undefined ||
      !/\p{Script=Han}/u.test(defaultPrompt) ||
      !defaultPrompt.includes(`使用 $${skillName}`)
    ) {
      errors.push(`Terminal Skill ${skillName} default_prompt must call $${skillName}`)
    }
    if (/\b(?:Rust|Server)\b/iu.test(`${description ?? ""}\n${metadataSource}`)) {
      errors.push(`Terminal Skill ${skillName} contains non-Web Rust/Server language`)
    }
  }
}

// 执行 requirePaths 函数的处理逻辑。
async function requirePaths(
  root: string,
  paths: readonly string[],
  errors: string[]
): Promise<void> {
  // 保存 exists 变量供当前逻辑使用。
  const exists = await Promise.all(
    paths.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) =>
        pathExists(path.join(root, relativePath))
    )
  )
  paths.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (relativePath, index) => {
      if (!exists[index]) errors.push(`Missing ${relativePath}`)
    }
  )
}

// 执行 recordField 函数的处理逻辑。
function recordField(manifest: Record<string, unknown>, key: string): Record<string, string> {
  // 保存 value 变量供当前逻辑使用。
  const value = manifest[key]
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, string>
}

// 执行 dependenciesOf 函数的处理逻辑。
function dependenciesOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "dependencies")
}

// 执行 scriptsOf 函数的处理逻辑。
function scriptsOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "scripts")
}

// 执行 assertScripts 函数的处理逻辑。
function assertScripts(
  scripts: Record<string, string>,
  expected: Record<string, string>,
  errors: string[],
  label = "package.json script"
): void {
  // 保存 [name, expectedValue] 变量供当前逻辑使用。
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (scripts[name] !== expectedValue) errors.push(`${label} ${name} is invalid`)
  }
}

// 执行 packageNameOf 函数的处理逻辑。
function packageNameOf(specifier: string): string | undefined {
  // 保存 segments 变量供当前逻辑使用。
  const segments = specifier.split("/")
  if (specifier.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined
  }
  return segments[0]
}

// 执行 findExternalizedRuntimeDependencies 函数的处理逻辑。
export function findExternalizedRuntimeDependencies(
  source: string,
  runtimeDependencies: readonly string[]
): string[] {
  // 保存 dependencies 变量供当前逻辑使用。
  const dependencies = new Set(runtimeDependencies)
  // 保存 externalized 变量供当前逻辑使用。
  const externalized = new Set<string>()
  // 保存 selfMapping 变量供当前逻辑使用。
  const selfMapping = /"((?:@[a-zA-Z0-9._~-]+\/)?[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~+-]+)*)":"\1"/g

  // 保存 match 变量供当前逻辑使用。
  for (const match of source.matchAll(selfMapping)) {
    // 保存 specifier 变量供当前逻辑使用。
    const specifier = match[1]
    if (specifier === undefined) continue
    // 保存 packageName 变量供当前逻辑使用。
    const packageName = packageNameOf(specifier)
    if (packageName !== undefined && dependencies.has(packageName)) {
      externalized.add(specifier)
    }
  }

  return [...externalized].sort()
}

// 执行 validateLogos 函数的处理逻辑。
async function validateLogos(root: string, config: ProjectConfig, errors: string[]): Promise<void> {
  // 保存 masterPath 变量供当前逻辑使用。
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  if (!(await pathExists(masterPath))) return
  // 保存 master 变量供当前逻辑使用。
  const master = await readFile(masterPath)
  // 保存 metadata 变量供当前逻辑使用。
  const metadata = await sharp(master).metadata()
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.format !== "png") {
    errors.push(`${MASTER_LOGO_PATH} must be a 1024x1024 PNG`)
  }
  // 保存 expectedAssets 变量供当前逻辑使用。
  const expectedAssets = await deriveLogoAssets(config.projectType, master)
  // 保存 relativePath 变量供当前逻辑使用。
  for (const relativePath of derivedLogoPaths(config)) {
    // 保存 derivedPath 变量供当前逻辑使用。
    const derivedPath = path.join(root, relativePath)
    if (await pathExists(derivedPath)) {
      // 保存 derived 变量供当前逻辑使用。
      const derived = await readFile(derivedPath)
      // 保存 expected 变量供当前逻辑使用。
      const expected = expectedAssets.get(relativePath)
      if (expected === undefined || !expected.equals(derived)) {
        errors.push(`${relativePath} is not synchronized with the master logo`)
      }
    }
  }
}

// 保存 PAGINATION_TRANSLATION_KEYS 变量供当前逻辑使用。
const PAGINATION_TRANSLATION_KEYS = [
  "paginationNavigation",
  "paginationPage",
  "paginationPrevious",
  "paginationNext",
  "paginationPageSize"
] as const

// 执行 validatePagination 函数的处理逻辑。
async function validatePagination(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  // 保存 sourcePath 变量供当前逻辑使用。
  const sourcePath = path.join(root, "src/pagination/useSessionPagination.ts")
  // 保存 controlsPath 变量供当前逻辑使用。
  const controlsPath = path.join(root, "src/pagination/PaginationControls.tsx")
  if (await pathExists(sourcePath)) {
    // 保存 source 变量供当前逻辑使用。
    const source = await readFile(sourcePath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of [
      "sessionStorage",
      "BRAND.id",
      "pagination:v1:",
      "PAGE_SIZES = [10, 20, 50, 100] as const",
      "result.requestedPage === request.page",
      "result.requestedPageSize === request.pageSize",
      "result.items.length === 0",
      'query.status === "success"',
      "!query.isFetching",
      "!query.isPlaceholderData",
      "request.page > 1"
    ]) {
      if (!source.includes(contract)) errors.push(`Pagination contract is missing ${contract}`)
    }
    if (source.includes("localStorage") || source.includes("chrome.storage")) {
      errors.push("Pagination state must use page-local sessionStorage")
    }
  }
  if (await pathExists(controlsPath)) {
    // 保存 controls 变量供当前逻辑使用。
    const controls = await readFile(controlsPath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of ["Pagination", "Select", "labels", "onPageChange", "onPageSizeChange"]) {
      if (!controls.includes(contract)) {
        errors.push(`Pagination controls are missing ${contract}`)
      }
    }
  }

  // 保存 translationPaths 变量供当前逻辑使用。
  const translationPaths =
    config.projectType === "web"
      ? ["src/i18n/locales/en.ts", "src/i18n/locales/zh.ts"]
      : ["src/i18n.ts"]
  // 保存 relativePath 变量供当前逻辑使用。
  for (const relativePath of translationPaths) {
    // 保存 translationPath 变量供当前逻辑使用。
    const translationPath = path.join(root, relativePath)
    if (!(await pathExists(translationPath))) continue
    // 保存 translations 变量供当前逻辑使用。
    const translations = await readFile(translationPath, "utf8")
    // 保存 minimumOccurrences 变量供当前逻辑使用。
    const minimumOccurrences = config.projectType === "extension" ? 2 : 1
    // 保存 key 变量供当前逻辑使用。
    for (const key of PAGINATION_TRANSLATION_KEYS) {
      if (translations.split(`${key}:`).length - 1 < minimumOccurrences) {
        errors.push(`Pagination translations are missing ${key} in ${relativePath}`)
      }
    }
  }
}

// 执行 validateHttpFoundation 函数的处理逻辑。
async function validateHttpFoundation(root: string, errors: string[]): Promise<void> {
  // 保存 languagePath 变量供当前逻辑使用。
  const languagePath = path.join(root, "src/i18n/language.ts")
  if (await pathExists(languagePath)) {
    // 保存 language 变量供当前逻辑使用。
    const language = await readFile(languagePath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of [
      "BRAND.id",
      "localStorage",
      "initialApplicationLanguage",
      "initializeLanguage",
      "getRequestLanguage",
      "changeApplicationLanguage"
    ]) {
      if (!language.includes(contract)) errors.push(`Language contract is missing ${contract}`)
    }
  }

  // 保存 clientPath 变量供当前逻辑使用。
  const clientPath = path.join(root, "src/api/client/httpClient.ts")
  if (await pathExists(clientPath)) {
    // 保存 client 变量供当前逻辑使用。
    const client = await readFile(clientPath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of [
      "APP_CONFIG",
      'continuation: "X-Http-Request"',
      'language: "X-Lang"',
      'authToken: "X-AUTH-TOKEN"',
      "extractAuthToken",
      "response.clone()",
      'redirect: "error"',
      "authRevision",
      "unauthorizedLatched",
      "createLoginUnauthorizedHandler",
      'logger.warn("http.unauthorized"',
      'logger.error("http.request_failed"'
    ]) {
      if (!client.includes(contract)) errors.push(`HTTP client contract is missing ${contract}`)
    }
    if (client.includes("localStorage") || client.includes("sessionStorage")) {
      errors.push("HTTP continuation and authentication state must remain in memory")
    }
  }
}

// 执行 validateWeb 函数的处理逻辑。
async function validateWeb(root: string, config: ProjectConfig, errors: string[]): Promise<void> {
  await requirePaths(
    root,
    [
      ".gitignore",
      "index.html",
      "vite.config.ts",
      "src/main.tsx",
      "src/api/README.md",
      "src/app/AppProviders.tsx",
      "src/app/router.tsx",
      "src/app/queryClient.ts",
      "src/app/theme.ts",
      "src/features/not-found/NotFoundPage.tsx",
      "src/features/welcome/WelcomePage.tsx",
      "src/features/welcome/WelcomePage.test.tsx",
      "src/features/welcome/welcomeCount.atom.ts",
      "src/i18n/index.ts",
      "src/i18n/locales/en.ts",
      "src/i18n/locales/zh.ts",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/observability/logger.ts",
      "src/observability/logger.test.ts"
    ],
    errors
  )
  if (
    (await pathExists(path.join(root, "src/popup.tsx"))) ||
    (await pathExists(path.join(root, "src/options.tsx")))
  ) {
    errors.push("Web project contains extension entrypoints")
  }
  if (await pathExists(path.join(root, "index.html"))) {
    // 保存 index 变量供当前逻辑使用。
    const index = await readFile(path.join(root, "index.html"), "utf8")
    if (!index.includes(`<title>${config.name}</title>`)) errors.push("index.html title is stale")
    if (!index.includes(config.description)) errors.push("index.html description is stale")
    if (!index.includes(config.brand.primaryColor)) errors.push("index.html theme color is stale")
    if (!index.includes("/favicon.png")) errors.push("index.html favicon is missing")
  }
  // 保存 gitignorePath 变量供当前逻辑使用。
  const gitignorePath = path.join(root, ".gitignore")
  if (await pathExists(gitignorePath)) {
    // 保存 gitignore 变量供当前逻辑使用。
    const gitignore = await readFile(gitignorePath, "utf8")
    if (!gitignore.split(/\r?\n/).includes("src/routeTree.gen.ts")) {
      errors.push("Web project must ignore generated src/routeTree.gen.ts")
    }
  }
  // 保存 viteConfigPath 变量供当前逻辑使用。
  const viteConfigPath = path.join(root, "vite.config.ts")
  if (await pathExists(viteConfigPath)) {
    // 保存 viteConfig 变量供当前逻辑使用。
    const viteConfig = await readFile(viteConfigPath, "utf8")
    // 保存 routerPlugin 变量供当前逻辑使用。
    const routerPlugin = viteConfig.indexOf("tanstackRouter(")
    // 保存 reactPlugin 变量供当前逻辑使用。
    const reactPlugin = viteConfig.indexOf("react()")
    if (!viteConfig.includes("@tanstack/router-plugin/vite")) {
      errors.push("Web Vite config is missing the TanStack Router plugin")
    }
    if (routerPlugin < 0 || reactPlugin < 0 || routerPlugin > reactPlugin) {
      errors.push("TanStack Router Vite plugin must run before the React plugin")
    }
    if (!viteConfig.includes("autoCodeSplitting: true")) {
      errors.push("Web Vite config must enable route autoCodeSplitting")
    }
    if (
      !viteConfig.includes('routesDirectory: "./src/routes"') ||
      !viteConfig.includes('generatedRouteTree: "./src/routeTree.gen.ts"')
    ) {
      errors.push("Web Vite config has an invalid file-route contract")
    }
    if (
      !viteConfig.includes("sourcemap: false") ||
      !viteConfig.includes("rolldownOptions") ||
      !viteConfig.includes('manualPureFunctions: ["console.debug", "console.info"]') ||
      viteConfig.includes("esbuild:")
    ) {
      errors.push("Web release build must omit source maps and low-level console output")
    }
  }
}

// 执行 validateExtension 函数的处理逻辑。
async function validateExtension(
  root: string,
  config: ProjectConfig,
  manifest: Record<string, unknown>,
  errors: string[]
): Promise<void> {
  await requirePaths(
    root,
    [
      "src/popup.tsx",
      "src/options.tsx",
      "src/ExtensionShell.tsx",
      "src/i18n.ts",
      "src/providers.tsx",
      "src/observability/logger.ts",
      "src/observability/logger.test.ts",
      "src/observability/AppErrorBoundary.tsx",
      "src/observability/AppErrorBoundary.test.tsx",
      ".harness/tooling/comment-policy.ts",
      "assets/icon.png"
    ],
    errors
  )
  if (
    (await pathExists(path.join(root, "index.html"))) ||
    (await pathExists(path.join(root, "vite.config.ts")))
  ) {
    errors.push("Extension project contains Web entrypoints")
  }
  if (manifest.displayName !== config.name) errors.push("Extension displayName is stale")
  // 保存 targets 变量供当前逻辑使用。
  const targets = manifest.targets as Record<string, unknown> | undefined
  // 保存 defaultTarget 变量供当前逻辑使用。
  const defaultTarget = targets?.default as Record<string, unknown> | undefined
  if (defaultTarget?.context !== "browser" || defaultTarget.includeNodeModules !== true) {
    errors.push("Extension default Parcel target must use browser context and include node_modules")
  }
  // 保存 shellPath 变量供当前逻辑使用。
  const shellPath = path.join(root, "src/ExtensionShell.tsx")
  if (await pathExists(shellPath)) {
    // 保存 shell 变量供当前逻辑使用。
    const shell = await readFile(shellPath, "utf8")
    if (!shell.includes("unhandledrejection") || !shell.includes("createLogger")) {
      errors.push("Extension surfaces must install the structured global error logger")
    }
    if (!shell.includes('process.env.PLASMO_PUBLIC_APP_ENV !== "release"')) {
      errors.push("Extension startup logging must use a same-module compile-time release guard")
    }
  }
  // 保存 browserManifest 变量供当前逻辑使用。
  const browserManifest = manifest.manifest
  if (browserManifest === null || typeof browserManifest !== "object") {
    errors.push("Extension manifest metadata is missing")
  } else {
    // 保存 metadata 变量供当前逻辑使用。
    const metadata = browserManifest as Record<string, unknown>
    if (metadata.manifest_version !== 3) errors.push("Extension manifest_version must equal 3")
    if (metadata.name !== config.name) errors.push("Extension manifest name is stale")
    if (metadata.description !== config.description)
      errors.push("Extension manifest description is stale")
  }

  // 保存 buildRoot 变量供当前逻辑使用。
  const buildRoot = path.join(root, "build/chrome-mv3-prod")
  if (await pathExists(buildRoot)) {
    await requirePaths(
      root,
      ["build/chrome-mv3-prod/popup.html", "build/chrome-mv3-prod/options.html"],
      errors
    )
    // 保存 builtManifestPath 变量供当前逻辑使用。
    const builtManifestPath = path.join(buildRoot, "manifest.json")
    if (!(await pathExists(builtManifestPath))) {
      errors.push("Extension build is missing manifest.json")
    } else {
      // 保存 builtManifest 变量供当前逻辑使用。
      const builtManifest = await readJson<Record<string, unknown>>(builtManifestPath)
      // 保存 action 变量供当前逻辑使用。
      const action = builtManifest.action as Record<string, unknown> | undefined
      // 保存 options 变量供当前逻辑使用。
      const options = builtManifest.options_ui as Record<string, unknown> | undefined
      if (builtManifest.manifest_version !== 3) {
        errors.push("Extension build manifest_version must equal 3")
      }
      if (builtManifest.name !== config.name) errors.push("Extension build name is stale")
      if (builtManifest.description !== config.description) {
        errors.push("Extension build description is stale")
      }
      if (builtManifest.version !== manifest.version)
        errors.push("Extension build version is stale")
      if (action?.default_popup !== "popup.html")
        errors.push("Extension build is missing popup entry")
      if (options?.page !== "options.html") errors.push("Extension build is missing options entry")
    }
    // 保存 runtimeDependencies 变量供当前逻辑使用。
    const runtimeDependencies = Object.keys(dependenciesOf(manifest))
    // 保存 bundlePaths 变量供当前逻辑使用。
    const bundlePaths = await walkFiles(buildRoot, {
      /* 执行 当前声明 函数的处理逻辑。 */ filter: (name) => name.endsWith(".js")
    })
    // 保存 bundleSources 变量供当前逻辑使用。
    const bundleSources = await Promise.all(
      bundlePaths.map(
        /* 执行 当前声明 函数的处理逻辑。 */ (bundlePath) => readFile(bundlePath, "utf8")
      )
    )
    bundlePaths.forEach(
      /* 执行 当前声明 函数的处理逻辑。 */ (bundlePath, index) => {
        // 保存 source 变量供当前逻辑使用。
        const source = bundleSources[index]
        if (source === undefined) return
        // 保存 specifier 变量供当前逻辑使用。
        for (const specifier of findExternalizedRuntimeDependencies(source, runtimeDependencies)) {
          errors.push(
            `Extension build leaves ${specifier} as an unresolved browser dependency in ${path.relative(root, bundlePath)}`
          )
        }
      }
    )
  }
}

// 执行 validateProject 函数的处理逻辑。
export async function validateProject(rootInput: string): Promise<string[]> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 config 变量供当前逻辑使用。
  const config = await loadProjectConfig(root)
  // 保存 errors 变量供当前逻辑使用。
  const errors: string[] = []
  await requirePaths(
    root,
    [
      ".harness/tooling/cli.ts",
      ".harness/tooling/comment-policy.ts",
      ".harness/tooling/environment.ts",
      ".harness/tooling/release.ts",
      ".harness/tooling/version.ts",
      "tsconfig.json",
      ...Object.values(ENVIRONMENT_FILES),
      "src/brand.ts",
      "src/api/client/httpClient.test.ts",
      "src/api/client/httpClient.ts",
      "src/config/environment.schema.ts",
      "src/config/environment.ts",
      "src/config/environment.test.ts",
      "src/i18n/language.test.ts",
      "src/i18n/language.ts",
      "src/pagination/PaginationControls.tsx",
      "src/pagination/pagination.test.tsx",
      "src/pagination/useSessionPagination.ts",
      "src/observability/logger.ts",
      "src/observability/logger.test.ts",
      "src/observability/AppErrorBoundary.tsx",
      "src/observability/AppErrorBoundary.test.tsx",
      MASTER_LOGO_PATH,
      "docs/README.md",
      "docs/DATA_ACCESS.md",
      "docs/ENGINEERING_RULES.md",
      "docs/MANTINE_UI_GUIDELINES.md",
      "docs/LOGGING.md",
      "docs/RELEASE.md",
      "docs/RUNTIME_CONFIGURATION.md",
      "docs/TECH_DEBT.md"
    ],
    errors
  )
  await validateTerminalSkills(root, errors)

  // 保存 forbiddenMonorepoPaths 变量供当前逻辑使用。
  const forbiddenMonorepoPaths = ["pnpm-workspace.yaml", "apps", "packages"] as const
  // 保存 forbiddenMonorepoPathsExist 变量供当前逻辑使用。
  const forbiddenMonorepoPathsExist = await Promise.all(
    forbiddenMonorepoPaths.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (forbidden) => pathExists(path.join(root, forbidden))
    )
  )
  forbiddenMonorepoPaths.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (forbidden, index) => {
      if (forbiddenMonorepoPathsExist[index]) errors.push(`Forbidden monorepo path: ${forbidden}`)
    }
  )

  // 保存 manifest 变量供当前逻辑使用。
  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if (manifest.name !== config.id) errors.push("package.json name does not match project id")
  if (manifest.description !== config.description) errors.push("package.json description is stale")
  if ("workspaces" in manifest) errors.push("package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  // 保存 dependencies 变量供当前逻辑使用。
  const dependencies = dependenciesOf(manifest)
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies = recordField(manifest, "devDependencies")
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = scriptsOf(manifest)
  // 保存 [dependency, minimum] 变量供当前逻辑使用。
  for (const [dependency, minimum] of [
    ["typescript", "6.0.3"],
    ["vitest", "4.1.10"],
    ["eslint", "10.8.1"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies[dependency], minimum)) {
      errors.push(`${dependency} minimum must not be lower than ${minimum}`)
    }
  }
  // 保存 removedScript 变量供当前逻辑使用。
  for (const removedScript of ["harness:init", "instantiate", "validate:harness"]) {
    if (removedScript in scripts) errors.push(`Terminal project must not expose ${removedScript}`)
  }
  // 保存 removedPathsExist 变量供当前逻辑使用。
  const removedPathsExist = await Promise.all(
    HARNESS_ONLY_PATHS.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (removedPath) => pathExists(path.join(root, removedPath))
    )
  )
  HARNESS_ONLY_PATHS.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (removedPath, index) => {
      if (removedPathsExist[index]) errors.push(`Terminal project retains ${removedPath}`)
    }
  )
  assertScripts(
    scripts,
    {
      "comments:check": "tsx .harness/tooling/comment-policy.ts check",
      "env:validate": "tsx .harness/tooling/environment.ts validate",
      "release:inspect": "tsx .harness/tooling/release.ts inspect",
      build: "pnpm build:release",
      lint: "eslint . && pnpm comments:check"
    },
    errors
  )
  // 保存 required 变量供当前逻辑使用。
  for (const required of [
    "react",
    "@mantine/core",
    "@tanstack/react-query",
    "jotai",
    "i18next",
    "react-i18next"
  ]) {
    if (!(required in dependencies)) errors.push(`Missing dependency ${required}`)
  }

  // 保存 loggerPath 变量供当前逻辑使用。
  const loggerPath = path.join(root, "src/observability/logger.ts")
  if (await pathExists(loggerPath)) {
    // 保存 logger 变量供当前逻辑使用。
    const logger = await readFile(loggerPath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of [
      "SENSITIVE_KEY",
      "RELEASE_ALLOWED_KEYS",
      'config.environment === "release"',
      "[REDACTED]",
      "[Circular]"
    ]) {
      if (!logger.includes(contract)) errors.push(`Structured logger is missing ${contract}`)
    }
    // 保存 releaseGuard 变量供当前逻辑使用。
    const releaseGuard =
      config.projectType === "web"
        ? 'import.meta.env.VITE_APP_ENV === "release"'
        : 'process.env.PLASMO_PUBLIC_APP_ENV === "release"'
    if (!logger.includes(releaseGuard)) {
      errors.push("Structured logger is missing the host-local compile-time release guard")
    }
  }

  await validatePagination(root, config, errors)
  await validateHttpFoundation(root, errors)

  // 保存 tsconfig 变量供当前逻辑使用。
  const tsconfig = await readJson<Record<string, unknown>>(path.join(root, "tsconfig.json"))
  // 保存 tsconfigInclude 变量供当前逻辑使用。
  const tsconfigInclude = Array.isArray(tsconfig.include)
    ? tsconfig.include.filter(
        /* 执行 当前声明 函数的处理逻辑。 */ (entry): entry is string => typeof entry === "string"
      )
    : []
  if (config.projectType === "extension" && !tsconfigInclude.includes(".plasmo/index.d.ts")) {
    errors.push("Extension tsconfig must include .plasmo/index.d.ts before Plasmo starts")
  }
  if (config.projectType === "web" && tsconfigInclude.includes(".plasmo/index.d.ts")) {
    errors.push("Web tsconfig must not include .plasmo/index.d.ts")
  }

  if (config.projectType === "web") {
    if (!("@tanstack/react-router" in dependencies))
      errors.push("Web project is missing TanStack Router")
    // 保存 required 变量供当前逻辑使用。
    for (const required of ["@tanstack/router-cli", "@tanstack/router-plugin"]) {
      if (!(required in devDependencies)) errors.push(`Web project is missing ${required}`)
    }
    if (scripts["routes:generate"] !== "tsr generate") {
      errors.push("Web project is missing the route generation script")
    }
    assertScripts(
      scripts,
      {
        dev: "pnpm env:validate --profile development && vite --mode development",
        "build:development":
          "pnpm env:validate --profile development && vite build --mode development && tsc --noEmit",
        "build:test": "pnpm env:validate --profile test && vite build --mode test && tsc --noEmit",
        "build:release":
          "pnpm env:validate --profile release && vite build --mode production && tsc --noEmit && pnpm release:inspect",
        test: "pnpm env:validate --profile test && pnpm routes:generate && vitest run",
        typecheck: "pnpm env:validate && pnpm routes:generate && tsc --noEmit"
      },
      errors,
      "Web script"
    )
    if ("plasmo" in dependencies || "plasmo" in devDependencies) {
      errors.push("Web project must not depend on Plasmo")
    }
    await validateWeb(root, config, errors)
  } else {
    if ("@tanstack/react-router" in dependencies)
      errors.push("Extension must not include TanStack Router")
    // 保存 forbidden 变量供当前逻辑使用。
    for (const forbidden of ["@tanstack/router-cli", "@tanstack/router-plugin"]) {
      if (forbidden in dependencies || forbidden in devDependencies) {
        errors.push(`Extension must not include ${forbidden}`)
      }
    }
    if ("routes:generate" in scripts) errors.push("Extension must not generate Web routes")
    if (!("plasmo" in devDependencies)) errors.push("Extension project is missing Plasmo")
    assertScripts(
      scripts,
      {
        dev: "pnpm env:validate --profile development && plasmo dev --env=.env.development",
        "build:development":
          "pnpm env:validate --profile development && plasmo build --tag=development --env=.env.development",
        "build:test": "pnpm env:validate --profile test && plasmo build --tag=test --env=.env.test",
        "build:release":
          "pnpm env:validate --profile release && plasmo build --env=.env.production && pnpm harness validate && pnpm release:inspect",
        package:
          "pnpm env:validate --profile release && plasmo build --zip --env=.env.production && pnpm harness validate && pnpm release:inspect",
        test: "pnpm env:validate --profile test && vitest run",
        typecheck: "pnpm env:validate && tsc --noEmit"
      },
      errors,
      "Extension script"
    )
    await validateExtension(root, config, manifest, errors)
  }
  try {
    await validateEnvironmentFiles(root)
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `Invalid environment configuration: ${error.message}`
        : "Invalid environment configuration"
    )
  }
  await validateLogos(root, config, errors)
  // 保存 commentViolations 变量供当前逻辑使用。
  const commentViolations = await inspectProjectChineseComments(root)
  errors.push(
    ...commentViolations.map(
      // 执行 当前声明 函数的处理逻辑。
      (violation) => `${violation.file}:${violation.line}:${violation.column} ${violation.message}`
    )
  )
  if (errors.length > 0) throw new Error(`Project validation failed:\n- ${errors.join("\n- ")}`)
  return [config.projectType, ...derivedLogoPaths(config)]
}
