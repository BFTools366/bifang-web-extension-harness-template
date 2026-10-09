# 工程规则

本文档是 Bifang Web Harness Template 及其下游在文件组织、TypeScript 边界、注释、文档、测试、依赖和规则例外方面的唯一详细事实来源。

## 1. 适用范围与等级

- **硬规则**保护单类型边界、正确性、安全、跨平台开发和交付可信度。违反时必须修复；确需例外时记录原因、风险、适用范围与恢复条件。
- **默认规则**保持一致性和可维护性。有真实、局部且可解释的理由时可以偏离，但不得削弱硬规则。
- Harness 模板、生成器、生成资产、文档与下游代码均适用。工具生成且禁止手工编辑的文件应与人工维护代码明确隔离。

## 2. 单包与单宿主边界

### 2.1 硬规则

- 一个生成仓库必须是一个平铺 pnpm 包，并且 `.harness/project.json.projectType` 恰好为 `web` 或 `extension`。
- 不得创建多包 pnpm workspace、`apps/`、`packages/`、共享 core、跨宿主组件包或另一宿主入口。`pnpm-workspace.yaml` 仅用于 pnpm 12 的 `allowBuilds` 策略，不得声明 `packages`。两种模板可以采用相同技术族，但各自拥有代码、依赖、状态、测试和发布生命周期。
- Web 与 Extension 之间不存在运行时依赖或源码导入。需要两种宿主时创建两个独立仓库；不要把 `projectType` 改成数组，也不要新增 target add/remove 流程。
- `.harness/project.json` 是名称、标识、描述、唯一类型和品牌信息的权威配置。页面、manifest、标题和图标是派生结果，不得反向成为第二事实源。
- `.harness/brand/logo-1024.png` 是唯一 Logo 母版。派生资产必须能追溯到该母版，并且只生成当前类型需要的文件。
- 初始化参数、文件写入与品牌同步必须具备确定性：相同输入在相同模板版本上生成相同身份和品牌内容；重复执行不得制造重复入口或漂移配置。

### 2.2 Web 单包职责

- Vite 负责开发与构建，React + TypeScript 负责页面。
- Mantine 提供主题与 UI 组件；TanStack Router 使用 `src/routes/` 文件路由管理 URL 与页面，Vite Router plugin 负责生成路由树和 route 级自动拆包；TanStack Query 管理远端/异步服务器状态；Jotai 只管理确实需要跨组件共享的客户端状态；i18next 管理用户可见文案。
- `src/routeTree.gen.ts` 是 Git、格式化器和 lint 忽略的临时生成文件，只能由 `pnpm routes:generate`、开发或构建流程再生，禁止手工编辑或固化进模板。没有实际 bundle 证据时不预设 `manualChunks`。
- 路由加载、页面数据和错误状态应有清晰职责。不要把服务器缓存复制进 Jotai，也不要为局部输入状态建立全局 atom。真实多来源事件需要时可按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 引入 RxJS，但事件流不成为第二状态仓库。
- 初始化生成 `src/pagination/`、`src/api/client/` 与语言偏好基础，但不把分页控件或网络请求强塞进静态 Landing/404。真实集合页复用统一 page/pageSize 状态，真实登录路由存在后才装配 401 导航 adapter。
- Web 的列表页、数据表格、后台列表与搜索结果同时调用 `$web-implement-list-view`，但根据真实信息结构选择 Table、卡片或搜索形态，不强制 Table、选择、列偏好或 DnD。初始化不生成业务列表、假 endpoint 或可选列表依赖。
- 根 `index.html` 只承载文档元数据、挂载点与当前项目资源引用；业务内容留在 React 页面。
- 初始化必须同步 `public/logo.png`、`public/favicon.png`、根 `index.html` 和 Landing 页面；不得生成 Extension 的 Popup、Options、manifest 或图标路径。

### 2.3 Extension 单包职责

