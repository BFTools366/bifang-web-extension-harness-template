import { readFileSync } from "node:fs"
import path from "node:path"
import { applicationFiles as assemble } from "../.agents/skills/web-compose-capabilities/templates/application/files.ts"
import type { ApplicationOptions } from "../.agents/skills/web-compose-capabilities/templates/application/contracts.ts"
import { resolveCapabilitySelection } from "../.agents/skills/web-compose-capabilities/scripts/capabilities.ts"

/** 只用于本仓库隔离测试的领域替身输入，不分发产品。 */
interface ApplicationFixtures {
  accounts?: { id: string; account: string; password: string; displayName: string }[]
  products?: {
    id: string
    name: string
    description: string
    category?: string
    price: { minor: number; currency: string }
  }[]
  grants?: { subjectId: string; organizationId?: string | null; codes: string[] }[]
  orders?: Record<
    string,
    {
      id: string
      productId: string
      total: { minor: number; currency: string }
      status: "paid" | "unpaid"
      requestId: string
    }[]
  >
  balances?: Record<string, { minor: number; currency: string }>
  organizations?: { id: string; name: string; ownerAccountId: string }[]
  organizationUsers?: {
    id: string
    accountId: string
    organizationId: string
    role: "owner" | "member"
  }[]
  audit?: { id: string; action: string; actor: string; occurredAt: string }[]
}
/** 旧状态机回归只在测试中把固定 fixtures 包成注入 adapter，产品不暴露 Mock 开关。 */
export type TestApplicationOptions = Omit<ApplicationOptions, "dataMode"> & {
  dataMode: "mock" | "adapter"
  fixtures?: ApplicationFixtures
}

/** 测试使用真实装配器，并只在测试结果 Map 内加入隔离领域替身。 */
export function applicationFiles(
  base: ReadonlyMap<string, string>,
  options: TestApplicationOptions
): Map<string, string> {
  if (options.dataMode === "adapter") return assemble(base, { ...options, dataMode: "adapter" })
  const selected = resolveCapabilitySelection(options.selection)
  const fixture = options.fixtures ?? {}
  const extras = new Map<string, string>()
  const adapters: Record<string, string> = {}
  const assets = path.resolve(import.meta.dirname, "fixtures/application-api")
  const actorImport = 'import { actor } from "../../../features/application/runtime"\n'
  for (const { id } of selected.modules) {
    const readonly =
      (id === "orders" && !selected.resolved.includes("orders.create")) ||
      (id === "wallet-payments" && !selected.resolved.includes("wallet-payments.pay"))
    const file = readonly ? "readMock" : "mock"
    extras.set(
      `src/data/api/${id}/${file}.ts`,
      readFileSync(path.join(assets, id, `${file}.ts.txt`), "utf8")
    )
    if (id === "identity")
      adapters[id] =
        `import { createIdentityMock } from "./mock"\nexport const api = createIdentityMock(${JSON.stringify(fixture.accounts ?? [])})\n`
    if (id === "catalog")
      adapters[id] =
        `import { createCatalogMock } from "./mock"\nexport const api = createCatalogMock(${JSON.stringify(fixture.products ?? [])})\n`
    if (id === "permissions")
      adapters[id] =
        `import { createPermissionMock } from "./mock"\nexport const permissionMock = createPermissionMock(${JSON.stringify(fixture.grants ?? [])})\nexport const api = permissionMock.api\n`
    if (id === "orders")
      adapters[id] =
        actorImport +
        (readonly
          ? `import { createOrdersReadMock } from "./readMock"\nexport const api = createOrdersReadMock(() => actor(), ${JSON.stringify(fixture.orders ?? {})})\n`
          : `import { createOrdersMock } from "./mock"\nexport const ordersMock = createOrdersMock(() => actor(), ${JSON.stringify(fixture.products ?? [])})\nexport const api = ordersMock.api\n`)
    if (id === "wallet-payments")
      adapters[id] =
        actorImport +
        (readonly
          ? `import { createWalletReadMock } from "./readMock"\nexport const api = createWalletReadMock(() => actor(), ${JSON.stringify(fixture.balances ?? {})})\n`
          : `import { createWalletMock } from "./mock"\nimport { ordersMock } from "../orders/adapter"\nexport const api = createWalletMock(() => actor(), ${JSON.stringify(fixture.balances ?? {})}, ordersMock.settle)\n`)
    if (id === "organization")
      adapters[id] =
        `import { actor, identityActor${selected.resolved.includes("permissions.enforce") ? ", canAct" : ""} } from "../../../features/application/runtime"\n` +
        `import { createOrganizationMock } from "./mock"\nexport const api = createOrganizationMock(() => identityActor(), ${JSON.stringify(fixture.organizations ?? [])}, ${JSON.stringify(fixture.organizationUsers ?? [])}, (user) => user.id === actor() && ${selected.resolved.includes("permissions.enforce") ? 'canAct("team.settings.update")' : "false"})\n`
    if (id === "audit")
      adapters[id] =
        actorImport +
        `import { createAuditMock } from "./mock"\nexport const api = createAuditMock(() => actor(), ${JSON.stringify(fixture.audit ?? [])})\n`
  }
  const result = assemble(base, { ...options, dataMode: "adapter", adapters })
  for (const [file, source] of extras) result.set(file, source)
  if (selected.modules.some((item) => item.id === "permissions")) {
    const runtime = "src/features/application/runtime.ts"
    result.set(
      runtime,
      result.get(runtime) +
        '\nexport { permissionMock } from "../../data/api/permissions/adapter"\n'
    )
  }
  return result
}
