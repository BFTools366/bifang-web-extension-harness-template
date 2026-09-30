import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  allocateProjectTaskSequences,
  isValidTaskProgressTitle,
  recommendedAgentPolicy,
  renderAgentPolicy,
  TASK_PROGRESS_STATES,
  TASK_PROGRESS_TITLE_INITIAL,
  TASK_PROGRESS_TITLE_TEMPLATE,
  validateAgentPolicyBody,
  validateAgentPolicyDocument
} from "../.harness/tooling/agent-policy.ts"
import { requiresInteractiveAgentPolicyPrompt } from "../.harness/tooling/cli.ts"
import { repositoryRoot } from "./harness-tooling-support.ts"

/** 生成已解析下游策略文档，便于逐项篡改边界。 */
function resolvedPolicy(confirmedAt = "2026-09-09T00:00:00.000Z"): string {
  return renderAgentPolicy("# Agent policy\n", recommendedAgentPolicy("project-owner", confirmedAt))
}

/** 构造可用于序号分配的线程记录。 */
function record(
  title: string | null,
  extras: { kind?: string; hostId?: string; projectId?: string } = {}
): Record<string, unknown> {
  return {
    kind: extras.kind ?? "codex",
    hostId: extras.hostId ?? "local",
    projectId: extras.projectId ?? "project-a",
    title
  }
}

