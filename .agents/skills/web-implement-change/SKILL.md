---
name: web-implement-change
description: 在 Web Harness 或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游中实施范围清楚的快速/普通标准请求，或执行活动 Work Plan，并运行风险相称的前端 TypeScript、测试与构建检查；里程碑失败后回到此 Skill 修复。
---

# Web Harness：实施前端变更

完成当前授权范围，保护用户修改，不为了流程或复用想象扩大工程。

## 工作流程

1. 判定路径：局部、可逆且无硬触发器使用 `快速`；可逆的普通页面、路由、交互或跨职责变化使用 `标准`；初始化/项目类型契约、品牌/身份派生、已承诺的兼容性/对外契约、Extension 权限/站点匹配、隐私/安全边界、破坏性数据处理、生产副作用或发布候选等硬触发器升级里程碑并补计划。
2. 先识别仓库：存在 `.harness/project.json` 时是唯一类型下游；否则仅在根 manifest 暴露源专用 `instantiate` 入口时按 Harness 源处理。读取 Agent Policy、工程规则、Git 根/分支/状态和受影响代码；创建入口与终端化硬约束直接遵循根 `AGENTS.md`，不在本 Skill 重写全文。只在相关时读取 Product Spec、活动 Work Plan、ADR、Verification 或技术债。
3. 确认 Git 顶层目录等于项目根，并保留所有用户修改。先检查 diff；重叠修改无法安全整合时停止，不重置、覆盖或顺手格式化无关文件。
4. 普通代码、测试、lint 或 typecheck 不调用环境检查；只有任务包含初始化、即将执行最终 Release 构建，或已出现疑似工具链/宿主错误时才调用 `$web-check-development-environment`，并优先复用匹配证据。纯文档/元数据任务跳过。
5. 默认单 Agent 实施。只有用户明确要求并行、存在至少两个无重叠 Todo 且基线干净已提交时才调用 `$web-run-parallel-worktrees`；当前任务的明确要求按 Agent Policy 优先级覆盖默认 `disabled`，不能仅因历史字段为 `enabled` 主动并行。
6. 快速路径和无持久计划的标准路径实现最小完整行为；存在活动计划时选择依赖已满足的首个非 `done` Todo，标记 `in_progress`，通过必需检查后才标记 `done`。

## 实现边界

1. 下游只修改 `.harness/project.json` 声明的唯一类型，不增加另一类型入口、项目派生入口、workspace package 或跨项目共享层；源 Harness 模板契约遵守根 `AGENTS.md` 的唯一源外创建入口与两个互斥生成结果硬约束。
2. 按功能内聚组织 TypeScript：
   - React 组件拥有展示、表单输入和局部交互；可复用 feature hook/service 拥有该功能的请求、缓存、持久化和协调。
   - TanStack Query 管理远端/异步服务状态；Jotai 只管理确需跨组件共享的客户端交互状态，不镜像 Query 数据。
   - 业务判断放在最靠近真实功能且可单测的模块，不塞进 JSX、通用 `utils` 或无领域含义的 manager。
