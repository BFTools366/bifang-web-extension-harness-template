import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** 描述固定设计、代码接线与历史演示资源。 */
export interface CapabilityTemplate {
  path: string
  kind: "code" | "design" | "demo"
  hosts: string[]
}
/** 记录具体操作及其最小依赖，不能从模块名称扩大操作范围。 */
export interface CapabilityOperation {
  id: string
  requires: string[]
  internal?: boolean
}
/** 描述独立能力及默认基础操作。 */
export interface CapabilityModule {
  id: string
  title: string
  knowledge: string
  templates: CapabilityTemplate[]
  defaultOperations: string[]
  operations: CapabilityOperation[]
}
/** 描述显式组合，而不是按产品名称推断的功能包。 */
interface Recipe {
  id: string
  modules: string[]
  operations: string[]
  templates: CapabilityTemplate[]
}
/** 描述唯一能力索引与基础应用模板。 */
export interface CapabilityCatalog {
  schemaVersion: number
  application: CapabilityTemplate[]
  modules: CapabilityModule[]
  recipes: Recipe[]
}
/** 约束当前解析输入，不产生文件或授予外部副作用。 */
export interface CapabilityRequest {
  host: "web" | "extension"
  modules?: readonly string[]
  operations?: readonly string[]
  recipe?: string
}
/** 输出显式要求、依赖原因和可装配资源，供需求与实施复用。 */
export interface CapabilitySelection {
  host: "web" | "extension"
  requested: string[]
  resolved: string[]
  requiredBy: Record<string, string[]>
  application: CapabilityTemplate[]
  modules: CapabilityModule[]
  recipe?: Recipe
}
/** 指向当前技能资源根，支持从任意工作目录执行。 */
const resourceRoot = fileURLToPath(new URL("../", import.meta.url))

/** 拒绝绝对路径、目录逃逸、符号链接逃逸及缺失资源。 */
function resource(relative: string, root: string): string {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/u).includes("..")
  )
    throw new Error(`非法资源：${relative}`)
  const resolved = realpathSync(path.join(root, relative))
  if (!resolved.startsWith(root + path.sep)) throw new Error(`资源越界：${relative}`)
  if (!statSync(resolved).isFile()) throw new Error(`资源必须是普通文件：${relative}`)
  return relative
}

/** 验证模板类型、宿主及固定设计和代码接线确实存在。 */
function validateTemplates(templates: CapabilityTemplate[], root: string): void {
  if (!Array.isArray(templates) || templates.length === 0) throw new Error("模板索引为空")
  for (const template of templates) {
    if (
      !template ||
      !["code", "design", "demo"].includes(template.kind) ||
      !Array.isArray(template.hosts) ||
      template.hosts.length === 0 ||
      template.hosts.some((host) => !["web", "extension"].includes(host))
    )
      throw new Error("模板类型或宿主无效")
    resource(template.path, root)
  }
}

