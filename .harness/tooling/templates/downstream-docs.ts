import type { ProjectConfig } from "../types.ts"

// 执行 stackName 函数的处理逻辑。
function stackName(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "Vite + React/TypeScript、Mantine、TanStack Router、TanStack Query、Jotai 与 i18next"
    : "Plasmo + Chrome MV3 + Firefox MV2 + React/TypeScript、Mantine、TanStack Router、TanStack Query、Jotai 与 i18next"
}

// 执行 brandAssets 函数的处理逻辑。
function brandAssets(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "`public/logo.png`、`public/favicon.png`、`index.html` 与 Landing 页面"
    : "`assets/icon.png`、Plasmo 按浏览器目标动态生成的 manifest、Popup 与 Options"
}

// 执行 artifact 函数的处理逻辑。
function artifact(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "Vite 生成的 `dist/` 目录"
    : "Plasmo 生成的 Chrome MV3 / Firefox MV2 两套构建与受验收 zip"
}

// 返回当前宿主独立的页面构建版本来源。
function buildVersionSource(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "上海时区 `YYMMDDHHMMSS`"
    : "`package.json.version` 的稳定 SemVer（`X.Y.Z`）"
}

// 执行 engineeringRules 函数的处理逻辑。
function engineeringRules(config: ProjectConfig): string {
  // 保存 hostRules 变量供当前逻辑使用。
  const hostRules =
    config.projectType === "web"
      ? `- Web 按 \`app → routes → features → data\` 组织；\`data/api/client\` 是受管请求基础，真实 endpoint 与域契约按功能加入，Query key、缓存、mutation 和失效策略留在 feature。不得生成占位请求或第二套 services 层。\n- TanStack Router 使用 \`src/routes/\` 文件路由；route 文件只声明路由契约，业务 UI、hooks、客户端状态和测试留在 \`features/\`。\n- Router 消费 \`features/route-state/RouteState.tsx\` 的统一加载、错误、重试与日志默认值；多页面标题、焦点、滚动和表单交互遵循 \`MANTINE_UI_GUIDELINES.md\`，真实读写的重试/缓存生命周期遵循 \`DATA_ACCESS.md\`。\n- Vite Router plugin 必须位于 React plugin 之前并启用 route 级自动拆包；没有真实 bundle 证据时不预设手工 \`manualChunks\`。\n- \`src/routeTree.gen.ts\` 被 Git、格式化器和 lint 忽略，只能由 \`pnpm routes:generate\`、dev 或 build 动态生成，不得手工编辑。\n- 当前生成结果默认从站点根路径部署。首次真实渠道再明确 base path、路由回退、CSP、跨域、缓存和环境变量边界；子路径需要同时调整 Vite、Router 与公共资源地址。`
      : `- Extension 固定维护 Chrome MV3 与 Firefox MV2，仍是一个单包。宿主边界变更或重构调用 \`$web-review-extension-compatibility\` 做只读审查，修复及必要测试由调用方负责。执行 Agent 在每次开发中自行核对并保证两目标的 API、callback/Promise、消息、权限、后台、CSP/资源及 URL 差异；按真实消费者使用能力检测、类型化 adapter 或 Plasmo 目标入口，补充受影响目标的成功/失败测试，一个目标通过不能推断另一个。\n- 最终 manifest 由 Plasmo 动态生成，共享 package.json.manifest 不固定 manifest_version；专有 override 按 manifest.overrides.chrome/firefox 浅合并，值使用目标最终协议，不能期待自动转换任意手写后台/action；pnpm dev 默认 Chrome，pnpm dev:firefox 使用 Firefox，build/package 默认完成两目标与统一检查。\n- Popup 与 Options 是独立 Plasmo 入口，各自挂载 TanStack Router；Popup 使用 memory history，Options 使用 hash history。 \`src/extension-router.tsx\` 用代码声明路由，不使用 Web 文件路由生成器。\n- \`package.json.targets.default\` 必须使用 browser context 并启用 \`includeNodeModules\`；production JS 不得留下运行时包的 Parcel self-map。\n- 权限、host permissions、content scripts 与 Web accessible resources 必须按真实用途最小化；不得使用远程托管可执行代码。\n- Chrome MV3 使用可回收 service worker，Firefox MV2 使用后台 scripts/page；监听器及时注册，状态可恢复，不把后台页持久运行当作共同前提；外部消息和 Storage 数据进入业务前必须校验。\n- RxJS 只能编排当前执行上下文内的事件；Popup、Options、content script 与 service worker 之间仍使用类型化浏览器消息或 Port。`
  // 保存 routeTreeExclusion 变量供当前逻辑使用。
  const routeTreeExclusion = config.projectType === "web" ? " src/routeTree.gen.ts、" : " "

  return `# 工程规则

本文档只适用于 **${config.name}** 当前的 \`${config.projectType}\` 单包，不定义项目生成器或其他宿主。

## 项目边界

- \`.harness/project.json\` 是项目名称、标识、描述、唯一 \`projectType\` 与品牌配置的事实源。
- 项目保持平铺 pnpm 单包；\`pnpm-workspace.yaml\` 仅配置 \`allowBuilds\`，不得声明 \`packages\`、引入多包 workspace、\`apps/\`、第二宿主或项目类型切换入口。
- 固定技术栈：${stackName(config)}。
- \`.harness/brand/logo-1024.png\` 是 Logo 母版；${brandAssets(config)}只能由受管品牌流程派生。
- 保护用户和其他 Agent 的既有修改；未知文件默认归用户所有，不得用整文件覆盖绕过冲突。

## TypeScript 与职责

- 启用严格类型检查；跨模块输入、外部响应、浏览器消息和环境变量在边界校验，不用无约束 \`any\` 隐藏不确定性。
- React 组件负责渲染与局部交互；TanStack Query 管理远端或异步服务状态；Jotai 只管理确需跨组件共享的纯客户端状态，不镜像 Query 数据。
- \`src/pagination/\` 的 page/pageSize session 状态、成功空页回退，以及 \`src/data/api/client/\` 的三个 header、显式 Token 写入、401/403 与统一错误反馈 遵循 \`docs/DATA_ACCESS.md\`；真实业务 endpoint 只能按域加入。
- 未配置对应 BaseURL 时，仅依赖该远端 API 的操作由 API 层 Mock 提供；本地能力直接真实实现，不要求 BaseURL。混合流程只隔离远端边界，真实联网迁移及失败不回落 Mock 的规则以 \`docs/DATA_ACCESS.md\` §3.1 为准。
- \`src/data/\` 统一 API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB；\`data/api/\` 承载服务边界，\`data/storage/\` 集中存储访问。REST 负责主要交互与写入，GraphQL 负责复杂查询与 Subscription；Dexie 仅用于真实 IndexedDB 消费者，其他存储保持原生语义，详细分工见 \`docs/DATA_ACCESS.md\` §1.1–1.3。
- Ky 为默认 HTTP 传输；OpenAPI、GraphQL、SSE 与可选 RxJS 事件流依赖只随真实消费者加入，并复用既有请求安全与状态所有权契约。
- RxJS 只在多来源或复杂时序需求出现时编排瞬时事件，不成为 Query/Jotai 的第二状态仓库、持久事件日志或全局可写 Subject。
- Mantine UI 的 theme、令牌、布局、组件语义、交互状态、响应式与无障碍遵循 \`docs/MANTINE_UI_GUIDELINES.md\`；不散落品牌常量、不建立第二套基础组件系统。
- 用户可见文案进入 i18next，至少保留英文回退和项目声明的实际语言资源。
- 三份公开运行配置与 BaseURL 只通过 \`src/config/environment.ts\` 的 \`APP_CONFIG\` 进入业务代码，遵循 \`docs/RUNTIME_CONFIGURATION.md\`。
- 产品日志只通过 \`src/observability/logger.ts\`，边界覆盖、敏感字段和 Release 裁剪遵循 \`docs/LOGGING.md\`。
- 严格中文注释门禁覆盖人工维护与 Harness 生成的 .ts/.tsx 中的稳定结构声明：interface、type alias、enum、class、具名函数、方法/访问器/constructor、直接或后置命名/默认导出的箭头函数组件与 hook，以及测试文件或显式 Vitest 导入中的 test/it 场景，都必须紧邻一条包含汉字的注释。显而易见的字段、局部变量、循环绑定和普通匿名/极短内联 callback 由所属结构或函数注释覆盖；非直观约束仍在最近职责边界说明。
- 只精确排除第三方或构建生成物${routeTreeExclusion}.plasmo/**、build/**、dist/**、coverage/**、node_modules/** 与 .git/**；不得用 *.gen.ts 等宽泛模式隐藏维护源码。注释应说明声明职责，不能用字符串、英文注释、尾随前一语句或隔空文件头冒充；pnpm lint 会自动运行 pnpm comments:check。
- 人工维护代码不超过 500 行为默认目标；501–600 行必须复核业务高内聚与单一职责并记录保留理由，601 行起必须按业务逻辑拆分。拆分文件留在原功能或工具模块目录，不建立跨模块 \`utils\`/\`common\` 兜底层，也不得压缩格式规避；生成文件与人工维护文件保持清晰边界。源码体积门禁额外排除 GraphQL codegen 等 \`generated/**\` 输出目录，因为该类文件不受业务内聚拆分约束。

## 当前宿主规则

${hostRules}

## 品牌与身份

1. 先更新 \`.harness/project.json\` 或提供新的 Logo 源。
2. 运行 \`pnpm harness brand refresh\`，只生成当前宿主资产与身份翻译；根 name/description 是默认语言，identityI18n 只记录另一语言翻译。
3. 运行 \`pnpm harness validate\`，不得手工修补派生文件来掩盖事实源漂移。

## 测试与交付

- 行为变化必须有非空测试，至少覆盖核心成功路径和最高风险失败路径。
- 日常任务只运行本次变化需要的相关非空测试或最小替代检查，通常使用 \`pnpm test:related <changed-source...>\`；依赖图没有发现测试时，必须改跑所属非空测试文件或说明相称替代验证。不得自动追加格式、lint、类型、全仓检查或构建；全量 \`pnpm test\` 只在行为保持重构或最终构建/发布时运行。
- \`pnpm build\` 是唯一最终产物入口并固定委托 \`build:release\`，无论本机还是 CI/其他平台都使用逻辑 Release。同一发布流程复用已明确的 E2E 选择，非交互入口显式传 \`--e2e=enabled|disabled\`；它自动运行环境、Harness、格式、lint、类型与全量测试，注入${buildVersionSource(config)}页面版本，再完成生产构建与含版本命中的 \`release:inspect\`。不得提供 development/test 产物构建脚本。
- 构建命令、页面版本、E2E 选择及其测试、扫描或浏览器结果只进入命令输出和当前任务交付说明，不创建或更新 Work Plan、ADR、Status、Changelog、Verification 或其他持久项目记忆。
- Mock 只能隔离外部依赖，不能替代最终构建验收。未运行的浏览器、操作系统或渠道写为 \`Unverified\`。
- 明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；新增目的地或范围外的凭据、生产数据、付费及不可逆副作用才补充授权。
`
}

