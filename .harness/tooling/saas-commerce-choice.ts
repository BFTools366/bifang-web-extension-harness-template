import type { ProjectType } from "./types.ts"

/** 将明确的购买能力回答规范化，不从缺失输入推断选择。 */
export function parseSaasCommerceChoice(value: string): "enabled" | "disabled" {
  const normalized = value.trim().toLowerCase()
  if (["1", "enabled", "yes", "y", "是", "启用", "开启"].includes(normalized)) return "enabled"
  if (["2", "disabled", "no", "n", "否", "禁用", "关闭"].includes(normalized)) return "disabled"
  throw new Error("商品购买模块（--saas-commerce）必须明确选择 enabled 或 disabled")
}

/** 只允许 SaaS 客户端保留购买选择，缺失选择必须补问或拒绝。 */
export function resolveSaasCommerceChoice(
  projectType: ProjectType,
  webType: string | undefined,
  value: string | undefined
): "enabled" | "disabled" | undefined {
  if (projectType !== "web" || webType !== "saas-client") {
    if (value !== undefined && value !== "") {
      throw new Error("--saas-commerce / saasCommerce 仅适用于 Web SaaS 客户端")
    }
    return undefined
  }
  return parseSaasCommerceChoice(value ?? "")
}
