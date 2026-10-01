import { describe, test } from "vitest"
import { realpath } from "node:fs/promises"
import { collectPromptedIdentity, confirmInstantiation } from "../.harness/tooling/prompts.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
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
  /** 验证交互初始化首轮批量收集且只重问错误基础字段。 */
  test("collects missing basics in one round and only re-asks invalid fields", async () => {
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
    const resolved = await collectPromptedIdentity({}, async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("Unexpected extra initialization question")
      return answer
    })

    expect(questions[0]).toContain("1. 项目类型")
    expect(questions[0]).toContain("JSON key: projectType")
    expect(questions[0]).toContain("JSON key: name")
    expect(questions[0]).not.toContain("JSON key: releaseBaseUrl")
    expect(questions[0]).not.toContain("JSON key: description")
    expect(questions[0]).not.toContain("JSON key: confirmedBy")
    expect(questions[0]).toContain("预设（推荐）或自定义")
    expect(questions[1]).toContain("JSON key: id")
    expect(questions[1]).toContain("JSON key: releaseBaseUrl")
    expect(questions[1]).not.toContain("JSON key: name")
    expect(questions[1]).not.toContain("JSON key: developmentBaseUrl")
    expect(questions[2]).toContain("左侧 user-owned Task 自动拆分")
    expect(questions[3]).toContain("user-owned-tasks must be enabled or disabled")
    expect(questions[4]).toContain("Superpowers")
    expect(questions[5]).toContain("并行 Worktree/Subagent")
    expect(questions[6]).toContain("完整候选冒烟")
    expect(questions[7]).toContain("发布首次 E2E 选择的建议值")
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

  /** 验证交互入口把缺失目标与其他基础字段放入同一首轮表单。 */
  test("collects an omitted interactive target in the same first-round form", async () => {
    const parent = await temporaryDirectory("web-harness-target-form-")
    const targetRoot = path.join(parent, "form-target")
    const basicQuestions: string[] = []
    let instantiated = false
    await expect(
      runInstantiateCli(
        [
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
            collectPromptedIdentity(defaults, async (question) => {
              basicQuestions.push(question)
              return JSON.stringify({
                targetRoot,
                name: "Form Target",
                id: "form-target"
              })
            }),
          confirm: async (summary) => {
            expect(summary.rawTargetRoot).toBe(targetRoot)
            expect(summary.inputSources.targetRoot).toBe("交互表单")
            return false
          },
          instantiate: async () => {
            instantiated = true
            throw new Error("must not instantiate")
          }
        }
      )
    ).rejects.toThrow(/cancelled before any target write/)

    expect(basicQuestions).toHaveLength(1)
    expect(basicQuestions[0]).toContain("JSON key: targetRoot")
    expect(basicQuestions[0]).toContain("JSON key: name")
    expect(basicQuestions[0]).toContain("JSON key: id")
    expect(basicQuestions[0]).not.toContain("JSON key: projectType")
    expect(instantiated).toBe(false)
    await expect(readdir(targetRoot)).rejects.toThrow()
  })

  /** 验证交互式完整汇总只确认一次且拒绝时保持目标零写入。 */
  test("confirms the complete interactive summary exactly once before writes", async () => {
    const parent = await temporaryDirectory("web-harness-confirmation-")
    const targetRoot = path.join(parent, "confirmed-web")
    const argv = [
      targetRoot,
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
          expect(summary.inputSources.brandColor).toBe("Harness 默认值")
          expect(summary.inputSources.superpowers).toBe("recommended 确定性预设")
          expect(summary.init.agentPolicy.confirmedBy).toBe("interactive-owner")
          return confirmInstantiation(summary, async (question) => {
            confirmationCount += 1
            expect(question).toContain(`源路径（原始）：${repositoryRoot}`)
            expect(question).toContain(`目标路径（原始）：${targetRoot}`)
            expect(question).toContain("targetRoot: 命令行绝对位置参数")
            expect(question).toContain("按此创建？")
            return "no"
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
  })

  /** 验证 rejects combined, invalid, and repeated type options 场景。 */
  test("rejects combined, invalid, and repeated type options", /* 执行 当前声明 函数的处理逻辑。 */ async () => {
    // 保存 root 变量供当前逻辑使用。
    const root = await seedTemplateRoot()
    await expect(
      initializeProject({ ...options(root, "web"), projectType: "both" as "web" })
    ).rejects.toThrow(/exactly "web" or "extension"/)
    expect(
      /* 执行 当前声明 函数的处理逻辑。 */ () => parseArgs(["--type", "web", "--type", "extension"])
    ).toThrow(/only be provided once/)
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