- Plasmo 负责同一 Extension 单包的 Chrome MV3 与 Firefox MV2 开发与构建，React + TypeScript 负责 Popup、Options 和真实需要的其他扩展界面。`package.json.targets.default` 必须显式使用 browser context 并启用 `includeNodeModules`，最终浏览器 bundle 不得把 React、Mantine、Query 等运行时包保留为裸依赖映射。
- Mantine 提供 UI；TanStack Router 在 Popup 与 Options 独立入口内管理页内导航，分别使用 memory 与 hash history，并以代码声明路由；TanStack Query 管理异步数据；Jotai 管理跨组件客户端状态；i18next 管理用户可见文案。Extension 不继承 Web 的文件路由生成器。
- `$web-implement-list-view` 只适用 React Web，Extension Popup/Options 不为复用它安装图标或 DnD 依赖，也不继承 Web 列表路由状态契约；扩展中的重复项 UI 仍按当前 surface 和执行上下文实现。
- 初始化生成的分页与 Ky HTTP 基础只属于当前执行上下文，不承诺 Popup、Options、content script 或 service worker 共享 sessionStorage、Token、continuation 或 401 single-flight。跨上下文所有者必须使用明确的消息/Storage 架构并进入权限与隐私评审。
- 只有产品真实需要时才新增 background（Chrome service worker / Firefox scripts/page）、content script、side panel 或其他入口。入口之间通过类型化消息契约通信，不共享隐式全局状态；RxJS 只能包装单个执行上下文内的消息流，不能替代浏览器 runtime/Port 的跨上下文传输。
- 权限遵循最小授权：没有真实消费者就不声明 `permissions`、`host_permissions` 或可访问资源；新增权限必须解释用途并补充失败/拒绝测试。
- 不得通过远程脚本、动态执行或宽泛 CSP 绕过 Manifest V3。外部数据在进入 UI 或持久化前必须校验。
- 初始化必须同步 `assets/icon.png`、`package.json` 中的项目 manifest 信息以及 Popup/Options；Plasmo 从 `assets/icon.png` 生成所需尺寸，不要求维护重复的显式图标声明。
- 不得生成 Vite 根 `index.html`、Web Landing 或 Web favicon 路径作为另一宿主。

- 后续 Extension 开发由执行 Agent 自行保证 Chrome MV3 与 Firefox MV2 兼容：核对 API、异步消息、权限、后台、CSP/资源和 URL 差异，按真实功能使用能力检测、类型化 adapter 或 Plasmo 目标入口。具体合同见 [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md) §5；不得将单目标构建/运行结果推断为双目标通过。
- 最终 manifest 由 Plasmo 动态派生，共享 override 不固定 `manifest_version`。默认构建/打包必须完成两目标及聚合检查，不能静默跳过 Firefox；浏览器证据仍由独立候选事件触发。

## 3. TypeScript 与模块规则

