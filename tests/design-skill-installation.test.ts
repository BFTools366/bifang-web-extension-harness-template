import { createHash } from "node:crypto"
import { lstat, symlink } from "node:fs/promises"
import { describe, test } from "vitest"
import {
  DESIGN_SKILL_PATH,
  inspectDesignSkill,
  validateDesignSkill
} from "../.harness/tooling/design-skill.ts"
import {
  DESIGN_SKILL_BUNDLE_PATH,
  DESIGN_SKILL_COMMIT,
  loadDesignSkillBundle,
  prepareDesignSkillInstallation
} from "../.harness/tooling/install-design-skill.ts"
import { validateOwnershipManifest } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { ownershipRule } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-glob.ts"
import { validateTerminalSkills } from "../.harness/tooling/skill-validation.ts"
import {
  expect,
  initializeProject,
  instantiateProject,
  mkdir,
  options,
  path,
  readFile,
  readdir,
  repositoryRoot,
  rm,
  seedTemplateRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 保存刻意保留非标准排版的有效用户设计 Skill，证明初始化不会重写已有内容。 */
const EXISTING_SKILL = `---
name: design-taste-frontend
description: User maintained design guidance.
---

# My design guidance

Preserve    my typography.
`

describe("project-local design support", () => {
  /** 验证两种宿主均自动安装固定原文、许可、来源及发现元数据，没有额外命令。 */
  test.each(["web", "extension"] as const)(
    "installs missing support into %s only",
    async (host) => {
      const root = await seedTemplateRoot()
      const commands: string[] = []
      const bundle = await loadDesignSkillBundle(root)
      expect(await inspectDesignSkill(root)).toBe("missing")
      await initializeProject(options(root, host), undefined, async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`)
      })
      expect(commands).toEqual([])
      for (const [name, bytes] of bundle) {
        expect(await readFile(path.join(root, DESIGN_SKILL_PATH, name))).toEqual(Buffer.from(bytes))
      }
      const receipt = JSON.parse(
        await readFile(path.join(root, DESIGN_SKILL_PATH, "UPSTREAM.json"), "utf8")
      )
      expect(receipt.commit).toBe(DESIGN_SKILL_COMMIT)
      expect(
        createHash("sha256")
          .update(await readFile(path.join(root, DESIGN_SKILL_PATH, "SKILL.md")))
          .digest("hex")
      ).toBe(receipt.sha256["SKILL.md"])
      expect(await inspectDesignSkill(root)).toBe("present")
      expect(await prepareDesignSkillInstallation(root)).toHaveProperty("size", 0)
      expect(
        await readFile(path.join(root, DESIGN_SKILL_PATH, "agents/openai.yaml"), "utf8")
      ).toContain("先遵循 AGENTS.md 和 docs/MANTINE_UI_GUIDELINES.md")
      expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain(
        "$design-taste-frontend"
      )
      expect(await readFile(path.join(root, "docs/MANTINE_UI_GUIDELINES.md"), "utf8")).toContain(
        "不授权依赖安装"
      )
      await expect(lstat(path.join(root, DESIGN_SKILL_BUNDLE_PATH))).rejects.toThrow()
      await expect(
        lstat(path.join(root, ".harness/tooling/install-design-skill.ts"))
      ).rejects.toThrow()
    }
  )

  /** 验证有效已有版本与辅助文件逐字保留，即使没有 Harness 来源记录也不重新安装。 */
  test("preserves an existing valid local skill and its companion files", async () => {
    const root = await seedTemplateRoot()
    await mkdir(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
    await writeFile(path.join(root, DESIGN_SKILL_PATH, "SKILL.md"), EXISTING_SKILL)
    await writeFile(path.join(root, DESIGN_SKILL_PATH, "notes.txt"), "user notes\n")
    await initializeProject(options(root, "web"))
    expect(await readFile(path.join(root, DESIGN_SKILL_PATH, "SKILL.md"), "utf8")).toBe(
      EXISTING_SKILL
    )
    expect(await readFile(path.join(root, DESIGN_SKILL_PATH, "notes.txt"), "utf8")).toBe(
      "user notes\n"
    )
    expect((await readdir(path.join(root, DESIGN_SKILL_PATH))).sort()).toEqual([
      "SKILL.md",
      "notes.txt"
    ])
  })

  /** 验证旧两类下游升级时可保持缺失，存在但损坏的支持 Skill 仍被维护门禁拒绝。 */
  test.each(["web", "extension"] as const)(
    "accepts an older %s project without design support",
    async (host) => {
      const root = await seedTemplateRoot()
      const config = await initializeProject(options(root, host))
      await rm(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
      const missingErrors: string[] = []
      await validateTerminalSkills(root, config, missingErrors)
      expect(missingErrors).toEqual([])
      await mkdir(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
      await writeFile(
        path.join(root, DESIGN_SKILL_PATH, "SKILL.md"),
        EXISTING_SKILL.replace("name: design-taste-frontend", "name: invalid-skill")
      )
      const invalidErrors: string[] = []
      await validateTerminalSkills(root, config, invalidErrors)
      expect(invalidErrors).toEqual([
        expect.stringContaining("Invalid project design Skill identity")
      ])
    }
  )

  /** 验证常见 YAML 折叠、引号和单字描述可正确识别，不误拒绝用户已有 Skill。 */
  test.each([
    'name: "design-taste-frontend" # local\ndescription: >-\n  User maintained\n  design guidance.',
    "name: 'design-taste-frontend'\ndescription: |\n  用户维护的设计建议。",
    "name: design-taste-frontend\ndescription: 风"
  ])("accepts existing YAML string forms: %s", async (identity) => {
    const root = await seedTemplateRoot()
    await mkdir(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
    const source = `---\n${identity}\n---\n\n# Existing design skill\n`
    await writeFile(path.join(root, DESIGN_SKILL_PATH, "SKILL.md"), source)
    expect(await prepareDesignSkillInstallation(root)).toHaveProperty("size", 0)
    expect(await readFile(path.join(root, DESIGN_SKILL_PATH, "SKILL.md"), "utf8")).toBe(source)
  })

  /** 验证重复字段、混用引号和无效描述不能伪装成有效已有版本绕过补装门禁。 */
  test.each([
    "name: design-taste-frontend\nname: another-skill\ndescription: Guidance",
    "name: 'design-taste-frontend\"\ndescription: Guidance",
    'name: design-taste-frontend\ndescription: ""',
    'name: design-taste-frontend\ndescription: "Unclosed',
    "name: design-taste-frontend\ndescription: true"
  ])("rejects malformed YAML identity: %s", async (identity) => {
    const root = await seedTemplateRoot()
    await mkdir(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
    await writeFile(
      path.join(root, DESIGN_SKILL_PATH, "SKILL.md"),
      `---\n${identity}\n---\n\n# Invalid skill\n`
    )
    await expect(prepareDesignSkillInstallation(root)).rejects.toThrow(
      "Invalid project design Skill identity"
    )
    const errors: string[] = []
    await validateDesignSkill(root, errors)
    expect(errors).toHaveLength(1)
  })

  /** 验证身份错误或非目录占位在初始化生成内容前失败，不覆盖已有文件。 */
  test.each(["wrong-name", "file"])("rejects invalid existing support: %s", async (kind) => {
    const root = await seedTemplateRoot()
    if (kind === "file") {
      await writeFile(path.join(root, DESIGN_SKILL_PATH), "user file")
    } else {
      await mkdir(path.join(root, DESIGN_SKILL_PATH), { recursive: true })
      await writeFile(
        path.join(root, DESIGN_SKILL_PATH, "SKILL.md"),
        EXISTING_SKILL.replace("name: design-taste-frontend", "name: another-skill")
      )
    }
    await expect(initializeProject(options(root, "web"))).rejects.toThrow(
      /Design Skill|design Skill/u
    )
    await expect(lstat(path.join(root, ".harness/project.json"))).rejects.toThrow()
    const errors: string[] = []
    await validateDesignSkill(root, errors)
    expect(errors.length).toBeGreaterThan(0)
  })

  /** 验证文件哈希与来源同时伪造仍被独立的固定哈希拒绝。 */
  test("rejects a changed bundle even when its receipt claims the new hash", async () => {
    const root = await seedTemplateRoot()
    const skillFile = path.join(root, DESIGN_SKILL_BUNDLE_PATH, "SKILL.md")
    const receiptFile = path.join(root, DESIGN_SKILL_BUNDLE_PATH, "UPSTREAM.json")
    await writeFile(skillFile, EXISTING_SKILL)
    const receipt = JSON.parse(await readFile(receiptFile, "utf8"))
    receipt.sha256["SKILL.md"] = createHash("sha256").update(EXISTING_SKILL).digest("hex")
    await writeFile(receiptFile, JSON.stringify(receipt))
    await expect(initializeProject(options(root, "web"))).rejects.toThrow("checksum mismatch")
    await expect(lstat(path.join(root, ".harness/project.json"))).rejects.toThrow()
  })

  /** 验证远端来源或提交漂移不能被当作已锁定快照安装。 */
  test("rejects a mismatched upstream commit", async () => {
    const root = await seedTemplateRoot()
    const receiptFile = path.join(root, DESIGN_SKILL_BUNDLE_PATH, "UPSTREAM.json")
    const receipt = JSON.parse(await readFile(receiptFile, "utf8"))
    receipt.commit = "0".repeat(40)
    await writeFile(receiptFile, JSON.stringify(receipt))
    await expect(prepareDesignSkillInstallation(root)).rejects.toThrow("provenance mismatch")
  })

  /** 验证本地缺失仍报告缺失，不借用任何全局安装，非法路径链接不被跟随。 */
  test("does not follow a design skill directory symlink", async (context) => {
    const root = await seedTemplateRoot()
    const unrelatedRoot = await temporaryDirectory("design-skill-unrelated-")
    await writeFile(path.join(unrelatedRoot, "SKILL.md"), EXISTING_SKILL)
    expect(await inspectDesignSkill(root)).toBe("missing")
    try {
      await symlink(unrelatedRoot, path.join(root, DESIGN_SKILL_PATH), "dir")
    } catch (error) {
      if (
        process.platform === "win32" &&
        ["EPERM", "EACCES"].includes(String((error as { code?: unknown }).code))
      ) {
        context.skip()
        return
      }
      throw error
    }
    await expect(prepareDesignSkillInstallation(root)).rejects.toThrow("regular directory")
    expect(await readFile(path.join(unrelatedRoot, "SKILL.md"), "utf8")).toBe(EXISTING_SKILL)
  })

  /** 验证公开实例化事务在补装失败时不发布目标，也清理同级 staging 与租约。 */
  test("keeps the public target untouched when bundled support is missing", async () => {
    const sourceRoot = await seedTemplateRoot()
    await rm(path.join(sourceRoot, DESIGN_SKILL_BUNDLE_PATH, "LICENSE"))
    const parent = await temporaryDirectory("design-skill-atomic-")
    const targetRoot = path.join(parent, "aurora-notes")
    const init = options(targetRoot, "web")
    await expect(instantiateProject({ sourceRoot, targetRoot, init })).rejects.toThrow("LICENSE")
    expect(await readdir(parent)).toEqual([])
  })

  /** 验证升级将用户设计版本归为 protected，不被 canonical 工程更新覆盖。 */
  test("protects the installed skill during Harness upgrades", async () => {
    const manifest = validateOwnershipManifest(
      JSON.parse(
        await readFile(
          path.join(
            repositoryRoot,
            ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
          ),
          "utf8"
        )
      )
    )
    expect(ownershipRule(`${DESIGN_SKILL_PATH}/SKILL.md`, manifest)?.mode).toBe("protected")
    expect(ownershipRule(`${DESIGN_SKILL_PATH}/notes.txt`, manifest)?.mode).toBe("protected")
  })
})
