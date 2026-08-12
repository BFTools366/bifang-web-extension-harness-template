import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { derivedLogoPaths } from "./brand.ts"
import { HARNESS_ONLY_PATHS, loadProjectConfig, MASTER_LOGO_PATH } from "./config.ts"
import { pathExists, readJson, walkFiles } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { deriveLogoAssets } from "./logo.ts"
import { ENVIRONMENT_FILES, validateEnvironmentFiles } from "./environment.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "./version.ts"

async function requirePaths(
  root: string,
  paths: readonly string[],
  errors: string[]
): Promise<void> {
  const exists = await Promise.all(
    paths.map((relativePath) => pathExists(path.join(root, relativePath)))
  )
  paths.forEach((relativePath, index) => {
    if (!exists[index]) errors.push(`Missing ${relativePath}`)
  })
}

function recordField(manifest: Record<string, unknown>, key: string): Record<string, string> {
  const value = manifest[key]
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, string>
}

function dependenciesOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "dependencies")
}

function scriptsOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "scripts")
}

function assertScripts(
  scripts: Record<string, string>,
  expected: Record<string, string>,
  errors: string[],
  label = "package.json script"
): void {
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (scripts[name] !== expectedValue) errors.push(`${label} ${name} is invalid`)
  }
}

function packageNameOf(specifier: string): string | undefined {
  const segments = specifier.split("/")
  if (specifier.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined
  }
  return segments[0]
}

export function findExternalizedRuntimeDependencies(
  source: string,
  runtimeDependencies: readonly string[]
): string[] {
  const dependencies = new Set(runtimeDependencies)
  const externalized = new Set<string>()
  const selfMapping = /"((?:@[a-zA-Z0-9._~-]+\/)?[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~+-]+)*)":"\1"/g

  for (const match of source.matchAll(selfMapping)) {
    const specifier = match[1]
    if (specifier === undefined) continue
    const packageName = packageNameOf(specifier)
    if (packageName !== undefined && dependencies.has(packageName)) {
      externalized.add(specifier)
    }
  }

  return [...externalized].sort()
}

async function validateLogos(root: string, config: ProjectConfig, errors: string[]): Promise<void> {
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  if (!(await pathExists(masterPath))) return
  const master = await readFile(masterPath)
  const metadata = await sharp(master).metadata()
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.format !== "png") {
    errors.push(`${MASTER_LOGO_PATH} must be a 1024x1024 PNG`)
  }
  const expectedAssets = await deriveLogoAssets(config.projectType, master)
  for (const relativePath of derivedLogoPaths(config)) {
    const derivedPath = path.join(root, relativePath)
    if (await pathExists(derivedPath)) {
      const derived = await readFile(derivedPath)
      const expected = expectedAssets.get(relativePath)
      if (expected === undefined || !expected.equals(derived)) {
        errors.push(`${relativePath} is not synchronized with the master logo`)
      }
    }
  }
}

const PAGINATION_TRANSLATION_KEYS = [
  "paginationNavigation",
  "paginationPage",
  "paginationPrevious",
  "paginationNext",
  "paginationPageSize"
] as const

async function validatePagination(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  const sourcePath = path.join(root, "src/pagination/useSessionPagination.ts")
  const controlsPath = path.join(root, "src/pagination/PaginationControls.tsx")
  if (await pathExists(sourcePath)) {
    const source = await readFile(sourcePath, "utf8")
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
    const controls = await readFile(controlsPath, "utf8")
    for (const contract of ["Pagination", "Select", "labels", "onPageChange", "onPageSizeChange"]) {
      if (!controls.includes(contract)) {
        errors.push(`Pagination controls are missing ${contract}`)
      }
    }
  }

  const translationPaths =
    config.projectType === "web"
      ? ["src/i18n/locales/en.ts", "src/i18n/locales/zh.ts"]
      : ["src/i18n.ts"]
  for (const relativePath of translationPaths) {
    const translationPath = path.join(root, relativePath)
    if (!(await pathExists(translationPath))) continue
    const translations = await readFile(translationPath, "utf8")
    const minimumOccurrences = config.projectType === "extension" ? 2 : 1
    for (const key of PAGINATION_TRANSLATION_KEYS) {
      if (translations.split(`${key}:`).length - 1 < minimumOccurrences) {
        errors.push(`Pagination translations are missing ${key} in ${relativePath}`)
      }
    }
  }
}

