---
schema_version: 3
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
user_owned_tasks: disabled
parallel_worktree_subagents: pending
acceptance_smoke: pending
e2e_hint: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力、用户可见 Task 自动拆分、候选冒烟偏好和构建 E2E 建议默认值的唯一持久事实来源。Harness 源允许尚待下游确认的字段使用 `pending`，但 `user_owned_tasks` 固定默认 `disabled`；完成初始化的下游五项选择只能是 `enabled` 或 `disabled`，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止调用或遵循这些 Skills。Harness 源固定默认 `disabled`。
- `user_owned_tasks`：控制是否由 Agent 自动把新结果拆到 Codex 左侧菜单中用户可独立进入的 user-owned Task/thread。`disabled` 是默认值：不得自动创建或按阶段拆 Task，但用户明确要求创建时仍可执行；`enabled` 表示用户已经长期授权按本文件的结果边界自动创建，不得再次要求用户提醒。它不控制当前 Task 内部的 plan、Subagent 或单元 Worktree，也不替代 `parallel_worktree_subagents`。
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent。持久启用本身不能触发并行步骤。只读 Subagent 可以对彼此独立的问题并行分析，不受写入开关限制。
- `acceptance_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的浏览器冒烟。普通实现不消费该选择。
- `e2e_hint`：仅作为每次显式候选构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前候选的明确选择，也不授权凭据、生产数据、商店上传或不可逆副作用。
- `decision_mode: reuse_then_infer_then_ask`：先复用已确认偏好，再依据当前事实判断适用性；仍会改变产品范围、授权或当前候选时才询问。

`enabled` 表示允许且在真实触发时优先，不表示无条件执行；`user_owned_tasks: enabled` 是自动建 Task 的明确长期授权。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前候选的 E2E 明确选择优先于 `e2e_hint` 建议值。

除非用户明确说当前 Task 内部步骤、plan 或 Subagent，本文的 Task 一律指 Codex 左侧菜单中用户可独立进入的 user-owned Task/thread。plan、Todo、Subagent、agent thread、Worktree、brief、report、review、checkpoint 和内部单元都不是新的左侧 Task；不得用这些内部结构冒充 `create_thread` 创建的用户可见 Task。

用户可见 Task 的标题唯一使用 `Task {序号} | {当前进度} | {单一结果}`。`Task编号` 固定为 `Task ` 加无前导零的正十进制序号，例如 `Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关`；两个 ASCII `|` 两侧各恰好一个 ASCII 空格。`单一结果` 必须非空、单行、首尾无空白且不含 `|`，开始后不得改变；`当前进度` 只取 `已分配`、`运行中`、`检查中`、`已完成`。调用后返回的 `threadId`/`clientThreadId`、Subagent 技术 `task_name` 和 Git ref 只用于真实身份或技术绑定，不得生成 Task 编号或反填标题。

同一 `hostId` 与精确 `projectId` 的用户可见 Task 共享递增序列。新结果先调用 `list_threads(limit=50)` 合并当前与 pinned Task，再沿同宿主 `list_archived_threads` 的 `nextCursor` 读完归档页；只接受 `kind=codex`、宿主/项目精确匹配且满足当前三字段标题的记录作为序号证据，然后分配最大有效序号加 1。空历史才从 1 开始，缺号不回填，同项目批量创建连续预留；不识别任何历史标题格式，不为已废弃的旧标题保留兼容或序号连续性。隐藏 Subagent、`projectId=null`、其他项目/宿主/kind 和不合规标题都不占用项目序列。宿主或历史无法可靠枚举时不得猜测 `1`，而是保留同一结果已有编号或在创建前阻断。

进度标题贯穿用户可见 Task。`create_thread` 使用 `title="Task {序号} | 已分配 | {单一结果}"`；目标 Task 取得执行权后进入 `运行中`，真实进入本次必要测试、review 或 checkpoint 时进入 `检查中`，同范围返工时回到 `运行中`，完成全部结果、必需检查及要求的提交/推送/远端复读后才进入终态 `已完成`。每次真实转换至多尝试一次 `set_thread_title` 并省略 `threadId`，再用真实 `threadId` 调用 `list_threads` 有界复读。创建后首次核对中的标题不符是零写入阻断；后续进度更新失败只需如实报告，不创建替代 Task、不无限重试，也不推翻已经完成的工作。内部 Subagent 不使用本标题合同、不占用 Task 序号，内部单元 Worktree 本身没有左侧 Task 标题。

## 事件驱动执行

- 日常开发直接实施，只增加本次必要的相关非空单元/回归测试。纯文档、元数据或机械变化只做解析、链接或差异完整性所需的最小检查。
- 多步骤、多模块、中等风险或可并行本身不增加 Work Plan、全仓检查、构建、冒烟、E2E、Verification 或人工复核。
- 只有用户明确要求持久计划、跨会话交接或发布/高风险协调确有必要时，才创建或继续 Work Plan。计划是交接工具，不是复杂度奖励。
- 安全/隐私、扩展权限、不可逆数据、生产/付费/凭据副作用、对外兼容契约和正式发布仍执行解决当前风险所必需的授权与失败关闭门禁。
- 行为保持重构运行全量测试；普通行为变化运行相关非空测试。完整候选只通过当前宿主的唯一 Release 构建入口形成。

## 用户可见 Task 开关、粒度与创建门禁

`user_owned_tasks: disabled` 是默认状态：普通请求直接在当前 Task 完成，Agent 不因结果或生命周期边界自动调用 `create_thread`。用户仍可明确要求创建左侧 Task；该次明确要求只授权对应结果，不自动永久开启本字段。`enabled` 是长期授权：当新结果超出当前 Task 的固定边界时，Agent 必须先结束或暂停当前 Task，再自动创建新的左侧 user-owned Task，不重复询问。用户明确说“不要创建新 Task”或“作为当前 Task 内部步骤”时，本次请求优先于长期开关。

一个用户可见 Task 只对应一个明确、可验收的结果、一个固定完成边界和一个独立工作区。标题、目标、实施范围、禁止范围和完成条件开始后固定。判断是否需要新 Task 只看结果是否变化，不看工作量；交付物类型变化、生命周期阶段变化、增加安装/发布/上传/远端/系统修改等外部副作用、触碰原 Task 禁止范围或验收责任变化，都属于新结果。用于证明当前结果的测试、review、checkpoint 和必要同范围缺陷修复仍留在当前 Task。

每个项目同一时间只允许一个写入型 active 用户可见 Task；Task0 可以协调和派发，但不得代替实施 Task 写入。`parallel_worktree_subagents` 只控制当前 Task 内部按用户明确要求创建的 Subagent Worktree，既不创建用户可见 Task，也不改变本节开关或粒度。

### 创建状态机

1. **RESOLVED**：依次调用 `list_projects` 和 `list_threads`。按规范化完整路径精确锁定项目名称、`projectId`、Git 状态与保存路径，确认本项目没有另一个写入型 active Task，并清点当前与归档标题分配序号。Git 项目固定选择 `target.type = project`、精确 `projectId` 和 `environment.type = worktree`；非 Git 项目固定使用同一 project target 与 `environment.type = local`。不得使用 projectless、其他项目或普通 Worktree 代替 user-owned Task。
2. **DISPATCHED**：对一个结果只调用一次 user-owned `create_thread`，显式传入 `title="Task {序号} | 已分配 | {单一结果}"`。返回真实 `threadId` 才能继续；只返回 `clientThreadId` 表示仍在 setup，必须报告 queued 并保持零实现，不得声称 Ready、把它传给要求 `threadId` 的工具、重复创建或在当前 Task/plan/Subagent 中代做。`SETUP_PENDING` 不是失败。
3. **VERIFIED**：取得真实 `threadId` 后立即用 `list_threads` 精确核对该 id 的标题、`projectId`、cwd 和状态。目标 Task 可以已经合法进入 `运行中`，但 Task 编号与单一结果必须保持不变。左侧不可见、字段为空/错误、标题不合规或候选有歧义都立即阻断，禁止创建重复 Task 碰运气。
4. **BOUND**：首次写入前核对工作区干净及起始提交正确。Git Task 分别在保存项目和 Task Worktree 执行 `git rev-parse --path-format=absolute --git-common-dir`，确认两者 Git common dir 相同，并用 `git worktree list --porcelain` 确认当前顶层已登记；非 Git Task 的 cwd 必须等于保存项目完整路径。任一绑定、工作区或基线不符时保持零实现，不退化为 plan、Subagent、Local Git checkout 或普通 Worktree。

### 命名、基线与分支

- 用户可见 Task 遵守 `Task {序号} | {当前进度} | {单一结果}`。创建后以真实 id、标题和 `projectId` 对账，标题不承担身份判断；`threadId`/`clientThreadId` 不生成序号。
- Task 描述记录稳定 Task 编号、单一结果、实施范围、禁止范围、完成条件、独立 ASCII `task-slug`、目标 `projectId`、保存项目完整路径、Git repository identity 和起始分支/提交。显示标题与 Git 摘要互不推导。
- 所有 Git Task 无论只读、Harness 维护或下游产品写入，都必须从派发前选定并记录的精确已提交 OID 创建。用户明确指定 branch/ref 时解析其完整 commit OID；否则冻结保存项目默认分支当时的 HEAD，不硬编码 `main`/`master`，也不主动 fetch/pull。创建后必须复核 Task 起始 HEAD 与记录 OID 精确一致；缺少提交、ref/OID 漂移、分叉或存在需要携带的未提交状态时停止创建，不使用 `working-tree` 起点，也不把未提交修改复制进新 Task。
- Git Task 在自己的已登记 Worktree 建立唯一 `codex/task-<task-slug>`；Ready Task 可能从 detached HEAD 开始，首次编辑前必须确认真实 Git 顶层、common dir 与登记关系，再创建并切换该分支。不复用别的 Task Worktree 或分支。`task-slug` 只服务安全分支命名，不是显示标题。非 Git Local Task 不执行 Git 分支步骤。

### 执行、提交与边界

- Git Task 只在自己的独立 Worktree 修改文件，不直接编辑 Local 主工作目录，也不进入、清理或复用其他 Task 的 Worktree。非 Git Task 只在绑定的 Local 项目目录修改。两者都保护已有修改且不得扩大固定范围。
- 每完成一个能够独立说明结果的逻辑闭环就提交一次。提交前按 `$web-configure-git-commits` 检查仓库本地身份和受管模板；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。忽略生成物不得加入提交。
- Task 不自行合并默认/集成分支，不删除其他 Worktree，不执行推送、发布、部署、上传或其他未在任务描述中明确授权的外部副作用。
- 最终交付前必须确认任务要求的测试已经执行、相关权威文档已经同步、全部任务改动已经提交，并且工作区干净。适用目标必须编译并验证真实目标行为；任务没有可编译产物或完整候选不在范围内时，必须把该项明确报告为 `Not applicable` 或 `Not run`，不得伪造通过，也不得因此自动扩大为构建/E2E/完整验收。

### 协调方整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行整合。协调方核对范围、疑似秘密、必需测试、clean、Worktree/ref/OID/祖先和唯一写入占用后，才按当前仓库已批准的 Git 流程整合；不得借整合增加无关语义审查或隐式发布。
- 只有整合完成且 Task 提交已包含在目标分支后，协调方才移除登记的精确 Worktree 并删除对应 `codex/task-*` 分支。Task 本身不得提前清理自己或他人的资源。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

Task 绑定：

- Task key：填写派发前分配的不可变技术标识；它不进入显示标题，也不得填写返回后的 `threadId` 或 `clientThreadId`。
- Task 编号：填写同一 `hostId`/`projectId` 下当前与归档有效标题最大序号加一所得正整数；同一结果全程不变，缺号不回填。
- 显示标题：填写按 `Task {序号} | 已分配 | {单一结果}` 形成并传给 `create_thread.title` 的完整字符串；后续只替换进度字段。
- Git task slug：Git Worktree Task 填写独立 ASCII slug；非 Git 标记 `Not applicable`。
- Codex 项目：填写名称、`projectId` 和保存项目完整路径。
- Git 绑定：填写 repository identity、起始 branch/ref、解析出的完整已提交 OID 及选择来源；非 Git 标记 `Not applicable`。

工作方式：

- Git 项目使用独立且已登记的 Codex Worktree；非 Git 项目使用绑定项目的 Local 环境。
- 同一项目不得与另一写入型 active 用户可见 Task 并发。
- 先读取 `AGENTS.md`、`docs/AGENT_POLICY.md` 与本目标精确命中的事实来源。
- 保护已有修改，不扩大范围。

当前事实：

- 列出已确认版本、环境和阻断；创建者只报告真实 `threadId` 或 `SETUP_PENDING`，不得伪造 Ready。

必须阅读的项目文档：

- 列出 `AGENTS.md`、`docs/AGENT_POLICY.md` 及本目标精确命中的事实来源。

实施范围：

- 列出允许修改的模块和预期结果。

禁止事项：

- 列出不可覆盖、删除、整合、推送、发布或声明通过的内容。

验收标准：

- 适用的编译和非空测试通过；不适用项明确标记 `Not applicable`。
- 真实目标行为按范围验证，文档同步，全部改动已提交且 git status 干净。

交付：
报告分支、提交哈希、实际验证、未执行项和剩余风险；不要自行整合默认/集成分支。
```

