import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { checkExport } from "../.agents/skills/web-document-api/scripts/check-export.ts"
import { createSymlinkOrSkip } from "./setup.ts"

const roots: string[] = []

/** 建立具有跨版本聚合及双向操作关联的最小文档包。 */
async function bundle(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "api-doc-check-"))
  roots.push(root)
  const files: Record<string, string> = {
    "README.md":
      "# 导出包\n[通用](api/common.md) [元数据](api/metadata.md) [条目接口](api/items.md) [条目业务](business/items.md)",
    "api/common.md": '# 通用结构\n共享标识使用字符串，无统一封装。\n```json\n{"id":"example"}\n```',
    "api/metadata.md":
      "# API 元数据\n版本 v1、v2 均有效。\n| 操作标识 | 操作类型 | 协议 | 接口 | 业务 |\n| --- | --- | --- | --- | --- |\n| v1-items-list | 列表查询 | GraphQL | [读取](items.md#v1-items-list) | [条目](../business/items.md) |\n| v2-items-create | 写操作 | REST | [创建](items.md#v2-items-create) | [条目](../business/items.md) |\n本次全量核对，无差异。",
    "api/items.md":
      '<a id="v1-items-list"></a>\n## 接口名称\n读取条目\n## 接口说明\nGraphQL HTTP 列表查询，无筛选也使用 GraphQL。\n## Schema\n```graphql\ntype Query { items: [Item!]! }\ntype Item { id: ID! }\n```\n## 传输\nPOST /graphql\nContent-Type: application/json\n```graphql\nquery Items { items { id } }\n```\n## 响应\n```json\n{"data":{"items":[]}}\n```\n\n<a id="v2-items-create"></a>\n## 接口名称\n创建条目\n## 接口说明\nHTTP\n## 请求头\nContent-Type: application/json\n## 请求动作\nPOST /v2/items\n## 请求体\n```json\n{"label":"示例"}\n```\n## 响应体\n无响应体',
    "business/items.md":
      "# 条目管理\n## 业务目标\n创建并查看条目。\n## 调用流程\n[创建](../api/items.md#v2-items-create)成功后[读取](../api/items.md#v1-items-list)。\n## 设计思路\n从当前行为推导：重新读取以显示最新结果。"
  }
  for (const [file, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), `${source}\n`)
  }
  return root
}

