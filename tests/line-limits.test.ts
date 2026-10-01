import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  countPhysicalLines,
  inspectRepositoryLineLimits,
  lineLimitProfile
} from "../scripts/harness-validation/line-limits.ts"

const temporaryRoots: string[] = []

/** 创建具有精确物理行数的测试文本。 */
function textWithLines(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join("\n")
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("repository line-limit profiles", () => {
  /** 验证物理行数、CRLF 与末尾换行采用同一口径。 */
  test("counts physical lines consistently", () => {
    expect(countPhysicalLines("")).toBe(0)
    expect(countPhysicalLines("one\n")).toBe(1)
    expect(countPhysicalLines("one\r\ntwo\r\n")).toBe(2)
  })

  /** 验证前端源码和其他文本使用不同硬上限。 */
  test("classifies frontend and maintained text separately", () => {
    expect(lineLimitProfile("src/app.ts").hardLimit).toBe(600)
    expect(lineLimitProfile("docs/guide.md").hardLimit).toBe(2000)
  })

  /** 验证软候选不阻断、601 行前端和 2001 行文档才阻断。 */
  test("reports review candidates and hard violations at exact boundaries", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "line-limits-"))
    temporaryRoots.push(root)
    await writeFile(path.join(root, "review.ts"), textWithLines(501))
    await writeFile(path.join(root, "allowed.ts"), textWithLines(600))
    await writeFile(path.join(root, "blocked.ts"), textWithLines(601))
    await writeFile(path.join(root, "allowed.md"), textWithLines(2000))
    await writeFile(path.join(root, "blocked.md"), textWithLines(2001))
    await writeFile(path.join(root, "pnpm-lock.yaml"), textWithLines(3000))

    const report = await inspectRepositoryLineLimits(root, [
      "review.ts",
      "allowed.ts",
      "blocked.ts",
      "allowed.md",
      "blocked.md",
      "pnpm-lock.yaml"
    ])
    expect(report.reviewCandidates.map((finding) => finding.path)).toEqual([
      "allowed.md",
      "allowed.ts",
      "review.ts"
    ])
    expect(report.violations.map((finding) => finding.path)).toEqual(["blocked.md", "blocked.ts"])
    expect(report.excludedGeneratedFiles).toEqual(["pnpm-lock.yaml"])
    expect(report.ok).toBe(false)
  })
})
