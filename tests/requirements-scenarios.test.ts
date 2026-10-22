import path from "node:path"
import { expect, test } from "vitest"
import { inspectCreationForm } from "../.harness/tooling/initialization-form.ts"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"
import { reviseInitializationAnswers } from "../.harness/tooling/initialization-answers.ts"
import { createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { recommendedAgentPolicy } from "../.harness/tooling/agent-policy.ts"
import { parseServerMode } from "../.harness/tooling/workspace-selection.ts"
import { createLogo } from "../.harness/tooling/logo.ts"
import { resolveCapabilitySelection } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"
import {
  readFile,
  repositoryRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 合作记账、客户资料与本地工具都从真实上下文收集，不把目标页面转成问卷。 */
test.each([
  ["协作记账", "create", "各自有账本，接受邀请后切换到对方组织共同记账，保留自己的账本。"],
  ["客户资料", "create", "客户只是联系人不登录；员工注册使用。客户组织共享，私人备注仅本人可见。"],
  ["文本比较", "none", "本地比较两段文字，不登录、不联网、不需要服务端。"]
])("已有完整诉求不重复询问：%s", async (name, serverMode, requirementsText) => {
  const state = await inspectCreationForm(repositoryRoot, {
    values: {
      projectType: "web",
      name,
      englishName: "Scenario",
      serverMode,
      requirementsText,
      targetRoot: await temporaryDirectory("intent-scenario-")
    }
  })
  expect(state.phase).toBe("needs-scope")
  expect(state.question).toBeUndefined()
  expect(state.identity?.requirementsText).toBe(requirementsText)
})

/** 公开浏览及既有登录不因领域名扩成购买、注册或完整协作。 */
test.each([
  ["web", ["catalog.browse"], ["catalog.browse"]],
  ["extension", ["identity.session"], ["identity.session"]],
  ["web", [], []]
] as const)("操作选择保持明确边界：%s %j", (host, operations, expected) => {
  expect(resolveCapabilitySelection({ host, operations: [...operations] }).resolved).toEqual([
    ...expected
  ])
})

/** 服务来源修订清除旧依赖；未清理的原始表单也不得产生错误授权。 */
test("已有服务改自建时预览与执行一致，反向只补新地址", async () => {
  const parent = await temporaryDirectory("service-revision-")
  const initial = {
    projectType: "web",
    name: "Notes",
    serverMode: "existing",
    targetRoot: parent,
    requirementsText: "记录笔记",
    developmentBaseUrl: "https://old.example.invalid",
    apiContract: "/old-api.md"
  }
  const stale = await inspectCreationForm(repositoryRoot, {
    values: { ...initial, serverMode: "create" }
  })
  expect(stale.phase).toBe("needs-scope")
  const scope = {
    users: "个人",
    home: "笔记",
    pages: "笔记",
    operations: "保存和读取笔记",
    design: "笔记编辑器",
    data: "服务端保存笔记，按当前选择连接服务",
    acceptance: "保存后重新读取内容"
  }
  expect(
    (
      await inspectCreationForm(repositoryRoot, {
        values: { ...initial, serverMode: "create" },
        scope
      })
    ).field
  ).toBe("apiContract")
  const clean = reviseInitializationAnswers(initial, { serverMode: "create" })
  const state = await inspectCreationForm(repositoryRoot, { values: clean })
  expect(state.phase).toBe("needs-scope")
  const identity = state.identity
  if (!identity) throw new Error("服务选择完成后缺少工程身份")
  const config = createWorkspaceConfig({
    ...identity,
    identityI18n: undefined,
    root: path.join(parent, identity.id),
    agentPolicy: recommendedAgentPolicy("test")
  })
  expect(config.service).toEqual({ mode: "create", developmentBaseUrl: "http://127.0.0.1:8080" })
  const reverse = reviseInitializationAnswers(clean, { serverMode: "existing" })
  expect((await inspectCreationForm(repositoryRoot, { values: reverse, scope })).field).toBe(
    "developmentBaseUrl"
  )
  expect(
    reviseInitializationAnswers(initial, {
      serverMode: "existing",
      developmentBaseUrl: "https://new.example.invalid"
    }).developmentBaseUrl
  ).toBe("https://new.example.invalid")
})

/** 自定义设置阶段仍可修订项目，已答策略不能因重新校验而再问一次。 */
test("策略阶段改宿主和名称，只询问未答设置", async () => {
  const fields: string[] = []
  const answers = [
    "disabled",
    JSON.stringify({
      projectType: "extension",
      name: "Browser Notes",
      description: "页签摘录",
      superpowers: "disabled"
    }),
    "disabled",
    "enabled",
    "disabled"
  ]
  const result = await collectPromptedIdentity(
    {
      projectType: "web",
      serverMode: "none",
      name: "Notes",
      targetRoot: await temporaryDirectory("policy-revision-"),
      requirementsText: "只在点击时摘录当前页，不上传完整网页",
      policyMode: "custom"
    },
    async (_question, context) => {
      fields.push(context?.field ?? "")
      const answer = answers.shift()
      if (answer === undefined) throw new Error("出现重复问题")
      return answer
    }
  )
  expect(fields).toEqual([
    "userOwnedTasks",
    "superpowers",
    "parallelWorktreeSubagents",
    "acceptanceSmoke",
    "e2eHint"
  ])
  expect(result).toMatchObject({
    projectType: "extension",
    name: "Browser Notes",
    id: "browser-notes",
    serverMode: "none",
    agentPolicy: { userOwnedTasks: "disabled", superpowers: "disabled" }
  })
})

/** 追加需求保留旧全文，最新取消要求进入新范围并使旧确认失效。 */
test("文件后补一句不丢原文，取消协作需要新范围", async () => {
  const root = await temporaryDirectory("requirements-append-")
  const file = path.join(root, "brief.md")
  const original = "邮箱注册；记录自己的资料；能够接受组织邀请。"
  await writeFile(file, original)
  const logoPath = path.join(root, "logo.png")
  await writeFile(
    logoPath,
    await createLogo({ root, name: "Notes", id: "notes", color: "#4C6EF5" })
  )
  const scope = {
    users: "个人",
    home: "资料",
    pages: "资料与个人设置",
    operations: "注册、编辑、加入组织",
    design: "一个资料入口，账号菜单",
    data: "当前组织资料，账号全局昵称",
    acceptance: "注册、自有组织、资料编辑、邀请切换"
  }
  const values = {
    projectType: "web",
    serverMode: "create",
    name: "Notes",
    requirementsFile: file,
    targetRoot: path.join(root, "projects")
  }
  const first = await inspectCreationForm(repositoryRoot, { values, scope, logoPath })
  if (!first.revision) throw new Error("完整表单缺少确认修订")
  const nextValues = {
    ...values,
    requirementsFile: "",
    requirementsText:
      (await readFile(file, "utf8")) + "\n最新修订：首版先不邀请或加入别人，保留原资料和个人设置。"
  }
  const next = await inspectCreationForm(repositoryRoot, {
    values: nextValues,
    scope: {
      ...scope,
      operations: "注册、编辑、个人设置；取消协作",
      acceptance: "注册、自有组织、资料保留、个人设置，无邀请入口"
    },
    logoPath,
    decision: { revision: first.revision, answer: "确认", source: "旧范围确认" }
  })
  expect(next.phase).toBe("awaiting-confirmation")
  expect(next.revision).not.toBe(first.revision)
  expect(nextValues.requirementsText).toContain(original)
  expect(await readFile(file, "utf8")).toBe(original)
  expect(next.summary).toContain("取消协作")
})

/** 没有现成服务仍为自建；只有明确不需要才采用本地模式。 */
test("没有服务和不需要服务是两个不同意图", () => {
  expect(parseServerMode("没有")).toBe("create")
  expect(parseServerMode("不需要服务端")).toBe("none")
  expect(() => parseServerMode(undefined)).toThrow()
})

/** 默认预设不冒充用户选择，后续单项设置直接进入自定义而不补问模式。 */
test("基础问答后补单项设置不重复询问策略模式", async () => {
  const fields: string[] = []
  const parent = await temporaryDirectory("late-policy-")
  const result = await collectPromptedIdentity(
    { projectType: "web", serverMode: "none", name: "Notes", requirementsText: "本地笔记" },
    async (_question, context) => {
      fields.push(context?.field ?? "")
      return fields.length === 1
        ? JSON.stringify({ targetRoot: parent, userOwnedTasks: "enabled" })
        : "disabled"
    }
  )
  expect(fields).toEqual([
    "targetRoot",
    "superpowers",
    "parallelWorktreeSubagents",
    "acceptanceSmoke",
    "e2eHint"
  ])
  expect(result.policyMode).toBe("custom")
  expect(result.agentPolicy.userOwnedTasks).toBe("enabled")
})

/** 重新校验只继承真实回答；新增条件题首次不误报，实际回答来源保持最新。 */
test("策略阶段改扩展后首次补说明不报错并记录真实来源", async () => {
  const questions: { field?: string; text: string }[] = []
  const answers = [
    JSON.stringify({ projectType: "extension", name: "Browser Notes", superpowers: "disabled" }),
    "只在点击时摘录当前页",
    "disabled",
    "enabled",
    "disabled"
  ]
  const result = await collectPromptedIdentity(
    {
      projectType: "web",
      serverMode: "none",
      name: "Notes",
      targetRoot: await temporaryDirectory("new-description-"),
      requirementsText: "本地摘录",
      policyMode: "custom",
      userOwnedTasks: "disabled"
    },
    async (text, context) => {
      questions.push({ field: context?.field, text })
      const answer = answers.shift()
      if (answer === undefined) throw new Error("出现重复问题")
      return answer
    }
  )
  expect(questions.map((question) => question.field)).toEqual([
    "superpowers",
    "description",
    "parallelWorktreeSubagents",
    "acceptanceSmoke",
    "e2eHint"
  ])
  expect(questions[1]?.text).not.toContain("当前问题：")
  expect(result.inputSources.description).toBe("交互问答")
  expect(result.id).toBe("browser-notes")
})

/** 明确保留文件已撤回冲突文本，后续修订不能再恢复旧来源而重复询问。 */
test("选择文件后修订名称不复活已清除的文本", async () => {
  const root = await temporaryDirectory("resolved-requirements-")
  const file = path.join(root, "brief.md")
  await writeFile(file, "采用这个文件中的完整需求。")
  const fields: string[] = []
  const answers = [
    file,
    JSON.stringify({ name: "Current Notes", superpowers: "disabled" }),
    "disabled",
    "enabled",
    "disabled"
  ]
  const result = await collectPromptedIdentity(
    {
      projectType: "web",
      serverMode: "none",
      name: "Notes",
      targetRoot: root,
      requirementsFile: file,
      requirementsText: "已撤回的旧文本",
      policyMode: "custom",
      userOwnedTasks: "disabled"
    },
    async (_question, context) => {
      fields.push(context?.field ?? "")
      const answer = answers.shift()
      if (answer === undefined) throw new Error("不应恢复旧来源或重复提问")
      return answer
    }
  )
  expect(fields).toEqual([
    "requirementsFile",
    "superpowers",
    "parallelWorktreeSubagents",
    "acceptanceSmoke",
    "e2eHint"
  ])
  expect(result.requirementsFile).toBe(file)
  expect(result.requirementsText).toBeUndefined()
  expect(result.id).toBe("current-notes")
})