/** 修改指定文档用于检查失效关联及泄漏负例。 */
async function change(
  root: string,
  file: string,
  transform: (source: string) => string
): Promise<void> {
  const target = path.join(root, file)
  await writeFile(target, transform(await readFile(target, "utf8")))
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("API and business export bundle", () => {
  /** 验证同域跨版本接口聚合、步骤与反向关系可以被实际读取。 */
  test("checks aggregated operations and exact bidirectional links", async () => {
    expect(await checkExport(await bundle())).toEqual({
      files: 5,
      apiDocuments: 1,
      businessDocuments: 1,
      operations: 2
    })
  })

  /** 验证设计、Mock、未接入和已实现列表均不能通过 REST/其他协议绕过强约定。 */
  test.each(["HTTP", "产品 API Mock", "契约未接入", "设计建议"])(
    "rejects non-GraphQL lists regardless of state: %s",
    async (state) => {
      const root = await bundle()
      await change(
        root,
        "api/metadata.md",
        (source) =>
          source.replace("| 列表查询 | GraphQL |", "| 列表查询 | REST |") +
          `\n当前列表状态：${state}。不符合项按事实保留。`
      )
      await expect(checkExport(root)).rejects.toThrow(/远端列表查询必须使用 GraphQL/)
      expect(await readFile(path.join(root, "api/metadata.md"), "utf8")).toContain(
        "| 列表查询 | REST |"
      )
    }
  )

  /** 验证未知传输也不能作为远端列表协议的自动例外。 */
  test("rejects other list protocols", async () => {
    const root = await bundle()
    await change(root, "api/metadata.md", (source) =>
      source.replace("| 列表查询 | GraphQL |", "| 列表查询 | 其他 |")
    )
    await expect(checkExport(root)).rejects.toThrow(/远端列表查询必须使用 GraphQL/)
  })

  /** 验证缺失分类的旧元数据不能被直接宣称完成强约定检查。 */
  test.each(["header", "type", "protocol"])(
    "requires explicit operation classification: %s",
    async (kind) => {
      const root = await bundle()
      await change(root, "api/metadata.md", (source) =>
        kind === "header"
          ? source.replace("操作类型", "旧分类")
          : kind === "type"
            ? source.replace("| 列表查询 |", "| 未确认 |")
            : source.replace("| GraphQL |", "| 未确认 |")
      )
      await expect(checkExport(root)).rejects.toThrow(
        /必须声明操作类型与协议|操作类型缺失或无效|协议缺失或无效/
      )
    }
  )

  /** 验证 REST 详情内含子数组不被机械当成独立远端列表查询。 */
  test("allows REST object details containing child arrays", async () => {
    const root = await bundle()
    await change(root, "api/metadata.md", (source) =>
      source.replace("| 列表查询 | GraphQL |", "| 单对象查询 | REST |")
    )
    await change(root, "api/items.md", (source) =>
      source
        .replace("GraphQL HTTP 列表查询，无筛选也使用 GraphQL。", "HTTP 单对象详情，包含子数组。")
        .replace(
          /## Schema[\s\S]*?(?=\n\n<a id="v2-items-create")/u,
          '## 请求动作\nGET /v1/items/{id}\n## 响应体\n```json\n{"id":"item-example","tags":[]}\n```'
        )
    )
    await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
  })

  /** 验证合法 HTTP 路径和 wire 文件名不会被误当作客户端源码泄漏。 */
  test("allows protocol paths and filenames in JSON payloads", async () => {
    const root = await bundle()
    await change(
      root,
      "api/items.md",
      (source) =>
        source
          .replace("POST /graphql", "POST /home/items")
          .replace('{"label":"示例"}', '{"filename":"report.js"}') +
        '\n| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束 | 示例值 |\n| --- | --- | --- | --- | --- | --- |\n| filename | string | 是 | 否 | 文件名 | "report.js" |\n'
    )
    await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
  })

  /** 验证目录外重复导航不构成重复登记或虚构业务关系。 */
  test("allows repeated operation and business navigation outside the directory", async () => {
    const root = await bundle()
    await change(
      root,
      "api/metadata.md",
      (source) =>
        `${source}\n本次更新 [读取](items.md#v1-items-list)，影响 [条目业务](../business/items.md)。`
    )
    await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
  })

  /** 验证目录行的标识、唯一性与真实接口锚点不能相互脱离。 */
  test.each(["swapped", "unknown", "duplicate"])(
    "rejects invalid operation identities: %s",
    async (kind) => {
      const root = await bundle()
      await change(root, "api/metadata.md", (source) => {
        if (kind === "swapped")
          return source
            .replace("| v1-items-list |", "| swapped |")
            .replace("| v2-items-create |", "| v1-items-list |")
            .replace("| swapped |", "| v2-items-create |")
        const id = kind === "unknown" ? "unknown-operation" : "v1-items-list"
        return source.replace(
          "本次全量",
          `| ${id} | 列表查询 | GraphQL | [读取](items.md#v1-items-list) | [条目](../business/items.md) |\n本次全量`
        )
      })
      await expect(checkExport(root)).rejects.toThrow(
        /标识与接口锚点不一致|未知操作标识|重复登记操作/
      )
    }
  )

  /** 验证围栏与行内代码中的 HTML 示例不构成真实可导航操作。 */
  test.each(["fenced", "inline", "comment"])("ignores example anchors in %s code", async (kind) => {
    const root = await bundle()
    await change(root, "api/items.md", (source) =>
      source.replace(/<a id="[a-z0-9-]+"><\/a>/gu, (anchor) =>
        kind === "fenced"
          ? `\`\`\`text\n${anchor}\n\`\`\``
          : kind === "comment"
            ? `<!-- ${anchor} -->`
            : `\`${anchor}\``
      )
    )
    await expect(checkExport(root)).rejects.toThrow(/失效链接|缺少稳定操作锚点/)
  })

  /** 验证两种 Markdown 围栏、较长闭合围栏和 CRLF 的协议示例均正确处理。 */
  test.each(["tilde", "longer", "crlf"])("accepts valid Markdown fences: %s", async (kind) => {
    const root = await bundle()
    await change(root, "api/common.md", (source) =>
      kind === "tilde"
        ? source.replaceAll("```", "~~~")
        : kind === "crlf"
          ? source.replaceAll("\n", "\r\n")
          : source.replace("```json", "````json").replace(/\n```\n$/u, "\n`````\n")
    )
    await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
  })

  /** 验证另一种围栏不能绕过 JSON、客户端代码或闭合检查。 */
  test.each(["json", "code", "attributes", "unclosed"])(
    "rejects invalid fenced content: %s",
    async (kind) => {
      const root = await bundle()
      await change(root, "api/common.md", (source) => {
        if (kind === "json")
          return source.replaceAll("```", "~~~").replace('{"id":"example"}', '{"id":}')
        if (kind === "code") return `${source}\n~~~javascript\nexport const hidden = true;\n~~~`
        if (kind === "attributes")
          return `${source}\n~~~javascript title=example\nconsole.log("hidden");\n~~~`
        return `${source}\n~~~json\n{}`
      })
      await expect(checkExport(root)).rejects.toThrow(/JSON 示例无法解析|客户端代码|围栏未闭合/)
    }
  )

  /** 验证字段表只能豁免与本页合法 wire JSON 一致的示例值。 */
  test.each([true, false])(
    "checks path-like wire examples precisely: matching=%s",
    async (matching) => {
      const root = await bundle()
      await change(
        root,
        "api/common.md",
        (source) =>
          source.replace(
            '{"id":"example"}',
            matching ? '{"asset_path":"src/images"}' : '{"asset_path":"images"}'
          ) +
          '\n| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束 | 示例值 |\n| --- | --- | --- | --- | --- | --- |\n| asset_path | string | 是 | 否 | 资源路径 | "src/images" |'
      )
      if (matching) await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
      else await expect(checkExport(root)).rejects.toThrow(/本地代码或路径/)
    }
  )

  /** 验证多个业务共同调用多个操作时仍保留完整多对多关系。 */
  test("supports many-to-many operation and business associations", async () => {
    const root = await bundle()
    await writeFile(
      path.join(root, "business/audit.md"),
      "# 复核条目\n[创建](../api/items.md#v2-items-create)后[读取](../api/items.md#v1-items-list)。"
    )
    await change(root, "README.md", (source) => `${source}\n[复核](business/audit.md)`)
    await change(root, "api/metadata.md", (source) =>
      source.replaceAll(
        "[条目](../business/items.md)",
        "[条目](../business/items.md)、[复核](../business/audit.md)"
      )
    )
    await expect(checkExport(root)).resolves.toMatchObject({ businessDocuments: 2, operations: 2 })
  })

  /** 验证无业务调用者的已定义接口不必伪造流程文档或调用关系。 */
  test("accepts adopted contracts without an implemented consumer", async () => {
    const root = await bundle()
    await rm(path.join(root, "business/items.md"))
    await change(root, "README.md", (source) =>
      source.replace("[条目业务](business/items.md)", "接口尚无调用方")
    )
    await change(root, "api/metadata.md", (source) =>
      source.replaceAll("[条目](../business/items.md)", "契约未接入；尚未形成已实现流程")
    )
    await expect(checkExport(root)).resolves.toMatchObject({ businessDocuments: 0, operations: 2 })
  })

  /** 验证分发后的检查器可以直接由 Node 执行，失败时给出非零退出码。 */
  test("runs as a standalone Node CLI and fails closed", async () => {
    const root = await bundle()
    const script = path.resolve(".agents/skills/web-document-api/scripts/check-export.ts")
    const success = spawnSync(process.execPath, [script, root], { encoding: "utf8" })
    expect(success.status).toBe(0)
    expect(success.stdout).toContain('"operations":2')
    await rm(path.join(root, "api/metadata.md"))
    const failure = spawnSync(process.execPath, [script, root], { encoding: "utf8" })
    expect(failure.status).toBe(1)
    expect(failure.stderr).toContain("缺少必需文档")
    expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(1)
  })

  /** 验证正文变化后重检不会复用旧链接结果。 */
  test("detects a removed operation still referenced by an existing business", async () => {
    const root = await bundle()
    await checkExport(root)
    await change(root, "api/items.md", (source) =>
      source.replace('id="v1-items-list"', 'id="v1-items-search"')
    )
    await expect(checkExport(root)).rejects.toThrow(/失效链接/)
  })

  /** 验证只在别的操作行登记业务不能充当当前调用的反向关系。 */
  test("requires the reverse relation on the matching operation row", async () => {
    const root = await bundle()
    await change(root, "api/metadata.md", (source) =>
      source.replace(
        "| v1-items-list | 列表查询 | GraphQL | [读取](items.md#v1-items-list) | [条目](../business/items.md) |",
        "| v1-items-list | 列表查询 | GraphQL | [读取](items.md#v1-items-list) | 当前无调用方 |"
      )
    )
    await expect(checkExport(root)).rejects.toThrow(/缺少操作 v1-items-list 的反向/)
  })

  /** 验证反向目录不能虚构业务未调用的操作。 */
  test("rejects an invented metadata to business association", async () => {
    const root = await bundle()
    await change(root, "business/items.md", (source) =>
      source.replace("[创建](../api/items.md#v2-items-create)", "本地创建")
    )
    await expect(checkExport(root)).rejects.toThrow(/缺少对应业务调用/)
  })

  /** 验证导出目录不接受碎片旧文件、缺失元数据或空文档。 */
  test.each(["legacy", "missing", "empty"])("rejects invalid layout: %s", async (kind) => {
    const root = await bundle()
    if (kind === "legacy") await writeFile(path.join(root, "client.md"), "旧工具说明")
    if (kind === "missing") await rm(path.join(root, "api/metadata.md"))
    if (kind === "empty") await writeFile(path.join(root, "business/items.md"), "\n")
    await expect(checkExport(root)).rejects.toThrow(/聚合布局|缺少必需文档|空文档/)
  })

  /** 验证合法协议路径不受影响，明显客户端路径与代码必须失败。 */
  test.each([
    "src/features/items.ts",
    "C:\\project\\items.tsx",
    "c:\\project\\items.tsx",
    "\\\\server\\share\\project\\items.tsx",
    "src\\features\\items.ts",
    "/tmp/project/items.tsx",
    "/home/example/repository/items.ts",
    "~/repository/items.ts",
    "/Users/example/code",
    "```typescript\nconst token = await read();\n```"
  ])("rejects source leakage: %s", async (leak) => {
    const root = await bundle()
    await change(root, "business/items.md", (source) => `${source}\n${leak}`)
    await expect(checkExport(root)).rejects.toThrow(/代码或路径|客户端代码/)
  })

  /** 验证损坏 JSON、遗漏索引与逃出包的链接都不会被误报通过。 */
  test.each(["json", "index", "escape", "duplicate"])(
    "rejects broken content: %s",
    async (kind) => {
      const root = await bundle()
      if (kind === "json")
        await change(root, "api/common.md", (source) =>
          source.replace('{"id":"example"}', '{"id":}')
        )
      if (kind === "index")
        await change(root, "README.md", (source) =>
          source.replace("[条目业务](business/items.md)", "条目业务")
        )
      if (kind === "escape")
        await change(root, "README.md", (source) => `${source}\n[代码](../private.md)`)
      if (kind === "duplicate")
        await change(root, "api/items.md", (source) => `${source}\n<a id="v1-items-list"></a>`)
      await expect(checkExport(root)).rejects.toThrow(
        /JSON 示例无法解析|根索引未关联|越出导出包|重复锚点/
      )
    }
  )

  /** 验证纯本地流程不被强迫设计远端接口。 */
  test("accepts local business without any remote API document", async () => {
    const root = await bundle()
    await rm(path.join(root, "api/items.md"))
    await writeFile(path.join(root, "api/metadata.md"), "# 元数据\n无远端 API，未声明版本。")
    await writeFile(
      path.join(root, "business/items.md"),
      "# 本地整理\n不调用远端 API；按名称排序以方便查找。"
    )
    await change(root, "README.md", (source) =>
      source.replace("[条目接口](api/items.md)", "无远端 API")
    )
    expect((await checkExport(root)).operations).toBe(0)
  })

  /** 验证符号链接不会让检查器读取包外源码。 */
  test("rejects symlink artifacts", async (context) => {
    const root = await bundle()
    await createSymlinkOrSkip(
      context,
      path.join(root, "api/common.md"),
      path.join(root, "api/link.md"),
      "file"
    )
    await expect(checkExport(root)).rejects.toThrow(/不允许符号链接/)
  })
})

/** 协议示例只豁免真实 wire 资源名，不能携带明显本地绝对路径或 Schema 来源。 */
test.each([
  "```graphql\n# Schema source: src/data/api/schema.graphql\ntype Query { health: String }\n```",
  "```graphql\ntype Query { health: String } # src/data/api/schema.graphql\n```",
  '```json\n{"schemaOrigin":"/Users/example/workspace/src/api/schema.graphql"}\n```',
  "> ```typescript\n> const enabled = true\n> ```",
  "    const enabled = true",
  "- ```typescript\n  export const enabled = true\n  ```"
])("rejects code and local paths inside Markdown containers: %s", async (leak) => {
  const root = await bundle()
  await change(root, "business/items.md", (source) => `${source}\n${leak}`)
  await expect(checkExport(root)).rejects.toThrow(/本地代码或路径|客户端代码|客户端实现/)
})

/** 普通重复标题使用自然序号定位，不影响稳定操作的显式锚点。 */
test("accepts links to repeated ordinary headings", async () => {
  const root = await bundle()
  await change(
    root,
    "business/items.md",
    (source) =>
      `${source}\n## Failure\n失败后重试读取。\n## Failure\n状态未知先查询。\n[第二种失败](#failure-1)`
  )
  await expect(checkExport(root)).resolves.toMatchObject({ operations: 2 })
})
