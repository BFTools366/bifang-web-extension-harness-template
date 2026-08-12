import type { ProjectConfig } from "../types.ts"

function stackName(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "Vite + React/TypeScript、Mantine、TanStack Router、TanStack Query、Jotai 与 i18next"
    : "Plasmo + Chrome MV3 + React/TypeScript、Mantine、TanStack Query、Jotai 与 i18next"
}

function brandAssets(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "`public/logo.png`、`public/favicon.png`、`index.html` 与 Landing 页面"
    : "`assets/icon.png`、Chrome manifest、Popup 与 Options"
}

function artifact(config: ProjectConfig): string {
  return config.projectType === "web"
    ? "Vite 生成的 `dist/` 目录"
    : "Plasmo 生成的 Chrome MV3 构建与受验收 zip"
}

function engineeringRules(config: ProjectConfig): string {
  const hostRules =
    config.projectType === "web"
      ? `- Web 按 \`app → routes → features → api\` 组织；\`api/client\` 是受管请求基础，真实 endpoint 与域契约按功能加入，Query key、缓存、mutation 和失效策略留在 feature。不得生成占位请求或第二套 services 层。\n- TanStack Router 使用 \`src/routes/\` 文件路由；route 文件只声明路由契约，业务 UI、hooks、客户端状态和测试留在 \`features/\`。\n- Vite Router plugin 必须位于 React plugin 之前并启用 route 级自动拆包；没有真实 bundle 证据时不预设手工 \`manualChunks\`。\n- \`src/routeTree.gen.ts\` 被 Git、格式化器和 lint 忽略，只能由 \`pnpm routes:generate\`、dev 或 build 动态生成，不得手工编辑。\n- 部署前明确 base path、路由回退、CSP、跨域、缓存和环境变量边界。`
      : `- Popup 与 Options 是独立 Plasmo 入口；没有真实页内导航需求时不引入路由器。\n- \`package.json.targets.default\` 必须使用 browser context 并启用 \`includeNodeModules\`；production JS 不得留下运行时包的 Parcel self-map。\n- 权限、host permissions、content scripts 与 Web accessible resources 必须按真实用途最小化；不得使用远程托管可执行代码。\n- Service worker 可能随时回收，不能依赖进程内长期状态；外部消息和 Storage 数据进入业务前必须校验。\n- RxJS 只能编排当前执行上下文内的事件；Popup、Options、content script 与 service worker 之间仍使用类型化 Chrome 消息或 Port。`

  return `# 工程规则

本文档只适用于 **${config.name}** 当前的 \`${config.projectType}\` 单包，不定义项目生成器或其他宿主。

## 项目边界

- \`.harness/project.json\` 是项目名称、标识、描述、唯一 \`projectType\` 与品牌配置的事实源。
- 项目保持平铺 pnpm 单包；不得加入 workspace、\`apps/\`、\`packages/\`、第二宿主或项目类型切换入口。
- 固定技术栈：${stackName(config)}。
- \`.harness/brand/logo-1024.png\` 是 Logo 母版；${brandAssets(config)}只能由受管品牌流程派生。
- 保护用户和其他 Agent 的既有修改；未知文件默认归用户所有，不得用整文件覆盖绕过冲突。

## TypeScript 与职责

- 启用严格类型检查；跨模块输入、外部响应、浏览器消息和环境变量在边界校验，不用无约束 \`any\` 隐藏不确定性。
- React 组件负责渲染与局部交互；TanStack Query 管理远端或异步服务状态；Jotai 只管理确需跨组件共享的纯客户端状态，不镜像 Query 数据。
- \`src/pagination/\` 的 page/pageSize session 状态、成功空页回退，以及 \`src/api/client/\` 的三个 header、Token、错误和 401 handler 遵循 \`docs/DATA_ACCESS.md\`；真实业务 endpoint 只能按域加入。
- Ky/OpenAPI、GraphQL、SSE 与可选 RxJS 事件流依赖只随真实消费者加入，并复用既有请求安全与状态所有权契约。
- RxJS 只在多来源或复杂时序需求出现时编排瞬时事件，不成为 Query/Jotai 的第二状态仓库、持久事件日志或全局可写 Subject。
- Mantine UI 的 theme、令牌、布局、组件语义、交互状态、响应式与无障碍遵循 \`docs/MANTINE_UI_GUIDELINES.md\`；不散落品牌常量、不建立第二套基础组件系统。
- 用户可见文案进入 i18next，至少保留英文回退和项目声明的实际语言资源。
- 三份公开运行配置与 BaseURL 只通过 \`src/config/environment.ts\` 的 \`APP_CONFIG\` 进入业务代码，遵循 \`docs/RUNTIME_CONFIGURATION.md\`。
- 产品日志只通过 \`src/observability/logger.ts\`，边界覆盖、敏感字段和 Release 裁剪遵循 \`docs/LOGGING.md\`。
- 导出契约、非直观算法与测试场景使用有业务意义的中文注释；直观代码不堆叠复述式注释。
- 文件接近 500 行时复核职责，超过 2,000 行必须拆分；生成文件与人工维护文件要有清晰边界。

## 当前宿主规则

${hostRules}

## 品牌与身份

1. 先更新 \`.harness/project.json\` 或提供新的 Logo 源。
2. 运行 \`pnpm harness brand refresh\`，只生成当前宿主资产。
3. 运行 \`pnpm harness validate\`，不得手工修补派生文件来掩盖事实源漂移。

## 测试与交付

- 行为变化必须有非空测试，至少覆盖核心成功路径和最高风险失败路径。
- 局部可逆任务先运行受影响的最小充分检查。里程碑、Release 候选、跨配置/结构/构建链变化、用户明确要求，或窄检查不足以建立可信度时，运行 \`pnpm harness validate\`、\`pnpm format:check\`、\`pnpm lint\`、\`pnpm typecheck\`、\`pnpm test\` 与 \`pnpm build\`；Release build 自动执行配置与产物泄漏检查。
- Mock 只能隔离外部依赖，不能替代最终构建验收。未运行的浏览器、操作系统或渠道写为 \`Unverified\`。
- 发布、部署、商店上传、凭据、生产数据和不可逆外部副作用必须另行取得明确授权。
`
}

