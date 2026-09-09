import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  AGENTS_FORBIDDEN_DETAIL_FRAGMENTS,
  AGENTS_MAX_LINES,
  AGENTS_MAX_UTF8_BYTES,
  AGENTS_REQUIRED_FRAGMENTS,
  validateAgentsEntrypoint
} from "../scripts/harness-validation/agents-entrypoint.ts"

/** 保存真实仓库根。 */
const repositoryRoot = path.resolve(import.meta.dirname, "..")
/** 保存需要回收的临时根。 */
const temporaryRoots: string[] = []

/** 建立只包含指定 Agent 入口字节的隔离根。 */
async function entrypointRoot(contents: string | Uint8Array): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-harness-agents-entrypoint-"))
  temporaryRoots.push(root)
  await writeFile(path.join(root, "AGENTS.md"), contents)
  return root
}

/** 返回一次根 Agent 入口验证的全部稳定错误。 */
async function entrypointErrors(root: string): Promise<string[]> {
  const errors: string[] = []
  await validateAgentsEntrypoint(root, errors)
  return errors
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("root AGENTS progressive-disclosure entrypoint", () => {
  /** 验证真实入口满足 UTF-8、预算、章节与渐进路由契约。 */
  test("accepts the lightweight repository entrypoint", async () => {
    await expect(entrypointErrors(repositoryRoot)).resolves.toEqual([])
  })

  /** 验证无效 UTF-8 字节不能进入后续文本规则。 */
  test("rejects invalid UTF-8", async () => {
    const root = await entrypointRoot(new Uint8Array([0xc3, 0x28]))
    await expect(entrypointErrors(root)).resolves.toContainEqual(
      expect.stringContaining("must be UTF-8")
    )
  })

  /** 验证字节和行数两个轻量预算各自独立生效。 */
  test("rejects UTF-8 byte and physical-line budget regressions", async () => {
    const source = await readFile(path.join(repositoryRoot, "AGENTS.md"), "utf8")
    const bytesRoot = await entrypointRoot(
      `${source}${"x".repeat(AGENTS_MAX_UTF8_BYTES - Buffer.byteLength(source) + 1)}`
    )
    await expect(entrypointErrors(bytesRoot)).resolves.toContainEqual(
      expect.stringContaining("UTF-8 byte budget")
    )

    const lineRoot = await entrypointRoot(
      `${source.trimEnd()}\n${Array.from({ length: AGENTS_MAX_LINES + 1 }, (_, index) => `extra-${index}`).join("\n")}\n`
    )
    await expect(entrypointErrors(lineRoot)).resolves.toContainEqual(
      expect.stringContaining("line budget")
    )
  })

  /** 验证章节外壳不能代替必需的渐进扩读语义。 */
  test("rejects a missing progressive-disclosure fragment", async () => {
    const source = await readFile(path.join(repositoryRoot, "AGENTS.md"), "utf8")
    const fragment = AGENTS_REQUIRED_FRAGMENTS[2]
    const root = await entrypointRoot(source.replace(fragment, ""))
    await expect(entrypointErrors(root)).resolves.toContain(
      `AGENTS progressive-disclosure contract missing: ${fragment}`
    )
  })

  /** 验证详细初始化、构建、发布或验收配方不能回流到根入口。 */
  test("rejects copied implementation-level governed rules", async () => {
    const source = await readFile(path.join(repositoryRoot, "AGENTS.md"), "utf8")
    const fragment = AGENTS_FORBIDDEN_DETAIL_FRAGMENTS[1]
    const root = await entrypointRoot(`${source}\n${fragment}\n`)
    await expect(entrypointErrors(root)).resolves.toContain(
      `AGENTS entrypoint duplicates detailed governed rules: ${fragment}`
    )
  })
})