// 执行 releaseRules 函数的处理逻辑。
function releaseRules(config: ProjectConfig): string {
  // 保存 artifactChecks 变量供当前逻辑使用。
  const artifactChecks =
    config.projectType === "web"
      ? "检查 `dist/index.html`、静态资源、Logo/favicon、路由回退与部署配置。"
      : "先由 `pnpm harness validate` 检查 browser target 和运行时依赖自包含，构建后由 `release:inspect` 分别检查 Chrome MV3 / Firefox MV2 动态 manifest 的身份消息引用、default_locale 与实际 `_locales` 内容，再检查 Popup、Options、图标、版本及 permissions/host_permissions；两个 production 目录均必需，任一目标缺失或失败都拒绝候选；还必须对同一 Release 源码运行 `pnpm package`，确认其自动执行 `pnpm harness validate` 与 `pnpm release:inspect` 并分别生成 build/chrome-mv3-prod.zip 与 build/firefox-mv2-prod.zip，两者独立绑定哈希与验收。"

  return `# 版本与发布

本文件只定义 **${config.name}** 当前 \`${config.projectType}\` 项目的候选门禁。

## 版本事实

- ${config.projectType === "web" ? "页面候选版本由构建时的上海时间 `YYMMDDHHMMSS` 生成；`package.json.version` 仅是包元数据。" : "根 `package.json.version` 的稳定 SemVer（`X.Y.Z`）是软件、页面与两目标 manifest 的同一版本事实；每段不超过 65535，三段不能全为零，构建和打包不自动递增。"}\`pnpm-lock.yaml\` 固定依赖解析。
- 版本、源码提交、锁文件、构建产物和验证证据必须指向同一候选；构建后的行为或品牌修改会产生新候选。
- 当前唯一发布产物是${artifact(config)}，不得用另一宿主或开发预览替代。

## 候选门禁

1. \`.harness/project.json.projectType\` 必须仍为 \`${config.projectType}\`，仓库保持单包且没有另一宿主入口。
2. 解析或复用本次发布的 E2E \`enabled|disabled\` 选择，再对同一源码实际运行 \`pnpm build -- --e2e=<selection>\`；该唯一 Release 构建入口必须自动完成 \`pnpm harness validate\`、格式、lint、typecheck 与非空全量单元测试，不在外层重复执行同一批门禁。
3. \`pnpm build\` 必须校验三份受管环境配置和活动 Release profile，${config.projectType === "web" ? "生成" : "读取"}并展示${buildVersionSource(config)}构建版本，并在生产构建后自动通过包含版本命中的 \`pnpm release:inspect\`；${artifactChecks}development/test profile 不得生成候选产物。
4. 当次 E2E 选择 \`enabled\` 或产品、安全、渠道硬要求浏览器验证时，只对上述精确 Release 候选运行${config.projectType === "extension" ? "，分别在隔离真实 Chrome/Firefox 记录各目标证据；临时加载不证明 AMO 签名/分发，首次真实发布按产品事实确认 Gecko ID 与数据收集声明" : ""}；选择 \`disabled\` 时记录 \`Not run\` 与 \`Unverified\` 范围，不把开发预览或 Mock 冒充候选证据。
5. 在当前任务交付说明中报告源码提交、版本、最终文件清单、适用时的 SHA-256、实际环境、已运行检查、未验证范围与已知问题；构建操作本身不写入 ADR、Changelog、Verification 或其他持久项目记忆。
6. 必需检查失败、取消、超时或未执行时结论为 \`Not ready\`；不能用历史结果或部分成功替代。

## 外部操作

明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；仅要求准备候选不触发外部发布，新增目的地、渠道或范围外副作用才补充授权。本地构建成功不等于已经发布或渠道审核通过。
`
}

