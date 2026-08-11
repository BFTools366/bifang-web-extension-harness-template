---
name: implement-change
description: 在源 Harness 或其单 package React Web/Plasmo Chrome Extension 下游中实施范围清楚的请求或活动 Work Plan，并运行风险相称的 TypeScript、测试与构建检查。快速路径可直接调用；标准/里程碑路径执行 Todo，里程碑失败后回到此 Skill 修复。
---

# 实施变更

完成当前授权范围，保护用户修改，不为了流程或复用想象扩大工程。

## 工作流程

1. 判定路径：局部、可逆且无硬触发器使用 `快速`；活动计划使用其 `标准` 或 `里程碑`。发现公开页面/契约变化、Extension 权限/站点匹配、隐私/安全边界、破坏性数据处理、生产副作用或发布候选时，立即升级里程碑并补计划。
2. 先识别仓库：存在 `.harness/project.json` 时是唯一类型下游；不存在该文件但存在 `instantiate`/`harness:init` 源入口时是 Harness 源。读取 Agent Policy、工程规则、Git 根/分支/状态和受影响代码；只在相关时读取 Product Spec、活动 Work Plan、ADR、Verification 或技术债。
3. 确认 Git 顶层目录等于项目根，并保留所有用户修改。先检查 diff；重叠修改无法安全整合时停止，不重置、覆盖或顺手格式化无关文件。
4. 实际代码任务缺少匹配环境证据时调用 `$check-development-environment`；纯文档/元数据任务跳过。
5. 有至少两个无重叠 Todo、干净已提交基线且策略启用时可调用 `$run-parallel-worktrees`；否则单 Agent实施。
6. 快速路径实现最小完整行为。标准/里程碑路径选择依赖已满足的首个非 `done` Todo，标记 `in_progress`，通过必需检查后才标记 `done`。

## 实现边界

1. 下游只修改 `.harness/project.json` 声明的唯一类型，不增加另一类型入口、workspace package 或跨项目共享层；源 Harness 的模板契约变化必须同时覆盖两种互斥生成结果，但不能把二者生成到同一仓库。
2. 按功能内聚组织 TypeScript：
   - React 组件拥有展示、表单输入和局部交互；可复用 feature hook/service 拥有该功能的请求、缓存、持久化和协调。
   - TanStack Query 管理远端/异步服务状态；Jotai 只管理确需跨组件共享的客户端交互状态，不镜像 Query 数据。
   - 业务判断放在最靠近真实功能且可单测的模块，不塞进 JSX、通用 `utils` 或无领域含义的 manager。
3. Web 使用 Vite/React 的既有路由与页面约定，不替换 Mantine、TanStack Router/Query、Jotai 或 i18next 技术基线。
4. Extension 使用 Plasmo Chrome MV3 约定。popup/options/content/background 各自拥有宿主生命周期；消息与 storage 契约显式类型化，监听器可清理，权限保持最小。新增或扩大 permissions/host_permissions 必须有批准范围和里程碑计划。
5. 面向用户的新文案通过既有 `i18next`/`react-i18next` 资源，不引入第二套 i18n 机制。
6. 环境或 endpoint 变化读取 `RUNTIME_CONFIGURATION.md`：业务代码只读 `APP_CONFIG`，保持 development/test/release 三份配置、宿主前缀和构建前全量校验；禁止 `.env`/`.env*.local` 隐式覆盖及未知公开键，不得把浏览器公开变量当秘密。
7. 日志或错误处理变化读取 `LOGGING.md`：产品代码通过统一 logger，新增稳定 scope/event 和最小 context；覆盖 Release 级别、allowlist、脱敏与产物扫描，不新增散落 `console.*`。
8. 集合分页与 HTTP client 变化读取 `DATA_ACCESS.md`：复用 `src/pagination/` 的 1-based page/pageSize session 契约和 `src/api/client/` 的 header/Token/401 边界；真实 endpoint 负责把外部分页字段映射为内部结构，不能复制一套页面私有标准。
9. 不留下 mock、stub、占位分支、假产物路径或只在源码中存在但真实入口不可达的能力。

## 测试与验证

1. 行为变化新增或更新非空测试：成功路径、最高风险失败和缺陷回归。组件交互用 Testing Library；纯函数/服务用 Vitest；Extension 消息、storage 和权限拒绝覆盖相应契约。
2. 从窄到宽运行相关测试，再运行 package 中适用的格式、lint、类型、测试和构建脚本。下游每次交付前运行 `pnpm env:validate` 与 `pnpm harness validate`；源 Harness 运行 `pnpm validate:harness`，模板输出契约变化还要在隔离目录生成并验证 Web 与 Extension。
3. 检查人工维护文件的职责和体积：超过 500 行复核是否高内聚且单一职责；超过 2000 行必须按真实职责拆分，不能压缩格式规避。
4. 修复范围内失败并重跑。涉及 Release 构建时确认 `build:release`（及 Extension `package`）在宿主命令后自动通过 `pnpm release:inspect`；需要复核既有产物时直接运行该脚本。本 Skill 不运行冒烟或 E2E，也不把开发服务器或单元测试声明为真实产物验收。
5. 里程碑全部 Todo `done` 后交给 `$verify-delivery`；标准/快速路径在开发检查通过后直接报告。

## 项目记忆

只按独立事件触发：范围变化转 `$define-product`；长期决定/硬例外写 ADR；里程碑、重要阻断或交接写 Status；用户可见新增/变化/移除/安全事项按规则写 Changelog；里程碑或发布证据写 Verification。普通缺陷修复、纯重构、格式和测试补强不自动创建这些文件。

## 完成输出

报告路径、变更、每项公开行为的“入口 → 实现 → 测试”映射、权限变化、检查与修复、Todo 状态、未运行项和剩余风险。实施授权不包含发布、推送、标签、凭据或不可逆外部操作。
