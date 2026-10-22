import type { ProjectType } from "./types.ts"

/** 标识可独立运行的工作区成员。 */
export type WorkspaceMemberType = ProjectType | "server"

/** 明确服务归属，避免用缺少地址推断 Mock 模式。 */
export type ServerMode = "existing" | "create" | "none"

/** 公开创建只选择一个前端宿主，服务成员随后由服务来源决定。 */
export function parseWorkspaceSelection(value: string): ProjectType[] {
  const normalized = value.trim().toLowerCase()
  const aliases: Record<string, string> = {
    "1": "web",
    "2": "extension"
  }
  const selected = aliases[normalized] ?? normalized
  if (selected !== "web" && selected !== "extension") {
    throw new Error("项目类型只能选择 1.Web（web）或 2.Extension（extension）")
  }
  return [selected]
}

/** 将服务选择统一为两个确定状态，不设置默认答案。 */
export function parseServerMode(value: string | undefined): ServerMode {
  const normalized = value?.trim().toLowerCase()
  if (["existing", "yes", "y", "是", "有", "1"].includes(normalized ?? "")) return "existing"
  if (["create", "no", "n", "否", "没有", "无", "2"].includes(normalized ?? "")) return "create"
  if (["none", "local", "不需要", "不需要服务端", "3"].includes(normalized ?? "")) return "none"
  throw new Error("请选择已有服务、自建 Go 服务或不需要服务端")
}

/** 返回已确认的唯一前端宿主，不隐式回退到 Web。 */
export function primaryFrontend(members: readonly WorkspaceMemberType[]): ProjectType {
  const frontend = members[0]
  if (members.length !== 1 || (frontend !== "web" && frontend !== "extension")) {
    throw new Error("创建时必须选择唯一 Web 或 Extension 前端")
  }
  return frontend
}
