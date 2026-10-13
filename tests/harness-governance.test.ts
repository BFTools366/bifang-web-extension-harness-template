import { describe, test } from "vitest"
import { realpath } from "node:fs/promises"
import { collectPromptedIdentity, confirmInstantiation } from "../.harness/tooling/prompts.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import {
  TEST_BASE_URLS,
  expect,
  initializeProject,
  mkdir,
  options,
  parseArgs,
  path,
  readdir,
  repositoryRoot,
  resolveInitOptions,
  seedTemplateRoot,
  temporaryDirectory
} from "./harness-tooling-support.ts"

/** 验证 single-package Harness validation and governance 的完整回归场景。 */
describe("single-package Harness validation and governance", () => {
  /** 验证首轮选择 Web 后只补问 Web 类型，非法值重问且编号可选工具站点。 */
  test("requires a Web type after choosing Web without defaulting", async () => {
    const questions: string[] = []
    const answers = ["", "1", "", "unknown", "1"]
    const identity = await collectPromptedIdentity(
      {
        targetRoot: path.join(repositoryRoot, "..", "chosen-web"),
        name: "Chosen Web",
        id: "chosen-web",
        policyMode: "预设"
      },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("Unexpected extra question")
        return answer
      }
    )
    expect(questions).toHaveLength(5)
    for (const question of questions.slice(0, 2)) {
      expect(question).toContain("字段： projectType")
      expect(question).toContain("1.Web")
      expect(question).toContain("2.Extension")
      expect(question).not.toContain("回车采用")
    }
    for (const question of questions.slice(2)) {
      expect(question).not.toContain("回车采用")
      expect(question.match(/字段：/g)).toHaveLength(1)
      expect(question).toContain("字段： webType")
      expect(question).toContain("1.工具站点")
      expect(question).toContain("2.SaaS客户端")
      expect(question).toContain("3.SaaS大后台")
      expect(question).not.toContain("流程待开放")
    }
    expect(identity).toMatchObject({
      webType: "tool-site",
      inputSources: { webType: "交互问答" }
    })
  })

  /** 验证两种 SaaS 类型都通过公开入口，并准确确认及透传已选模式。 */
  test.each([
    ["saas-client", "2"],
    ["saas-admin", "3"]
  ])("accepts %s in interactive and non-interactive creation", async (webType, number) => {
    for (const interactive of [false, true]) {
      const parent = await temporaryDirectory("harness-saas-web-")
      const targetRoot = path.join(parent, "saas-web")
      let instantiated = false
      let confirmed = false
      let questions = 0
      const output: string[] = []
      await runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--name",
          "SaaS Web",
          "--id",
          "saas-web",
          "--policy-mode",
          "预设",
          ...(interactive ? [] : ["--web-type", webType]),
          ...(webType === "saas-client" ? ["--saas-commerce", "disabled"] : [])
        ],
        {
          sourceRoot: repositoryRoot,
          interactive,
          output: (message) => output.push(message),
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async (question) => {
              questions += 1
              expect(question).toContain("字段： webType")
              return JSON.stringify({ webType: number })
            }),
          confirm: async (summary) => {
            confirmed = true
            expect(summary.init.webType).toBe(webType)
            expect(summary.inputSources.webType).toBe("交互表单")
            return true
          },
          instantiate: async (supplied) => {
            instantiated = true
            expect(supplied.targetRoot).toBe(targetRoot)
            expect(supplied.init.webType).toBe(webType)
            expect(supplied.init.projectType).toBe("web")
            return createProjectConfig(supplied.init)
          }
        }
      )
      expect(questions).toBe(interactive ? 1 : 0)
      expect(confirmed).toBe(interactive)
      expect(instantiated).toBe(true)
      expect(output.join("\n")).toContain(webType)
      expect(output.join("\n")).toContain("需求确认 → 原型登记 → 实施")
    }
  })

  /** 验证 SaaS 选择继续补齐缺项，既有合法模式不会被重复询问。 */
  test.each(["saas-client", "saas-admin"])("collects remaining basics for %s", async (webType) => {
    const parent = await temporaryDirectory("harness-saas-basics-")
    const targetRoot = path.join(parent, "saas-basics")
    const answers = [
      JSON.stringify({
        projectType: "web",
        webType,
        ...(webType === "saas-client" ? { saasCommerce: "disabled" } : {})
      }),
      "SaaS Basics",
      targetRoot,
      "预设"
    ]
    const questions: string[] = []
    const identity = await collectPromptedIdentity({}, async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("Unexpected extra initialization question")
      return answer
    })
    expect(identity.webType).toBe(webType)
    expect(questions).toHaveLength(4)
    expect(questions.slice(1).every((question) => !question.includes("字段： webType"))).toBe(true)
    await expect(
      runInstantiateCli([targetRoot, "--type", "web", "--web-type", webType], {
        sourceRoot: repositoryRoot,
        interactive: false,
        instantiate: async () => {
          throw new Error("Must not write with missing basics")
        }
      })
    ).rejects.toThrow(/missing required option/)
    expect(await readdir(parent)).toEqual([])
  })

  /** 验证两种 SaaS 仍在最终确认取消时保护缺席或已存在空目标。 */
  test.each(["saas-client", "saas-admin"])("cancels %s before writes", async (webType) => {
    for (const exists of [false, true]) {
      const parent = await temporaryDirectory("harness-saas-cancel-")
      const targetRoot = path.join(parent, "saas-cancel")
      if (exists) await mkdir(targetRoot)
      await expect(
        runInstantiateCli(
          [
            parent,
            "--type",
            "web",
            "--web-type",
            webType,
            ...(webType === "saas-client" ? ["--saas-commerce", "disabled"] : []),
            "--name",
            "SaaS Cancel",
            "--id",
            "saas-cancel",
            "--policy-mode",
            "预设"
          ],
          {
            sourceRoot: repositoryRoot,
            interactive: true,
            promptIdentity: (defaults) =>
              collectPromptedIdentity(defaults, async () => {
                throw new Error("Must reuse all supplied fields")
              }),
            confirm: async (summary) => {
              expect(summary.init.webType).toBe(webType)
              return false
            },
            instantiate: async () => {
              throw new Error("Must not instantiate after cancellation")
            }
          }
        )
      ).rejects.toThrow(/cancelled before any target write/)
      expect(await readdir(parent)).toEqual(exists ? ["saas-cancel"] : [])
      if (exists) expect(await readdir(targetRoot)).toEqual([])
    }
  })

  /** 验证非交互 Web 必须提供分类，Extension 拒绝混入该字段。 */
  test("requires an explicit CLI Web type and rejects it for Extension", async () => {
    const basics = ["--name", "Typed Project", "--id", "typed-project", "--policy-mode", "预设"]
    await expect(
      resolveInitOptions(parseArgs(["--type", "web", ...basics]), repositoryRoot, {
        interactive: false
      })
    ).rejects.toThrow(/--web-type/)
    for (const interactive of [false, true]) {
      await expect(
        resolveInitOptions(
          parseArgs([
            "--type",
            "extension",
            "--description",
            "Typed extension",
            "--web-type",
            "tool-site",
            ...basics
          ]),
          repositoryRoot,
          {
            interactive,
            promptIdentity: (defaults) =>
              collectPromptedIdentity(defaults, async () => {
                throw new Error("Must not ask about Web types for Extension")
              })
          }
        )
      ).rejects.toThrow(/仅适用于 Web/)
    }
  })

  /** 验证主动提供多个 JSON 字段仍复用，题面只询问当前错误项。 */
  test("reuses voluntarily batched basics while asking only the current invalid field", async () => {
    const questions: string[] = []
    const answers = [
      JSON.stringify({
        targetRoot: path.join(repositoryRoot, "..", "interactive-web"),
        projectType: "web",
        webType: "tool-site",
        name: "Interactive Web",
        id: "Invalid_ID",
        description: "Interactive form contract.",
        developmentBaseUrl: TEST_BASE_URLS.developmentBaseUrl,
        testBaseUrl: TEST_BASE_URLS.testBaseUrl,
        releaseBaseUrl: "http://unsafe.example.com",
        policyMode: "custom",
        confirmedBy: "interactive-owner"
      }),
      JSON.stringify({
        id: "interactive-web",
        releaseBaseUrl: TEST_BASE_URLS.releaseBaseUrl
      }),
      "unexpected",
      "disabled",
      "disabled",
      "enabled",
      "enabled",
      "disabled"
    ]
    const resolved = await collectPromptedIdentity({}, async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("Unexpected extra initialization question")
      return answer
    })

    expect(questions[0]).toContain("项目类型")
    expect(questions[0]).toContain("字段： projectType")
    expect(questions[0]).not.toContain("字段： name")
    expect(questions[0]).not.toContain("字段： releaseBaseUrl")
    expect(questions[0]).not.toContain("字段： description")
    expect(questions[0]).not.toContain("字段： confirmedBy")
    expect(questions[1]).toContain("字段： id")
    expect(questions[1]).not.toContain("字段： releaseBaseUrl")
    expect(questions[1]).not.toContain("字段： name")
    expect(questions[1]).not.toContain("字段： developmentBaseUrl")
    expect(questions[2]).toContain("左侧 user-owned Task 自动拆分")
    expect(questions[3]).toContain("user-owned-tasks 必须是 enabled 或 disabled")
    expect(questions[4]).toContain("Superpowers")
    expect(questions[5]).toContain("并行 Worktree/Subagent")
    expect(questions[6]).toContain("完整候选冒烟")
    expect(questions[7]).toContain("发布首次 E2E")
    expect(questions[7]).toContain("同一发布流程复用已明确选择")
    expect(answers).toEqual([])
    expect(resolved).toMatchObject({
      targetRoot: path.join(repositoryRoot, "..", "interactive-web"),
      projectType: "web",
      name: "Interactive Web",
      id: "interactive-web",
      brandColor: "#4C6EF5",
      inputSources: {
        id: "交互表单",
        releaseBaseUrl: "交互表单",
        superpowers: "交互条件问询"
      },
      agentPolicy: {
        confirmedBy: "interactive-owner",
        userOwnedTasks: "disabled",
        superpowers: "disabled",
        parallelWorktreeSubagents: "enabled",
        acceptanceSmoke: "enabled",
        e2eHint: "disabled"
      }
    })
  })

  /** 验证公共创建入口拒绝相对目标与内部测试跳过参数。 */
  test("rejects relative targets and public skip flags before instantiation", async () => {
    let instantiated = false
    await expect(
      runInstantiateCli(["relative-target"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/absolute path/)
    await expect(
      runInstantiateCli([path.join(repositoryRoot, "public-skip"), "--skip-install"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/Unknown option\(s\): --skip-install/)
    await expect(
      runInstantiateCli([path.join(repositoryRoot, "public-skip"), "--skip-git"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/Unknown option\(s\): --skip-git/)
    expect(instantiated).toBe(false)
  })

  /** 验证缺失身份和目标逐项询问，拒绝汇总时保持零写入。 */
  test("collects an omitted interactive target after the missing identity fields", async () => {
    const parent = await temporaryDirectory("web-harness-target-form-")
    const targetRoot = path.join(parent, "form-target")
    const basicQuestions: string[] = []
    const answers = ["Form Target", parent]
    let instantiated = false
    await expect(
      runInstantiateCli(
        [
          "--type",
          "web",
          "--web-type",
          "tool-site",
          "--description",
          "Collects the target with missing identity fields.",
          "--development-base-url",
          TEST_BASE_URLS.developmentBaseUrl,
          "--test-base-url",
          TEST_BASE_URLS.testBaseUrl,
          "--release-base-url",
          TEST_BASE_URLS.releaseBaseUrl,
          "--policy-mode",
          "recommended",
          "--confirmed-by",
          "interactive-owner"
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async (question) => {
              basicQuestions.push(question)
              const answer = answers.shift()
              if (answer === undefined) throw new Error("Unexpected extra question")
              return answer
            }),
          confirm: async (summary) => {
            expect(summary.rawTargetRoot).toBe(targetRoot)
            expect(summary.rawParentRoot).toBe(parent)
            expect(summary.inputSources.targetRoot).toBe("交互问答父目录 + 项目标识")
            return false
          },
          instantiate: async () => {
            instantiated = true
            throw new Error("must not instantiate")
          }
        }
      )
    ).rejects.toThrow(/cancelled before any target write/)

    expect(basicQuestions).toHaveLength(2)
    for (const [index, key] of ["name", "targetRoot"].entries()) {
      expect(basicQuestions[index]).toContain(`字段： ${key}`)
      expect(basicQuestions[index]?.match(/字段：/g)).toHaveLength(1)
    }
    expect(answers).toEqual([])
    expect(instantiated).toBe(false)
    await expect(readdir(targetRoot)).rejects.toThrow()
  })

  /** 验证交互式完整汇总只确认一次且拒绝时保持目标零写入。 */
  test.each(["no", ""])(
    "confirms the complete summary once and rejects %j before writes",
    async (answer) => {
      const parent = await temporaryDirectory("web-harness-confirmation-")
      const targetRoot = path.join(parent, "confirmed-web")
      const argv = [
        parent,
        "--type",
        "web",
        "--web-type",
        "tool-site",
        "--name",
        "Confirmed Web",
        "--id",
        "confirmed-web",
        "--description",
        "Confirms all inputs before writing.",
        "--development-base-url",
        TEST_BASE_URLS.developmentBaseUrl,
        "--test-base-url",
        TEST_BASE_URLS.testBaseUrl,
        "--release-base-url",
        TEST_BASE_URLS.releaseBaseUrl,
        "--policy-mode",
        "recommended",
        "--confirmed-by",
        "interactive-owner"
      ]
      let confirmationCount = 0
      let instantiated = false
      await expect(
        runInstantiateCli(argv, {
          sourceRoot: repositoryRoot,
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async () => {
              throw new Error("All supplied fields must be reused without another basic question")
            }),
          confirm: async (summary) => {
            expect(summary.rawSourceRoot).toBe(repositoryRoot)
            expect(summary.canonicalSourceRoot).toBe(repositoryRoot)
            expect(summary.rawTargetRoot).toBe(targetRoot)
            expect(summary.rawParentRoot).toBe(parent)
            expect(summary.canonicalTargetRoot).toBe(
              path.join(await realpath(parent), "confirmed-web")
            )
            expect(summary.inputSources.targetRoot).toBe("命令行父目录 + 项目标识")
            expect(summary.inputSources.webType).toBe("命令行参数")
            expect(summary.inputSources.brandColor).toBe("Harness 默认值")
            expect(summary.inputSources.superpowers).toBe("recommended 确定性预设")
            expect(summary.init.agentPolicy.confirmedBy).toBe("interactive-owner")
            return confirmInstantiation(summary, async (question) => {
              confirmationCount += 1
              expect(question).toContain(`源路径（原始）：${repositoryRoot}`)
              expect(question).toContain(`目标路径（原始）：${targetRoot}`)
              expect(question).toContain(`父目录（原始）：${parent}`)
              expect(question).toContain("targetRoot: 命令行父目录 + 项目标识")
              expect(question).toContain("Web 类型：工具站点（tool-site）")
              expect(question).toContain("按此创建？")
              return answer
            })
          },
          instantiate: async () => {
            instantiated = true
            throw new Error("must not instantiate")
          }
        })
      ).rejects.toThrow(/cancelled before any target write/)

      expect(confirmationCount).toBe(1)
      expect(instantiated).toBe(false)
      await expect(readdir(targetRoot)).rejects.toThrow()
      expect(
        (await readdir(parent)).filter((entry) => entry.startsWith(".confirmed-web.harness-stage-"))
      ).toEqual([])
    }
  )

  /** 验证 rejects combined, invalid, and repeated type options 场景。 */
  test("rejects combined, invalid, and repeated type options", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    const root = await seedTemplateRoot()
    await expect(
      initializeProject({ ...options(root, "web"), projectType: "both" as "web" })
    ).rejects.toThrow(/exactly "web" or "extension"/)
    expect(() => parseArgs(["--type", "web", "--type", "extension"])).toThrow(
      /only be provided once/
    )
    await expect(
      resolveInitOptions(
        parseArgs([
          "--type",
          "web,extension",
          "--name",
          "Mixed",
          "--id",
          "mixed",
          "--description",
          "Mixed project",
          "--development-base-url",
          TEST_BASE_URLS.developmentBaseUrl,
          "--test-base-url",
          TEST_BASE_URLS.testBaseUrl,
          "--release-base-url",
          TEST_BASE_URLS.releaseBaseUrl,
          "--policy-mode",
          "recommended",
          "--confirmed-by",
          "test-owner"
        ]),
        root
      )
    ).rejects.toThrow(/exactly "web" or "extension"/)
  })
})
