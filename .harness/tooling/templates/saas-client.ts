import { readFileSync } from "node:fs"

/** 从固定源模板读取通用客户端资产，创建后不保留源生成入口。 */
export function saasClientFiles(base: ReadonlyMap<string, string>): Map<string, string> {
  const files = new Map<string, string>()
  const assets = {
    "src/data/api/auth/contracts.ts": "contracts.ts.txt",
    "src/data/api/auth/api.ts": "api.ts.txt",
    "src/data/storage/auth.ts": "storage.ts.txt",
    "src/features/auth/session.ts": "session.ts.txt",
    "src/features/auth/SessionProvider.tsx": "provider.tsx.txt",
    "src/features/auth/AuthPages.tsx": "AuthPages.tsx.txt",
    "src/features/workspace/Workspace.tsx": "Workspace.tsx.txt",
    "src/i18n/locales/saas.ts": "translations.ts.txt",
    "src/features/auth/session.test.ts": "session.test.ts.txt",
    "src/features/auth/router.test.tsx": "router.test.tsx.txt"
  }
  for (const [target, asset] of Object.entries(assets)) {
    files.set(target, readFileSync(new URL(`./saas-client/${asset}`, import.meta.url), "utf8"))
  }
  files.set(
    "src/app/saas.ts",
    `import { createAuthApi } from "../data/api/auth/api"
import { createCredentialStorage } from "../data/storage/auth"
import { createSaasSession } from "../features/auth/session"
import { queryClient } from "./queryClient"

/** 仅在 app 层装配唯一认证域服务、存储、Query 与会话。 */
export const saasSession = createSaasSession(createAuthApi(), createCredentialStorage(), queryClient)
`
  )
  files.set(
    "src/features/auth/routeAccess.ts",
    `import { redirect } from "@tanstack/react-router"
import { AuthFailure, safeReturnTarget } from "../../data/api/auth/contracts"
import type { SaasSession } from "./session"

/** 先校验凭据，再校验当前组织权限，最后才放行私有 loader/正文。 */
export async function requireSaasAccess(session: SaasSession, target: string, signal?: AbortSignal, permission?: string) {
  try {
    const context = await session.check(signal)
    if (permission && !context.permissions.includes(permission)) throw redirect({ to: "/no-access" })
    return context
  } catch (error) {
    if (error instanceof AuthFailure && ["authAnonymous", "authSessionExpired"].includes(error.key)) throw redirect({ to: "/login", search: { returnTo: safeReturnTarget(target) } })
    throw error
  }
}
`
  )
  files.set(
    "src/routes/__root.tsx",
    `import { Outlet, createRootRouteWithContext } from "@tanstack/react-router"
import { NotFoundPage } from "../features/not-found/NotFoundPage"
import type { SaasSession } from "../features/auth/session"

/** Router 只消费由 app 注入的会话协调者。 */
export const Route = createRootRouteWithContext<{ session: SaasSession }>()({ component: Outlet, notFoundComponent: NotFoundPage })
`
  )
  files.set(
    "src/routes/index.tsx",
    `import { createFileRoute, redirect } from "@tanstack/react-router"
import { AuthFailure } from "../data/api/auth/contracts"

/** SaaS 入口按当前会话分流，匿名默认登录。 */
export const Route = createFileRoute("/")({ beforeLoad: async ({ context }) => {
  try { await context.session.check() }
  catch (error) { if (error instanceof AuthFailure && ["authAnonymous", "authSessionExpired"].includes(error.key)) throw redirect({ to: "/login" }); throw error }
  throw redirect({ to: "/app/dashboard" })
} })
`
  )
  files.set(
    "src/routes/_auth.tsx",
    `import { createFileRoute } from "@tanstack/react-router"
import { AuthLayout } from "../features/auth/AuthPages"

/** 认证页共享 pathless 布局，偏好切换不重置输入。 */
export const Route = createFileRoute("/_auth")({ component: AuthLayout })
`
  )
  for (const [path, mode] of [
    ["login", "login"],
    ["register", "register"],
    ["forgot-password", "reset"]
  ]) {
    files.set(
      `src/routes/_auth.${path}.tsx`,
      `import { createFileRoute } from "@tanstack/react-router"
import { AuthPage } from "../features/auth/AuthPages"
import { parseAuthSearch } from "../data/api/auth/contracts"

/** 公开认证页仅接收安全返回目标与固定成功反馈。 */
export const Route = createFileRoute("/_auth/${path}")({ validateSearch: parseAuthSearch, component: () => <AuthPage mode="${mode}" /> })
`
    )
  }
  files.set(
    "src/routes/app.tsx",
    `import { createFileRoute } from "@tanstack/react-router"
import { WorkspaceLayout } from "../features/workspace/Workspace"

/** 持久工作区父布局，正文由独立叶路由提供。 */
export const Route = createFileRoute("/app")({ component: WorkspaceLayout })
`
  )
  files.set(
    "src/routes/app.index.tsx",
    `import { createFileRoute, redirect } from "@tanstack/react-router"

/** 工作区裸路径统一进入受保护的默认叶页面。 */
export const Route = createFileRoute("/app/")({ beforeLoad: () => { throw redirect({ to: "/app/dashboard" }) } })
`
  )
  for (const [path, page, permission] of [
    ["dashboard", "DashboardPage", "workspace:view"],
    ["account", "AccountPage", "account:view"]
  ]) {
    files.set(
      `src/routes/app.${path}.tsx`,
      `import { createFileRoute } from "@tanstack/react-router"
import { ${page} } from "../features/workspace/Workspace"
import { requireSaasAccess } from "../features/auth/routeAccess"
import { RoutePendingContent, RouteErrorContent } from "../features/route-state/RouteState"

/** 每次真实叶页面导航先校验身份与当前 scope 权限。 */
export const Route = createFileRoute("/app/${path}")({ beforeLoad: ({ context, location, abortController }) => requireSaasAccess(context.session, location.pathname, abortController.signal, "${permission}"), component: ${page}, pendingComponent: RoutePendingContent, errorComponent: RouteErrorContent })
`
    )
  }
  files.set(
    "src/routes/no-access.tsx",
    `import { createFileRoute } from "@tanstack/react-router"
import { SessionRecovery } from "../features/workspace/Workspace"
import { requireSaasAccess } from "../features/auth/routeAccess"

/** 无权限恢复页只要求有效身份，不要求被拒绝的业务权限。 */
export const Route = createFileRoute("/no-access")({ beforeLoad: ({ context, abortController }) => requireSaasAccess(context.session, "/no-access", abortController.signal), component: () => <SessionRecovery denied /> })
`
  )
  const router = base.get("src/app/router.tsx")
  const providers = base.get("src/app/AppProviders.tsx")
  if (router === undefined || providers === undefined)
    throw new Error("Missing Web assembly for SaaS client")
  if (
    !router.includes("import { routeTree }") ||
    !router.includes("{ routeTree, ...routeStateDefaults }") ||
    !providers.includes("import { theme }") ||
    !providers.includes("<HttpFeedback />{children}")
  )
    throw new Error("Web assembly changed: SaaS session wiring must be updated before generation")
  files.set(
    "src/app/router.tsx",
    router
      .replace("import { routeTree }", 'import { saasSession } from "./saas"\nimport { routeTree }')
      .replace(
        "{ routeTree, ...routeStateDefaults }",
        "{ routeTree, context: { session: saasSession }, scrollRestoration: true, ...routeStateDefaults }"
      )
  )
  files.set(
    "src/app/AppProviders.tsx",
    providers
      .replace(
        "import { theme }",
        'import { SaasSessionProvider } from "../features/auth/SessionProvider"\nimport { saasSession } from "./saas"\nimport { router } from "./router"\nimport { theme }'
      )
      .replace(
        "<HttpFeedback />{children}",
        "<SaasSessionProvider session={saasSession} onStorageChange={invalidateSessionRoutes}><HttpFeedback />{children}</SaasSessionProvider>"
      ) +
      "\n/** 外部会话变化后重新执行当前路由守卫。 */\nasync function invalidateSessionRoutes(): Promise<void> { await router.invalidate() }\n"
  )
  for (const [locale, name] of [
    ["en", "saasEn"],
    ["zh", "saasZh"]
  ]) {
    const path = `src/i18n/locales/${locale}.ts`
    const source = base.get(path)
    if (source === undefined || !source.includes(`export const ${locale} = {`))
      throw new Error(`Missing Web locale assembly: ${locale}`)
    files.set(
      path,
      `import { ${name} } from "./saas"\n${source.replace(`export const ${locale} = {`, `export const ${locale} = {\n  ...${name},`)}`
    )
  }
  return files
}
