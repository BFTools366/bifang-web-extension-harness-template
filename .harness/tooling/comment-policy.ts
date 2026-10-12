import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { TextDecoder } from "node:util"
import ts from "typescript"
import { isMainModule } from "./files.ts"

/** 描述中文注释门禁发现的单个声明违规。 */
export interface ChineseCommentViolation {
  /** 保存违规文件相对于扫描根目录的路径。 */
  file: string
  /** 保存违规声明所在的一基行号。 */
  line: number
  /** 保存违规声明所在的一基列号。 */
  column: number
  /** 保存稳定声明类别。 */
  kind: RequirementKind
  /** 保存稳定声明名称。 */
  name: string
  /** 说明当前声明必须补充的中文注释。 */
  message: string
}

/** 描述单文件语法检查失败。 */
export interface ChineseCommentSyntaxError {
  /** 保存出错文件路径。 */
  file: string
  /** 保存一基行号。 */
  line: number
  /** 保存一基列号。 */
  column: number
  /** 保存 TypeScript 语法诊断。 */
  message: string
}

/** 描述单文件中文注释检查结果。 */
export interface ChineseCommentInspection {
  /** 保存纳入检查的结构声明数量。 */
  checkedDeclarations: number
  /** 保存解析失败项。 */
  errors: ChineseCommentSyntaxError[]
  /** 保存缺失注释项。 */
  violations: ChineseCommentViolation[]
}

/** 描述完整项目中文注释检查报告。 */
export interface ChineseCommentProjectReport {
  /** 表示检查是否通过。 */
  ok: boolean
  /** 保存规范化扫描根。 */
  root: string
  /** 保存成功读取的源码文件数量。 */
  checkedFiles: number
  /** 保存纳入检查的结构声明数量。 */
  checkedDeclarations: number
  /** 保存路径、读取或语法错误。 */
  errors: string[]
  /** 保存全部结构声明违规。 */
  violations: ChineseCommentViolation[]
}

/** 枚举中文注释门禁覆盖的稳定结构声明。 */
type RequirementKind =
  | "interface"
  | "type"
  | "enum"
  | "class"
  | "function"
  | "constructor"
  | "method"
  | "exported-component-or-hook"
  | "test"

/** 描述待检查声明及其稳定诊断信息。 */
interface CommentRequirement {
  /** 保存真正承载紧邻注释的语法节点。 */
  anchor: ts.Node
  /** 保存结构声明类别。 */
  kind: RequirementKind
  /** 保存声明名称。 */
  name: string
}

/** 保存能够证明注释包含中文语义的汉字匹配规则。 */
const HAN_CHARACTER = /\p{Script=Han}/u
/** 保存只允许跳过的精确生成文件。 */
const EXACT_EXCLUDED_FILES = new Set(["src/routeTree.gen.ts"])
/** 保存只在扫描根排除的依赖、版本控制和最终产物目录。 */
const EXCLUDED_ROOT_DIRECTORIES = new Set([
  ".git",
  ".plasmo",
  "build",
  "coverage",
  "dist",
  "node_modules"
])
/** 保存任何深度都排除的封闭外部目录。 */
const EXCLUDED_ANYWHERE_DIRECTORIES = new Set([".git", "node_modules"])
/** 保存 Vitest 场景入口名称。 */
const TEST_CALL_NAMES = new Set(["it", "test"])

/** 将跨平台相对路径统一为门禁使用的 POSIX 形式。 */
function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/").replace(/^\.\//u, "")
}

/** 判断路径是否属于精确生成物、外部内容或最终产物。 */
export function isChineseCommentPolicyExcluded(relativePath: string, isDirectory = false): boolean {
  const normalized = normalizeRelativePath(relativePath)
  if (!isDirectory && EXACT_EXCLUDED_FILES.has(normalized)) return true
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0) return false
  if (segments[0] !== undefined && EXCLUDED_ROOT_DIRECTORIES.has(segments[0])) return true
  return segments.some((segment) => EXCLUDED_ANYWHERE_DIRECTORIES.has(segment))
}

/** 根据扩展名选择 TypeScript 或 TSX 解析模式。 */
function scriptKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

/** 返回声明的稳定名称，并为匿名声明提供诊断占位名。 */
function declarationName(node: ts.NamedDeclaration): string {
  return node.name?.getText().replace(/\s+/gu, " ").trim().slice(0, 80) ?? "<anonymous>"
}

/** 判断声明是否具有 export 修饰符。 */
function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
      true
  )
}

