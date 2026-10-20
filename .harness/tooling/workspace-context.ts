import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import type { ProjectConfig } from "./types.ts"

/** 在单前端身份缺席时读取实际 Workspace，供根 PRD/原型工具复用稳定实例。 */
export async function loadWorkspaceProjectConfig(
  root: string,
  loadMember: (root: string) => Promise<ProjectConfig>
): Promise<ProjectConfig> {
  const workspace = JSON.parse(
    await readFile(path.join(root, ".harness/workspace.json"), "utf8")
  ) as Record<string, unknown>
  if (
    workspace.kind !== "workspace" ||
    workspace.schemaVersion !== 1 ||
    typeof workspace.id !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(workspace.id) ||
    typeof workspace.initializedAt !== "string" ||
    !Array.isArray(workspace.members)
  )
    throw new Error("无效 Workspace 身份")
  const selected = workspace.members.find(
    (item: unknown) =>
      item &&
      typeof item === "object" &&
      "type" in item &&
      ["web", "extension"].includes(String(item.type))
  ) as { type: "web" | "extension"; directory: string } | undefined
  if (!selected || selected.directory !== `${workspace.id}_${selected.type}`)
    throw new Error("纯服务工作区没有前端原型；请选择真实前端成员")
  const directory = path.join(root, selected.directory)
  if (
    (await lstat(directory)).isSymbolicLink() ||
    (await realpath(directory)) !== path.resolve(directory)
  )
    throw new Error("Workspace 成员路径无效")
  const member = await loadMember(directory)
  if (member.id !== selected.directory || member.projectType !== selected.type)
    throw new Error("Workspace 前端身份不一致")
  return { ...member, id: workspace.id, initializedAt: workspace.initializedAt }
}

/** 只有精确登记的成员可以把产品记录解析回自己的 Workspace 根。 */
export async function resolveWorkspaceContextRoot(root: string): Promise<string> {
  const parent = path.dirname(root)
  let value: unknown
  try {
    value = JSON.parse(await readFile(path.join(parent, ".harness/workspace.json"), "utf8"))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return root
    throw error
  }
  const workspace = value as { kind?: unknown; members?: unknown }
  if (
    workspace.kind !== "workspace" ||
    !Array.isArray(workspace.members) ||
    !workspace.members.some(
      (item) =>
        item &&
        typeof item === "object" &&
        "directory" in item &&
        item.directory === path.basename(root)
    )
  )
    throw new Error("当前成员未登记在父 Workspace")
  if ((await realpath(root)) !== path.resolve(root)) throw new Error("成员上下文不得使用链接路径")
  return parent
}