function releaseRules(config: ProjectConfig): string {
  const artifactChecks =
    config.projectType === "web"
      ? "检查 `dist/index.html`、静态资源、Logo/favicon、路由回退与部署配置。"
      : "先由 `pnpm harness validate` 检查 browser target 和运行时依赖自包含，再检查 MV3 manifest、Popup、Options、图标、版本及 permissions/host_permissions；还必须对同一 Release 源码运行 `pnpm package`，确认其自动执行 `pnpm harness validate` 与 `pnpm release:inspect` 并生成受验收 zip。"

  return `# 版本与发布

本文件只定义 **${config.name}** 当前 \`${config.projectType}\` 项目的候选门禁。

## 版本事实

- 根 \`package.json.version\` 是软件版本事实；\`pnpm-lock.yaml\` 固定依赖解析。
- 版本、源码提交、锁文件、构建产物和验证证据必须指向同一候选；构建后的行为或品牌修改会产生新候选。
- 当前唯一发布产物是${artifact(config)}，不得用另一宿主或开发预览替代。

## 候选门禁

1. \`.harness/project.json.projectType\` 必须仍为 \`${config.projectType}\`，仓库保持单包且没有另一宿主入口。
2. 对同一源码实际运行 \`pnpm harness validate\`、\`pnpm lint\`、\`pnpm typecheck\`、非空 \`pnpm test\` 与 \`pnpm build\`。
3. \`pnpm build\` 必须先校验三份受管环境配置，并在构建后自动通过 \`pnpm release:inspect\`；${artifactChecks}
4. Agent Policy 或产品/渠道硬要求选中浏览器验证时，只对上述精确 Release 候选运行；未选中时记录 \`Not run\` 与 \`Unverified\` 范围，不把开发预览或 Mock 冒充候选证据。
5. 记录源码提交、版本、最终文件清单、适用时的 SHA-256、实际环境、已运行检查、未验证范围与已知问题。
6. 必需检查失败、取消、超时或未执行时结论为 \`Not ready\`；不能用历史结果或部分成功替代。

## 外部操作

创建标签、push、部署、上传商店、使用账号或凭据、修改生产配置都需要对应操作的独立明确授权。本地构建成功不等于已经发布或渠道审核通过。
`
}

