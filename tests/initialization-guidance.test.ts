import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  collectPromptedIdentity as collectIdentity,
  confirmInstantiation
} from "../.harness/tooling/prompts.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { parseIdentityI18n } from "../.harness/tooling/identity.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import {
  mkdir,
  readdir,
  repositoryRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 不涉及服务选择的旧引导场景显式提供服务来源，避免新增问题改变其测试目标。 */
const collectPromptedIdentity: typeof collectIdentity = (defaults, ask, interaction) =>
  collectIdentity({ serverMode: "create", ...defaults }, ask, interaction)

/** 提供合法基础身份，让测试聚焦逐项补问与默认值接受边界。 */
const BASE_INPUT = {
  targetRoot: path.resolve("..", "guided-web"),
  projectType: "web",
  serverMode: "create",
  name: "Guided Web",
  id: "guided-web",
  policyMode: "预设"
}

describe("初始化渐进式引导", () => {
  /** 验证移除业务分类后仍按固定题目逐项收集，并只重问非法项。 */
  test("工程创建保留固定题面与逐项策略询问", async () => {
    const questions: string[] = []
    const answers = [
      "invalid",
      "1",
      "create",
      "Guided Example",
      BASE_INPUT.targetRoot,
      "custom",
      "2",
      "invalid",
      "2",
      "2",
      "1",
      "2"
    ]
    const identity = await collectPromptedIdentity(
      { serverMode: undefined, requirementsFile: "" },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应询问额外字段")
        return answer
      }
    )
    expect(answers).toEqual([])
    expect(questions.map((question) => question.split("\n")[0])).toEqual([
      "问题名称：项目类型",
      "问题名称：项目类型",
      "问题名称：已有服务端",
      "问题名称：项目显示名称",
      "问题名称：源 Harness 外的父目录",
      "问题名称：Agent 策略模式",
      "问题名称：左侧 user-owned Task 自动拆分",
      "问题名称：Superpowers",
      "问题名称：Superpowers",
      "问题名称：并行 Worktree/Subagent",
      "问题名称：完整候选冒烟",
      "问题名称：发布首次 E2E 建议"
    ])
    expect(questions[0]?.split("\n").slice(0, 4)).toEqual(questions[1]?.split("\n").slice(0, 4))
    expect(questions[8]?.split("\n").slice(0, 4)).toEqual(questions[8]?.split("\n").slice(0, 4))
    for (const question of questions) {
      expect(question.match(/^问题名称：/gm)).toHaveLength(1)
      expect(question.match(/^字段：/gm)).toHaveLength(1)
    }
    expect(identity).toMatchObject({
      projectType: "web",
      id: "guided-example",
      agentPolicy: { superpowers: "disabled", acceptanceSmoke: "enabled" }
    })
    expect(identity).not.toHaveProperty("webType")
    expect(identity).not.toHaveProperty("saasCommerce")
  })

  /** 验证已有决定改变建议值时，只更新建议块而不改问题或重排选项。 */
  test("策略建议变化不改变固定题面和选项", async () => {
    const modeQuestions: string[] = []
    for (const userOwnedTasks of [undefined, "enabled"]) {
      await collectPromptedIdentity(
        { ...{ ...BASE_INPUT, policyMode: undefined, userOwnedTasks }, requirementsFile: "" },
        async (question) => {
          if (question.includes("字段： policyMode")) modeQuestions.push(question)
          return ""
        }
      )
    }
    expect(modeQuestions).toHaveLength(2)
    expect(modeQuestions[0]?.split("\n").slice(0, 5)).toEqual(
      modeQuestions[1]?.split("\n").slice(0, 5)
    )
    expect(modeQuestions[0]).toContain("建议/默认：预设；回车采用")
    expect(modeQuestions[1]).toContain("建议/默认：自定义；回车采用")
  })

  /** 验证创建确认使用同一固定表单，取消和空回答均不能成为创建授权。 */
  test("固定创建确认选项说明写入边界且空回答取消", async () => {
    const identity = await collectPromptedIdentity(
      { ...BASE_INPUT, requirementsFile: "" },
      async () => {
        throw new Error("已有字段无需补问")
      }
    )
    const summary = {
      rawSourceRoot: repositoryRoot,
      canonicalSourceRoot: repositoryRoot,
      rawTargetRoot: BASE_INPUT.targetRoot,
      canonicalTargetRoot: BASE_INPUT.targetRoot,
      inputSources: identity.inputSources,
      policyMode: identity.policyMode,
      init: { ...identity, identityI18n: parseIdentityI18n(identity.identityI18n) }
    }
    const decisions: boolean[] = []
    for (const answer of ["", "no", "取消", "yes", "确认"]) {
      decisions.push(
        await confirmInstantiation(summary, async (question) => {
          expect(question).toContain("问题名称：创建确认\n是否保存到汇总中的指定路径并创建工程？")
          expect(question).toContain(
            "确认（按工程汇总写入目标与暂存目录、安装依赖并建立 Git 基线；首版页面功能由 Agent 在下游继续完成）"
          )
          expect(question).toContain("取消（结束本次创建，不写入目标或暂存目录）")
          expect(question).not.toContain("回车采用")
          return answer
        })
      )
    }
    expect(decisions).toEqual([false, false, false, true, true])
  })

  /** 验证数字类型与英文名称在公开入口解析，父目录已有内容不妨碍创建新子目录。 */
  test.each([
    ["1", "web"],
    ["2", "extension"]
  ] as const)("编号 %s 创建 %s 的同名子目录", async (number, projectType) => {
    const parent = await temporaryDirectory("creation-parent-")
    await writeFile(path.join(parent, "existing.txt"), "保留用户文件")
    const config = await runInstantiateCli(
      [
        parent,
        "--server",
        "create",
        "--type",
        number,
        "--name",
        "My Notes",
        "--policy-mode",
        "预设",
        ...(projectType === "extension" ? ["--description", "My Notes"] : [])
      ],
      {
        sourceRoot: repositoryRoot,
        interactive: false,
        output: () => undefined,
        instantiate: async (supplied) => {
          expect(supplied.targetRoot).toBe(path.join(parent, "my-notes"))
          expect(supplied.init.projectType).toBe(projectType)
          expect(
            createWorkspaceConfig({ ...supplied.init, root: supplied.targetRoot }).members.map(
              ({ type }) => type
            )
          ).toEqual([projectType, "server"])
          return createProjectConfig(supplied.init)
        }
      }
    )
    expect(config.id).toBe("my-notes")
    expect(await readdir(parent)).toEqual(["existing.txt"])
  })

  /** 验证旧类型编号、组合与纯服务入口在目标写入前失败。 */
  test.each(["3", "4", "both", "server", "web,extension", "web,server", "extension,server"])(
    "公开创建拒绝类型 %s",
    async (projectType) => {
      const parent = await temporaryDirectory("creation-type-")
      await expect(
        runInstantiateCli(
          [
            parent,
            "--type",
            projectType,
            "--server",
            "create",
            "--name",
            "Notes",
            "--policy-mode",
            "recommended"
          ],
          {
            sourceRoot: repositoryRoot,
            interactive: false,
            instantiate: async () => {
              throw new Error("非法类型不能开始创建")
            }
          }
        )
      ).rejects.toThrow(/只能选择.*Web.*Extension/)
      expect(await readdir(parent)).toEqual([])
    }
  )

  /** 验证缺译名、非法标识和非空最终目录都在任何创建写入前失败。 */
  test("生成标识和最终子目录的错误保持父目录内容", async () => {
    const parent = await temporaryDirectory("creation-conflict-")
    const basics = [parent, "--server", "create", "--type", "web", "--policy-mode", "预设"]
    const runtime = {
      sourceRoot: repositoryRoot,
      interactive: false,
      instantiate: async () => {
        throw new Error("不能越过预检写入")
      }
    }
    await expect(runInstantiateCli([...basics, "--name", "笔记"], runtime)).rejects.toThrow(
      /--english-name/
    )
    await expect(
      runInstantiateCli([...basics, "--name", "Notes", "--id", "../escape"], runtime)
    ).rejects.toThrow(/项目标识/)
    expect(await readdir(parent)).toEqual([])
    await mkdir(path.join(parent, "notes"))
    await writeFile(path.join(parent, "notes", "user.txt"), "保留")
    await expect(runInstantiateCli([...basics, "--name", "Notes"], runtime)).rejects.toThrow(
      /must be empty/
    )
    expect(await readdir(path.join(parent, "notes"))).toEqual(["user.txt"])
  })

  /** 验证父目录尚不存在时取消最终确认，不会创建父目录、子目录或暂存目录。 */
  test("取消创建保留不存在的父目录", async () => {
    const workspace = await temporaryDirectory("creation-cancel-")
    const parent = path.join(workspace, "new-parent")
    await expect(
      runInstantiateCli(
        [
          parent,
          "--server",
          "create",
          "--type",
          "1",
          "--name",
          "笔记",
          "--english-name",
          "Notes",
          "--policy-mode",
          "预设"
        ],
        {
          sourceRoot: repositoryRoot,
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity({ ...defaults, requirementsFile: "" }, async () => {
              throw new Error("无需补问")
            }),
          confirm: async (summary) => {
            expect(summary.rawParentRoot).toBe(parent)
            expect(summary.rawTargetRoot).toBe(path.join(parent, "notes"))
            expect(summary.init.englishName).toBe("Notes")
            expect(summary.init.id).toBe("notes")
            expect(summary.inputSources.id).toBe("英文名称自动生成")
            return false
          },
          instantiate: async () => {
            throw new Error("取消后不能创建")
          }
        }
      )
    ).rejects.toThrow(/cancelled before any target write/)
    expect(await readdir(workspace)).toEqual([])
  })

  /** 验证自定义配置的每个建议都需要一次实际回答，来源可追溯。 */
  test("自定义策略逐项回车接受既有预设", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity(
      { ...{ ...BASE_INPUT, policyMode: "自定义" }, requirementsFile: "" },
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
      {
        ...{ ...BASE_INPUT, policyMode: undefined, userOwnedTasks: "enabled" },
        requirementsFile: ""
      },
      async (question) => {
        questions.push(question)
        return ""
      }
    )
    expect(questions).toHaveLength(5)
    expect(questions[0]).toContain("建议/默认：自定义；回车采用")
    expect(questions.slice(1).join("\n")).not.toContain("问题名称：左侧 user-owned Task 自动拆分")
    expect(resolved.policyMode).toBe("custom")
    expect(resolved.agentPolicy.userOwnedTasks).toBe("enabled")
    expect(resolved.inputSources.userOwnedTasks).toBe("命令行参数")
  })

  /** 验证终端只补问英文译名与父目录，相对路径直接解析而不要求重输。 */
  test("英文译名生成标识且相对路径直接解析", async () => {
    const questions: string[] = []
    const target = path.resolve("..", "notes")
    const answers = ["", "Notes", "../notes"]
    const resolved = await collectPromptedIdentity(
      {
        ...{ ...BASE_INPUT, name: "笔记", id: undefined, targetRoot: undefined },
        requirementsFile: ""
      },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应重复询问已有合法答案")
        return answer
      }
    )
    expect(questions).toHaveLength(3)
    for (const question of questions.slice(0, 2)) {
      expect(question).toContain("字段： englishName")
      expect(question).not.toContain("建议/默认")
    }
    for (const question of questions.slice(2)) {
      expect(question).toContain("字段： targetRoot")
      expect(question).not.toContain("回车采用")
    }
    expect(resolved).toMatchObject({ id: "notes", targetRoot: target, name: "笔记" })
    expect(resolved.rawParentRoot).toBe("../notes")
    expect(resolved.inputSources.id).toBe("英文名称自动生成")
  })

  /** 验证英文译名优先于父目录，自动生成标识时不要求手填。 */
  test("父目录名不影响英文译名生成的项目标识", async () => {
    const questions: string[] = []
    const resolved = await collectPromptedIdentity(
      {
        ...{ ...BASE_INPUT, name: "项目名称", englishName: "Project Name", id: undefined },
        requirementsFile: ""
      },
      async (question) => {
        questions.push(question)
        return ""
      }
    )
    expect(questions).toHaveLength(0)
    expect(resolved.id).toBe("project-name")
    expect(resolved.inputSources.id).toBe("英文名称自动生成")
  })

  /** 验证后续主动补充译名时重算派生标识，不将旧派生值当成用户显式决定。 */
  test("后续 JSON 补充英文译名会重新生成标识", async () => {
    const answers = [
      "Notes",
      JSON.stringify({ targetRoot: BASE_INPUT.targetRoot, englishName: "Bookmark Manager" })
    ]
    const resolved = await collectPromptedIdentity(
      { ...{ projectType: "web", policyMode: "预设" }, requirementsFile: "" },
      async () => {
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应询问自动生成的标识")
        return answer
      }
    )
    expect(resolved).toMatchObject({ englishName: "Bookmark Manager", id: "bookmark-manager" })
    expect(answers).toEqual([])
  })

  /** 验证已有显式标识继续复用，不因自动规则覆盖用户决定。 */
  test("复用显式标识且不要求补英文译名", async () => {
    const resolved = await collectPromptedIdentity(
      { ...{ ...BASE_INPUT, name: "笔记" }, requirementsFile: "" },
      async () => {
        throw new Error("不应重问已有标识")
      }
    )
    expect(resolved.id).toBe(BASE_INPUT.id)
    expect(resolved.inputSources.id).toBe("命令行参数")
  })

  /** 验证错误的主动 JSON 不丢失既有事实，仍可返回普通问答继续。 */
  test("JSON 解析失败只重问当前字段且保留合法输入", async () => {
    const questions: string[] = []
    const answers = ["{bad", "web"]
    const resolved = await collectPromptedIdentity(
      { ...{ ...BASE_INPUT, projectType: undefined }, requirementsFile: "" },
      async (question) => {
        questions.push(question)
        const answer = answers.shift()
        if (answer === undefined) throw new Error("不应重复询问已有合法答案")
        return answer
      }
    )
    expect(questions).toHaveLength(2)
    expect(questions[1]).toContain("上次回答无法解析")
    expect(questions[1]).toContain("字段： projectType")
    expect(questions[0]?.split("\n").slice(0, 4)).toEqual(questions[1]?.split("\n").slice(0, 4))
    expect(resolved.inputSources.name).toBe("命令行参数")
    expect(resolved.name).toBe(BASE_INPUT.name)
  })

  /** 验证身份 JSON 字段既支持直接回答 Schema，也保留主动字段对象兼容。 */
  test.each([false, true])("修正本地化字段，包装形式=%s", async (wrapped) => {
    const identity = JSON.stringify({ defaultLocale: "en", translations: {} })
    let questions = 0
    const resolved = await collectPromptedIdentity(
      { ...{ ...BASE_INPUT, identityI18n: "{" }, requirementsFile: "" },
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