// 执行 runtimeConfiguration 函数的处理逻辑。
function runtimeConfiguration(config: ProjectConfig): string {
  // 保存 prefix 变量供当前逻辑使用。
  const prefix = config.projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
  return `# 运行配置与环境

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的运行配置事实。三份逻辑环境缺一不可；\`release\` 映射到 \`.env.production\`，不是第四份环境。

| 逻辑环境        | 受管文件             | 用途                       | 默认日志级别 |
| --------------- | -------------------- | -------------------------- | ------------ |
| \`development\` | \`.env.development\` | \`pnpm dev\` 本地运行        | \`debug\`    |
| \`test\`        | \`.env.test\`        | Vitest 测试运行时          | \`info\`     |
| \`release\`     | \`.env.production\`  | \`pnpm build\` 唯一最终产物 | \`warn\`     |

## 字段与边界

- \`${prefix}APP_ENV\`：必须与文件的逻辑环境一致。
- \`${prefix}API_BASE_URL\`：初始化和日常文件校验允许留空；已填值必须是无凭据、query 或 fragment 的绝对 HTTP(S) URL，正式地址只接受 HTTPS。正式发布前及活动 Release 校验必须补齐正式地址。
- \`${prefix}LOG_LEVEL\`：只接受 \`debug|info|warn|error\`，Release 只接受 \`warn|error\`。
- \`${prefix}REQUEST_TIMEOUT_MS\`：\`1000\`–\`120000\` 的正整数。

开发/测试运行时允许地址为空；本地能力直接真实实现，不要求 BaseURL，只有对应远端 API 进入 Mock，详细分工见 \`docs/DATA_ACCESS.md\` §3.1。真实 HTTP client 在未配置地址时于 Fetch 前报错，不猜测 endpoint 或发送相对请求。Release 运行时拒绝空地址。

浏览器公开前缀中的值会进入产物，绝不保存 Token、Cookie、密码、API key 或服务端秘密。业务代码只读 \`src/config/environment.ts\` 导出的冻结 \`APP_CONFIG\`，不得散落读取宿主环境变量或拼接任意 BaseURL。

构建编排器只向宿主生产构建子进程注入只读的 \`${prefix}BUILD_VERSION\`，值为${buildVersionSource(config)}；它不属于四个可配置 profile 键，不得写入 \`.env*\` 或 \`APP_CONFIG\`。页面通过 \`src/buildVersion.ts\` 展示该值，\`release:inspect\` 使用同一私有期望值确认候选命中。${config.projectType === "extension" ? "两目标 manifest 版本还必须与 `package.json.version` 一致。" : ""}

语言偏好、分页 session、\`X-Http-Request\` continuation 与 \`X-AUTH-TOKEN\` 都是运行时状态，不进入任何公开环境键；其存储、并发和清理规则见 \`docs/DATA_ACCESS.md\`。

## 用户要求真实联网时

先读取三份受管配置并复用有效值，再汇总询问缺失的 development、test、release BaseURL 及当前功能实际使用的远端服务 target。用户已提供的值不重复询问；暂不使用的环境或服务可留空，正式发布仍须补齐 HTTPS 正式地址。初始化、本地能力开发与普通 Mock 开发不提前收集这些地址。

使用当前宿主的 \`${prefix}\` 前缀更新对应受管环境文件并校验；多服务仅在确有消费者时扩展类型化只读 target registry、schema 与公开键白名单。配置通过后按 \`docs/DATA_ACCESS.md\` §3.1 迁移对应 API；仅填写地址不代表服务已接通。Web CORS、认证和 Extension 网络权限按真实消费者单独处理。

\`.env\`、\`.env.local\` 与三种 \`.env.*.local\` 会造成构建器静默覆盖，项目门禁明确拒绝其存在。选定 profile 只允许当前进程覆盖上述四个已声明键；未知 \`${prefix}*\` 键拒绝。development/test 只服务运行与测试，不允许生成最终候选；所有本机、CI 或其他平台的产物构建都固定使用逻辑 \`release\` 和 \`.env.production\`。

## 命令

- \`pnpm env:validate\`：校验三份文件，允许 API 地址留空。
- \`pnpm env:validate --profile development|test|release\`：校验全部文件，并验证选定 profile 的进程覆盖；Release profile 要求正式地址非空且 HTTPS。
- \`pnpm build\`：\`pnpm build:release\` 的唯一产物入口；复用本次发布已明确的 E2E 选择，非交互入口传 \`--e2e=enabled|disabled\`，构建前运行完整环境、Harness、格式、lint、类型和全量单元测试门禁，注入${buildVersionSource(config)}页面版本后自动运行 \`pnpm release:inspect\`。

Node.js、pnpm 与按需使用的${config.projectType === "web" ? " Chrome" : " Chrome/Firefox"} 的工具链探测不同于上述运行配置校验。本项目已经完成首次初始化；普通开发、构建、新会话或 Agent 切换不预探测，只有真实命令报出疑似环境错误后才按 [\`$web-check-development-environment\`](../.agents/skills/web-check-development-environment/SKILL.md) 诊断相关组件。

${config.projectType === "extension" ? "Extension 的 BaseURL 不授予权限；Chrome MV3 host_permissions / Firefox MV2 permissions 中的 host patterns 按 docs/DATA_ACCESS.md 审批最小集合。" : ""}
`
}

