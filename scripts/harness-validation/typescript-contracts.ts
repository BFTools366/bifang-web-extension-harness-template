import ts from "typescript"

/** 将受管 TypeScript 源码解析为可忽略注释文本的结构化语法树。 */
export function parseTypeScriptSource(contents: string, filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** 返回指定语法范围内具名函数声明。 */
export function findFunctionDeclaration(
  sourceFile: ts.SourceFile,
  name: string
): ts.FunctionDeclaration | undefined {
  // 保存 found 变量供当前逻辑使用。
  let found: ts.FunctionDeclaration | undefined
  /** 遍历源码并捕获第一个匹配的函数声明。 */
  function visit(node: ts.Node): void {
    if (found !== undefined) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/** 收集指定范围内直接调用某个标识符且参数源码精确匹配的位置。 */
export function identifierCallPositions(
  scope: ts.Node,
  sourceFile: ts.SourceFile,
  callee: string,
  argumentTexts: readonly string[]
): number[] {
  // 保存 positions 变量供当前逻辑使用。
  const positions: number[] = []
  /** 遍历语法节点并收集结构匹配的函数调用。 */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee &&
      node.arguments.length === argumentTexts.length &&
      node.arguments.every(
        /* 比较当前调用参数的规范源码。 */ (argument, index) =>
          argument.getText(sourceFile) === argumentTexts[index]
      )
    ) {
      positions.push(node.getStart(sourceFile))
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return positions
}

/** 判断语法树中是否真实存在指定标识符，忽略注释与字符串文本。 */
export function containsIdentifier(scope: ts.Node, name: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历语法节点并查找真实标识符。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isIdentifier(node) && node.text === name) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断语法树中是否真实存在指定字符串字面量，忽略注释文本。 */
export function containsStringLiteral(scope: ts.Node, value: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历语法节点并查找真实字符串字面量。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === value
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断具名函数体顶层是否直接抛出错误。 */
export function hasDirectThrow(sourceFile: ts.SourceFile, functionName: string): boolean {
  // 保存 declaration 变量供当前逻辑使用。
  const declaration = findFunctionDeclaration(sourceFile, functionName)
  return (
    declaration?.body?.statements.some(
      /* 检查函数顶层是否存在 throw statement。 */ (statement) => ts.isThrowStatement(statement)
    ) === true
  )
}

/** 收集指定属性访问调用且参数源码精确匹配的位置。 */
export function propertyAccessCallPositions(
  scope: ts.Node,
  sourceFile: ts.SourceFile,
  owner: string,
  property: string,
  argumentTexts: readonly string[]
): number[] {
  // 保存 positions 变量供当前逻辑使用。
  const positions: number[] = []
  /** 遍历语法节点并收集结构匹配的属性调用。 */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === owner &&
      node.expression.name.text === property &&
      node.arguments.length === argumentTexts.length &&
      node.arguments.every(
        /* 比较属性调用参数的规范源码。 */ (argument, index) =>
          argument.getText(sourceFile) === argumentTexts[index]
      )
    ) {
      positions.push(node.getStart(sourceFile))
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return positions
}

/** 返回函数体顶层直接 await 指定调用的位置。 */
export function directAwaitedCallPosition(
  declaration: ts.FunctionDeclaration | undefined,
  sourceFile: ts.SourceFile,
  callee: string,
  argumentTexts: readonly string[]
): number | undefined {
  if (declaration?.body === undefined) return undefined
  // 保存 statement 变量供当前逻辑使用。
  for (const statement of declaration.body.statements) {
    // 保存 awaitedExpressions 变量，兼容直接 await 与保存结果的 await 声明。
    const awaitedExpressions: ts.Expression[] = []
    if (ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression)) {
      awaitedExpressions.push(statement.expression.expression)
    } else if (ts.isVariableStatement(statement)) {
      // 保存 declarationItem 变量供当前逻辑使用。
      for (const declarationItem of statement.declarationList.declarations) {
        if (
          declarationItem.initializer !== undefined &&
          ts.isAwaitExpression(declarationItem.initializer)
        ) {
          awaitedExpressions.push(declarationItem.initializer.expression)
        }
      }
    }
    // 保存 expression 变量供调用契约匹配使用。
    for (const expression of awaitedExpressions) {
      if (
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === callee &&
        expression.arguments.length === argumentTexts.length &&
        expression.arguments.every(
          /* 比较顶层 await 调用参数的规范源码。 */ (argument, index) =>
            argument.getText(sourceFile) === argumentTexts[index]
        )
      ) {
        return statement.getStart(sourceFile)
      }
    }
  }
  return undefined
}

/** 提取具名函数直接返回的字符串或无插值模板正文。 */
export function directFunctionReturnText(
  sourceFile: ts.SourceFile,
  functionName: string
): string | undefined {
  // 保存 declaration 变量供当前逻辑使用。
  const declaration = findFunctionDeclaration(sourceFile, functionName)
  if (declaration?.body === undefined) return undefined
  // 保存 statement 变量供当前逻辑使用。
  for (const statement of declaration.body.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression !== undefined &&
      (ts.isStringLiteral(statement.expression) ||
        ts.isNoSubstitutionTemplateLiteral(statement.expression))
    ) {
      return statement.expression.text
    }
  }
  return undefined
}

/** 判断源码是否从目标模块导入了指定标识符。 */
export function hasNamedImport(
  sourceFile: ts.SourceFile,
  modulePath: string,
  name: string
): boolean {
  return sourceFile.statements.some(
    /* 检查单条 import declaration 的模块与具名绑定。 */ (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === modulePath &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        /* 检查导入元素保留的本地标识符。 */ (element) => element.name.text === name
      )
  )
}

/** 判断源码对象字面量中存在指定字符串脚本值。 */
export function hasStringProperty(scope: ts.Node, name: string, value: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历对象属性并匹配规范脚本键值。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isPropertyAssignment(node)) {
      // 保存 propertyName 变量供当前逻辑使用。
      const propertyName = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : undefined
      if (
        propertyName === name &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
        node.initializer.text === value
      ) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 判断 requirePaths 的数组参数精确包含目标受管路径。 */
export function requirePathsContains(scope: ts.Node, requiredPath: string): boolean {
  // 保存 found 变量供当前逻辑使用。
  let found = false
  /** 遍历 requirePaths 调用并检查第二参数数组。 */
  function visit(node: ts.Node): void {
    if (found) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "requirePaths" &&
      node.arguments[1] !== undefined &&
      ts.isArrayLiteralExpression(node.arguments[1]) &&
      node.arguments[1].elements.some(
        /* 匹配必需路径字符串。 */ (element) =>
          ts.isStringLiteral(element) && element.text === requiredPath
      )
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

/** 提取源码顶层具名常量中的无插值模板正文。 */
export function noSubstitutionTemplateValue(
  sourceFile: ts.SourceFile,
  variableName: string
): string | undefined {
  // 保存 value 变量供当前逻辑使用。
  let value: string | undefined
  /** 遍历变量声明并提取目标模板文本。 */
  function visit(node: ts.Node): void {
    if (value !== undefined) return
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer !== undefined &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    ) {
      value = node.initializer.text
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return value
}

/** 判断 runCli 对指定命令执行直接 return 调用，而不是仅在注释保留字符串。 */
export function hasCommandReturnDispatch(
  sourceFile: ts.SourceFile,
  commandValue: string,
  callee: string,
  argumentTexts: readonly string[]
): boolean {
  // 保存 runCli 变量供当前逻辑使用。
  const runCli = findFunctionDeclaration(sourceFile, "runCli")
  if (runCli?.body === undefined) return false
  return runCli.body.statements.some(
    /* 检查命令比较与 return 调用的结构。 */ (statement) => {
      if (!ts.isIfStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false
      // 保存 condition 变量供当前逻辑使用。
      const condition = statement.expression
      if (
        condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
        !ts.isIdentifier(condition.left) ||
        condition.left.text !== "command" ||
        !ts.isStringLiteral(condition.right) ||
        condition.right.text !== commandValue ||
        !ts.isReturnStatement(statement.thenStatement) ||
        statement.thenStatement.expression === undefined
      ) {
        return false
      }
      // 保存 returned 变量供当前逻辑使用。
      const returned = statement.thenStatement.expression
      return (
        ts.isCallExpression(returned) &&
        ts.isIdentifier(returned.expression) &&
        returned.expression.text === callee &&
        returned.arguments.length === argumentTexts.length &&
        returned.arguments.every(
          /* 比较 return 调用的规范参数。 */ (argument, index) =>
            argument.getText(sourceFile) === argumentTexts[index]
        )
      )
    }
  )
}
