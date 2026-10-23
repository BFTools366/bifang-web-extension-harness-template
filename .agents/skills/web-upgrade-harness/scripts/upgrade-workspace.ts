import path from "node:path"
import { lstat } from "node:fs/promises"
import { readBoundFileStable } from "./upgrade-mutation.ts"
import { REQUIRED_MANAGED_SOURCE_PATHS } from "./upgrade-policy.ts"
import type { OwnershipManifest, OwnershipRule, UpgradeFileSnapshot } from "./upgrade-types.ts"

/** 保存 Workspace 根独有、不能传播进前端成员的最低工程规则。 */
export const WORKSPACE_OWNERSHIP_RULES: readonly OwnershipRule[] = [
  ...["workspace.mjs", "release.mjs", "archive.mjs"].map((name) => ({
    pattern: `.harness/runtime/${name}`,
    mode: "managed" as const,
    required: true
  }))
]

/** 只给已知旧规则追加缺失项；未知、乱序、重复或扩大权限的规则必须人工审查。 */
export function missingWorkspaceOwnership(
  rules: readonly OwnershipRule[] | undefined
): OwnershipRule[] {
  if (rules === undefined) return [...WORKSPACE_OWNERSHIP_RULES]
  if (
    !Array.isArray(rules) ||
    rules.length > WORKSPACE_OWNERSHIP_RULES.length ||
    rules.some((rule, index) => {
      const expected = WORKSPACE_OWNERSHIP_RULES[index]
      return (
        !rule ||
        rule.pattern !== expected?.pattern ||
        rule.mode !== "managed" ||
        rule.required !== true
      )
    })
  )
    throw new Error("Workspace ownership conflicts with the exact reviewed workspaceRules")
  return WORKSPACE_OWNERSHIP_RULES.slice(rules.length)
}

/** 描述被精确身份锁定的前端成员。 */
export interface UpgradeFrontend {
  /** 保存实际成员目录。 */
  directory: string
  /** 保存唯一宿主。 */
  type: "web" | "extension"
  /** 保存读取时的完整项目身份。 */
  project: Record<string, unknown>
}

/** 描述升级时只读解析的 Workspace 身份。 */
export interface UpgradeWorkspace {
  /** 固定拓扑协议。 */
  schemaVersion: 1
  /** 固定工作区种类。 */
  kind: "workspace"
  /** 保存稳定根身份。 */
  id: string
  /** 保存展示名称。 */
  name: string
  /** 保存原始创建时间。 */
  initializedAt: string
  /** 保存原有成员，升级不得增删。 */
  members: { type: "web" | "extension" | "server"; directory: string }[]
  /** 保留服务归属及开发地址。 */
  service: { mode: "create" | "existing" | "none"; developmentBaseUrl: string }
}

/** 描述计划使用的路径所有权、身份和宿主边界。 */
export interface UpgradeTargetContext {
  /** 保存按 Workspace 前缀展开的目标本地规则。 */
  manifest: OwnershipManifest
  /** 保存需要全程冻结的根与成员身份。 */
  identities: Map<string, UpgradeFileSnapshot>
  /** 保存前端成员；旧单包使用空目录前缀。 */
  frontends: UpgradeFrontend[]
  /** 保存当前 Workspace；缺席表示旧单包。 */
  workspace?: UpgradeWorkspace
}

/** 拒绝额外覆盖规则，避免把 Workspace 支持变成降低所有权的入口。 */
export function validateWorkspaceOwnership(manifest: OwnershipManifest): void {
  const rules = manifest.workspaceRules
  if (
    !Array.isArray(rules) ||
    rules.length !== WORKSPACE_OWNERSHIP_RULES.length ||
    rules.some((rule, index) => {
      const expected = WORKSPACE_OWNERSHIP_RULES[index]
      return rule.pattern !== expected?.pattern || rule.mode !== "managed" || rule.required !== true
    })
  )
    throw new Error("Workspace ownership requires the exact reviewed workspaceRules")
}

