import {
  permissionFreePaths,
  routeComponent,
  type ApplicationOptions,
  type ApplicationPage
} from "./contracts.ts"

/** 提供安全返回目标以及先认证、再权限、最后正文的共享路由边界。 */
export function accessSource(operations: readonly string[], paths: readonly string[] = []): string {
  const identity = operations.includes("identity.session")
  const permissions = operations.includes("permissions.enforce")
  const organization = operations.some((operation) => operation.startsWith("organization."))
  const imports = ['import { navigation } from "./navigation"']
  const lines = [
    "/** 返回目标仅限已声明的内部页面，不接受外部 URL、编码逃逸或未知路径。 */",
    `export function safeReturnTo(input: unknown) { return [...navigation${paths.map((path) => ", " + JSON.stringify({ path })).join("")}].find((page) => page.path === input)?.path ?? "/" }`
  ]
  if (identity) {
    imports.push(
      'import { redirect } from "@tanstack/react-router"',
      'import { IdentityError } from "../identity/session"',
      "import { identitySession" +
        (permissions ? ", permissionSession, canVisit" : "") +
        (organization ? ", ensureOrganization" : "") +
        ' } from "./runtime"'
    )
    lines.push(`/** 公开登录页保留可选的安全返回目标，不接受 Token 或任意查询字段。 */
export function authSearch(input: Record<string, unknown>): { returnTo?: ReturnType<typeof safeReturnTo> } {
  return input.returnTo === undefined ? {} : { returnTo: safeReturnTo(input.returnTo) }
}
/** 私有导航先完成会话校验；取消、预取或未加载权限不能放行正文。 */
export async function protectPage(target: string, signal?: AbortSignal) {
  try { await identitySession.ensure() }
  catch (error) {
    signal?.throwIfAborted()
    if (error instanceof IdentityError && ["anonymous", "expired"].includes(error.code))
      throw redirect({ to: "/login", search: { returnTo: safeReturnTo(target) }, replace: true })
    throw error
  }
  signal?.throwIfAborted()
  ${organization ? "await ensureOrganization(signal)\n  signal?.throwIfAborted()" : ""}
  ${
    permissions
      ? `if (${permissionFreePaths(organization)
          .map((path) => "target !== " + JSON.stringify(path))
          .join(
            " && "
          )}) { await permissionSession.refresh(signal); signal?.throwIfAborted(); if (!canVisit(target)) throw redirect({ to: "/forbidden", replace: true }) }`
      : ""
  }
}
/** 已恢复身份的登录导航直接进入可访问主流程，不停留在登录表单。 */
export async function publicLogin(returnTo: unknown) {
  try { await identitySession.ensure() }
  catch (error) { if (error instanceof IdentityError && ["anonymous", "expired"].includes(error.code)) return; throw error }
  throw redirect({ to: safeReturnTo(returnTo), replace: true })
}`)
  }
  return imports.join("\n") + "\n\n" + lines.join("\n") + "\n"
}

