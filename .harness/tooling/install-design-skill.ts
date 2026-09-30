import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { DESIGN_SKILL_PATH, inspectDesignSkill } from "./design-skill.ts"
import { lstatIfPresent } from "./files.ts"

/** 保存经审阅的上游快照目录，仅供源 Harness 初始化使用。 */
export const DESIGN_SKILL_BUNDLE_PATH = ".harness/vendor/design-taste-frontend"
/** 固定上游提交，初始化不执行远程安装器或解析浮动版本。 */
export const DESIGN_SKILL_COMMIT = "ce26fc25c0e5e8cab638f883de62d9a86ee5e45b"
/** 独立锁定原始 Skill 与 MIT 许可证字节，拒绝快照和来源记录同时漂移。 */
const DESIGN_SKILL_HASHES = {
  "SKILL.md": "aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89",
  LICENSE: "4575a543ab88dad12ccea7d97e563d0bce5b448b06072e65d3264497dad326df"
} as const
/** 固定来源合同，设计支持快照必须逐字节匹配。 */
const DESIGN_SKILL_UPSTREAM = {
  repository: "https://github.com/leonxlnx/taste-skill",
  commit: DESIGN_SKILL_COMMIT,
  skillPath: "skills/taste-skill/SKILL.md",
  sha256: DESIGN_SKILL_HASHES
}
/** 保存项目级发现提示，让 Agent 先遵循当前宿主和工程约束再读取视觉建议。 */
const DESIGN_SKILL_METADATA = `interface:
  display_name: "Taste：设计风格支持"
  short_description: "为真实落地页、作品集和视觉改版提供风格建议，遵循当前项目工程与宿主规范"
  default_prompt: "使用 $design-taste-frontend 为适用页面提供设计风格支持，先遵循 AGENTS.md 和 docs/MANTINE_UI_GUIDELINES.md，不将上游技术偏好作为安装依赖或额外验证的授权。"
`

/** 读取固定快照并核对来源与哈希，不执行其中任何脚本或安装命令。 */
export async function loadDesignSkillBundle(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  for (const relativePath of [".harness", ".harness/vendor", DESIGN_SKILL_BUNDLE_PATH]) {
    const status = await lstatIfPresent(path.join(root, relativePath))
    if (status === undefined || !status.isDirectory() || status.isSymbolicLink()) {
      throw new Error(`Missing or unsafe design Skill bundle: ${relativePath}`)
    }
  }
  for (const name of [...Object.keys(DESIGN_SKILL_HASHES), "UPSTREAM.json"]) {
    const absolutePath = path.join(root, DESIGN_SKILL_BUNDLE_PATH, name)
    const status = await lstatIfPresent(absolutePath)
    if (status === undefined || !status.isFile() || status.isSymbolicLink()) {
      throw new Error(`Missing or unsafe design Skill bundle file: ${name}`)
    }
    files.set(name, await readFile(absolutePath))
  }
  for (const [name, expectedHash] of Object.entries(DESIGN_SKILL_HASHES)) {
    const bytes = files.get(name)
    if (bytes === undefined || createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
      throw new Error(`Design Skill bundle checksum mismatch: ${name}`)
    }
  }
  const receipt = files.get("UPSTREAM.json")
  if (
    receipt === undefined ||
    JSON.stringify(JSON.parse(Buffer.from(receipt).toString("utf8"))) !==
      JSON.stringify(DESIGN_SKILL_UPSTREAM)
  ) {
    throw new Error("Design Skill bundle provenance mismatch")
  }
  return files
}

/** 在任何初始化写入前准备项目级补装计划，有效已有 Skill 的全部文件原样保留。 */
export async function prepareDesignSkillInstallation(
  root: string
): Promise<ReadonlyMap<string, Uint8Array>> {
  if ((await inspectDesignSkill(root)) === "present") return new Map()
  const bundle = await loadDesignSkillBundle(root)
  const files = new Map<string, Uint8Array>()
  for (const [name, bytes] of bundle) files.set(`${DESIGN_SKILL_PATH}/${name}`, bytes)
  files.set(`${DESIGN_SKILL_PATH}/agents/openai.yaml`, Buffer.from(DESIGN_SKILL_METADATA))
  return files
}
