---
name: web-implement-change
description: 在 Web Harness 或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游中直接实施范围清楚的请求，或执行已由独立事件触发的活动 Work Plan，只运行本次变化需要的相关非空测试或最小替代检查；候选验收失败后回到此 Skill 修复。
---

# Web Harness：实施前端变更

完成当前授权范围，保护用户修改，不为了流程或复用想象扩大工程。

## 工作流程

用户可见 Task 的序号按同一 `hostId` 和精确 `projectId` 清点：先读取 `list_threads`，再逐页读取 `list_archived_threads` 清点归档 Task，从最大有效序号继续递增；空历史才从 1 开始，缺号不回填。内部 Subagent 不使用 `Task {序号} | {当前进度} | {单一结果}` 标题合同且不占用序号。

1. 直接实现当前授权范围。多步骤、多模块、中等风险或 Agent 偏好本身不创建 Work Plan、全仓检查、构建、冒烟或 E2E；安全/隐私、Extension 权限、不可逆数据、生产/付费/凭据副作用、对外兼容契约和正式发布分别进入解决该风险所需的专用门禁。
   `user_owned_tasks: disabled` 时当前请求直接在当前 Task 中完成，不自动调用 `create_thread`；用户明确要求创建时仍执行。`enabled` 时，若交付物类型、生命周期阶段、外部副作用、禁止范围或验收责任使结果越出当前固定边界，任何写入前结束或暂停当前 Task 并以 `Task {序号} | 已分配 | {单一结果}` 创建新的 user-owned Task。证明同一结果的测试、review、checkpoint 和必要同范围修复不拆。每项目同一时间只允许一个写入型 active Task，Task0 只协调。用户可见 Task 必须使用 `Task {序号} | {当前进度} | {单一结果}`；编号和单一结果全程稳定，进度只能是 `已分配`、`运行中`、`检查中`、`已完成`。可读取线程元数据时以真实 `threadId` 对账标题、`projectId`、cwd 和状态，不靠标题承担身份。
2. 先识别仓库：存在 `.harness/project.json` 时是唯一类型下游；否则仅在根 manifest 暴露源专用 `instantiate` 入口时按 Harness 源处理。读取 Agent Policy、工程规则、Git 根/分支/状态和受影响代码；创建入口与终端化硬约束直接遵循根 `AGENTS.md`，不在本 Skill 重写全文。只在相关时读取 Product Spec、活动 Work Plan、ADR、Verification 或技术债。
3. 确认 Git 顶层目录等于项目根，并保留所有用户修改。先检查 diff；重叠修改无法安全整合时停止，不重置、覆盖或顺手格式化无关文件。若当前说明来自左侧 user-owned Task，首次编辑前必须核对描述中的 Task 编号、单一结果、范围、禁止范围、完成条件、保存项目完整路径、`projectId`、repository identity、环境和起始提交；只返回 `clientThreadId` 或无法取得真实 `threadId` 时保持零写入。Git Task 必须位于独立 Codex Worktree：分别在保存项目和当前 Task 顶层运行 `git rev-parse --path-format=absolute --git-common-dir`，确认 common dir 相同，用 `git worktree list --porcelain` 确认当前顶层已登记，并复核当前 HEAD 等于记录的起始提交；非 Git Local Task 必须确认 cwd 等于保存项目完整路径且与同项目其他写入 Task 串行。任一绑定不符都停止，不退化到 plan、Subagent、Local Git checkout 或普通 Worktree。
4. 只有实际创建新下游时调用一次 `$web-check-development-environment`；普通代码、测试、lint、typecheck、最终 Release 构建、新会话或 Agent 切换都直接执行，不做环境预探测。命令已失败且错误明确指向工具链/宿主/Chrome 环境时才调用该 Skill 诊断相关组件；纯文档/元数据任务跳过。
5. 默认单 Agent 实施。只有用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、存在至少两个写入所有权不重叠的单元且 Git 基线干净已提交时才调用 `$web-run-parallel-worktrees`；任何一项缺失都保持单 Agent。
6. 没有活动计划时实现最小完整行为；存在由独立事件触发的活动计划时选择依赖已满足的首个非 `done` Todo，标记 `in_progress`，通过必需检查后才标记 `done`。

## 实现边界

1. 下游只修改 `.harness/project.json` 声明的唯一类型，不增加另一类型入口、项目派生入口、workspace package 或跨项目共享层；源 Harness 模板契约遵守根 `AGENTS.md` 的唯一源外创建入口与两个互斥生成结果硬约束。
2. 按功能内聚组织 TypeScript：
   - React 组件拥有展示、表单输入和局部交互；可复用 feature hook/service 拥有该功能的请求、缓存、持久化和协调。
   - TanStack Query 管理远端/异步服务状态；Jotai 只管理确需跨组件共享的客户端交互状态，不镜像 Query 数据。
   - 业务判断放在最靠近真实功能且可单测的模块，不塞进 JSX、通用 `utils` 或无领域含义的 manager。
