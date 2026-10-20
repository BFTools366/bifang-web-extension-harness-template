import {
  permissionFreePaths,
  routeComponent,
  serviceName,
  type ApplicationOptions,
  type ApplicationPage
} from "./contracts.ts"

/** 生成模板组件到当前应用唯一 runtime 的实际接线，不让页面另建会话或请求 owner。 */
export function applicationPageSource(
  options: ApplicationOptions,
  operations: readonly string[],
  pages: readonly ApplicationPage[]
): string {
  const identity = operations.includes("identity.session")
  const permissions = operations.includes("permissions.enforce")
  const purchase = operations.includes("orders.purchase")
  const organization = operations.some((operation) => operation.startsWith("organization."))
  const management = operations.includes("organization.manage")
  const imports = [
    "import { useSyncExternalStore" +
      (purchase || organization ? ", useState" : "") +
      (identity ? ", useCallback" : "") +
      (organization ? ", useRef" : "") +
      ' } from "react"',
    ...(identity
      ? [
          `import { Outlet, useRouter${organization && permissions ? ", Link" : ""} } from "@tanstack/react-router"`
        ]
      : ['import { Outlet } from "@tanstack/react-router"']),
    "import { Text" +
      (organization ? ", Modal" : "") +
      (operations.includes("organization.switch") && permissions ? ", Anchor" : "") +
      (management ? ", Menu" : "") +
      ' } from "@mantine/core"',
    'import { useTranslation } from "react-i18next"',
    'import { ApplicationLayout } from "./ApplicationLayout"',
    "import { applicationScope" +
      (identity ? ", identitySession" : "") +
      (permissions
        ? ", permissionSession, pagePermissions, canVisit" + (purchase ? ", canAct" : "") + ""
        : "") +
      (purchase ? ", assertPurchase, purchaseRegistry" : "") +
      ' } from "./runtime"'
  ]
  const lines = [
    "/** 所有页面用同一作用域订阅隔离数据，不复制服务结果为全局状态。 */",
    "function useScope() { return useSyncExternalStore(applicationScope.subscribe, applicationScope.getSnapshot, applicationScope.getSnapshot) }"
  ]
  if (identity)
    imports.push(
      'import { IdentityBoundary } from "../identity/IdentityBoundary"',
      'import { AccountMenu } from "./AccountMenu"',
      'import { LoginPage } from "../identity/LoginPage"',
      'import { safeReturnTo } from "./routeAccess"'
    )
  if (organization)
    imports.push(
      'import { OrganizationContext } from "../organization/OrganizationContext"',
      'import { OrganizationMenu } from "../organization/OrganizationMenu"',
      'import { OrganizationPage } from "../organization/OrganizationPage"',
      "import { organizationService" +
        (management ? ", canManageOrganization" : "") +
        ' } from "./runtime"'
    )
  if (permissions)
    imports.push(
      'import type { ReactNode } from "react"',
      'import { Access } from "../permissions/Access"',
      'import { ForbiddenPage as PermissionDenied } from "../permissions/ForbiddenPage"'
    )
  lines.push(`/** 持续主界面接入当前用户、权限过滤导航和真实路由正文。 */
export function MainLayout() {
  ${identity ? 'const router = useRouter()\n  const onAnonymous = useCallback(() => { void router.navigate({ to: "/login", search: { returnTo: safeReturnTo(router.state.location.pathname) }, replace: true }).catch(() => undefined) }, [router])' : ""}
  const { t } = useTranslation()
  const scope = useScope()
  ${organization ? "const [switchState, setSwitchState] = useState({ opened: false, scope: scope.revision })\n  const accountTrigger = useRef<HTMLButtonElement>(null)" : ""}
  ${permissions ? "useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)" : ""}
  const layout = <ApplicationLayout
    ${identity ? "account={<AccountMenu session={identitySession} scope={scope.revision}" + (organization ? " triggerRef={accountTrigger} organization={<OrganizationMenu key={scope.revision} api={organizationService} scope={scope.revision} blocked={scope.blocked} canSwitch={" + operations.includes("organization.switch") + "}" + (management ? ' management={canVisit("/organization/manage") && <Menu.Item renderRoot={(props) => <Link {...props} to="/organization/manage" preload={false} />}>{t("organizationManage")}</Menu.Item>}' : "") + " open={() => setSwitchState({ opened: true, scope: scope.revision })} />}" : "") + " />}" : ""}
    ${organization ? "context={(compact) => <OrganizationContext api={organizationService} scope={scope.revision} blocked={scope.blocked} compact={compact} canOpen={" + (permissions ? 'canVisit("/organization")' : "true") + "} />}" : ""}
    ${permissions ? "allow={canVisit}" : ""}
    content={scope.blocked ? <Text role="status">{t("applicationLoading")}</Text> : <Outlet />}
  />
  ${identity ? "return <IdentityBoundary session={identitySession} onAnonymous={onAnonymous}>{layout}" + (organization ? '<Modal opened={switchState.opened && switchState.scope === scope.revision && !scope.blocked} returnFocus={false} onExitTransitionEnd={() => { if (switchState.scope === applicationScope.getSnapshot().revision && !applicationScope.getSnapshot().blocked) accountTrigger.current?.focus() }} onClose={() => setSwitchState((value) => ({ ...value, opened: false }))} title={t("organizationSwitch")}><OrganizationPage key={scope.revision} api={organizationService} scope={scope.revision} canSwitch={' + operations.includes("organization.switch") + "} changed={async () => { setSwitchState((value) => ({ ...value, opened: false })); await router.invalidate({ sync: true }) }} /></Modal>" : "") + "</IdentityBoundary>" : "return layout"}
}`)
  if (identity)
    lines.push(`/** 登录完成后仅返回已声明的应用内部路径。 */
export function Login() {
  const router = useRouter()
  return <LoginPage session={identitySession} mock={false} onSuccess={async () => {
    const target = new URLSearchParams(router.state.location.searchStr).get("returnTo")
    await router.navigate({ to: safeReturnTo(target), replace: true })
  }} />
}`)
  if (permissions)
    lines.push(`/** 撤权发生时立即撤下页面；不依赖被拒绝的业务权限。 */
export function PageAccess({ path, children }: { path: string; children: ReactNode }) {
  return <Access permission={permissionSession} required={pagePermissions[path] ?? []} fallback={<ForbiddenPage />}>{children}</Access>
}
/** 拒绝页的组织恢复不依赖被撤销的业务权限，管理页面仍走独立门禁。 */
export function ForbiddenPage() {
  ${operations.includes("organization.switch") ? "const { t } = useTranslation()" : ""}
  return <PermissionDenied ${operations.includes("organization.switch") ? 'recovery={<Anchor renderRoot={(props) => <Link {...props} to="/organization" preload={false} />}>{t("organizationSwitch")}</Anchor>}' : ""} />
}`)
  for (const page of pages) {
    if (page.component === "HomePage") {
      imports.push('import { HomePage } from "../home/HomePage"')
      lines.push(
        `/** 产品首页由已确认需求提供，固定布局仅负责挂载。 */\nexport function Home() { return ${permissions ? '<PageAccess path="/"><HomePage /></PageAccess>' : "<HomePage />"} }`
      )
      continue
    }
    const module = page.module
    const component = page.component
    if (!module) continue
    const service = module === "organization" ? "organizationService" : serviceName(module) + "Api"
    if (component === "OrganizationManagementPage") {
      imports.push(
        'import { OrganizationManagementPage } from "../organization/OrganizationManagementPage"'
      )
      lines.push(`/** 管理直达、持续权限与保存动作均要求当前组织拥有者。 */
export function OrganizationManagement() {
  const scope = useScope()
  useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)
  return canVisit("/organization/manage") ? <OrganizationManagementPage key={scope.revision} api={organizationService} scope={scope.revision} authorize={() => { if (!canVisit("/organization/manage")) throw new Error("organization_denied") }} isCurrent={() => applicationScope.getSnapshot().revision === scope.revision && canManageOrganization()} /> : <ForbiddenPage />
}`)
      continue
    }
    imports.push(`import { ${component} } from "../${module}/${component}"`)
    if (module !== "organization") imports.push(`import { ${service} } from "./runtime"`)
    const name = routeComponent(page)
    const content = `<${component} api={${service}} scope={scope.revision}${module === "catalog" && purchase ? " canPurchase={" + (permissions ? 'canAct("orders.purchase")' : "true") + "} onPurchase={(product) => { assertPurchase(); setSelection({ product, purchase: purchaseRegistry.get(product.id), scope: scope.revision }) }}" : ""}${module === "organization" ? " canSwitch={" + JSON.stringify(operations.includes("organization.switch")) + "} changed={async () => { await router.invalidate({ sync: true }) }}" : ""} />`
    const wrapped =
      permissions && !permissionFreePaths(organization).includes(page.path)
        ? `<PageAccess path=${JSON.stringify(page.path)}>${content}</PageAccess>`
        : content
    if (module === "catalog" && purchase) {
      imports.push(
        'import { PurchasePanel } from "../orders/PurchasePanel"',
        'import type { Product } from "../../data/api/catalog/contracts"'
      )
      lines.push(`/** 商品购买操作接入同一用户、订单、钱包与权限 owner。 */
export function ${name}() {
  const scope = useScope()
  const [selection, setSelection] = useState<{ product: Product; purchase: ReturnType<typeof purchaseRegistry.get>; scope: number } | null>(null)
  ${permissions ? "useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)" : ""}
  return <>${wrapped}{selection?.scope === scope.revision${permissions ? ' && canVisit("/catalog") && canAct("orders.purchase")' : ""} && <PurchasePanel product={selection.product} purchase={selection.purchase} mock={false} close={() => setSelection(null)} />}</>
}`)
    } else
      lines.push(`/** 接入已选 ${module} 页面的领域 API 与当前查询作用域。 */
export function ${name}() {
  const scope = useScope()
  ${module === "organization" ? "const router = useRouter()" : ""}
  ${module === "organization" && permissions ? "useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)" : ""}
  return ${wrapped}
}`)
  }
  // 组件导入与 runtime 导入去重，同时保持显式具名边界。
  const source = [...new Set(imports)].join("\n") + "\n\n" + lines.join("\n") + "\n"
  return source
}