// 执行 loggingRules 函数的处理逻辑。
function loggingRules(config: ProjectConfig): string {
  return `# 日志设计与发布脱敏

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的日志契约。统一入口为 \`src/observability/logger.ts\`；产品代码不直接调用 console，CLI 的必要终端输出除外。

## 结构与覆盖

每条记录包含 ISO 时间、\`debug|info|warn|error\`、稳定小写 \`scope\`/\`event\`、环境和可选有界 context。初始化基线覆盖启动、浏览器全局错误、未处理 Promise、React render boundary 以及 TanStack Query/Mutation 错误；未来新增 route、API、浏览器 message、content script 或 service worker 入口时，应在各自执行上下文接入 logger。

默认 sink 只写本地浏览器 console，不持久化、不上传。远端遥测会改变隐私边界，必须另行审批。

## 脱敏与 Release

- 所有环境按键名脱敏 Authorization、Token、Cookie、password、secret 与 API key。
- HTTP client 的 continuation、语言和认证 header 值、request/response body 以及未经校验的服务端消息从不进入日志；\`X-Http-Request\` 不自动作为 requestId 记录。
- HTTP 基线使用稳定事件 \`http.request_failed\`、\`http.unauthorized\` 、\`http.unauthorized_handler_failed\` 与 \`http.error_interceptor_failed\`；401 handler 失败只记录 \`http.unauthorized_handler_failed\` 并保留原 401；观察器失败只记录 \`http.error_interceptor_failed\` 并保留原始协议或传输错误。
- Release 有效最低级别固定为 \`warn\`，抑制 debug/info，只保留批准字段。
- URL 删除凭据、query 和 fragment；Error 删除 stack/cause；用户绝对路径替换为 \`[LOCAL_PATH]\`。
- body、headers、GraphQL variables、Storage、页面内容、完整标签页 URL 与任意对象快照禁止记录。
- 日志构造、清理、时钟或 sink 失败不得中断业务路径。

\`pnpm build:release\` 和 Extension \`pnpm package\` 在注入${buildVersionSource(config)}页面版本并生成产物后自动运行 \`pnpm release:inspect\`。${
    config.projectType === "extension"
      ? "Extension 还会先运行 `pnpm harness validate`，拒绝错误 browser target 或运行时依赖 Parcel self-map。"
      : ""
  }文件名层对所有候选文件拒绝 \`.env*\` 与 \`.map\`；内容扫描只读取 \`.css\`、\`.html\`、\`.js\`、\`.json\`、\`.mjs\`、\`.txt\` 与 \`.xml\`，并拒绝开发/测试 BaseURL、固定哨兵 \`debug_sentinel\`、\`info_sentinel\`、\`application_started\`、\`surface_started\`、\`do-not-ship\`、原始 \`console.debug\`/\`console.info\`、本机绝对路径与 \`sourceMappingURL\`。${config.projectType === "extension" ? "Extension 分别检查 `build/chrome-mv3-prod` 与 `build/firefox-mv2-prod`，不会直接解包扫描 zip。" : ""}该固定规则集不是通用秘密扫描器，也不能代替 logger 单元测试或被硬要求的${config.projectType === "web" ? "真实 Chrome" : "逐目标真实 Chrome/Firefox"} 候选验证。
`
}

