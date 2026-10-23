---
name: web-verify-delivery
description: 对 Web Harness 源码候选或单一类型纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游发布候选执行完整真实产物验收：Harness 验证两种独立生成结果，Web 验证 Vite dist，Extension 验证 Chrome MV3 / Firefox MV2 构建/zip；由发布候选、用户明确要求完整验收、当前构建启用 E2E 或浏览器硬要求触发。
---

# Web Harness：验证前端交付

Workspace 须显式绑定一个前端成员候选及根 Git/锁/策略；先核对根拓扑，再核对该成员 projectType 与产物。下面 Git 顶层等于项目根的规则只适用旧独立前端；已登记成员要求 Git 顶层等于 Workspace 根。完整 Harness 验收还需覆盖所选成员组合及服务来源条件，不能只验证旧平铺布局。

验收完整候选，而不是源码片段、开发服务器、一组通过的单元测试或推测产物路径。

## 准入门禁

1. 确认存在发布候选、用户明确要求完整验收、当前构建启用 E2E 或浏览器硬要求，并识别仓库：存在 `.harness/project.json` 时读取唯一 `projectType`；不存在但根 manifest 暴露源专用 `instantiate` 入口时按 Harness 候选读取 `Version.md`。源 Harness 不应存在 `harness:init`，`pnpm harness init` 只能稳定拒绝；下游不得存在任何项目派生或内部初始化入口。同时读取 Agent Policy、工程规则和既有验证证据；只有用户要求的活动 Work Plan、相关 Product Spec/ADR 实际存在时才读取。
2. 只有存在用户要求的活动 Work Plan 时，才要求当前候选相关 Todo 均为 `done`；没有 Work Plan 不阻断验收。代码行为必须有非空单元/回归测试，纯文档、元数据或不可合理单测的候选必须有相称替代验证。否则停止并返回 `$web-implement-change`。
3. 要求 Git 顶层等于项目根，并记录当前源码提交和工作区状态。产物必须能精确绑定到该提交、候选版本、lock/hash 与当前环境；工具/依赖版本只按最低版本准入，身份/协议事实不采用“至少”语义。脏状态会影响绑定时必须重建或停止。
4. 拒绝 mock、stub、占位、初始化空壳、开发预览、源码直接调用、历史产物和目录名猜测。
5. 同一发布流程复用已明确的 E2E 选择，覆盖 build、package、修复与元数据重建，不重复询问：`enabled` 标为 `required`，`disabled` 标为 `not-required`；尚无选择且无硬要求时只询问一次，用户、产品、安全或渠道硬要求时执行 `enabled`。复用选择不复用旧验证证据，新字节仍重新验收。同时按 `docs/AGENT_POLICY.md` 解析冒烟门禁：`acceptance_smoke: enabled` 在完整候选验收且无更高优先级硬要求时把 smoke 标为 `required`；`acceptance_smoke: disabled` 在无硬要求时把 smoke 标为 `not-required`；用户、产品、安全或渠道硬要求优先于持久值。源 Harness 的 `pending` 不授权可选 smoke，无硬要求时按 `not-required` 处理。smoke 与 E2E 选择相互独立，不互相替代；记录两项结果、场景与授权边界。

## 构建与静态证据

1. 不为最终构建预先调用环境检查；直接运行真实构建命令。只有命令已经失败且错误明确指向 Node.js、pnpm、原生依赖或宿主环境时，才调用 `$web-check-development-environment` 诊断相关组件并在修复后重试。已批准的浏览器步骤直接交给 E2E Skill，对应浏览器无法发现或启动后再进入环境诊断。
2. 发现 `package.json` 中真实脚本。下游只运行唯一 `pnpm build -- --e2e=enabled|disabled`，确认它固定委托 `build:release`，在生成候选前自动完成三环境、Harness、格式、lint、类型与非空全量测试；Web 按上海时区生成 `YYMMDDHHMMSS` 页面版本，Extension 读取 `package.json.version` 的稳定 SemVer 并注入页面、匹配两目标 manifest，在宿主生产构建后自动通过含版本命中检查的 `pnpm release:inspect`。不得在外层重复执行这些全量门禁。Extension 候选另以当次选择运行 `pnpm package -- --e2e=enabled|disabled` 并确认其生成同一 Release profile 的受验收 zip。源 Harness 运行 `pnpm validate:harness` 和根级适用门禁，再通过不含 E2E 选择的 `pnpm instantiate -- <absolute-parent-outside-harness> ...` 以精简必填参数在源外两个隔离目标分别生成 Web/Extension，验证未配地址留空且仍可初始化；确认初始化期不产生 Release 产物，每个下游只提供后续 Release 产物入口、sibling staging 是内部步骤、源内目标零写入，且两个成功下游均无创建入口。随后在两个下游按运行配置合同补齐正式地址，再按本次候选选择分别显式构建。自建 Server 的首次空地址由根 release 从生产配置推导回环 HTTP 地址并提示确认；独立隔离测试可使用明确的测试确认，不能代答真实项目用户。开发/测试地址保持可选；空地址或远端 HTTP 必须阻断 Release，本机回环 HTTP 应通过工具校验、浏览器 schema 和产物扫描。不得编造缺失脚本或在源根误用下游校验命令。
3. 检查构建内的名称、说明、Logo、i18n、版本和唯一 `projectType`：
   - `Harness`：两个独立下游各自只有一个类型；两者都验证三环境、宿主前缀、`APP_CONFIG`、分页/sessionStorage、语言持久化、HTTP header/Token/401 基础、logger、非空测试和唯一 Release 构建，不能生成 development/test 候选或把二者合成同仓产物。
   - `web`：只接受本次生产构建生成的 Vite `dist/`，检查入口、静态资源、路由 fallback 与无开发源引用。
   - `extension`：要求本次 Plasmo production 生成的 Chrome MV3 与 Firefox MV2 两个目录及其经 `pnpm package` 生成的对应 zip；运行时可从精确目录加载，但候选证据必须同时绑定两者，逐个检查动态 manifest_version=3/2、action/browser_action、后台协议、入口、资源、i18n/图标、消息及最小权限与批准范围；共享 override 不固定 manifest_version，一个目标缺失或失败即不满足候选合同。
