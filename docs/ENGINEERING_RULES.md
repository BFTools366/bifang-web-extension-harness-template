# 工程规则

本文档是 Bifang Web Harness Template 及其下游在文件组织、TypeScript 边界、注释、文档、测试、依赖和规则例外方面的唯一详细事实来源。

## 1. 适用范围与等级

- **硬规则**保护单类型边界、正确性、安全、跨平台开发和交付可信度。违反时必须修复；确需例外时记录原因、风险、适用范围与恢复条件。
- **默认规则**保持一致性和可维护性。有真实、局部且可解释的理由时可以偏离，但不得削弱硬规则。
- Harness 模板、生成器、生成资产、文档与下游代码均适用。工具生成且禁止手工编辑的文件应与人工维护代码明确隔离。

## 2. 单包与单宿主边界

### 2.1 硬规则

- 一个生成仓库必须是一个平铺 pnpm 包，并且 `.harness/project.json.projectType` 恰好为 `web` 或 `extension`。
- 不得创建 pnpm workspace、`apps/`、`packages/`、共享 core、跨宿主组件包或另一宿主入口。两种模板可以采用相同技术族，但各自拥有代码、依赖、状态、测试和发布生命周期。
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
- 根 `index.html` 只承载文档元数据、挂载点与当前项目资源引用；业务内容留在 React 页面。
- 初始化必须同步 `public/logo.png`、`public/favicon.png`、根 `index.html` 和 Landing 页面；不得生成 Extension 的 Popup、Options、manifest 或图标路径。

### 2.3 Extension 单包职责

- Plasmo 负责 Chrome Manifest V3 开发与构建，React + TypeScript 负责 Popup、Options 和真实需要的其他扩展界面。`package.json.targets.default` 必须显式使用 browser context 并启用 `includeNodeModules`，最终浏览器 bundle 不得把 React、Mantine、Query 等运行时包保留为裸依赖映射。
- Mantine 提供 UI；TanStack Query 管理异步数据；Jotai 管理跨组件客户端状态；i18next 管理用户可见文案。Extension 基线不引入 TanStack Router；Popup 与 Options 是独立入口，不模拟 Web 站内路由。
- 初始化生成的分页与原生 Fetch 基础只属于当前执行上下文，不承诺 Popup、Options、content script 或 service worker 共享 sessionStorage、Token、continuation 或 401 single-flight。跨上下文所有者必须使用明确的消息/Storage 架构并进入权限与隐私评审。
- 只有产品真实需要时才新增 background service worker、content script、side panel 或其他入口。入口之间通过类型化消息契约通信，不共享隐式全局状态；RxJS 只能包装单个执行上下文内的消息流，不能替代 `chrome.runtime`/Port 的跨上下文传输。
- 权限遵循最小授权：没有真实消费者就不声明 `permissions`、`host_permissions` 或可访问资源；新增权限必须解释用途并补充失败/拒绝测试。
- 不得通过远程脚本、动态执行或宽泛 CSP 绕过 Manifest V3。外部数据在进入 UI 或持久化前必须校验。
- 初始化必须同步 `assets/icon.png`、`package.json` 中的项目 manifest 信息以及 Popup/Options；Plasmo 从 `assets/icon.png` 生成所需尺寸，不要求维护重复的显式图标声明。
- 不得生成 Vite 根 `index.html`、Web Landing 或 Web favicon 路径作为另一宿主。

## 3. TypeScript 与模块规则