function runtimeConfiguration(config: ProjectConfig): string {
  const prefix = config.projectType === "web" ? "VITE_" : "PLASMO_PUBLIC_"
  const hostMapping =
    config.projectType === "web"
      ? "Vite mode `development`、`test`、`production`"
      : "Plasmo `--env=.env.development|.env.test|.env.production`"
  return `# 运行配置与环境

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的运行配置事实。三份逻辑环境缺一不可；\`release\` 映射到 \`.env.production\`，不是第四份环境。

| 逻辑环境        | 受管文件             | 构建入口                  | 默认日志级别 |
| --------------- | -------------------- | ------------------------- | ------------ |
| \`development\` | \`.env.development\` | \`pnpm build:development\` | \`debug\`  |
| \`test\`        | \`.env.test\`        | \`pnpm build:test\`        | \`info\`   |
| \`release\`     | \`.env.production\`  | \`pnpm build:release\`      | \`warn\`   |

## 字段与边界

- \`${prefix}APP_ENV\`：必须与文件的逻辑环境一致。
- \`${prefix}API_BASE_URL\`：必填绝对 HTTP(S) URL；不得包含凭据、query 或 fragment，Release 必须为 HTTPS。
- \`${prefix}LOG_LEVEL\`：只接受 \`debug|info|warn|error\`，Release 只接受 \`warn|error\`。
- \`${prefix}REQUEST_TIMEOUT_MS\`：\`1000\`–\`120000\` 的正整数。

浏览器公开前缀中的值会进入产物，绝不保存 Token、Cookie、密码、API key 或服务端秘密。业务代码只读 \`src/config/environment.ts\` 导出的冻结 \`APP_CONFIG\`，不得散落读取宿主环境变量或拼接任意 BaseURL。

语言偏好、分页 session、\`X-Http-Request\` continuation 与 \`X-AUTH-TOKEN\` 都是运行时状态，不进入任何公开环境键；其存储、并发和清理规则见 \`docs/DATA_ACCESS.md\`。

\`.env\`、\`.env.local\` 与三种 \`.env.*.local\` 会造成构建器静默覆盖，项目门禁明确拒绝其存在。选定 profile 只允许当前进程覆盖上述四个已声明键；未知 \`${prefix}*\` 键拒绝。${hostMapping} 是唯一构建映射。

## 命令

- \`pnpm env:validate\`：校验三份文件。
- \`pnpm env:validate --profile development|test|release\`：校验全部文件，并验证选定 profile 的进程覆盖。
- \`pnpm build\`：\`pnpm build:release\` 的别名；构建后自动运行${
    config.projectType === "extension" ? " `pnpm harness validate` 与" : ""
  } \`pnpm release:inspect\`。

Extension 的 BaseURL 不会自动授予 \`host_permissions\`；真实网络消费者仍按 \`docs/DATA_ACCESS.md\` 审批最小权限。
`
}

