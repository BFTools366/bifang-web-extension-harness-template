---
schema_version: 1
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
parallel_worktree_subagents: pending
milestone_smoke: pending
milestone_e2e: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力、完整候选冒烟偏好和构建 E2E 建议默认值的唯一持久事实来源。Harness 源允许使用 `pending` 等待下游用户首次确认；完成初始化的下游四项选择只能是 `enabled` 或 `disabled`，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止调用或遵循这些 Skills。Harness 源固定默认 `disabled`。
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent。持久启用本身不能触发并行步骤。只读 Subagent 可以对彼此独立的问题并行分析，不受写入开关限制。
- `milestone_smoke`：只在完整真实候选验收中表示允许执行适用的浏览器冒烟；普通实现不消费该选择。
- `milestone_e2e`：仅作为每次显式候选构建询问 E2E 时展示的建议默认值，不能替代当前构建选择，也不授权凭据、生产数据、商店上传或不可逆副作用。
- `decision_mode: reuse_then_infer_then_ask`：先复用已确认偏好，再依据当前事实判断适用性；仍会改变产品范围、授权或当前候选时才询问。

`enabled` 表示允许且在真实触发时优先，不表示无条件执行；`disabled` 不能绕过安全、产品或渠道硬要求。字段名中的 `milestone` 只为 schema 稳定保留，与已经废弃的“快速/标准/里程碑”任务分级无关。

## 事件驱动执行

- 日常开发直接实施，只增加本次必要的相关非空单元/回归测试。纯文档、元数据或机械变化只做解析、链接或差异完整性所需的最小检查。
- 多步骤、多模块、中等风险或可并行本身不增加 Work Plan、全仓检查、构建、冒烟、E2E、Verification 或人工复核。
- 只有用户明确要求持久计划、跨会话交接或发布/高风险协调确有必要时，才创建或继续 Work Plan。计划是交接工具，不是复杂度奖励。
- 安全/隐私、扩展权限、不可逆数据、生产/付费/凭据副作用、对外兼容契约和正式发布仍执行解决当前风险所必需的授权与失败关闭门禁。
- 行为保持重构运行全量测试；普通行为变化运行相关非空测试。完整候选只通过当前宿主的唯一 Release 构建入口形成。

## Session、Task 与 Subagent 统一标题

所有拥有可更新标题的普通当前 Session、Git Worktree/非 Git Local 左侧 user-owned Task，以及内部 Subagent/agent thread，都使用：`{序号}|{Task简述}|{当前进度} |{功能摘要}`。

- 四段使用 ASCII `|`；`当前进度` 后与第三个 `|` 前恰好一个 ASCII 空格。
- `当前进度` 只能是 `已分配`、`运行中`、`检查中`、`已完成`。
- `序号` 是无前导零的正十进制整数。普通 Session 无可复用值时从 `1` 开始；协调方在每批左侧 Task 或内部 Subagent 中按派发顺序分配。
- `Task简述` 与 `功能摘要` 都必须单行、首尾无空白且不含 `|`。`序号`、`Task简述` 和 `功能摘要` 在同一结果内保持不变，只更新第三字段。
- 示例：`4|统一Session标题格式|运行中 |统一普通会话、Worktree与Subagent命名`。显示标题不是唯一身份，不能用 `threadId`、`clientThreadId`、技术 `task_name` 或 Git ref 生成序号。

进度是非阻断 UI 元数据闭环：

