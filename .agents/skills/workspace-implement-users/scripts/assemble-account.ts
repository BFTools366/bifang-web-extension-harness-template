import { readFileSync } from "node:fs"
import { applicationFiles } from "../../web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../../web-compose-capabilities/templates/application/contracts.ts"

/** 自建 Go 用户系统的唯一前端装配入口；必须保留调用方真实首页和业务权限要求。 */
export function goAccountApplicationFiles(
  base: ReadonlyMap<string, string>,
  options: ApplicationOptions
): Map<string, string> {
  /** 模板只从当前技能树读取，不依赖调用者工作目录。 */
  function source(relative: string): string {
    return readFileSync(new URL(relative, import.meta.url), "utf8")
  }
  if (options.selection.modules || options.selection.recipe)
    throw new Error("完整账号装配必须传入明确 operations，不能混用模块默认或 recipe")
  const operations = options.selection.operations ?? []
  const selected = {
    ...options.selection,
    operations: [
      ...new Set([
        "identity.session",
        "identity.profile",
        "identity.password.change",
        "organization.switch",
        "permissions.enforce",
        ...operations,
        ...(operations.includes("identity.register") ? ["identity.verification"] : [])
      ])
    ]
  }
  const files = applicationFiles(base, {
    ...options,
    selection: selected,
    adapters: {
      ...options.adapters,
      identity: source("../assets/go-identity-adapter.ts.txt"),
      organization: source("../../workspace-implement-organizations/assets/go-team-adapter.ts.txt"),
      permissions: source(
        "../../workspace-implement-permissions/assets/go-permission-adapter.ts.txt"
      )
    },
    pagePermissions: options.pagePermissions,
    actionPermissions: options.actionPermissions
  })
  const additions: Record<string, string> = {
    "src/data/api/client/goTransport.ts": source("../assets/go-transport.ts.txt"),
    "src/data/api/identity/verification.ts": source("../assets/registration-verification.ts.txt"),
    "src/data/api/identity/goContract.ts": source(
      "../../web-compose-capabilities/templates/compositions/account-workspace/data/api/auth/serviceContract.ts.txt"
    ),
    "src/data/api/foundationProtocol.ts": source(
      "../../web-compose-capabilities/templates/compositions/account-workspace/data/api/foundationProtocol.ts.txt"
    )
  }
  for (const [name, value] of Object.entries(additions)) {
    const existing = files.get(name)
    if (existing !== undefined && existing !== value)
      throw new Error("保留已有传输或协议实现：" + name)
    files.set(name, value)
  }
  const runtimePath = "src/data/api/client/httpRuntime.ts"
  const runtime = files.get(runtimePath)
  if (!runtime) throw new Error("缺少受管 HTTP owner")
  if (!runtime.includes('import { requestGoTransport } from "./goTransport"')) {
    const anchor = "client ??= createHttpClient({"
    if (runtime.split(anchor).length !== 2)
      throw new Error("HTTP owner 已变化，需要增量接入 Go 传输")
    files.set(
      runtimePath,
      'import { requestGoTransport } from "./goTransport"\n' +
        runtime.replace(anchor, anchor + "\n    fetch: requestGoTransport,")
    )
  } else if (!runtime.includes("fetch: requestGoTransport"))
    throw new Error("Go 传输未接入唯一 HTTP owner")
  return files
}
