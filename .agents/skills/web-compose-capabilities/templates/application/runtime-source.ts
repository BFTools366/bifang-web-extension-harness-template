import { permissionFreePaths, serviceName, type ApplicationOptions } from "./contracts.ts"

/** 将已解析操作装配为同一会话、权限和服务实例，不创建第二套请求客户端。 */
export function runtimeSource(options: ApplicationOptions, operations: readonly string[]): string {
  const modules = new Set(operations.map((id) => id.slice(0, id.indexOf("."))))
  const identity = modules.has("identity")
  const permissions = modules.has("permissions")
  const organization = modules.has("organization")
  const management = operations.includes("organization.manage")
  const imports = [
    'import { queryClient } from "../../app/queryClient"',
    'import { createApplicationScope } from "./scope"'
  ]
  const lines = [
    "export const applicationScope = createApplicationScope()",
    "/** 客户端作用域只用于隔离缓存与迟到回调，不是服务端授权凭据。 */",
    "export const currentScope = () => applicationScope.getSnapshot().revision",
    "/** 取消并移除已标记私有查询，会话清理与组织切换共用。 */",
    "function dropPrivateQueries() {",
    "  void queryClient.cancelQueries({ predicate: (query) => query.meta?.private === true }).catch(() => undefined)",
    "  queryClient.removeQueries({ predicate: (query) => query.meta?.private === true })",
    "}",
    "/** 只清理已明确标记的私有查询，保留语言、主题和公共缓存。 */",
    "export function clearPrivateData() {",
    "  applicationScope.invalidate()",
    "  dropPrivateQueries()",
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
  if (organization) {
    imports.push(
      'import type { OrganizationUser } from "../../data/api/organization/contracts"',
      'import { validateOrganizationContext } from "../../data/api/organization/context"'
    )
    lines.push(
      "let organizationId: string | null = null",
      "let organizationUser: OrganizationUser | null = null",
      "identitySession.subscribe(() => { if (organizationUser?.accountId !== identityActor()) { organizationId = null; organizationUser = null } })"
    )
  }
  lines.push(
    `/** Mock 服务态按实际身份${organization ? "与组织" : ""}隔离；真实 adapter 继续由服务端校验。 */\nexport const actor = () => ${identity ? (organization ? "organizationUser?.accountId === identityActor() ? organizationUser.id : null" : "identityActor()") : "null"}`
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
      `const organizationApi = createOrganizationMock(identityActor, ${JSON.stringify(fixtures.organizations ?? [])}, ${JSON.stringify(fixtures.organizationUsers ?? [])}, (user) => user.id === actor() && canManageOrganization())`
    )
    lines.push(`/** 账号与组织用户在同一 API 边界验证，损坏关系不会进入权限 owner。 */
async function readOrganizationContext(signal?: AbortSignal) {
  const accountId = identityActor()
  if (!accountId) throw new Error("identity_required")
  const context = await organizationApi.read(signal)
  if (accountId !== identityActor()) throw new Error("organization_superseded")
  return validateOrganizationContext(context, accountId)
}
/** 只有已校验关系中的标识与角色进入运行时 owner，不复制组织名称。 */
function acceptOrganization(context: Awaited<ReturnType<typeof readOrganizationContext>>) {
  organizationId = context.current
  organizationUser = context.available.find((row) => row.id === context.current)?.user ?? null
}
/** 恢复导航不干扰未完成切换；守卫始终权威重读，取消的导航同时中止读取，迟到读取不能复活旧会话。 */
export async function ensureOrganization(signal?: AbortSignal) {
  if (applicationScope.getSnapshot().blocked) throw new Error("organization_switching")
  const accountId = identityActor()
  const revision = currentScope()
  const context = await readOrganizationContext(signal)
  if (accountId !== identityActor() || revision !== currentScope()) throw new Error("organization_superseded")
  const nextUser = context.available.find((row) => row.id === context.current)?.user
  const changed = organizationId !== context.current || organizationUser?.id !== nextUser?.id || organizationUser?.role !== nextUser?.role
  acceptOrganization(context)
  if (changed) clearPrivateData()
}
/** 拥有者身份与管理权限分别复核，组织恢复页的豁免不延伸到管理。 */
export function canManageOrganization() {
  return ${management ? '!applicationScope.getSnapshot().blocked && organizationUser !== null && organizationUser.accountId === identityActor() && organizationUser.role === "owner" && canAct("organization.manage")' : "false"}
}
/** 切换期间撤下私有正文；服务端未知结果权威重读，不用本地旧值伪装回滚。 */
export const organizationService = {
  read: readOrganizationContext,
  /** 相同组织立即返回，既不请求服务也不改缓存、权限或 revision。 */
  async switch(id: string) {
    ${
      operations.includes("organization.switch")
        ? `
    const accountId = identityActor()
    if (!accountId || applicationScope.getSnapshot().blocked) throw new Error("organization_switching")
    if (organizationId === id && organizationUser?.accountId === accountId) return
    const owned = applicationScope.begin()
    dropPrivateQueries()
    try {
      let switchError: unknown
      try { await organizationApi.switch(id) } catch (error) { switchError = error }
      const context = await readOrganizationContext()
      if (owned !== currentScope() || accountId !== identityActor()) throw new Error("organization_superseded")
      acceptOrganization(context)
      ${permissions ? "await permissionSession.refresh()" : ""}
      if (owned !== currentScope() || accountId !== identityActor()) throw new Error("organization_superseded")
      applicationScope.finish(owned)
      if (context.current !== id) throw switchError ?? new Error("organization_switch_unconfirmed")
    } catch (error) {
      if (owned === currentScope() && applicationScope.getSnapshot().blocked) identitySession.invalidate()
      throw error
    }
`
        : 'void id; throw new Error("organization_switch_unavailable")'
    }
  }${
    management
      ? `,
  /** 页面提交前与服务层共用 owner 判定，迟到结果不刷新新组织。 */
  async rename(id: string, name: string) {
    if (!canManageOrganization() || id !== organizationId) throw new Error("organization_denied")
    const accountId = identityActor()
    const revision = currentScope()
    await organizationApi.rename(id, name)
    if (accountId !== identityActor() || revision !== currentScope()) throw new Error("organization_superseded")
    let refreshed = true
    try { await queryClient.invalidateQueries({ queryKey: ["organization", revision] }, { throwOnError: true }) }
    catch { refreshed = false }
    if (accountId !== identityActor() || revision !== currentScope()) throw new Error("organization_superseded")
    return { name: name.trim(), refreshed }
  }`
      : ""
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
  const id = ${organization ? "actor()" : "identityActor()"}
  return id === null ? null : { id, organizationId: ${organization ? "organizationId" : "null"}, scope: currentScope() }
}, (listener) => {
  const unsubscribeIdentity = identitySession.subscribe(listener)
  const unsubscribeScope = applicationScope.subscribe(listener)
  return () => { unsubscribeIdentity(); unsubscribeScope() }
})
export const pagePermissions: Record<string, readonly string[]> = ${JSON.stringify(options.pagePermissions ?? {})}
export const actionPermissions: Record<string, readonly string[]> = ${JSON.stringify(options.actionPermissions ?? {})}
/** 菜单、路由和页面共用相同权限码；缺失要求不会自动放行。 */
export const canVisit = (path: string) => ${management ? 'path === "/organization/manage" ? canManageOrganization() && permissionSession.allow(pagePermissions[path] ?? []) : ' : ""}${permissionFreePaths(
      organization
    )
      .map((path) => "path === " + JSON.stringify(path))
      .join(" || ")} || permissionSession.allow(pagePermissions[path] ?? [])
/** 元素可见性与提交前复核来自同一动作要求。 */
export const canAct = (action: string) => permissionSession.allow(actionPermissions[action] ?? [])
/** 真实写操作在执行前再次核验当前授权。 */
export function assertAction(action: string) { permissionSession.assert(actionPermissions[action] ?? []) }`)
  }
  if (options.dataMode === "adapter") {
    for (const module of modules)
      if (module !== "permissions") lines.push(`export { ${serviceName(module)}Api }`)
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