function loggingRules(config: ProjectConfig): string {
  return `# 日志设计与发布脱敏

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的日志契约。统一入口为 \`src/observability/logger.ts\`；产品代码不直接调用 console，CLI 的必要终端输出除外。

## 结构与覆盖

每条记录包含 ISO 时间、\`debug|info|warn|error\`、稳定小写 \`scope\`/\`event\`、环境和可选有界 context。初始化基线覆盖启动、浏览器全局错误、未处理 Promise、React render boundary 以及 TanStack Query/Mutation 错误；未来新增 route、API、Chrome message、content script 或 service worker 入口时，应在各自执行上下文接入 logger。

默认 sink 只写本地浏览器 console，不持久化、不上传。远端遥测会改变隐私边界，必须另行审批。

## 脱敏与 Release

- 所有环境按键名脱敏 Authorization、Token、Cookie、password、secret 与 API key。
- HTTP client 的 continuation、语言和认证 header 值、request/response body 以及未经校验的服务端消息从不进入日志；\`X-Http-Request\` 不自动作为 requestId 记录。
- HTTP 基线只使用稳定事件 \`http.request_failed\`、\`http.unauthorized\` 与 \`http.unauthorized_handler_failed\`；401 handler 失败只记录最后一项，原请求仍向调用方抛出 \`authentication_required\` 401。
- Release 有效最低级别固定为 \`warn\`，抑制 debug/info，只保留批准字段。
- URL 删除凭据、query 和 fragment；Error 删除 stack/cause；用户绝对路径替换为 \`[LOCAL_PATH]\`。
- body、headers、GraphQL variables、Storage、页面内容、完整标签页 URL 与任意对象快照禁止记录。
- 日志构造、清理、时钟或 sink 失败不得中断业务路径。

\`pnpm build:release\` 和 Extension \`pnpm package\` 在产物生成后自动运行 \`pnpm release:inspect\`。${
    config.projectType === "extension"
      ? "Extension 还会先运行 `pnpm harness validate`，拒绝错误 browser target 或运行时依赖 Parcel self-map。"
      : ""
  }文件名层对所有候选文件拒绝 \`.env*\` 与 \`.map\`；内容扫描只读取 \`.css\`、\`.html\`、\`.js\`、\`.json\`、\`.mjs\`、\`.txt\` 与 \`.xml\`，并拒绝开发/测试 BaseURL、固定哨兵 \`debug_sentinel\`、\`info_sentinel\`、\`application_started\`、\`surface_started\`、\`do-not-ship\`、原始 \`console.debug\`/\`console.info\`、本机绝对路径与 \`sourceMappingURL\`。Extension 检查 \`build/chrome-mv3-prod\`，不会直接解包扫描 zip。该固定规则集不是通用秘密扫描器，也不能代替 logger 单元测试或策略选中的真实 Chrome 候选验证。
`
}

function technicalDebt(config: ProjectConfig): string {
  return `# 技术债与已知限制

本文件记录 **${config.name}** 当前 \`${config.projectType}\` 项目中已观察、已接受且不在活动任务范围内的问题。初始化器不代替产品团队虚构业务技术债。

## 记录规则

- 新条目必须包含可观察事实、用户或工程影响、状态和明确的处理/复核条件。
- 当前任务已授权解决的问题进入活动计划，不先登记后拖延。
- 安全漏洞、凭据泄露或可能造成用户损害的问题不能仅以技术债延期。
`
}

function dataAccess(config: ProjectConfig, canonical: string): string {
  const sectionMarker = "## 1. 选型结论"
  const deliveryMarker = "## 7. 落地与测试门禁"
  const sectionStart = canonical.indexOf(sectionMarker)
  if (sectionStart < 0) throw new Error(`Canonical DATA_ACCESS.md is missing ${sectionMarker}`)
  const canonicalSections = canonical.slice(sectionStart).trim()
  const deliveryStart = canonicalSections.indexOf(deliveryMarker)
  if (deliveryStart < 0) throw new Error(`Canonical DATA_ACCESS.md is missing ${deliveryMarker}`)

  const hostRules =
    config.projectType === "web"
      ? `## 当前 Web 宿主补充

- 每个真实 endpoint 在落地前确认 CORS、credentials、CSP、base URL 与部署环境变量；浏览器环境变量不能保存服务端秘密。
- 页面、路由或 target 改变时关闭旧 SSE 连接，避免隐藏页面和重复挂载产生重复订阅。`
      : `## 当前 Extension 宿主补充

- 每个跨域 REST、GraphQL 或 SSE origin 只在真实功能落地时申请最小 **host_permissions**；本知识文档不授予或预置权限。
- 类型化 endpoint registry 必须与已批准的 manifest origin 一致，并覆盖权限未授予或被撤销的失败路径。
- Popup/Options 关闭时清理连接；MV3 service worker 可能被回收，不能承诺把持久 SSE 长连接托管在 service worker。`

  const derivedSections = `${canonicalSections.slice(0, deliveryStart).trimEnd()}

${hostRules}

${canonicalSections.slice(deliveryStart)}`

  return `# 数据访问与事件流集成技术选型

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的分页、HTTP/认证、数据访问、SSE 与可选 RxJS 工程事实。项目包含无业务 endpoint 的原生 Fetch 与分页基础，不预装 Ky/Axios/RxJS、不生成占位网络/事件总线代码，也不预置 endpoint 或 Extension 权限。

${derivedSections}
`
}

