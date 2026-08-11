---
name: verify-delivery
description: 对源 Harness 里程碑或单类型下游发布候选执行完整真实产物验收：Harness 验证两种独立生成结果，Web 验证 Release dist，Extension 验证 Release Chrome MV3 构建/zip；按策略或硬要求使用真实 Chrome。仅在全部 Todo 完成或用户明确要求完整验收时使用；快速和普通标准任务不调用。
---

# 验证交付

验收完整候选，而不是源码片段、开发服务器、一组通过的单元测试或推测产物路径。

## 准入门禁

1. 确认任务是里程碑路径并识别仓库：存在 `.harness/project.json` 时读取唯一 `projectType`；不存在但有源 `instantiate`/`harness:init` 入口时按 Harness 候选读取 `Version.md`。同时读取 Agent Policy、活动 Work Plan、相关 Product Spec/ADR、工程规则和既有验证证据。
2. 要求候选批次每个 Todo 均为 `done`，代码行为有非空单元/回归测试，非代码候选有计划声明的相称验证。否则停止并返回 `$implement-change`。
3. 要求 Git 顶层等于项目根，并记录当前源码提交和工作区状态。产物必须能精确绑定到该提交、候选版本、lock/hash 与当前环境；工具/依赖版本只按最低版本准入，身份/协议事实不采用“至少”语义。脏状态会影响绑定时必须重建或停止。
4. 拒绝 mock、stub、占位、初始化空壳、开发预览、源码直接调用、历史产物和目录名猜测。

## 构建与静态证据

1. 调用 `$check-development-environment`，要求 Node.js、pnpm 和本场景的真实 Chrome 门禁通过。
2. 发现 `package.json` 中真实脚本。下游运行 `pnpm env:validate`、`pnpm harness validate` 以及适用格式、lint、类型、非空测试和 `pnpm build`；确认 `build:release` 在宿主命令后自动通过 `pnpm release:inspect`，Extension zip 还需让 `pnpm package` 自动通过该检查。源 Harness 运行 `pnpm validate:harness` 和根级适用门禁，再以显式三 BaseURL 在两个隔离目录分别生成 Web/Extension。不得编造缺失脚本或在源根误用下游校验命令。
3. 检查构建内的名称、说明、Logo、i18n、版本和唯一 `projectType`：
   - `Harness`：两个独立下游各自只有一个类型；两者都验证三环境、宿主前缀、`APP_CONFIG`、分页/sessionStorage、语言持久化、HTTP header/Token/401 基础、logger、非空测试和 development/test/release 构建，不能把二者合成同仓产物。
   - `web`：只接受本次生产构建生成的 Vite `dist/`，检查入口、静态资源、路由 fallback 与无开发源引用。
   - `extension`：只接受本次 Plasmo production 生成的 Chrome MV3 目录或对应 zip，检查 manifest_version=3、入口、资源、消息声明、permissions/host_permissions 与批准范围。
4. 对每个批准行为复核“用户入口 → 实现模块 → 非空测试”。保存 `pnpm release:inspect` 的实际通过证据；需要独立复核既有目录时重跑该命令。检查 TypeScript 功能边界、日志脱敏、无障碍和用户可见文案，不要求或引入共享工程层。

## 真实运行时验收

1. 明确关键成功路径、最高风险失败路径、真实输入/输出、外部前置项、清理和超时。
2. 解析硬要求、用户更严格要求，以及 Agent Policy 的 `milestone_smoke`/`milestone_e2e`。`enabled` 且适用时必须运行；`disabled` 记录 `Not run` 和风险，除非硬要求覆盖。普通标准任务不调用本 Skill；关闭可选 E2E 不跳过三环境、Release 构建、日志/敏感信息扫描或 smoke 硬门禁。缺失/非法/冲突时请求用户决定。
3. 对真实候选运行有边界的 Chrome smoke：Web 从 `dist/` 启动本地静态服务；Extension 从精确 MV3 候选加载到隔离 Chrome profile。不得用 Vite/Plasmo dev server替代。
4. 仅当 E2E 已启用或硬要求时调用 `$test-final-artifact-e2e`。记录实际 Chrome/OS，不推断其他浏览器或平台。
5. 保存候选路径、SHA-256、提交/版本、环境 profile、命令/场景、预期与观察、Release console/扫描、截图（适用时）、清理、跳过项和未验证范围。敏感信息与个人路径最小化。
6. 后续重新构建、重新打包或任何改变候选字节的操作都会产生新候选，必须重新验证。

## 失败回流与结论

1. 任一必需检查失败、超时、取消、未运行，或产物与批准范围不符时，记录失败证据，重开/新增具体 Todo，并立即返回 `$implement-change`。修复后重新运行完整里程碑。
2. 产品边界变化转 `$define-product`；新凭据、生产副作用或不可逆动作必须另行授权。
3. 只使用：`Milestone accepted`、`Awaiting human review`、`Milestone rejected`。不得使用“部分通过”掩盖必需失败。
4. 里程碑/发布验收独立触发 Verification；只更新真实被触发的 Status/Changelog，不反向生成无关项目记忆。

## 完成输出

报告结论、精确候选与哈希、提交/版本、仓库种类与项目类型、三环境/Release profile、运行命令、测试、日志/敏感信息扫描、Chrome 场景、策略解析、失败回流、未验证范围和剩余风险。验收不授权 tag、push、上传或发布。
