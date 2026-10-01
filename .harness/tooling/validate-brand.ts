import { readFile } from "node:fs/promises"
import path from "node:path"
import { identityLocales } from "./identity.ts"
import sharp from "sharp"
import ts from "typescript"
import { derivedLogoPaths } from "./brand.ts"
import { MASTER_LOGO_PATH } from "./config.ts"
import { pathExists } from "./files.ts"
import type { ProjectConfig } from "./types.ts"
import { deriveLogoAssets } from "./logo.ts"

/** 只读取品牌对象内静态字符串，格式化不能掩盖本地化身份漂移。 */
export function identityObject(node: ts.ObjectLiteralExpression): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const property of node.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
    )
      continue
    const value = property.initializer
    if (ts.isStringLiteral(value)) values[property.name.text] = value.text
    else if (ts.isObjectLiteralExpression(value)) values[property.name.text] = identityObject(value)
  }
  return values
}

/** 对默认名称、说明及两份 UI 翻译执行项目事实一致性检查。 */
export async function validateIdentityBrand(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  const filePath = path.join(root, "src/brand.ts")
  if (!(await pathExists(filePath))) return
  const source = ts.createSourceFile(
    filePath,
    await readFile(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true
  )
  let brand: Record<string, unknown> | undefined
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "BRAND") continue
      let initializer = declaration.initializer
      if (initializer !== undefined && ts.isAsExpression(initializer))
        initializer = initializer.expression
      if (initializer !== undefined && ts.isObjectLiteralExpression(initializer))
        brand = identityObject(initializer)
    }
  }
  const locales = identityLocales(config)
  const expected = {
    en: { projectName: locales.en.name, projectDescription: locales.en.description },
    zh: { projectName: locales.zh_CN.name, projectDescription: locales.zh_CN.description }
  }
  if (
    brand?.name !== config.name ||
    brand?.description !== config.description ||
    JSON.stringify(brand?.identity) !== JSON.stringify(expected)
  ) {
    errors.push("src/brand.ts localized identity is stale; run pnpm harness brand refresh")
  }
}

// 执行 validateLogos 函数的处理逻辑。
export async function validateLogos(
  root: string,
  config: ProjectConfig,
  errors: string[]
): Promise<void> {
  // 保存 masterPath 变量供当前逻辑使用。
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  if (!(await pathExists(masterPath))) return
  // 保存 master 变量供当前逻辑使用。
  const master = await readFile(masterPath)
  // 保存 metadata 变量供当前逻辑使用。
  const metadata = await sharp(master).metadata()
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.format !== "png") {
    errors.push(`${MASTER_LOGO_PATH} must be a 1024x1024 PNG`)
  }
  // 保存 expectedAssets 变量供当前逻辑使用。
  const expectedAssets = await deriveLogoAssets(config.projectType, master)
  // 保存 relativePath 变量供当前逻辑使用。
  for (const relativePath of derivedLogoPaths(config)) {
    // 保存 derivedPath 变量供当前逻辑使用。
    const derivedPath = path.join(root, relativePath)
    if (await pathExists(derivedPath)) {
      // 保存 derived 变量供当前逻辑使用。
      const derived = await readFile(derivedPath)
      // 保存 expected 变量供当前逻辑使用。
      const expected = expectedAssets.get(relativePath)
      if (expected === undefined || !expected.equals(derived)) {
        errors.push(`${relativePath} is not synchronized with the master logo`)
      }
    }
  }
}
