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

/** 仅供显式 Mock 模式的领域 fixture，真实接入必须提供对应 adapter 源码。 */
export interface ApplicationFixtures {
  accounts?: { id: string; account: string; password: string; displayName: string }[]
  products?: {
    id: string
    name: string
    description: string
    category?: string
    price: { minor: number; currency: string }
  }[]
  grants?: { subjectId: string; organizationId?: string | null; codes: string[] }[]
  orders?: Record<
    string,
    {
      id: string
      productId: string
      total: { minor: number; currency: string }
      status: "paid" | "unpaid"
      requestId: string
    }[]
  >
  balances?: Record<string, { minor: number; currency: string }>
  organizations?: { id: string; name: string; ownerAccountId: string }[]
  organizationUsers?: {
    id: string
    accountId: string
    organizationId: string
    role: "owner" | "member"
  }[]
  audit?: { id: string; action: string; actor: string; occurredAt: string }[]
}
/** 固定设计通过明确输入装配，不在源自动生成产品业务或猜测服务接口。 */
export interface ApplicationOptions {
  selection: CapabilityRequest
  homePageSource: string
  dataMode: "mock" | "adapter"
  adapters?: Record<string, string>
  fixtures?: ApplicationFixtures
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
/** 装配后提供可检查的路由与操作依赖清单。 */
export interface ApplicationWiring {
  schemaVersion: 1
  host: "web" | "extension"
  requested: string[]
  resolved: string[]
  requiredBy: Record<string, string[]>
  pages: ApplicationPage[]
  actions: string[]
  dataMode: "mock" | "adapter"
}