/** 判断导出变量是否使用 React 组件或 hook 的稳定命名。 */
function isComponentOrHookName(name: string): boolean {
  return /^[A-Z]/u.test(name) || /^use[A-Z0-9_]/u.test(name)
}

/** 收集当前模块直接或延迟导出的本地绑定名。 */
function locallyExportedNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        names.add((element.propertyName ?? element.name).text)
      }
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      names.add(statement.expression.text)
    }
  }
  return names
}

/** 判断文件路径是否明确属于测试场景文件。 */
function isTestSourceFile(fileName: string): boolean {
  const normalized = normalizeRelativePath(fileName)
  return (
    /\.(?:test|spec)\.tsx?$/u.test(normalized) ||
    normalized.split("/").some((segment) => ["test", "tests", "__tests__"].includes(segment))
  )
}

/** 收集从 Vitest 显式导入的本地 test/it 绑定名。 */
function importedVitestTestNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "vitest" ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue
    }
    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text
      if (TEST_CALL_NAMES.has(importedName)) names.add(element.name.text)
    }
  }
  return names
}

/** 从 test.only、test.each(...) 等调用链提取根调用名。 */
function callRootName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return callRootName(expression.expression)
  if (ts.isCallExpression(expression)) return callRootName(expression.expression)
  return undefined
}

/** 将同一结构声明的重复发现合并为一项要求。 */
function addRequirement(
  requirements: Map<string, CommentRequirement>,
  sourceFile: ts.SourceFile,
  anchor: ts.Node,
  kind: RequirementKind,
  name: string
): void {
  const key = `${anchor.getStart(sourceFile)}:${anchor.end}:${kind}:${name}`
  if (!requirements.has(key)) requirements.set(key, { anchor, kind, name })
}

/** 收集稳定结构声明，不收集字段、局部变量或普通匿名回调。 */
function collectRequirements(sourceFile: ts.SourceFile): CommentRequirement[] {
  const requirements = new Map<string, CommentRequirement>()
  const exportedNames = locallyExportedNames(sourceFile)
  const testNames = importedVitestTestNames(sourceFile)
  if (isTestSourceFile(sourceFile.fileName)) {
    for (const name of TEST_CALL_NAMES) testNames.add(name)
  }

  /** 递归识别当前节点的稳定声明职责。 */
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "interface", declarationName(node))
    } else if (ts.isTypeAliasDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "type", declarationName(node))
    } else if (ts.isEnumDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "enum", declarationName(node))
    } else if (ts.isClassDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "class", declarationName(node))
    } else if (ts.isFunctionDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "function", declarationName(node))
    } else if (ts.isConstructorDeclaration(node)) {
      addRequirement(requirements, sourceFile, node, "constructor", "constructor")
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      addRequirement(requirements, sourceFile, node, "method", declarationName(node))
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
        if (
          (isExported(node) ||
            (node.parent === sourceFile && exportedNames.has(declaration.name.text))) &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer)) &&
          isComponentOrHookName(declaration.name.text)
        ) {
          addRequirement(
            requirements,
            sourceFile,
            node,
            "exported-component-or-hook",
            declaration.name.text
          )
        }
      }
    }

    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      testNames.has(callRootName(node.expression.expression) ?? "")
    ) {
      const scenario = node.expression.arguments[0]
      addRequirement(
        requirements,
        sourceFile,
        node,
        "test",
        scenario?.getText(sourceFile).slice(0, 80) ?? "<scenario>"
      )
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...requirements.values()]
}

