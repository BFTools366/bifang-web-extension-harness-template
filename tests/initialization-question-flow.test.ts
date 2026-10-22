import path from "node:path"
import { expect, test } from "vitest"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"
import { inspectCreationForm } from "../.harness/tooling/initialization-form.ts"
import { inspectInitializationCatalog } from "../scripts/harness-validation/tooling.ts"
import { INITIALIZATION_QUESTIONS } from "../.harness/tooling/initialization-input.ts"
import { repositoryRoot, temporaryDirectory } from "./harness-tooling-support.ts"

const serviceScope = {
  users: "组织成员",
  home: "笔记",
  pages: "笔记与账号",
  operations: "登录、读取和编辑共享笔记",
  design: "笔记列表与编辑器",
  data: "多人共享笔记需要服务端，服务来源待确认",
  acceptance: "登录后读取本组织笔记，跨组织访问被拒绝"
}

/** 用已提供事实验证后续只问真实缺口，不能把需求正文重新当作空输入。 */
test("已给口头需求和工程信息直接进入分析交接", async () => {
  const parent = await temporaryDirectory("understood-creation-")
  const values = {
    projectType: "web",
    serverMode: "create",
    name: "Notes",
    targetRoot: parent,
    requirementsText: "为组织成员记录笔记，通过切换组织查看各自的内容。"
  }
  const state = await inspectCreationForm(repositoryRoot, { values })
  expect(state.phase).toBe("needs-scope")
  expect(state.question).toBeUndefined()
  expect(state.identity).toMatchObject({
    name: "Notes",
    requirementsText: values.requirementsText,
    policyMode: "recommended"
  })
  expect(values).not.toHaveProperty("requirementsFile")
})

/** 首次缺失保持自然问题，非法回答才给修正原因，字段身份只在结构化结果中。 */
test("聊天首问没有技术字段或未作答错误", async () => {
  const first = await inspectCreationForm(repositoryRoot, { values: { projectType: "web" } })
  expect(first.field).toBe("requirementsFile")
  expect(first.question).toContain("这个项目要帮谁完成什么事？")
  expect(first.question).not.toMatch(/问题名称：|字段：|当前问题：|_server|> /u)
  const invalid = await inspectCreationForm(repositoryRoot, {
    values: { projectType: "web", requirementsText: "共享笔记", serverMode: "不确定的值" },
    scope: serviceScope
  })
  expect(invalid.field).toBe("serverMode")
  expect(invalid.question).toContain("当前问题：")
  expect(invalid.question).toContain("这个项目需要哪种服务端支持？")
})

/** 地址的首次必填与非法修正遵循相同真实条件，其他事实不被清空。 */
test("已有服务地址缺失时准确提示必填", async () => {
  const values = {
    projectType: "web",
    serverMode: "existing",
    name: "Notes",
    targetRoot: await temporaryDirectory("existing-service-"),
    requirementsText: "记录笔记。"
  }
  const missing = await inspectCreationForm(repositoryRoot, { values, scope: serviceScope })
  expect(missing.field).toBe("developmentBaseUrl")
  expect(missing.question).toContain("已有服务时必填")
  expect(missing.question).not.toMatch(/修正|留空|当前问题：/u)
  const invalid = await inspectCreationForm(repositoryRoot, {
    values: { ...values, developmentBaseUrl: "not-a-url" },
    scope: serviceScope
  })
  expect(invalid.field).toBe("developmentBaseUrl")
  expect(invalid.question).toContain("当前问题：")
  expect(invalid.question).toContain("请填写完整的 HTTP 或 HTTPS 地址")
  expect(invalid.question).not.toContain("API_BASE_URL")
  const ready = await inspectCreationForm(repositoryRoot, {
    values: { ...values, developmentBaseUrl: "http://localhost:8080" }
  })
  expect(ready.phase).toBe("needs-scope")
})

/** 跨轮物化的空默认值不是用户回答，实际空答后才展示必填错误。 */
test("先回答已有服务后，首次地址题不被空默认值误判", async () => {
  const questions: string[] = []
  const answers = ["existing", "", "http://localhost:8080"]
  const result = await collectPromptedIdentity(
    {
      projectType: "web",
      name: "Notes",
      targetRoot: await temporaryDirectory("new-service-answer-"),
      requirementsFile: ""
    },
    async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("不应追加问题")
      return answer
    }
  )
  expect(questions).toHaveLength(3)
  expect(questions[1]).toContain("请提供开发环境的服务地址。")
  expect(questions[1]).not.toContain("当前问题：")
  expect(questions[2]).toContain("当前问题：")
  expect(result.developmentBaseUrl).toBe("http://localhost:8080")
})

/** 后续修订名称会重算派生标识，显式标识则保持用户决定。 */
test.each([undefined, "fixed-name"])("路径题可主动修订已答名称，显式标识=%s", async (id) => {
  const parent = await temporaryDirectory("revised-name-")
  const fields: string[] = []
  const result = await collectPromptedIdentity(
    { projectType: "web", serverMode: "create", name: "Notes", id, requirementsFile: "" },
    async (_question, context) => {
      fields.push(context?.field ?? "")
      return JSON.stringify({ name: "Bookmark Manager", targetRoot: parent })
    }
  )
  expect(fields).toEqual(["targetRoot"])
  expect(result).toMatchObject({
    name: "Bookmark Manager",
    id: id ?? "bookmark-manager",
    targetRoot: path.resolve(parent)
  })
})

/** 修改宿主后重新评估条件字段，不重问未受影响事实，也不接受未知控制字段。 */
test("后续宿主修订只追加扩展所需说明", async () => {
  const parent = await temporaryDirectory("revised-host-")
  const fields: string[] = []
  const questions: string[] = []
  const answers = [
    JSON.stringify({ projectType: "extension", targetRoot: parent, arbitrary: "拒绝" }),
    JSON.stringify({ projectType: "extension", targetRoot: parent }),
    "在浏览器中记录笔记"
  ]
  const result = await collectPromptedIdentity(
    { projectType: "web", serverMode: "create", name: "Notes", requirementsFile: "" },
    async (question, context) => {
      fields.push(context?.field ?? "")
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("不应重复询问已知事实")
      return answer
    }
  )
  expect(fields).toEqual(["targetRoot", "targetRoot", "description"])
  expect(questions[2]).not.toContain("当前问题：")
  expect(result).toMatchObject({ projectType: "extension", name: "Notes", id: "notes" })
})

/** 聊天提示也是固定题库合同，非法覆盖不能绕过结构校验。 */
test("聊天专用提示必须是有效自然文本", () => {
  const questions = structuredClone(INITIALIZATION_QUESTIONS)
  questions.basic.projectType.agentHint = " "
  expect(inspectInitializationCatalog(questions)).toContain(
    "初始化题目 projectType 的聊天提示必须是非空文本"
  )
})