function mantineUiGuidelines(config: ProjectConfig, canonical: string): string {
  const sharedMarker = "## 1. 规范等级与使用方式"
  const webMarker = "## 8. Web 宿主规范"
  const extensionMarker = "## 9. Extension 宿主规范"
  const deliveryMarker = "## 10. 交付检查"
  const sharedStart = canonical.indexOf(sharedMarker)
  const webStart = canonical.indexOf(webMarker)
  const extensionStart = canonical.indexOf(extensionMarker)
  const deliveryStart = canonical.indexOf(deliveryMarker)
  if (
    sharedStart < 0 ||
    webStart <= sharedStart ||
    extensionStart <= webStart ||
    deliveryStart <= extensionStart
  ) {
    throw new Error("Canonical MANTINE_UI_GUIDELINES.md has invalid section markers")
  }

  const shared = canonical.slice(sharedStart, webStart).trim()
  const hostSection =
    config.projectType === "web"
      ? canonical.slice(webStart, extensionStart).trim()
      : canonical
          .slice(extensionStart, deliveryStart)
          .trim()
          .replace(extensionMarker, "## 8. Extension 宿主规范")
  const delivery = canonical
    .slice(deliveryStart)
    .trim()
    .replace(deliveryMarker, "## 9. 交付检查")
    .replace("## 11. 反模式", "## 10. 反模式")
    .replace("## 12. 官方依据", "## 11. 官方依据")

  return `# Mantine UI 设计规范

本文档是 **${config.name}** 当前 \`${config.projectType}\` 单包的 Mantine UI 设计事实。项目身份与品牌色仍以 \`.harness/project.json\` 为唯一来源；工程和测试通则仍以 [\`ENGINEERING_RULES.md\`](ENGINEERING_RULES.md) 为准。

当前项目声明 Mantine \`9.5.1\`，并以根级 \`MantineProvider\`、\`createTheme\` 和 Mantine CSS variables 为实现基线。升级 Mantine 时必须重新核对主题、Styles API 和响应式机制；未安装的 \`@mantine/form\`、\`@mantine/notifications\` 等扩展包不是现有能力。

${shared}

${hostSection}

${delivery}
`
}

function docsReadme(config: ProjectConfig): string {
  return `# 文档索引

本目录只保存 **${config.name}** 当前 \`${config.projectType}\` 项目的长期工程事实。

| 文档                                           | 何时读取                             |
| ---------------------------------------------- | ------------------------------------ |
| [\`AGENT_POLICY.md\`](AGENT_POLICY.md)           | 判断任务路径、持久计划、并行、冒烟与 E2E 偏好 |
| [\`ENGINEERING_RULES.md\`](ENGINEERING_RULES.md) | 修改代码、测试、文档或配置           |
| [\`MANTINE_UI_GUIDELINES.md\`](MANTINE_UI_GUIDELINES.md) | 修改主题、页面、组件、布局、交互状态或 UI 无障碍 |
| [\`DATA_ACCESS.md\`](DATA_ACCESS.md)             | 分页、HTTP/认证、数据访问、SSE 与 RxJS |
| [\`RUNTIME_CONFIGURATION.md\`](RUNTIME_CONFIGURATION.md) | 修改环境或运行配置       |
| [\`LOGGING.md\`](LOGGING.md)                     | 修改日志、错误边界或发布脱敏         |
| [\`RELEASE.md\`](RELEASE.md)                     | 准备版本、候选或发布                 |
| [\`TECH_DEBT.md\`](TECH_DEBT.md)                 | 记录当前范围外的已知限制             |

按任务读取最少事实；终端仓库只维护当前项目类型的产品与工程流程。
`
}

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
