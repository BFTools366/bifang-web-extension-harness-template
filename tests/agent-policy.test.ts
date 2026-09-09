import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  isValidSessionProgressTitle,
  recommendedAgentPolicy,
  renderAgentPolicy,
  validateAgentPolicyBody,
  validateAgentPolicyDocument
} from "../.harness/tooling/agent-policy.ts"
import { requiresInteractiveAgentPolicyPrompt } from "../.harness/tooling/cli.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"

/** 生成已解析下游策略文档，便于逐项篡改边界。 */
function resolvedPolicy(confirmedAt = "2026-09-09T00:00:00.000Z"): string {
  return renderAgentPolicy("# Agent policy\n", recommendedAgentPolicy("project-owner", confirmedAt))
}

describe("Agent policy contract", () => {
  /** 验证自定义策略只在仍有条件字段缺失时继续进入交互收集。 */
  test("detects incomplete custom policy input", () => {
    expect(requiresInteractiveAgentPolicyPrompt({ policyMode: "recommended" })).toBe(false)
    expect(requiresInteractiveAgentPolicyPrompt({ policyMode: "custom" })).toBe(true)
    expect(
      requiresInteractiveAgentPolicyPrompt({
        policyMode: "custom",
        superpowers: "disabled",
        parallelWorktreeSubagents: "enabled",
        milestoneSmoke: "enabled",
        milestoneE2e: "disabled"
      })
    ).toBe(false)
  })

  /** 验证统一标题只接受精确四段格式和真正单行文本。 */
  test("validates the exact Session progress title grammar", () => {
    expect(isValidSessionProgressTitle("1|同步Harness|运行中 |对齐通用逻辑")).toBe(true)
    for (const invalid of [
      "01|同步Harness|运行中 |对齐通用逻辑",
      "1|同步Harness|运行中|对齐通用逻辑",
      "1|同步Harness|阻断中 |对齐通用逻辑",
      "1|同步|Harness|运行中 |对齐通用逻辑",
      "1|同步\u2028Harness|已完成 |对齐通用逻辑",
      "1|同步Harness|已完成 |对齐\u0085通用逻辑"
    ]) {
      expect(isValidSessionProgressTitle(invalid)).toBe(false)
    }
  })

  /** 验证完成初始化的下游必须使用已决 schema 与真实确认元数据。 */
  test("requires a fully resolved downstream policy", () => {
    expect(validateAgentPolicyDocument(resolvedPolicy(), { allowPending: false })).toEqual([])
    expect(
      validateAgentPolicyDocument(
        resolvedPolicy().replace("milestone_e2e: disabled", "milestone_e2e: pending"),
        { allowPending: false }
      )
    ).toContain("initialized downstream Agent policy must resolve milestone_e2e")
    expect(
      validateAgentPolicyDocument(
        resolvedPolicy().replace("confirmed_by: project-owner", "confirmed_by: unknown"),
        { allowPending: false }
      )
    ).toContain("initialized downstream Agent policy confirmed_by must identify a real source")
  })

  /** 验证确认日期拒绝日历溢出、宽松日期和非法时区。 */
  test("rejects normalized or malformed confirmation dates", () => {
    for (const invalid of [
      "2026-02-30",
      "2026-02-30T00:00:00Z",
      "2026-09-09T24:00:00Z",
      "2026-09-09T00:00:00",
      "2026-09-09T00:00:00+24:00"
    ]) {
      expect(
        validateAgentPolicyDocument(resolvedPolicy(invalid), { allowPending: false })
      ).toContain("initialized downstream Agent policy confirmed_at must be a valid ISO date")
    }
  })

  /** 验证源策略保持唯一的 pending 默认组合。 */
  test("locks the Harness source policy defaults", () => {
    const source = `---
schema_version: 1
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
parallel_worktree_subagents: pending
milestone_smoke: pending
milestone_e2e: pending
---
# Agent policy
`
    expect(
      validateAgentPolicyDocument(source, { allowPending: true, requireSourceDefaults: true })
    ).toEqual([])
    expect(
      validateAgentPolicyDocument(
        source.replace("milestone_smoke: pending", "milestone_smoke: enabled"),
        {
          allowPending: true,
          requireSourceDefaults: true
        }
      )
    ).toContain("Harness source Agent policy milestone_smoke must default to pending")
  })

  /** 验证并行正文必须同时锁定当前请求与已启用的持久策略。 */
  test("locks both write-parallel preconditions in the policy body", async () => {
    // 保存 source 变量供正文原值和削弱变体校验使用。
    const source = await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    expect(validateAgentPolicyBody(source)).toEqual([])
    // 保存 weakened 变量，模拟删除持久 enabled 合取条件。
    const weakened = source.replace(
      "用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`",
      "用户当前请求明确要求并行"
    )
    expect(validateAgentPolicyBody(weakened)).toContain(
      "Agent policy body is missing: 用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`"
    )
  })

  /** 验证 Task 身份、绑定、执行与协调模板的关键段落不能删除或弱化。 */
  test("locks the complete user-owned Task lifecycle template", async () => {
    // 保存 source 变量供逐项删除关键通用契约使用。
    const source = await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    for (const fragment of [
      "不是失败，也不是可传给 `read_thread`、`wait_threads`",
      "非 Git Local Task 才要求 cwd 等于保存项目完整路径",
      "### 命名、基线与分支",
      "### 执行、提交与边界",
      "### 协调方整合与清理",
      "### 统一 Task 描述模板",
      "Task key：",
      "Git task slug：",
      "`Not applicable`"
    ]) {
      const weakened = source.replaceAll(fragment, "已删除契约")
      expect(validateAgentPolicyBody(weakened)).toContain(
        `Agent policy body is missing: ${fragment}`
      )
    }
  })
})
