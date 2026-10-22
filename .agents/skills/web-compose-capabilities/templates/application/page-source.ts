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
  const registration = operations.includes("identity.register")
  const personal = operations.includes("identity.profile")
  const password = operations.includes("identity.password.change")
  const accountSettings = personal || password
  const permissions = operations.includes("permissions.enforce")
  const purchase = operations.includes("orders.purchase")
  const organization = operations.some((operation) => operation.startsWith("organization."))
  const switching = operations.includes("organization.switch")
  const workspace = operations.includes("identity.workspace")
  const switchPanel = workspace
    ? "{(onCloseBlockedChange) => <OrganizationMembership scope={scope.revision} onCloseBlockedChange={onCloseBlockedChange} />}"
    : ""
  const imports = [
    "import { useSyncExternalStore" +
      (purchase || switching || accountSettings ? ", useState" : "") +
      (identity ? ", useCallback" : "") +
      (switching || permissions || accountSettings ? ", useRef" : "") +
      (accountSettings || workspace ? ", useEffect" : "") +
      ' } from "react"',
    ...(identity
      ? [
          `import { Outlet, useRouter${registration || (operations.includes("organization.switch") && permissions) ? ", Link" : ""} } from "@tanstack/react-router"`
        ]
      : ['import { Outlet } from "@tanstack/react-router"']),
    "import { Text" +
      (registration || (operations.includes("organization.switch") && permissions)
        ? ", Anchor"
        : "") +
      (personal || password ? ", Menu" : "") +
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
      ...(switching ? [] : ['import { OrganizationPage } from "../organization/OrganizationPage"']),
      "import { organizationService" + ' } from "./runtime"'
    )
  if (switching)
    imports.push(
      'import { OrganizationMenu } from "../organization/OrganizationMenu"',
      'import { OrganizationSwitchDialog } from "../organization/OrganizationSwitchDialog"'
    )
  if (workspace)
    imports.push(
      'import { TeamInbox } from "../organization/TeamInbox"',
      'import { TeamLeave } from "../organization/TeamLeave"',
      'import { teamService } from "./runtime"'
    )
  if (personal)
    imports.push(
      'import { PersonalSettingsPage } from "../identity/PersonalSettingsPage"',
      'import { personalSettingsApi } from "../../data/api/identity/adapter"'
    )
  if (password)
    imports.push(
      'import { ChangePasswordPage } from "../identity/ChangePasswordPage"',
      ...(!personal
        ? ['import { personalSettingsApi } from "../../data/api/identity/adapter"']
        : [])
    )
  if (accountSettings) imports.push('import { AccountDialog } from "../identity/AccountDialog"')
  if (registration)
    imports.push(
      'import { RegistrationPage } from "../identity/RegistrationPage"',
      'import * as registrationAdapter from "../../data/api/identity/adapter"',
      'import { registrationPasswordPolicy } from "../../data/api/identity/registration"'
    )
  if (permissions)
    imports.push(
      'import type { ReactNode } from "react"',
      'import { ForbiddenPage as PermissionDenied } from "../permissions/ForbiddenPage"'
    )
  lines.push(`/** 持续主界面接入当前用户、权限过滤导航和真实路由正文。 */
export function MainLayout() {
  ${identity ? 'const router = useRouter()\n  const onAnonymous = useCallback(() => { void router.navigate({ to: "/login", search: { returnTo: safeReturnTo(router.state.location.href) }, replace: true }).catch(() => undefined) }, [router])' : ""}
  const { t } = useTranslation()
  const scope = useScope()
  ${
    accountSettings
      ? `const account = useSyncExternalStore(identitySession.subscribe, identitySession.getSnapshot, identitySession.getSnapshot)
  const [accountOpened, setAccountOpened] = useState<"profile" | "password" | null>(null)
  const accountFocusTicket = useRef(0)
  useEffect(() => { accountFocusTicket.current += 1; setAccountOpened(null) }, [account.identity?.id, scope.revision])
  /** 重新打开会使旧关闭的延迟焦点归还失效。 */
  function openAccount(kind: "profile" | "password") { accountFocusTicket.current += 1; setAccountOpened(kind) }`
      : ""
  }
  ${accountSettings && !switching ? "const accountTrigger = useRef<HTMLButtonElement>(null)" : ""}
  ${
    switching
      ? `const [switchState, setSwitchState] = useState({ opened: false, scope: scope.revision })
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const switchDialog = useRef<HTMLDivElement>(null)
  const switchOwner = useRef({ opened: false, path: "" })
  /** 打开时记录导航归属，后来的页面不接收旧弹窗焦点。 */
  function openSwitch() {
    switchOwner.current = { opened: true, path: router.state.location.href }
    setSwitchState({ opened: true, scope: scope.revision })
  }
  /** 显式关闭拥有当前弹窗，重新打开会使旧退出回调失效。 */
  function closeSwitch() {
    switchOwner.current.opened = false
    setSwitchState((value) => ({ ...value, opened: false }))
  }
  /** 仅在原页面和作用域仍有效、用户尚未选择其他控件时归还焦点。 */
  function restoreSwitchFocus() {
    const current = applicationScope.getSnapshot()
    const trigger = accountTrigger.current
    if (!trigger?.isConnected || switchOwner.current.opened || switchOwner.current.path !== router.state.location.href || switchState.scope !== current.revision || current.blocked) return
    const active = trigger.ownerDocument.activeElement
    if (active && active !== trigger.ownerDocument.body && !switchDialog.current?.contains(active)) return
    trigger.focus()
  }`
      : ""
  }
  ${permissions ? "useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)" : ""}
  const layout = <ApplicationLayout
    ${identity ? "account={<AccountMenu session={identitySession} scope={scope.revision}" + (switching ? " triggerRef={accountTrigger} organization={<OrganizationMenu key={scope.revision} blocked={scope.blocked || !(" + operations.includes("organization.switch") + ")} open={openSwitch} />}" : accountSettings ? " triggerRef={accountTrigger}" : "") + (accountSettings ? " settings={<>" + (personal ? '<Menu.Item onClick={() => openAccount("profile")}>{t("personalSettings")}</Menu.Item>' : "") + (password ? '<Menu.Item onClick={() => openAccount("password")}>{t("personalPassword")}</Menu.Item>' : "") + "</>}" : "") + " />}" : ""}
    ${permissions ? "allow={canVisit}" : ""}
    content={scope.blocked${identity ? ' && !["/account/settings", "/account/password", "/organization"].includes(router.state.location.pathname)' : ""} ? <Text role="status">{t("applicationLoading")}</Text> : <Outlet />}
  />
  ${identity ? "return <IdentityBoundary session={identitySession} onAnonymous={onAnonymous}>{layout}" + (organization && operations.includes("organization.switch") ? "{switchState.opened && <OrganizationSwitchDialog api={organizationService} scope={scope.revision} blocked={scope.blocked} accountId={identitySession.getSnapshot().identity?.id ?? null} close={(restore = true) => { closeSwitch(); if (restore) queueMicrotask(restoreSwitchFocus) }} changed={async () => { await router.invalidate({ sync: true }) }}" + (workspace ? " invitations=" + switchPanel : "") + " />}" : "") + (accountSettings ? "{accountOpened && <AccountSettingsDialog key={accountOpened + account.identity?.id} kind={accountOpened} close={() => { setAccountOpened(null); const ticket = ++accountFocusTicket.current; const actor = account.identity?.id; const revision = scope.revision; const href = router.state.location.href; requestAnimationFrame(() => { const trigger = accountTrigger.current; const active = trigger?.ownerDocument.activeElement; if (ticket === accountFocusTicket.current && trigger?.isConnected && !applicationScope.getSnapshot().blocked && identitySession.getSnapshot().identity?.id === actor && applicationScope.getSnapshot().revision === revision && router.state.location.href === href && (!active || active === trigger.ownerDocument.body || active === trigger)) trigger.focus() }) }} />}" : "") + "</IdentityBoundary>" : "return layout"}
}`)
  if (workspace)
    lines.push(`/** 邀请和退出共享父弹窗关闭锁，两个操作的未知状态独立保留。 */
function OrganizationMembership({ scope, onCloseBlockedChange }: { scope: number; onCloseBlockedChange?(blocked: boolean): void }) {
  const [inboxBlocked, setInboxBlocked] = useState(false)
  const [leaveBlocked, setLeaveBlocked] = useState(false)
  useEffect(() => { onCloseBlockedChange?.(inboxBlocked || leaveBlocked); return () => onCloseBlockedChange?.(false) }, [inboxBlocked, leaveBlocked, onCloseBlockedChange])
  const isCurrent = () => applicationScope.getSnapshot().revision === scope && !applicationScope.getSnapshot().blocked
  return <><TeamInbox api={teamService} scope={scope} isCurrent={isCurrent} onCloseBlockedChange={setInboxBlocked} /><TeamLeave api={teamService} scope={scope} isCurrent={isCurrent} onCloseBlockedChange={setLeaveBlocked} /></>
}`)
  if (accountSettings) {
    const profileForm =
      "<PersonalSettingsPage embedded api={personalSettingsApi} session={identitySession} onCloseBlockedChange={setBlocked} />"
    const passwordForm =
      '<ChangePasswordPage embedded api={personalSettingsApi} session={identitySession} onCloseBlockedChange={setBlocked} onPasswordChanged={async () => { await router.navigate({ to: "/login", search: {}, replace: true }) }} />'
    lines.push(`/** 账号菜单和兼容地址共享弹窗及表单，账号或组织变化由外层身份边界隔离。 */
function AccountSettingsDialog({ kind, close }: { kind: "profile" | "password"; close(): void }) {
  const { t } = useTranslation()
  ${password ? "const router = useRouter()" : ""}
  const [blocked, setBlocked] = useState(false)
  return <AccountDialog title={t(kind === "profile" ? "personalSettings" : "personalPassword")} blocked={blocked} close={close}>${personal && password ? '{kind === "profile" ? ' + profileForm + " : " + passwordForm + "}" : personal ? profileForm : passwordForm}</AccountDialog>
}`)
  }
  if (identity)
    lines.push(`/** 登录完成后仅返回已声明的应用内部路径。 */
export function Login() {
  const router = useRouter()
  return <LoginPage session={identitySession} ${registration ? 'registrationLink={<Anchor renderRoot={(props) => <Link {...props} to="/register" search={{ returnTo: safeReturnTo(new URLSearchParams(router.state.location.searchStr).get("returnTo")) }} />}>{t("registrationTitle")}</Anchor>}' : ""} onSuccess={async () => {
    const target = new URLSearchParams(router.state.location.searchStr).get("returnTo")
    await router.navigate({ href: safeReturnTo(target), replace: true })
  }} />
}`)
  if (registration) {
    const loginIndex = lines.length - 1
    lines[loginIndex] =
      lines[loginIndex]?.replace(
        "  const router = useRouter()\n  return <LoginPage",
        "  const router = useRouter()\n  const { t } = useTranslation()\n  return <LoginPage"
      ) ?? ""
    lines.push(`/** 注册只收集邮箱与凭据，成功后显式登录；公开页保留安全返回目标。 */
export function Register() {
  const router = useRouter()
  const { t } = useTranslation()
  const target = safeReturnTo(new URLSearchParams(router.state.location.searchStr).get("returnTo"))
  return <RegistrationPage session={identitySession} api={{ register: registrationAdapter.registerAccount${operations.includes("identity.verification") ? ", sendCode: registrationAdapter.sendRegistrationCode" : ""}, passwordPolicy: registrationPasswordPolicy("registrationPasswordPolicy" in registrationAdapter ? registrationAdapter.registrationPasswordPolicy : undefined) }} onSuccess={async () => { await router.navigate({ href: target, replace: true }) }} loginLink={<Anchor renderRoot={(props) => <Link {...props} to="/login" search={{ returnTo: target }} />}>{t("registrationBackLogin")}</Anchor>} />
}`)
  }
  if (permissions)
    lines.push(`/** 撤权发生时立即撤下页面；不依赖被拒绝的业务权限。 */
export function PageAccess({ path, children }: { path: string; children: ReactNode }) {
  const snapshot = useSyncExternalStore(permissionSession.subscribe, permissionSession.getSnapshot, permissionSession.getSnapshot)
  const { t } = useTranslation()
  const lastAuthorized = useRef<string | null>(null)
  const ownerKey = JSON.stringify([path, snapshot.owner, applicationScope.getSnapshot().revision])
  const allowed = permissionSession.allow(pagePermissions[path] ?? [])
  if (allowed) lastAuthorized.current = ownerKey
  const loading = ["idle", "loading"].includes(snapshot.phase)
  const retained = loading && lastAuthorized.current === ownerKey
  if (loading && !retained) return <Text role="status">{t("applicationLoading")}</Text>
  if (!allowed && !retained) return <ForbiddenPage />
  return <>{loading && <Text role="status">{t("applicationLoading")}</Text>}<div hidden={loading} inert={loading || undefined} aria-hidden={loading || undefined}>{children}</div></>
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
    if (component === "PersonalSettingsPage") {
      lines.push(`/** 个人设置属于账号，不消费组织业务权限，改密成功后回到登录。 */
export function PersonalSettings() {
  const router = useRouter()
  return <AccountSettingsDialog kind="profile" close={() => { void router.navigate({ to: "/", replace: true }) }} />
}`)
      continue
    }
    if (component === "ChangePasswordPage") {
      lines.push(`/** 改密属于账号级入口，成功后撤销旧会话并返回登录。 */
export function ChangePassword() {
  const router = useRouter()
  return <AccountSettingsDialog kind="password" close={() => { void router.navigate({ to: "/", replace: true }) }} />
}`)
      continue
    }
    if (
      ["OrganizationSettingsPage", "OrganizationMembersPage", "OrganizationRolesPage"].includes(
        component
      )
    ) {
      imports.push(`import { ${component} } from "../organization/${component}"`)
      lines.push(`/** 组织管理只消费当前有效读取码，持续撤权立即撤下正文。 */
export function ${routeComponent(page)}() { return <PageAccess path=${JSON.stringify(page.path)}><${component} /></PageAccess> }`)
      continue
    }
    if (component === "OrganizationPage" && switching) {
      lines.push(`/** 兼容组织地址仍复用切换弹窗，关闭后返回安全首页。 */
export function Organization() {
  const scope = useScope()
  const router = useRouter()
  return <OrganizationSwitchDialog api={organizationService} scope={scope.revision} blocked={scope.blocked} accountId={identitySession.getSnapshot().identity?.id ?? null} close={() => { void router.navigate({ to: "/", replace: true }) }} changed={async () => { await router.invalidate({ sync: true }) }} ${workspace ? "invitations=" + switchPanel : ""} />
}`)
      continue
    }
    const service = module === "organization" ? "organizationService" : serviceName(module) + "Api"
    imports.push(`import { ${component} } from "../${module}/${component}"`)
    if (module !== "organization") imports.push(`import { ${service} } from "./runtime"`)
    const name = routeComponent(page)
    const content = `<${component} api={${service}} scope={scope.revision}${module === "catalog" && purchase ? " canPurchase={" + (permissions ? 'canAct("orders.purchase")' : "true") + "} onPurchase={(product) => { assertPurchase(); setSelection({ product, purchase: purchaseRegistry.get(product.id), scope: scope.revision }) }}" : ""}${module === "organization" ? " blocked={scope.blocked} canSwitch={" + JSON.stringify(operations.includes("organization.switch")) + "} changed={async () => { await router.invalidate({ sync: true }) }}" + (workspace ? " invitations=" + switchPanel : "") : ""} />`
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
  return <>${wrapped}{selection?.scope === scope.revision${permissions ? ' && canVisit("/catalog") && canAct("orders.purchase")' : ""} && <PurchasePanel product={selection.product} purchase={selection.purchase} close={() => setSelection(null)} />}</>
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
  return [...new Set(imports)].join("\n") + "\n\n" + lines.join("\n") + "\n"
}
