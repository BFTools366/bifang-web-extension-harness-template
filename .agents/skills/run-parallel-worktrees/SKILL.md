---
name: run-parallel-worktrees
description: 使用隔离 Git Worktree 和 codex/ 分支并行实施单 package TypeScript 项目的独立 Todo。仅在 Agent Policy 启用、已有标准/里程碑计划、至少两个写入范围不重叠且 Git 基线干净已提交时使用；也用于审计和保守清理由本流程创建的 Worktree。
---

# 运行并行 Worktree

并行只用于真正独立的实施单元。它是执行许可，不是速度偏好，也不扩大原任务授权。

## 准入

1. 读取 `.harness/project.json`、`docs/AGENT_POLICY.md`、活动 Work Plan、工程规则和 Git 状态。
2. 只有 `parallel_worktree_subagents: enabled` 才继续；缺失/非法时询问一次并按仓库策略记录。`disabled` 时返回单 Agent 路径。
3. 要求至少两个 Todo 具有互不重叠的精确文件/模块所有权、独立验证和明确整合顺序。共享 package/锁文件、三环境文件与 Schema、统一 logger、品牌事实源、同一 React 入口、同一 Extension manifest 或同一消息契约必须串行。
4. 要求当前项目是独立 Git 顶层目录，基线已有提交且 `git status --porcelain=v1 --untracked-files=all` 为空。绝不自动暂存或提交用户修改来满足门禁。

## 创建

1. 为每个单元公开 Todo ID、结果、负责路径、禁止路径、依赖、验证、整合顺序和分支名 `codex/<task>/<unit>`。
2. 在项目外选择明确的临时父目录，并为每项运行：

   ```text
   git worktree add <absolute-worktree-path> -b codex/<task>/<unit> <baseline-commit>
   ```

3. 在分派写入前，从每个 Worktree 验证：Git 顶层等于该 Worktree、当前分支精确匹配、HEAD 等于基线、负责路径解析后位于该 Worktree 内。
4. 告知每个 Subagent：其他 Agent 正在工作；只能编辑已声明路径；保护他人修改；不得修改另一项目类型、扩张权限、创建远端、推送、发布或执行原任务外副作用；必须返回 diff、测试、阻断和整合说明。

## 执行与整合

1. 在开始、阻断、单元完成、整合和验证节点提供简洁状态，并等待全部必需结果。范围或所有权变化时停止并重新切分，不让两个 Agent 竞态写同一文件。
2. 审查每个单元的完整 diff 和证据，拒绝越界编辑、缺失非空测试、敏感信息、绝对本机路径、另一类型入口或无事实支持的声明。
3. 按依赖顺序采用可逆 Git 操作整合。任何语义冲突由一个 Agent 串行解决；不得用整文件覆盖消除冲突。
4. 整合后运行相关测试及适用环境校验、格式、lint、类型、构建和下游 `pnpm harness validate`；源 Harness 使用 `pnpm validate:harness`。涉及 Release 日志时确认 Release 构建自动通过 `pnpm release:inspect`。实施批次内不运行冒烟/E2E。
5. 只有整合后的检查通过才把 Todo 标记 `done`。标准路径回到 `$implement-change` 收口；里程碑全部完成后交给 `$verify-delivery`。

## 保守清理

1. 先运行 `git worktree list --porcelain`，逐项确认路径、分支、状态和整合提交。
2. 仅移除本流程创建、工作区干净且提交已进入指定整合分支的精确 Worktree：

   ```text
   git worktree remove <absolute-worktree-path>
   ```

3. 不使用 `--force`，不删除未整合分支，不清理未知 Worktree，不把临时父目录作为递归删除目标。保留不满足条件的单元并报告恢复方式。

## 完成输出

报告策略、基线、单元/所有权地图、分支和 Worktree、Subagent 结果、整合顺序、检查、保留的工作树/分支、失败项及剩余风险。
