import { validateHttpFoundation } from "./validate-http.ts"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { derivedLogoPaths } from "./brand.ts"
import { HARNESS_ONLY_PATHS, loadProjectConfig, MASTER_LOGO_PATH } from "./config.ts"
import { pathExists, readJson } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { ENVIRONMENT_FILES, validateEnvironmentFiles } from "./environment.ts"
import { assertPackageManagerPins, declaredVersionAtLeast } from "./version.ts"
import { inspectProjectChineseComments } from "./comment-policy.ts"
import { validateAgentPolicyBody, validateAgentPolicyDocument } from "./agent-policy.ts"
import { validateOptionalProjectMemory } from "./project-memory.ts"
import { validateTerminalSkills } from "./skill-validation.ts"
import { validatePnpmBuildPolicy } from "./pnpm-policy.ts"
import {
  requirePaths,
  recordField,
  dependenciesOf,
  scriptsOf,
  assertScripts,
  assertReleaseOnlyBuildScripts
} from "./validate-helpers.ts"
import { validateIdentityBrand, validateLogos } from "./validate-brand.ts"
import { validateWeb, validateExtension } from "./validate-hosts.ts"

// 保留已有检测 API，具体浏览器 bundle 契约与目标协议放在同一模块。
export { findExternalizedRuntimeDependencies } from "./extension-targets.ts"

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
      ".agents/skills/web-design-prototype/references/prd-outline.md",
      ".agents/skills/web-design-prototype/scripts/prototype-review.ts",
      ".harness/tooling/cli.ts",
      ".harness/tooling/validate-helpers.ts",
      ".harness/tooling/validate-brand.ts",
      ".harness/tooling/validate-hosts.ts",
      ".harness/tooling/build.ts",
      ".harness/tooling/extension-targets.ts",
      ".harness/tooling/agent-policy.ts",
      ".harness/tooling/comment-policy.ts",
      ".harness/tooling/environment.ts",
      ".harness/tooling/project-memory.ts",
      ".harness/tooling/release.ts",
      ".harness/tooling/skill-validation.ts",
      ".harness/tooling/design-skill.ts",
      ".harness/tooling/source-size-policy.ts",
      ".harness/tooling/version.ts",
      ...(config.projectType === "web"
        ? [
            ".agents/skills/web-implement-list-view/assets/ListPage.contracts.test.ts",
            ".agents/skills/web-implement-list-view/assets/listPageState.ts",
            ".agents/skills/web-implement-list-view/assets/listPageStorage.ts",
            ".agents/skills/web-implement-list-view/assets/listColumnPreferences.ts",
            ".agents/skills/web-implement-list-view/references/checklist.md",
            ".agents/skills/web-implement-list-view/references/mantine-api.md",
            ".agents/skills/web-implement-list-view/references/offset-list-pattern.md"
          ]
        : []),
      "tsconfig.json",
      ...Object.values(ENVIRONMENT_FILES),
      "src/brand.ts",
      "src/api/client/httpClient.test.ts",
      "src/api/client/httpClient.ts",
      "src/api/client/httpContracts.ts",
      "src/api/client/httpProtocol.ts",
      "src/api/client/httpTransport.test.ts",
      "src/api/client/httpTestFixtures.ts",
      "src/api/client/httpErrors.ts",
      "src/api/client/httpFeedback.ts",
      "src/api/client/httpRuntime.ts",
      "src/api/client/HttpErrorView.tsx",
      "src/api/client/httpInterception.test.ts",
      "src/api/client/httpUi.test.tsx",
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
      "tests/source-size-policy.test.ts",
      "tests/build-tooling.test.ts",
      MASTER_LOGO_PATH,
      "docs/README.md",
      "docs/AGENT_POLICY.md",
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
  // 保存 agentPolicyPath 变量供终端策略完整解析使用。
  const agentPolicyPath = path.join(root, "docs/AGENT_POLICY.md")
  if (await pathExists(agentPolicyPath)) {
    // 保存 agentPolicyDocument 变量供终端已决 schema 与正文验证使用。
    const agentPolicyDocument = await readFile(agentPolicyPath, "utf8")
    // 保存 agentPolicyErrors 变量供终端已决策略验证使用。
    const agentPolicyErrors = [
      ...validateAgentPolicyDocument(agentPolicyDocument, { allowPending: false }),
      ...validateAgentPolicyBody(agentPolicyDocument)
    ]
    errors.push(...agentPolicyErrors.map((message) => `Invalid Agent policy: ${message}`))
  }
  await validateTerminalSkills(root, config, errors)
  await validateOptionalProjectMemory(root, errors)

  // 保存 forbiddenMonorepoPaths 变量供当前逻辑使用。
  const forbiddenMonorepoPaths = ["apps", "packages"] as const
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
  await validateIdentityBrand(root, config, errors)
  if (manifest.name !== config.id) errors.push("package.json name does not match project id")
  if (manifest.description !== config.description) errors.push("package.json description is stale")
  if ("workspaces" in manifest) errors.push("package.json must not define workspaces")
  assertPackageManagerPins(manifest, errors)
  await validatePnpmBuildPolicy(root, errors)
  // 保存 dependencies 变量供当前逻辑使用。
  const dependencies = dependenciesOf(manifest)
  if (!declaredVersionAtLeast(dependencies.ky, "2.1.0")) {
    errors.push("ky runtime dependency minimum must not be lower than 2.1.0")
  }
  // 保存 devDependencies 变量供当前逻辑使用。
  const devDependencies = recordField(manifest, "devDependencies")
  // 保存 scripts 变量供当前逻辑使用。
  const scripts = scriptsOf(manifest)
  if (config.projectType === "web") {
    // 保存 [dependency, minimum] 变量供 Web-only 列表 Skill 兼容下限校验使用。
    for (const [dependency, minimum] of [
      ["@mantine/core", "9.6.3"],
      ["@tanstack/react-query", "5.104.0"]
    ] as const) {
      if (!declaredVersionAtLeast(dependencies[dependency], minimum)) {
        errors.push(`${dependency} minimum must not be lower than ${minimum}`)
      }
    }
  }
  // 保存 [dependency, minimum] 变量供当前逻辑使用。
  for (const [dependency, minimum] of [
    ["typescript", "6.0.3"],
    ["vitest", "5.0.2"],
    ["eslint", "10.11.0"]
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
      "source-size:check": "tsx .harness/tooling/source-size-policy.ts check",
      "env:validate": "tsx .harness/tooling/environment.ts validate",
      "release:inspect": "tsx .harness/tooling/release.ts inspect",
      "prototype:check":
        "tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts check",
      build: "pnpm build:release",
      lint: "eslint . && pnpm comments:check && pnpm source-size:check"
    },
    errors
  )
  assertReleaseOnlyBuildScripts(scripts, errors)
  // 保存 buildToolingPath 变量供统一构建契约校验使用。
  const buildToolingPath = path.join(root, ".harness/tooling/build.ts")
  // 保存 buildTooling 变量供构建门禁与选择校验使用。
  const buildTooling = (await pathExists(buildToolingPath))
    ? await readFile(buildToolingPath, "utf8")
    : ""
  // 保存 contract 变量供统一构建器必需片段校验使用。
  for (const contract of [
    'args: ["test"]',
    "HARNESS_BUILD_VERSION",
    "本次构建完成后是否启用 E2E 测试",
    "Non-interactive builds require --e2e=enabled or --e2e=disabled"
  ]) {
    if (!buildTooling.includes(contract)) errors.push(`Build tooling is missing ${contract}`)
  }
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
  await validateHttpFoundation(root, config, errors)

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
    if (!buildTooling.includes("Asia/Shanghai") || !buildTooling.includes("YYMMDDHHMMSS")) {
      errors.push("Web build tooling must generate Shanghai YYMMDDHHMMSS versions")
    }
    if (!buildTooling.includes("VITE_BUILD_VERSION")) {
      errors.push("Web build tooling is missing VITE_BUILD_VERSION")
    }
    if (buildTooling.includes("PLASMO_PUBLIC_BUILD_VERSION") || buildTooling.includes("plasmo")) {
      errors.push("Web build tooling contains Extension host logic")
    }
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
        dev: "vite --mode development",
        "build:release": "tsx .harness/tooling/build.ts build",
        test: "vitest run",
        "test:related": "vitest related --run",
        typecheck: "pnpm routes:generate && tsc --noEmit"
      },
      errors,
      "Web script"
    )
    if ("plasmo" in dependencies || "plasmo" in devDependencies) {
      errors.push("Web project must not depend on Plasmo")
    }
    await validateWeb(root, config, errors)
  } else {
    if (!buildTooling.includes("EXTENSION_TARGETS"))
      errors.push("Extension build tooling must build all supported browser targets")
    if (!buildTooling.includes("readExtensionBuildVersion")) {
      errors.push("Extension build tooling must read package.json.version")
    }
    if (!buildTooling.includes("PLASMO_PUBLIC_BUILD_VERSION")) {
      errors.push("Extension build tooling is missing PLASMO_PUBLIC_BUILD_VERSION")
    }
    if (buildTooling.includes("VITE_BUILD_VERSION") || buildTooling.includes("vite")) {
      errors.push("Extension build tooling contains Web host logic")
    }
    if (!("@tanstack/react-router" in dependencies))
      errors.push("Extension project is missing TanStack Router")
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
        dev: "plasmo dev --target=chrome-mv3 --env=.env.development",
        "dev:firefox": "plasmo dev --target=firefox-mv2 --env=.env.development",
        "build:release": "tsx .harness/tooling/build.ts build",
        package: "tsx .harness/tooling/build.ts package",
        test: "vitest run",
        "test:related": "vitest related --run",
        typecheck: "tsc --noEmit"
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
  // 保存 commentReport 变量供当前逻辑使用。
  const commentReport = await inspectProjectChineseComments(root)
  errors.push(
    ...commentReport.errors,
    ...commentReport.violations.map(
      // 执行 当前声明 函数的处理逻辑。
      (violation) =>
        `${violation.file}:${violation.line}:${violation.column} ${violation.kind} ${violation.name}: ${violation.message}`
    )
  )
  if (errors.length > 0) throw new Error(`Project validation failed:\n- ${errors.join("\n- ")}`)
  return [config.projectType, ...derivedLogoPaths(config)]
}
