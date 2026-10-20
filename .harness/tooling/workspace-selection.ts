import type { ProjectType } from "./types.ts"

/** 标识可独立运行的工作区成员。 */
export type WorkspaceMemberType = ProjectType | "server"

/** 明确服务归属，避免用缺少地址推断 Mock 模式。 */
export type ServerMode = "existing" | "create"

/** 解析显式项目选择，保持前端成员的唯一宿主类型。 */
export function parseWorkspaceSelection(value: string): WorkspaceMemberType[] {
  const normalized = value.trim().toLowerCase()
  const aliases: Record<string, string> = {
    "1": "web",
    "2": "extension",
    "3": "web,extension",
    "4": "server",
    both: "web,extension"
  }
  const selected = (aliases[normalized] ?? normalized).split(",").map((item) => item.trim())
  if (
    selected.length === 0 ||
    selected.some((item) => !["web", "extension", "server"].includes(item)) ||
    new Set(selected).size !== selected.length
  ) {
    throw new Error("项目类型必须选择 web、extension、web,extension 或 server")
  }
  return (["web", "extension", "server"] as const).filter((item) => selected.includes(item))
}

/** 将服务选择统一为两个确定状态，不设置默认答案。 */
export function parseServerMode(value: string | undefined): ServerMode {
  const normalized = value?.trim().toLowerCase()
  if (["existing", "yes", "y", "是", "有", "1"].includes(normalized ?? "")) return "existing"
  if (["create", "no", "n", "否", "没有", "无", "2"].includes(normalized ?? "")) return "create"
  throw new Error("请明确是否已有服务端：existing（有）或 create（没有，创建 Go 服务）")
}

/** 返回创建期兼容前端生成器的主宿主；纯服务工作区不会生成此前端。 */
export function primaryFrontend(members: readonly WorkspaceMemberType[]): ProjectType {
  return members.includes("web") ? "web" : members.includes("extension") ? "extension" : "web"
}
