import { describe, expect, test } from "vitest"
import { collectPromptedIdentity, formatInstantiationSummary } from "../.harness/tooling/prompts.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { parseArgs } from "../.harness/tooling/args.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { repositoryRoot, temporaryDirectory, path, readdir } from "./harness-tooling-support.ts"

/** 提供完整客户端身份，让每轮问答仅关注购买选择。 */
const CLIENT = {
  projectType: "web",
  webType: "saas-client",
  name: "SaaS Client",
  id: "saas-client",
  targetRoot: path.resolve("..", "saas-client"),
  policyMode: "预设"
}

describe("SaaS 创建购买交接", () => {
  /** 验证建议必须实际询问并接受，非法值仅重问购买项，其他输入保留。 */
  test.each(["", "enabled", "disabled", '{"saasCommerce":"enabled"}'])(
    "补问并解析 %j",
    async (answer) => {
      const questions: string[] = []
      const answers = ["maybe", answer]
      const identity = await collectPromptedIdentity(CLIENT, async (question) => {
        questions.push(question)
        const next = answers.shift()
        if (next === undefined) throw new Error("不应重复询问合法字段")
        return next
      })
      expect(questions).toHaveLength(2)
      for (const question of questions) {
        expect(question).toContain("字段： saasCommerce")
        expect(question).toContain("商品选择、订单管理和钱包管理")
        expect(question).toContain("建议/默认：disabled；回车采用")
        expect(question).not.toContain("五项预设")
      }
      expect(identity.name).toBe(CLIENT.name)
      expect(identity.saasCommerce).toBe(answer.includes("enabled") ? "enabled" : "disabled")
      expect(identity.inputSources.saasCommerce).toBe(
        answer === "" ? "交互接受默认值" : answer.startsWith("{") ? "交互表单" : "交互问答"
      )
    }
  )

  /** 验证明示启用或关闭在交互和非交互公开入口均不补问，并进入汇总与实际初始化参数。 */
  test.each(["enabled", "disabled"] as const)("公开入口透传 %s", async (choice) => {
    for (const interactive of [false, true]) {
      const parent = await temporaryDirectory("saas-choice-")
      const output: string[] = []
      let creations = 0
      await runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--web-type",
          "saas-client",
          "--saas-commerce",
          choice,
          "--name",
          "SaaS Client",
          "--policy-mode",
          "预设"
        ],
        {
          sourceRoot: repositoryRoot,
          interactive,
          output: (line) => output.push(line),
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async () => {
              throw new Error("已有选择不能重问")
            }),
          confirm: async (summary) => {
            expect(summary.init.saasCommerce).toBe(choice)
            expect(summary.inputSources.saasCommerce).toBe("命令行参数")
            expect(formatInstantiationSummary(summary)).toContain(
              `商品购买模块：${choice}（商品选择、订单管理、钱包管理）`
            )
            return true
          },
          instantiate: async (supplied) => {
            creations += 1
            expect(supplied.init.saasCommerce).toBe(choice)
            return createProjectConfig(supplied.init)
          }
        }
      )
      expect(creations).toBe(1)
      expect(output.join("\n")).toContain(`商品购买模块：${choice}`)
      expect(await readdir(parent)).toEqual([])
    }
  })

  /** 验证非交互缺少或非法购买值在初始化之前失败，不用默认关闭吞掉问题。 */
  test.each([undefined, "maybe"])("拒绝客户端缺失或非法值 %s", async (choice) => {
    const parent = await temporaryDirectory("saas-missing-")
    await expect(
      runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--web-type",
          "saas-client",
          "--name",
          "SaaS Client",
          "--policy-mode",
          "预设",
          ...(choice === undefined ? [] : ["--saas-commerce", choice])
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: false,
          instantiate: async () => {
            throw new Error("不应写入")
          }
        }
      )
    ).rejects.toThrow(/--saas-commerce/)
    expect(await readdir(parent)).toEqual([])
  })

  /** 验证其他宿主与模式既不询问购买，也拒绝显式传入任一购买值。 */
  test.each([
    ["web", "tool-site"],
    ["web", "saas-admin"],
    ["extension", undefined]
  ] as const)("限制 %s %s 的字段", async (projectType, webType) => {
    const defaults = { ...CLIENT, projectType, webType, description: "A project" }
    const identity = await collectPromptedIdentity(defaults, async () => {
      throw new Error("不应询问购买")
    })
    expect(identity.saasCommerce).toBeUndefined()
    expect(identity.inputSources.saasCommerce).toBe("不适用")
    for (const choice of ["enabled", "disabled"]) {
      for (const interactive of [false, true]) {
        await expect(
          resolveInitOptions(
            parseArgs([
              "--type",
              projectType,
              ...(webType === undefined ? [] : ["--web-type", webType]),
              "--name",
              CLIENT.name,
              "--policy-mode",
              "预设",
              "--description",
              "A project",
              "--saas-commerce",
              choice
            ]),
            CLIENT.targetRoot,
            {
              interactive,
              promptIdentity: (values) =>
                collectPromptedIdentity(values, async () => {
                  throw new Error("不应补问")
                })
            }
          )
        ).rejects.toThrow(/仅适用于 Web SaaS 客户端/)
      }
    }
  })
})
