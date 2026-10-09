import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { runPrototypeReview } from "../.agents/skills/web-design-prototype/scripts/prototype-review.ts"

const roots: string[] = []
const prd = "docs/product_spec/20261009_product_spec.md"
const candidates: [string, string] = [
  "docs/prototypes/settings/v1/a.html",
  "docs/prototypes/settings/v1/b.html"
]
const [candidateA, candidateB] = candidates

/** 创建与 UI 无关的下游需求和原型 fixture，验证真实选择文件行为。 */
async function fixture(projectType: "web" | "extension" = "web"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "prototype-workflow-"))
  roots.push(root)
  await mkdir(path.join(root, ".harness"))
  await writeFile(
    path.join(root, ".harness/project.json"),
    JSON.stringify(
      createProjectConfig({
        projectType,
        name: "Review Fixture",
        id: "review-fixture",
        description: "Prototype review fixture",
        brandColor: "#4C6EF5"
      })
    )
  )
  await mkdir(path.join(root, "docs/product_spec"), { recursive: true })
  await mkdir(path.join(root, "docs/prototypes/settings/v1"), { recursive: true })
  await writeFile(path.join(root, prd), "# 设置需求\n\n状态：Approved\n\n用户确认本轮范围。\n")
  for (const [index, file] of candidates.entries()) {
    await writeFile(
      path.join(root, file),
      `<!doctype html><html lang="zh"><title>方案 ${index}</title><button>保存</button></html>`
    )
  }
  return root
}

/** 以 settings 范围登记 PRD 与候选；paths 可替换为异常输入。 */
function prepare(root: string, paths: readonly string[] = candidates, scope = "settings") {
  return runPrototypeReview(["prepare", scope, prd, ...paths], root)
}

/** 对 settings 范围执行 select 或 check。 */
function review(root: string, ...args: string[]) {
  return runPrototypeReview([args[0] ?? "check", "settings", ...args.slice(1)], root)
}

/** 断言失败路径没有留下评审记录。 */
async function expectNoReview(root: string): Promise<void> {
  await expect(readFile(path.join(root, "docs/prototypes/settings/review.json"))).rejects.toThrow()
}