async function validateHttpFoundation(root: string, errors: string[]): Promise<void> {
  const languagePath = path.join(root, "src/i18n/language.ts")
  if (await pathExists(languagePath)) {
    const language = await readFile(languagePath, "utf8")
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

  const clientPath = path.join(root, "src/api/client/httpClient.ts")
  if (await pathExists(clientPath)) {
    const client = await readFile(clientPath, "utf8")
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
    const index = await readFile(path.join(root, "index.html"), "utf8")
    if (!index.includes(`<title>${config.name}</title>`)) errors.push("index.html title is stale")
    if (!index.includes(config.description)) errors.push("index.html description is stale")
    if (!index.includes(config.brand.primaryColor)) errors.push("index.html theme color is stale")
    if (!index.includes("/favicon.png")) errors.push("index.html favicon is missing")
  }
  const gitignorePath = path.join(root, ".gitignore")
  if (await pathExists(gitignorePath)) {
    const gitignore = await readFile(gitignorePath, "utf8")
    if (!gitignore.split(/\r?\n/).includes("src/routeTree.gen.ts")) {
      errors.push("Web project must ignore generated src/routeTree.gen.ts")
    }
  }
  const viteConfigPath = path.join(root, "vite.config.ts")
  if (await pathExists(viteConfigPath)) {
    const viteConfig = await readFile(viteConfigPath, "utf8")
    const routerPlugin = viteConfig.indexOf("tanstackRouter(")
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
  const targets = manifest.targets as Record<string, unknown> | undefined
  const defaultTarget = targets?.default as Record<string, unknown> | undefined
  if (defaultTarget?.context !== "browser" || defaultTarget.includeNodeModules !== true) {
    errors.push("Extension default Parcel target must use browser context and include node_modules")
  }
  const shellPath = path.join(root, "src/ExtensionShell.tsx")
  if (await pathExists(shellPath)) {
    const shell = await readFile(shellPath, "utf8")
    if (!shell.includes("unhandledrejection") || !shell.includes("createLogger")) {
      errors.push("Extension surfaces must install the structured global error logger")
    }
    if (!shell.includes('process.env.PLASMO_PUBLIC_APP_ENV !== "release"')) {
      errors.push("Extension startup logging must use a same-module compile-time release guard")
    }
  }
  const browserManifest = manifest.manifest
  if (browserManifest === null || typeof browserManifest !== "object") {
    errors.push("Extension manifest metadata is missing")
  } else {
    const metadata = browserManifest as Record<string, unknown>
    if (metadata.manifest_version !== 3) errors.push("Extension manifest_version must equal 3")
    if (metadata.name !== config.name) errors.push("Extension manifest name is stale")
    if (metadata.description !== config.description)
      errors.push("Extension manifest description is stale")
  }

  const buildRoot = path.join(root, "build/chrome-mv3-prod")
  if (await pathExists(buildRoot)) {
    await requirePaths(
      root,
      ["build/chrome-mv3-prod/popup.html", "build/chrome-mv3-prod/options.html"],
      errors
    )
    const builtManifestPath = path.join(buildRoot, "manifest.json")
    if (!(await pathExists(builtManifestPath))) {
      errors.push("Extension build is missing manifest.json")
    } else {
      const builtManifest = await readJson<Record<string, unknown>>(builtManifestPath)
      const action = builtManifest.action as Record<string, unknown> | undefined
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
    const runtimeDependencies = Object.keys(dependenciesOf(manifest))
    const bundlePaths = await walkFiles(buildRoot, { filter: (name) => name.endsWith(".js") })
    const bundleSources = await Promise.all(
      bundlePaths.map((bundlePath) => readFile(bundlePath, "utf8"))
    )
    bundlePaths.forEach((bundlePath, index) => {
      const source = bundleSources[index]
      if (source === undefined) return
      for (const specifier of findExternalizedRuntimeDependencies(source, runtimeDependencies)) {
        errors.push(
          `Extension build leaves ${specifier} as an unresolved browser dependency in ${path.relative(root, bundlePath)}`
        )
      }
    })
  }
}

export async function validateProject(rootInput: string): Promise<string[]> {
  const root = path.resolve(rootInput)
  const config = await loadProjectConfig(root)
  const errors: string[] = []
  await requirePaths(
    root,
    [
      ".harness/tooling/cli.ts",
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

  const forbiddenMonorepoPaths = ["pnpm-workspace.yaml", "apps", "packages"] as const
  const forbiddenMonorepoPathsExist = await Promise.all(
    forbiddenMonorepoPaths.map((forbidden) => pathExists(path.join(root, forbidden)))
  )
  forbiddenMonorepoPaths.forEach((forbidden, index) => {
    if (forbiddenMonorepoPathsExist[index]) errors.push(`Forbidden monorepo path: ${forbidden}`)
  })

  const manifest = await readJson<Record<string, unknown>>(path.join(root, "package.json"))
  if (manifest.name !== config.id) errors.push("package.json name does not match project id")
  if (manifest.description !== config.description) errors.push("package.json description is stale")
  if ("workspaces" in manifest) errors.push("package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  const dependencies = dependenciesOf(manifest)
  const devDependencies = recordField(manifest, "devDependencies")
  const scripts = scriptsOf(manifest)
  for (const [dependency, minimum] of [
    ["typescript", "6.0.3"],
    ["vitest", "4.1.10"],
    ["eslint", "10.8.1"]
  ] as const) {
    if (!declaredVersionAtLeast(devDependencies[dependency], minimum)) {
      errors.push(`${dependency} minimum must not be lower than ${minimum}`)
    }
  }
  for (const removedScript of ["harness:init", "instantiate", "validate:harness"]) {
    if (removedScript in scripts) errors.push(`Terminal project must not expose ${removedScript}`)
  }
  const removedPathsExist = await Promise.all(
    HARNESS_ONLY_PATHS.map((removedPath) => pathExists(path.join(root, removedPath)))
  )
  HARNESS_ONLY_PATHS.forEach((removedPath, index) => {
    if (removedPathsExist[index]) errors.push(`Terminal project retains ${removedPath}`)
  })
  assertScripts(
    scripts,
    {
      "env:validate": "tsx .harness/tooling/environment.ts validate",
      "release:inspect": "tsx .harness/tooling/release.ts inspect",
      build: "pnpm build:release"
    },
    errors
  )
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

  const loggerPath = path.join(root, "src/observability/logger.ts")
  if (await pathExists(loggerPath)) {
    const logger = await readFile(loggerPath, "utf8")
    for (const contract of [
      "SENSITIVE_KEY",
      "RELEASE_ALLOWED_KEYS",
      'config.environment === "release"',
      "[REDACTED]",
      "[Circular]"
    ]) {
      if (!logger.includes(contract)) errors.push(`Structured logger is missing ${contract}`)
    }
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

  const tsconfig = await readJson<Record<string, unknown>>(path.join(root, "tsconfig.json"))
  const tsconfigInclude = Array.isArray(tsconfig.include)
    ? tsconfig.include.filter((entry): entry is string => typeof entry === "string")
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
  if (errors.length > 0) throw new Error(`Project validation failed:\n- ${errors.join("\n- ")}`)
  return [config.projectType, ...derivedLogoPaths(config)]
}