1. 左侧 Task 创建时用 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`；普通当前 Session 开始处理时直接进入 `运行中`。
2. 内部 Subagent 的协调方在 `spawn_agent` 前分配完整 `已分配` 标题并写入派发消息；`spawn_agent` 不提供显示标题参数。内部 Subagent 取得执行权后的第一项 UI 动作是把自身标题更新为 `运行中`。
3. 实现结束并真实进入必要测试、review 或最小替代检查前进入 `检查中`；检查发现同范围问题并返回修复时重新更新为 `运行中`，再次检查再进入 `检查中`。
4. 只有授权结果、全部必需检查，以及请求或流程要求的提交、推送和远端复读都已完成，才在最终回复前更新为 `已完成`。`已完成` 是终态。
5. 遇到阻断时保留最后真实阶段并在正文报告，不得虚写 `已完成` 或创造第五种状态。

每次真实进度转换至多尝试一次标题更新。目标标题未精确匹配时调用 `set_thread_title` 并省略 `threadId`；普通 Session/左侧 Task 随后用真实 id 调用 `list_threads` 有界复读，按同一真实 id 比较宿主返回的规范化标题原文。隐藏 Subagent 不出现在 `list_threads` 时改用 `read_thread`，只复读响应返回的真实 id 一次。失败不得创建替代 Task、无限重试或推翻已经完成的任务结果，最终报告更新与验证状态。内部单元 Worktree 本身没有独立 Session 标题，由绑定它的 Subagent/agent thread 承载生命周期。

## 左侧 Task、项目绑定与独立 Worktree

本节只约束用户能从侧栏独立进入的 user-owned Task/thread。Todo、brief、review、内部 Subagent 和单元 Worktree 都是当前 Task 的内部结构；不得只因生命周期阶段变化自动拆 Task。只有用户明确要求创建新的左侧 Task，或当前 Task 已被用户定义为多 Task 协调器并指定独立结果时，才调用 `create_thread`。普通单结果请求不先创建所谓 Task0。

创建状态机：

1. `RESOLVED`：调用 `list_projects`，按规范化完整路径精确选中保存项目。创建时必须使用 `target.type = project` 和真实 `projectId`；Git 项目使用 Worktree，非 Git 项目使用 Local。项目工作不得使用 `projectless`。
2. `DISPATCHED`：对一个结果只调用一次 `create_thread`。返回 `threadId` 表示已得到可管理的 Ready Task；只返回 `clientThreadId` 表示创建请求已接受但仍为 `SETUP_PENDING`，不是失败，也不是可传给 `read_thread`、`wait_threads` 或其他要求 `threadId` 的工具标识。立即报告 queued Task，不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建、把 pending 改称 Ready 或在当前目录代跑。
3. `RECONCILED`：取得真实 `threadId` 时用 `list_threads` 对账；只有 queued id 时，仅在用户随后明确要求检查先前 queued Task 后对账。只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`。
4. `BOUND`：首次写入前复核 `projectId`。Git Task 必须比较保存项目与 Task 顶层的 `git rev-parse --path-format=absolute --git-common-dir`，并确认 `git worktree list --porcelain` 已登记该顶层；非 Git Local Task 才要求 cwd 等于保存项目完整路径。Git common dir 不同、未登记、起始 OID 不符或 Local cwd 漂移时零写入。

### 命名、基线与分支

- Task 描述记录不可变的 Task key、稳定序号、Task 简述、功能摘要、完整 `已分配` 显示标题、独立 ASCII `task-slug`、目标 `projectId`、保存项目完整路径、Git repository identity、起始分支/OID 和完成边界。显示标题与 Git slug 是两个事实，不得根据返回 id 重新分配序号或把显示标题直接用作 Git ref。
- 所有 Git Task 无论只读、Harness 维护或下游产品写入，都必须从派发前选定并记录的精确已提交 OID 创建。用户明确指定 branch/ref 时解析其完整 commit OID；否则冻结保存项目默认分支当时的 HEAD，不硬编码 `main`/`master`，也不主动 fetch/pull。创建后必须复核 Task 起始 HEAD 与记录 OID 精确一致；缺少提交、ref/OID 漂移、分叉或存在需要携带的未提交状态时停止创建，不使用 `working-tree` 起点，也不把未提交修改复制进新 Task。
- Git Task 在自己的已登记 Worktree 建立唯一 `codex/task-<task-slug>`；Ready Task 可能从 detached HEAD 开始，首次编辑前必须确认真实 Git 顶层、common dir 与登记关系，再创建并切换该分支。不复用别的 Task Worktree 或分支。

### 执行、提交与边界

- Task 只在自己的 Worktree 或已绑定的非 Git Local 根修改文件；保护已有修改，不进入、清理或复用其他 Task 的目录，也不扩大描述中的实施范围。
- 每完成一个可独立说明的逻辑闭环就提交一次。提交前按 `$web-configure-git-commits` 检查仓库本地身份和受管模板；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。忽略生成物不得加入提交。
- Task 不自行合并默认/集成分支，不删除其他 Worktree，不执行推送、发布、部署、上传或其他未在任务描述中明确授权的外部副作用。
- 最终交付前确认任务要求的检查、权威文档同步、提交和 clean tree。没有可编译目标或完整候选不在范围内时明确标记 `Not applicable` 或 `Not run`，不得伪造通过或自动扩大为构建/E2E/完整验收。

### 协调方整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行整合。协调方核对范围、疑似秘密、必需测试、clean、Worktree/ref/OID/祖先和唯一写入占用后，才按当前仓库已批准的 Git 流程整合；不得借整合增加无关语义审查或隐式发布。
- 只有整合完成且 Task 提交已包含在目标分支后，协调方才移除登记的精确 Worktree 并删除对应 `codex/task-*` 分支。Task 本身不得提前清理自己或他人的资源。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

Task 绑定：

- Task key：填写派发前分配的不可变技术标识；不得填写返回后的 threadId/clientThreadId。
- 标题序号：填写协调批次按派发顺序分配的正整数。
- 显示标题：填写 `{序号}|{Task简述}|已分配 |{功能摘要}` 的完整字符串，并单独记录三个稳定字段。
- Git task slug：Git Worktree Task 填写独立 ASCII slug；非 Git 标记 `Not applicable`。
- Codex 项目：填写名称、projectId 和保存项目完整路径。
- Git 绑定：填写 repository identity、起始 branch/ref、解析出的完整已提交 OID 及选择来源；非 Git 标记 `Not applicable`。

