import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import { walkFiles, writeAtomic } from "./files.ts"

/** 描述中文注释门禁发现的单个声明违规。 */
export interface ChineseCommentViolation {
  /** 保存违规文件相对于扫描根目录的路径。 */
  file: string
  /** 保存违规声明所在的一基行号。 */
  line: number
  /** 保存违规声明所在的一基列号。 */
  column: number
  /** 说明当前声明必须补充的中文注释类别。 */
  message: string
}

/** 描述待检查声明与其注释锚点。 */
interface CommentRequirement {
  /** 保存真正承载紧邻注释的语法节点。 */
  anchor: ts.Node
  /** 保存用于生成确定性注释的声明名称。 */
  names: Set<string>
  /** 保存同一注释需要共同说明的声明职责。 */
  kinds: Set<RequirementKind>
}

/** 枚举中文注释门禁支持的声明职责。 */
type RequirementKind =
  | "interface"
  | "interface-member"
  | "class"
  | "class-member"
  | "function"
  | "variable"
  | "parameter-property"

/** 保存能够证明注释包含中文语义的汉字匹配规则。 */
const HAN_CHARACTER = /\p{Script=Han}/u
/** 保存只允许由工具生成且禁止人工维护的精确文件。 */
const EXACT_EXCLUDED_FILES = new Set(["src/routeTree.gen.ts"])
/** 保存不参与源码注释门禁的依赖或构建产物目录。 */
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".plasmo",
  "build",
  "coverage",
  "dist",
  "node_modules"
])

/** 将跨平台相对路径统一为门禁使用的 POSIX 形式。 */
function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/")
}

/** 判断文件是否属于明确允许跳过的第三方或构建生成物。 */
export function isChineseCommentPolicyExcluded(relativePath: string): boolean {
  // 保存 normalized 变量供当前逻辑使用。
  const normalized = normalizeRelativePath(relativePath)
  if (EXACT_EXCLUDED_FILES.has(normalized)) return true
  return normalized
    .split("/")
    .some(/* 执行 当前声明 函数的处理逻辑。 */ (segment) => EXCLUDED_DIRECTORIES.has(segment))
}

/** 根据扩展名选择 TypeScript 或 TSX 解析模式。 */
function scriptKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

/** 将声明名称压缩为适合放进单行中文注释的稳定文本。 */
function compactName(value: string): string {
  return value.replaceAll("*/", "* /").replace(/\s+/g, " ").trim().slice(0, 60)
}

/** 读取具名声明的名称，并为匿名声明提供稳定占位名称。 */
function declarationName(node: ts.Node): string {
  if ("name" in node) {
    // 保存 name 变量供当前逻辑使用。
    const name = (node as ts.NamedDeclaration).name
    if (name !== undefined) return compactName(name.getText())
  }
  return "当前匿名声明"
}

/** 判断节点是否只是函数或类初始化器外层的透明表达式包装。 */
function transparentExpressionParent(node: ts.Expression): ts.Expression | undefined {
  // 保存 parent 变量供当前逻辑使用。
  const parent = node.parent
  if (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isTypeAssertionExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isNonNullExpression(parent)
  ) {
    return parent
  }
  return undefined
}

/** 将透明表达式包装向上提升到格式化后仍能保留前导注释的位置。 */
function outermostTransparentExpression(node: ts.Expression): ts.Expression {
  // 保存 current 变量供当前逻辑使用。
  let current = node
  // 保存 wrapper 变量供当前逻辑使用。
  let wrapper = transparentExpressionParent(current)
  while (wrapper !== undefined) {
    current = wrapper
    wrapper = transparentExpressionParent(current)
  }
  return current
}

/** 找到变量声明列表真正对应的语句级注释锚点。 */
function variableAnchor(list: ts.VariableDeclarationList): ts.Node {
  // 保存 parent 变量供当前逻辑使用。
  const parent = list.parent
  if (ts.isVariableStatement(parent)) return parent
  if (
    (ts.isForStatement(parent) && parent.initializer === list) ||
    ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === list)
  ) {
    return parent
  }
  return list
}

