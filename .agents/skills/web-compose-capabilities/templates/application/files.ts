import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveCapabilitySelection } from "../../scripts/capabilities.ts"
import {
  PERMISSION_FREE_ACTIONS,
  permissionFreePaths,
  type ApplicationOptions,
  type ApplicationPage,
  type ApplicationWiring
} from "./contracts.ts"
import { applicationLocales } from "./locales.ts"
import { applicationRoutes, accessSource } from "./route-source.ts"
import { runtimeSource } from "./runtime-source.ts"
import { applicationPageSource } from "./page-source.ts"
import { settingsNavigationSource } from "./settings-source.ts"

/** 固定资产到当前单包的实际落点，所有路径均纳入 catalog 管理。 */
export const APPLICATION_ASSETS: Record<string, Record<string, string>> = {
  base: {
    "src/features/application/ApplicationLayout.tsx": "base/ApplicationLayout.tsx.txt",
    "src/features/application/ModuleState.tsx": "base/ModuleState.tsx.txt",
    "src/features/application/scope.ts": "base/scope.ts.txt",
    "src/features/application/ApplicationIcon.tsx": "base/ApplicationIcon.tsx.txt",
    "src/features/application/Preferences.tsx": "base/Preferences.tsx.txt",
    "src/features/application/SettingsPage.tsx": "base/SettingsPage.tsx.txt",
    "src/features/application/application.module.css": "base/application.module.css.txt"
  },
  identity: {
    "src/data/api/identity/contracts.ts": "identity/contracts.ts.txt",
    "src/data/storage/identityCredentials.ts": "identity/identityCredentials.ts.txt",
    "src/features/identity/runtime.ts": "identity/runtime.ts.txt",
    "src/features/identity/AuthLayout.tsx": "identity/AuthLayout.tsx.txt",
    "src/features/identity/LoginPage.tsx": "identity/LoginPage.tsx.txt",
    "src/features/identity/IdentityMenu.tsx": "identity/IdentityMenu.tsx.txt",
    "src/features/identity/identity.module.css": "identity/identity.module.css.txt",
    "src/features/application/AccountMenu.tsx": "identity/AccountMenu.tsx.txt",
    "src/features/application/SettingsLink.tsx": "identity/SettingsLink.tsx.txt",
    "src/features/identity/IdentityBoundary.tsx": "identity/IdentityBoundary.tsx.txt"
  },
  permissions: {
    "src/data/api/permissions/contracts.ts": "permissions/contracts.ts.txt",
    "src/features/permissions/runtime.ts": "permissions/runtime.ts.txt",
    "src/features/permissions/Access.tsx": "permissions/Access.tsx.txt",
    "src/features/permissions/ForbiddenPage.tsx": "permissions/ForbiddenPage.tsx.txt"
  },
  catalog: {
    "src/data/api/catalog/contracts.ts": "catalog/contracts.ts.txt",
    "src/features/catalog/CatalogPage.tsx": "catalog/CatalogPage.tsx.txt"
  },
  orders: {
    "src/data/api/orders/contracts.ts": "orders/contracts.ts.txt",
    "src/features/orders/OrdersPage.tsx": "orders/OrdersPage.tsx.txt"
  },
  "wallet-payments": {
    "src/data/api/wallet-payments/contracts.ts": "wallet-payments/contracts.ts.txt",
    "src/features/wallet-payments/WalletPage.tsx": "wallet-payments/WalletPage.tsx.txt"
  },
  organization: {
    "src/data/api/organization/contracts.ts": "organization/contracts.ts.txt",
    "src/data/api/organization/context.ts": "organization/context.ts.txt",
    "src/features/organization/OrganizationMenu.tsx": "organization/OrganizationMenu.tsx.txt",
    "src/features/organization/OrganizationPage.tsx": "organization/OrganizationPage.tsx.txt",
    "src/features/organization/OrganizationContext.tsx": "organization/OrganizationContext.tsx.txt"
  },
  audit: {
    "src/data/api/audit/contracts.ts": "audit/contracts.ts.txt",
    "src/features/audit/AuditPage.tsx": "audit/AuditPage.tsx.txt"
  }
}
/** 只随具体操作装配的固定资产，不因模块启用而附带写入能力。 */
const OPERATION_ASSETS: Record<string, Record<string, string>> = {
  "identity.workspace": {
    "src/data/api/organization/teamContracts.ts": "organization/teamContracts.ts.txt",
    "src/data/api/organization/teamService.ts": "organization/teamService.ts.txt",
    "src/features/organization/useTeamMutation.ts": "organization/useTeamMutation.ts.txt",
    "src/features/organization/TeamInbox.tsx": "organization/TeamInbox.tsx.txt",
    "src/features/organization/TeamMembers.tsx": "organization/TeamMembers.tsx.txt",
    "src/features/organization/TeamRoles.tsx": "organization/TeamRoles.tsx.txt",
    "src/features/organization/TeamWorkspace.tsx": "organization/TeamWorkspace.tsx.txt"
  },
  "identity.register": {
    "src/data/api/identity/registration.ts": "identity/registration.ts.txt",
    "src/features/identity/RegistrationPage.tsx": "identity/RegistrationPage.tsx.txt",
    "src/features/identity/useEmailVerification.ts": "identity/useEmailVerification.ts.txt"
  },
  "organization.manage": {
    "src/features/organization/OrganizationManagementPage.tsx":
      "organization/OrganizationManagementPage.tsx.txt"
  },
  "orders.purchase": {
    "src/features/orders/purchase.ts": "orders/purchase.ts.txt",
    "src/features/orders/PurchasePanel.tsx": "orders/PurchasePanel.tsx.txt"
  }
}
/** 可执行操作入口，未选择时不进入接线清单。 */
const ACTIONS = ["orders.purchase", "organization.switch", "organization.manage"]
/** 对应固定能力页的规范 URL，基础主界面始终存在。 */
const MODULE_PAGES: ApplicationPage[] = [
  {
    path: "/catalog",
    file: "catalog",
    component: "CatalogPage",
    title: "catalogTitle",
    module: "catalog"
  },
  {
    path: "/orders",
    file: "orders",
    component: "OrdersPage",
    title: "ordersTitle",
    module: "orders"
  },
  {
    path: "/wallet",
    file: "wallet",
    component: "WalletPage",
    title: "walletTitle",
    module: "wallet-payments"
  },
  {
    path: "/organization",
    file: "organization",
    component: "OrganizationPage",
    title: "organizationTitle",
    module: "organization"
  },
  { path: "/audit", file: "audit", component: "AuditPage", title: "auditTitle", module: "audit" }
]
/** 从当前固定资源根读取，不依赖调用者工作目录。 */
function asset(name: string): string {
  return readFileSync(new URL("./files/" + name, import.meta.url), "utf8")
}
/** Extension 宿主不展示品牌图片，同时移除随之失效的导入。 */
function stripBrandImage(source: string): string {
  return source
    .replace(/<Image src=\{BRAND.logoPath\}[^>]*\/>/u, "")
    .replace(/^import \{ BRAND \} from "..\/..\/brand"\r?\n/mu, "")
    .replace(/\bImage,\s*/u, "")
}
/** 在任何输出产生前核对数据模式、真实首页及权限要求。 */
function validateOptions(
  options: ApplicationOptions,
  modules: readonly string[],
  pages: readonly ApplicationPage[],
  actions: readonly string[]
): void {
  if (
    typeof options.homePageSource !== "string" ||
    !options.homePageSource.trim() ||
    !/export\s+(?:function|const)\s+HomePage\b/u.test(options.homePageSource)
  )
    throw new Error("必须提供按实际需求实现并导出的 HomePage，不能用空工程代替")
  if (options.dataMode !== "adapter") throw new Error("产品装配必须使用真实 adapter，禁止业务 Mock")
  for (const [locale, values] of Object.entries(options.content?.translations ?? {})) {
    if (!["en", "zh"].includes(locale) || !values || typeof values !== "object")
      throw new Error(`不支持的模板文案语言：${locale}`)
    for (const [key, value] of Object.entries(values))
      if (!Object.hasOwn(applicationLocales.en, key) || typeof value !== "string" || !value.trim())
        throw new Error(`模板文案无效或属于项目身份：${key}`)
  }
  if (options.dataMode === "adapter") {
    for (const module of modules)
      if (!options.adapters?.[module]?.trim()) throw new Error(`缺少真实能力 adapter：${module}`)
  }
  if (modules.includes("permissions")) {
    for (const [kind, ids, mapping] of [
      [
        "页面",
        pages
          .map((page) => page.path)
          .filter((path) => !permissionFreePaths(modules.includes("organization")).includes(path)),
        options.pagePermissions
      ],
      [
        "动作",
        actions.filter((action) => !PERMISSION_FREE_ACTIONS.includes(action)),
        options.actionPermissions
      ]
    ] as const) {
      for (const id of ids) {
        const codes = mapping?.[id]
        if (!codes?.length || codes.some((code) => typeof code !== "string" || code.trim() === ""))
          throw new Error(`${kind}缺少可信权限码要求：${id}`)
      }
    }
  }
}