3. 主题、页面、Popup、Options、布局、组件、交互状态、响应式或 UI 无障碍变化先读取 `docs/MANTINE_UI_GUIDELINES.md`，复用 Mantine theme、语义令牌和当前宿主模式，不散落品牌常量、不建立第二套基础组件系统。
4. Web 使用 Vite/React 的既有路由与页面约定，不替换 Mantine、TanStack Router/Query、Jotai 或 i18next 技术基线。
5. Extension 使用 Plasmo Chrome MV3 约定。popup/options/content/background 各自拥有宿主生命周期；消息与 storage 契约显式类型化，监听器可清理，权限保持最小。新增或扩大 permissions/host_permissions 必须有批准范围和里程碑计划。
6. 面向用户的新文案通过既有 `i18next`/`react-i18next` 资源，不引入第二套 i18n 机制。
7. 环境或 endpoint 变化读取 `RUNTIME_CONFIGURATION.md`：业务代码只读 `APP_CONFIG`，保持 development/test/release 三份配置、宿主前缀和构建前全量校验；禁止 `.env`/`.env*.local` 隐式覆盖及未知公开键，不得把浏览器公开变量当秘密。
8. 日志或错误处理变化读取 `LOGGING.md`：产品代码通过统一 logger，新增稳定作用域、事件名和最小上下文；覆盖 Release 级别、允许字段清单、脱敏与产物扫描，不新增散落 `console.*`。
9. 集合分页与 HTTP client 变化读取 `DATA_ACCESS.md`：复用 `src/pagination/` 的 1-based page/pageSize session 契约和 `src/api/client/` 的 header/Token/401 边界；真实 endpoint 负责把外部分页字段映射为内部结构，不能复制一套页面私有标准。
10. 不留下 mock、stub、占位分支、假产物路径或只在源码中存在但真实入口不可达的能力。

## 测试与验证

1. 行为变化新增或更新非空测试：成功路径、最高风险失败和缺陷回归。组件交互用 Testing Library；纯函数/服务用 Vitest；Extension 消息、storage 和权限拒绝覆盖相应契约。
2. 日常实现从窄到宽运行受影响的格式、lint、类型与 `pnpm test:related <changed-source...>`；相关图返回零测试时改跑所属测试文件或记录相称替代验证，不得把空批次声明为通过。除行为保持重构与最终构建/发布外，不运行全量 `pnpm test`。纯文档/元数据任务只运行相称静态检查。
3. 配置、项目结构、跨切面、构建链或 Release 行为变化在完成窄检查后运行唯一 `pnpm build`。每次调用前都询问用户是否为当次候选启用 E2E，并传入 `--e2e=enabled|disabled`；不得从默认策略或历史选择替用户决定。构建固定委托 `build:release`，并拥有环境、Harness、格式、lint、类型、全量测试、`YYYYMMDDHHMM` 版本注入、生产构建和 `release:inspect` 门禁。模板输出契约变化还要在隔离目录生成并验证 Web 与 Extension，但每个下游只生成自身 Release 候选，不生成 development/test 产物。
4. 检查人工维护文件的职责和体积：终端下游超过 500 行复核业务高内聚与单一职责，达到 1000 行必须按业务职责拆分到同一功能或工具模块目录；源 Harness 按其 `docs/ENGINEERING_RULES.md` 的 500/2000 受管文本边界执行。不得压缩格式或建立跨模块兜底目录规避。
5. 修复范围内失败并重跑。涉及 Release 构建时确认 `build:release`（及 Extension `package`）在宿主命令后自动通过 `pnpm release:inspect`，并验证页面包含当次构建版本；需要复核既有产物时直接运行该脚本。本 Skill 不直接运行冒烟或 E2E；当次选择 `enabled` 时把精确候选交给 `$web-verify-delivery` 执行批准的 E2E，选择 `disabled` 时记录 `Not run`，不把开发服务器或单元测试声明为真实产物验收。
6. 里程碑全部 Todo `done` 后交给 `$web-verify-delivery`；标准/快速路径在开发检查通过后直接报告。

## 项目记忆

只按独立事件触发：范围变化转 `$web-define-product`；长期决定/硬例外写 ADR；里程碑、重要阻断或交接写 Status；用户可见新增/变化/移除/安全事项按规则写 Changelog。普通缺陷修复、纯重构、格式和测试补强不自动创建这些文件；构建命令、时间版本、E2E 选择与构建/验收结果只在命令输出和当前任务交付说明中报告，不创建或更新 Work Plan、ADR、Status、Changelog、Verification 或其他持久项目记忆。

## 完成输出

报告路径、变更、每项公开行为的“入口 → 实现 → 测试”映射、权限变化、检查与修复、Todo 状态、未运行项和剩余风险。实施授权不包含发布、推送、标签、凭据或不可逆外部操作。