工作方式：

- Git 项目使用独立且已登记的 Codex Worktree；非 Git 项目使用绑定项目的 Local 环境。
- 先读取 AGENTS.md、docs/AGENT_POLICY.md 与本目标精确命中的事实来源。
- 保护已有修改，不扩大范围。

当前事实：

- 列出已确认版本、环境和阻断；只报告真实 threadId 或 SETUP_PENDING。

实施范围：

- 列出允许修改的模块与预期结果。

禁止事项：

- 列出不可覆盖、删除、整合、推送、发布或声明通过的内容。

验收标准：

- 适用的编译和非空测试通过；不适用项明确标记 Not applicable。
- 真实目标行为按范围验证，文档同步，全部改动已提交且 git status 干净。

交付：
报告分支、提交哈希、实际验证、未执行项和剩余风险；不要自行整合默认/集成分支。
```

## 当前 Task 内部并行 Worktree/Subagent

- 只读 Subagent 可在问题彼此独立时并行，不修改文件、不创建用户可见 Task，也不要求活动 Work Plan。
- 写入型并行只在用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、Git 基线干净已提交且至少两个写入范围互不重叠时允许；不满足任一条件就保持单 Agent。
- `disabled` 是写入型并行的禁止值，当前请求也不能覆盖 `disabled`；需要并行时必须先由用户明确修改持久策略。
- 分支固定使用 `codex/unit-<task-slug>-<unit-slug>`。helper 必须绑定精确 Git common dir、登记 Worktree、起始 OID、允许路径和协调方 cwd；拒绝符号链接逃逸、路径重叠、脏工作树、未整合提交和越权修改。
- 每个写入单元只能改自己的允许路径，形成可审查提交并保持 clean；协调方按冻结 OID 与祖先关系整合。清理只能作用于本流程登记且已整合的精确 Worktree/ref，不扫描前缀、不删除他人资源。

## 初始化与持久化

- `$web-instantiate-project` 首轮一次收集尚未明确的项目类型、名称、id、描述、目标路径、三环境 BaseURL、品牌输入、策略模式和确认来源。项目类型不得有默认值；推荐预设必须显式确认。
- 选择自定义后，`superpowers`、`parallel_worktree_subagents`、`milestone_smoke`、`milestone_e2e` 每轮只询问一个当前缺失字段；用户一次主动提供多个合法字段时全部复用。
- 推荐预设物化为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。预设只是输入捷径，不新增持久字段。
- Harness 源字段值不是下游确认，不得在用户未确认时静默采用。四项策略与真实确认元数据全部收齐后，才一次原子写入本文件；内部初始化链只验证并复用，不重复询问。
- `pending` 只允许存在于源 Harness 或未完成 staging。最终下游任何 `pending`、空确认来源或非法确认日期都阻断原子发布。
- 初始化后的策略变化必须由用户明确确认；若构成长期决定，再按工程规则触发相应记录。

## Web/Extension 构建与验收

- 本地开发、测试、类型检查和普通预览不消费 E2E 选择，不产生最终候选。
- 显式发布候选构建必须为当前候选解析一次 E2E 选择。请求已明确 `enabled|disabled` 时直接复用，否则在任何测试或编译前询问一次；`milestone_e2e` 仅用于询问时的建议默认值。
- E2E 选择只对当前发布候选有效，不跨候选写回本文件。`enabled` 时只在 `pnpm build` 形成最终真实候选后调用 `$web-test-final-artifact-e2e`；`disabled` 时记录 `Not run` 与剩余风险。
- Web 候选是 Vite `dist/`；Extension 候选由唯一 `pnpm build` 形成，若需要分发 zip 再运行 `pnpm package`。构建、E2E、扫描和验收继续完全遵循当前仓库 `docs/RELEASE.md`，本文件不定义第二套发布逻辑。
- `milestone_smoke` 只在 `$web-verify-delivery` 的完整候选验收中解析；用户、产品、安全或渠道硬要求优先。浏览器步骤只能针对精确 Release 候选，不能用开发页、源码片段、Mock 或占位内容冒充。
- 本地开发试包不消费 E2E/性能选择；本 Web Harness 不持久化桌面 GUI 性能选择，也不引入桌面签名、公证或分支发布链。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中的用户明确约束与授权；当前候选 E2E 选择属于本级。
3. 本文件持久策略；`milestone_e2e` 只提供建议默认值。
4. Agent 根据唯一 `projectType`、真实产物和已批准场景作出的适用性判断。
5. 仍会实质改变范围、授权或结果时询问用户。

本文件不授权发布、push、商店提交、凭据操作、生产访问或数据删除；这些行为始终需要其自身的当前任务授权。
