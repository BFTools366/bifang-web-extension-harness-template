import {
  EXTENSION_TARGETS,
  validateBuiltExtensionManifest,
  findExternalizedRuntimeDependencies
} from "./extension-targets.ts"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { extensionIdentityManifest, validateIdentityLocales } from "./identity.ts"
import ts from "typescript"
import { pathExists, readJson, walkFiles } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { isValidExtensionVersion } from "./version.ts"
import { requirePaths, dependenciesOf } from "./validate-helpers.ts"

/** 收集当前 TSX 模块从相对模块导入的构建版本本地标识符。 */
export function importedBuildVersionIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const identifiers = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith(".")
    ) {
      continue
    }
    const importClause = statement.importClause
    if (importClause?.name !== undefined && importClause.name.text.endsWith("BUILD_VERSION")) {
      identifiers.add(importClause.name.text)
    }
    const bindings = importClause?.namedBindings
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue
    for (const specifier of bindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text
      if (importedName.endsWith("BUILD_VERSION")) identifiers.add(specifier.name.text)
    }
  }
  return identifiers
}

/** 判断一个 JSX 表达式是否消费指定的构建版本导入。 */
export function jsxExpressionUsesBuildVersion(
  expression: ts.JsxExpression,
  identifiers: ReadonlySet<string>
): boolean {
  let found = false
  /** 访问 JSX 表达式内部节点并在命中后停止继续下钻。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isIdentifier(node) && identifiers.has(node.text)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  if (expression.expression !== undefined) visit(expression.expression)
  return found
}

/** 判断任一生产 TSX surface 是否在 JSX 中展示导入的构建版本。 */
export async function hasBuildVersionSurface(root: string): Promise<boolean> {
  const sourceRoot = path.join(root, "src")
  if (!(await pathExists(sourceRoot))) return false
  const files = await walkFiles(sourceRoot, {
    filter: (name) =>
      name.endsWith(".tsx") && !name.endsWith(".test.tsx") && !name.endsWith(".spec.tsx")
  })
  for (const file of files) {
    const source = await readFile(file, "utf8")
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
    const identifiers = importedBuildVersionIdentifiers(sourceFile)
    if (identifiers.size === 0) continue
    let displayed = false
    /** 遍历当前生产 TSX 文件中的 JSX 表达式。 */
    function visit(node: ts.Node): void {
      if (displayed) return
      if (ts.isJsxExpression(node) && jsxExpressionUsesBuildVersion(node, identifiers)) {
        displayed = true
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    if (displayed) return true
  }
  return false
}

// 执行 validateWeb 函数的处理逻辑。
export async function validateWeb(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  await requirePaths(
    root,
    [
      ".gitignore",
      "index.html",
      "vite.config.ts",
      "src/main.tsx",
      "src/data/api/README.md",
      "src/app/AppProviders.tsx",
      "src/app/router.tsx",
      "src/app/queryClient.ts",
      "src/app/theme.ts",
      "src/theme/brandScale.ts",
      "src/theme/ColorSchemeControl.tsx",
      "src/features/not-found/NotFoundPage.tsx",
      "src/features/route-state/RouteState.tsx",
      "src/features/route-state/RouteState.test.tsx",
      "src/buildVersion.ts",
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
  // 保存 buildVersionPath 变量供 Web 构建版本契约校验使用。
  const buildVersionPath = path.join(root, "src/buildVersion.ts")
  if (await pathExists(buildVersionPath)) {
    // 保存 buildVersion 变量供注入键校验使用。
    const buildVersion = await readFile(buildVersionPath, "utf8")
    if (!buildVersion.includes("import.meta.env.VITE_BUILD_VERSION")) {
      errors.push("Web build version must use the Vite build injection")
    }
  }
  if (!(await hasBuildVersionSurface(root))) {
    errors.push("Web production TSX surface must display an imported build-version value")
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
export async function validateExtension(
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
      "src/ExtensionShell.test.tsx",
      "src/buildVersion.ts",
      "src/i18n.ts",
      "src/providers.tsx",
      "src/extension-router.tsx",
      "src/data/api/client/ExtensionRouteErrorPage.tsx",
      "src/theme/brandScale.ts",
      "src/theme/ColorSchemeControl.tsx",
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
  if (!isValidExtensionVersion(manifest.version)) {
    errors.push("Extension package.json.version must use Chrome-compatible stable SemVer X.Y.Z")
  }
  // 保存 targets 变量供当前逻辑使用。
  const targets = manifest.targets as Record<string, unknown> | undefined
  // 保存 defaultTarget 变量供当前逻辑使用。
  const defaultTarget = targets?.default as Record<string, unknown> | undefined
  if (defaultTarget?.context !== "browser" || defaultTarget.includeNodeModules !== true) {
    errors.push("Extension default Parcel target must use browser context and include node_modules")
  }
  // 锁定浏览器条件导出，防止 Router 的 isServer 子路径落入服务端入口。
  const parcelResolver = manifest["@parcel/resolver-default"] as Record<string, unknown> | undefined
  if (parcelResolver?.packageExports !== true) {
    errors.push("Extension Parcel resolver must enable packageExports")
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
  // 保存 buildVersionPath 变量供 Extension 构建版本契约校验使用。
  const buildVersionPath = path.join(root, "src/buildVersion.ts")
  if (await pathExists(buildVersionPath)) {
    // 保存 buildVersion 变量供注入键校验使用。
    const buildVersion = await readFile(buildVersionPath, "utf8")
    if (!buildVersion.includes("process.env.PLASMO_PUBLIC_BUILD_VERSION")) {
      errors.push("Extension build version must use the Plasmo build injection")
    }
  }
  if (!(await hasBuildVersionSurface(root))) {
    errors.push("Extension production TSX surface must display an imported build-version value")
  }
  // 验证两个扩展入口各自持有 Router，避免意外退回无导航基线。
  for (const surface of ["popup", "options"] as const) {
    const entryPath = path.join(root, `src/${surface}.tsx`)
    if (!(await pathExists(entryPath))) continue
    const entry = await readFile(entryPath, "utf8")
    if (
      !entry.includes(`createExtensionRouter("${surface}"`) ||
      !entry.includes("RouterProvider")
    ) {
      errors.push(`Extension ${surface} entry must mount its own TanStack Router`)
    }
  }
  // 保存 browserManifest 变量供当前逻辑使用。
  const browserManifest = manifest.manifest
  if (browserManifest === null || typeof browserManifest !== "object") {
    errors.push("Extension manifest metadata is missing")
  } else {
    // 保存 metadata 变量供当前逻辑使用。
    const metadata = browserManifest as Record<string, unknown>
    if ("manifest_version" in metadata)
      errors.push("Shared Extension manifest_version must be derived from each build target")
    if (metadata.default_locale !== extensionIdentityManifest(config).default_locale)
      errors.push("Extension manifest default_locale is stale")
    if (metadata.name !== "__MSG_projectName__") errors.push("Extension manifest name is stale")
    if (metadata.description !== "__MSG_projectDescription__")
      errors.push("Extension manifest description is stale")
  }

  // 保存 buildRoot 变量供当前逻辑使用。
  await validateIdentityLocales(root, config, "locales", errors)
  for (const target of EXTENSION_TARGETS) {
    const relativeBuildRoot = `build/${target.target}-prod`
    const buildRoot = path.join(root, relativeBuildRoot)
    if (!(await pathExists(buildRoot))) continue
    await requirePaths(
      root,
      [`${relativeBuildRoot}/popup.html`, `${relativeBuildRoot}/options.html`],
      errors
    )
    // 保存 builtManifestPath 变量供当前逻辑使用。
    const builtManifestPath = path.join(buildRoot, "manifest.json")
    if (!(await pathExists(builtManifestPath))) {
      errors.push("Extension build is missing manifest.json")
    } else {
      // 保存 builtManifest 变量供当前逻辑使用。
      const builtManifest = await readJson<Record<string, unknown>>(builtManifestPath)
      // 旧产物的身份与版本由构建后的 release:inspect 校验，避免阻断重建。
      validateBuiltExtensionManifest(builtManifest, target, errors)
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
