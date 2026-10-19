/** 设置来源与公开回退依据实际启用的认证路由生成，不扩张登录后的业务返回合同。 */
export function settingsNavigationSource(identity: boolean): string {
  return `import { navigation } from "./navigation"
import { safeReturnTo } from "./routeAccess"

declare module "@tanstack/react-router" {
  /** 设置来源只随历史项传递，不复制到设置 URL 或偏好存储。 */
  interface HistoryState { settingsOrigin?: string }
}

export const settingsFallback = ${JSON.stringify(identity ? "/login" : "/")}

/** 返回只允许实际应用页面和已启用的认证入口，认证查询逐项清洗。 */
export function settingsReturnTo(input: unknown): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") ||
    input.includes("\\\\") || /[\\u0000-\\u0020\\u007f]/u.test(input)) return settingsFallback
  const url = new URL(input, "https://settings.invalid")
  if (url.origin !== "https://settings.invalid" || input.split(/[?#]/u)[0] !== url.pathname)
    return settingsFallback
  const pathname = url.pathname.replace(/\\/$/u, "") || "/"
  ${
    identity
      ? `if (pathname.toLowerCase() === "/login") {
    const query = new URLSearchParams()
    if (url.searchParams.has("returnTo")) query.set("returnTo", safeReturnTo(url.searchParams.get("returnTo")))
    return "/login" + (query.size ? "?" + query.toString() : "")
  }`
      : ""
  }
  const page = navigation.find((entry) => entry.path.toLowerCase() === pathname.toLowerCase())
  return page ? page.path + url.search + url.hash : settingsFallback
}
`
}
