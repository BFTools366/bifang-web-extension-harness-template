# 版本与发布

新创建以 [Workspace 合同](WORKSPACE_TEMPLATE.md) 为准：根拥有 Git、锁与产品事实，成员内部单一宿主；已有服务必填开发 BaseURL，需要服务且明确没有现成服务时创建 Go 成员，确定纯本地时自动 none。下文旧平铺单包限定只适用于既有独立前端；发布与验收必须显式选定一个成员、根 Git 与精确候选。

本文件定义 Harness 模板和两类独立下游的版本、候选与发布门禁。它不保存当前 Harness 版本；当前值只见根 [`Version.md`](../Version.md)。

## 1. 版本事实

- Harness 使用上海时区 `YYYYMMDDHHMM` 时间版本，Git 标签建议为 `vYYYYMMDDHHMM`。
- Web 候选页面版本由构建时的上海时间生成，格式为 `YYMMDDHHMMSS`；其 `package.json.version` 仍是包元数据，不作为页面构建版本。Web 候选标签可使用 `vYYMMDDHHMMSS`。
- Extension 以根 `package.json.version` 的稳定 SemVer（`X.Y.Z`）作为软件、页面与两目标 manifest 的同一版本事实；每段为 `0`–`65535`，三段不能全为零，以符合 [Chrome manifest version 规则](https://developer.chrome.com/docs/extensions/reference/manifest/version)。构建和打包只读取该值，不自动递增。Extension 标签可使用 `vX.Y.Z`。
- `.harness/project.json.projectType` 是候选宿主类型事实，发布脚本不得从目录猜测或同时构建两个宿主。
- 版本、源码提交、锁文件、构建产物和验证证据必须指向同一候选。任何构建后修改都会产生新候选。
- `Unreleased` 表示尚未形成对外发布承诺，不能因本地构建成功改写为已发布。
- Node.js、pnpm 与受控依赖的兼容门禁按声明的稳定 SemVer（`x.y.z`）最低版本判断；合法更高版本需要继续运行完整门禁，而不是因不等于基线而失败，prerelease 或无法解析的声明失败。`packageManager` 仍为精确 `pnpm@x.y.z` pin 且不得低于 pnpm 最低版本。
- 最低版本规则不适用于身份或协议事实：Harness/软件当前版本、候选版本、源码提交、lockfile/hash、Schema/协议版本、`manifest_version`、`projectType` 与验收记录必须精确匹配。

## 2. 候选与外部操作准入

日常开发不会因为复杂度、多模块或用户可见而自动形成候选。以下事件进入对应的候选、完整验收或外部操作门禁：

- Harness 项目创建命令、内部初始化门禁、`projectType` 枚举或模板输出契约变化；
- Logo 生成、身份/manifest 同步或 Extension 权限变化；
- 新增或移除 Harness 支持的独立项目类型；
- 创建发布候选、对外上传、Chrome Web Store/Firefox AMO 提交或用户明确要求完整验收。

存在用户要求的活动 Work Plan 时，当前候选相关 Todo 必须全部 `done`；没有 Work Plan 本身不阻断用户明确请求的构建或完整验收。

## 3. Harness 模板发布门禁

Harness 候选至少满足：

- [`README.md`](../README.md)、[`AGENTS.md`](../AGENTS.md)、[`Version.md`](../Version.md)、[`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)、[`LOGGING.md`](LOGGING.md)、本目录其他长期文档与现存 Skills 链接一致；
- 源 Harness、Web 下游与 Extension 下游保留的 Skills 数量，以及创建/源记忆治理 Skill 和 Extension 中 Web-only `$web-implement-list-view` 的删除结果符合 [`AGENTS.md`](../AGENTS.md) 的 `web-*` canonical id、目录、中文元数据和前端语义合同；
- 中英文 License 存在、适用项目名称一致，且实质法律条款的任何变更都有明确批准与复核证据；
- 根 `package.json` 与首次 `pnpm install --no-frozen-lockfile --prefer-offline` 产出的锁文件可解析；后续以 frozen lockfile 复现成功，根级 `lint`、`typecheck`、非空 `test`、`format:check` 与 `validate:harness` 通过，其中 `lint` 包含 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §3.1 的中文声明注释门禁；Harness 根没有应用 `build` 门禁；
- 源 Harness 只公开 `pnpm instantiate -- <parent-outside-harness> ...` 作为项目创建入口，不存在 `pnpm harness:init` script；`pnpm harness init` 在解析项目输入或写入前稳定拒绝并指向唯一入口；
- 在源 Harness 之外的两个全新隔离目标分别以精简必填参数执行 `--type web` 和 `--type extension` 非交互实例化，并验证交互式选择没有默认类型，只询问缺失的基础信息及宿主条件字段；另覆盖功能组合资源分发、默认演示页面已移除及下游 PRD 选择边界，遵循 [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md) §2，三地址留空时仍可创建；正式构建前补齐 HTTPS 正式地址；初始化命令不接受 E2E 选择、不运行 Release 构建且不产生 `dist/`、`build/` 或 zip，根为 Workspace，所选前端成员内部各为单 package 且只包含一个 `projectType`；
- 成功下游不再包含 `instantiate`、`harness:init`、源专用创建 Skill、内部 init/instantiate tooling 或其他项目派生入口，不能继续从自身生成项目；
- 类型缺失、非法成员组合、非法或非 HTTPS Release BaseURL、非法 Logo、非法颜色、受管环境冲突、非空目标、源 Harness 根/子路径和路径越界等预检失败保持目标零写入；`instantiate` 只在目标同级 sibling staging 中调用内部 initializer，并在生成、定向格式化、静态结构/三环境/终端化校验、一次安装和 Git 初始化成功后原子发布，任何失败都保持目标不存在或为空；
- Web 结果的 `public/logo.png`、`public/favicon.png`、根 `index.html` 与项目身份一致；
- Extension 结果的 `assets/icon.png`、manifest 身份、Popup 与 Options 一致，Plasmo 能从来源图标生成构建所需尺寸；`targets.default` 明确使用 browser context 与 `includeNodeModules: true`；
- 前端成员包含按已有/自建服务条件配置的 development/test/release 三份配置、类型化 `APP_CONFIG`、统一 logger 与非空测试；Web 只使用 `VITE_`，Extension 只使用 `PLASMO_PUBLIC_`，且不因配置 BaseURL 自动新增权限；
- 两种生成项目各自只运行唯一 `pnpm build` 形成候选；同一发布流程复用已明确的 E2E `enabled|disabled` 选择并显式传参，它固定委托 `build:release`，完整门禁清单见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2，development/test profile 不提供产物入口；
- 两种 Release 构建均自动执行 `pnpm release:inspect`（构建前均先执行 `pnpm harness validate`，`pnpm package` 同样门禁），扫描规则、检查对象与失败即禁止发布的约束以 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2 为唯一权威来源；
- 未实际执行的操作系统、Chrome/Firefox 版本和分发渠道明确标记 `Unverified`；
- 当前已知重要限制已记录在 [`TECH_DEBT.md`](TECH_DEBT.md)。

模板本身没有业务产品。初始化成功只证明脚手架基线已安全创建；工程基础构建成功也不代表下游业务已经验收。

## 4. Web 下游候选

Web 候选至少要求：

1. `.harness/project.json.projectType` 为 `web`，没有 Plasmo/Extension 入口或权限配置。
2. 针对同一源码提交运行唯一 `pnpm build`；它使用逻辑 release 与 `.env.production`，完整构建门禁清单见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2。
3. 最终 Vite 构建存在，title、description、favicon、Logo 和实际产品页面身份一致。
4. 核心成功路径与最高风险失败路径有非空测试；当次 E2E、完整验收解析出的 smoke 或用户、产品、安全、渠道硬要求任一为 `required` 时，用对应范围的 Playwright 或真实浏览器场景验证最终构建及页面构建版本。
5. 部署目标的 base path、环境变量、CSP、缓存和回退路由已按真实渠道验证；Release 产物和浏览器日志通过 [`LOGGING.md`](LOGGING.md) 的裁剪/敏感信息检查；未验证项公开。

明确发布请求覆盖既有部署目标与已批准范围的必要操作，不重复确认；目标、域名或生产密钥等信息缺失时只补充缺失项。仅生成 `dist` 不触发外部发布。

## 5. Extension 下游候选

Extension 候选至少要求：

1. `.harness/project.json.projectType` 为 `extension`，没有 Vite Web Landing 或独立 Web 站内路由。
2. 针对同一源码提交运行与 Web 候选相同的唯一 `pnpm build` 门禁（见 §4 第 2 项）。
3. 最终 Chrome MV3 和 Firefox MV2 构建均存在，manifest 本地化名称/描述引用、显式 default_locale、实际 `_locales/*/messages.json` 与项目身份事实以及版本、Plasmo 生成图标、Popup 与 Options 身份一致；Parcel target 是显式 browser context，production JS 不含任何运行时依赖 self-map。
4. 权限、host permissions、content scripts 和 Web accessible resources 与产品真实用途精确匹配，没有模板遗留高权限。
5. `pnpm package` 从同一 Release 配置生成 Chrome MV3 和 Firefox MV2 各自的 zip，并在打包后自动运行 `pnpm harness validate` 与 `pnpm release:inspect`；目录或 zip 重新生成后必须重新记录哈希和验收。
6. 当次 E2E、完整验收解析出的 smoke 或用户、产品、安全、渠道硬要求任一为 `required` 时，分别在隔离真实 Chrome 和 Firefox 中加载对应最终构建，按批准范围验证 Popup、Options、页面构建版本、必要消息/Storage/权限行为和 Release 日志脱敏；未实际加载时标记 `Unverified`。

最终 manifest 由 Plasmo 根据目标动态产生：共享 override 不固定 manifest_version，MV3 action/service worker 与 MV2 browser_action/background scripts/page 分别检查；两目录的版本、身份、i18n 和图标必须一致且属于同一源码候选。Firefox 临时加载验证不等于签名安装或 AMO 审核。首次真实 AMO 发布按 [Mozilla 官方 manifest 规则](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) 确认稳定 Gecko ID、签名与实际数据收集声明，不在工程初始化时伪造这些事实。

明确要求通过既有 Chrome Web Store 或 Firefox AMO 渠道发布时，沿用该请求执行必要上传与发布步骤；新增渠道、账号或范围外副作用才补充授权。构建成功不等于商店审核通过或可公开分发。

## 6. 验收与发布顺序

1. 如果存在用户要求的活动 Work Plan，完成并关闭当前候选相关 Todo；没有 Work Plan 不阻断明确请求的候选验收。
2. 固定源码提交与依赖锁，不做工具链预探测，直接运行当前项目类型的唯一 `pnpm build` 完成逻辑 Release 构建；只有真实失败指向环境时才诊断相关组件。完整门禁清单见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2。
3. 检查身份、Logo 母版、当前宿主品牌派生、manifest/HTML、配置与权限边界。
4. 确认生成候选的 `build:release` 或 Extension `package` 已自动通过 `pnpm release:inspect`；需要独立复核既有目录时直接重跑该命令。任何命中先修复并生成新候选。
5. 同一发布流程沿用已明确的 E2E 选择，尚无选择且无硬要求时才询问一次；完整验收再按 Agent Policy 独立解析 smoke。E2E 或 smoke 为 `required`、或存在用户/产品/安全/渠道硬要求时，对刚生成的精确候选执行对应浏览器场景；两项均为 `not-required` 时记录 `Not run`、`not-probed` 与 `Unverified` 范围。浏览器流程不能覆盖环境、测试、版本注入、构建、扫描或渠道硬门禁。
6. 在当前任务交付说明中报告实际环境、命令、结果、未执行项和剩余风险（持久记录边界见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §7）。需要人工复核时由真实复核人签署，Agent 不得代签。
7. 只有全部必需门禁通过后才能准备标签或发布元数据；明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；新增目的地或范围外副作用才补充授权。

任何签名、重打包、manifest 修改、品牌替换或渠道处理若改变最终字节或运行行为，都产生新候选并重新执行受影响验收。

## 7. 当前任务交付说明最小字段

- 版本与日期；
- `projectType`；
- 源码提交与锁文件状态；
- 最终产物及 SHA-256（渠道要求时）；
- 实际执行的 lint、类型、测试、构建、冒烟与 E2E；
- 三环境校验、实际 Release profile 与 `pnpm release:inspect` 结果；
- 浏览器、操作系统和渠道验证范围；
- 人工复核人与结论（适用时）；
- 未执行项、`Unverified` 范围和已知问题。

工程创建事务完成只证明基线就绪；完整创建须在下游实现并验证确认首版。首版的开发浏览器走查与本文件最终候选验收分别取证，不能互相代替。仅要求创建时不为构建伪填 Release BaseURL；需要 dist/zip 才形成真实候选并执行对应门禁。
