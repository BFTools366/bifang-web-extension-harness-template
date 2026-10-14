import { readFileSync } from "node:fs"
import assets from "./assets.json" with { type: "json" }

/** 仅装配显式选中的 Web 身份、组织、权限示例，初始化器不调用。 */
export function accountWorkspaceFiles(base: ReadonlyMap<string, string>): Map<string, string> {
  const files = new Map(base)
  for (const target of files.keys()) {
    if (target.startsWith("src/routes/") || target.startsWith("src/features/welcome/"))
      files.delete(target)
  }
  for (const [target, asset] of Object.entries(assets))
    files.set(target, readFileSync(new URL(asset, import.meta.url), "utf8"))
  for (const [locale, name] of [
    ["en", "accountWorkspaceEn"],
    ["zh", "accountWorkspaceZh"]
  ]) {
    const target = `src/i18n/locales/${locale}.ts`
    const source = base.get(target)
    if (source === undefined || !source.includes(`export const ${locale} = {`))
      throw new Error(`Missing Web locale assembly: ${locale}`)
    files.set(
      target,
      `import { ${name} } from "./accountWorkspace"\n${source.replace(`export const ${locale} = {`, `export const ${locale} = {\n  ...${name},`)}`
    )
  }
  return files
}