- 启用严格 TypeScript；不得用 `any`、非空断言或未校验类型转换掩盖未知输入。确需边界转换时先验证，再收窄为业务类型。
- 按业务能力和变化原因组织模块。避免 `utils`、`common`、`helpers`、`misc` 等无法表达职责的兜底目录。
- Web 的顶层职责从最小真实集合开始：`app/` 只装配全局 Provider、主题、QueryClient、Router 与真实宿主 adapter；`routes/` 只声明文件路由契约；`features/` 内聚业务 UI、hooks、客户端状态与测试；`i18n/` 保存初始化、语言偏好与资源；`pagination/` 保存统一分页基础；`api/` 承载生成的 client 基础与类型化服务数据边界。页面或 route 文件不得直接拼任意 URL。
- 两种宿主未配置对应 BaseURL 时，服务数据统一在 `src/api/<domain>/` 以完整 Mock API 提供；用户要求真实联网后收集缺失配置，再替换对应实现，流程以 [`DATA_ACCESS.md`](DATA_ACCESS.md) §3.1 为准。组件、route、hook 和 Query 不内嵌业务 Mock，真实请求失败不回落 Mock；中性初始化不生成业务数据。
- `api/client/` 是两种宿主都生成的 Ky HTTP 工程基础：受控 BaseURL、timeout/取消、`X-Http-Request`、`X-Lang`、`X-AUTH-TOKEN`、并发 revision、统一请求/响应/错误拦截、`ApiError`、显式 `setAuthToken` 与 401 `UnauthorizedHandler`、403 权限边界 属于 client；惰性 `applicationHttp` 与 `requestHttpQuery` 复用同一会话，Query 只在最终失败反馈；endpoint 契约、外部分页字段映射与边界校验属于真实域模块。初始化不生成业务请求、refresh/replay、登录页、Cookie 策略或第二套 `services/`，默认声明 Ky 运行时依赖并关闭其重试、超时与 HTTP 抛错，由 client 统一处理；未来 OpenAPI adapter 必须复用同一安全语义。
- `pagination/` 统一使用从 1 开始的 `page`、受控 `pageSize`、`items` 与非负安全整数 `total`。通用 session 模式只保存按项目 ID、Schema 版本和稳定 scope 隔离的 `{ version: 1, page, pageSize }`；`pageSize` 变化回第一页。只有与当前 page/pageSize 对应、明确 success、非 fetching/loading/placeholder 且 `items` 为空的非第一页结果可以回退第一页；错误、旧响应和暂时空态不得改变页码。Web 路由列表仍复用同一 1-based/pageSize 基础，但按 [`DATA_ACCESS.md`](DATA_ACCESS.md) §2.5 由 Router 拥有运行时状态，sessionStorage 只在无 owned key 时读取一次启动快照。
- Query key、缓存、mutation 和失效策略留在消费它的 feature，并包含影响结果的 page/pageSize、target 与语言。服务器列表、`total`、原始错误和认证状态不得复制进分页 Storage 或 Jotai；HTTP 反馈 atom 只允许固定本地化键、分类与恢复能力的客户端投影。
- React 组件负责呈现和交互编排；可复用的纯逻辑放在当前单包内有业务名称的模块或 hook 中。不要为假想复用建立跨包抽象。
- 副作用集中在明确边界：网络、Storage、浏览器 API、DOM、计时器和可选 Observable adapter 应可替换、可观察、可取消并具有对称 teardown 与失败处理。语言 localStorage 和分页 sessionStorage 的损坏、拒绝或写入失败必须安全回退；Token 与 continuation 只留在当前执行上下文内存，不得写入环境或任一 Storage。
- 运行时配置集中在 `src/config/`，业务代码只读冻结的 `APP_CONFIG`；组件、route、feature、service 与扩展入口不得直接散落 `import.meta.env`、`process.env` 或硬编码服务 URL。字段、前缀和三环境映射见 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)。
- 应用日志集中在 `src/observability/logger.ts`。产品代码不得直接使用 `console.*`；只允许 logger 默认 sink、测试替身或工具脚本在明确边界使用 console。事件字段、级别、Release allowlist 与脱敏规则见 [`LOGGING.md`](LOGGING.md)。
- Promise 必须被等待、返回或显式处理；用户触发的异步操作需要加载、成功与失败反馈，取消或卸载后不得更新失效 UI。
- 公共类型、组件 props、消息契约和持久化结构要保持向后兼容；破坏性变化必须先取得显式批准，提供迁移或明确重建边界，并执行适用的安全与候选门禁。
- 代码标识符使用英文。注释应说明声明职责、约束、错误或副作用，不逐行翻译代码；以下机械门禁只证明注释邻接且含汉字，语义是否准确仍由评审负责。
- `TODO`、`FIXME`、`HACK` 必须说明原因和完成/删除条件；当前任务不解决时同步登记 [`TECH_DEBT.md`](TECH_DEBT.md)。

### 3.1 中文声明注释硬门禁

- 门禁覆盖 Harness、生成器模板及终端下游中所有由 Harness 维护或生成的 `.ts`、`.tsx` 文件；`.d.ts` 也因 `.ts` 后缀受管。每个受管声明都必须有一条直接关联、至少包含一个汉字的行注释、块注释或 JSDoc。
- 机械范围只包括 interface、type alias、enum、class、具名函数、方法/访问器/constructor、直接或后置命名/默认导出的箭头函数组件与 hook，以及测试文件或显式 `vitest` 导入中的 `test`/`it` 测试场景。
- 显而易见的字段、局部变量、循环绑定和普通匿名或极短内联 callback 不逐项检查，由所属结构或函数的中文注释统一覆盖；非直观字段、单位、来源、安全约束和副作用仍必须在最接近的职责边界说明。
- “紧邻”只接受声明正上方没有空行或其他 token 隔开的注释，或语法允许位置中直接置于声明前的块注释/JSDoc。与声明不邻接的文件头注释、隔空注释、纯英文注释、字符串中的中文、前一声明的行尾注释或关联到其他节点的注释均不能代替当前声明。
- 排除范围只包括精确文件 `src/routeTree.gen.ts`，以及路径任一目录段为 `.plasmo`、`build`、`dist`、`coverage`、`node_modules` 或 `.git` 的内容。不得用 `*.gen.ts`、`*.generated.ts`、名称包含 `gen` 或笼统“生成目录”等 blanket 规则扩大排除；例如 `src/nested/routeTree.gen.ts`、`src/feature.gen.ts` 与 `src/plasmo.d.ts` 仍受门禁。
- 根 Harness 与两类下游的 `pnpm lint` 都必须在 ESLint 后运行该 AST 门禁；`comments:check` 可用于直接诊断，但不能替代 `lint`。Harness validator 与下游 `pnpm harness validate` 必须锁定策略模块、脚本接线、精确排除和当前源码通过状态，删除注释或绕过接线都应失败。

