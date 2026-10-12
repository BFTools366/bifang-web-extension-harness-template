/** 生成原生 Web Storage 访问边界；拒绝访问时由消费方保留当前内存状态。 */
export const WEB_STORAGE_SOURCE = `/** 区分持久偏好与当前标签页会话，不混淆两者生命周期。 */
export type WebStorageKind = "local" | "session"

/** 在无 Window 的执行上下文或浏览器拒绝访问时返回缺席，不伪造持久化成功。 */
export function getWebStorage(kind: WebStorageKind): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined
    return kind === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return undefined
  }
}
`

/** 用实际浏览器替身验证两个存储的隔离、拒绝和 Worker 缺席路径。 */
export const WEB_STORAGE_TEST = `// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { getWebStorage } from "./webStorage"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

/** 同名键在 local 与 session 中仍拥有独立生命周期与内容。 */
test("keeps local and session storage separate", () => {
  getWebStorage("local")?.setItem("preference", "persistent")
  getWebStorage("session")?.setItem("preference", "session")
  expect(window.localStorage.getItem("preference")).toBe("persistent")
  expect(window.sessionStorage.getItem("preference")).toBe("session")
})

/** 浏览器策略拒绝任一种 Storage 时安全返回缺席。 */
test("survives denied storage access", () => {
  vi.stubGlobal("window", {
    /** 模拟浏览器策略拒绝持久存储访问，不依赖测试环境属性描述符。 */
    get localStorage() { throw new Error("denied") },
    /** 模拟浏览器策略拒绝会话存储访问。 */
    get sessionStorage() { throw new Error("denied") }
  })
  expect(getWebStorage("local")).toBeUndefined()
  expect(getWebStorage("session")).toBeUndefined()
})

/** service worker 与 SSR 没有 Window，不能承诺 Web Storage 可用。 */
test("does not require a Window", () => {
  vi.stubGlobal("window", undefined)
  expect(getWebStorage("local")).toBeUndefined()
  expect(getWebStorage("session")).toBeUndefined()
})
`

/** 为两个宿主生成一致的数据层边界和已有偏好的存储实现，不预建业务仓库。 */
export function dataFiles(): Map<string, string> {
  return new Map([
    ["src/data/storage/webStorage.ts", WEB_STORAGE_SOURCE],
    ["src/data/storage/webStorage.test.ts", WEB_STORAGE_TEST],
    [
      "src/data/storage/colorScheme.ts",
      `import { localStorageColorSchemeManager } from "@mantine/core"
import { BRAND } from "../../brand"

/** 复用 Mantine 的异常处理与跨页面订阅，保留既有外观偏好键。 */
export const colorSchemeManager = localStorageColorSchemeManager({
  key: BRAND.id + ":color-scheme:v1"
})
`
    ],
    [
      "src/data/README.md",
      `# 数据层

API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 的访问统一归入本目录，详细规则见项目根的 \`docs/DATA_ACCESS.md\` §1.1–1.3。

- \`api/client/\`：Ky HTTP、认证与错误边界；Token/continuation 留在当前 client 的上下文内存。
- \`api/<domain>/\`：按真实业务域组织类型、REST 主交互、远端 API Mock 与响应校验。
- \`api/graphql/\`：真实 Schema 出现后放复杂查询、生成文档与 Subscription 协议 adapter；初始化不生成该目录或假端点。
- \`storage/\`：浏览器存储访问与领域持久化；各机制保持独立生命周期。

UI、分页和 i18n 保留呈现与状态职责，存储访问经本层完成。TanStack Query 统一管理 REST/GraphQL 有限读取的请求前缓存与服务器状态，Jotai 只管理客户端交互状态。feature Query options、QueryClient 复用与新鲜度见 \`docs/DATA_ACCESS.md\` §2.7；持久存储不自动保存 Query 结果副本。

本地能力直接真实实现，不要求 BaseURL；纯业务逻辑留在 feature，真实存储访问经 \`storage/\`。未配置远端地址时只 Mock 对应远端 API；混合流程不把本地部分一并 Mock，详细分工见 \`docs/DATA_ACCESS.md\` §3.1。
`
    ],
    [
      "src/data/api/README.md",
      `# API module boundary

The endpoint-free \`client/httpClient.ts\` foundation owns governed Ky transport, request/response/error interception, safe Token writes, 401/403, timeout and cancellation. Features share the lazy \`applicationHttp\`; Query reads use \`requestHttpQuery\` so intermediate retries do not leave error banners. Local/route recovery and global feedback use the same fixed i18next classification. Do not bypass it with page-local fetch calls or mutable global headers.

- \`client/\` owns approved base URLs, dynamic authentication, cancellation, timeouts, and normalized API errors; it declares no business endpoint or login URL.
- \`<domain>/\` owns typed remote endpoint functions, request and response contracts, runtime boundary validation and Mock only for remote API operations whose BaseURL is unconfigured. Local capabilities use real implementations without a BaseURL; keep local business logic in its feature and real persistence in \`../storage/\`. Mixed workflows mock only the unavailable remote boundary.
- REST owns ordinary reads, commands, authentication, uploads and primary business interactions. GraphQL owns complex aggregate queries and server-to-client Subscription updates; it is not a second write API.
- \`graphql/\` is added only for a real Schema and endpoint. HTTP queries reuse the governed Ky transport; subscriptions use the server's \`graphql-ws\` or \`graphql-sse\` protocol, with explicit disposal and authentication lifecycle.
- Feature hooks share queryOptions and the same context's QueryClient across components, loaders and imperative reads. TanStack Query owns REST/GraphQL cache lookup, in-flight read deduplication, freshness, invalidation and event projection; Ky and protocol adapters own transport only. Cache parsed, validated domain data, never consumable Response bodies. See project-root \`docs/DATA_ACCESS.md\` §2.7 for entry points and staleTime semantics.
- Mutations update or invalidate precise query keys; subscriptions project validated events into the same Query cache. Do not mirror server state into Jotai or storage. Extension contexts have separate QueryClients and lifetimes; this does not provide cross-context or durable caching.
- React components and route files never concatenate arbitrary URLs or depend on transport-library error classes.

Follow project-root \`docs/DATA_ACCESS.md\` for Mock migration, protocol adapters and storage boundaries. Do not add placeholder requests, a second client, or a \`services/\` layer.
`
    ],
    [
      "src/data/storage/README.md",
      `# 存储边界

- LocalStorage / SessionStorage：复用 \`webStorage.ts\` 的原生入口；消费方校验内容、处理操作异常，保留已有键与数据格式。\`colorScheme.ts\` 复用 Mantine 管理外观偏好。
- Cookie：真实需要时在 \`cookie/\` 按域增加实现，复杂非敏感 Cookie 操作可用 js-cookie；HttpOnly 认证 Cookie 由服务端设置与浏览器传输，前端不可读取。
- Memory：仅当前执行上下文，真实内存仓库放 \`memory/\`；HTTP Token/continuation 保留在 \`../api/client/\` 的会话闭包，不新建第二份会话。
- IndexedDB：真实本地结构化数据使用 Dexie，在 \`indexeddb/\` 定义领域表、版本与迁移；Dexie 不封装 LocalStorage、SessionStorage 或 Cookie。数据库不可用时应明确失败，不能假装持久化成功。

Cookie、Memory 和 IndexedDB 没有消费者时不生成空实现或安装可选依赖。Extension 的跨上下文存储按真实消息与权限合同另行设计；普通 Web Storage 和 Memory 不跨上下文共享。完整合同见项目根 \`docs/DATA_ACCESS.md\` §1.3。
`
    ]
  ])
}
