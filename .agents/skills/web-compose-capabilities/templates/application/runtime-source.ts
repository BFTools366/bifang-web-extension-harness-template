import { permissionFreePaths, serviceName, type ApplicationOptions } from "./contracts.ts"

/** 将已解析操作装配为同一会话、权限和服务实例，不创建第二套请求客户端。 */
export function runtimeSource(options: ApplicationOptions, operations: readonly string[]): string {
  const modules = new Set(operations.map((id) => id.slice(0, id.indexOf("."))))
  const identity = operations.includes("identity.session")
  const permissions = modules.has("permissions")
  const organization = modules.has("organization")
  const management = operations.includes("organization.manage")
  const workspace = operations.includes("identity.workspace")
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
  /** 每个服务只从真实 adapter 导入，运行装配不再接受 fixtures 或 Mock 构造。 */
  function api(module: string) {
    imports.push(
      `import { api as ${module}Api } from "../../data/api/${module === "wallet" ? "wallet-payments" : module === "permission" ? "permissions" : module}/adapter"`
    )
  }
  if (identity) {
    imports.push(
      'import { APP_CONFIG } from "../../config/environment"',
      'import { applicationHttp, configureUnauthorizedHandler } from "../../data/api/client/httpRuntime"',
      'import { createIdentityCredentials } from "../../data/storage/identityCredentials"',
      'import { createIdentityRuntime } from "../identity/runtime"'
    )
    api("identity")
    lines.push(`export const identitySession = createIdentityRuntime({
  api: identityApi,
  storage: createIdentityCredentials(),
  transport: {
    /** 复用已配置真实服务与唯一 Token owner。 */
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

  if (workspace) {
    imports.push('import { createTeamService } from "../../data/api/organization/teamService"')
    lines.push(`/** 团队生命周期复用既有会话、组织切换和权限 owner，不创建第二套上下文。 */
export const teamService = createTeamService({ ...organizationApi, switch: (id) => organizationService.switch(id) }, {
  account: identityActor, scope: currentScope, blocked: () => applicationScope.getSnapshot().blocked, allow: (codes) => permissionSession.allow(codes),
  /** 写入后先权威恢复成员和权限，撤权立即撤下旧正文，再刷新当前私有查询。 */
  async refresh() {
    await ensureOrganization()
    await permissionSession.refresh()
    await queryClient.invalidateQueries({ predicate: (query) => query.meta?.private === true && ["team", "organization"].includes(String(query.queryKey[0])) }, { throwOnError: true })
  }
})`)
  }
  lines.push(
    `/** 查询作用域按实际身份${organization ? "与组织" : ""}隔离；服务端独立校验授权。 */\nexport const actor = () => ${identity ? (organization ? "organizationUser?.accountId === identityActor() ? organizationUser.id : null" : "identityActor()") : "null"}`
  )
  if (organization)
    lines.push(`/** 显式区分账号、团队和成员归属；创建者与 actor helper 不能代替数据所有者。 */
export function currentDataOwnership() {
  const accountId = identityActor()
  if (!accountId || applicationScope.getSnapshot().blocked || !organizationUser || organizationUser.accountId !== accountId || organizationUser.organizationId !== organizationId) return null
  return Object.freeze({ accountId, organizationId: organizationUser.organizationId, organizationUserId: organizationUser.id, revision: currentScope() })
}`)
  for (const module of ["catalog", "orders", "audit"]) if (modules.has(module)) api(module)
  if (modules.has("wallet-payments")) api("wallet")
  if (organization) {
    api("organization")
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
/** 前端只以有效权限码控制管理入口，拥有者保护由后端对象规则执行。 */
export function canManageOrganization() {
  return ${management ? '!applicationScope.getSnapshot().blocked && ["team.settings.read", "team.members.read", "team.roles.read"].some((code) => permissionSession.allow([code]))' : "false"}
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
  /** 页面提交前与服务层共用权限 code 判定，迟到结果不刷新新组织。 */
  async rename(id: string, name: string) {
    if (!permissionSession.allow(["team.settings.read", "team.settings.update"]) || id !== organizationId) throw new Error("organization_denied")
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
    api("permission")
    lines.push(`export const permissionSession = createPermissionRuntime(permissionApi, () => {
  const id = ${organization ? "actor()" : "identityActor()"}
  return id === null ? null : { id, organizationId: ${organization ? "organizationId" : "null"}, scope: applicationScope.getSnapshot().ownerRevision }
}, (listener) => {
  const unsubscribeIdentity = identitySession.subscribe(listener)
  const unsubscribeScope = applicationScope.subscribe(listener)
  return () => { unsubscribeIdentity(); unsubscribeScope() }
}, () => {
  // 权限主体代次保持稳定，业务代次失效；避免刷新权限时自清循环。
  applicationScope.revoke()
  dropPrivateQueries()
})
export const pagePermissions: Record<string, readonly string[]> = ${JSON.stringify(options.pagePermissions ?? {})}
export const actionPermissions: Record<string, readonly string[]> = ${JSON.stringify(options.actionPermissions ?? {})}
/** 菜单、路由和页面共用相同权限码；缺失要求不会自动放行。 */
export const canVisit = (path: string) => ${permissionFreePaths(organization)
      .map((path) => "path === " + JSON.stringify(path))
      .join(" || ")} || permissionSession.allow(pagePermissions[path] ?? [])
/** 元素可见性与提交前复核来自同一动作要求。 */
export const canAct = (action: string) => permissionSession.allow(actionPermissions[action] ?? [])
/** 真实写操作在执行前再次核验当前授权。 */
export function assertAction(action: string) { permissionSession.assert(actionPermissions[action] ?? []) }`)
  }
  for (const module of modules)
    if (module !== "permissions") lines.push(`export { ${serviceName(module)}Api }`)
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