/** 找到函数或类表达式可与所属声明共用的注释锚点。 */
function expressionAnchor(node: ts.Expression): ts.Node {
  // 保存 current 变量供当前逻辑使用。
  const current = outermostTransparentExpression(node)
  // 保存 parent 变量供当前逻辑使用。
  const parent = current.parent
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === current &&
    ts.isVariableDeclarationList(parent.parent)
  ) {
    return variableAnchor(parent.parent)
  }
  if (ts.isPropertyDeclaration(parent) && parent.initializer === current) return parent
  if (ts.isPropertyAssignment(parent) && parent.initializer === current) return parent
  if (ts.isParameter(parent) && parent.initializer === current) return current
  return current
}

/** 判断构造参数是否同时声明了 class 字段。 */
function isParameterProperty(node: ts.ParameterDeclaration): boolean {
  if (!ts.isConstructorDeclaration(node.parent)) return false
  return (
    node.modifiers?.some(
      /* 执行 当前声明 函数的处理逻辑。 */ (modifier) =>
        [
          ts.SyntaxKind.PublicKeyword,
          ts.SyntaxKind.ProtectedKeyword,
          ts.SyntaxKind.PrivateKeyword,
          ts.SyntaxKind.ReadonlyKeyword,
          ts.SyntaxKind.OverrideKeyword
        ].includes(modifier.kind)
    ) === true
  )
}

/** 将同一语法锚点的多个声明职责合并成一条注释要求。 */
function addRequirement(
  requirements: Map<string, CommentRequirement>,
  anchor: ts.Node,
  kind: RequirementKind,
  name: string
): void {
  // 保存 key 变量供当前逻辑使用。
  const key = `${anchor.pos}:${anchor.end}`
  // 保存 existing 变量供当前逻辑使用。
  const existing = requirements.get(key)
  if (existing === undefined) {
    requirements.set(key, {
      anchor,
      names: new Set([name]),
      kinds: new Set([kind])
    })
    return
  }
  existing.names.add(name)
  existing.kinds.add(kind)
}

/** 收集用户指定的全部 interface、class、function 与变量声明。 */
function collectRequirements(sourceFile: ts.SourceFile): CommentRequirement[] {
  // 保存 requirements 变量供当前逻辑使用。
  const requirements = new Map<string, CommentRequirement>()

  /** 递归收集当前源码节点及其子节点的注释要求。 */
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) {
      addRequirement(requirements, node, "interface", declarationName(node))
      // 保存 member 变量供当前逻辑使用。
      for (const member of node.members) {
        addRequirement(requirements, member, "interface-member", declarationName(member))
      }
    }

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      // 保存 anchor 变量供当前逻辑使用。
      const anchor = ts.isClassExpression(node) ? expressionAnchor(node) : node
      addRequirement(requirements, anchor, "class", declarationName(node))
      // 保存 member 变量供当前逻辑使用。
      for (const member of node.members) {
        if (
          ts.isPropertyDeclaration(member) ||
          ts.isMethodDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          ts.isConstructorDeclaration(member) ||
          ts.isIndexSignatureDeclaration(member)
        ) {
          addRequirement(requirements, member, "class-member", declarationName(member))
        }
      }
    }

    if (ts.isFunctionDeclaration(node)) {
      addRequirement(requirements, node, "function", declarationName(node))
    } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      addRequirement(requirements, expressionAnchor(node), "function", declarationName(node))
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      addRequirement(requirements, node, "function", declarationName(node))
    }

    if (ts.isVariableDeclarationList(node)) {
      // 保存 names 变量供当前逻辑使用。
      const names = node.declarations
        .map(/* 执行 当前声明 函数的处理逻辑。 */ (declaration) => declarationName(declaration))
        .join("、")
      addRequirement(requirements, variableAnchor(node), "variable", names)
    }

    if (ts.isParameter(node) && isParameterProperty(node)) {
      addRequirement(requirements, node, "parameter-property", declarationName(node))
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...requirements.values()]
}