/** 读取普通 JSON 身份，同时保存其完整快照。 */
async function identity(root: string, file: string, identities: Map<string, UpgradeFileSnapshot>) {
  const bound = await readBoundFileStable(root, file)
  if (!bound.bytes || !bound.snapshot) throw new Error(`Target identity is missing: ${file}`)
  identities.set(file, bound.snapshot)
  const value: unknown = JSON.parse(bound.bytes.toString("utf8"))
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid target identity: ${file}`)
  return value as Record<string, unknown>
}

/** 只接受原有标准成员，不猜目录、不创建成员、不访问 Go 配置。 */
export async function loadUpgradeTargetContext(
  targetRoot: string,
  manifest: OwnershipManifest
): Promise<UpgradeTargetContext> {
  const identities = new Map<string, UpgradeFileSnapshot>()
  const workspaceFile = await readBoundFileStable(
    targetRoot,
    ".harness/workspace.json",
    undefined,
    true
  )
  if (!workspaceFile.exists) {
    const parentWorkspace = await lstat(
      path.join(path.dirname(targetRoot), ".harness/workspace.json")
    ).catch((error: unknown) => {
      if ((error as { code?: string }).code === "ENOENT") return undefined
      throw error
    })
    if (parentWorkspace)
      throw new Error("Workspace upgrades must start at the Git root, not a member")
    const project = await identity(targetRoot, ".harness/project.json", identities)
    if (project.projectType !== "web" && project.projectType !== "extension")
      throw new Error("Target projectType must be web or extension")
    return {
      manifest,
      identities,
      frontends: [{ directory: "", type: project.projectType, project }]
    }
  }
  validateWorkspaceOwnership(manifest)
  const raw = await identity(targetRoot, ".harness/workspace.json", identities)
  if (
    raw.schemaVersion !== 1 ||
    raw.kind !== "workspace" ||
    typeof raw.id !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(raw.id) ||
    typeof raw.name !== "string" ||
    typeof raw.initializedAt !== "string" ||
    !Array.isArray(raw.members) ||
    !raw.members.length ||
    !raw.service ||
    typeof raw.service !== "object"
  )
    throw new Error("Invalid Workspace identity")
  const service = raw.service as Record<string, unknown>
  if (
    !["create", "existing", "none"].includes(String(service.mode)) ||
    typeof service.developmentBaseUrl !== "string"
  )
    throw new Error("Invalid Workspace service")
  if (service.mode === "none" && (service.developmentBaseUrl !== "" || service.apiContract))
    throw new Error("Local Workspace cannot configure remote services")
  const seen = new Set<string>()
  const frontends: UpgradeFrontend[] = []
  for (const item of raw.members) {
    const member = item as Record<string, unknown> | null
    if (
      !member ||
      !["web", "extension", "server"].includes(String(member.type)) ||
      seen.has(String(member.type)) ||
      member.directory !== `${raw.id}_${member.type}`
    )
      throw new Error("Invalid or duplicate Workspace member")
    seen.add(String(member.type))
    const directory = String(member.directory)
    const status = await lstat(path.join(targetRoot, directory))
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Unsafe Workspace member")
    const nestedGit = await lstat(path.join(targetRoot, directory, ".git")).catch(
      (error: unknown) => {
        if ((error as { code?: string }).code === "ENOENT") return undefined
        throw error
      }
    )
    if (nestedGit) throw new Error("Workspace member must not own a nested Git repository")
    if (member.type === "server") continue
    const project = await identity(targetRoot, `${directory}/.harness/project.json`, identities)
    if (
      project.id !== directory ||
      project.projectType !== member.type ||
      project.schemaVersion !== 1
    )
      throw new Error("Workspace frontend identity does not match its registered member")
    frontends.push({ directory, type: member.type as "web" | "extension", project })
  }
  if (seen.has("server") !== (service.mode === "create"))
    throw new Error("Workspace service ownership does not match its members")
  const rootRules = manifest.rules.map((rule) => ({
    ...rule,
    required:
      rule.required === true && ["AGENTS.md", "README.md", "package.json"].includes(rule.pattern)
  }))
  const memberRules = frontends.flatMap((member) => [
    ...[
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      ".harness/upstream-lock.json",
      ".harness/workspace.json"
    ].map((file) => ({
      pattern: `${member.directory}/${file}`,
      mode: "tombstone" as const
    })),
    ...manifest.rules.map((rule) => ({ ...rule, pattern: `${member.directory}/${rule.pattern}` }))
  ])
  return {
    manifest: {
      ...manifest,
      rules: [
        ...WORKSPACE_OWNERSHIP_RULES,
        { pattern: ".harness/runtime", mode: "managed" },
        ...raw.members
          .filter((member) => member.type === "server")
          .map((member) => ({
            pattern: `${member.directory}/**`,
            mode: "protected" as const
          })),
        ...rootRules,
        ...memberRules
      ]
    },
    identities,
    frontends,
    workspace: raw as unknown as UpgradeWorkspace
  }
}

/** 将源文件对应到当前拓扑的必要投影路径，根不注入整套前端工具。 */
export function requiredWorkspaceSourcePaths(context: UpgradeTargetContext) {
  const paths: { source: string; target: string }[] = []
  const selfPaths = [
    ".agents/skills/web-upgrade-harness/scripts/upgrade-workspace.ts",
    ".agents/skills/web-upgrade-harness/references/workspace-upgrade.md",
    ".agents/skills/web-upgrade-harness/scripts/prepare-go-release.ts",
    ".agents/skills/web-upgrade-harness/references/go-release-migration.md"
  ]
  for (const prefix of context.workspace
    ? ["", ...context.frontends.map((member) => member.directory)]
    : [""])
    for (const source of selfPaths)
      paths.push({ source, target: prefix ? `${prefix}/${source}` : source })
  if (context.workspace) {
    for (const source of REQUIRED_MANAGED_SOURCE_PATHS) {
      if (
        source.startsWith(".agents/skills/") ||
        [
          ".harness/tooling/args.ts",
          ".harness/tooling/files.ts",
          ".harness/tooling/logo.ts",
          ".harness/tooling/identity.ts",
          ".harness/tooling/workspace-context.ts",
          "docs/WORKSPACE_TEMPLATE.md",
          "docs/GO_SERVICE.md",
          "docs/ACCOUNT_OWNERSHIP.md",
          "docs/GO_CLIENT_CONTRACT.md"
        ].includes(source)
      )
        paths.push({ source, target: source })
    }
    for (const rule of WORKSPACE_OWNERSHIP_RULES)
      paths.push({ source: rule.pattern, target: rule.pattern })
  }
  for (const member of context.frontends) {
    for (const source of REQUIRED_MANAGED_SOURCE_PATHS)
      paths.push({ source, target: member.directory ? `${member.directory}/${source}` : source })
  }
  return paths
}
