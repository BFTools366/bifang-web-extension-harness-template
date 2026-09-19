import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { validateOptionalProjectMemory } from "../.harness/tooling/project-memory.ts"
import { validateDailyHarnessMemory } from "../scripts/harness-validation/memory.ts"

/** 保存真实仓库根。 */
const repositoryRoot = path.resolve(import.meta.dirname, "..")
/** 保存需要回收的临时根。 */
const temporaryRoots: string[] = []

/** 复制当前 docs 记忆到隔离测试根。 */
async function copyMemory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-harness-memory-"))
  temporaryRoots.push(root)
  await cp(path.join(repositoryRoot, "docs"), path.join(root, "docs"), { recursive: true })
  return root
}

/** 返回一次记忆校验的全部稳定错误。 */
async function memoryErrors(root: string): Promise<string[]> {
  const errors: string[] = []
  await validateDailyHarnessMemory(root, errors)
  return errors
}

/** 在隔离计划中确定性制造一个未完成 Todo，不依赖真实计划当前阶段。 */
function withUnfinishedTodo(plan: string): string {
  const changed = plan.replace(
    /^(?<prefix>\|\s*[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\s*\|)\s*done\s*\|/mu,
    "$<prefix> pending |"
  )
  if (changed === plan) throw new Error("fixture Work Plan has no completed Todo to reopen")
  return changed
}

/** 创建一个带真实 .harness 目录的可选项目记忆测试根。 */
async function createOptionalMemoryRoot(): Promise<string> {
  // 保存 root 变量供隔离可选记忆测试使用。
  const root = await mkdtemp(path.join(os.tmpdir(), "optional-project-memory-"))
  temporaryRoots.push(root)
  await mkdir(path.join(root, ".harness"), { recursive: true })
  return root
}

/** 写入可选项目记忆兼容清单。 */
async function writeCompatibilityManifest(root: string, grandfatheredPath: string): Promise<void> {
  await writeFile(
    path.join(root, ".harness/project-memory-compatibility.json"),
    `${JSON.stringify({ schemaVersion: 1, grandfatheredPaths: [grandfatheredPath] })}\n`
  )
}

/** 返回可选下游项目记忆验证产生的稳定错误。 */
async function optionalMemoryErrors(root: string): Promise<string[]> {
  // 保存 errors 变量供收集全部可选记忆错误使用。
  const errors: string[] = []
  await validateOptionalProjectMemory(root, errors)
  return errors
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("daily Harness memory", () => {
  /** 验证当前五类索引和唯一快照完整。 */
  test("accepts one current snapshot for every memory type", async () => {
    await expect(memoryErrors(repositoryRoot)).resolves.toEqual([])
  })

  /** 验证同类多份日期快照和非法名称都会被拒绝。 */
  test("rejects duplicate or invalid dated snapshots", async () => {
    const root = await copyMemory()
    await writeFile(path.join(root, "docs/product_spec/20260908_product_spec.md"), "# stale\n")
    await writeFile(path.join(root, "docs/work_plan/legacy.md"), "# invalid\n")

    await expect(memoryErrors(root)).resolves.toEqual(
      expect.arrayContaining([
        expect.stringContaining("Product Spec must retain exactly one"),
        expect.stringContaining("invalid daily Work Plan filename")
      ])
    )
  })

  /** 验证索引必须引用当前正文并保留触发边界。 */
  test("rejects a weakened memory index", async () => {
    const root = await copyMemory()
    const indexPath = path.join(root, "docs/changelog/README.md")
    const index = await readFile(indexPath, "utf8")
    await writeFile(indexPath, index.replace("普通缺陷修复、行为保持重构", "一般维护"))

    await expect(memoryErrors(root)).resolves.toContain(
      "daily Changelog index is missing rule: 普通缺陷修复、行为保持重构"
    )
  })

  /** 验证符号链接目录不能冒充受管记忆根。 */
  test("rejects a symbolic-link memory directory", async () => {
    const root = await copyMemory()
    const source = path.join(root, "docs/product_spec")
    const alias = path.join(root, "docs/project_status")
    await rm(alias, { recursive: true })
    await symlink(source, alias)

    await expect(memoryErrors(root)).resolves.toContain(
      "missing or unsafe daily Product Status directory: docs/project_status"
    )
  })

  /** 验证未完成 Todo 与 accepted 候选验收结论不能并存。 */
  test("rejects acceptance verdicts while a Work Plan Todo is unfinished", async () => {
    const root = await copyMemory()
    const planPath = path.join(root, "docs/work_plan/20260909_work_plan.md")
    const plan = await readFile(planPath, "utf8")
    await writeFile(planPath, `${withUnfinishedTodo(plan)}\n验收状态：Milestone accepted。\n`)

    await expect(memoryErrors(root)).resolves.toContainEqual(
      expect.stringContaining("unfinished Todo must not record an acceptance/readiness verdict")
    )
  })

  /** 验证中文发布就绪结论属于同一未完成计划矛盾。 */
  test("rejects equivalent readiness verdicts while a Work Plan Todo is unfinished", async () => {
    const root = await copyMemory()
    const planPath = path.join(root, "docs/work_plan/20260909_work_plan.md")
    const plan = await readFile(planPath, "utf8")
    await writeFile(planPath, `${withUnfinishedTodo(plan)}\n发布就绪：可发布。\n`)

    await expect(memoryErrors(root)).resolves.toContainEqual(
      expect.stringContaining("unfinished Todo must not record an acceptance/readiness verdict")
    )
  })

  /** 验证 Todo 全部完成时不把未来验收门禁误判为状态矛盾。 */
  test("allows an acceptance verdict after every Work Plan Todo is done", async () => {
    const root = await copyMemory()
    const planPath = path.join(root, "docs/work_plan/20260909_work_plan.md")
    const plan = await readFile(planPath, "utf8")
    await writeFile(
      planPath,
      `${plan.replaceAll("in_progress", "done").replaceAll("pending", "done")}\n验收状态：accepted\n`
    )

    await expect(memoryErrors(root)).resolves.toEqual([])
  })
})

describe("optional project-memory compatibility safety", () => {
  /** 验证索引必须包含精确 Markdown 链接，并支持合法 URL 编码文件名。 */
  test("requires an exact Markdown link target", async () => {
    // 保存 substringRoot 与 substringDirectory 变量供拒绝文件名子串伪索引使用。
    const substringRoot = await createOptionalMemoryRoot()
    const substringDirectory = path.join(substringRoot, "docs/product_spec")
    await mkdir(substringDirectory, { recursive: true })
    await writeFile(path.join(substringDirectory, "legacy.md"), "# Memory\n")
    await writeFile(path.join(substringDirectory, "README.md"), "[Wrong](./not-legacy.md.bak)\n")
    await writeCompatibilityManifest(substringRoot, "docs/product_spec/legacy.md")
    await expect(optionalMemoryErrors(substringRoot)).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/missing from index/)])
    )

    // 保存 encodedRoot 与 encodedDirectory 变量供验证 URL 编码的精确链接使用。
    const encodedRoot = await createOptionalMemoryRoot()
    const encodedDirectory = path.join(encodedRoot, "docs/product_spec")
    await mkdir(encodedDirectory, { recursive: true })
    await writeFile(path.join(encodedDirectory, "legacy spec.md"), "# Memory\n")
    await writeFile(path.join(encodedDirectory, "README.md"), "[Legacy](./legacy%20spec.md)\n")
    await writeCompatibilityManifest(encodedRoot, "docs/product_spec/legacy spec.md")
    await expect(optionalMemoryErrors(encodedRoot)).resolves.toEqual([])
  })

  /** 验证 docs 与 .harness 祖先目录都不能通过符号链接逃逸仓库根。 */
  test("rejects symlinked compatibility ancestors", async () => {
    // 保存 docsRoot 与 externalDocs 变量供构造仓库外项目记忆使用。
    const docsRoot = await createOptionalMemoryRoot()
    const externalDocs = await mkdtemp(path.join(os.tmpdir(), "optional-memory-external-docs-"))
    temporaryRoots.push(externalDocs)
    await mkdir(path.join(externalDocs, "product_spec"), { recursive: true })
    await writeFile(path.join(externalDocs, "product_spec/legacy.md"), "# External\n")
    await writeFile(path.join(externalDocs, "product_spec/README.md"), "[Legacy](./legacy.md)\n")
    await symlink(externalDocs, path.join(docsRoot, "docs"))
    await writeCompatibilityManifest(docsRoot, "docs/product_spec/legacy.md")
    await expect(optionalMemoryErrors(docsRoot)).resolves.toContain(
      "Unsafe optional project-memory directory: docs"
    )

    // 保存 harnessRoot 与 externalHarness 变量供拒绝清单祖先符号链接使用。
    const harnessRoot = await mkdtemp(path.join(os.tmpdir(), "optional-memory-harness-link-"))
    const externalHarness = await mkdtemp(path.join(os.tmpdir(), "optional-memory-harness-"))
    temporaryRoots.push(harnessRoot, externalHarness)
    // 保存 harnessMemoryDirectory 变量供创建仓库内正文与索引使用。
    const harnessMemoryDirectory = path.join(harnessRoot, "docs/product_spec")
    await mkdir(harnessMemoryDirectory, { recursive: true })
    await writeFile(path.join(harnessMemoryDirectory, "legacy.md"), "# Memory\n")
    await writeFile(path.join(harnessMemoryDirectory, "README.md"), "[Legacy](./legacy.md)\n")
    await writeFile(
      path.join(externalHarness, "project-memory-compatibility.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        grandfatheredPaths: ["docs/product_spec/legacy.md"]
      })}\n`
    )
    await symlink(externalHarness, path.join(harnessRoot, ".harness"))
    await expect(optionalMemoryErrors(harnessRoot)).resolves.toContain(
      "Unsafe project-memory compatibility directory: .harness"
    )
  })
})
