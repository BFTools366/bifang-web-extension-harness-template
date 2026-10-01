import path from "node:path"
import { pathExists, readJson, writeAtomic } from "./files.ts"
import type { ProjectConfig } from "./types.ts"

/** 约束与现有英文、简体中文 UI 对齐的浏览器身份语言。 */
export type IdentityLocale = "en" | "zh_CN"

/** 描述一份完整的本地化项目身份，禁止半份翻译。 */
export interface LocalizedIdentity {
  name: string
  description: string
}

/** 默认语言消费根名称和说明，其他语言只保存显式翻译。 */
export interface IdentityI18n {
  defaultLocale: IdentityLocale
  translations: Partial<Record<IdentityLocale, LocalizedIdentity>>
}

/** 校验身份本地化输入，不猜测翻译或复制默认语言为翻译事实。 */
export function validateIdentityI18n(value: unknown): IdentityI18n | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("identityI18n must be an object")
  }
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some((key) => !["defaultLocale", "translations"].includes(key))) {
    throw new Error("Unknown identityI18n field")
  }
  const defaultLocale = candidate.defaultLocale
  if (defaultLocale !== "en" && defaultLocale !== "zh_CN") {
    throw new Error("identityI18n.defaultLocale must be en or zh_CN")
  }
  const supplied = candidate.translations
  if (supplied === null || typeof supplied !== "object" || Array.isArray(supplied)) {
    throw new Error("identityI18n.translations must be an object")
  }
  const translations: IdentityI18n["translations"] = {}
  for (const [locale, entry] of Object.entries(supplied)) {
    if (locale !== "en" && locale !== "zh_CN")
      throw new Error(`Unsupported identity locale: ${locale}`)
    if (locale === defaultLocale)
      throw new Error("Default identity belongs in root name/description")
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid identity translation: ${locale}`)
    }
    const identity = entry as Record<string, unknown>
    if (Object.keys(identity).some((key) => !["name", "description"].includes(key))) {
      throw new Error(`Unknown identity translation field: ${locale}`)
    }
    if (
      typeof identity.name !== "string" ||
      !identity.name.trim() ||
      typeof identity.description !== "string" ||
      !identity.description.trim()
    ) {
      throw new Error(`Identity translation ${locale} requires name and description`)
    }
    translations[locale] = { name: identity.name.trim(), description: identity.description.trim() }
  }
  return { defaultLocale, translations }
}

/** 解析 CLI 和编号表单共用的 JSON 身份参数。 */
export function parseIdentityI18n(value: string | undefined): IdentityI18n | undefined {
  if (value === undefined || value.trim() === "") return undefined
  return validateIdentityI18n(JSON.parse(value))
}

/** 从根身份和已提供翻译派生两种语言，缺失翻译明确回退根身份。 */
export function identityLocales(config: ProjectConfig): Record<IdentityLocale, LocalizedIdentity> {
  const fallback = { name: config.name, description: config.description }
  return {
    en: config.identityI18n?.translations.en ?? fallback,
    zh_CN: config.identityI18n?.translations.zh_CN ?? fallback
  }
}

/** 在创建前校验浏览器名称和说明长度，包括所有已提供翻译。 */
export function assertExtensionIdentity(config: ProjectConfig): void {
  if (config.projectType !== "extension") return
  for (const identity of Object.values(identityLocales(config))) {
    if (identity.name.length > 75) throw new Error("Extension name must be at most 75 characters")
    if (identity.description.length > 132)
      throw new Error("Extension description must be at most 132 characters")
  }
}

/** 生成被现有 i18next 消费的品牌模块，身份仅来自 project.json。 */
export function renderIdentityBrand(config: ProjectConfig): string {
  const locales = identityLocales(config)
  const identity = {
    en: { projectName: locales.en.name, projectDescription: locales.en.description },
    zh: { projectName: locales.zh_CN.name, projectDescription: locales.zh_CN.description }
  }
  const values = {
    name: config.name,
    id: config.id,
    description: config.description,
    primaryColor: config.brand.primaryColor,
    identity,
    ...(config.projectType === "web" ? { logoPath: "/logo.png" } : {})
  }
  return `/** 保存从项目事实派生的品牌与本地化身份。 */\nexport const BRAND = ${JSON.stringify(values, null, 2)} as const\n`
}

/** 生成浏览器消息引用，显式固定默认语言避免 Plasmo 按字母排序猜测。 */
export function extensionIdentityManifest(config: ProjectConfig): Record<string, string> {
  return {
    name: "__MSG_projectName__",
    description: "__MSG_projectDescription__",
    default_locale: config.identityI18n?.defaultLocale ?? "en"
  }
}

/** 将浏览器消息中的美元符号编码为字面量，避免被当成占位符。 */
function browserMessage(value: string): { message: string } {
  return { message: value.replaceAll("$", () => "$$") }
}

/** 保护 JSON 原始字节中的美元，防止 Plasmo 在解析前展开构建环境变量。 */
function serializeIdentityMessages(value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([key, entry]) => {
    const source = JSON.stringify(entry, null, 2) ?? "null"
    // 只保护受管身份键，其他产品消息保留 Plasmo 原有的公开环境插值行为。
    const encoded =
      key === "projectName" || key === "projectDescription"
        ? source.replaceAll("$", "\\u0024")
        : source
    return `  ${JSON.stringify(key)}: ${encoded.replaceAll("\n", "\n  ")}`
  })
  return `{\n${entries.join(",\n")}\n}\n`
}

/** 生成 Plasmo 根 locales 目录的消息文件，由构建器输出为 _locales。 */
export function extensionIdentityFiles(config: ProjectConfig): Map<string, string> {
  return new Map(
    Object.entries(identityLocales(config)).map(([locale, identity]) => [
      `locales/${locale}/messages.json`,
      serializeIdentityMessages({
        projectName: browserMessage(identity.name),
        projectDescription: browserMessage(identity.description)
      })
    ])
  )
}

/** 刷新受管消息键同时保留真实产品新增的其他浏览器消息。 */
export async function synchronizeIdentityLocales(
  root: string,
  config: ProjectConfig
): Promise<void> {
  for (const [relativePath, source] of extensionIdentityFiles(config)) {
    const filePath = path.join(root, relativePath)
    const existing = (await pathExists(filePath))
      ? await readJson<Record<string, unknown>>(filePath)
      : {}
    await writeAtomic(filePath, serializeIdentityMessages({ ...existing, ...JSON.parse(source) }))
  }
}

/** 验证源码或产物的身份消息，丢失和漂移均拒绝。 */
export async function validateIdentityLocales(
  root: string,
  config: ProjectConfig,
  prefix: "locales" | "_locales",
  errors: string[]
): Promise<void> {
  for (const [relativePath, expectedSource] of extensionIdentityFiles(config)) {
    const filePath = path.join(root, relativePath.replace(/^locales/, prefix))
    if (!(await pathExists(filePath))) {
      errors.push(`Missing identity locale: ${filePath}`)
      continue
    }
    const actual = await readJson<Record<string, unknown>>(filePath)
    const expected = JSON.parse(expectedSource) as Record<string, unknown>
    for (const key of ["projectName", "projectDescription"]) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
        errors.push(
          `Identity locale ${prefix}/${path.basename(path.dirname(filePath))}/${key} is stale`
        )
      }
    }
  }
}