- 启用严格 TypeScript；不得用 `any`、非空断言或未校验类型转换掩盖未知输入。确需边界转换时先验证，再收窄为业务类型。
- 按业务能力和变化原因组织模块。避免 `utils`、`common`、`helpers`、`misc` 等无法表达职责的兜底目录。
- Web 的顶层职责从最小真实集合开始：`app/` 只装配全局 Provider、主题、QueryClient、Router 与真实宿主 adapter；`routes/` 只声明文件路由契约；`features/` 内聚业务 UI、hooks、客户端状态与测试；`i18n/` 保存初始化、语言偏好与资源；`pagination/` 保存统一分页基础；`api/` 承载生成的 client 基础与真实远端边界。页面或 route 文件不得直接拼任意 URL。
- `api/client/` 是两种宿主都生成的原生 Fetch 工程基础：受控 BaseURL、timeout/取消、`X-Http-Request`、`X-Lang`、`X-AUTH-TOKEN`、并发 revision、统一 `ApiError` 与 401 `UnauthorizedHandler` 属于 client；endpoint 契约、外部分页字段映射与边界校验属于真实域模块。初始化不生成业务请求、refresh/replay、登录页、Cookie 策略或第二套 `services/`，也不安装 Ky/Axios；未来 Ky/OpenAPI adapter 必须复用同一安全语义。
- `pagination/` 统一使用从 1 开始的 `page`、受控 `pageSize`、`items` 与非负安全整数 `total`。sessionStorage 只保存按项目 ID、Schema 版本和稳定 scope 隔离的 `{ version: 1, page, pageSize }`；`pageSize` 变化回第一页。只有与当前 page/pageSize 对应、明确 success、非 fetching/loading/placeholder 且 `items` 为空的非第一页结果可以回退第一页；错误、旧响应和暂时空态不得改变页码。
- Query key、缓存、mutation 和失效策略留在消费它的 feature，并包含影响结果的 page/pageSize、target 与语言。服务器列表、`total`、错误和认证状态不得复制进分页 Storage 或 Jotai。
- React 组件负责呈现和交互编排；可复用的纯逻辑放在当前单包内有业务名称的模块或 hook 中。不要为假想复用建立跨包抽象。
- 副作用集中在明确边界：网络、Storage、Chrome API、DOM、计时器和可选 Observable adapter 应可替换、可观察、可取消并具有对称 teardown 与失败处理。语言 localStorage 和分页 sessionStorage 的损坏、拒绝或写入失败必须安全回退；Token 与 continuation 只留在当前执行上下文内存，不得写入环境或任一 Storage。
- 运行时配置集中在 `src/config/`，业务代码只读冻结的 `APP_CONFIG`；组件、route、feature、service 与扩展入口不得直接散落 `import.meta.env`、`process.env` 或硬编码服务 URL。字段、前缀和三环境映射见 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)。
- 应用日志集中在 `src/observability/logger.ts`。产品代码不得直接使用 `console.*`；只允许 logger 默认 sink、测试替身或工具脚本在明确边界使用 console。事件字段、级别、Release allowlist 与脱敏规则见 [`LOGGING.md`](LOGGING.md)。
- Promise 必须被等待、返回或显式处理；用户触发的异步操作需要加载、成功与失败反馈，取消或卸载后不得更新失效 UI。
- 公共类型、组件 props、消息契约和持久化结构要保持向后兼容；破坏性变化进入里程碑路径并提供迁移或明确重建边界。
- 代码标识符使用英文。导出契约、非直观边界或算法、关键失败条件和测试场景使用有业务意义的中文注释，说明目的、约束、错误与副作用；自解释的局部函数不要求逐项注释，也不要逐行翻译代码。
- `TODO`、`FIXME`、`HACK` 必须说明原因和完成/删除条件；当前任务不解决时同步登记 [`TECH_DEBT.md`](TECH_DEBT.md)。

## 4. 文件规模

- 所有人工维护文本文件使用同一两级治理：500 行及以内不因行数触发专项复核；501–2000 行必须复核是否高内聚、单一职责且各部分职责相近；2001 行及以上必须拆分。
- 不得通过压缩可读性、合并无关代码、删除必要注释或建立空壳转发层规避门禁。
- 锁文件、生成物和原样隔离的第三方文件可以排除，但其生成器、模板与维护说明仍受治理。
- 未超过 500 行不证明职责正确；单包边界、状态职责和权限规则仍需独立审查。

## 5. UI、可访问性与国际化

