import { describe, expect, test } from "vitest"
import {
  countSourceLines,
  inspectSourceSize,
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

  /** 验证 uses 500 as the review boundary and rejects from 1001 lines 场景。 */
  test("uses 500 as the review boundary and rejects from 1001 lines", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(500))).toBeUndefined()
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(501))).toEqual({
      file: "src/feature.ts",
      lines: 501,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(999))).toEqual({
      file: "src/feature.ts",
      lines: 999,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(1000))).toEqual({
      file: "src/feature.ts",
      lines: 1000,
      severity: "review"
    })
    expect(inspectSourceSize("src/feature.ts", sourceWithLines(1001))).toEqual({
      file: "src/feature.ts",
      lines: 1001,
      severity: "error"
    })
  })

  /** 验证 excludes generated and external paths without hiding maintained source 场景。 */
  test("excludes generated and external paths without hiding maintained source", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(isSourceSizePolicyExcluded("src/routeTree.gen.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("src/api/graphql/generated/graphql.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("dist/assets/app.ts")).toBe(true)
    expect(isSourceSizePolicyExcluded("src/feature.gen.ts")).toBe(false)
    expect(isSourceSizePolicyExcluded("src/features/generated-report.ts")).toBe(false)
  })
})
