---
name: web-audit-worktrees
description: 在 Web Harness、React Web 或 Plasmo Extension 仓库中，从 primary checkout 只读审计 Git Worktree、并行单元登记、孤立候选和陈旧记录。用于检查现状、恢复证据或清理前核对；不创建、验证、整合、删除或修复 Worktree，不要求并行创建开关启用。
---

# Web Harness：审计工作树

## 适用与边界

1. 用户要求检查既有 Worktree、并行登记或恢复证据时使用；也供 `$web-run-parallel-worktrees` 在清理前后委托。只读审计不要求 `parallel_worktree_subagents: enabled`，也不把检查请求解释为并行创建授权。
2. 先读取 AGENTS 与 `docs/AGENT_POLICY.md` 的相关并行边界，再完整读取 [审计执行契约](references/inspection-contract.md)。源 Harness 与两类已初始化下游均适用，不接收产品需求。
3. 只运行既有 helper 的 `inspect`。不创建目录、登记、分支、Worktree 或报告文件；不调用 `create`、`guard`、`verify`、`remove`。其中 `verify` 会写入 `verifiedHead`，不属于审计。
4. orphan/stale 只表示需要调查的证据，不是删除授权。后续修复、整合或保守清理由原执行流程处理；不自动暂存、stash、提交、prune 或删除。

## 执行与交接

1. 绑定保存项目的 primary checkout 与 Git common-dir，从 primary checkout 的精确 cwd 执行契约中的命令；linked Worktree 不能代替 primary。
2. 按稳定 JSON 核对 primary 身份、全部 Git Worktree、helper 登记、`orphanWorktrees` 与 `staleUnits`。登记不存在时应返回空集合，不创建登记目录。
3. 报告 `clean`、branch/head、路径、登记映射、陈旧原因和未能绑定的身份。`clean=false` 作为现状报告，不撤销已有修改；命令失败不能冒充空审计结果。
4. 本 Skill 到证据交接即停止，不触发测试、构建、浏览器、持久计划或左侧 Task。审计成功不等于单元已验证、已整合或可删除。