/** 判断同行前缀是否确实在引入后续表达式或声明。 */
function isInlineCommentIntroducer(beforeComment: string): boolean {
  // 保存 trimmed 变量供当前逻辑使用。
  const trimmed = beforeComment.trimEnd()
  // 保存 previousTokenEnd 变量供当前逻辑使用。
  const previousTokenEnd = trimmed.at(-1)
  if (previousTokenEnd !== undefined && /[([{,:=?!&|+*/%^<>-]/u.test(previousTokenEnd)) {
    return true
  }
  return /(?:^|[^\p{ID_Continue}])(?:return|throw|yield|await|void|typeof|delete|new)$/u.test(
    trimmed
  )
}

/** 提取锚点与声明之间最后一条真正紧邻的源码注释。 */
function adjacentComment(
  source: string,
  anchor: ts.Node,
  sourceFile: ts.SourceFile
): string | undefined {
  // 保存 start 变量供当前逻辑使用。
  const start = anchor.getStart(sourceFile)
  // 保存 triviaStart 变量供当前逻辑使用。
  const triviaStart = anchor.getFullStart()
  // 保存 trivia 变量供当前逻辑使用。
  const trivia = source.slice(triviaStart, start)
  // 保存 comments 变量供当前逻辑使用。
  const comments = [...trivia.matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g)]
  // 保存 last 变量供当前逻辑使用。
  const last = comments.at(-1)
  if (last?.index === undefined) return undefined
  // 保存 comment 变量供当前逻辑使用。
  const comment = last[0]
  // 保存 commentEnd 变量供当前逻辑使用。
  const commentEnd = triviaStart + last.index + comment.length
  // 保存 trailingTrivia 变量供当前逻辑使用。
  const trailingTrivia = source.slice(commentEnd, start)
  // 保存 lineBreaks 变量供当前逻辑使用。
  const lineBreaks = trailingTrivia.match(/\r?\n/g)?.length ?? 0
  if (lineBreaks > 1 || trailingTrivia.trim() !== "") return undefined

  // 保存 commentStart 变量供当前逻辑使用。
  const commentStart = triviaStart + last.index
  // 保存 lineStart 变量供当前逻辑使用。
  const lineStart = source.lastIndexOf("\n", commentStart - 1) + 1
  // 保存 beforeComment 变量供当前逻辑使用。
  const beforeComment = source.slice(lineStart, commentStart)
  if (comment.startsWith("//") || lineBreaks > 0) {
    if (beforeComment.trim() !== "") return undefined
  } else if (comment.startsWith("/*") && beforeComment.trim() !== "") {
    if (!isInlineCommentIntroducer(beforeComment)) return undefined
  }
  return comment
}

/** 判断声明锚点是否已有紧邻且包含汉字的注释。 */
function hasChineseComment(
  source: string,
  requirement: CommentRequirement,
  sourceFile: ts.SourceFile
): boolean {
  // 保存 comment 变量供当前逻辑使用。
  const comment = adjacentComment(source, requirement.anchor, sourceFile)
  return comment !== undefined && HAN_CHARACTER.test(comment)
}

/** 将声明职责转换为稳定、可理解的中文违规说明。 */
function requirementMessage(requirement: CommentRequirement): string {
  // 保存 kinds 变量供当前逻辑使用。
  const kinds = requirement.kinds
  if (kinds.has("interface-member")) return "interface 内部字段或成员必须有紧邻中文注释"
  if (kinds.has("interface")) return "interface 声明必须有紧邻中文注释"
  if (kinds.has("parameter-property")) return "class 构造参数字段必须有紧邻中文注释"
  if (kinds.has("class-member") && kinds.has("function")) {
    return "class 方法或访问器必须有紧邻中文注释"
  }
  if (kinds.has("class-member")) return "class 内部字段必须有紧邻中文注释"
  if (kinds.has("class")) return "class 声明必须有紧邻中文注释"
  if (kinds.has("variable") && kinds.has("function")) {
    return "变量及其函数初始化器必须有紧邻中文注释"
  }
  if (kinds.has("function")) return "函数或回调必须有紧邻中文注释"
  return "变量声明必须有紧邻中文注释"
}

/** 生成迁移与 Harness 初始化共用的确定性中文注释。 */
function generatedComment(requirement: CommentRequirement): string {
  // 保存 names 变量供当前逻辑使用。
  const names = [...requirement.names]
    .filter(/* 执行 当前声明 函数的处理逻辑。 */ (name) => name !== "当前匿名声明")
    .join("、")
  // 保存 label 变量供当前逻辑使用。
  const label = names === "" ? "当前声明" : names
  // 保存 kinds 变量供当前逻辑使用。
  const kinds = requirement.kinds
  if (kinds.has("interface-member")) return `描述 ${label} 接口成员的结构契约。`
  if (kinds.has("interface")) return `定义 ${label} 接口的结构契约。`
  if (kinds.has("parameter-property")) return `保存 ${label} 构造参数字段的状态。`
  if (kinds.has("class-member") && kinds.has("function")) {
    return `实现 ${label} 类成员的处理逻辑。`
  }
  if (kinds.has("class-member")) return `保存 ${label} 类字段的状态。`
  if (kinds.has("class")) return `实现 ${label} 类的职责。`
  if (kinds.has("variable") && kinds.has("function")) {
    return `保存 ${label} 变量并定义对应函数逻辑。`
  }
  if (kinds.has("function")) return `执行 ${label} 函数的处理逻辑。`
  return `保存 ${label} 变量供当前逻辑使用。`
}

/** 扫描一段 TypeScript/TSX 源码中的中文声明注释违规。 */
export function inspectChineseComments(
  source: string,
  filePath: string
): ChineseCommentViolation[] {
  // 保存 sourceFile 变量供当前逻辑使用。
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )
  return collectRequirements(sourceFile)
    .filter(
      /* 执行 当前声明 函数的处理逻辑。 */ (requirement) =>
        !hasChineseComment(source, requirement, sourceFile)
    )
    .map(
      /* 执行 当前声明 函数的处理逻辑。 */ (requirement) => {
        // 保存 location 变量供当前逻辑使用。
        const location = sourceFile.getLineAndCharacterOfPosition(
          requirement.anchor.getStart(sourceFile)
        )
        return {
          file: filePath,
          line: location.line + 1,
          column: location.character + 1,
          message: requirementMessage(requirement)
        }
      }
    )
}

/** 为 Harness 初始化生成的源码确定性补齐缺失的中文声明注释。 */
export function annotateTypeScriptSource(source: string, filePath: string): string {
  // 保存 sourceFile 变量供当前逻辑使用。
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )
  // 保存 missing 变量供当前逻辑使用。
  const missing = collectRequirements(sourceFile).filter(
    // 执行 当前声明 函数的处理逻辑。
    (requirement) => !hasChineseComment(source, requirement, sourceFile)
  )
  if (missing.length === 0) return source

  // 保存 lineEnding 变量供当前逻辑使用。
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n"
  // 保存 annotated 变量供当前逻辑使用。
  let annotated = source
  // 保存 requirement 变量供当前逻辑使用。
  for (const requirement of missing.sort(
    // 执行 当前声明 函数的处理逻辑。
    (left, right) => right.anchor.getStart(sourceFile) - left.anchor.getStart(sourceFile)
  )) {
    // 保存 start 变量供当前逻辑使用。
    const start = requirement.anchor.getStart(sourceFile)
    // 保存 lineStart 变量供当前逻辑使用。
    const lineStart = source.lastIndexOf("\n", start - 1) + 1
    // 保存 indentation 变量供当前逻辑使用。
    const indentation = source.slice(lineStart, start)
    // 保存 leadingIndentation 变量供当前逻辑使用。
    const leadingIndentation = /^\s*/u.exec(indentation)?.[0] ?? ""
    // 保存 comment 变量供当前逻辑使用。
    const comment = generatedComment(requirement)
    // 保存 insertion 变量供当前逻辑使用。
    const insertion =
      indentation.trim() === ""
        ? `// ${comment}${lineEnding}${indentation}`
        : isInlineCommentIntroducer(indentation)
          ? `/* ${comment} */ `
          : `${lineEnding}${leadingIndentation}// ${comment}${lineEnding}${leadingIndentation}`
    annotated = `${annotated.slice(0, start)}${insertion}${annotated.slice(start)}`
  }
  return annotated
}