## 4. 文件规模

- 根 `AGENTS.md` 是所有 Agent 首先读取的轻量入口，必须是合法 UTF-8、最多 20000 bytes 且最多 120 个物理行。它只保留启动门禁、按任务渐进读取、始终生效边界、Skills/约束地图和最小闭环；初始化、三环境、构建、发布与完整验收的实现级配方只存在于本文件及对应唯一事实源和 Skills，不得复制回根入口独立演化。`pnpm validate:harness` 同时锁定预算、章节顺序、关键渐进语义和代表性重复配方负例。
- 源 Harness 与新生成终端项目的人工维护代码（含 TypeScript/TSX、JavaScript、样式与 HTML）使用 500/600 两级治理：500 行及以内不因行数触发专项复核；501–600 行必须复核业务高内聚、单一职责和职责相近性并记录保留理由；601 行起必须按业务职责拆分到原功能或工具模块目录。
- 终端项目的 `pnpm lint` 必须运行 `.harness/tooling/source-size-policy.ts`：501–600 行输出复核提示，601 行起失败。只精确排除 `src/routeTree.gen.ts`，以及目录段为 `.git`、`.plasmo`、`build`、`coverage`、`dist`、`generated` 或 `node_modules` 的生成/外部内容；`src/feature.gen.ts` 等普通维护源码不能因命名被隐藏。
- 源 Harness 的人工维护代码同样使用 500/600 边界，601 行起失败；其他受管人工文本保留 500/2000 边界：501–2000 行人工复核，超过 2000 行由 `pnpm validate:harness` 拒绝。验证器、初始化测试和 HTTP 模板按职责拆分在 `scripts/harness-validation/`、多个 `tests/harness-*.test.ts` 与 `.harness/tooling/templates/http-*.ts`；后续修改仍必须复核内聚性，不能新增无界大文件或用空壳转发规避门禁。
- 不得通过压缩可读性、合并无关代码、删除必要注释或建立空壳转发层规避门禁。
- 锁文件、生成物和原样隔离的第三方文件可以排除，但其生成器、模板与维护说明仍受治理。
- 未超过 500 行不证明职责正确；单包边界、状态职责和权限规则仍需独立审查。

## 5. UI、可访问性与国际化

- Mantine UI 的令牌、样式优先级、排版、布局、组件语义、状态、响应式、Web/Extension 差异和交付清单以 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) 为唯一详细事实；本节只保留跨工程硬边界。
- 使用语义化 HTML、可见焦点、键盘可操作控件和可理解的标签；颜色不是唯一状态提示。
- Popup 等紧凑界面也必须保证触控目标、文本缩放和错误反馈可用。Options 页面应适配常见桌面窗口宽度。
- 用户可见文案通过 i18next 翻译键提供；项目名称、描述及其 `identityI18n` 翻译从 `.harness/project.json` 派生为 UI 的 `projectName` / `projectDescription` 与 Extension 浏览器消息，不复制为可独立漂移的翻译常量。
- 日期、数字、语言和时区使用明确 locale；不要把开发机默认值写死为业务事实。
- 分页控件必须是受控且键盘可操作的 Mantine/语义化组件，页码、每页数据量、总量和禁用/加载状态具有可理解的本地化名称；没有真实分页集合时不得为了展示基础能力制造假列表。
- React Web 重复记录视图按 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) §5.4 与 `$web-implement-list-view` 选择形态、状态反馈和无障碍路径；Extension 不调用该 Skill。
- 使用 Mantine theme、语义令牌和受控样式表达视觉规则，不在页面散落重复品牌常量、另建基础组件系统或跨宿主共享 UI 源码。