## 当前 Task 内部并行 Worktree/Subagent

- 只读 Subagent 可在问题彼此独立时并行，不修改文件、不创建用户可见 Task，也不要求活动 Work Plan。内部 Subagent 通过 `spawn_agent` 派发时只使用受限技术 `task_name`，不使用用户可见 Task 标题合同、不占用项目序号。
- 写入型并行只在用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、Git 基线干净已提交且至少两个写入范围互不重叠时允许；不满足任一条件就保持单 Agent。
- `disabled` 是写入型并行的禁止值，当前请求也不能覆盖 `disabled`；需要并行时必须先由用户明确修改持久策略。
- 分支固定使用 `codex/unit-<task-slug>-<unit-slug>`。helper 必须绑定精确 Git common dir、登记 Worktree、起始 OID、允许路径和协调方 cwd；拒绝符号链接逃逸、路径重叠、脏工作树、未整合提交和越权修改。
- 每个写入单元只能改自己的允许路径，形成可审查提交并保持 clean；协调方按冻结 OID 与祖先关系整合。清理只能作用于本流程登记且已整合的精确 Worktree/ref，不扫描前缀、不删除他人资源。

## 初始化与持久化

- `$web-instantiate-project` 首轮一次收集尚未明确的项目类型、名称、id、描述、目标路径、三环境 BaseURL、品牌输入、策略模式和确认来源。项目类型不得有默认值；推荐预设必须显式确认。
- 选择自定义后，`user_owned_tasks`、`superpowers`、`parallel_worktree_subagents`、`acceptance_smoke`、`e2e_hint` 每轮只询问一个当前缺失字段；用户一次主动提供多个合法字段时全部复用。`user_owned_tasks` 的推荐/default 值都是 `disabled`。
- 推荐预设确定性物化五项为 `user_owned_tasks: disabled`、`superpowers: disabled`、`parallel_worktree_subagents: disabled`、`acceptance_smoke: enabled`、`e2e_hint: disabled`。默认关闭的内部并行只限制当前 Task 的 `codex/unit-*` 写入单元，不影响用户明确创建的左侧 Git Task；预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用其他值。
- 五项值全部解析后才以 `schema_version: 3` 一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。内部初始化链只验证并复用，不重复询问。
- `pending` 只允许存在于源 Harness 或未完成 staging。最终下游任何 `pending`、空确认来源或非法确认日期都阻断原子发布。
- 初始化后，用户可明确改变五项持久策略；例如“开启左侧 Task”或“关闭左侧 Task”只改变 `user_owned_tasks`。Agent 只更新被确认的字段、`confirmed_by` 与 `confirmed_at`。任何初始化后的永久策略变更都必须写入当日 ADR，目标值相同时按幂等 no-op 报告；临时 Task 限制不得改写持久策略。切换只影响之后的适用行为，不迁移或中断既有 Task/Worktree。
- 本文件只有 `schema_version: 3` 一种有效形态，不兼容、不推断任何更早 schema 或缺少字段的旧形态（含改名前的 `milestone_smoke`/`milestone_e2e`）；不合规的文件必须由用户重新走五项确认一次性物化为 `schema_version: 3`。