/** 收集扫描根目录内全部人工维护的 TypeScript/TSX 文件。 */
async function governedTypeScriptFiles(root: string): Promise<string[]> {
  // 保存 files 变量供当前逻辑使用。
  const files = await walkFiles(root, {
    // 执行 当前声明 函数的处理逻辑。
    exclude: (name) => EXCLUDED_DIRECTORIES.has(name),
    // 执行 当前声明 函数的处理逻辑。
    filter: (name) => name.endsWith(".ts") || name.endsWith(".tsx")
  })
  return files
    .map(
      /* 执行 当前声明 函数的处理逻辑。 */ (absolute) =>
        normalizeRelativePath(path.relative(root, absolute))
    )
    .filter(
      /* 执行 当前声明 函数的处理逻辑。 */ (relative) => !isChineseCommentPolicyExcluded(relative)
    )
    .sort()
}

/** 扫描项目目录并返回全部中文声明注释违规。 */
export async function inspectProjectChineseComments(
  rootInput: string
): Promise<ChineseCommentViolation[]> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 files 变量供当前逻辑使用。
  const files = await governedTypeScriptFiles(root)
  // 保存 perFile 变量供当前逻辑使用。
  const perFile = await Promise.all(
    files.map(
      /* 执行 当前声明 函数的处理逻辑。 */ async (relativePath) => {
        // 保存 source 变量供当前逻辑使用。
        const source = await readFile(path.join(root, relativePath), "utf8")
        return inspectChineseComments(source, relativePath)
      }
    )
  )
  return perFile.flat()
}

