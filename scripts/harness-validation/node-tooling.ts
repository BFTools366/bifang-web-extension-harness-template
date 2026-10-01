import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

/** 识别 Python 解释器、版本化命令与 Windows launcher。 */
function isPythonCommand(command: string): boolean {
  const executable =
    command
      .trim()
      .split(/\s/u)[0]
      ?.replace(/^['"]|['"]$/gu, "") ?? ""
  return /^(?:python(?:\d+(?:\.\d+)*)?|py)(?:\.exe)?$/iu.test(path.win32.basename(executable))
}

/** 仅检查实际命令段，文档及普通字符串不构成工具执行入口。 */
function invokesPython(command: string): boolean {
  return command.split(/&&|\|\||[;|]/u).some((segment) => {
    const normalized = segment.trim().replace(/^(?:[A-Z_][A-Z_\d]*=\S+\s+)+/u, "")
    return isPythonCommand(normalized.replace(/^(?:\S*[\\/])?env(?:\.exe)?\s+(?:-S\s+)?/iu, ""))
  })
}

/** 读取静态命令字符串；带动态插值的文本由实际工具审查负责。 */
function literalCommand(node: ts.Node | undefined): string | undefined {
  return node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined
}

/** 检查真实 Node child_process 调用，包括已声明的 promisify 别名。 */
function inspectProcessCalls(source: string, file: string, errors: string[]): void {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const processes = new Set<string>()
  const namespaces = new Set<string>()
  const promisifiers = new Set<string>()
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const moduleName = statement.moduleSpecifier.text.replace(/^node:/u, "")
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue
    if (moduleName === "child_process") {
      if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      else
        for (const binding of bindings.elements) {
          const name = (binding.propertyName ?? binding.name).text
          if (/^(?:exec|execFile|spawn)(?:Sync)?$/u.test(name)) processes.add(binding.name.text)
        }
    }
    if (moduleName === "util" && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === "promisify")
          promisifiers.add(binding.name.text)
      }
    }
  }
  // 进程绑定来自真实 import，避免把测试源码字符串或同名普通函数判为启动调用。
  const processExpression = (node: ts.Expression): boolean =>
    (ts.isIdentifier(node) && processes.has(node.text)) ||
    (ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text) &&
      /^(?:exec|execFile|spawn)(?:Sync)?$/u.test(node.name.text))
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const value = declaration.initializer
      if (
        ts.isIdentifier(declaration.name) &&
        value !== undefined &&
        ts.isCallExpression(value) &&
        ts.isIdentifier(value.expression) &&
        promisifiers.has(value.expression.text) &&
        value.arguments[0] !== undefined &&
        processExpression(value.arguments[0])
      ) {
        processes.add(declaration.name.text)
      }
    }
  }
  /** 只遍历可执行 AST 节点，不递归解释字符串中的代码。 */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && processExpression(node.expression)) {
      const command = literalCommand(node.arguments[0])
      if (command !== undefined && invokesPython(command)) {
        errors.push(`Node-only tooling cannot launch Python: ${file}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}

/** 禁止自有 Python 工具和执行入口，隔离第三方包与原样 vendor。 */
export async function validateNodeTooling(
  root: string,
  files: readonly string[],
  errors: string[]
): Promise<void> {
  for (const file of files) {
    const segments = file.replaceAll("\\", "/").split("/")
    if (
      segments.some((segment) => segment === ".git" || segment === "node_modules") ||
      file.replaceAll("\\", "/").startsWith(".harness/vendor/")
    )
      continue
    if (/\.pyw?$/iu.test(file)) {
      errors.push(`Node-only tooling forbids owned Python files: ${file}`)
      continue
    }
    const extension = path.extname(file).toLowerCase()
    if (
      file !== "package.json" &&
      !["", ".sh", ".bash", ".zsh", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx"].includes(
        extension
      )
    )
      continue
    const source = await readFile(path.join(root, file), "utf8")
    const firstLine = source.split(/\r?\n/u)[0] ?? ""
    if (firstLine.startsWith("#!") && invokesPython(firstLine.slice(2))) {
      errors.push(`Node-only tooling forbids a Python shebang: ${file}`)
    }
    if (file === "package.json") {
      const manifest = JSON.parse(source) as {
        scripts?: Record<string, unknown>
        bin?: string | Record<string, unknown>
      }
      for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
        if (typeof command === "string" && invokesPython(command))
          errors.push(`Node-only tooling forbids package script: ${name}`)
      }
      for (const target of typeof manifest.bin === "string"
        ? [manifest.bin]
        : Object.values(manifest.bin ?? {})) {
        if (typeof target === "string" && /\.pyw?$/iu.test(target))
          errors.push(`Node-only tooling forbids Python bin: ${target}`)
      }
    } else if (/\.(?:[cm]?[jt]s|tsx)$/u.test(extension)) inspectProcessCalls(source, file, errors)
  }
}
