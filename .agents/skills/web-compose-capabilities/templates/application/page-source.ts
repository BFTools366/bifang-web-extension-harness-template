import type { ApplicationOptions, ApplicationPage } from "./contracts.ts"

/** 生成模板组件到当前应用唯一 runtime 的实际接线，不让页面另建会话或请求 owner。 */
export function applicationPageSource(
  options: ApplicationOptions,
  operations: readonly string[],
  pages: readonly ApplicationPage[]
): string {
  const identity = operations.includes("identity.session")
  const permissions = operations.includes("permissions.enforce")
  const purchase = operations.includes("orders.purchase")
  const organization = operations.includes("organization.switch")
  const imports = [
    "import { useSyncExternalStore" +
      (purchase ? ", useState" : "") +
      (identity ? ", useCallback" : "") +
      ' } from "react"',
    ...(identity || operations.includes("organization.switch")
      ? ['import { Outlet, useRouter } from "@tanstack/react-router"']
      : ['import { Outlet } from "@tanstack/react-router"']),
    'import { Text } from "@mantine/core"',
    'import { useTranslation } from "react-i18next"',
    'import { ApplicationLayout } from "./ApplicationLayout"',
    "import { applicationScope" +
      (identity ? ", identitySession" : "") +
      (permissions
        ? ", permissionSession, pagePermissions, canVisit" +
          (purchase || operations.includes("organization.switch") ? ", canAct" : "") +
          (operations.includes("organization.switch") ? ", assertAction" : "")
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
      'import { OrganizationContext, OrganizationMenuItem } from "../organization/OrganizationContext"',
      'import { organizationService } from "./runtime"'
    )
  if (permissions)
    imports.push(
      'import { Access } from "../permissions/Access"',
      'import { ForbiddenPage } from "../permissions/ForbiddenPage"'
    )
  lines.push(`/** 持续主界面接入当前用户、权限过滤导航和真实路由正文。 */
export function MainLayout() {
  ${identity ? 'const router = useRouter()\n  const onAnonymous = useCallback(() => { void router.navigate({ to: "/login", search: { returnTo: safeReturnTo(router.state.location.pathname) }, replace: true }).catch(() => undefined) }, [router])' : ""}
  const { t } = useTranslation()
  const scope = useScope()
  ${permissions ? "useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)" : ""}
  const layout = <ApplicationLayout
    ${identity ? "account={<AccountMenu session={identitySession} scope={scope.revision}" + (organization ? " organization={" + (permissions ? 'canVisit("/organization") && ' : "") + "<OrganizationMenuItem api={organizationService} scope={scope.revision} blocked={scope.blocked} />}" : "") + " />}" : ""}
    ${organization ? "context={(compact) => <OrganizationContext api={organizationService} scope={scope.revision} blocked={scope.blocked} compact={compact} canOpen={" + (permissions ? 'canVisit("/organization")' : "true") + "} />}" : ""}
    ${permissions ? "allow={canVisit}" : ""}
    content={scope.blocked ? <Text role="status">{t("applicationLoading")}</Text> : <Outlet />}
  />
  ${identity ? "return <IdentityBoundary session={identitySession} onAnonymous={onAnonymous}>{layout}</IdentityBoundary>" : "return layout"}
}`)
  if (identity)
    lines.push(`/** 登录完成后仅返回已声明的应用内部路径。 */
export function Login() {
  const router = useRouter()
  return <LoginPage session={identitySession} mock={${options.dataMode === "mock"}} onSuccess={async () => {
    const target = new URLSearchParams(router.state.location.searchStr).get("returnTo")
    await router.navigate({ to: safeReturnTo(target), replace: true })
  }} />
}`)
  if (permissions)
    lines.push(`/** 撤权发生时立即撤下页面；不依赖被拒绝的业务权限。 */
export function PageAccess({ path, children }: { path: string; children: import("react").ReactNode }) {
  return <Access permission={permissionSession} required={pagePermissions[path] ?? []} fallback={<ForbiddenPage />}>{children}</Access>
}
export { ForbiddenPage }`)
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
    const serviceName = module === "wallet-payments" ? "wallet" : module
    if (!module) continue
    imports.push(`import { ${component} } from "../${module}/${component}"`)
    imports.push(
      `import { ${serviceName === "organization" ? "organizationService" : serviceName + "Api"} } from "./runtime"`
    )
    const name = component.replace(/Page$/u, "")
    const content = `<${component} api={${serviceName === "organization" ? "organizationService" : serviceName + "Api"}} scope={scope.revision}${module === "catalog" && purchase ? " canPurchase={" + (permissions ? 'canAct("orders.purchase")' : "true") + "} onPurchase={(product) => { assertPurchase(); setSelection({ product, purchase: purchaseRegistry.get(product.id), scope: scope.revision }) }}" : ""}${module === "organization" ? " canSwitch={" + (permissions ? 'canAct("organization.switch")' : "true") + "} changed={async () => { await router.invalidate({ sync: true }) }} authorize={() => {" + (permissions ? ' assertAction("organization.switch")' : "") + " }}" : ""} />`
    const wrapped = permissions
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
  return <>${wrapped}{selection?.scope === scope.revision${permissions ? ' && canVisit("/catalog") && canAct("orders.purchase")' : ""} && <PurchasePanel product={selection.product} purchase={selection.purchase} mock={${options.dataMode === "mock"}} close={() => setSelection(null)} />}</>
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