/** 两宿主分别接线文件路由和独立 memory/hash 路由，不替换既有宿主技术。 */
export function applicationRoutes(
  options: ApplicationOptions,
  operations: readonly string[],
  pages: readonly ApplicationPage[]
): Map<string, string> {
  const files = new Map<string, string>()
  const identity = operations.includes("identity.session")
  const registration = operations.includes("identity.register")
  const permissions = operations.includes("permissions.enforce")
  if (options.selection.host === "web") {
    files.set(
      "src/routes/settings.tsx",
      `import { createFileRoute } from "@tanstack/react-router"
import { SettingsPage } from "../features/application/SettingsPage"
/** 应用设置公开可达，不经过身份、组织或权限守卫。 */
export const Route = createFileRoute("/settings")({ component: SettingsPage })\n`
    )
    files.set(
      "src/routes/__root.tsx",
      `import { Outlet, createRootRoute } from "@tanstack/react-router"
import { NotFoundPage } from "../features/not-found/NotFoundPage"
/** 根路由只拥有应用挂载与未知页面恢复。 */
export const Route = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage })\n`
    )
    files.set(
      "src/routes/_application.tsx",
      `import { createFileRoute } from "@tanstack/react-router"
import { MainLayout } from "../features/application/Application"
/** 无路径布局持续挂载主界面，叶路由在正文加载前完成认证与权限。 */
export const Route = createFileRoute("/_application")({ component: MainLayout })\n`
    )
    for (const page of pages) {
      const relative = page.file
      files.set(
        `src/routes/_application/${relative}.tsx`,
        `import { createFileRoute } from "@tanstack/react-router"
import { ${routeComponent(page)} } from "../../features/application/Application"
${identity ? 'import { protectPage } from "../../features/application/routeAccess"\n' : ""}/** ${page.module ?? "产品首页"} 的路由只声明路径、前置门禁与组件。 */
export const Route = createFileRoute(${JSON.stringify("/_application/" + (page.file === "index" ? "" : page.file.replaceAll(".", "/")))})({
${identity ? `  beforeLoad: ({ abortController }) => protectPage(${JSON.stringify(page.path)}, abortController.signal),\n` : ""}  component: ${routeComponent(page)}
})\n`
      )
    }
    if (identity)
      files.set(
        "src/routes/login.tsx",
        `import { createFileRoute } from "@tanstack/react-router"
import { Login } from "../features/application/Application"
import { authSearch, publicLogin } from "../features/application/routeAccess"
/** 登录页公开挂载，已恢复身份只返回已声明的安全目标。 */
export const Route = createFileRoute("/login")({ component: Login, validateSearch: authSearch, beforeLoad: ({ search }) => publicLogin(search.returnTo) })\n`
      )
    if (registration)
      files.set(
        "src/routes/register.tsx",
        `import { createFileRoute } from "@tanstack/react-router"
import { Register } from "../features/application/Application"
import { authSearch, publicLogin } from "../features/application/routeAccess"
/** 注册页只在已选注册能力时生成，保留公开路由与安全返回。 */
export const Route = createFileRoute("/register")({ component: Register, validateSearch: authSearch, beforeLoad: ({ search }) => publicLogin(search.returnTo) })\n`
      )
    if (permissions)
      files.set(
        "src/routes/_application/forbidden.tsx",
        `import { createFileRoute } from "@tanstack/react-router"
import { ForbiddenPage } from "../../features/application/Application"
import { protectPage } from "../../features/application/routeAccess"
/** 拒绝页仅要求身份，不要求被拒绝的业务权限。 */
export const Route = createFileRoute("/_application/forbidden")({ component: ForbiddenPage, beforeLoad: ({ abortController }) => protectPage("/forbidden", abortController.signal) })\n`
      )
  } else {
    files.set(
      "src/extension-router.tsx",
      `import { createRootRoute, createRoute, createRouter, createMemoryHistory, createHashHistory } from "@tanstack/react-router"
import { ${["MainLayout", ...(identity ? ["Login"] : []), ...(registration ? ["Register"] : []), ...(permissions ? ["ForbiddenPage"] : []), ...pages.map((page) => routeComponent(page))].join(", ")} } from "./features/application/Application"
import { SettingsPage } from "./features/application/SettingsPage"
${identity ? 'import { protectPage, authSearch, publicLogin } from "./features/application/routeAccess"\n' : ""}import { ExtensionShell } from "./ExtensionShell"
import { ExtensionNotFoundPage } from "./ExtensionNotFoundPage"
import { ExtensionRouteErrorPage } from "./data/api/client/ExtensionRouteErrorPage"
import { createLogger } from "./observability/logger"
const logger = createLogger("router")
/** 每个扩展入口持有独立历史；会话属于各自执行上下文。 */
export function createExtensionRouter(surface: "popup" | "options") {
  const root = createRootRoute({ component: () => <ExtensionShell surface={surface} />, notFoundComponent: ExtensionNotFoundPage })
  const application = createRoute({ getParentRoute: () => root, id: "application", component: MainLayout })
  const settings = createRoute({ getParentRoute: () => root, path: "/settings", component: SettingsPage })
  const pages = [
${pages.map((page) => `    createRoute({ getParentRoute: () => application, path: ${JSON.stringify(page.path)}, component: ${routeComponent(page)}${identity ? `, beforeLoad: ({ abortController }) => protectPage(${JSON.stringify(page.path)}, abortController.signal)` : ""} })`).join(",\n")}${permissions ? ',\n    createRoute({ getParentRoute: () => application, path: "/forbidden", component: ForbiddenPage, beforeLoad: ({ abortController }) => protectPage("/forbidden", abortController.signal) })' : ""}
  ]
${identity ? '  const login = createRoute({ getParentRoute: () => root, path: "/login", component: Login, validateSearch: authSearch, beforeLoad: ({ search }) => publicLogin(search.returnTo) })\n' : ""}${registration ? '  const register = createRoute({ getParentRoute: () => root, path: "/register", component: Register, validateSearch: authSearch, beforeLoad: ({ search }) => publicLogin(search.returnTo) })\n' : ""}  return createRouter({ routeTree: root.addChildren([application.addChildren(pages), settings${identity ? ", login" : ""}${registration ? ", register" : ""}]), history: surface === "popup" ? createMemoryHistory({ initialEntries: ["/"] }) : createHashHistory(), defaultErrorComponent: ExtensionRouteErrorPage, defaultOnCatch: (error) => logger.error("route_failed", { surface, error }) })
}
declare module "@tanstack/react-router" {
  /** 当前宿主只注册实际生成的扩展路由树。 */
  interface Register { router: ReturnType<typeof createExtensionRouter> }
}\n`
    )
  }
  return files
}
