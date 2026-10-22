import questions from "../../.agents/skills/web-instantiate-project/references/initialization-questions.json" with { type: "json" }
import { parseServerMode } from "./workspace-selection.ts"
import type { PromptDefaults } from "./initialization-input.ts"

/** 所有阶段共用已知字段集，允许主动补充和修订，但拒绝未知控制参数。 */
export function parseInitializationPatch(answer: string): PromptDefaults {
  let raw: unknown
  try {
    raw = JSON.parse(answer)
  } catch {
    throw new Error("附带多个字段时请使用有效 JSON，也可以只回答当前问题")
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("回答必须是字段对象")
  const known = new Set([...Object.keys(questions.basic), ...Object.keys(questions.policy)])
  const result: PromptDefaults = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) throw new Error("无法识别的创建信息：" + key)
    if (typeof value !== "string" && typeof value !== "number") throw new Error(key + " 必须是文本")
    result[key as keyof PromptDefaults] = String(value)
  }
  return result
}

/** 服务归属或预设被明确修订时，旧依赖失效；同次明确给出的新值继续校验。 */
export function reviseInitializationAnswers(
  current: PromptDefaults,
  patch: PromptDefaults
): PromptDefaults {
  const result = { ...current, ...patch }
  if (patch.serverMode !== undefined && current.serverMode !== undefined) {
    let changed = false
    try {
      changed = parseServerMode(patch.serverMode) !== parseServerMode(current.serverMode)
    } catch {
      /* 非法选择由字段校验提示。 */
    }
    if (changed)
      for (const key of [
        "developmentBaseUrl",
        "testBaseUrl",
        "releaseBaseUrl",
        "apiContract"
      ] as const)
        if (!Object.hasOwn(patch, key)) result[key] = ""
  }
  if (
    patch.policyMode &&
    ["1", "预设", "recommended"].includes(patch.policyMode.trim().toLowerCase())
  )
    for (const key of Object.keys(questions.policy) as (keyof typeof questions.policy)[])
      if (!Object.hasOwn(patch, key)) delete result[key]
  return result
}