## 6. 测试与验证

### 6.1 日常测试

- Vitest 是单元/集成测试运行器，Testing Library 从用户可观察行为测试 React UI。
- 代码行为变化至少覆盖核心成功路径和最高风险失败路径；零个相关测试不得记为通过，该判定依赖 `vitest related` 的退出码，Harness 不另设校验；失败路径是否真的被覆盖是评审时的人工判断，评审者需实际读测试内容而非只看测试计数。
- Web 重点覆盖路由、Query 状态、表单/交互、i18n 与错误边界。
- Extension 重点覆盖 Popup/Options、消息契约、Storage、权限拒绝与浏览器 API 错误；单元测试分别模拟 Chrome MV3 和 Firefox MV2 的真实差异、成功及最高风险失败/不支持路径，不能用同一个 Chrome mock 声称双浏览器兼容。
- 环境配置变化必须覆盖三份文件缺失/错配、URL/级别/超时边界与宿主前缀；logger 变化必须覆盖级别阈值、嵌套/循环数据、Error、敏感键和 Release 裁剪。
- 分页基础必须覆盖合法恢复、损坏/异常 Storage、版本与 scope 隔离、换页、`pageSize` 重置，以及 current-success-empty 与 loading/error/placeholder/旧响应的状态机分支。HTTP/语言基础必须覆盖三个动态 header、语言 fallback/持久化、continuation/Token 的同源 2xx 提取、异步 Token extractor、乱序 revision、迟到 401、single-flight handler、timeout/取消、受控 URL 和安全日志。
- Web 列表实现或修改还必须运行适配后的纯函数契约，并以 Vitest/Testing Library 覆盖 URL 启动恢复、Query 所有权、placeholder 只读、成功越界纠页、四态与已触发的选择/列偏好条件契约；按 Skill checklist 为不适用项记录有证据的 N/A。
- 使用 RxJS 时覆盖来源校验、错误隔离、共享订阅、取消/清理、重复/乱序事件和 Query/Jotai 状态投影；时间算子优先使用虚拟时间而非真实等待。
- 测试替身只能证明代码边界行为，不能证明最终页面或扩展已在真实浏览器可用。
- 快照只用于稳定且可审阅的结构，不替代语义断言，也不得用大面积更新掩盖行为变化。

### 6.2 构建与完整候选验收

- 生成项目日常开发只运行本次变化需要的相关非空测试或最小替代检查，通常使用 `pnpm test:related <changed-source...>`；依赖图没有发现测试时必须回退到所属非空测试文件或说明相称替代验证，不得自动追加格式、lint、类型、全仓检查或构建。行为保持重构运行全量 `pnpm test`；纯文档、元数据或机械变化只做解析或差异完整性所需的最小检查。
- `pnpm instantiate` 只负责在 sibling staging 内安全生成、定向格式化本次输出、直接执行结构/三环境/终端化校验、安装一次依赖和建立 Git 根；初始化成功不运行或宣称 `pnpm build`、全量测试、`release:inspect` 或 E2E 通过。用户明确要求完整验收或当前变更触发候选硬门禁时，才在两个真实下游创建成功后另行显式构建精确 Release 候选。
- `pnpm build` 是生成项目唯一最终产物入口并固定委托 `build:release`。同一发布流程复用已明确的 E2E `enabled|disabled` 选择并显式传参；仅在尚无选择时询问，交互式 CLI 省略参数时提供终端选择。它自动运行三环境/活动 Release profile、`pnpm harness validate`、格式、包含 §3.1 与 §4 门禁的 lint、类型、非空全量测试；Web 按上海时区生成 `YYMMDDHHMMSS` 页面版本，Extension 从 `package.json.version` 读取稳定 SemVer（`X.Y.Z`）并注入页面，再完成宿主生产构建和 `pnpm release:inspect`。不得在外层重复执行同一批全量门禁，也不得提供 development/test 产物构建脚本。Extension `pnpm package` 对同一 Release profile 执行相同门禁后生成 zip，不自动递增版本。
- `build:release` 与 Extension `package` 在宿主构建后必须自动运行 `pnpm release:inspect`：除文件名、BaseURL、日志、路径与 source map 门禁外，还必须确认当前宿主的页面版本存在于候选；Extension 另须确认两个目标动态生成的 manifest 与 `package.json.version` 精确一致。Extension 还必须先运行 `pnpm harness validate`，扫描 production JS 并拒绝运行时依赖的 Parcel self-map；检查对象是 `build/chrome-mv3-prod` 和 `build/firefox-mv2-prod` 而非直接解包 zip。该固定泄漏门禁不提供通用秘密扫描，真实浏览器捕获到的 console 记录还必须符合 [`LOGGING.md`](LOGGING.md)。
- 构建命令、时间版本、E2E 选择和构建门禁结果的报告与持久记录边界见 §7。
- 当次 E2E、完整验收解析出的 smoke 或用户、产品、安全、渠道硬要求任一为 `required` 时，Web 使用对应范围的 Playwright 或可用浏览器能力打开最终构建，验证品牌、构建版本、关键路由、核心成功路径与风险失败路径。
- 当次 E2E、完整验收解析出的 smoke 或用户、产品、安全、渠道硬要求任一为 `required` 时，Extension 分别在隔离真实 Chrome/Firefox 中加载最终 MV3/MV2 构建，按批准范围验证 manifest、Plasmo 生成图标、构建版本、Popup、Options、必要权限及各浏览器真实 API 行为。
- 未运行的浏览器、操作系统或渠道标记为 `Unverified`。开发服务器、Mock、占位和源码片段不能替代最终候选。

