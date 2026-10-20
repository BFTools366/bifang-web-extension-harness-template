import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** 保存一个包内文档及其允许关联的目标。 */
interface Document {
  file: string
  prose: string
  links: { file: string; anchor: string; row: string }[]
  anchors: Set<string>
  operations: string[]
}

/** 保存围栏内协议示例，避免其中的 HTML 或 Markdown 被当成真实导航。 */
interface CodeBlock {
  language: string
  body: string
}

/** 识别两种标准围栏及其长度，未闭合时失败而不是把示例当成正文。 */
function splitMarkdown(
  source: string,
  file: string,
  errors: string[]
): { prose: string; blocks: CodeBlock[] } {
  const prose: string[] = []
  const blocks: CodeBlock[] = []
  let fence: { marker: string; length: number; language: string; lines: string[] } | undefined
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine
      .replace(/^(?: {0,3}>[ \t]?)+/u, "")
      .replace(/^ {0,3}(?:[-+*]|\d+[.)])\s+(?=[`~]{3})/u, "")
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(line)?.[1]
      if (closing?.[0] === fence.marker && closing.length >= fence.length) {
        blocks.push({ language: fence.language, body: fence.lines.join("\n") })
        fence = undefined
      } else fence.lines.push(line)
      continue
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line)
    if (opening?.[1]) {
      fence = {
        marker: opening[1][0] ?? "",
        length: opening[1].length,
        language: ((opening[2] ?? "").trim().split(/\s+/u)[0] ?? "").toLowerCase(),
        lines: []
      }
    } else prose.push(line)
  }
  if (fence) errors.push(`${file}：代码围栏未闭合`)
  return { prose: prose.join("\n"), blocks }
}

/** file URL 协议名不区分大小写，任意写法都指向本地资源。 */
const FILE_URL_PATTERN = /file:\/\//iu
/** 远端 HTTP(S) 地址的路径属于协议值，不应被当作本地磁盘路径。 */
function withoutRemoteUrls(source: string): string {
  return source.replaceAll("\\/", "/").replace(/https?:\/\/[^\s"'<>`]+/giu, "")
}

/** 逐字符识别 GraphQL 注释，保留注释中的引号并排除字符串内的井号。 */
function graphqlComments(source: string): string {
  const comments: string[] = []
  let quoted: "string" | "block" | undefined
  for (const line of source.split("\n")) {
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (quoted !== undefined && character === "\\") {
        index += 1
        continue
      }
      if (quoted === "block") {
        if (line.startsWith('"""', index)) {
          quoted = undefined
          index += 2
        }
      } else if (quoted === "string") {
        if (character === '"') quoted = undefined
      } else if (character === "#") {
        comments.push(line.slice(index))
        break
      } else if (line.startsWith('"""', index)) {
        quoted = "block"
        index += 2
      } else if (character === '"') quoted = "string"
    }
  }
  return comments.join("\n")
}

/** 从合法 wire JSON 中收集值，只用于豁免字段表内同一个示例值。 */
function collectExampleValues(value: unknown, examples: Set<string>): void {
  const encoded = JSON.stringify(value)
  if (encoded !== undefined) examples.add(encoded)
  if (Array.isArray(value)) for (const item of value) collectExampleValues(item, examples)
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectExampleValues(item, examples)
  }
}

/** 读取本导出格式使用的简单表格单元；转义竖线不参与列拆分。 */
function tableCells(row: string): string[] {
  if (!row.trimStart().startsWith("|")) return []
  return row
    .trim()
    .replace(/^\||\|$/gu, "")
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim())
}

