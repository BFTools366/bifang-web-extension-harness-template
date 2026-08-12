---
name: run-parallel-worktrees
description: 为已有标准/里程碑计划中至少两个写入范围互不重叠的 Todo 创建隔离 Git Worktree，并安全整合；也可只读审计或保守清理由本流程创建的 Worktree。创建模式要求 Agent Policy 启用且 Git 基线干净已提交，审计/清理模式不复用创建门禁。
---

# 运行并行 Worktree

并行只用于真正独立的实施单元。`parallel_worktree_subagents: enabled` 是创建许可，不要求为了速度强行并行，也不扩大原任务授权。

## 模式

- `create/execute`：为独立 Todo 创建并行写入单元并整合，使用全部创建门禁。
- `audit`：只读列出现有 Worktree、分支、状态与恢复风险；不因策略关闭、缺少活动计划或脏工作区而阻断。
- `cleanup`：只处理本流程创建且已精确识别的 Worktree；不要求策略仍启用，但保留全部安全清理门禁。

## 创建准入

1. 读取 `docs/AGENT_POLICY.md`、活动 Work Plan、工程规则和 Git 状态；存在 `.harness/project.json` 时再读取唯一 `projectType`，源 Harness 不要求该文件。
2. 只有 `parallel_worktree_subagents: enabled` 才创建；`disabled` 或前置条件不满足时直接回到单 Agent，不重复询问。字段缺失/非法且无法按仓库规则推断时才询问一次。
3. 要求至少两个 Todo 具有互不重叠的精确文件/模块所有权、独立验证和明确整合顺序。共享 package/锁文件、三环境文件与 Schema、统一 logger、品牌事实源、同一 React 入口、同一 Extension manifest 或同一消息契约必须串行。
4. 要求当前项目是独立 Git 顶层目录，基线已有提交且 `git status --porcelain=v1 --untracked-files=all` 为空。绝不自动暂存或提交用户修改来满足门禁。

## 创建与执行

1. 为每个单元公开 Todo ID、结果、负责路径、禁止路径、依赖、验证、整合顺序和分支名 `codex/<task>/<unit>`。
2. 在项目外选择明确的临时父目录，并为每项运行：

   ```text
   git worktree add <absolute-worktree-path> -b codex/<task>/<unit> <baseline-commit>
   ```

3. 分派写入前，从每个 Worktree 验证 Git 顶层、分支、HEAD 与负责路径均精确匹配。告知 Subagent 只能编辑已声明路径，必须保护他人修改，不得修改另一项目类型、扩张权限、创建远端、推送、发布或执行范围外副作用。
4. 在开始、阻断、单元完成、整合和验证节点提供简洁状态并等待必需结果。范围或所有权变化时停止并重新切分，不让两个 Agent 竞态写同一文件。
5. 审查每个完整 diff 与证据，拒绝越界编辑、缺失非空测试、敏感信息、绝对本机路径、另一类型入口或无事实支持的声明；按依赖顺序用可逆 Git 操作整合，语义冲突由一个 Agent 串行解决。
6. 整合后运行受影响的最小充分检查；跨配置/结构/构建链变化、里程碑或候选任务再运行适用完整门禁。只有整合检查通过才把 Todo 标记 `done`；实施批次内不自动运行冒烟/E2E。

## 审计与保守清理

1. `audit` 只运行只读的 `git worktree list --porcelain` 及精确状态检查，报告未知、脏或未整合单元；不得为审计创建分支、Worktree、提交或暂存。
2. `cleanup` 先逐项确认路径、分支、状态和整合提交，只移除本流程创建、工作区干净且提交已进入指定整合分支的精确 Worktree：

   ```text
   git worktree remove <absolute-worktree-path>
   ```

3. 不使用 `--force`，不删除未整合分支，不清理未知 Worktree，不把临时父目录作为递归删除目标。保留不满足条件的单元并报告恢复方式。

## 完成输出

只报告所用模式及适用字段：创建模式报告策略、基线、所有权、分支/Worktree、整合与检查；审计/清理模式报告精确目标、状态、已移除项、保留项和恢复风险。
