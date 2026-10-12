import { describe, test } from "vitest"
import { realpath } from "node:fs/promises"
import { collectPromptedIdentity, confirmInstantiation } from "../.harness/tooling/prompts.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
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
    const answers = ["", "web", "", "unknown", "1"]
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
      expect(question).not.toContain("回车采用")
    }
    for (const question of questions.slice(2)) {
      expect(question).not.toContain("回车采用")
      expect(question.match(/字段：/g)).toHaveLength(1)
      expect(question).toContain("字段： webType")
      expect(question).toContain("1.工具站点")
      expect(question).toContain("2.SaaS客户端")
      expect(question).toContain("3.SaaS大后台")
      expect(question).toContain("流程待开放")
    }
    expect(identity).toMatchObject({
      webType: "tool-site",
      inputSources: { webType: "交互问答" }
    })
  })

  /** 验证 SaaS 选项在交互及非交互入口均停止，且缺席或空目标无任何写入。 */
  test.each([
    ["saas-client", "2", "SaaS客户端"],
    ["saas-admin", "3", "SaaS大后台"]
  ])("keeps the reserved %s flow closed before writes", async (webType, number, label) => {
    for (const interactive of [false, true]) {
      for (const exists of [false, true]) {
        const parent = await temporaryDirectory("harness-reserved-web-")
        const targetRoot = path.join(parent, "reserved-web")
        if (exists) await mkdir(targetRoot)
        let instantiated = false
        let confirmed = false
        let questions = 0
        await expect(
          runInstantiateCli(
            [
              targetRoot,
              "--type",
              "web",
              "--name",
              "Reserved Web",
              "--id",
              "reserved-web",
              "--policy-mode",
              "自定义",
              ...(interactive ? [] : ["--web-type", webType])
            ],
            {
              sourceRoot: repositoryRoot,
              interactive,
              promptIdentity: (defaults) =>
                collectPromptedIdentity(defaults, async (question) => {
                  questions += 1
                  expect(question).toContain("字段： webType")
                  return JSON.stringify({ webType: number })
                }),
              confirm: async () => {
                confirmed = true
                return true
              },
              instantiate: async () => {
                instantiated = true
                throw new Error("Must not instantiate")
              }
            }
          )
        ).rejects.toThrow(`${label}创建流程暂未开放`)
        expect(questions).toBe(interactive ? 1 : 0)
        expect(confirmed).toBe(false)
        expect(instantiated).toBe(false)
        if (exists) expect(await readdir(targetRoot)).toEqual([])
        else await expect(readdir(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
        expect(await readdir(parent)).toEqual(exists ? ["reserved-web"] : [])
      }
    }
  })

  /** 验证交互与公开非交互入口选中预留 SaaS 后立即结束，不收集其他字段或写入目标。 */
  test.each(["saas-client", "saas-admin"])(
    "stops %s even when other basic fields are missing",
    async (webType) => {
      let questions = 0
      await expect(
        collectPromptedIdentity({}, async () => {
          questions += 1
          if (questions > 1) throw new Error("Must not collect more fields for a reserved flow")
          return JSON.stringify({ projectType: "web", webType })
        })
      ).rejects.toThrow(/创建流程暂未开放/)
      expect(questions).toBe(1)
      await expect(
        collectPromptedIdentity({ projectType: "web", webType }, async () => {
          throw new Error("Must stop before asking for any missing basic field")
        })
      ).rejects.toThrow(/创建流程暂未开放/)
      for (const exists of [false, true]) {
        // 缺少名称、标识和策略仍应返回预留类型原因，并保持公开入口零写入。
        const parent = await temporaryDirectory("harness-reserved-incomplete-")
        const targetRoot = path.join(parent, "reserved-incomplete")
        if (exists) await mkdir(targetRoot)
        await expect(
          runInstantiateCli([targetRoot, "--type", "web", "--web-type", webType], {
            sourceRoot: repositoryRoot,
            interactive: false,
            promptIdentity: async () => {
              throw new Error("Must not prompt for a reserved non-interactive flow")
            },
            confirm: async () => {
              throw new Error("Must not confirm a reserved flow")
            },
            instantiate: async () => {
              throw new Error("Must not instantiate a reserved flow")
            }
          })
        ).rejects.toThrow(/创建流程暂未开放/)
        if (exists) expect(await readdir(targetRoot)).toEqual([])
        else await expect(readdir(targetRoot)).rejects.toMatchObject({ code: "ENOENT" })
        expect(await readdir(parent)).toEqual(exists ? ["reserved-incomplete"] : [])
      }
    }
  )

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
    const answers = ["Form Target", "form-target", targetRoot]
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
            expect(summary.inputSources.targetRoot).toBe("交互问答")
            return false
          },
          instantiate: async () => {
            instantiated = true
            throw new Error("must not instantiate")
          }
        }
      )
    ).rejects.toThrow(/cancelled before any target write/)

    expect(basicQuestions).toHaveLength(3)
    for (const [index, key] of ["name", "id", "targetRoot"].entries()) {
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
        targetRoot,
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
            expect(summary.canonicalTargetRoot).toBe(
              path.join(await realpath(parent), "confirmed-web")
            )
            expect(summary.inputSources.targetRoot).toBe("命令行绝对位置参数")
            expect(summary.inputSources.webType).toBe("命令行参数")
            expect(summary.inputSources.brandColor).toBe("Harness 默认值")
            expect(summary.inputSources.superpowers).toBe("recommended 确定性预设")
            expect(summary.init.agentPolicy.confirmedBy).toBe("interactive-owner")
            return confirmInstantiation(summary, async (question) => {
              confirmationCount += 1
              expect(question).toContain(`源路径（原始）：${repositoryRoot}`)
              expect(question).toContain(`目标路径（原始）：${targetRoot}`)
              expect(question).toContain("targetRoot: 命令行绝对位置参数")
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
