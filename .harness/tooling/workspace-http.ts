import { readFileSync } from "node:fs"

/** 工程创建与完整账号装配共用同一 Go 传输资产，避免协议桥分叉。 */
export const GO_TRANSPORT_SOURCE = readFileSync(
  new URL(
    "../../.agents/skills/workspace-implement-users/assets/go-transport.ts.txt",
    import.meta.url
  ),
  "utf8"
)

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
