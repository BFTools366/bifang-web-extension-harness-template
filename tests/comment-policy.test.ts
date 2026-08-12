import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  annotateTypeScriptSource,
  inspectChineseComments,
  isChineseCommentPolicyExcluded
} from "../.harness/tooling/comment-policy.ts"

describe("strict Chinese declaration comments", /* 执行 当前声明 函数的处理逻辑。 */ () => {
  test("accepts every governed declaration category with an adjacent Chinese comment", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
// 定义账户接口。
interface Account {
  // 描述编号字段。
  id: string
  // 描述读取方法。
  load(): void
  // 描述调用签名。
  (value: string): string
  // 描述构造签名。
  new (): Account
  // 描述索引签名。
  [key: string]: unknown
}

// 实现服务类。
class Service {
  // 保存名称字段。
  readonly name = "service"
  // 描述动态字段。
  [key: \`dynamic-\${string}\`]: unknown

  // 实现构造逻辑。
  constructor(
    /* 保存依赖字段。 */ private readonly dependency: string
  ) {}

  // 实现读取逻辑。
  read(): string {
    // 保存读取结果。
    const result = this.name
    return result
  }

  // 读取显示名称。
  get displayName(): string {
    return this.name
  }

  // 更新显示名称。
  set displayName(_value: string) {}
}

// 执行服务创建逻辑。
function createService(): Service {
  // 保存映射函数并说明其职责。
  const mapper = (value: string): string => {
    // 保存规范化结果。
    const normalized = value.trim()
    return normalized
  }
  // 遍历候选值。
  for (const value of ["service"]) mapper(value)
  // 保存可变候选值。
  let candidate = "service"
  // 保存兼容计数值。
  var legacyCount = candidate.length
  // 保存类构造器并定义对应类。
  const LocalService = class {
    // 保存本地字段。
    value = legacyCount
  }
  // 保存普通函数表达式。
  const factory = function (): Service {
    return new Service(candidate)
  }
  ;["service"].map(/* 转换当前候选值。 */ (value) => mapper(value))
  void new LocalService()
  return factory()
}
`

    expect(inspectChineseComments(source, "sample.ts")).toEqual([])
  })

  test("accepts TSX component variables, inline handlers, and handler-local variables", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
// 保存示例组件并定义渲染逻辑。
const Demo = () => (
  <button
    onClick={/* 处理按钮点击。 */ () => {
      // 保存点击标记。
      const clicked = true
      return clicked
    }}
  />
)
`

    expect(inspectChineseComments(source, "sample.tsx")).toEqual([])
  })

  test("accepts an inline callback comment after a return introducer", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
// 创建清理函数。
function createCleanup() {
  return /* 执行清理回调。 */ () => undefined
}
`

    expect(inspectChineseComments(source, "return-callback.ts")).toEqual([])
  })

  test.each([
    ["missing", "const value = 1\n"],
    ["English only", "// stores a value\nconst value = 1\n"],
    ["detached", "// 保存值。\n\nconst value = 1\n"],
    ["Chinese string", 'const value = "中文不是注释"\n'],
    ["unrelated trailing", "const first = 1 // 保存第二个值。\nconst second = 2\n"],
    ["unrelated trailing block", "const first = 1 /* 保存第二个值。 */\nconst second = 2\n"],
    ["same-line trailing block", "const first = 1; /* 保存第二个值。 */ const second = 2\n"],
    ["same-line block statement", "if (true) {} /* 保存值。 */ const value = 1\n"]
  ])(
    "rejects %s evidence",
    /* 执行 当前声明 函数的处理逻辑。 */ (_label, source) => {
      expect(inspectChineseComments(source, "invalid.ts")).not.toEqual([])
    }
  )

  test("reports interfaces, class fields, callbacks, and local variables independently", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
interface Missing { value: string }
class Broken { field = 1; method() { const local = 1 } }
const callback = () => [1].map((value) => value)
`
    // 保存 messages 变量供当前逻辑使用。
    const messages = inspectChineseComments(source, "matrix.ts").map(
      // 执行 当前声明 函数的处理逻辑。
      (violation) => violation.message
    )

    expect(messages).toContain("interface 声明必须有紧邻中文注释")
    expect(messages).toContain("interface 内部字段或成员必须有紧邻中文注释")
    expect(messages).toContain("class 内部字段必须有紧邻中文注释")
    expect(messages).toContain("class 方法或访问器必须有紧邻中文注释")
    expect(messages).toContain("变量及其函数初始化器必须有紧邻中文注释")
    expect(messages).toContain("函数或回调必须有紧邻中文注释")
    expect(messages).toContain("变量声明必须有紧邻中文注释")
  })

  test("adds deterministic comments and is idempotent", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
interface Item { id: string; label: string }
const render = (value: string) => [value].map((entry) => {
  const normalized = entry.trim()
  return normalized
})
function cleanupFactory() { return () => undefined }
`
    // 保存 annotated 变量供当前逻辑使用。
    const annotated = annotateTypeScriptSource(source, "generated.ts")

    expect(inspectChineseComments(annotated, "generated.ts")).toEqual([])
    expect(annotateTypeScriptSource(annotated, "generated.ts")).toBe(annotated)
    expect(annotated).toContain("定义 Item 接口的结构契约")
    expect(annotated).toContain("执行 当前声明 函数的处理逻辑")
  })

  test("anchors wrapped function expressions outside transparent parentheses", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 source 变量供当前逻辑使用。
    const source = `
// 执行工厂函数的逻辑。
function createFactory() {
  // 保存当前时间函数并定义默认实现。
  const now = undefined ?? (() => new Date())
  return now
}
`
    // 保存 annotated 变量供当前逻辑使用。
    const annotated = annotateTypeScriptSource(source, "wrapped.ts")
    expect(annotated).toContain("?? /* 执行 当前声明 函数的处理逻辑。 */ (() =>")
    expect(inspectChineseComments(annotated, "wrapped.ts")).toEqual([])
  })

  test("keeps generated wrapped callback comments valid after Prettier formatting", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    // 保存 root 变量供当前逻辑使用。
    const root = mkdtempSync(path.join(os.tmpdir(), "comment-policy-prettier-"))
    // 保存 filePath 变量供当前逻辑使用。
    const filePath = path.join(root, "formatted.ts")
    try {
      // 保存 source 变量供当前逻辑使用。
      const source = `
// 执行工厂函数的逻辑。
function createFactory() {
  // 保存当前时间函数并定义默认实现。
  const now = undefined ?? (() => new Date())
  interface Item { id: string; label: string }
  // 保存清理工厂并定义对应函数逻辑。
  const cleanupFactory = () => { return () => undefined }
  cleanupFactory()
  return now
}
`
      writeFileSync(filePath, annotateTypeScriptSource(source, "formatted.ts"))
      execFileSync("pnpm", ["exec", "prettier", "--write", filePath], { stdio: "ignore" })
      // 保存 formatted 变量供当前逻辑使用。
      const formatted = readFileSync(filePath, "utf8")
      expect(inspectChineseComments(formatted, "formatted.ts")).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("uses exact generated-file exclusions without hiding maintained declarations", /* 执行 当前声明 函数的处理逻辑。 */ () => {
    expect(isChineseCommentPolicyExcluded("src/routeTree.gen.ts")).toBe(true)
    expect(isChineseCommentPolicyExcluded("src/nested/routeTree.gen.ts")).toBe(false)
    expect(isChineseCommentPolicyExcluded("src/feature.gen.ts")).toBe(false)
    expect(isChineseCommentPolicyExcluded(".plasmo/index.d.ts")).toBe(true)
    expect(isChineseCommentPolicyExcluded("src/plasmo.d.ts")).toBe(false)
  })
})