3. 主题、页面、Popup、Options、布局、组件、交互状态、响应式或 UI 无障碍变化先读取 `docs/MANTINE_UI_GUIDELINES.md`，复用 Mantine theme、语义令牌和当前宿主模式，不散落品牌常量、不建立第二套基础组件系统。
4. Web 使用 Vite/React 的既有路由与页面约定，不替换 Mantine、TanStack Router/Query、Jotai 或 i18next 技术基线。
5. Extension 使用 Plasmo Chrome MV3 约定。popup/options/content/background 各自拥有宿主生命周期；消息与 storage 契约显式类型化，监听器可清理，权限保持最小。新增或扩大 permissions/host_permissions 必须取得明确批准，并执行权限、安全及真实 Chrome 专项门禁。
6. 面向用户的新文案通过既有 `i18next`/`react-i18next` 资源，不引入第二套 i18n 机制。
7. 环境或 endpoint 变化读取 `RUNTIME_CONFIGURATION.md`：业务代码只读 `APP_CONFIG`，保持 development/test/release 三份配置、宿主前缀和构建前全量校验；禁止 `.env`/`.env*.local` 隐式覆盖及未知公开键，不得把浏览器公开变量当秘密。
8. 日志或错误处理变化读取 `LOGGING.md`：产品代码通过统一 logger，新增稳定作用域、事件名和最小上下文；覆盖 Release 级别、允许字段清单、脱敏与产物扫描，不新增散落 `console.*`。
9. 集合分页与 HTTP client 变化读取 `DATA_ACCESS.md`：复用 `src/pagination/` 的 1-based page/pageSize session 契约和 `src/api/client/` 的 header/Token/401 边界；真实 endpoint 负责把外部分页字段映射为内部结构，不能复制一套页面私有标准。
10. 不留下 mock、stub、占位分支、假产物路径或只在源码中存在但真实入口不可达的能力。

## 测试与验证

1. 行为变化新增或更新非空测试：成功路径、最高风险失败和缺陷回归。组件交互用 Testing Library；纯函数/服务用 Vitest；Extension 消息、storage 和权限拒绝覆盖相应契约。
2. 日常实现只运行第 1 项新增或更新的相关非空测试；通常使用 `pnpm test:related <changed-source...>`，相关图返回零测试时改跑所属测试文件或记录相称最小替代检查，不得把空批次声明为通过。用户可见 Task 真实进入这些测试、review 或 checkpoint 前把标题进度更新为 `检查中`；检查失败并返回同范围修复时更新为 `运行中`，再次检查再进入 `检查中`。每次真实转换至多尝试一次，并按真实 `threadId` 用 `list_threads` 有界复读。内部 Subagent 不适用用户可见 Task 标题合同。纯文档、元数据、格式或不可合理单测的机械变化不制造空洞测试，只运行证明解析或差异完整所必需的最小检查。
3. 日常开发不得自动追加格式化、lint、typecheck、集成/契约、全仓测试、构建、文件行数、中文声明注释、冒烟或 E2E。只有本次变化确实需要、用户明确请求，或正式候选/产品/安全/权限/渠道硬要求时才运行对应门禁；任一已经运行的检查失败仍在当前授权范围内修复并重跑。行为保持重构按 `$web-refactor-code` 运行全量测试。
4. 只有用户明确请求最终产物/完整验收、当前任务正在形成发布候选，或产品、安全、权限、渠道存在真实候选硬要求时才运行唯一 `pnpm build`。每次调用前都询问用户是否为当次候选启用 E2E，并传入 `--e2e=enabled|disabled`；不得从默认策略或历史选择替用户决定。构建固定委托 `build:release`，并拥有环境、Harness、格式、lint、类型、全量测试、`YYYYMMDDHHMM` 版本注入、生产构建和 `release:inspect` 门禁。模板输出契约需要完整验收时，还要在隔离目录生成并验证 Web 与 Extension，但每个下游只生成自身 Release 候选，不生成 development/test 产物。
5. 本次变化确实涉及职责或体积时，检查人工维护文件：终端下游 501–1000 行复核业务高内聚与单一职责，1001 行起必须按业务职责拆分到同一功能或工具模块目录；源 Harness 按其 `docs/ENGINEERING_RULES.md` 的 500/2000 受管文本边界执行。不得压缩格式或建立跨模块兜底目录规避。
6. 修复范围内失败并重跑。涉及 Release 构建时确认 `build:release`（及 Extension `package`）在宿主命令后自动通过 `pnpm release:inspect`，并验证页面包含当次构建版本；需要复核既有产物时直接运行该脚本。本 Skill 不直接运行冒烟或 E2E；当次选择 `enabled` 时把精确候选交给 `$web-verify-delivery` 执行批准的 E2E，选择 `disabled` 时记录 `Not run`，不把开发服务器或单元测试声明为真实产物验收。
7. 发布候选、用户明确要求完整验收、当前构建启用 E2E 或浏览器硬要求时交给 `$web-verify-delivery`；存在活动 Work Plan 时先要求相关 Todo 全部 `done`。没有这些独立事件的日常实现，在本次必要测试或最小替代检查通过后直接报告。

## 项目记忆

只按独立事件触发：范围变化转 `$web-define-product`；长期决定/硬例外写 ADR；真实发布完成、重要阻断、跨会话交接或用户要求时写 Status；用户可见新增/变化/移除/安全事项按 Changelog 索引规则处理。普通缺陷修复、纯重构、格式和测试补强不自动创建这些文件；构建命令、时间版本、E2E 选择与构建/验收结果只在命令输出和当前任务交付说明中报告，不创建或更新 Work Plan、ADR、Status、Changelog、Verification 或其他持久项目记忆。

## 完成输出

报告路径、变更、每项公开行为的“入口 → 实现 → 测试”映射、权限变化、检查与修复、Todo 状态、未运行项、剩余风险和适用的用户可见 Task 进度标题状态。来自用户可见 Git Task 的修改必须在该 Task 内形成可审查的本地提交，并以空的 `git status --porcelain=v1 --untracked-files=all`、分支和提交 SHA 结束；非 Git Local Task 报告实际修改文件，不声称 Git 提交。授权结果、全部必需检查以及请求要求的提交/推送/远端复读完成后，用户可见 Task 才把标题进度更新为终态 `已完成`。实施授权不包含发布、推送、标签、凭据或不可逆外部操作。
