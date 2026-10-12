import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./files.ts"
import type { ProjectConfig } from "./types.ts"

// 执行 validateHttpFoundation 函数的处理逻辑。
export async function validateHttpFoundation(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  // 保存 languagePath 变量供当前逻辑使用。
  const languagePath = path.join(root, "src/i18n/language.ts")
  if (await pathExists(languagePath)) {
    // 保存 language 变量供当前逻辑使用。
    const language = await readFile(languagePath, "utf8")
    // 保存 contract 变量供当前逻辑使用。
    for (const contract of [
      "BRAND.id",
      'getWebStorage("local")',
      "initialApplicationLanguage",
      "initializeLanguage",
      "getRequestLanguage",
      "changeApplicationLanguage"
    ]) {
      if (!language.includes(contract)) errors.push(`Language contract is missing ${contract}`)
    }
  }

  // 集中验证存储入口，语言与分页不再各自访问浏览器存储对象。
  const storageContracts: Array<[string, string[]]> = [
    [
      "src/data/storage/webStorage.ts",
      [
        "getWebStorage",
        'typeof window === "undefined"',
        "window.localStorage",
        "window.sessionStorage"
      ]
    ],
    [
      "src/data/storage/colorScheme.ts",
      ["localStorageColorSchemeManager", 'BRAND.id + ":color-scheme:v1"']
    ]
  ]
  for (const [relativePath, contracts] of storageContracts) {
    if (!(await pathExists(path.join(root, relativePath)))) continue
    const source = await readFile(path.join(root, relativePath), "utf8")
    for (const contract of contracts) {
      if (!source.includes(contract)) errors.push(`Data storage contract is missing ${contract}`)
    }
  }

  // 按模块职责验证协议、传输和会话合同，避免拆分后只检查旧入口。
  const moduleContracts: Array<[string, string[]]> = [
    [
      "src/data/api/client/httpContracts.ts",
      [
        'continuation: "X-Http-Request"',
        'language: "X-Lang"',
        'authToken: "X-AUTH-TOKEN"',
        "class ApiError",
        "UnauthorizedContext",
        "HttpRequestOptions"
      ]
    ],
    [
      "src/data/api/client/httpProtocol.ts",
      [
        'import ky from "ky"',
        "ky(new Request(input, init)",
        "retry: 0",
        "timeout: false",
        "totalTimeout: false",
        "throwHttpErrors: false",
        "encodableHeader",
        'code: "access_forbidden"',
        "createLoginUnauthorizedHandler",
        "ignoreGlobalFeedback"
      ]
    ],
    [
      "src/data/api/client/httpClient.ts",
      [
        "options.fetch ?? requestWithKy",
        "APP_CONFIG",
        "extractAuthToken",
        "response.clone()",
        'redirect: "error"',
        "authRevision",
        "unauthorizedLatched",
        "UnauthorizedContext",
        "setAuthToken",
        "interceptRequest",
        "interceptors?.onError",
        'code: "invalid_request_headers"',
        'logger.warn("http.unauthorized"',
        'logger.error("http.request_failed"'
      ]
    ]
  ]
  for (const [relativePath, contracts] of moduleContracts) {
    const filePath = path.join(root, relativePath)
    if (!(await pathExists(filePath))) continue
    const source = await readFile(filePath, "utf8")
    for (const contract of contracts) {
      if (!source.includes(contract))
        errors.push(`HTTP client contract is missing ${contract} in ${relativePath}`)
    }
    if (source.includes("localStorage") || source.includes("sessionStorage")) {
      errors.push("HTTP continuation and authentication state must remain in memory")
    }
  }
  const providerPath =
    config.projectType === "web" ? "src/app/AppProviders.tsx" : "src/providers.tsx"
  const queryPath = config.projectType === "web" ? "src/app/queryClient.ts" : providerPath
  // 非 React 的前置读取必须能导入 Providers 实际使用的同一实例。
  if (await pathExists(path.join(root, queryPath))) {
    const source = await readFile(path.join(root, queryPath), "utf8")
    if (!source.includes("export const queryClient = new QueryClient(")) {
      errors.push("Query cache contract is missing the exported shared QueryClient")
    }
  }
  const routerPath =
    config.projectType === "web" ? "src/app/router.tsx" : "src/extension-router.tsx"
  const feedbackContracts: Array<[string, string[]]> = [
    [
      "src/data/api/client/httpErrors.ts",
      ["retryHttpQuery", "failureCount < 2", "error.status !== 401", "error.status !== 403"]
    ],
    [
      "src/data/api/client/httpRuntime.ts",
      [
        "applicationHttp",
        "requestHttpQuery",
        'feedback: "owner"',
        "configureUnauthorizedHandler",
        "onError: reportHttpError"
      ]
    ],
    [
      "src/data/api/client/httpFeedback.ts",
      ["httpFeedbackAtom", "currentReference", "WeakRef", "clearHttpFeedback"]
    ],
    [
      "src/data/api/client/HttpErrorView.tsx",
      ["HttpErrorView", "HttpFeedback", "useTranslation", "clearHttpFeedback(error)"]
    ],
    [providerPath, ["<HttpFeedback />"]],
    [queryPath, ["retry: retryHttpQuery", "retry: false", "reportHttpError(error)"]],
    [
      routerPath,
      [
        config.projectType === "web"
          ? "...routeStateDefaults"
          : "defaultErrorComponent: ExtensionRouteErrorPage"
      ]
    ]
  ]
  for (const [relativePath, contracts] of feedbackContracts) {
    if (!(await pathExists(path.join(root, relativePath)))) continue
    const source = await readFile(path.join(root, relativePath), "utf8")
    for (const contract of contracts) {
      if (!source.includes(contract))
        errors.push(`HTTP feedback contract is missing ${contract} in ${relativePath}`)
    }
  }
}
