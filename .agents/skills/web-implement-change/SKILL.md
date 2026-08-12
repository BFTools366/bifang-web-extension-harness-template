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
4. 实际代码任务缺少匹配环境证据时调用 `$web-check-development-environment`；纯文档/元数据任务跳过。
5. 有至少两个无重叠 Todo、干净已提交基线且策略启用时可调用 `$web-run-parallel-worktrees`；否则单 Agent实施。
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
2. 从窄到宽运行受影响的格式、lint、类型与非空测试。配置、项目结构、跨切面、构建链或 Release 行为变化再增加对应 `pnpm env:validate`、`pnpm harness validate`/`pnpm validate:harness` 与构建检查；模板输出契约变化还要在隔离目录生成并验证 Web 与 Extension。里程碑、发布候选、用户明确要求，或窄检查不足以建立可信度时运行完整 package 门禁；纯文档/元数据任务只运行相称静态检查。
3. 检查人工维护文件的职责和体积：超过 500 行复核是否高内聚且单一职责；超过 2000 行必须按真实职责拆分，不能压缩格式规避。
4. 修复范围内失败并重跑。涉及 Release 构建时确认 `build:release`（及 Extension `package`）在宿主命令后自动通过 `pnpm release:inspect`；需要复核既有产物时直接运行该脚本。本 Skill 不运行冒烟或 E2E，也不把开发服务器或单元测试声明为真实产物验收。
5. 里程碑全部 Todo `done` 后交给 `$web-verify-delivery`；标准/快速路径在开发检查通过后直接报告。

## 项目记忆

只按独立事件触发：范围变化转 `$web-define-product`；长期决定/硬例外写 ADR；里程碑、重要阻断或交接写 Status；用户可见新增/变化/移除/安全事项按规则写 Changelog；里程碑或发布证据写 Verification。普通缺陷修复、纯重构、格式和测试补强不自动创建这些文件。

## 完成输出

报告路径、变更、每项公开行为的“入口 → 实现 → 测试”映射、权限变化、检查与修复、Todo 状态、未运行项和剩余风险。实施授权不包含发布、推送、标签、凭据或不可逆外部操作。