/** 验证操作依赖可解析且无环，依赖不允许隐藏在说明文字中。 */
function operationGraph(catalog: CapabilityCatalog): Map<string, CapabilityOperation> {
  const graph = new Map<string, CapabilityOperation>()
  for (const module of catalog.modules) {
    if (
      !Array.isArray(module.operations) ||
      module.operations.length === 0 ||
      !Array.isArray(module.defaultOperations) ||
      module.defaultOperations.length === 0
    )
      throw new Error("能力必须声明基础操作")
    for (const operation of module.operations) {
      if (
        !operation ||
        typeof operation.id !== "string" ||
        !operation.id.startsWith(module.id + ".") ||
        graph.has(operation.id) ||
        !Array.isArray(operation.requires) ||
        new Set(operation.requires).size !== operation.requires.length
      )
        throw new Error("能力操作身份或依赖无效")
      graph.set(operation.id, operation)
    }
    if (module.defaultOperations.some((id) => !module.operations.some((item) => item.id === id)))
      throw new Error("默认操作必须属于当前能力")
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  /** 深度校验所有分支，未选操作中的损坏依赖也应阻断结构门禁。 */
  function visit(id: string): void {
    if (active.has(id)) throw new Error(`能力操作依赖存在循环：${id}`)
    if (visited.has(id)) return
    const operation = graph.get(id)
    if (!operation) throw new Error(`未知能力操作：${id}`)
    active.add(id)
    for (const dependency of operation.requires) visit(dependency)
    active.delete(id)
    visited.add(id)
  }
  for (const id of graph.keys()) visit(id)
  return graph
}

/** 验证源与下游共同使用的唯一能力索引。 */
export function readCapabilityCatalog(root = resourceRoot): CapabilityCatalog {
  return loadCatalog(root).catalog
}

/** 读取并完整校验索引，同时返回已校验的操作图，避免调用方重复构建。 */
function loadCatalog(requestedRoot: string): {
  catalog: CapabilityCatalog
  graph: Map<string, CapabilityOperation>
} {
  // 资源越界判定统一基于真实根路径，只解析一次。
  const root = realpathSync(requestedRoot)
  const catalog = JSON.parse(
    readFileSync(path.join(root, "catalog.json"), "utf8")
  ) as CapabilityCatalog
  if (
    catalog.schemaVersion !== 2 ||
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
  validateTemplates(catalog.application, root)
  if (new Set(catalog.recipes.map((item) => item.id)).size !== catalog.recipes.length)
    throw new Error("组合标识重复")
  for (const item of [...catalog.modules, ...catalog.recipes])
    validateTemplates(item.templates, root)
  for (const module of catalog.modules) {
    resource(module.knowledge, root)
    for (const host of ["web", "extension"]) {
      for (const kind of ["design", "code"]) {
        if (!module.templates.some((item) => item.kind === kind && item.hosts.includes(host)))
          throw new Error(`${module.id} 缺少 ${host} 固定设计或代码接线`)
      }
    }
  }
  const graph = operationGraph(catalog)
  for (const recipe of catalog.recipes) {
    if (
      !Array.isArray(recipe.modules) ||
      recipe.modules.length === 0 ||
      new Set(recipe.modules).size !== recipe.modules.length ||
      recipe.modules.some((id) => !ids.includes(id)) ||
      !Array.isArray(recipe.operations) ||
      recipe.operations.length === 0 ||
      recipe.operations.some((id) => !graph.has(id))
    )
      throw new Error("组合依赖无效")
  }
  return { catalog, graph }
}

/** 同一进程内的解析复用已校验索引；结构门禁仍通过 readCapabilityCatalog 每次重读。 */
const selectionCatalogs = new Map<string, ReturnType<typeof loadCatalog>>()

/** 只补具体操作的明确依赖，保留原因，不隐式加入组织、注册或找回。 */
export function resolveCapabilitySelection(
  request: CapabilityRequest,
  root = resourceRoot
): CapabilitySelection {
  let loaded = selectionCatalogs.get(root)
  if (!loaded) selectionCatalogs.set(root, (loaded = loadCatalog(root)))
  const { catalog, graph } = loaded
  if (!["web", "extension"].includes(request.host)) throw new Error("必须明确宿主 web|extension")
  if (
    [request.modules, request.operations, request.recipe].filter((item) => item !== undefined)
      .length !== 1
  )
    throw new Error("必须且只能选择 modules、operations 或 recipe")
  const recipe =
    request.recipe === undefined
      ? undefined
      : catalog.recipes.find((item) => item.id === request.recipe)
  if (request.recipe !== undefined && !recipe) throw new Error(`未知组合：${request.recipe}`)
  if (recipe?.templates.some((item) => item.kind !== "demo" && !item.hosts.includes(request.host)))
    throw new Error(`组合 ${recipe.id} 不支持 ${request.host}`)
  const requested =
    recipe?.operations ??
    (request.modules === undefined
      ? [...(request.operations ?? [])]
      : request.modules.flatMap((id) => {
          const module = catalog.modules.find((item) => item.id === id)
          if (!module) throw new Error(`未知模块：${id}`)
          return module.defaultOperations
        }))
  if (
    requested.some((id) => !id) ||
    new Set(requested).size !== requested.length ||
    (request.modules !== undefined && new Set(request.modules).size !== request.modules.length)
  )
    throw new Error("模块或操作不能为空或重复")
  for (const id of requested)
    if (graph.get(id)?.internal)
      throw new Error(`内部接线操作不能独立选择：${id}，请选择 orders.purchase`)
  const resolved: string[] = []
  const requiredBy: Record<string, string[]> = Object.create(null)
  /** 按依赖先于使用者的稳定顺序装配，同一依赖只返回一次。 */
  function include(id: string, owner?: string): void {
    const operation = graph.get(id)
    if (!operation) throw new Error(`未知能力操作：${id}`)
    if (owner) {
      const reasons = (requiredBy[id] ??= [])
      if (!reasons.includes(owner)) reasons.push(owner)
    }
    if (resolved.includes(id)) return
    for (const dependency of operation.requires) include(dependency, id)
    resolved.push(id)
  }
  for (const id of requested) include(id)
  const templates = (items: CapabilityTemplate[]) =>
    items.filter((item) => item.hosts.includes(request.host))
  const moduleIds = new Set(resolved.map((id) => id.split(".")[0]))
  return {
    host: request.host,
    requested: [...requested],
    resolved,
    requiredBy,
    application: templates(catalog.application),
    modules: catalog.modules
      .filter((module) => moduleIds.has(module.id))
      .map((module) => ({ ...module, templates: templates(module.templates) })),
    ...(recipe ? { recipe: { ...recipe, templates: templates(recipe.templates) } } : {})
  }
}

/** 提供只读 CLI，空模块选择表示仅基础应用，仍须由实施提供真实首页。 */
export function selectCapabilities(args: string[]): unknown {
  if (args.length === 1 && args[0] === "list") return readCapabilityCatalog()
  if (args[0] !== "resolve")
    throw new Error(
      "用法：list | resolve --host web|extension --modules <ids> | --operations <ids> | --recipe <id>"
    )
  const options = new Map<string, string>()
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1]
    if (
      !key ||
      !["--host", "--modules", "--operations", "--recipe"].includes(key) ||
      value === undefined ||
      value.startsWith("--") ||
      options.has(key)
    )
      throw new Error("无效或重复参数")
    options.set(key, value)
  }
  const host = options.get("--host")
  if (host !== "web" && host !== "extension") throw new Error("必须明确宿主 web|extension")
  const split = (value: string) => (value === "" ? [] : value.split(","))
  return resolveCapabilitySelection({
    host,
    ...(options.has("--modules") ? { modules: split(options.get("--modules") ?? "") } : {}),
    ...(options.has("--operations")
      ? { operations: split(options.get("--operations") ?? "") }
      : {}),
    ...(options.has("--recipe") ? { recipe: options.get("--recipe") } : {})
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(selectCapabilities(process.argv.slice(2)), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