// 执行 technicalDebt 函数的处理逻辑。
function technicalDebt(config: ProjectConfig): string {
  return `# 技术债与已知限制

本文件记录 **${config.name}** 当前 \`${config.projectType}\` 项目中已观察、已接受且不在活动任务范围内的问题。初始化器不代替产品团队虚构业务技术债。

## 记录规则

- 新条目必须包含可观察事实、用户或工程影响、状态和明确的处理/复核条件。
- 当前任务已授权解决的问题进入活动计划，不先登记后拖延。
- 安全漏洞、凭据泄露或可能造成用户损害的问题不能仅以技术债延期。
`
}

// 执行 dataAccess 函数的处理逻辑。
function dataAccess(config: ProjectConfig, canonical: string): string {
  // 保存 sectionMarker 变量供当前逻辑使用。
  const sectionMarker = "## 1. 选型结论"
  // 保存 webListMarker 与 httpMarker 变量供 Extension 裁掉 Web-only 列表数据契约使用。
  const webListMarker = "### 2.5 React Web 路由列表契约"
  const queryMarker = "### 2.6 Query 重试、mutation 与缓存生命周期"
  const httpMarker = "## 3. HTTP、认证与 REST/OpenAPI"
  // 保存 deliveryMarker 变量供当前逻辑使用。
  const deliveryMarker = "## 7. 落地与测试门禁"
  // 保存 sectionStart 变量供当前逻辑使用。
  const sectionStart = canonical.indexOf(sectionMarker)
  if (sectionStart < 0) throw new Error(`Canonical DATA_ACCESS.md is missing ${sectionMarker}`)
  // 保存 allCanonicalSections 变量供验证并按宿主裁剪规范使用。
  const allCanonicalSections = canonical.slice(sectionStart).trim()
  // 保存 webListStart 与 httpStart 变量供验证 Web-only 章节边界使用。
  const webListStart = allCanonicalSections.indexOf(webListMarker)
  const queryStart = allCanonicalSections.indexOf(queryMarker)
  const httpStart = allCanonicalSections.indexOf(httpMarker)
  if (webListStart < 0 || queryStart <= webListStart || httpStart <= queryStart) {
    throw new Error("Canonical DATA_ACCESS.md has invalid Web list section markers")
  }
  // 保存 canonicalSections 变量；Extension 删除只适用于 React Web 的列表正向契约。
  const canonicalSections =
    config.projectType === "web"
      ? allCanonicalSections
      : `${allCanonicalSections.slice(0, webListStart).trimEnd()}\n\n${allCanonicalSections
          .slice(queryStart)
          .trimStart()}`
  // 保存 deliveryStart 变量供当前逻辑使用。
  const deliveryStart = canonicalSections.indexOf(deliveryMarker)
  if (deliveryStart < 0) throw new Error(`Canonical DATA_ACCESS.md is missing ${deliveryMarker}`)

  // 保存 hostRules 变量供当前逻辑使用。
  const hostRules =
    config.projectType === "web"
      ? `## 当前 Web 宿主补充

- 每个真实 endpoint 在落地前确认 CORS、credentials、CSP、base URL 与部署环境变量；浏览器环境变量不能保存服务端秘密。
- 页面、路由或 target 改变时关闭旧 SSE 连接，避免隐藏页面和重复挂载产生重复订阅。`
      : `## 当前 Extension 宿主补充

- 每个跨域 REST、GraphQL 或 SSE origin 只在真实功能落地时申请最小 **host_permissions**（Chrome MV3）/ **permissions** host patterns（Firefox MV2）；本知识文档不授予或预置权限。
- 类型化 endpoint registry 必须与已批准的 manifest origin 一致，并覆盖权限未授予或被撤销的失败路径。
- Popup/Options 关闭时清理连接；MV3 service worker 可能被回收，不能承诺把持久 SSE 长连接托管在 service worker。`

  // 保存 derivedSections 变量供当前逻辑使用。
  const derivedSections = `${canonicalSections.slice(0, deliveryStart).trimEnd()}

${hostRules}

${canonicalSections.slice(deliveryStart)}`

  return `# 数据访问与事件流集成技术选型

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的分页、HTTP/认证、数据访问、SSE 与可选 RxJS 工程事实。项目包含无业务 endpoint 的 Ky HTTP 与分页基础，Ky 为运行时依赖，不预装 Axios/RxJS、不生成占位网络/事件总线代码，也不预置 endpoint 或 Extension 权限。

${derivedSections}
`
}

