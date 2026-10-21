/** 枚举 Harness 工程路径的所有权模式。 */
export type OwnershipMode =
  "managed" | "managed-self" | "merge-sections" | "conditional" | "protected" | "tombstone"

/** 枚举三方升级计划的稳定分类。 */
export type UpgradeClassification =
  | "unchanged"
  | "converged"
  | "update"
  | "preserve_local"
  | "conflict"
  | "add"
  | "manual_add"
  | "delete"
  | "manual_merge"
  | "collision"
  | "bootstrap_conflict"
  | "blocked"

/** 描述一个路径所有权规则。 */
export interface OwnershipRule {
  /** 保存 POSIX 相对路径或包含 *、** 的模式。 */
  pattern: string
  /** 保存所有权模式。 */
  mode: OwnershipMode
  /** 表示精确路径必须出现在候选中。 */
  required?: boolean
}

/** 描述升级所有权清单。 */
export interface OwnershipManifest {
  /** 锁定所有权 schema。 */
  schemaVersion: 1
  /** 锁定未匹配路径的失败关闭默认值。 */
  defaultMode: "protected"
  /** 保存按优先顺序匹配的规则。 */
  rules: OwnershipRule[]
  /** 只在 Workspace 根生效的精确规则；不得用它改写成员或产品所有权。 */
  workspaceRules?: OwnershipRule[]
}

/** 描述单个普通文件的不可变快照。 */
export interface UpgradeFileSnapshot {
  /** 保存 SHA-256 内容摘要。 */
  sha256: string
  /** 保存普通权限位。 */
  mode: number
}

/** 描述 Git 仓库身份与脏状态绑定。 */
export interface UpgradeGitIdentity {
  /** 保存 Git 顶层。 */
  root: string
  /** 保存 HEAD OID。 */
  head: string
  /** 保存当前分支或 DETACHED。 */
  branch: string
  /** 保存完整 porcelain 状态。 */
  status: string
}

/** 描述一个计划路径的三方事实与分类。 */
export interface UpgradePlanEntry {
  /** 保存 POSIX 仓库相对路径。 */
  path: string
  /** 保存匹配的所有权。 */
  ownership: OwnershipMode
  /** 保存稳定分类。 */
  classification: UpgradeClassification
  /** 保存旧候选与旧目标双基线。 */
  baseline?: UpstreamLockEntry
  /** 保存新候选快照。 */
  candidate?: UpgradeFileSnapshot
  /** 保存当前目标快照。 */
  target?: UpgradeFileSnapshot
  /** 保存可复核原因。 */
  reason: string
}

/** 描述 plan/apply/record 全程绑定的升级计划。 */
export interface HarnessUpgradePlan {
  /** 锁定计划 schema。 */
  schemaVersion: 2
  /** 冻结 Workspace 成员绑定；旧单包没有该字段。 */
  workspace?: { id: string; members: { type: string; directory: string }[] }
  /** 保存规范化源 Harness 根。 */
  sourceRoot: string
  /** 保存声明源版本。 */
  sourceVersion: string
  /** 保存声明源提交。 */
  sourceCommit: string
  /** 保存规范化渲染候选根。 */
  candidateRoot: string
  /** 保存规范化终端下游根。 */
  targetRoot: string
  /** 保存所有权清单路径。 */
  ownershipPath: string
  /** 保存所有权清单的完整字节与权限快照。 */
  ownershipSnapshot: UpgradeFileSnapshot
  /** 保存下游 lock 路径。 */
  lockPath: string
  /** 保存计划创建时 lock 的完整快照；null 明确表示 bootstrap 时缺席。 */
  lockSnapshot: UpgradeFileSnapshot | null
  /** 保存源 Git 身份。 */
  sourceGit: UpgradeGitIdentity
  /** 保存目标 Git 身份（若目标是仓库）。 */
  targetGit?: UpgradeGitIdentity
  /** 表示计划是否基于首份 baseline。 */
  bootstrap: boolean
  /** 表示任一路径或结构问题是否阻断自动升级。 */
  blocked: boolean
  /** 表示是否存在必须人工逐路径收敛的变更。 */
  manualRequired: boolean
  /** 保存按路径稳定排序的结构性阻断原因。 */
  problems: string[]
  /** 保存按路径排序的分类。 */
  entries: UpgradePlanEntry[]
}

/** 描述 upstream lock 中的路径基线。 */
export interface UpstreamLockEntry {
  /** 保存记录时的所有权模式。 */
  ownership: OwnershipMode
  /** 保存旧 upstream 候选快照。 */
  candidate?: UpgradeFileSnapshot
  /** 保存旧下游目标快照。 */
  target?: UpgradeFileSnapshot
}

/** 描述下游已验证的 Harness 上游基线。 */
export interface UpstreamLock {
  /** 锁定 lock schema。 */
  schemaVersion: 1
  /** 保持根基线与原有 Workspace 拓扑绑定，不能复用旧单包 lock。 */
  workspace?: { id: string; members: { type: string; directory: string }[] }
  /** 保存已验证源版本。 */
  sourceVersion: string
  /** 保存已验证源提交。 */
  sourceCommit: string
  /** 保存受管理与混合路径基线。 */
  files: Record<string, UpstreamLockEntry>
}

/** 描述创建只读计划所需参数。 */
export interface CreateUpgradePlanOptions {
  /** 保存 clean 源 Harness 根。 */
  sourceRoot: string
  /** 保存声明源版本。 */
  sourceVersion: string
  /** 保存声明源提交。 */
  sourceCommit: string
  /** 保存针对目标渲染的候选根。 */
  candidateRoot: string
  /** 保存终端下游根。 */
  targetRoot: string
  /** 保存所有权清单路径。 */
  ownershipPath: string
  /** 保存下游 lock 路径。 */
  lockPath: string
}

/** 描述路径级自动应用参数。 */
export interface ApplyUpgradeOptions {
  /** 保存已复核计划文件。 */
  planPath: string
  /** 保存精确单个 repo-relative 路径。 */
  path: string
  /** 必须等于固定审批词。 */
  approval: string
}

/** 描述收敛后记录基线的参数。 */
export interface RecordUpgradeOptions {
  /** 保存已复核计划文件。 */
  planPath: string
  /** 保存声明源版本。 */
  sourceVersion: string
  /** 保存声明源提交。 */
  sourceCommit: string
  /** 表示建立首份人工核验基线。 */
  bootstrap: boolean
  /** 保存固定审批词。 */
  approval: string
  /** 保存人工合并后已复核路径。 */
  resolvedManual: string[]
}
