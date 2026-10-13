import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { runPrototypeReview } from "../.agents/skills/web-design-prototype/scripts/prototype-review.ts"

const roots: string[] = []
const prd = "docs/product_spec/20261009_product_spec.md"
const prototype = "docs/prototypes/settings/v1/prototype.html"
const record = "docs/prototypes/settings/review.json"

/** 创建单一桌面原型及已确认 PRD，验证真实登记和核验行为。 */
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
  await mkdir(path.dirname(path.join(root, prototype)), { recursive: true })
  await writeFile(path.join(root, prd), "# 设置需求\n\n状态：Approved\n\n用户确认本轮范围。\n")
  await writeFile(
    path.join(root, prototype),
    '<!doctype html><html lang="zh"><title>桌面设置</title><button>保存</button></html>'
  )
  return root
}

/** 登记恰好一个原型；异常测试可提供其他路径或参数数量。 */
function prepare(root: string, paths: readonly string[] = [prototype], scope = "settings") {
  return runPrototypeReview(["prepare", scope, prd, ...paths], root)
}

/** 在同一范围核验原型，或执行需要明确拒绝的旧命令。 */
function review(root: string, command = "check", ...args: string[]) {
  return runPrototypeReview([command, "settings", ...args], root)
}

/** 失败的首次登记不得留下评审记录。 */
async function expectNoReview(root: string): Promise<void> {
  await expect(readFile(path.join(root, record))).rejects.toThrow()
}

/** Windows 无符号链接权限时仅跳过对应边界用例。 */
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

