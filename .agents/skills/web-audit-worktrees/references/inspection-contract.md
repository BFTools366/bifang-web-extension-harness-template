# Worktree 审计执行契约

## 身份与命令

复用项目内既有 `.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts`，不复制 helper。`--project-root` 必须是保存项目的 primary checkout，等于其真实 Git 顶层，并对应 `git worktree list --porcelain` 的首个记录。helper 同时绑定真实 common-dir；拒绝符号链接根。

从 primary checkout 的精确 cwd 执行：

```text
pnpm exec tsx .agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts inspect \
  --project-root <primary>
```

`inspect` 只接受 `--project-root`；不传入其他子命令的 flag。linked Worktree 或其他 cwd 即使属于同一仓库也不能代替 primary。Git 查询关闭 optional locks，避免状态查询刷新索引；不修改工作区、Git 登记或 helper registry。registry 不存在时读取为空，不创建目录。

## 输出与解释

stdout 始终是一个 JSON 对象。成功包含 `ok: true`、`operation: inspect`、`projectRoot`、`commonDir`、`clean`、`branch`、`head`、`worktrees`、`units`、`orphanWorktrees`、`staleUnits`。

- `worktrees`：Git porcelain 的全部登记，包含原始身份与 prunable 等字段。
- `units`：helper registry 中已登记的内部并行单元；与 Git 登记逐项比对。
- `orphanWorktrees`：位于既有受管候选范围、但没有 helper 单元登记的 Worktree，可能需要恢复调查。
- `staleUnits`：登记的 Worktree 已缺失、分支不匹配或被 Git 标为 prunable；原因分别为 `missing_git_worktree`、`branch_mismatch`、`prunable_git_worktree`。

成功退出 0；参数错误退出 2，执行失败退出 4。失败 stdout 为 `{ "ok": false, "error": { "code": "...", "message": "..." } }`，不能将失败或缺失输出解释为空集合，不解析任意 stderr 文本。

`orphanWorktrees` 与 `staleUnits` 不是可删除列表。审计不证明 `verifiedHead`、所有权、祖先关系或整合完成。后续只有原并行流程重新满足精确登记、clean、HEAD 未漂移和父分支祖先门禁，才可保守清理；不按目录/分支前缀批量删除，不清理未知单元。