// 执行 mantineUiGuidelines 函数的处理逻辑。
function mantineUiGuidelines(config: ProjectConfig, canonical: string): string {
  // 保存 sharedMarker 变量供当前逻辑使用。
  const sharedMarker = "## 1. 规范等级与使用方式"
  // 保存 webListMarker 与 feedbackMarker 变量供 Extension 裁掉 Web-only 列表规范使用。
  const webListMarker = "### 5.4 React Web 重复记录视图"
  const feedbackMarker = "## 6. 状态与反馈"
  // 保存 webMarker 变量供当前逻辑使用。
  const webMarker = "## 8. Web 宿主规范"
  // 保存 extensionMarker 变量供当前逻辑使用。
  const extensionMarker = "## 9. Extension 宿主规范"
  // 保存 deliveryMarker 变量供当前逻辑使用。
  const deliveryMarker = "## 10. 交付检查"
  // 保存 sharedStart 变量供当前逻辑使用。
  const sharedStart = canonical.indexOf(sharedMarker)
  // 保存 webListStart 与 feedbackStart 变量供验证 Web-only 章节边界使用。
  const webListStart = canonical.indexOf(webListMarker)
  const feedbackStart = canonical.indexOf(feedbackMarker)
  // 保存 webStart 变量供当前逻辑使用。
  const webStart = canonical.indexOf(webMarker)
  // 保存 extensionStart 变量供当前逻辑使用。
  const extensionStart = canonical.indexOf(extensionMarker)
  // 保存 deliveryStart 变量供当前逻辑使用。
  const deliveryStart = canonical.indexOf(deliveryMarker)
  if (
    sharedStart < 0 ||
    webListStart <= sharedStart ||
    feedbackStart <= webListStart ||
    webStart <= sharedStart ||
    feedbackStart >= webStart ||
    extensionStart <= webStart ||
    deliveryStart <= extensionStart
  ) {
    throw new Error("Canonical MANTINE_UI_GUIDELINES.md has invalid section markers")
  }

  // 保存 shared 变量；Extension 删除只适用于 React Web 的列表正向规范。
  const shared =
    config.projectType === "web"
      ? canonical.slice(sharedStart, webStart).trim()
      : `${canonical.slice(sharedStart, webListStart).trimEnd()}\n\n${canonical
          .slice(feedbackStart, webStart)
          .trimStart()}`
  // 保存 hostSection 变量供当前逻辑使用。
  const hostSection =
    config.projectType === "web"
      ? canonical.slice(webStart, extensionStart).trim()
      : canonical
          .slice(extensionStart, deliveryStart)
          .trim()
          .replace(extensionMarker, "## 8. Extension 宿主规范")
  // 保存 delivery 变量供当前逻辑使用。
  const delivery = canonical
    .slice(deliveryStart)
    .trim()
    .replace(deliveryMarker, "## 9. 交付检查")
    .replace("## 11. 反模式", "## 10. 反模式")
    .replace("## 12. 官方依据", "## 11. 官方依据")

  return `# Mantine UI 设计规范

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的 Mantine UI 设计事实。项目身份与品牌色仍以 \`.harness/project.json\` 为唯一来源；工程和测试通则仍以 [\`ENGINEERING_RULES.md\`](ENGINEERING_RULES.md) 为准。

当前项目声明 Mantine \`9.6.3\`，并以根级 \`MantineProvider\`、\`createTheme\` 和 Mantine CSS variables 为实现基线。升级 Mantine 时必须重新核对主题、Styles API 和响应式机制；未安装的 \`@mantine/form\`、\`@mantine/notifications\` 等扩展包不是现有能力。

${shared}

${hostSection}

${delivery}
`
}

