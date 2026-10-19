import type { ApplicationOptions } from "./contracts.ts"

/** 将已解析操作装配为同一会话、权限和服务实例，不创建第二套请求客户端。 */
export function runtimeSource(options: ApplicationOptions, operations: readonly string[]): string {
  const modules = new Set(operations.map((id) => id.split(".")[0]))
  const identity = modules.has("identity")
  const permissions = modules.has("permissions")
  const organization = modules.has("organization")
  const imports = [
    'import { queryClient } from "../../app/queryClient"',
    'import { createApplicationScope } from "./scope"'
  ]
  const lines = [
    "export const applicationScope = createApplicationScope()",
    "/** 客户端作用域只用于隔离缓存与迟到回调，不是服务端授权凭据。 */",
    "export const currentScope = () => applicationScope.getSnapshot().revision",
    "/** 只清理已明确标记的私有查询，保留语言、主题和公共缓存。 */",
    "export function clearPrivateData() {",
    "  applicationScope.invalidate()",
    "  void queryClient.cancelQueries({ predicate: (query) => query.meta?.private === true }).catch(() => undefined)",
    "  queryClient.removeQueries({ predicate: (query) => query.meta?.private === true })",
    "}"
  ]
  const fixtures = options.fixtures ?? {}
  /** 实际服务必须显式提供 adapter；Mock 只生成所选能力的 API 边界。 */
  function api(module: string, mockImport: string, construction: string) {
    if (options.dataMode === "adapter")
      imports.push(
        `import { api as ${module}Api } from "../../data/api/${module === "wallet" ? "wallet-payments" : module === "permission" ? "permissions" : module}/adapter"`
      )
    else {
      imports.push(mockImport)
      lines.push(construction)
    }
  }
  if (identity) {
    imports.push(
      'import { APP_CONFIG } from "../../config/environment"',
      'import { applicationHttp, configureUnauthorizedHandler } from "../../data/api/client/httpRuntime"',
      'import { createIdentityCredentials } from "../../data/storage/identityCredentials"',
      'import { createIdentityRuntime } from "../identity/runtime"'
    )
    api(
      "identity",
      'import { createIdentityMock } from "../../data/api/identity/mock"',
      `const identityApi = createIdentityMock(${JSON.stringify(fixtures.accounts ?? [])})`
    )
    lines.push(`export const identitySession = createIdentityRuntime({
  api: identityApi,
  storage: createIdentityCredentials(),
  transport: {
    /** 没有远端地址时不构造 HTTP；配置真实服务后仍复用唯一 Token owner。 */
    setAuthToken(token) { if (APP_CONFIG.apiBaseUrl !== "") applicationHttp.setAuthToken(token) },
    clearSession: () => applicationHttp.clearSession()
  },
  clearPrivateData
})
configureUnauthorizedHandler({ handleUnauthorized: (_error, context) => {
  if (context?.signal.aborted || context?.isCurrentSession() === false) return
  identitySession.invalidate()
} })
/** 领域服务只消费当前主体，页面无法通过参数覆盖认证身份。 */
export const identityActor = () => identitySession.getSnapshot().identity?.id ?? null`)
  }
  if (organization) lines.push("let organizationId: string | null = null")
  lines.push(
    `/** Mock 服务态按实际身份${organization ? "与组织" : ""}隔离；真实 adapter 继续由服务端校验。 */\nexport const actor = () => ${identity ? (organization ? "identityActor() === null ? null : JSON.stringify([identityActor(), organizationId])" : "identityActor()") : "null"}`
  )
  if (modules.has("catalog"))
    api(
      "catalog",
      'import { createCatalogMock } from "../../data/api/catalog/mock"',
      `export const catalogApi = createCatalogMock(${JSON.stringify(fixtures.products ?? [])})`
    )
  if (modules.has("orders") && operations.includes("orders.create"))
    api(
      "orders",
      'import { createOrdersMock } from "../../data/api/orders/mock"',
      `const ordersMock = createOrdersMock(actor, ${JSON.stringify(fixtures.products ?? [])})\nexport const ordersApi = ordersMock.api`
    )
  else if (modules.has("orders"))
    api(
      "orders",
      'import { createOrdersReadMock } from "../../data/api/orders/readMock"',
      `export const ordersApi = createOrdersReadMock(actor, ${JSON.stringify(fixtures.orders ?? {})})`
    )
  if (modules.has("wallet-payments")) {
    if (operations.includes("wallet-payments.pay"))
      api(
        "wallet",
        'import { createWalletMock } from "../../data/api/wallet-payments/mock"',
        `export const walletApi = createWalletMock(actor, ${JSON.stringify(fixtures.balances ?? {})}, ordersMock.settle)`
      )
    else
      api(
        "wallet",
        'import { createWalletReadMock } from "../../data/api/wallet-payments/readMock"',
        `export const walletApi = createWalletReadMock(actor, ${JSON.stringify(fixtures.balances ?? {})})`
      )
  }
  if (modules.has("audit"))
    api(
      "audit",
      'import { createAuditMock } from "../../data/api/audit/mock"',
      `export const auditApi = createAuditMock(actor, ${JSON.stringify(fixtures.audit ?? [])})`
    )
  if (organization) {
    api(
      "organization",
      'import { createOrganizationMock } from "../../data/api/organization/mock"',
      `const organizationApi = createOrganizationMock(identityActor, ${JSON.stringify(fixtures.organizations ?? {})})`
    )
    lines.push(`/** 在所有消费者共享的 API 边界校验组织上下文，不采用损坏或不在可选集中的身份。 */
async function readOrganizationContext(signal?: AbortSignal) {
  const context = await organizationApi.read(signal)
  if (!context || !Array.isArray(context.available) ||
    context.available.some((row) => !row || typeof row.id !== "string" || !row.id.trim() || typeof row.name !== "string" || !row.name.trim()) ||
    new Set(context.available.map((row) => row.id)).size !== context.available.length ||
    (context.current !== null && (typeof context.current !== "string" || !context.available.some((row) => row.id === context.current)))) throw new Error("organization_invalid")
  return context
}
/** 导航和切换均先确认组织上下文；异步旧结果无权恢复新作用域。 */
export async function ensureOrganization() {
  const subject = identityActor()
  const revision = currentScope()
  const context = await readOrganizationContext()
  if (subject !== identityActor() || revision !== currentScope()) throw new Error("organization_superseded")
  if (organizationId !== context.current) { organizationId = context.current; clearPrivateData() }
}
/** 切换期间撤下全部私有正文，未知结果先重读，不能继续沿用旧组织。 */
export const organizationService = {
  read: readOrganizationContext,
  /** 只提交当前主体的组织切换，再确认权限和作用域。 */
  async switch(id: string) {
    const subject = identityActor()
    const owned = applicationScope.begin()
    void queryClient.cancelQueries({ predicate: (query) => query.meta?.private === true }).catch(() => undefined)
    queryClient.removeQueries({ predicate: (query) => query.meta?.private === true })
    try {
      let switchError: unknown
      try { await organizationApi.switch(id) } catch (error) { switchError = error }
      const context = await readOrganizationContext()
      if (owned !== currentScope() || subject !== identityActor()) throw new Error("organization_superseded")
      organizationId = context.current
      ${permissions ? "await permissionSession.refresh()" : ""}
      applicationScope.finish(owned)
      if (context.current !== id) throw switchError ?? new Error("organization_switch_unconfirmed")
    } catch (error) {
      if (owned === currentScope() && applicationScope.getSnapshot().blocked) { identitySession.invalidate() }
      throw error
    }
  }
}`)
  }
  if (permissions) {
    imports.push('import { createPermissionRuntime } from "../permissions/runtime"')
    api(
      "permission",
      'import { createPermissionMock } from "../../data/api/permissions/mock"',
      `export const permissionMock = createPermissionMock(${JSON.stringify(fixtures.grants ?? [])})\nconst permissionApi = permissionMock.api`
    )
    lines.push(`export const permissionSession = createPermissionRuntime(permissionApi, () => {
  const id = identityActor()
  return id === null ? null : { id, organizationId: ${organization ? "organizationId" : "null"}, scope: currentScope() }
}, identitySession.subscribe)
export const pagePermissions: Record<string, readonly string[]> = ${JSON.stringify(options.pagePermissions ?? {})}
export const actionPermissions: Record<string, readonly string[]> = ${JSON.stringify(options.actionPermissions ?? {})}
/** 菜单、路由和页面共用相同权限码；缺失要求不会自动放行。 */
export const canVisit = (path: string) => path === "/forbidden" || permissionSession.allow(pagePermissions[path] ?? [])
/** 元素可见性与提交前复核来自同一动作要求。 */
export const canAct = (action: string) => permissionSession.allow(actionPermissions[action] ?? [])
/** 真实写操作在执行前再次核验当前授权。 */
export function assertAction(action: string) { permissionSession.assert(actionPermissions[action] ?? []) }`)
  }
  if (options.dataMode === "adapter") {
    for (const module of modules)
      if (module !== "permissions") {
        const name = module === "wallet-payments" ? "wallet" : module
        if (lines.every((line) => !line.includes(`export const ${name}Api`)))
          lines.push(`export { ${name}Api }`)
      }
  }
  if (operations.includes("orders.purchase")) {
    imports.push('import { createPurchaseRegistry } from "../orders/purchase"')
    lines.push(`/** 购买最少要求已确认身份；启用权限时同时校验实际购买权限码。 */
export function assertPurchase() {
  if (!identitySession.getSnapshot().identity || applicationScope.getSnapshot().blocked) throw new Error("identity_required")
  ${permissions ? 'assertAction("orders.purchase")' : ""}
}
/** 弹窗与路由复用当前作用域内未决购买，不丢弃未知结果。 */
export const purchaseRegistry = createPurchaseRegistry(ordersApi, walletApi, currentScope, assertPurchase)`)
  }
  if (options.selection.host === "extension")
    imports[0] = 'import { queryClient } from "../../providers"'
  return imports.join("\n") + "\n\n" + lines.join("\n") + "\n"
}