- Mantine UI 的令牌、样式优先级、排版、布局、组件语义、状态、响应式、Web/Extension 差异和交付清单以 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) 为唯一详细事实；本节只保留跨工程硬边界。
- 使用语义化 HTML、可见焦点、键盘可操作控件和可理解的标签；颜色不是唯一状态提示。
- Popup 等紧凑界面也必须保证触控目标、文本缩放和错误反馈可用。Options 页面应适配常见桌面窗口宽度。
- 用户可见文案通过 i18next 翻译键提供；项目名称、描述等身份值从事实源派生，不复制为可独立漂移的翻译常量。
- 日期、数字、语言和时区使用明确 locale；不要把开发机默认值写死为业务事实。
- 分页控件必须是受控且键盘可操作的 Mantine/语义化组件，页码、每页数据量、总量和禁用/加载状态具有可理解的本地化名称；没有真实分页集合时不得为了展示基础能力制造假列表。
- 使用 Mantine theme、语义令牌和受控样式表达视觉规则，不在页面散落重复品牌常量、另建基础组件系统或跨宿主共享 UI 源码。

## 6. 测试与验证

### 6.1 日常测试

- Vitest 是单元/集成测试运行器，Testing Library 从用户可观察行为测试 React UI。
- 代码行为变化至少覆盖核心成功路径和最高风险失败路径；零个相关测试不得记为通过。
- Web 重点覆盖路由、Query 状态、表单/交互、i18n 与错误边界。
- Extension 重点覆盖 Popup/Options、消息契约、Storage、权限拒绝与 Chrome API 错误；Chrome API 可在单元测试中使用受控替身。
- 环境配置变化必须覆盖三份文件缺失/错配、URL/级别/超时边界与宿主前缀；logger 变化必须覆盖级别阈值、嵌套/循环数据、Error、敏感键和 Release 裁剪。
- 分页基础必须覆盖合法恢复、损坏/异常 Storage、版本与 scope 隔离、换页、`pageSize` 重置，以及 current-success-empty 与 loading/error/placeholder/旧响应的状态机分支。HTTP/语言基础必须覆盖三个动态 header、语言 fallback/持久化、continuation/Token 的同源 2xx 提取、异步 Token extractor、乱序 revision、迟到 401、single-flight handler、timeout/取消、受控 URL 和安全日志。
- 使用 RxJS 时覆盖来源校验、错误隔离、共享订阅、取消/清理、重复/乱序事件和 Query/Jotai 状态投影；时间算子优先使用虚拟时间而非真实等待。
- 测试替身只能证明代码边界行为，不能证明最终页面或扩展已在真实浏览器可用。
- 快照只用于稳定且可审阅的结构，不替代语义断言，也不得用大面积更新掩盖行为变化。

### 6.2 构建与里程碑

- 生成项目的完整 package 门禁是 `pnpm env:validate`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `pnpm build`；它用于里程碑、发布候选、跨配置/结构/构建链变化、用户明确要求，或窄检查不足以建立可信度的任务，不要求每个局部或纯文档改动机械全跑。快速/普通标准任务先运行受影响的最小充分检查；凡执行环境校验都必须覆盖 development、test、release 三份配置。只有脚本真实存在并实际成功时才能报告通过。
- `build:release` 与 Extension `package` 在宿主构建后必须自动运行 `pnpm release:inspect`：文件名层拒绝 `.env*`/`.map`，仅在受支持的可读文本扩展中扫描非 Release BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、源码绝对路径与 `sourceMappingURL`。Extension 还必须先运行 `pnpm harness validate`，扫描 production JS 并拒绝运行时依赖的 Parcel self-map；检查对象是 `build/chrome-mv3-prod` 而非直接解包 zip。该固定泄漏门禁不提供通用秘密扫描，真实浏览器捕获到的 console 记录还必须符合 [`LOGGING.md`](LOGGING.md)。
- 里程碑策略选中真实浏览器验证时，Web 使用 Playwright 或可用浏览器能力打开最终构建，验证品牌、关键路由、核心成功路径与风险失败路径。
- 里程碑策略选中真实浏览器验证时，Extension 在真实 Chrome 中加载最终 MV3 构建，验证 manifest、Plasmo 生成图标、Popup、Options、必要权限及真实 Chrome API 行为。
- 未运行的浏览器、操作系统或渠道标记为 `Unverified`。开发服务器、Mock、占位和源码片段不能替代最终候选。

### 6.3 非代码变更

纯文档、元数据或机械变更使用相称的 Markdown 链接、JSON 解析、静态扫描、差异或生成确定性检查，不需要伪造无意义单元测试。

## 7. 文档与单一事实来源

