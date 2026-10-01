/** 枚举并行 Worktree helper 支持的命令。 */
export type ParallelWorktreeCommand = "inspect" | "create" | "guard" | "verify" | "remove"

/** 描述单个登记的并行写入单元。 */
export interface ParallelWorktreeUnit {
  task: string
  unit: string
  sourceWorktree: string
  worktreePath: string
  sourceBranch: string
  branch: string
  baseHead: string
  writeTargets: string[]
  expectedUnits: number
  createdAt: string
  verifiedHead?: string
}

/** 描述 Git common-dir 中的 helper 私有登记。 */
export interface ParallelWorktreeRegistry {
  schemaVersion: 1
  commonDir: string
  units: Record<string, ParallelWorktreeUnit>
}

/** 描述 guard/verify/remove 共用的单元选择。 */
export interface ParallelWorktreeSelection {
  projectRoot: string
  sourceWorktree: string
  task: string
  unit: string
  executionRoot?: string
}

/** 描述 create 命令所需的全部授权和身份。 */
export interface CreateParallelWorktreeOptions extends ParallelWorktreeSelection {
  writeTargets: string[]
  expectedUnits: number
  userRequested: boolean
  policy: "enabled" | "disabled"
}

/** 描述 guard 附加的意图路径。 */
export type GuardParallelWorktreeOptions = ParallelWorktreeSelection & { writeTargets: string[] }

/** 描述保守清理所需的精确整合 ref。 */
export type RemoveParallelWorktreeOptions = ParallelWorktreeSelection & { integratedInto: string }

/** 描述规范化 Git Worktree 与 common-dir。 */
export interface GitWorktreeIdentity {
  topLevel: string
  commonDir: string
}

/** 描述 Git porcelain 中登记的单个 Worktree，并保留 Git 返回的全部字段。 */
export interface GitWorktreeRecord {
  worktree: string
  branch?: string
  prunable?: string | true
  [key: string]: string | true | undefined
}

/** 枚举 helper 登记无法与可用 Git Worktree 精确对应的原因。 */
export type StaleReason = "missing_git_worktree" | "branch_mismatch" | "prunable_git_worktree"