/** 判断同行前缀是否确实在引入后续表达式或声明。 */
function isInlineCommentIntroducer(beforeComment: string): boolean {
  const trimmed = beforeComment.trimEnd()
  const previousTokenEnd = trimmed.at(-1)
  if (previousTokenEnd !== undefined && /[([{,:=?!&|+*/%^<>-]/u.test(previousTokenEnd)) {
    return true
  }
  return /(?:^|[^\p{ID_Continue}])(?:return|throw|yield|await|void|typeof|delete|new)$/u.test(
    trimmed
  )
}

/** 提取声明前最后一条真正紧邻的源码注释。 */
function adjacentComment(
  source: string,
  anchor: ts.Node,
  sourceFile: ts.SourceFile
): string | undefined {
  const start = anchor.getStart(sourceFile)
  const triviaStart = anchor.getFullStart()
  const trivia = source.slice(triviaStart, start)
  const comments = [...trivia.matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gu)]
  const last = comments.at(-1)
  if (last?.index === undefined) return undefined
  const comment = last[0]
  const commentStart = triviaStart + last.index
  const trailingTrivia = source.slice(commentStart + comment.length, start)
  const lineBreaks = trailingTrivia.match(/\r?\n/gu)?.length ?? 0
  if (lineBreaks > 1 || trailingTrivia.trim() !== "") return undefined
  if (comment.startsWith("//") || (comment.startsWith("/*") && lineBreaks > 0)) {
    const lineStart = source.lastIndexOf("\n", commentStart - 1) + 1
    if (source.slice(lineStart, commentStart).trim() !== "") return undefined
  }
  return comment
}

/** 把 TypeScript 语法诊断转换为稳定的一基位置。 */
function syntaxErrors(sourceFile: ts.SourceFile): ChineseCommentSyntaxError[] {
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics
  return (diagnostics ?? []).map((diagnostic) => {
    const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    return {
      file: sourceFile.fileName,
      line: location.line + 1,
      column: location.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
    }
  })
}

/** 扫描一段 TypeScript/TSX 源码中的稳定结构声明。 */
export function inspectChineseComments(source: string, filePath: string): ChineseCommentInspection {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )
  const errors = syntaxErrors(sourceFile)
  if (errors.length > 0) return { checkedDeclarations: 0, errors, violations: [] }
  const requirements = collectRequirements(sourceFile)
  const violations = requirements
    .filter((requirement) => {
      const comment = adjacentComment(source, requirement.anchor, sourceFile)
      return comment === undefined || !HAN_CHARACTER.test(comment)
    })
    .map((requirement) => {
      const location = sourceFile.getLineAndCharacterOfPosition(
        requirement.anchor.getStart(sourceFile)
      )
      return {
        file: filePath,
        line: location.line + 1,
        column: location.character + 1,
        kind: requirement.kind,
        name: requirement.name,
        message: "声明必须具有紧邻且包含汉字的业务注释"
      }
    })
  return { checkedDeclarations: requirements.length, errors: [], violations }
}

/** 为稳定结构声明生成可复查的确定性中文注释。 */
function generatedComment(requirement: CommentRequirement): string {
  const rawName = requirement.name === "<anonymous>" ? "当前匿名声明" : requirement.name
  const name = rawName.replace(/\s+/gu, " ").replaceAll("*/", "* /").trim()
  switch (requirement.kind) {
    case "interface":
      return `描述 ${name} 接口的结构契约。`
    case "type":
      return `描述 ${name} 类型的结构契约。`
    case "enum":
      return `枚举 ${name} 支持的稳定取值。`
    case "class":
      return `实现 ${name} 类的职责边界。`
    case "function":
      return `执行 ${name} 函数的处理逻辑。`
    case "constructor":
      return "初始化当前类实例的依赖与状态。"
    case "method":
      return `执行 ${name} 类成员的处理逻辑。`
    case "exported-component-or-hook":
      return `提供 ${name} 导出组件或 Hook 的行为。`
    case "test":
      return `验证 ${name} 测试场景。`
  }
}

/** 为生成源码和既有项目确定性补齐缺失的稳定结构中文注释。 */
export function annotateTypeScriptSource(source: string, filePath: string): string {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )
  const errors = syntaxErrors(sourceFile)
  if (errors.length > 0) {
    throw new Error(
      errors
        .map((error) => `${error.file}:${error.line}:${error.column}: ${error.message}`)
        .join("\n")
    )
  }
  const missing = collectRequirements(sourceFile).filter((requirement) => {
    const comment = adjacentComment(source, requirement.anchor, sourceFile)
    return comment === undefined || !HAN_CHARACTER.test(comment)
  })
  if (missing.length === 0) return source

  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n"
  let annotated = source
  for (const requirement of missing.sort(
    (left, right) => right.anchor.getStart(sourceFile) - left.anchor.getStart(sourceFile)
  )) {
    const start = requirement.anchor.getStart(sourceFile)
    const lineStart = source.lastIndexOf("\n", start - 1) + 1
    const rawIndentation = source.slice(lineStart, start)
    // 首行 BOM 已经保留在插入点之前，不能再把它作为缩进复制一次。
    const indentation = lineStart === 0 ? rawIndentation.replace(/^\uFEFF/u, "") : rawIndentation
    const leadingIndentation = /^\s*/u.exec(indentation)?.[0] ?? ""
    const comment = `/** ${generatedComment(requirement)} */`
    const insertion =
      indentation.trim() === ""
        ? `${comment}${lineEnding}${indentation}`
        : isInlineCommentIntroducer(indentation)
          ? `${comment} `
          : `${lineEnding}${leadingIndentation}${comment}${lineEnding}${leadingIndentation}`
    annotated = `${annotated.slice(0, start)}${insertion}${annotated.slice(start)}`
  }
  return annotated
}