// 执行 docsReadme 函数的处理逻辑。
function docsReadme(config: ProjectConfig): string {
  return `# 文档索引

本目录只保存 **${config.name}** 当前 \`${config.projectType}\` 项目的长期工程事实。

| 文档                                           | 何时读取                             |
| ---------------------------------------------- | ------------------------------------ |
| [\`AGENT_POLICY.md\`](AGENT_POLICY.md)           | 判断任务路径、持久计划、并行、冒烟与 E2E 偏好 |
| [\`ENGINEERING_RULES.md\`](ENGINEERING_RULES.md) | 修改代码、测试、文档或配置           |
| [\`MANTINE_UI_GUIDELINES.md\`](MANTINE_UI_GUIDELINES.md) | 修改主题、页面、组件、布局、交互状态或 UI 无障碍 |
| [\`API.md\`](API.md) | 查阅可选基础 API 契约、数据模型与接入边界 |
| [\`DATA_ACCESS.md\`](DATA_ACCESS.md)             | 分页、HTTP/认证、数据访问、SSE 与 RxJS |
| [\`RUNTIME_CONFIGURATION.md\`](RUNTIME_CONFIGURATION.md) | 修改环境或运行配置       |
| [\`LOGGING.md\`](LOGGING.md)                     | 修改日志、错误边界或发布脱敏         |
| [\`RELEASE.md\`](RELEASE.md)                     | 准备版本、候选或发布                 |
| [\`TECH_DEBT.md\`](TECH_DEBT.md)                 | 记录当前范围外的已知限制             |

按任务读取最少事实；终端仓库只维护当前项目类型的产品与工程流程。

需要从当前代码整理 API 文档时，调用 [\`$web-document-api\`](../.agents/skills/web-document-api/SKILL.md)，在 \`docs/api/\` 生成索引与每个模块的独立文档；\`API.md\` 仍是可选基础契约参考，不能替代当前实现证据。
`
}

// 执行 downstreamGovernanceFiles 函数的处理逻辑。
export function downstreamGovernanceFiles(
  config: ProjectConfig,
  canonicalDataAccess: string,
  canonicalMantineUiGuidelines: string
): Map<string, string> {
  return new Map([
    ["docs/README.md", docsReadme(config)],
    ["docs/ENGINEERING_RULES.md", engineeringRules(config)],
    ["docs/MANTINE_UI_GUIDELINES.md", mantineUiGuidelines(config, canonicalMantineUiGuidelines)],
    ["docs/DATA_ACCESS.md", dataAccess(config, canonicalDataAccess)],
    ["docs/RUNTIME_CONFIGURATION.md", runtimeConfiguration(config)],
    ["docs/LOGGING.md", loggingRules(config)],
    ["docs/RELEASE.md", releaseRules(config)],
    ["docs/TECH_DEBT.md", technicalDebt(config)]
  ])
}