### 6.3 非代码变更

纯文档、元数据或机械变更使用相称的 Markdown 链接、JSON 解析、静态扫描、差异或生成确定性检查，不需要伪造无意义单元测试。

## 7. 文档与单一事实来源

- 文档中的命令、路径、依赖和能力必须来自真实仓库。计划中的能力标记为“计划”，未执行检查写“未执行”。
- 活动 Work Plan 的每个 Todo 必须使用稳定 ID 和 `pending|in_progress|blocked|done` 显式状态；存在任一非 `done` Todo 时，不得写入 `accepted`、`ready`、`passed`、已验收、已就绪、可发布或等价候选验收/发布就绪结论。完成条件可以描述未来门禁，但不能冒充已经发生的候选事实；`pnpm validate:harness` 只拒绝形如 `候选状态：已验收`、`发布就绪：ready`、`Candidate status: accepted` 的行首结论，其他措辞靠评审。
- 每项事实只有一个权威来源；其他文档只摘要并链接。实现与文档冲突时调查真实行为并在同一任务修正。
- 下游需求澄清、PRD、原型选择的详细合同以项目级 `$web-define-product` 与 `$web-design-prototype` 为准：Product Spec 是唯一 PRD，`docs/prototypes/` 只保存评审产物与版本选择证据。初始化只分发能力，不执行业务流程；新产品/页面及显著交互改版选定原型后才开发，日常小修复不强制重走。
- 标题和首段先给结论，再说明原因、边界与验证。内部链接使用相对路径且必须有效。
- 日期采用 `YYYY-MM-DD`；Harness 源版本采用上海时间 `YYYYMMDDHHMM`，Web 候选页面版本采用上海时间 `YYMMDDHHMMSS`，Extension 候选使用 `package.json.version` 的稳定 SemVer。
- 普通缺陷修复、纯重构、格式和测试补强不制造日期流水账。长期决定、硬规则例外、重要交接与发布证据只在真实触发时按需创建；构建命令、构建时间版本、E2E/冒烟选择及其测试或扫描结果只进入命令输出与当次任务交付说明，不因执行或验收构建创建或更新 Work Plan、ADR、Status、Changelog、Verification 等持久记录。

| 文件                            | 唯一职责                                                |
| ------------------------------- | ------------------------------------------------------- |
| `README.md`                     | 用途、初始化方式、目录、命令、维护状态与产品边界        |
| `AGENTS.md`                     | Agent 渐进读取、事件路由、硬约束、Skills 与约束地图     |
| `Version.md`                    | Harness 当前时间版本与发布状态                          |
| `docs/AGENT_POLICY.md`          | 能力偏好、用户可见 Task 开关/标题、并行与候选浏览器偏好 |
| `docs/ENGINEERING_RULES.md`     | 文件、TypeScript、注释、文档、测试与例外规则            |
| `docs/MANTINE_UI_GUIDELINES.md` | Mantine UI 令牌、布局、组件、状态与无障碍规范           |
| `docs/TS_WEB_TEMPLATE.md`       | 单类型初始化与两种技术基线                              |
| `docs/RUNTIME_CONFIGURATION.md` | 三环境、公开变量、BaseURL 与构建 profile                |
| `docs/LOGGING.md`               | 结构化日志、Release 裁剪、脱敏与产物扫描                |
| `docs/DATA_ACCESS.md`           | 分页、HTTP/认证、数据访问与事件流选择和边界             |
| `docs/RELEASE.md`               | 候选、版本和发布门禁                                    |
| `docs/TECH_DEBT.md`             | 当前范围外的已观察问题                                  |
| `docs/HARNESS_ENGINEERING.md`   | Harness 方法与生命周期入口                              |