/** 用严格 UTF-8 解码人工源码并拒绝 NUL 字节。 */
async function readUtf8Source(filePath: string): Promise<string> {
  const bytes = await readFile(filePath)
  if (bytes.includes(0)) throw new Error("源码包含 NUL 字节")
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

/** 枚举扫描根中的人工维护 TypeScript/TSX 文件并拒绝源码符号链接。 */
async function governedTypeScriptFiles(
  root: string
): Promise<{ errors: string[]; files: Array<{ absolute: string; relative: string }> }> {
  const files: Array<{ absolute: string; relative: string }> = []
  const errors: string[] = []

  /** 深度优先遍历目录并保持诊断顺序稳定。 */
  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relative =
        relativeDirectory === "" ? entry.name : path.join(relativeDirectory, entry.name)
      const normalized = normalizeRelativePath(relative)
      if (isChineseCommentPolicyExcluded(normalized, entry.isDirectory())) continue
      const absolute = path.join(directory, entry.name)
      const status = await lstat(absolute)
      if (status.isSymbolicLink()) {
        errors.push(`${normalized}: 人工源码路径不得是符号链接`)
      } else if (status.isDirectory()) {
        await visit(absolute, relative)
      } else if (status.isFile() && (normalized.endsWith(".ts") || normalized.endsWith(".tsx"))) {
        files.push({ absolute, relative: normalized })
      }
    }
  }

  await visit(root, "")
  return { errors, files }
}

/** 扫描项目目录并返回严格、稳定的中文声明注释报告。 */
export async function inspectProjectChineseComments(
  rootInput: string
): Promise<ChineseCommentProjectReport> {
  const root = path.resolve(rootInput)
  const report: ChineseCommentProjectReport = {
    ok: false,
    root,
    checkedFiles: 0,
    checkedDeclarations: 0,
    errors: [],
    violations: []
  }
  try {
    const status = await lstat(root)
    if (status.isSymbolicLink()) throw new Error("扫描根不得是符号链接")
    if (!status.isDirectory()) throw new Error("扫描根不是目录")
  } catch (error) {
    report.errors.push(`无法解析扫描根: ${error instanceof Error ? error.message : String(error)}`)
    return report
  }

  let discovered: Awaited<ReturnType<typeof governedTypeScriptFiles>>
  try {
    discovered = await governedTypeScriptFiles(root)
  } catch (error) {
    report.errors.push(
      `无法枚举 TypeScript 源码: ${error instanceof Error ? error.message : String(error)}`
    )
    return report
  }
  report.errors.push(...discovered.errors)
  if (discovered.files.length === 0) report.errors.push("未找到可检查的 TypeScript/TSX 源码")

  for (const file of discovered.files) {
    try {
      const inspected = inspectChineseComments(await readUtf8Source(file.absolute), file.relative)
      report.checkedFiles += 1
      report.checkedDeclarations += inspected.checkedDeclarations
      report.errors.push(
        ...inspected.errors.map(
          (error) =>
            `${error.file}:${error.line}:${error.column}: TypeScript 语法错误: ${error.message}`
        )
      )
      report.violations.push(...inspected.violations)
    } catch (error) {
      report.errors.push(
        `${file.relative}: 无法安全读取源码: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  if (report.checkedDeclarations === 0 && report.errors.length === 0) {
    report.errors.push("未发现受中文注释门禁管理的声明")
  }
  report.ok = report.errors.length === 0 && report.violations.length === 0
  return report
}

/** 断言项目目录内不存在路径、语法或中文结构声明违规。 */
async function assertProjectChineseComments(rootInput: string): Promise<void> {
  const report = await inspectProjectChineseComments(rootInput)
  if (report.ok) return
  throw new Error(
    [
      "中文注释检查失败：",
      ...report.errors.map((error) => `- ${error}`),
      ...report.violations.map(
        (violation) =>
          `- ${violation.file}:${violation.line}:${violation.column} ${violation.kind} ${violation.name}: ${violation.message}`
      )
    ].join("\n")
  )
}

/** 执行只读中文注释门禁命令行入口。 */
async function runCli(): Promise<void> {
  const command = process.argv[2]
  if (command !== "check" || process.argv.length > 3) {
    throw new Error("用法：tsx .harness/tooling/comment-policy.ts check")
  }
  await assertProjectChineseComments(process.cwd())
  console.log("中文注释检查通过")
}

if (isMainModule(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
