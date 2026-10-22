import type { CapabilityRequest } from "../../scripts/capabilities.ts"
import type { applicationLocales } from "./locales.ts"

/** 页面内容可以按项目替换，路由、会话和 API 接线继续由固定模板拥有。 */
export interface ApplicationContent {
  translations?: Partial<
    Record<"zh" | "en", Partial<Record<keyof typeof applicationLocales.en, string>>>
  >
  pageSources?: Partial<
    Record<"catalog" | "orders" | "wallet-payments" | "organization" | "audit", string>
  >
}

/** 固定设计通过明确输入装配，不在源自动生成产品业务或猜测服务接口。 */
export interface ApplicationOptions {
  selection: CapabilityRequest
  homePageSource: string
  dataMode: "adapter"
  adapters?: Record<string, string>
  pagePermissions?: Record<string, string[]>
  actionPermissions?: Record<string, string[]>
  content?: ApplicationContent
}
/** 一个真实页面对应一个稳定路由和模块 owner。 */
export interface ApplicationPage {
  path: string
  file: string
  component: string
  title: string
  module?: string
}
/** 路由与 Application 导出共用同一组件名，固定页面去掉 Page 后缀。 */
export const routeComponent = (page: ApplicationPage) => page.component.replace(/Page$/u, "")
/** 本人设置和拒绝页只要求身份；组织恢复页随组织能力豁免业务权限。 */
export const permissionFreePaths = (organization: boolean): string[] => [
  "/forbidden",
  "/account/settings",
  "/account/password",
  ...(organization ? ["/organization"] : [])
]
/** 不要求业务权限码的动作：组织切换属于撤权后的恢复入口。 */
export const PERMISSION_FREE_ACTIONS: readonly string[] = ["organization.switch"]
/** runtime 服务名沿用既有 API 变量名，钱包能力的目录与变量名不同。 */
export const serviceName = (module: string) => (module === "wallet-payments" ? "wallet" : module)
/** 装配后提供可检查的路由与操作依赖清单。 */
export interface ApplicationWiring {
  schemaVersion: 1
  host: "web" | "extension"
  requested: string[]
  resolved: string[]
  requiredBy: Record<string, string[]>
  pages: ApplicationPage[]
  actions: string[]
  dataMode: "adapter"
}
