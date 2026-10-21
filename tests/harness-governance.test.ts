import { describe, test } from "vitest"
import { realpath } from "node:fs/promises"
import {
  collectPromptedIdentity as collectIdentity,
  confirmInstantiation
} from "../.harness/tooling/prompts.ts"

/** 本组测试聚焦原有字段；服务来源在 Workspace 表单用例独立覆盖。 */
const collectPromptedIdentity: typeof collectIdentity = (defaults, ask, validateTarget) =>
  collectIdentity({ serverMode: "create", ...defaults }, ask, validateTarget)
import { runInstantiateCli } from "../scripts/instantiate.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { validateInitializationTarget } from "../.harness/tooling/initialization-target.ts"
import {
  TEST_BASE_URLS,
  expect,
  initializeProject,
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
  /** 验证可解析的相对父目录只需确认最终保存位置，取消与未确认均零写入。 */
  test.each(["yes", "cancel", "unconfirmed"] as const)("相对父目录：%s", async (answer) => {
    const workspace = await temporaryDirectory("relative-parent-")
    const parent = "./new-parent"
    const target = path.join(await realpath(workspace), "new-parent", "notes")
    let confirmations = 0
    let writes = 0
    const invocation = runInstantiateCli(
      [parent, "--server", "create", "--type", "web", "--name", "Notes", "--policy-mode", "预设"],
      {
        cwd: workspace,
        interactive: false,
        output: () => undefined,
        confirm:
          answer === "unconfirmed"
            ? undefined
            : async (summary) => {
                confirmations++
                expect(summary.rawParentRoot).toBe(parent)
                expect(summary.pathBaseRoot).toBe(workspace)
                expect(summary.canonicalTargetRoot).toBe(target)
                return answer === "yes"
              },
        instantiate: async (supplied) => {
          writes++
          expect(path.isAbsolute(supplied.targetRoot)).toBe(true)
          expect(await realpath(path.dirname(path.dirname(supplied.targetRoot)))).toBe(
            await realpath(workspace)
          )
          return createProjectConfig(supplied.init)
        }
      }
    )
    if (answer === "yes") await invocation
    else
      await expect(invocation).rejects.toThrow(
        answer === "cancel" ? /cancelled/ : /需要确认是否保存/
      )
    expect(confirmations).toBe(answer === "unconfirmed" ? 0 : 1)
    expect(writes).toBe(answer === "yes" ? 1 : 0)
    expect(await readdir(workspace)).toEqual([])
  })

  /** 验证相对写法不会绕过源内目标保护，失败前不要求用户确认。 */
  test("相对源内父目录保持拒绝", async () => {
    await expect(
      runInstantiateCli(
        [".", "--server", "create", "--type", "web", "--name", "Notes", "--policy-mode", "预设"],
        {
          cwd: repositoryRoot,
          interactive: false,
          confirm: async () => {
            throw new Error("非法位置不能进入确认")
          },
          instantiate: async () => {
            throw new Error("非法位置不能进入事务")
          }
        }
      )
    ).rejects.toThrow(/outside the Harness/)
  })

  /** 验证交互修正位置参数后，汇总只使用最新回答，不展示旧路径。 */
  test("修正父目录后确认最终原始输入", async () => {
    const workspace = await temporaryDirectory("corrected-parent-")
    await expect(
      runInstantiateCli(
        [
          repositoryRoot,
          "--server",
          "create",
          "--type",
          "web",
          "--name",
          "Notes",
          "--policy-mode",
          "预设"
        ],
        {
          cwd: workspace,
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity(
              { ...defaults, requirementsFile: "" },
              async (question) => {
                expect(question).toContain("字段： targetRoot")
                return "./corrected-parent"
              },
              {
                cwd: workspace,
                validateTarget: (values) => validateInitializationTarget(repositoryRoot, values)
              }
            ),
          confirm: async (summary) => {
            expect(summary.rawParentRoot).toBe("./corrected-parent")
            expect(summary.rawTargetRoot).toBe(path.join(workspace, "corrected-parent", "notes"))
            return false
          },
          instantiate: async () => {
            throw new Error("取消不能写入")
          }
        }
      )
    ).rejects.toThrow(/cancelled/)
    expect(await readdir(workspace)).toEqual([])
  })

  /** 验证宿主选择不隐含业务分类，旧参数在写入前拒绝。 */
  test("Web foundation creation has no business category prompt", async () => {
    const questions: string[] = []
    const identity = await collectPromptedIdentity(
      {
        ...{
          targetRoot: path.join(repositoryRoot, "..", "foundation-web"),
          name: "Foundation Web",
          policyMode: "预设"
        },
        requirementsFile: ""
      },
      async (question) => {
        questions.push(question)
        return "web"
      }
    )
    expect(questions).toHaveLength(1)
    expect(questions[0]).toContain("字段： projectType")
    expect(identity.projectType).toBe("web")
    for (const flag of ["--web-type", "--saas-commerce"]) {
      await expect(
        resolveInitOptions(
          parseArgs([
            "--server",
            "create",
            "--type",
            "web",
            "--name",
            "Foundation Web",
            "--policy-mode",
            "预设",
            flag,
            "disabled"
          ]),
          repositoryRoot,
          { interactive: false }
        )
      ).rejects.toThrow(/Unknown|未知|unsupported/i)
    }
  })

  /** 验证主动提供多个 JSON 字段仍复用，题面只询问当前错误项。 */
  test("reuses voluntarily batched basics while asking only the current invalid field", async () => {
    const questions: string[] = []
    const answers = [
      JSON.stringify({
        targetRoot: path.join(repositoryRoot, "..", "interactive-web"),
        projectType: "web",
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
    const resolved = await collectPromptedIdentity(
      { ...{}, requirementsFile: "" },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("Unexpected extra initialization question")
        return answer
      }
    )

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

  /** 验证公共创建入口拒绝缺少必要输入与内部测试跳过参数。 */
  test("rejects missing inputs and public skip flags before instantiation", async () => {
    let instantiated = false
    await expect(
      runInstantiateCli(["relative-target"], {
        interactive: false,
        instantiate: async () => {
          instantiated = true
          throw new Error("must not instantiate")
        }
      })
    ).rejects.toThrow(/missing required option/)
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
          "--server",
          "create",
          "--type",
          "web",
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
            collectPromptedIdentity({ ...defaults, requirementsFile: "" }, async (question) => {
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
        "--server",
        "create",
        "--type",
        "web",
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
            collectPromptedIdentity({ ...defaults, requirementsFile: "" }, async () => {
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
            expect(summary.inputSources.brandColor).toBe("Harness 默认值")
            expect(summary.inputSources.superpowers).toBe("recommended 确定性预设")
            expect(summary.init.agentPolicy.confirmedBy).toBe("interactive-owner")
            return confirmInstantiation(summary, async (question) => {
              confirmationCount += 1
              expect(question).toContain(`源路径（原始）：${repositoryRoot}`)
              expect(question).toContain(`目标路径（原始）：${targetRoot}`)
              expect(question).toContain(`父目录（原始）：${parent}`)
              expect(question).toContain("targetRoot: 命令行父目录 + 项目标识")
              expect(question).toContain("项目类型：web")
              expect(question).not.toContain("Web 类型：")
              expect(question).toContain("是否保存到汇总中的指定路径并创建工程？")
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
    expect(() =>
      parseArgs([
        "--server",
        "create",
        "--type",
        "web",
        "--server",
        "create",
        "--type",
        "extension"
      ])
    ).toThrow(/only be provided once/)
    await expect(
      resolveInitOptions(
        parseArgs([
          "--server",
          "create",
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
    ).rejects.toThrow(/只能选择.*Web.*Extension/)
  })
})
