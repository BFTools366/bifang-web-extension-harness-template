/** 生成 Go 协议传输桥：保留唯一 Ky/session owner，显式转换认证及语言头。 */
export const GO_TRANSPORT_SOURCE = `import { requestWithKy } from "./httpProtocol"
import type { FetchLike } from "./httpContracts"

/** 只映射由受管 client 写入的认证头，调用方不能另外注入 Bearer 身份。 */
export const requestGoTransport: FetchLike = (input, init = {}) => {
  const headers = new Headers(init.headers)
  const token = headers.get("X-AUTH-TOKEN")
  headers.delete("Authorization")
  headers.delete("X-AUTH-TOKEN")
  headers.delete("X-Http-Request")
  headers.delete("X-Request-Id")
  if (token) headers.set("Authorization", "Bearer " + token)
  const language = headers.get("X-Lang")
  headers.set("X-Lang", language === "zh_CN" || language === "zh" ? "zh-CN" : "en-US")
  return requestWithKy(input, { ...init, headers })
}
`

/** 自建服务存在可信中性健康 endpoint，供开发联通读取使用。 */
export const GO_HEALTH_SOURCE = `import { requestHttpQuery } from "./client/httpRuntime"

/** 实际请求自建 Go 服务，不保存结果缓存或生成假健康状态。 */
export async function readServiceHealth(signal?: AbortSignal): Promise<void> {
  const response = await requestHttpQuery("api/v1/system/health-check", { signal })
  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || !("model" in value) || !("data" in value)) {
    throw new Error("invalid_service_health_response")
  }
}
`