/** 以固定设计和真实代码接线装配已确认范围；只返回 Map，由实施者在下游写入。 */
export function applicationFiles(
  base: ReadonlyMap<string, string>,
  options: ApplicationOptions
): Map<string, string> {
  const selected = resolveCapabilitySelection(options.selection)
  const serverOnly = new Set(
    selected.modules.flatMap((module) =>
      module.operations.filter((op) => op.serverOnly).map((op) => op.id)
    )
  )
  const frontendOperations = selected.resolved.filter((id) => !serverOnly.has(id))
  const supported = new Set([
    "identity.session",
    "identity.register",
    "identity.verification",
    "organization.switch",
    "organization.manage",
    "permissions.enforce",
    "catalog.browse",
    "orders.read",
    "orders.create",
    "orders.purchase",
    "wallet-payments.read",
    "wallet-payments.pay",
    "audit.read"
  ])
  if (frontendOperations.includes("identity.workspace")) {
    for (const operation of [
      "identity.workspace",
      "organization.members",
      "organization.invite",
      "organization.accept",
      "organization.leave",
      "permissions.roles",
      "permissions.grant"
    ])
      supported.add(operation)
  }
  if (
    frontendOperations.includes("identity.verification") &&
    !frontendOperations.includes("identity.register")
  )
    throw new Error("独立验证或找回须由领域 Skill 按真实流程实施；当前装配发码仅与注册组合")
  const incremental = frontendOperations.filter((id) => !supported.has(id))
  if (incremental.length)
    throw new Error(
      "这些操作须由领域 Skill 完成页面、接口与动作的增量实施，基础模板不能宣称已接线：" +
        incremental.join(",")
    )
  const modules = [...new Set(frontendOperations.map((id) => id.slice(0, id.indexOf("."))))]
  const pages: ApplicationPage[] = [
    { path: "/", file: "index", component: "HomePage", title: "applicationHome" },
    ...MODULE_PAGES.filter((page) => page.module !== undefined && modules.includes(page.module)),
    ...(selected.resolved.includes("organization.manage")
      ? [
          {
            path: "/organization/manage",
            file: "organization_.manage",
            component: "OrganizationManagementPage",
            title: "organizationManage",
            module: "organization"
          }
        ]
      : [])
  ]
  const actions = ACTIONS.filter((action) => selected.resolved.includes(action))
  const organizationPaths = pages
    .filter((page) => page.module === "organization")
    .map((page) => page.path)
  validateOptions(options, modules, pages, actions)
  // 全量装配只用于首次工程基线；后续能力添加按现有 owner 增量接线。
  if (base.has(".harness/application-wiring.json") || base.has("src/features/home/HomePage.tsx"))
    throw new Error("已有产品实现，不能重装初始化模板；请按现有路由和状态增量接线")
  for (const [target, source] of base) {
    if (
      target.startsWith("src/routes/") &&
      !["src/routes/__root.tsx", "src/routes/index.tsx"].includes(target)
    )
      throw new Error(`已有产品路由，不能覆盖：${target}`)
    if (target === "src/routes/index.tsx" && /(?:component|loader|beforeLoad)\s*:/u.test(source))
      throw new Error("已有首页实现，不能覆盖初始化")
  }
  // 静态资产与动态源码先在独立结果内完成装配，统一检查后再合并中性工程。
  const files = new Map<string, string>()
  for (const module of ["base", ...modules]) {
    for (const [target, source] of Object.entries(APPLICATION_ASSETS[module] ?? {}))
      files.set(target, asset(source))
  }
  for (const operation of selected.resolved) {
    for (const [target, source] of Object.entries(OPERATION_ASSETS[operation] ?? {}))
      files.set(target, asset(source))
  }
  for (const [module, source] of Object.entries(options.content?.pageSources ?? {})) {
    const page = pages.find((item) => item.module === module)
    if (
      !page ||
      !source?.trim() ||
      !new RegExp(`export\\s+(?:function|const)\\s+${page.component}\\b`, "u").test(source)
    )
      throw new Error(`页面内容必须属于已选能力并导出固定组件：${module}`)
    files.set(`src/features/${module}/${page.component}.tsx`, source)
  }
  if (modules.some((id) => ["catalog", "orders", "wallet-payments"].includes(id)))
    files.set("src/data/api/commerce/price.ts", asset("base/price.ts.txt"))
  if (modules.includes("identity")) {
    files.set("src/features/identity/session.ts", asset("../../identity/session.ts.txt"))
    files.set("src/features/identity/session.test.ts", asset("../../identity/session.test.ts.txt"))
  }
  for (const module of modules) {
    files.set(`src/data/api/${module}/adapter.ts`, options.adapters?.[module] ?? "")
  }
  files.set("src/features/home/HomePage.tsx", options.homePageSource)
  files.set("src/features/application/runtime.ts", runtimeSource(options, frontendOperations))
  files.set(
    "src/features/application/Application.tsx",
    applicationPageSource(options, frontendOperations, pages)
  )
  files.set(
    "src/features/application/routeAccess.ts",
    accessSource(frontendOperations, organizationPaths)
  )
  files.set(
    "src/features/application/settingsNavigation.ts",
    settingsNavigationSource(
      modules.includes("identity"),
      organizationPaths,
      selected.resolved.includes("identity.register")
    )
  )
  files.set(
    "src/features/application/navigation.ts",
    `export const navigation = ${JSON.stringify(pages.filter((page) => page.module !== "organization").map((page) => ({ path: page.path, title: page.title })))} as const\n`
  )
  files.set(
    "src/i18n/application.ts",
    `import i18n from "../i18n"\n\n${Object.entries(applicationLocales)
      .map(
        ([locale, values]) =>
          `i18n.addResourceBundle(${JSON.stringify(locale)}, "translation", ${JSON.stringify({ ...values, ...options.content?.translations?.[locale as "en" | "zh"] })}, true, false)`
      )
      .join("\n")}\n`
  )
  for (const [target, source] of applicationRoutes(options, frontendOperations, pages))
    files.set(target, source)
  if (options.selection.host === "extension") {
    const layout = files.get("src/features/application/ApplicationLayout.tsx")
    if (layout)
      files.set(
        "src/features/application/ApplicationLayout.tsx",
        stripBrandImage(
          layout
            .replace('import { BUILD_VERSION } from "../../buildVersion"\n', "")
            .replace(/\s*<footer>[\s\S]*?<\/footer>/u, "")
            .replace("const useSidebar = true", "const useSidebar = false")
        )
      )
    const auth = files.get("src/features/identity/AuthLayout.tsx")
    if (auth) files.set("src/features/identity/AuthLayout.tsx", stripBrandImage(auth))
  }
  const wiring: ApplicationWiring = {
    schemaVersion: 1,
    host: selected.host,
    requested: selected.requested,
    resolved: selected.resolved,
    requiredBy: selected.requiredBy,
    pages,
    actions,
    dataMode: options.dataMode
  }
  files.set(".harness/application-wiring.json", JSON.stringify(wiring, null, 2) + "\n")
  const baselineEntry =
    selected.host === "web" ? "src/routes/__root.tsx" : "src/extension-router.tsx"
  for (const target of files.keys()) {
    if (base.has(target) && target !== baselineEntry)
      throw new Error(`已有能力实现，不能覆盖：${target}`)
  }
  const combined = new Map(base)
  for (const target of combined.keys()) {
    if (
      target.startsWith("src/routes/") ||
      [
        "src/app/RootLayout.tsx",
        "src/app/RootLayout.test.tsx",
        "src/ExtensionShell.test.tsx"
      ].includes(target)
    )
      combined.delete(target)
  }
  for (const [target, source] of files) combined.set(target, source)
  return combined
}

/** 提供标准路径给资源治理，固定模板不执行安装、网络或外部写入。 */
export const applicationTemplateRoot = path.dirname(fileURLToPath(import.meta.url))
