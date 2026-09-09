import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
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