/** 只豁免已在 wire JSON 出现的字段表示例，其他单元仍检查源码泄漏。 */
function inspectionProse(prose: string, examples: Set<string>): string {
  return prose
    .split("\n")
    .map((row) => {
      const cells = tableCells(row)
      const sample = cells[5]?.replace(/^`|`$/gu, "")
      if (
        cells.length !== 6 ||
        !/^(?:string|number|boolean|object|array|null)$/u.test(cells[1] ?? "") ||
        sample === undefined
      )
        return row
      try {
        if (examples.has(JSON.stringify(JSON.parse(sample)))) {
          const index = row.lastIndexOf(cells[5] ?? "")
          return row.slice(0, index) + row.slice(index + (cells[5]?.length ?? 0))
        }
      } catch {
        // 非 JSON 的示例仍接受普通文本检查，不因此被当作可信 wire 数据。
      }
      return row
    })
    .join("\n")
}

/** 仅收集普通 Markdown，拒绝符号链接和未约定的交付资产。 */
async function collect(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative)
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("导出包不允许符号链接")
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`导出包不允许符号链接：${file}`)
    if (entry.isDirectory()) {
      if (relative || !["api", "business"].includes(entry.name)) {
        throw new Error(`不符合聚合布局：${file}`)
      }
      files.push(...(await collect(root, file)))
    } else if (entry.isFile() && file.endsWith(".md")) files.push(file)
    else throw new Error(`导出包只允许 Markdown：${file}`)
  }
  return files.sort()
}

