import path from "node:path"
import { describe, expect, test } from "vitest"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"

/** 提供合法基础身份，让测试聚焦逐项补问与默认值接受边界。 */
const BASE_INPUT = {
  targetRoot: path.resolve("..", "guided-web"),
  projectType: "web",
  webType: "tool-site",
  name: "Guided Web",
  id: "guided-web",
  policyMode: "预设"
}

describe("初始化渐进式引导", () => {
  /** 验证自定义配置的每个建议都需要一次实际回答，来源可追溯。 */
  test("自定义策略逐项回车接受既有预设", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, policyMode: "自定义" },
      async (question) => {
        questions.push(question)
        return ""
      }
    )
    expect(questions).toHaveLength(5)
    expect(questions.map((question) => question.includes("默认：enabled"))).toEqual([
      false,
      false,
      false,
      true,
      false
    ])
    expect(questions.every((question) => question.includes("回车采用"))).toBe(true)
    expect(resolved.agentPolicy).toMatchObject({
      userOwnedTasks: "disabled",
      superpowers: "disabled",
      parallelWorktreeSubagents: "disabled",
      acceptanceSmoke: "enabled",
      e2eHint: "disabled"
    })
    for (const key of [
      "userOwnedTasks",
      "superpowers",
      "parallelWorktreeSubagents",
      "acceptanceSmoke",
      "e2eHint"
    ]) {
      expect(resolved.inputSources[key]).toBe("交互接受默认值")
    }
  })

  /** 验证已有单项决定不能被建议预设覆盖，后续只补其余项。 */
  test("已有单项策略时建议自定义并复用明确答案", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, policyMode: undefined, userOwnedTasks: "enabled" },
      async (question) => {
        questions.push(question)
        return ""
      }
    )
    expect(questions).toHaveLength(5)
    expect(questions[0]).toContain("建议/默认：自定义；回车采用")
    expect(questions.slice(1).join("\n")).not.toContain("是否开启左侧")
    expect(resolved.policyMode).toBe("custom")
    expect(resolved.agentPolicy.userOwnedTasks).toBe("enabled")
    expect(resolved.inputSources.userOwnedTasks).toBe("命令行参数")
  })

  /** 验证未知标识与原始绝对路径不可猜测，错误只重问当前字段。 */
  test("中文名称不生成拼音且相对路径不能作为默认目标", async () => {
    const questions: string[] = []
    const target = path.resolve("..", "notes")
    const answers = ["", "notes", "./notes", target]
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, name: "笔记", id: undefined, targetRoot: undefined },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应重复询问已有合法答案")
        return answer
      }
    )
    expect(questions).toHaveLength(4)
    for (const question of questions.slice(0, 2)) {
      expect(question).toContain("字段： id")
      expect(question).not.toContain("建议/默认")
    }
    for (const question of questions.slice(2)) {
      expect(question).toContain("字段： targetRoot")
      expect(question).not.toContain("回车采用")
    }
    expect(questions[3]).toContain("必须提供绝对路径")
    expect(resolved).toMatchObject({ id: "notes", targetRoot: target, name: "笔记" })
  })

  /** 验证已知安全目录名可作标识建议，不依赖名称转写。 */
  test("接受已知目标目录名作为项目标识建议", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, name: "项目名称", id: undefined },
      async (question) => {
        questions.push(question)
        return ""
      }
    )
    expect(questions).toHaveLength(1)
    expect(questions[0]).toContain("建议/默认：guided-web；回车采用")
    expect(resolved.id).toBe("guided-web")
    expect(resolved.inputSources.id).toBe("交互接受默认值")
  })

  /** 验证错误的主动 JSON 不丢失既有事实，仍可返回普通问答继续。 */
  test("JSON 解析失败只重问当前字段且保留合法输入", async () => {
    const questions: string[] = []
    const answers = ["{bad", "web", "1"]
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, projectType: undefined, webType: undefined },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应重复询问已有合法答案")
        return answer
      }
    )
    expect(questions).toHaveLength(3)
    expect(questions[1]).toContain("上次回答无法解析")
    expect(questions[1]).toContain("字段： projectType")
    expect(questions[2]).toContain("字段： webType")
    expect(resolved.inputSources.name).toBe("命令行参数")
    expect(resolved.name).toBe(BASE_INPUT.name)
  })

  /** 验证身份 JSON 字段既支持直接回答 Schema，也保留主动字段对象兼容。 */
  test.each([false, true])("修正本地化字段，包装形式=%s", async (wrapped) => {
    const identity = JSON.stringify({ defaultLocale: "en", translations: {} })
    let questions = 0
    const resolved = await collectPromptedIdentity(
      { ...BASE_INPUT, identityI18n: "{" },
      async (question) => {
        questions += 1
        expect(question).toContain("字段： identityI18n")
        return wrapped ? JSON.stringify({ identityI18n: identity }) : identity
      }
    )
    expect(questions).toBe(1)
    expect(resolved.identityI18n).toBe(identity)
  })
})