4. 对每个批准行为复核“用户入口 → 实现模块 → 非空测试”。保存 `pnpm release:inspect` 的实际通过证据；需要独立复核既有目录时重跑该命令。检查 TypeScript 功能边界、日志脱敏、无障碍和用户可见文案，不要求或引入共享工程层。

## 真实运行时验收

1. 明确关键成功路径、最高风险失败路径、真实输入/输出、外部前置项、清理和超时。
2. 当次 E2E 选择为 `disabled` 且 smoke 也为 `not-required` 时记录 `Not run` 与 `Unverified` 范围，不启动浏览器。关闭浏览器流程不跳过三环境、全量单测、版本注入、Release 构建、日志/敏感信息扫描或其他固定门禁。
3. 只有 smoke 为 `required` 时才对真实候选运行有边界的逐目标浏览器冒烟：Web 从 `dist/` 启动本地静态服务；Extension 分别从精确 MV3/MV2 候选加载到隔离 Chrome/Firefox profile。不得用 Vite/Plasmo 开发服务器代替。
4. 只有 E2E 为 `required` 时调用 `$web-test-final-artifact-e2e`，传入精确候选路径/hash、`projectType`、Release profile、已批准场景、超时、外部授权边界和清理要求；子 Skill 只返回场景证据，不重新解析策略、重开 Todo 或决定候选验收结论。记录各实际 Chrome/Firefox/OS，分别绑定目标路径/hash及场景，一个浏览器通过不能推断另一个或其他平台。
5. 保存候选路径、SHA-256、提交/版本、环境 profile、命令/场景、预期与观察、Release console/扫描、截图（适用时）、清理、跳过项和未验证范围。敏感信息与个人路径最小化。
6. 后续重新构建、重新打包或任何改变候选字节的操作都会产生新候选，必须重新验证。

## 失败回流与结论

1. 任一硬门禁或已标记 `required` 的检查失败、超时、取消、未运行，或产物与批准范围不符时，记录失败证据；只有用户要求的活动 Work Plan 存在时才重开/新增具体 Todo，并立即返回 `$web-implement-change`。修复后重新运行完整候选验收。
2. 场景返回 `blocked` 时先分类：源码/产品缺陷重开具体 Todo 并返回 `$web-implement-change`；缺少账号、凭据、外部服务、人工决定或独立授权时保持 `Awaiting human review`，报告精确前置项，不创建伪修复 Todo、不扩大授权，也不得接受候选。
3. 产品边界变化转 `$web-define-product`；新凭据、生产副作用或不可逆动作必须另行授权。
4. 只使用：`Milestone accepted`、`Awaiting human review`、`Milestone rejected`。不得使用“部分通过”掩盖必需失败。
5. 构建与验收操作只在命令输出和当前任务交付说明中报告，不创建或更新 Verification、Status、Changelog、ADR、Work Plan 或其他持久项目记忆；独立的产品、长期决策或发布事件只有在用户明确要求持久记录时才交给对应流程。

## 完成输出

报告结论、精确候选与哈希、提交/版本、仓库种类与项目类型、三环境/Release profile、运行命令、测试、日志/敏感信息扫描、Chrome/Firefox 逐目标场景、策略解析、失败回流、未验证范围和剩余风险。明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；仅要求验收不触发外部发布，新增目的地或范围外副作用才补充授权。