/** 尝试创建符号链接；Windows 无权限时返回 false 供测试跳过。 */
async function trySymlink(target: string, link: string): Promise<boolean> {
  try {
    await symlink(target, link)
    return true
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined
    if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) return false
    throw error
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("downstream prototype selection", () => {
  // 验证草稿、正文示例、重复及冲突状态不能把真实草稿提升为已确认需求。
  test.each([
    "状态：Draft\n",
    "# PRD\n\n状态：Draft\n\n## 示例\n```markdown\n状态：Approved\n```\n",
    "# PRD\n\n状态：Draft\n```markdown\n状态：Approved\n```\n",
    "# PRD\n\n状态：Approved\n状态：Draft\n"
  ])("rejects misleading approval text in the PRD: %s", async (source) => {
    const root = await fixture()
    await writeFile(path.join(root, prd), source)
    await expect(prepare(root)).rejects.toThrow(/Confirm the PRD/)
    await expectNoReview(root)
  })

  // 验证两宿主都必须先选择，并在内容不变时复用准确的用户证据。
  test.each(["web", "extension"] as const)(
    "binds %s PRD and prototypes before allowing development",
    async (projectType) => {
      const root = await fixture(projectType)
      const prepared = await prepare(root)
      expect(prepared).toMatchObject({
        projectType,
        scope: "settings",
        revision: "v1",
        state: "awaiting_selection"
      })
      expect(prepared.candidates.map((item) => item.id)).toEqual(["a", "b"])
      await expect(review(root, "check")).rejects.toThrow(/Awaiting user selection/)
      const quote = "选择 settings v1 的 B，进入开发"
      await review(root, "select", "b", quote)
      const selected = await review(root, "check")
      expect(selected.selection).toMatchObject({ candidateId: "b", confirmation: quote })
      const stored = JSON.parse(
        await readFile(path.join(root, "docs/prototypes/settings/review.json"), "utf8")
      )
      expect(stored).toEqual(selected)
      expect(selected.prd.sha256).toMatch(/^[a-f0-9]{64}$/)
    }
  )

  // 验证需求或候选漂移无法复用原选择，重新登记后必须重新等用户选择。
  test.each([prd, ...candidates])("rejects a changed review input: %s", async (file) => {
    const root = await fixture()
    await prepare(root)
    await review(root, "select", "a", "选 settings v1 A")
    await writeFile(
      path.join(root, file),
      `${await readFile(path.join(root, file), "utf8")}\n修改\n`
    )
    await expect(review(root, "check")).rejects.toThrow(/changed/)
    await expect(review(root, "select", "b", "选 B")).rejects.toThrow(/changed/)
    await prepare(root)
    await expect(review(root, "check")).rejects.toThrow(/Awaiting user selection/)
  })

  // 验证源模板身份不能登记产品需求，失败不创建原型记录。
  test("rejects source roots before writing business records", async () => {
    const root = await fixture()
    await rm(path.join(root, ".harness/project.json"))
    await expect(prepare(root)).rejects.toThrow()
    await expectNoReview(root)
  })

  // 验证缺失产物及无效选择均无法取得开发资格。
  test("rejects missing artifacts and invented selection evidence", async () => {
    const root = await fixture()
    await expect(prepare(root, ["docs/prototypes/settings/v1/missing.html"])).rejects.toThrow()
    await prepare(root)
    for (const args of [
      ["z", "选不存在的 Z"],
      ["a", ""]
    ] as const) {
      await expect(review(root, "select", ...args)).rejects.toThrow(/existing candidate/)
    }
    await expect(review(root, "check")).rejects.toThrow(/Awaiting user selection/)
  })

  // 验证旧版 PRD 不能在新快照出现后继续通过开发检查。
  test("invalidates a selection when a newer Product Spec appears", async () => {
    const root = await fixture()
    await prepare(root)
    await review(root, "select", "a", "选 settings v1 A")
    await writeFile(
      path.join(root, "docs/product_spec/20261010_product_spec.md"),
      "状态：Approved\n新范围\n"
    )
    await expect(review(root, "check")).rejects.toThrow(/latest Product Spec/)
  })

  // 验证不能跨范围、跨版本、重复候选或使用仓库外输入。
  test("rejects path escape and mixed or duplicate candidate revisions", async () => {
    const root = await fixture()
    for (const paths of [
      [candidateA, candidateA],
      [candidateA, "docs/prototypes/settings/v2/b.html"],
      ["docs/prototypes/other/v1/a.html"],
      ["../outside.html"]
    ]) {
      await expect(prepare(root, paths)).rejects.toThrow()
    }
    await expect(prepare(root, candidates, "../escape")).rejects.toThrow(/kebab-case/)
    await expectNoReview(root)
  })

  // 验证损坏或伪造项目身份的记录不会作为已选方案被接受。
  test("fails closed on corrupted, foreign or inconsistent records", async () => {
    const root = await fixture()
    const prepared = await prepare(root)
    const location = path.join(root, "docs/prototypes/settings/review.json")
    for (const value of [
      "{",
      JSON.stringify({ ...prepared, projectId: "other" }),
      JSON.stringify({ ...prepared, state: "selected" }),
      JSON.stringify({ ...prepared, selection: { candidateId: "a" } })
    ]) {
      await writeFile(location, value)
      await expect(review(root, "check")).rejects.toThrow()
    }
  })

  // 验证符号链接不能把原型读取或记录写入导向仓库之外。
  test("rejects symlink artifacts", async (context) => {
    const root = await fixture()
    const candidate = path.join(root, candidateA)
    await rm(candidate)
    if (!(await trySymlink(path.join(root, candidateB), candidate))) {
      context.skip()
      return
    }
    await expect(prepare(root)).rejects.toThrow(/Symlink/)
  })
})