/** 读取 Markdown 的显式锚点、普通内联文档关联与明显泄漏。 */
function parseDocument(file: string, source: string, errors: string[]): Document {
  if (!source.trim()) errors.push(`${file}：空文档`)
  const { prose, blocks } = splitMarkdown(source, file, errors)
  const examples = new Set<string>()
  for (const block of blocks) {
    if (block.language === "json") {
      try {
        collectExampleValues(JSON.parse(block.body), examples)
      } catch {
        errors.push(`${file}：JSON 示例无法解析`)
      }
    } else if (/^(?:[jt]sx?|typescript|javascript|bash|sh|shell|python)$/iu.test(block.language)) {
      errors.push(`${file}：包含客户端代码或执行代码`)
    }
  }
  const protocolText = withoutRemoteUrls(
    blocks
      .filter((block) => ["json", "graphql"].includes(block.language))
      .map((block) => block.body)
      .join("\n")
  )
  if (
    FILE_URL_PATTERN.test(protocolText) ||
    /(?:\/(?:Users|home|tmp|private\/var|var\/folders)\/|~[/\\]|[A-Za-z]:[/\\]|\\\\[^\\\s]+\\)/u.test(
      protocolText
    )
  )
    errors.push(`${file}：包含本地代码或路径`)
  const visibleProse = prose.replace(/<!--[\s\S]*?(?:-->|$)/gu, "")
  const navigation = visibleProse.replace(/(`+).*?\1/gu, "")
  const anchors = new Set<string>()
  const operations: string[] = []
  for (const match of navigation.matchAll(/<a\s+id="([a-z0-9]+(?:-[a-z0-9]+)*)"\s*><\/a>/gu)) {
    const id = match[1] ?? ""
    if (anchors.has(id)) errors.push(`${file}：重复锚点 ${id}`)
    anchors.add(id)
    operations.push(id)
  }
  let inspectionText =
    inspectionProse(prose, examples) +
    "\n" +
    blocks
      .filter((block) => block.language !== "json")
      .map((block) => (block.language === "graphql" ? graphqlComments(block.body) : block.body))
      .join("\n")
  inspectionText = withoutRemoteUrls(inspectionText)
  // HTTP 动作后的相对路径是协议事实，例如 GET /home/items，并非磁盘路径。
  inspectionText = inspectionText.replace(
    /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s`]+/gu,
    ""
  )
  if (
    FILE_URL_PATTERN.test(inspectionText) ||
    /(?:\b(?:src|tests|node_modules)[\\/]|\.harness[\\/]|\/(?:Users|home|tmp|private\/var|var\/folders)\/|~[\\/]|[A-Za-z]:[\\/]|\\\\[^\\\s]+\\)/u.test(
      inspectionText
    )
  ) {
    errors.push(`${file}：包含本地代码或路径`)
  }
  if (
    /^\s*(?:import\s.+\sfrom\s|export\s+(?:async\s+)?(?:function|const|class)|(?:const|let)\s+\w+\s*=)/mu.test(
      inspectionText
    )
  ) {
    errors.push(`${file}：包含客户端实现语句`)
  }
  for (const heading of visibleProse.matchAll(/^#{1,6}\s+(.+)$/gmu)) {
    const base = (heading[1] ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/gu, "-")
    let id = base
    let suffix = 0
    while (anchors.has(id)) id = `${base}-${++suffix}`
    anchors.add(id)
  }
  const links: Document["links"] = []
  for (const row of visibleProse.split("\n")) {
    for (const match of row.replace(/(`+).*?\1/gu, "").matchAll(/\[[^\]]*\]\(([^\s)]+)\)/gu)) {
      const raw = match[1] ?? ""
      if (/^https?:\/\//iu.test(raw)) continue
      let target: string
      try {
        target = decodeURIComponent(raw)
      } catch {
        errors.push(`${file}：无效链接编码`)
        continue
      }
      const [destination = "", anchor = ""] = target.split("#")
      const resolved = destination
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), destination))
        : file
      if (
        /^(?:[a-z]+:|\/|\\)/iu.test(destination) ||
        destination.includes("\\") ||
        resolved.startsWith("../")
      ) {
        errors.push(`${file}：链接越出导出包`)
        continue
      }
      links.push({ file: resolved, anchor, row })
    }
  }
  return { file, prose: visibleProse, links, anchors, operations }
}

/** 仅从操作目录表取登记，并把行标识、目标锚点和唯一性绑定到一起。 */
function operationDirectory(
  metadata: Document | undefined,
  apiDocuments: Document[],
  errors: string[]
): Document["links"] {
  const known = new Set(apiDocuments.flatMap((document) => document.operations))
  const seen = new Set<string>()
  const links: Document["links"] = []
  let inDirectory = false
  let operationTypeColumn = -1
  let protocolColumn = -1
  for (const row of metadata?.prose.split("\n") ?? []) {
    const cells = tableCells(row)
    if (["操作标识", "操作"].includes(cells[0] ?? "")) {
      inDirectory = true
      operationTypeColumn = cells.indexOf("操作类型")
      protocolColumn = cells.indexOf("协议")
      if (operationTypeColumn < 0 || protocolColumn < 0)
        errors.push("操作目录必须声明操作类型与协议")
      continue
    }
    if (!cells.length) {
      inDirectory = false
      continue
    }
    if (!inDirectory || cells.every((cell) => /^:?-+:?$/u.test(cell))) continue
    const id = cells[0]?.replace(/^`|`$/gu, "") ?? ""
    const operationType = cells[operationTypeColumn]?.replace(/^`|`$/gu, "")
    const protocol = cells[protocolColumn]?.replace(/^`|`$/gu, "")
    if (!["列表查询", "单对象查询", "写操作", "其他"].includes(operationType ?? "")) {
      errors.push(`${id}：操作类型缺失或无效`)
    }
    if (!["GraphQL", "REST", "其他"].includes(protocol ?? "")) {
      errors.push(`${id}：协议缺失或无效`)
    }
    if (operationType === "列表查询" && protocol !== "GraphQL") {
      errors.push(`${id}：远端列表查询必须使用 GraphQL；当前协议为 ${protocol ?? "未确认"}`)
    }
    if (!known.has(id)) errors.push(`元数据包含未知操作标识：${id}`)
    if (seen.has(id)) errors.push(`元数据重复登记操作：${id}`)
    seen.add(id)
    const rowLinks = metadata?.links.filter((link) => link.row === row) ?? []
    const targets = rowLinks.filter((link) =>
      apiDocuments.some((document) => document.file === link.file)
    )
    if (targets.length !== 1 || targets[0]?.anchor !== id)
      errors.push(`元数据操作标识与接口锚点不一致：${id}`)
    links.push(...rowLinks)
  }
  return links
}

/** 检查完整导出包的结构和关联；语义与源码一致性仍由执行 Agent 核对。 */
export async function checkExport(rootInput: string): Promise<{
  files: number
  apiDocuments: number
  businessDocuments: number
  operations: number
}> {
  const root = path.resolve(rootInput)
  const errors: string[] = []
  const files = await collect(root)
  const required = ["README.md", "api/common.md", "api/metadata.md"]
  for (const file of required) if (!files.includes(file)) errors.push(`缺少必需文档：${file}`)
  for (const file of files) {
    if (file !== "README.md" && !/^(?:api|business)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u.test(file)) {
      errors.push(`不符合聚合布局：${file}`)
    }
  }
  const documents = await Promise.all(
    files.map(async (file) =>
      parseDocument(file, await readFile(path.join(root, file), "utf8"), errors)
    )
  )
  const byFile = new Map(documents.map((document) => [document.file, document]))
  for (const document of documents) {
    for (const link of document.links) {
      const target = byFile.get(link.file)
      if (!target || (link.anchor && !target.anchors.has(link.anchor))) {
        errors.push(`${document.file}：失效链接 ${link.file}#${link.anchor}`)
      }
    }
  }
  const index = byFile.get("README.md")
  for (const file of files.filter((file) => file !== "README.md")) {
    if (!index?.links.some((link) => link.file === file)) errors.push(`根索引未关联：${file}`)
  }
  const metadata = byFile.get("api/metadata.md")
  const apiDocuments = documents.filter(
    (document) => document.file.startsWith("api/") && !required.includes(document.file)
  )
  const businesses = documents.filter((document) => document.file.startsWith("business/"))
  const directoryLinks = operationDirectory(metadata, apiDocuments, errors)
  const identities = new Set<string>()
  for (const document of apiDocuments) {
    if (!document.operations.length) errors.push(`${document.file}：缺少稳定操作锚点`)
    for (const operation of document.operations) {
      if (identities.has(operation)) errors.push(`重复操作标识：${operation}`)
      identities.add(operation)
      const registrations = directoryLinks.filter(
        (link) => link.file === document.file && link.anchor === operation
      )
      if (registrations.length !== 1) errors.push(`${operation}：元数据必须唯一登记操作`)
    }
  }
  for (const business of businesses) {
    for (const link of business.links.filter((link) =>
      apiDocuments.some((document) => document.file === link.file)
    )) {
      const operation = byFile.get(link.file)
      if (!link.anchor || !operation?.operations.includes(link.anchor)) {
        errors.push(`${business.file}：业务调用必须定位到操作锚点`)
        continue
      }
      const registration = directoryLinks.find(
        (item) => item.file === link.file && item.anchor === link.anchor
      )
      const reverse = directoryLinks.some(
        (item) => item.row === registration?.row && item.file === business.file
      )
      if (!reverse) errors.push(`${business.file}：缺少操作 ${link.anchor} 的反向业务关联`)
    }
  }
  for (const link of directoryLinks.filter((link) => link.file.startsWith("business/"))) {
    const registrations = directoryLinks.filter(
      (item) =>
        item.row === link.row &&
        apiDocuments.some((document) => document.file === item.file) &&
        item.anchor
    )
    if (
      !registrations.length ||
      !registrations.every((item) =>
        byFile
          .get(link.file)
          ?.links.some((forward) => forward.file === item.file && forward.anchor === item.anchor)
      )
    ) {
      errors.push(`元数据到 ${link.file} 的操作关联缺少对应业务调用`)
    }
  }
  if (errors.length) throw new Error(`导出文档检查失败：\n- ${errors.join("\n- ")}`)
  return {
    files: files.length,
    apiDocuments: apiDocuments.length,
    businessDocuments: businesses.length,
    operations: identities.size
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = process.argv[2]
  if (!root || process.argv.length !== 3) {
    console.error("用法：node check-export.ts <导出根目录>")
    process.exitCode = 1
  } else {
    checkExport(root)
      .then((report) =>
        console.log(`导出文档机械检查通过：${JSON.stringify(report)}；仍需核对代码与业务语义`)
      )
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
