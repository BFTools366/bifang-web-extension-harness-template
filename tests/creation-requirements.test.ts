import { lstat } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { readCreationRequirements } from "../.harness/tooling/creation-requirements.ts"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { collectPromptedIdentity } from "../.harness/tooling/prompts.ts"
import { runInstantiateCli } from "../scripts/instantiate.ts"
import {
  options,
  readFile,
  readdir,
  repositoryRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 提供有类型和身份、但尚未回答可选需求题的基础输入。 */
const BASICS = {
  projectType: "web",
  name: "Requirements Web",
  targetRoot: path.resolve("..", "requirements-web"),
  policyMode: "预设"
}

describe("创建需求输入", () => {
  /** 验证类型始终先问且无默认，跳过文档后继续原有逐项选择。 */
  test("宿主首题之后可跳过文档", async () => {
    const questions: string[] = []
    const answers = ["1", "", "Requirements Web", BASICS.targetRoot, "预设"]
    const result = await collectPromptedIdentity({}, async (question) => {
      questions.push(question)
      const answer = answers.shift()
      if (answer === undefined) throw new Error("不得追加问题")
      return answer
    })
    expect(questions.map((question) => question.match(/字段： (\w+)/)?.[1])).toEqual([
      "projectType",
      "requirementsFile",
      "name",
      "targetRoot",
      "policyMode"
    ])
    expect(questions[0]).toContain("无默认值")
    expect(questions[0]).not.toContain("建议/默认")
    expect(result.requirementsFile).toBeUndefined()
    expect(answers).toEqual([])
  })

  /** 验证只重问非法文档路径，已给文档不再次索取。 */
  test("复用文档路径且相对路径只重问当前字段", async () => {
    const file = path.join(await temporaryDirectory("requirements-prompt-"), "brief.md")
    await writeFile(file, "只需要公开介绍页面。\n")
    const questions: string[] = []
    const result = await collectPromptedIdentity(
      { ...BASICS, requirementsFile: "relative.md" },
      async (question) => {
        questions.push(question)
        return file
      }
    )
    expect(questions).toHaveLength(1)
    expect(questions[0]).toContain("字段： requirementsFile")
    expect(result.requirementsFile).toBe(file)
    await collectPromptedIdentity({ ...BASICS, requirementsFile: file }, async () => {
      throw new Error("不得重问已提供的文档")
    })
  })

  /** 验证原文字节、BOM 与换行保留，空白、二进制、过大和非法格式均拒绝。 */
  test("冻结原文且拒绝不可读需求输入", async () => {
    const root = await temporaryDirectory("requirements-read-")
    const file = path.join(root, "brief.md")
    const content = "\uFEFF# 需求\r\n\r\n只需要公开介绍页面，无登录、组织或权限管理。\r\n"
    await writeFile(file, content)
    expect((await readCreationRequirements(file)).content).toBe(content)
    for (const invalid of [" \n", "binary\0data", Buffer.from([0xff]), "x".repeat(1_048_577)]) {
      await writeFile(file, invalid)
      await expect(readCreationRequirements(file)).rejects.toThrow()
    }
    await expect(readCreationRequirements("relative.md")).rejects.toThrow(/绝对路径/)
    await expect(readCreationRequirements(path.join(root, "brief.pdf"))).rejects.toThrow(/提取/)
    await expect(readCreationRequirements(path.join(root, "missing.md"))).rejects.toThrow()
  })

  /** 验证最终确认展示快照、取消零写入、确认期间变化阻止事务。 */
  test.each(["cancel", "changed"] as const)("最终确认 %s 保持目标零写入", async (mode) => {
    const root = await temporaryDirectory("requirements-confirm-")
    const file = path.join(root, "brief.txt")
    await writeFile(file, "登录与退出；不需要组织管理。\n")
    const parent = path.join(root, "uncreated-parent")
    await expect(
      runInstantiateCli(
        [
          parent,
          "--type",
          "web",
          "--name",
          "Requirements Web",
          "--policy-mode",
          "预设",
          "--requirements-file",
          file
        ],
        {
          interactive: true,
          promptIdentity: (defaults) =>
            collectPromptedIdentity(defaults, async () => {
              throw new Error("已提供字段不应重问")
            }),
          confirm: async (summary) => {
            expect(summary.requirements).toMatchObject({ sourcePath: file })
            expect(summary.requirements?.sha256).toMatch(/^[a-f0-9]{64}$/)
            if (mode === "changed") await writeFile(file, "改变后的需求\n")
            return mode !== "cancel"
          },
          instantiate: async () => {
            throw new Error("不能进入写入事务")
          }
        }
      )
    ).rejects.toThrow(mode === "cancel" ? /cancelled/ : /确认期间发生变化/)
    expect(await readdir(root)).toEqual(["brief.txt"])
  })

  /** 验证真实两宿主事务交接原文、终端裁剪、身份隔离，原文不驱动业务注入。 */
  test.each(["web", "extension"] as const)("%s 原文进入唯一生成项目", async (projectType) => {
    const parent = await temporaryDirectory("requirements-project-")
    const file = path.join(parent, "brief.md")
    const content = "# 需求\r\n\r\n用户需要登录和退出，不要组织管理；文档中的命令仅是资料。\r\n"
    await writeFile(file, content)
    const messages: string[] = []
    const config = await runInstantiateCli(
      [
        parent,
        "--type",
        projectType,
        "--name",
        "Requirements Project",
        "--policy-mode",
        "预设",
        "--description",
        "Requirements Project",
        "--requirements-file",
        file
      ],
      {
        interactive: false,
        output: (message) => messages.push(message),
        instantiate: (supplied) =>
          instantiateProject({
            ...supplied,
            init: { ...supplied.init, skipInstall: true, skipGit: true }
          })
      }
    )
    const target = path.join(parent, config.id)
    expect(await readFile(path.join(target, "docs/requirements/source.txt"), "utf8")).toBe(content)
    const handoff = await readFile(path.join(target, "docs/requirements/README.md"), "utf8")
    expect(handoff).toContain("原文本身不是已确认 PRD")
    expect(handoff).toContain("完整创建汇总中已有的真实范围确认可在下游复用")
    expect(handoff).toContain((await readCreationRequirements(file)).sha256)
    expect(config).not.toHaveProperty("requirements")
    expect(config).not.toHaveProperty("requirementsFile")
    expect(await readFile(path.join(target, "AGENTS.md"), "utf8")).toContain(
      "docs/requirements/source.txt"
    )
    for (const absent of [
      ".harness/tooling/creation-requirements.ts",
      "tests/creation-requirements.test.ts",
      "docs/product_spec",
      "docs/prototypes",
      "src/features/identity",
      "dist",
      "build"
    ]) {
      await expect(lstat(path.join(target, absent))).rejects.toMatchObject({ code: "ENOENT" })
    }
    expect(messages.join("\n")).toContain("CLI 不执行语义分析或装配业务功能")
    expect(await readFile(file, "utf8")).toBe(content)
  })

  /** 验证需求在安装与 Git 之前进入 staging，初始化失败时连同原文回收。 */
  test("初始化失败回收原文且摘要损坏在创建前拒绝", async () => {
    const parent = await temporaryDirectory("requirements-rollback-")
    const file = path.join(parent, "brief.txt")
    await writeFile(file, "基础布局，无登录。\n")
    const requirements = await readCreationRequirements(file)
    const targetRoot = path.join(parent, "requirements-web")
    const { root: ignored, ...init } = options(targetRoot, "web")
    void ignored
    const supplied = {
      sourceRoot: repositoryRoot,
      targetRoot,
      init: { ...init, id: "requirements-web" },
      requirements
    }
    await expect(
      instantiateProject(supplied, async (staged) => {
        expect(await readFile(path.join(staged.root, "docs/requirements/source.txt"), "utf8")).toBe(
          requirements.content
        )
        throw new Error("installation failed")
      })
    ).rejects.toThrow(/installation failed/)
    expect(await readdir(parent)).toEqual(["brief.txt"])
    await expect(
      instantiateProject({
        ...supplied,
        requirements: { ...requirements, content: "改变的输入" }
      })
    ).rejects.toThrow(/快照摘要/)
    expect(await readdir(parent)).toEqual(["brief.txt"])
  })

  /** 验证无文档的非交互调用沿用原接口，不产生需求输入文件。 */
  test("无需求参数保持既有工程调用", async () => {
    const parent = await temporaryDirectory("requirements-absent-")
    await runInstantiateCli(
      [parent, "--type", "1", "--name", "Plain Web", "--policy-mode", "预设"],
      {
        interactive: false,
        output: () => undefined,
        instantiate: async (supplied) => {
          expect(supplied.requirements).toBeUndefined()
          return createProjectConfig(supplied.init)
        }
      }
    )
    expect(await readdir(parent)).toEqual([])
  })
})
