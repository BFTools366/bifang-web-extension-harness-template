import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  countSourceLines,
  inspectSourceSize,
  inspectProjectSourceSizes,
  isSourceSizePolicyExcluded
} from "../.harness/tooling/source-size-policy.ts"

/** 创建具有精确物理行数的测试源码。 */
function sourceWithLines(lines: number): string {
  return Array.from(
    { length: lines },
    /* 为每一行生成稳定内容。 */ (_, index) => `line ${index + 1}`
  ).join("\n")
}

describe("source size policy", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  /** 验证 counts empty, LF, CRLF, and trailing-newline sources consistently 场景。 */
  test("counts empty, LF, CRLF, and trailing-newline sources consistently", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(countSourceLines("")).toBe(0)
    expect(countSourceLines("one")).toBe(1)
    expect(countSourceLines("one\ntwo\n")).toBe(2)
    expect(countSourceLines("one\r\ntwo\r\n")).toBe(2)
  })

  /** 验证 uses 500 as the review boundary and rejects from 601 lines 场景。 */
  test("uses 500 as the review boundary and rejects from 601 lines", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(500))).toBeUndefined()
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(501))).toEqual({
      file: "src/feature.ts",
      lines: 501,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(599))).toEqual({
      file: "src/feature.ts",
      lines: 599,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(600))).toEqual({
      file: "src/feature.ts",
      lines: 600,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(601))).toEqual({
      file: "src/feature.ts",
      lines: 601,
      severity: "error"
    })
  })

  /** 验证 excludes generated and external paths without hiding maintained source 场景。 */
  test("excludes generated and external paths without hiding maintained source", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(isSourceSizePolicyExcluded("src/routeTree.gen.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("src/data/api/graphql/generated/graphql.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("dist/assets/app.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("src/feature.gen.ts")).toBe(false)
    expect(isSourceSizePolicyExcluded("src/features/generated-report.ts")).toBe(false)
  })
  /** 验证扫描器将 JS、样式和 HTML 与 TypeScript 一并纳入 600 行门禁。 */
  test("enforces the limit across maintained Node and frontend code", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "source-size-code-"))
    try {
      for (const file of ["tool.mjs", "styles.css", "index.html"]) {
        await writeFile(path.join(root, file), sourceWithLines(601))
      }
      await writeFile(path.join(root, "allowed.ts"), sourceWithLines(600))
      const findings = await inspectProjectSourceSizes(root)
      expect(
        findings.filter((finding) => finding.severity === "error").map((finding) => finding.file)
      ).toEqual(["index.html", "styles.css", "tool.mjs"])
      expect(findings.find((finding) => finding.file === "allowed.ts")?.severity).toBe("review")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
