import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** 描述模板类型与可使用的宿主。 */
interface Template {
  path: string
  kind: "code" | "design" | "demo"
  hosts: string[]
}
/** 描述模块知识与独立模板。 */
interface Module {
  id: string
  title: string
  knowledge: string
  templates: Template[]
}
/** 描述显式组合所需模块与模板。 */
interface Recipe {
  id: string
  modules: string[]
  templates: Template[]
}
/** 描述唯一模块索引。 */
interface Catalog {
  schemaVersion: number
  modules: Module[]
  recipes: Recipe[]
}
/** 指向当前技能资源根，支持从任意工作目录执行。 */
const resourceRoot = fileURLToPath(new URL("../", import.meta.url))

/** 拒绝目录逃逸、符号链接逃逸及缺失资源。 */
function resource(relative: string, root = resourceRoot): string {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/u).includes(".."))
    throw new Error(`非法资源：${relative}`)
  const resolved = realpathSync(path.join(root, relative))
  if (!resolved.startsWith(realpathSync(root) + path.sep)) throw new Error(`资源越界：${relative}`)
  if (!statSync(resolved).isFile()) throw new Error(`资源必须是普通文件：${relative}`)
  return relative
}

/** 验证整个索引的身份、类型、宿主和直接资源，供源及下游结构门禁复用。 */
export function readCapabilityCatalog(root = resourceRoot): Catalog {
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog.json"), "utf8")) as Catalog
  if (
    catalog.schemaVersion !== 1 ||
    !Array.isArray(catalog.modules) ||
    !Array.isArray(catalog.recipes)
  )
    throw new Error("模块索引结构无效")
  const expected = [
    "identity",
    "organization",
    "permissions",
    "catalog",
    "orders",
    "wallet-payments",
    "audit"
  ]
  const ids = catalog.modules.map((item) => item.id)
  if (
    ids.length !== expected.length ||
    new Set(ids).size !== ids.length ||
    expected.some((id) => !ids.includes(id))
  )
    throw new Error("模块索引身份无效")
  const recipeIds = catalog.recipes.map((item) => item.id)
  if (new Set(recipeIds).size !== recipeIds.length) throw new Error("组合标识重复")
  for (const item of [...catalog.modules, ...catalog.recipes]) {
    if (!Array.isArray(item.templates) || item.templates.length === 0)
      throw new Error("模板索引为空")
    for (const template of item.templates) {
      if (
        !["code", "design", "demo"].includes(template.kind) ||
        !Array.isArray(template.hosts) ||
        template.hosts.length === 0 ||
        template.hosts.some((host) => !["web", "extension"].includes(host))
      )
        throw new Error("模板类型或宿主无效")
      resource(template.path, root)
    }
  }
  for (const module of catalog.modules) resource(module.knowledge, root)
  for (const recipe of catalog.recipes) {
    if (
      !Array.isArray(recipe.modules) ||
      recipe.modules.length === 0 ||
      new Set(recipe.modules).size !== recipe.modules.length ||
      recipe.modules.some((id) => !ids.includes(id))
    )
      throw new Error("组合依赖无效")
  }
  return catalog
}

/** 仅解析所选资源，不写文件、不启用模块。 */
export function selectCapabilities(args: string[]): unknown {
  const catalog = readCapabilityCatalog()
  if (args.length === 1 && args[0] === "list") return catalog
  if (args[0] !== "resolve")
    throw new Error("用法：list | resolve --host web|extension --modules <ids> | --recipe <id>")
  const options = new Map<string, string>()
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1]
    if (
      !key ||
      !["--host", "--modules", "--recipe"].includes(key) ||
      !value ||
      value.startsWith("--") ||
      options.has(key)
    )
      throw new Error("无效或重复参数")
    options.set(key, value)
  }
  const host = options.get("--host")
  if (host !== "web" && host !== "extension") throw new Error("必须明确宿主 web|extension")
  const recipeId = options.get("--recipe")
  const recipe = catalog.recipes.find((item) => item.id === recipeId)
  if (recipeId !== undefined && !recipe) throw new Error(`未知组合：${recipeId}`)
  if (options.has("--modules") === Boolean(recipe))
    throw new Error("必须且只能选择 --modules 或 --recipe")
  const ids = recipe?.modules ?? options.get("--modules")?.split(",")
  if (!ids) throw new Error("缺少模块选择")
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new Error("模块不能为空或重复")
  const templates = (items: Template[]) =>
    items
      .filter((item) => item.hosts.includes(host))
      .map((item) => ({ ...item, path: resource(item.path) }))
  if (recipe && recipe.templates.some((item) => !item.hosts.includes(host)))
    throw new Error(`组合 ${recipe.id} 不支持 ${host}`)
  const modules = ids.map((id) => {
    const item = catalog.modules.find((module) => module.id === id)
    if (!item) throw new Error(`未知模块：${id}`)
    return { ...item, knowledge: resource(item.knowledge), templates: templates(item.templates) }
  })
  return {
    host,
    modules,
    recipe: recipe ? { ...recipe, templates: templates(recipe.templates) } : undefined
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(selectCapabilities(process.argv.slice(2)), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
