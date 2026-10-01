---
name: web-run-parallel-worktrees
description: 在用户当前明确要求且项目策略允许时，把一个 Web Harness、React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension Task 拆为写入所有权不重叠的内部 Subagent Git Worktree，并用可执行登记、guard、postflight 和保守清理阻止越界。
---

# Web Harness：运行前端并行工作树

本 Skill 只管理当前 Task 内部的 Subagent 单元。它不调用 `create_thread`，不创建新的左侧 Task，也不受 `user_owned_tasks` 开关控制。内部 agent thread 与单元 Worktree 不使用 `Task {序号} | {当前进度} | {单一结果}` 标题合同、不占用项目 Task 序号；宿主技术 `task_name`、`codex/unit-*` 分支和父 Task 标题互相独立。

## 适用与授权

1. 创建模式必须同时满足：用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、source Worktree 干净且 HEAD 是已记录的精确提交 OID、至少两个写入单元的所有权互不重叠。任一不满足就使用单 Agent；持久启用不能自行触发并行，当前请求也不能覆盖 `disabled`。
2. `inspect` 是只读审计，`remove` 是既有登记的保守清理；二者不要求创建开关仍启用，但不能放宽身份、干净状态、祖先或所有权门禁。
3. 用户对并行的授权不扩展为提交范围外修改、整合、删除、推送、发布、凭据或外部副作用。

## 身份与准备

1. `--project-root` 是 Codex 保存项目的 primary checkout，`--source-worktree` 是当前左侧 Task 的实际 Git 顶层；两者必须登记在同一 Git common-dir。
2. 父 Task 使用独立 ASCII `task-slug` 和分支 `codex/task-<task-slug>`；单元使用 `codex/unit-<task-slug>-<unit-slug>`。不得把父 Task 显示标题传给 `spawn_agent.task_name`、`--task`、`--unit` 或 Git ref。隐藏 Subagent 不占用用户可见项目序列。
3. 每个单元声明一个或多个非空 repo-relative `--write-target`。`.`、`./`、空/重复分隔段、任何原始 `..` 段、绝对/越界路径、符号链接逃逸、同一单元冗余祖先/后代及活动单元间任何重叠都失败关闭；helper 不会先 normalize 再接受歧义输入。
4. 从 source Worktree 精确 cwd 创建每个单元；协调方在首个单元前冻结当前完整 commit OID，`--expected-units` 至少为 2，同批次所有单元必须共享并复核该 base OID：

```text
pnpm exec tsx <project-root>/.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts create \
  --project-root <primary> --source-worktree <task-worktree> \
  --task <task-slug> --unit <unit-slug> --expected-units <n> \
  --user-requested --policy enabled --write-target <path> [--write-target <path> ...]
```

helper 把不可变 source、common-dir、base OID、分支、Worktree 和所有权登记在 Git common-dir；不会自动暂存、stash 或提交用户修改。每个子命令只接受对应示例中的 flag，传入其他子命令的 flag 会失败而不是被忽略。

## 分派、执行与整合

1. 协调方在 `spawn_agent` 前只写入受限技术 `task_name` 和清晰职责描述。内部 agent thread 只报告技术标识和父 Task，不得使用用户可见 Task 标题、占用项目序号、把自己称为新的左侧 Task 或调用 `create_thread`。隐藏 Subagent 用 `read_thread` 有界复读，不创建可见替代 Task。
2. Subagent 在任何编辑前从单元精确 cwd 运行 `guard`，重复本轮意图路径。guard 会先检查所有既有 staged/unstaged/untracked/rename 路径是否仍在登记所有权内：

```text
pnpm exec tsx <project-root>/.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts guard \
  --project-root <primary> --source-worktree <task-worktree> \
  --task <task-slug> --unit <unit-slug> --write-target <intended-path>
```

3. 单元完成后必须形成至少一个可审查提交且保持 clean，再从单元 cwd 运行 `verify`。postflight 证明从 `baseHead` 到 HEAD 的全部 committed 路径都在 ownership 内；越界由原单元修复，协调方不得掩盖。
4. 协调方审查完整 diff 与实际验证，按依赖顺序用可逆 Git 操作把通过的单元串行整合进父 `codex/task-*`。helper 不替代语义 review、不自动 merge/cherry-pick，也不触发构建或发布。
5. 整合后只运行本次变化需要的相关非空测试或相称替代检查。并行本身不触发 Work Plan、全仓检查、构建、冒烟或 E2E。

## 审计与保守清理

从 primary checkout 的精确 cwd 运行只读 `inspect`；linked Worktree 或其他 cwd 即使指向同一仓库也不能代替 primary。结果同时返回 primary 的 clean/branch/head、Git porcelain 中的全部 Worktree、helper registry 单元、未登记的受管候选 `orphanWorktrees`，以及缺失、分支漂移或 prunable 的 `staleUnits`；inspect 只暴露恢复证据，不自动清理或修复：

```text
pnpm exec tsx .agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts inspect \
  --project-root <primary>
```

只有单元已经 `verify`、Worktree clean、HEAD 未漂移，且 verified HEAD 已成为精确父 Task 分支祖先时，才能从 source Worktree cwd 运行：

```text
pnpm exec tsx <project-root>/.agents/skills/web-run-parallel-worktrees/scripts/parallel-worktrees.ts remove \
  --project-root <primary> --source-worktree <task-worktree> \
  --task <task-slug> --unit <unit-slug> --integrated-into codex/task-<task-slug>
```

`remove` 不使用 `--force`、不删除单元分支、不扫描前缀、不清理未知或未整合 Worktree。它先移除精确 Git Worktree，再原子删除 helper 登记；若两步之间失败或进程退出，保留的 stale 登记由下一次 `inspect` 明确报告，不能静默当作清理成功。

所有 CLI 命令只向 stdout 输出一个 JSON 对象：成功为 `{ "ok": true, "operation": "<command>", ... }`；失败为 `{ "ok": false, "error": { "code": "...", "message": "..." } }` 并返回非零退出码。调用方按结构字段判定，不解析任意 stderr 文本。

## 完成输出

报告父 Task/common-dir/base OID、显示标题与技术身份映射、各单元所有权/分支/Worktree、guard/postflight、整合与检查结果、清理状态和剩余风险。