- 文档中的命令、路径、依赖和能力必须来自真实仓库。计划中的能力标记为“计划”，未执行检查写“未执行”。
- 每项事实只有一个权威来源；其他文档只摘要并链接。实现与文档冲突时调查真实行为并在同一任务修正。
- 标题和首段先给结论，再说明原因、边界与验证。内部链接使用相对路径且必须有效。
- 日期采用 `YYYY-MM-DD`，上海时间版本采用 `YYYYMMDDHHMM`。
- 普通缺陷修复、纯重构、格式和测试补强不制造日期流水账。长期决定、硬规则例外、重要交接与发布证据只在真实触发时按需创建。

| 文件                            | 唯一职责                                            |
| ------------------------------- | --------------------------------------------------- |
| `README.md`                     | 用途、初始化方式、目录、命令、维护状态与产品边界    |
| `AGENTS.md`                     | Agent 阅读顺序、任务路径、硬约束、Skills 与约束地图 |
| `Version.md`                    | Harness 当前时间版本与发布状态                      |
| `docs/AGENT_POLICY.md`          | 任务路径、持久计划、并行、冒烟与 E2E 偏好           |
| `docs/ENGINEERING_RULES.md`     | 文件、TypeScript、注释、文档、测试与例外规则        |
| `docs/MANTINE_UI_GUIDELINES.md` | Mantine UI 令牌、布局、组件、状态与无障碍规范       |
| `docs/TS_WEB_TEMPLATE.md`       | 单类型初始化与两种技术基线                          |
| `docs/RUNTIME_CONFIGURATION.md` | 三环境、公开变量、BaseURL 与构建 profile            |
| `docs/LOGGING.md`               | 结构化日志、Release 裁剪、脱敏与产物扫描            |
| `docs/DATA_ACCESS.md`           | 分页、HTTP/认证、数据访问与事件流选择和边界         |
| `docs/RELEASE.md`               | 候选、版本和发布门禁                                |
| `docs/TECH_DEBT.md`             | 当前范围外的已观察问题                              |
| `docs/HARNESS_ENGINEERING.md`   | Harness 方法与生命周期入口                          |

## 8. 依赖与安全

- 只安装当前单包真实使用的依赖。生成的基础 client 使用浏览器原生 Fetch，不安装 Ky/Axios；这些库与 OpenAPI、GraphQL、SSE、RxJS 只随真实消费者加入。首次生成 manifest 后使用普通 `pnpm install` 产出并固定 `pnpm-lock.yaml`；后续 CI、复现和候选检查使用 frozen lockfile。Node.js、pnpm 与受控依赖按声明的稳定 SemVer（`x.y.z`）最低版本验收，更高合法版本允许进入完整门禁；prerelease 或无法解析的声明失败。`packageManager` 仍须是精确 `pnpm@x.y.z` pin 且不得低于 pnpm 最低版本。当前版本、候选版本、提交、lock/hash、Schema/协议版本、`manifest_version` 和 `projectType` 等身份或协议事实继续精确匹配。新增依赖要检查维护状态、许可证、体积、安全公告和目标浏览器兼容性；具体选择遵循 [`DATA_ACCESS.md`](DATA_ACCESS.md)。
- 不在源码、测试、日志或前端构建中写入密钥。浏览器端环境变量默认可被用户观察，不能承载服务端秘密；`X-AUTH-TOKEN`、`X-Http-Request` 及其 fixture 不得进入日志或 Release 产物，Token/continuation 不得写入 localStorage/sessionStorage。
- 外部 URL、HTML、消息、Storage 与网络响应均视为不可信输入；验证并编码后再使用。
- Extension 权限、content script 匹配范围和 Web 可访问资源必须最小化。Web 的第三方脚本、CSP 与跨域配置也需要显式安全评估。
- pnpm 生命周期脚本和第三方生成器属于供应链执行边界；升级时审阅差异并运行完整相关门禁。

## 9. 规则例外

硬规则例外至少记录：被例外的规则、业务理由、影响范围、风险、验证、负责人和恢复/复核条件。例外不能把失败检查改写为通过，也不能授权第二宿主、凭据、发布或不可逆副作用。

发现但不在当前任务范围的问题写入 [`TECH_DEBT.md`](TECH_DEBT.md)，不要顺手扩张范围。完成声明必须列出实际验证、未执行验证和剩余风险。