## Web/Extension 构建与验收

- 本地开发、测试、类型检查和普通预览不消费 E2E 选择，不产生最终候选。
- 显式发布候选构建必须为当前候选解析一次 E2E 选择。请求已明确 `enabled|disabled` 时直接复用，否则在任何测试或编译前询问一次；`e2e_hint` 仅用于询问时的建议默认值。
- E2E 选择只对当前发布候选有效，不跨候选写回本文件。`enabled` 时只在 `pnpm build` 形成最终真实候选后调用 `$web-test-final-artifact-e2e`；`disabled` 时记录 `Not run` 与剩余风险。
- Web 候选是 Vite `dist/`；Extension 候选由唯一 `pnpm build` 形成，若需要分发 zip 再运行 `pnpm package`。构建、E2E、扫描和验收继续完全遵循当前仓库 `docs/RELEASE.md`，本文件不定义第二套发布逻辑。
- `acceptance_smoke` 只在 `$web-verify-delivery` 的完整候选验收中解析。`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`；`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`；用户、产品、安全或渠道硬要求优先于持久值。源 Harness 的 `pending` 不授权可选 smoke，无硬要求时按 `not-required` 处理，不推断推荐预设。浏览器步骤只能针对精确 Release 候选，不能用开发页、源码片段、Mock 或占位内容冒充；smoke 与当次 E2E 选择相互独立。
- 本地开发试包不消费 E2E 选择；本 Web Harness 不持久化桌面 GUI 性能选择，也不引入桌面签名、公证或分支发布链。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中的用户明确约束与授权；当前候选 E2E 选择属于本级。
3. 本文件持久策略；`e2e_hint` 只提供建议默认值。
4. Agent 根据唯一 `projectType`、真实产物和已批准场景作出的适用性判断。
5. 仍会实质改变范围、授权或结果时询问用户。

本文件不授权发布、push、商店提交、凭据操作、生产访问或数据删除；这些行为始终需要其自身的当前任务授权。