/** 在项目目录内确定性迁移全部缺失中文声明注释的源码。 */
export async function annotateTypeScriptProject(rootInput: string): Promise<string[]> {
  // 保存 root 变量供当前逻辑使用。
  const root = path.resolve(rootInput)
  // 保存 files 变量供当前逻辑使用。
  const files = await governedTypeScriptFiles(root)
  // 保存 changed 变量供当前逻辑使用。
  const changed: string[] = []
  // 保存 relativePath 变量供当前逻辑使用。
  for (const relativePath of files) {
    // 保存 absolutePath 变量供当前逻辑使用。
    const absolutePath = path.join(root, relativePath)
    // 保存 source 变量供当前逻辑使用。
    const source = await readFile(absolutePath, "utf8")
    // 保存 annotated 变量供当前逻辑使用。
    const annotated = annotateTypeScriptSource(source, relativePath)
    if (annotated !== source) {
      await writeAtomic(absolutePath, annotated)
      changed.push(relativePath)
    }
  }
  return changed
}

/** 断言项目目录内不存在中文声明注释违规。 */
export async function assertProjectChineseComments(rootInput: string): Promise<void> {
  // 保存 violations 变量供当前逻辑使用。
  const violations = await inspectProjectChineseComments(rootInput)
  if (violations.length === 0) return
  throw new Error(
    `Chinese comment policy failed:\n${violations
      .map(
        // 执行 当前声明 函数的处理逻辑。
        (violation) =>
          `- ${violation.file}:${violation.line}:${violation.column} ${violation.message}`
      )
      .join("\n")}`
  )
}

/** 执行命令行中文注释门禁并输出稳定结果。 */
async function runCli(): Promise<void> {
  // 保存 command 变量供当前逻辑使用。
  const command = process.argv[2]
  if (command !== "check" || process.argv.length > 3) {
    throw new Error("Usage: tsx .harness/tooling/comment-policy.ts check")
  }
  await assertProjectChineseComments(process.cwd())
  console.log("Chinese comment policy passed")
}

/** 保存当前脚本作为命令行入口执行时的规范 URL。 */
const executed =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href
if (executed === import.meta.url) {
  runCli().catch(
    /* 执行 当前声明 函数的处理逻辑。 */ (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  )
}