## 8. 依赖与安全

- Harness 自有工具与 Skill helper 统一使用项目本地 Node.js/TypeScript 和标准库；不引入 Python 解释器、Python 文件或执行入口。已有声明依赖按当前工程规则使用，新增第三方运行时依赖仍需说明必要性并按授权规则处理。`pnpm validate:harness` 拒绝自有 Python 文件、shebang、指向 Python 的 package 脚本/bin，以及可静态识别的启动 Python 解释器的 child_process 调用，其他子进程不在该门禁范围；第三方依赖与原样隔离的 vendor 不重写。

- 只安装当前单包真实使用的依赖。生成的基础 client 使用 Ky 的浏览器 Fetch 传输并声明运行时依赖；Axios、OpenAPI、GraphQL、SSE、RxJS 只随真实消费者加入。Web 列表能力本身不预装图标或 DnD 包；只有当前列表真实使用对应 UI 或拖拽时才按授权与依赖评审加入。首次生成 manifest 后使用一次 `pnpm install --no-frozen-lockfile --prefer-offline` 产出并固定 `pnpm-lock.yaml`；后续 CI、复现和候选检查使用 frozen lockfile。Node.js、pnpm 与受控依赖按声明的稳定 SemVer（`x.y.z`）最低版本验收，更高合法版本允许进入完整门禁；prerelease 或无法解析的声明失败。首次初始化只检查一次 Node.js/pnpm，普通开发和构建不做环境预探测，真实命令报出疑似环境错误后才诊断相关组件；安装或升级工具仍需授权。`packageManager` 仍须是精确 `pnpm@x.y.z` pin 且不得低于 pnpm 最低版本。当前版本、候选版本、提交、lock/hash、Schema/协议版本、`manifest_version` 和 `projectType` 等身份或协议事实继续精确匹配。新增依赖要检查维护状态、许可证、体积、安全公告和目标浏览器兼容性；具体选择遵循 [`DATA_ACCESS.md`](DATA_ACCESS.md)。
- pnpm 12 的依赖构建许可保存在根 `pnpm-workspace.yaml` 的 `allowBuilds` 中；该文件不得声明 `packages`。不再使用 `package.json` 的 `pnpm.onlyBuiltDependencies`。TypeScript 暂固定在 6.0.3：受管 AST 工具依赖其 JavaScript API，且当前 `typescript-eslint` 的 TypeScript peer 范围不支持 7.x；升级前须先解决这两处兼容性。
- 不在源码、测试、日志或前端构建中写入密钥。浏览器端环境变量默认可被用户观察，不能承载服务端秘密；`X-AUTH-TOKEN`、`X-Http-Request` 及其 fixture 不得进入日志或 Release 产物，Token/continuation 不得写入 localStorage/sessionStorage。
- 外部 URL、HTML、消息、Storage 与网络响应均视为不可信输入；验证并编码后再使用。
- Extension 权限、content script 匹配范围和 Web 可访问资源必须最小化。Web 的第三方脚本、CSP 与跨域配置也需要显式安全评估。
- pnpm 生命周期脚本和第三方生成器属于供应链执行边界；升级时审阅差异并运行完整相关门禁。

## 9. 规则例外

硬规则例外至少记录：被例外的规则、业务理由、影响范围、风险、验证、负责人和恢复/复核条件。例外不能把失败检查改写为通过，也不能授权第二宿主、凭据、发布或不可逆副作用。

发现但不在当前任务范围的问题写入 [`TECH_DEBT.md`](TECH_DEBT.md)，不要顺手扩张范围。完成声明必须列出实际验证、未执行验证和剩余风险。