describe("single desktop prototype workflow", () => {
  /** 草稿、正文示例、重复及冲突状态不能替代需求确认。 */
  test.each([
    "状态：Draft\n",
    "# PRD\n\n状态：Draft\n\n## 示例\n```markdown\n状态：Approved\n```\n",
    "# PRD\n\n状态：Draft\n```markdown\n状态：Approved\n```\n",
    "# PRD\n\n状态：Approved\n状态：Draft\n"
  ])("rejects misleading approval text in the PRD: %s", async (source) => {
    const root = await fixture()
    await writeFile(path.join(root, prd), source)
    await expect(prepare(root)).rejects.toThrow(/用户确认 PRD/)
    await expectNoReview(root)
  })

  /** 两宿主均可在单原型登记后直接核验，不制造用户选择或确认状态。 */
  test.each(["web", "extension"] as const)(
    "binds one %s desktop prototype without a selection step",
    async (projectType) => {
      const root = await fixture(projectType)
      const prepared = await prepare(root)
      expect(prepared).toMatchObject({
        schemaVersion: 2,
        projectType,
        scope: "settings",
        revision: "v1",
        layout: "desktop"
      })
      expect(prepared.prototype.path).toBe(prototype)
      expect(prepared.prototype.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(prepared.prd.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(prepared).not.toHaveProperty("candidates")
      expect(prepared).not.toHaveProperty("selection")
      expect(prepared).not.toHaveProperty("state")
      const before = await readFile(path.join(root, record), "utf8")
      expect(await review(root)).toEqual(prepared)
      expect(await readFile(path.join(root, record), "utf8")).toBe(before)
      expect(JSON.parse(before)).toEqual(prepared)
    }
  )

  /** 需求或原型漂移仍阻断开发，显式重新自查登记后无需选择步骤。 */
  test.each([prd, prototype])("rejects a changed review input: %s", async (file) => {
    const root = await fixture()
    await prepare(root)
    const before = await readFile(path.join(root, record), "utf8")
    await writeFile(
      path.join(root, file),
      `${await readFile(path.join(root, file), "utf8")}\n修改\n`
    )
    await expect(review(root)).rejects.toThrow(/已变化/)
    expect(await readFile(path.join(root, record), "utf8")).toBe(before)
    const refreshed = await prepare(root)
    expect(await review(root)).toEqual(refreshed)
  })

  /** 每次登记严格一个 HTML，拒绝零文件、多个和重复参数且保持零写入。 */
  test.each([
    { paths: [] },
    { paths: [prototype, prototype] },
    { paths: [prototype, "docs/prototypes/settings/v1/alternative.html"] }
  ])("rejects non-single prototype arguments: $paths", async ({ paths }) => {
    const root = await fixture()
    await expect(prepare(root, paths)).rejects.toThrow(/恰好一个/)
    await expectNoReview(root)
  })

  /** 原 select 命令不再存在，不能恢复旧选择流程或改写已登记原型。 */
  test("rejects the removed selection command and extra check arguments", async () => {
    const root = await fixture()
    await prepare(root)
    const before = await readFile(path.join(root, record), "utf8")
    await expect(review(root, "select", "a", "选 A")).rejects.toThrow(/仅支持 prepare\/check/)
    await expect(review(root, "check", "extra")).rejects.toThrow(/不接受额外参数/)
    expect(await readFile(path.join(root, record), "utf8")).toBe(before)
  })

  /** 源模板身份不能登记产品内容，失败不创建业务记录。 */
  test("rejects source roots before writing business records", async () => {
    const root = await fixture()
    await rm(path.join(root, ".harness/project.json"))
    await expect(prepare(root)).rejects.toThrow()
    await expectNoReview(root)
  })

  /** 缺失、空文件或目录都不是可交付原型。 */
  test("rejects missing, empty or non-file artifacts", async () => {
    const root = await fixture()
    await expect(prepare(root, ["docs/prototypes/settings/v1/missing.html"])).rejects.toThrow()
    await writeFile(path.join(root, prototype), "")
    await expect(prepare(root)).rejects.toThrow(/must not be empty/)
    await rm(path.join(root, prototype))
    await mkdir(path.join(root, prototype))
    await expect(prepare(root)).rejects.toThrow(/regular file/)
    await expectNoReview(root)
  })

  /** 新产品规格出现后，旧摘要不能继续代表当前已确认需求。 */
  test("invalidates a review when a newer Product Spec appears", async () => {
    const root = await fixture()
    await prepare(root)
    await writeFile(
      path.join(root, "docs/product_spec/20261010_product_spec.md"),
      "状态：Approved\n新范围\n"
    )
    await expect(review(root)).rejects.toThrow(/最新产品规格/)
  })

  /** 原型路径仍限定当前范围、规范版本和仓库内普通路径。 */
  test("rejects path escape, foreign scopes and invalid revisions", async () => {
    const root = await fixture()
    for (const file of [
      "docs/prototypes/other/v1/a.html",
      "docs/prototypes/settings/v0/a.html",
      "../outside.html",
      "/outside.html",
      "docs\\prototypes\\settings\\v1\\a.html"
    ]) {
      await expect(prepare(root, [file])).rejects.toThrow()
    }
    await expect(prepare(root, [prototype], "../escape")).rejects.toThrow(/kebab-case/)
    await expectNoReview(root)
  })

  /** 损坏记录、外来身份、Mobile 或旧多方案结构不能通过新合同。 */
  test("fails closed on corrupted, foreign, mobile or obsolete records", async () => {
    const root = await fixture()
    const prepared = await prepare(root)
    for (const value of [
      "{",
      JSON.stringify({ ...prepared, projectId: "other" }),
      JSON.stringify({ ...prepared, revision: "v2" }),
      JSON.stringify({ ...prepared, layout: "mobile" }),
      JSON.stringify({ ...prepared, prototype: { path: prototype, sha256: "bad" } }),
      JSON.stringify({ ...prepared, candidates: [prepared.prototype] }),
      JSON.stringify({ ...prepared, selection: { candidateId: "a" } }),
      JSON.stringify({ ...prepared, schemaVersion: 1, state: "awaiting_selection" }),
      JSON.stringify({ ...prepared, schemaVersion: 1, state: "selected" })
    ]) {
      await writeFile(path.join(root, record), value)
      await expect(review(root)).rejects.toThrow()
      expect(await readFile(path.join(root, record), "utf8")).toBe(value)
    }
  })

  /** 符号链接不能把原型读取导向另一个文件或仓库之外。 */
  test("rejects symlink artifacts", async (context) => {
    const root = await fixture()
    const file = path.join(root, prototype)
    await rm(file)
    if (!(await trySymlink(path.join(root, prd), file))) {
      context.skip()
      return
    }
    await expect(prepare(root)).rejects.toThrow(/Symlink/)
  })
})