describe("Agent policy contract", () => {
  /** 验证自定义策略只在仍有条件字段缺失时继续进入交互收集。 */
  test("detects incomplete custom policy input", () => {
    expect(requiresInteractiveAgentPolicyPrompt({ policyMode: "recommended" })).toBe(false)
    expect(requiresInteractiveAgentPolicyPrompt({ policyMode: "custom" })).toBe(true)
    expect(
      requiresInteractiveAgentPolicyPrompt({
        policyMode: "custom",
        userOwnedTasks: "disabled",
        superpowers: "disabled",
        parallelWorktreeSubagents: "enabled",
        acceptanceSmoke: "enabled",
        e2eHint: "disabled"
      })
    ).toBe(false)
    expect(
      requiresInteractiveAgentPolicyPrompt({
        policyMode: "custom",
        superpowers: "disabled",
        parallelWorktreeSubagents: "enabled",
        acceptanceSmoke: "enabled",
        e2eHint: "disabled"
      })
    ).toBe(true)
  })

  /** 验证用户可见 Task 标题只接受精确三字段格式和真正单行文本。 */
  test("validates the exact user-owned Task progress title grammar", () => {
    expect(TASK_PROGRESS_TITLE_TEMPLATE).toBe("Task {序号} | {当前进度} | {单一结果}")
    expect(TASK_PROGRESS_TITLE_INITIAL).toBe("Task {序号} | 已分配 | {单一结果}")
    for (const progress of TASK_PROGRESS_STATES) {
      expect(isValidTaskProgressTitle(`Task 23 | ${progress} | 拉取并推送所有变更`)).toBe(true)
    }
    for (const invalid of [
      "Task 0 | 已分配 | 拉取并推送所有变更",
      "Task 01 | 运行中 | 拉取并推送所有变更",
      "Task 23|运行中|拉取并推送所有变更",
      "Task 23 | 已阻塞 | 拉取并推送所有变更",
      "Task 23 | 已完成 | ",
      "Task 23 | 已完成 |  拉取并推送所有变更",
      "Task 23 | 已完成 | 拉取并推送所有变更 ",
      "Task 23 | 已完成 | 拉取|推送所有变更",
      "Task 23 | 已完成 | 拉取\n并推送所有变更",
      "Task 23 | 已完成 | 拉取\u2028并推送所有变更",
      "Task 23 | 已完成 | 拉取\u2029并推送所有变更",
      "Task 23 | 已完成 | 拉取\u0085并推送所有变更",
      "1|同步Harness|运行中 |对齐通用逻辑",
      "23|同步GitHub|已完成 |拉取并推送所有变更",
      "同步任务已完成"
    ]) {
      expect(isValidTaskProgressTitle(invalid)).toBe(false)
    }
  })

  /** 验证序号只认当前三字段标题，旧四字段标题与越界记录都不占用序列。 */
  test("allocates project Task sequences from current titles only", () => {
    const records = [
      record("Task 1 | 已完成 | 建立标题契约"),
      record("Task 2 | 运行中 | 继续项目工作"),
      record("Task 91 | 已完成 | 不得参与分配", { hostId: "other-host" }),
      record("Task 92 | 已完成 | 不得参与分配", { projectId: "project-b" }),
      record("Task 93 | 已完成 | 不得参与分配", { kind: "chatgpt" }),
      record("4|归档任务|已完成 |不得参与分配"),
      record("Task 03 | 已完成 | 畸形标题必须忽略"),
      record("Task 100 | 已完成"),
      record(null),
      "not-a-record"
    ]
    expect(
      allocateProjectTaskSequences(records, { hostId: "local", projectId: "project-a" })
    ).toEqual([3])
    expect(
      allocateProjectTaskSequences(records, { hostId: "local", projectId: "project-a", count: 3 })
    ).toEqual([3, 4, 5])
    expect(allocateProjectTaskSequences([], { hostId: "local", projectId: "project-a" })).toEqual([
      1
    ])
    expect(() => allocateProjectTaskSequences([], { hostId: "", projectId: "project-a" })).toThrow(
      /hostId/
    )
    expect(() =>
      allocateProjectTaskSequences([], { hostId: "local", projectId: "project-a " })
    ).toThrow(/projectId/)
    expect(() =>
      allocateProjectTaskSequences([], { hostId: "local", projectId: "project-a", count: 0 })
    ).toThrow(/count/)
  })

  /** 验证完成初始化的下游必须使用已决 schema v3 与真实确认元数据。 */
  test("requires a fully resolved downstream policy", () => {
    expect(validateAgentPolicyDocument(resolvedPolicy(), { allowPending: false })).toEqual([])
    expect(resolvedPolicy()).toContain("schema_version: 3")
    expect(resolvedPolicy()).toContain("user_owned_tasks: disabled")
    expect(resolvedPolicy()).toContain("parallel_worktree_subagents: disabled")
    expect(resolvedPolicy()).toContain("acceptance_smoke: enabled")
    expect(resolvedPolicy()).toContain("e2e_hint: disabled")
    expect(resolvedPolicy()).not.toContain("milestone_smoke")
    expect(resolvedPolicy()).not.toContain("milestone_e2e")
    expect(resolvedPolicy()).not.toContain("schema_version: 1")
    expect(
      validateAgentPolicyDocument(
        resolvedPolicy().replace("e2e_hint: disabled", "e2e_hint: pending"),
        { allowPending: false }
      )
    ).toContain("initialized downstream Agent policy must resolve e2e_hint")
    expect(
      validateAgentPolicyDocument(
        resolvedPolicy().replace("user_owned_tasks: disabled", "user_owned_tasks: pending"),
        { allowPending: false }
      )
    ).toContain("initialized downstream Agent policy must resolve user_owned_tasks")
    expect(
      validateAgentPolicyDocument(
        resolvedPolicy().replace("confirmed_by: project-owner", "confirmed_by: unknown"),
        { allowPending: false }
      )
    ).toContain("initialized downstream Agent policy confirmed_by must identify a real source")
  })

  /** 验证 CRLF checkout 的策略 frontmatter 与 LF 具有相同语义。 */
  test("accepts CRLF Agent policy documents", () => {
    const crlf = resolvedPolicy().replaceAll("\n", "\r\n")
    expect(validateAgentPolicyDocument(crlf, { allowPending: false })).toEqual([])
  })

  /** 验证旧 schema、旧字段名和历史默认解释一律被拒绝。 */
  test("rejects historical schema versions and renamed policy fields", () => {
    const historical = `---
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
    const errors = validateAgentPolicyDocument(historical, {
      allowPending: true,
      requireSourceDefaults: true
    })
    expect(errors).toContain("Agent policy schema_version must be 3")
    expect(errors).toContain("Agent policy is missing user_owned_tasks")
    expect(errors).toContain("Agent policy is missing acceptance_smoke")
    expect(errors).toContain("Agent policy is missing e2e_hint")
    expect(errors).toContain("Agent policy has unknown field: milestone_smoke")
    expect(errors).toContain("Agent policy has unknown field: milestone_e2e")
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

  /** 验证源策略保持唯一的 pending 默认组合，且 user_owned_tasks 固定关闭。 */
  test("locks the Harness source policy defaults", () => {
    const source = `---
schema_version: 3
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
user_owned_tasks: disabled
parallel_worktree_subagents: pending
acceptance_smoke: pending
e2e_hint: pending
---
# Agent policy
`
    expect(
      validateAgentPolicyDocument(source, { allowPending: true, requireSourceDefaults: true })
    ).toEqual([])
    expect(
      validateAgentPolicyDocument(
        source.replace("acceptance_smoke: pending", "acceptance_smoke: enabled"),
        {
          allowPending: true,
          requireSourceDefaults: true
        }
      )
    ).toContain("Harness source Agent policy acceptance_smoke must default to pending")
    expect(
      validateAgentPolicyDocument(
        source.replace("user_owned_tasks: disabled", "user_owned_tasks: enabled"),
        {
          allowPending: true,
          requireSourceDefaults: true
        }
      )
    ).toContain("Harness source Agent policy user_owned_tasks must default to disabled")
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

  /** 验证发布选择与授权可延续，但新字节的验收契约不能删除。 */
  test("preserves release decisions without reusing artifact evidence", async () => {
    const source = await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    expect(validateAgentPolicyBody(source)).toEqual([])
    for (const fragment of [
      "同一发布流程复用已明确的 E2E 选择",
      "复用 E2E 选择不复用旧候选的验证证据",
      "明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认"
    ]) {
      expect(validateAgentPolicyBody(source.replaceAll(fragment, "已删除发布契约"))).toContain(
        `Agent policy body is missing: ${fragment}`
      )
    }
  })

  /** 验证完整候选 smoke 的启用、关闭、硬要求与源 pending 矩阵不能弱化。 */
  test("locks the complete acceptance smoke matrix", async () => {
    const source = await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    for (const fragment of [
      "`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`",
      "`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`",
      "用户、产品、安全或渠道硬要求优先于持久值",
      "源 Harness 的 `pending` 不授权可选 smoke"
    ]) {
      const weakened = source.replace(fragment, "已删除 smoke 契约")
      expect(validateAgentPolicyBody(weakened)).toContain(
        `Agent policy body is missing: ${fragment}`
      )
    }
  })

  /** 验证用户可见 Task 开关、标题与内部结构不得占用序号的关键段落不能删除。 */
  test("locks the complete user-owned Task lifecycle template", async () => {
    // 保存 source 变量供逐项删除关键通用契约使用。
    const source = await readFile(path.join(repositoryRoot, "docs/AGENT_POLICY.md"), "utf8")
    expect(source).toContain("`user_owned_tasks: disabled` 是默认状态")
    expect(source).toContain("内部 Subagent 不使用本标题合同、不占用 Task 序号")
    expect(source).not.toContain("{序号}|{Task简述}|{当前进度} |{功能摘要}")
    for (const fragment of [
      "只返回 `clientThreadId` 表示仍在 setup",
      "核对工作区干净及起始提交正确",
      "### 命名、基线与分支",
      "### 执行、提交与边界",
      "### 协调方整合与清理",
      "### 统一 Task 描述模板",
      "Task key：",
      "Git task slug：",
      "`Not applicable`",
      "不识别任何历史标题格式",
      "推荐预设确定性物化五项"
    ]) {
      const weakened = source.replaceAll(fragment, "已删除契约")
      expect(validateAgentPolicyBody(weakened)).toContain(
        `Agent policy body is missing: ${fragment}`
      )
    }
  })
})
