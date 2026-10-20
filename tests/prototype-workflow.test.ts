import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createProjectConfig } from "../.harness/tooling/config.ts"
import { runPrototypeReview } from "../.agents/skills/web-design-prototype/scripts/prototype-review.ts"

const roots: string[] = []
const prd = "docs/product_spec/20261009_product_spec.md"
const prototype = "docs/prototypes/settings/v1/prototype.html"
const requestSource = "用户消息：本轮设计变更"
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
  return runPrototypeReview(["prepare", scope, requestSource, prd, ...paths], root)
}

/** 在同一范围核验原型，或执行需要明确拒绝的旧命令。 */
function review(root: string, command = "check", ...args: string[]) {
  return runPrototypeReview(
    [command, "settings", ...(command === "check" && args.length === 0 ? [requestSource] : args)],
    root
  )
}

/** 完整执行展示与真实用户反馈，成功检查仍保持只读。 */
async function approveCurrent(root: string) {
  const current = JSON.parse(await readFile(path.join(root, record), "utf8"))
  await review(root, "present", current.reviewHash, "助手消息：已展示当前预览链接")
  return review(root, "approve", current.reviewHash, "确认", "用户新回复：按此设计实现")
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
  /** 未展示、新请求、旧代次或来源含糊均不能把普通开发授权变成设计批准。 */
  test("requires current preview and new user feedback", async () => {
    const root = await fixture()
    const pending = await prepare(root)
    await expect(review(root, "approve", pending.reviewHash, "yes", "新用户回复")).rejects.toThrow(
      /先展示/
    )
    await review(root, "present", pending.reviewHash, "助手展示消息")
    for (const [answer, source] of [
      ["", "新回复"],
      ["yes", ""],
      ["确认但换颜色", "新回复"],
      ["yes", requestSource],
      ["yes", "助手展示消息"]
    ]) {
      await expect(
        review(root, "approve", pending.reviewHash, answer ?? "", source ?? "")
      ).rejects.toThrow()
    }
    await expect(review(root)).rejects.toThrow(/待预览或用户反馈/)
    await review(root, "approve", pending.reviewHash, "确认", "用户新回复")
    await expect(review(root, "check", "用户消息：新的视觉要求")).rejects.toThrow(/设计请求已变化/)
    const renewed = await prepare(root)
    expect(renewed.reviewHash).not.toBe(pending.reviewHash)
    expect(renewed.presentation).toBeUndefined()
    expect(renewed.approval).toBeUndefined()
    await expect(review(root, "present", pending.reviewHash, "旧展示")).rejects.toThrow(
      /旧评审修订/
    )
    await expect(review(root)).rejects.toThrow(/待预览或用户反馈/)
  })

  /** 豁免仅接受明确跳过本次预览的用户意图，不能把 yes 或普通修改请求当豁免。 */
  test("requires explicit waiver for this prototype revision", async () => {
    const root = await fixture()
    const pending = await prepare(root)
    for (const answer of ["yes", "请改设计", "确认需求"]) {
      await expect(
        review(root, "waive", pending.reviewHash, answer, requestSource)
      ).rejects.toThrow(/明确跳过/)
    }
    await review(root, "waive", pending.reviewHash, "跳过本次预览并直接实施", "用户消息：明确跳过")
    expect((await review(root)).approval?.mode).toBe("waiver")
    await prepare(root)
    await expect(review(root)).rejects.toThrow(/待预览或用户反馈/)
  })

  /** 首版凭据绑定真实工程实例与七项范围，并且只能消费一次评审。 */
  test("initial creation authorization is scoped and single use", async () => {
    const root = await fixture()
    const config = JSON.parse(await readFile(path.join(root, ".harness/project.json"), "utf8"))
    const initialPrototype = "docs/prototypes/initial-create/v1/prototype.html"
    await mkdir(path.dirname(path.join(root, initialPrototype)), { recursive: true })
    await writeFile(path.join(root, initialPrototype), "<html><title>首版原型</title></html>")
    const scope = {
      users: "个人",
      home: "首页",
      pages: "首页",
      operations: "编辑",
      design: "单页",
      data: "内存",
      acceptance: "编辑显示"
    }
    const revision = "a".repeat(64)
    await writeFile(
      path.join(root, prd),
      `状态：Approved\n创建确认：${revision}\n创建范围：${JSON.stringify(scope)}\n`
    )
    const receiptPath = path.join(root, ".harness/initial-creation.json")
    const receipt = {
      schemaVersion: 1,
      projectId: config.id,
      projectType: config.projectType,
      initializedAt: config.initializedAt,
      authorization: { revision, source: requestSource, scope }
    }
    await writeFile(receiptPath, JSON.stringify(receipt))
    const pending = await prepare(root, [initialPrototype], "initial-create")
    await expect(
      runPrototypeReview(["initial-create", "initial-create", pending.reviewHash], root)
    ).rejects.toThrow(/先展示/)
    await runPrototypeReview(
      ["present", "initial-create", pending.reviewHash, "助手展示首版"],
      root
    )
    await writeFile(
      receiptPath,
      JSON.stringify({
        ...receipt,
        authorization: { ...receipt.authorization, scope: { ...scope, design: "不同设计" } }
      })
    )
    await expect(
      runPrototypeReview(["initial-create", "initial-create", pending.reviewHash], root)
    ).rejects.toThrow(/范围.*不匹配/)
    await writeFile(receiptPath, JSON.stringify(receipt))
    await runPrototypeReview(["initial-create", "initial-create", pending.reviewHash], root)
    expect(
      (await runPrototypeReview(["check", "initial-create", requestSource], root)).approval?.mode
    ).toBe("initial-create")
    const renewed = await prepare(root, [initialPrototype], "initial-create")
    await runPrototypeReview(["present", "initial-create", renewed.reviewHash, "第二次展示"], root)
    await expect(
      runPrototypeReview(["initial-create", "initial-create", renewed.reviewHash], root)
    ).rejects.toThrow(/不能用于后续改版/)
    await expect(
      runPrototypeReview(["check", "initial-create", requestSource], root)
    ).rejects.toThrow(/待预览或用户反馈/)
  })

  /** 普通设计批准后未使用的首版凭据也关闭，不能遗留给之后的改版。 */
  test("normal approval closes unused initial creation authorization", async () => {
    const root = await fixture()
    const receiptPath = path.join(root, ".harness/initial-creation.json")
    await writeFile(receiptPath, JSON.stringify({ schemaVersion: 1 }))
    await prepare(root)
    const approved = await approveCurrent(root)
    expect(JSON.parse(await readFile(receiptPath, "utf8")).closedByReviewHash).toBe(
      approved.reviewHash
    )
  })

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

  /** 两宿主均须经过当前预览与用户反馈才核验通过，不恢复多方案选型。 */
  test.each(["web", "extension"] as const)(
    "binds one %s desktop prototype without a selection step",
    async (projectType) => {
      const root = await fixture(projectType)
      const prepared = await prepare(root)
      expect(prepared).toMatchObject({
        schemaVersion: 3,
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
      expect(prepared.state).toBe("awaiting-preview")
      await expect(review(root)).rejects.toThrow(/待预览或用户反馈/)
      const approved = await approveCurrent(root)
      const before = await readFile(path.join(root, record), "utf8")
      expect(await review(root)).toEqual(approved)
      expect(await readFile(path.join(root, record), "utf8")).toBe(before)
      expect(JSON.parse(before)).toEqual(approved)
    }
  )

  /** 需求或原型漂移阻断开发，重新登记后须重新展示并等待反馈。 */
  test.each([prd, prototype])("rejects a changed review input: %s", async (file) => {
    const root = await fixture()
    await prepare(root)
    await approveCurrent(root)
    const before = await readFile(path.join(root, record), "utf8")
    await writeFile(
      path.join(root, file),
      `${await readFile(path.join(root, file), "utf8")}\n修改\n`
    )
    await expect(review(root)).rejects.toThrow(/已变化/)
    expect(await readFile(path.join(root, record), "utf8")).toBe(before)
    const refreshed = await prepare(root)
    await expect(review(root)).rejects.toThrow(/待预览或用户反馈/)
    expect(refreshed.approval).toBeUndefined()
    const approved = await approveCurrent(root)
    expect(await review(root)).toEqual(approved)
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
    await expect(review(root, "select", "a", "选 A")).rejects.toThrow(/不提供多方案选择/)
    await expect(review(root, "check", requestSource, "extra")).rejects.toThrow(/不接受额外参数/)
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
    await prepare(root)
    const prepared = await approveCurrent(root)
    for (const value of [
      "{",
      JSON.stringify({ ...prepared, projectId: "other" }),
      JSON.stringify({ ...prepared, revision: "v2" }),
      JSON.stringify({ ...prepared, layout: "mobile" }),
      JSON.stringify({ ...prepared, prototype: { path: prototype, sha256: "bad" } }),
      JSON.stringify({ ...prepared, candidates: [prepared.prototype] }),
      JSON.stringify({ ...prepared, selection: { candidateId: "a" } }),
      JSON.stringify({
        ...prepared,
        approval: { mode: ["preview"], answer: "任意内容", source: "新回复" }
      }),
      JSON.stringify({
        ...prepared,
        approval: { mode: "preview", answer: "yes", source: requestSource }
      }),
      JSON.stringify({ ...prepared, schemaVersion: 2 }),
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
