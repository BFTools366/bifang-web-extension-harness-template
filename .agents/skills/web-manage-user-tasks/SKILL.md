---
name: web-manage-user-tasks
description: 按 Web Harness 或已初始化下游的项目策略管理 Codex 左侧用户可见 Task 的创建、编号、精确绑定、恢复和进度转换；只在长期开关已启用或用户明确要求时创建，不用内部 plan、Subagent 或普通 Worktree 代替，不执行目标 Task 的业务。
---

# Web Harness：管理用户可见 Task

交付真实 Task 身份、绑定证据及进度状态，业务结果留在对应 Task；当前项目关闭时普通工作仍在当前会话完成。

## 触发与读取

- 用户明确要求创建/管理左侧 Task，或项目 `user_owned_tasks: enabled` 下出现新的结果边界时调用；`user_owned_tasks: disabled` 不自动创建或拆分，单次创建不更改长期开关。
- 本 Skill 不修改持久策略，不创建内部并行单元、不代做目标业务、不自行整合、推送或发布。Task0/协调方职责仅在项目已采用该分工时适用。
- 先完整读取用户级入口、项目入口与 `docs/AGENT_POLICY.md` 的字段语义，再按事件读取“用户可见 Task 开关、粒度与创建门禁”的相应状态、绑定、执行/完成或整合章节。长期用户规则与当前明确授权优先，不凭能力开关扩大行动。
- 接收调用方的单一结果与范围、现有真实 id 和已确认来源；已有同一状态证据可复用，真实转换后有界复读。完成后返回，不反向启动实施、计划、验收或其他 Task。

## 创建与恢复

1. 通过受支持工具读取项目和当前 Task，按同一宿主、规范化完整路径及精确 `projectId` 锁定所属项目。检查已有写入型 active Task 和当前请求结果；不得把相似标题当身份。
2. 新建前完整枚举同一宿主、同一精确项目当前与逐页归档 Task 的有效编号，从最大有效序号加一，不回填、不重复；枚举不可靠时不猜号。恢复原 Task 保留编号、Task key 和单一结果；长时间中断后也先核对清单，不新建替代结果。
3. 用户已记录的 `task_worktrees: enabled` 使用独立 Worktree，`disabled` 使用绑定项目的 Local；不为此新增策略 Schema 字段。没有该选择时沿用当前项目明文默认，不猜应用开关。未指定 ref 时，Git Worktree 冻结默认分支 OID，Git Local 冻结保存项目当前分支与 HEAD；显式 ref 不匹配时按已有授权处理，不偷偷切换。按项目与用户当前规则冻结 Local/Worktree 环境、精确起始 ref/OID、允许与禁止范围、完成条件和来源。使用策略中的描述模板填真实事实；仅在已授权创建边界内调用一次 create_thread，显式绑定所属 project，不置顶。
4. 只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入；SETUP_PENDING 保留已分配并等待原操作完成，不重建、伪称 Ready 或用 plan/Subagent 代做。工具缺失或返回字段不足就保留证据并报告，不伪造能力。
5. 取得真实 id 后复读精确项目、非 pinned、标题、cwd 与 ready 状态。Git Worktree 环境在保存项目与 Task 工作区核对 `git rev-parse --path-format=absolute --git-common-dir`，再核对 `git worktree list --porcelain`、起始 HEAD/OID 与既有登记；Git Local 环境核对 cwd 等于保存项目完整路径、Git 顶层/common-dir、冻结分支/HEAD 及同项目单一写入占用，不要求独立 Worktree 或擅自切换分支；非 Git 核对完整 cwd。首次写入前用 `git status --porcelain=v1 --untracked-files=all` 保护已有状态，按当前策略核对分支/基线。
6. 身份、绑定或状态异常先在授权范围尽力修复原 Task 并复读；涉及其他业务或新增副作用不越界。无法修复保持零业务执行、保留原 Task 和证据，不跳过绑定或创建替代 Task。

## 进度与完成

- 标题遵循当前项目合同 `Task {序号} | {当前进度} | {单一结果}`；进度只取已分配、运行中、检查中、已完成。每次真实转换至多更新一次并有界复读；失败如实报告，不能重建或伪造成功。
- 开工/恢复先核对真实 id、项目、非 pinned、标题、cwd 与状态；结果及必要开发检查、适用提交真正完成后才能标已完成。Git 提交的消息与身份检查委托 `$web-configure-git-commits`，不在本 Skill 复制其规则。
- Task 中业务由当前编排入口负责；Task 管理不自动追加全仓测试、构建、浏览器或发布。适用项按现有完成边界如实报告，不能把未执行项改为通过。
- 整合与清理只有对应当前明确授权及策略条件成立时交给原协调流程，精确核对提交已整合后才处理本流程登记资源，不删除其他 Task/Worktree。

## 返回结果

返回真实 threadId 或 SETUP_PENDING、宿主/projectId/cwd、不可变编号与结果、实际绑定/转换证据、待修复项和零业务执行原因。创建成功按应用工具要求返回 Task 链接/标识；不将内部 Subagent 呈现为左侧 Task。
