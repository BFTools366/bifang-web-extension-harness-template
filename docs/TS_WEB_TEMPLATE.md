# TypeScript Web / Chrome Extension 单包模板

本文档定义 Bifang Web Harness Template 的初始化契约和固定技术基线。结论是：一次初始化只选择 `web` 或 `extension`，生成一个独立、平铺、可直接开发和发布的 pnpm 单包。

## 1. 不变量

- 唯一公开创建入口是源 Harness 根的 `pnpm instantiate -- <absolute-target-outside-harness> ...`；目标必须位于源 Harness 之外。
- 源 Harness 不提供 `pnpm harness:init` script；`pnpm harness init` 明确拒绝原地初始化。底层 initializer 只作为 `instantiate` 在目标同级 sibling staging 中调用的内部步骤。
- 非交互 CLI 必须传入 `--type web` 或 `--type extension`；交互式 TTY 必须提示用户选择且不得提供默认类型。
- 生成项目的 `.harness/project.json.projectType` 恰好是 `web` 或 `extension`，不是数组。
- 不支持 `both`，不提供默认类型，也不提供下游 target add/remove。
- Web 与 Extension 是两个独立模板；它们不在同一仓库共存，不共享源码、状态、测试、品牌派生或构建产物。
- 输出是单个 pnpm package，不存在 `pnpm-workspace.yaml`、`apps/`、`packages/` 或 workspace 内部依赖。
- 已生成项目不原地切换类型。需要另一宿主时，在另一个目录初始化新的独立仓库。
- 初始化同时建立 development、test、release 三个逻辑环境；逻辑 `release` 固定映射到 `.env.production`，不生成 `.env.release`。

## 2. 创建与内部初始化契约

从源 Harness 根创建独立 Web 目录：

```bash
pnpm instantiate -- /absolute/path/example-web --type web --name "示例 Web" --id example-web \
  --description "示例 React Web 页面" \
  --development-base-url "http://localhost:3000" \
  --test-base-url "https://test-api.example.com" \
  --release-base-url "https://api.example.com"
```

从同一个源 Harness 根创建独立 Extension 目录：

```bash
pnpm instantiate -- /absolute/path/example-extension --type extension \
  --name "示例扩展" --id example-extension \
  --description "示例 Chrome 扩展" \
  --development-base-url "http://localhost:3000" \
  --test-base-url "https://test-api.example.com" \
  --release-base-url "https://api.example.com"
```

目标必须位于源 Harness 目录之外、不存在或为空，并且 basename 与 `--id` 完全相同。不要先复制模板并在副本内初始化，也不要直接调用底层 initializer。

可选品牌输入：

```bash
pnpm instantiate -- /absolute/path/example-web --type web \
  --name "示例 Web" --id example-web \
  --description "示例页面" \
  --development-base-url "http://localhost:3000" \
  --test-base-url "https://test-api.example.com" \
  --release-base-url "https://api.example.com" \
  --logo /absolute/path/logo.png --brand-color "#3B82F6"
```

- `--name` 是用户可见名称。
- `--id` 是包名和确定性品牌生成使用的稳定标识，必须是小写 kebab-case，并通过生成器的跨平台安全校验。
- `--description` 是页面元数据或 Extension manifest/界面的简短说明。
- `--development-base-url`、`--test-base-url` 与 `--release-base-url` 是三个环境的 API BaseURL；非交互调用全部必填，交互调用逐项询问且不得猜测默认值。三者必须是无凭据、query 或 fragment 的绝对 HTTP(S) URL，Release 只接受 HTTPS。
- `--logo` 指向用户授权读取的本地图像；缺省时根据项目身份和品牌色确定性生成。
- `--brand-color` 使用 `#RRGGBB`；缺省时使用生成器声明的稳定默认色（当前为 `#4C6EF5`），Logo 几何形状仍按名称与标识稳定变化。

参数的精确必填性、错误格式与帮助文本以 `pnpm instantiate` 的真实实现为准。未知参数、非法类型、非法 BaseURL、不可读 Logo、无效颜色、非空目标冲突、源内目标或路径越界属于预检失败，必须在生成项目文件前终止并保持目标零写入。`pnpm instantiate` 在目标同级 sibling staging 完成复制，通过内部 initializer 生成项目，再完成安装和验证；成功后才原子发布目标，失败时原先不存在的目标仍不存在，预存空目录仍为空。内部 initializer 还会拒绝源 Harness 根及其任意子路径；`pnpm harness init` 稳定拒绝，`pnpm harness:init` 不存在。完整环境契约见 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)。

生成器在当前类型 manifest 写入后执行普通 `pnpm install`，首次解析并固定 `pnpm-lock.yaml`。`--skip-install` 仅供受控测试或自动化延后安装；后续 CI、复现和发布候选使用 frozen lockfile，并在 manifest 与 lockfile 不一致时失败。

## 3. 项目身份与品牌事实

### 3.1 单一事实源

`.harness/project.json` 保存项目名称、标识、描述、`projectType` 和品牌元数据。任何生成器、Skill 或维护脚本都应先读取并校验该文件；页面、manifest 与图标只消费它，不自行演化项目身份。

`projectType` 具有以下语义：

| 值          | 允许的宿主文件                                                  | 禁止出现的另一宿主                                |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `web`       | Vite、根 `index.html`、Web 页面与 `public/` 品牌资产            | Plasmo manifest、Popup、Options、Extension icon   |
| `extension` | Plasmo/Chrome MV3 manifest、Popup、Options 与 `assets/icon.png` | Vite Web Landing、Web favicon 与独立 Web 站内路由 |

手工编辑 `.harness/project.json` 可能造成派生内容漂移。身份或品牌变更应通过受管流程完成，并在同一事务中更新母版、当前宿主派生文件和验证结果。

### 3.2 Logo 母版

`.harness/brand/logo-1024.png` 是 1024×1024 的规范母版：

- 上传模式：读取用户提供图像，校验格式与尺寸，按规范缩放/留白并输出 PNG 母版；不得覆盖用户原文件。
- 生成模式：以稳定项目标识、名称和品牌色为输入，确定性生成母版；同一输入和模板版本必须得到相同字节或等价的稳定像素结果。
- 所有派生资产从母版生成。派生失败必须使初始化报错，现有文件不能被宣称为完成项目。
- 母版与项目事实需要一并纳入版本控制；临时源文件和绝对上传路径不应成为运行时依赖。

### 3.3 Web 品牌同步

Web 初始化必须同步：

- `public/logo.png`：页面使用的 Logo；
- `public/favicon.png`：浏览器标签图标；
- 根 `index.html`：title、description、favicon 引用与挂载点；
- Landing 页面：Logo、项目名称、描述与当前主题色。

这些文件不得包含 Extension 项目名、Popup/Options 文案或 Chrome manifest 配置。

### 3.4 Extension 品牌同步

Extension 初始化必须同步：

- `assets/icon.png`：Plasmo 用于生成 Chrome 所需图标尺寸的来源；
- `package.json`：根包版本、Plasmo/Chrome manifest 的名称与描述，以及真实需要的权限；
- `src/popup.tsx`：Popup 中的 Logo、名称、描述和主交互入口；
- `src/options.tsx`：Options 中的 Logo、名称、描述和设置入口。

不要维护一组与 `assets/icon.png` 重复且易漂移的手工图标声明。只有产品真实需要时才新增 background、content script、side panel 或其他入口。

### 3.5 运行时配置与日志基线

两种项目都必须生成 `.env.development`、`.env.test` 与 `.env.production`，以及 `src/config/environment.schema.ts`、`src/config/environment.ts` 和对应非空测试。逻辑 `release` 读取 `.env.production`；Web 使用 `VITE_`，Extension 使用 `PLASMO_PUBLIC_`。每份配置至少包含宿主前缀后的 `APP_ENV`、`API_BASE_URL`、`LOG_LEVEL` 与 `REQUEST_TIMEOUT_MS`，业务代码只读取冻结的 `APP_CONFIG`。

两种项目也都生成 `src/observability/logger.ts` 与非空测试。产品代码通过统一 logger 写结构化 `timestamp`、`level`、`scope`、`event`、`environment` 和可选 `context`；Release 只输出 `warn`/`error`，并按批准 allowlist 裁剪上下文。详细字段、校验、脱敏和产物扫描分别以 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 与 [`LOGGING.md`](LOGGING.md) 为准。

### 3.6 分页、语言与 HTTP 基线

两种项目都生成 `src/pagination/`、`src/api/client/`、`src/i18n/language.ts` 和对应非空测试，但不生成真实 endpoint、登录页、refresh/replay 或占位网络调用：

- 分页以 1-based `page`、`10|20|50|100` 的受控 `pageSize`、`items` 与非负安全整数 `total` 为内部结构，默认 `{ page: 1, pageSize: 20 }`。sessionStorage 只保存按项目 ID、Schema 版本和稳定 scope 隔离的 `{ version: 1, page, pageSize }`；切换 `pageSize` 回第一页。
- 只有与当前 page/pageSize 对应、明确 success、非 fetching/loading/placeholder 且 `items` 为空的非第一页结果可以回退第一页；旧响应、错误和暂时空态保持当前位置。生成的组件/hook 不自动挂进非分页 Landing、404、Popup 或 Options。
- 原生 Fetch client 当前只接受冻结 `APP_CONFIG` 单一 BaseURL 边界内的相对路径，并拒绝绝对 URL、越界路径和 redirect；未来多 target 由真实域 adapter 与只读 registry 加入。每次 dispatch 动态发送有值的 `X-Http-Request`、`X-Lang` 与 `X-AUTH-TOKEN`；continuation 和 Token 只从同一受控 API 边界的 2xx 响应提取，并用 sequence/revision 防止乱序覆盖。
- `X-Http-Request` 是服务端签发、供后续请求传播的 opaque continuation/correlation 值，不是客户端 request-id。语言偏好按项目命名空间写入 localStorage，异常时回退浏览器语言与英文；Token/continuation 只保存在当前执行上下文内存，禁止写入环境、localStorage、sessionStorage 或日志。
- 401 只在当前请求使用的 Token 仍为当前 revision 时清理它与同一会话的 continuation，并通过 single-flight `UnauthorizedHandler` 调用真实宿主 adapter。同一失效周期只调用一次；Web 只有存在真实登录 route 后才注入 `router.navigate`，Extension 不使用 Router，也不虚构 background、登录页或跨 Popup/Options 共享会话。
- 基线不安装 Ky/Axios。真实 Ky/openapi-fetch adapter、CORS、Cookie、跨域 endpoint 与 Extension 跨上下文认证仍按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 单独落地；配置 BaseURL 不自动新增 `permissions` 或 `host_permissions`。

### 3.7 Mantine UI 规范基线

两种项目都必须生成 `docs/MANTINE_UI_GUIDELINES.md`，由源 Harness 的同名唯一事实源按当前 `projectType` 派生：共同 theme、令牌、组件语义、状态、响应式、无障碍与 i18n 规则保留，只携带 Web 或 Extension 当前宿主章节，不把另一宿主的布局约定写入终端项目。生成的 `AGENTS.md`、`docs/README.md` 与 `docs/ENGINEERING_RULES.md` 必须为 UI 任务提供读取入口，`pnpm harness validate` 必须拒绝规范缺失。

该规范不要求初始化器预装 `@mantine/form`、`@mantine/notifications` 等可选包，也不把最小 Landing、Popup 或 Options 宣称为完整业务设计系统。真实 UI 开始实施时以 Mantine theme 和当前包内受控样式落实规范，不建立第二套基础组件库或跨宿主源码共享层。

## 4. Web 技术基线

| 能力        | 选型                                           | 边界                                                                             |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 构建与开发  | Vite                                           | 只服务当前 Web 单包                                                              |
| UI          | React + TypeScript + Mantine                   | theme 与 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) 承载统一视觉语言 |
| 路由        | TanStack Router 文件路由                       | Vite plugin 生成路由树并自动 route 拆包                                          |
| 异步数据    | TanStack Query                                 | 负责远端数据、缓存、重试和失效                                                   |
| HTTP 与分页 | 原生 Fetch + 统一分页基础                      | 生成 client/测试但不生成业务 endpoint                                            |
| 实时数据    | 按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 按需选择 | 初始化不预装 SSE 客户端                                                          |
| 事件流编排  | RxJS（按需）                                   | 只有真实多来源或复杂时序需求时安装                                               |
| 客户端状态  | Jotai                                          | 只保存需要跨组件共享的客户端状态                                                 |
| 国际化      | i18next                                        | 用户可见文案使用翻译键                                                           |
| 运行时配置  | 类型化 `APP_CONFIG`                            | `VITE_` 三环境公开配置，不承载秘密                                               |
| 日志        | 统一结构化 logger                              | Release 裁剪、脱敏并扫描最终产物                                                 |
| 测试        | Vitest + Testing Library                       | 测用户可观察行为；里程碑可加 Playwright                                          |

Web 输出是普通浏览器页面，不携带 Chrome Extension 权限、manifest、Popup 或 Options。需要浏览器特有能力时，应先判断产品是否应该作为新的独立 Extension 项目初始化。生成的分页/原生 Fetch 基础与未来 REST/OpenAPI、GraphQL、SSE、可选 RxJS 的认证、CORS、缓存和状态所有权边界以 [`DATA_ACCESS.md`](DATA_ACCESS.md) 为准；模板没有真实登录 route 时不得宣称 401 已能跳转。

### 4.1 Web 目录与路由职责

```text
src/
├── api/
│   ├── README.md
│   └── client/
│       ├── httpClient.test.ts
│       └── httpClient.ts
├── app/
│   ├── AppProviders.tsx
│   ├── queryClient.ts
│   ├── router.tsx
│   └── theme.ts
├── config/
│   ├── environment.schema.ts
│   ├── environment.test.ts
│   └── environment.ts
├── features/
│   ├── not-found/NotFoundPage.tsx
│   └── welcome/
├── i18n/
│   ├── index.ts
│   ├── language.test.ts
│   ├── language.ts
│   └── locales/
├── observability/
│   ├── logger.test.ts
│   └── logger.ts
├── pagination/
│   ├── PaginationControls.tsx
│   ├── pagination.test.tsx
│   └── useSessionPagination.ts
├── routes/
│   ├── __root.tsx
│   └── index.tsx
└── main.tsx
```

- `app/` 只装配全局 Provider、主题、QueryClient 与 Router；`routes/` 使用 TanStack 文件命名约定声明 URL、loader/search/context 等路由契约；具体业务 UI、hooks、Jotai atom 和测试留在 `features/`。
- Vite 配置必须把 TanStack Router plugin 放在 React plugin 之前，并显式启用 `autoCodeSplitting`。route 组件按路由边界形成异步 chunk；共享依赖由 Vite/Rollup 根据真实引用处理，不在模板中预设手工 vendor 分组。
- `src/routeTree.gen.ts` 由 dev/build 的 Vite plugin 或 `pnpm routes:generate` 动态生成，被 `.gitignore`、Prettier 和 ESLint 排除，不由生成模板写入，也不得手工编辑。`test` 与 `typecheck` 必须先生成它，保证全新克隆可直接运行门禁。
- `api/client/` 是初始化生成的原生 Fetch 基础，统一受控 BaseURL、三个 header、timeout/取消、并发 revision、`ApiError` 与 401 handler；它不包含真实 endpoint、refresh/replay 或登录地址。真实业务出现后才在 `api/` 下增加按域划分的 service；Ky/OpenAPI adapter 不得复制第二套请求上下文。
- `pagination/` 提供所有真实集合页复用的 sessionStorage adapter、hook、受控组件与成功空页 reconciliation。TanStack Query 的 key、缓存、mutation、失效、`items` 与 `total` 属于消费端 feature，服务器状态不得复制进 Jotai 或分页 Storage。
- 依赖方向保持为 `main/app → routes → features → pagination/api`；API 与分页基础不反向依赖 React route 或 feature，401 client 只接受宿主注入的窄 handler。跨 feature 共享组件和纯逻辑只有出现真实复用后才提取，禁止为了目录对称生成空壳。

## 5. Extension 技术基线

| 能力        | 选型                                           | 边界                                                                                |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| 构建与开发  | Plasmo + Chrome MV3                            | 只服务当前 Extension 单包                                                           |
| UI          | React + TypeScript + Mantine                   | Popup/Options 各自挂载并遵循 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) |
| 异步数据    | TanStack Query                                 | 负责异步数据与缓存，不包装全部 Chrome API                                           |
| HTTP 与分页 | 原生 Fetch + 统一分页基础                      | 无业务 endpoint 或预置 host permissions                                             |
| 实时数据    | 按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 按需选择 | 初始化不预装 SSE 客户端                                                             |
| 事件流编排  | RxJS（按需）                                   | 仅限当前执行上下文，不替代 Chrome 消息                                              |
| 客户端状态  | Jotai                                          | 当前扩展包内的跨组件 UI 状态                                                        |
| 国际化      | i18next                                        | Popup/Options 等用户可见文案使用翻译键                                              |
| 运行时配置  | 类型化 `APP_CONFIG`                            | `PLASMO_PUBLIC_` 三环境公开配置，不承载秘密                                         |
| 日志        | 统一结构化 logger                              | Release 裁剪、脱敏并扫描最终产物                                                    |
| 测试        | Vitest + Testing Library                       | Chrome API 可受控替换；里程碑使用真实 Chrome                                        |

Extension 基线不使用 TanStack Router。Popup 与 Options 是独立入口；如果某个入口内部没有真实多页需求，不应引入站内路由抽象。

Extension 与 Web 生成相同的 `src/pagination/` 和 `src/api/client/` 本地工程契约，但每个 Popup、Options、content script 或 service worker 都有独立的 JavaScript 执行上下文。sessionStorage、内存 Token/continuation 与 401 single-flight 不跨上下文；初始化不为了共享它们增加 background、`storage`、消息入口或权限。产品确需跨上下文认证时必须先定义唯一所有者、类型化消息、生命周期和拒绝路径，再进入里程碑验证。

Extension 的 `package.json.targets.default` 必须显式声明 `context: "browser"` 与 `includeNodeModules: true`。这不是 Chrome manifest 权限，而是 Parcel 打包边界：React、Mantine、TanStack Query、Jotai、i18next 等运行时依赖必须进入最终浏览器 bundle，不得留下浏览器无法解析的裸包 self-map。

Chrome MV3 额外约束：

- 权限、host permissions、content script 匹配范围和 Web accessible resources 按真实功能最小化；
- 不使用远程托管可执行代码、`eval` 或宽泛 CSP；
- 消息、Storage 和外部响应进入业务逻辑前校验；
- service worker 可能随时回收，不依赖进程内长期状态；
- 真实跨域 endpoint 按执行上下文满足相应门禁：扩展页面/service worker 使用精确最小 `host_permissions`，content script 仍受页面同源/CORS 限制并只能通过类型化消息请求受控操作；生成 client 和公开 BaseURL 都不自动授予 origin 访问能力；
- Popup、Options、content script 与 service worker 之间使用类型化 Chrome 消息或 Port；RxJS 只能在各自上下文内编排，不能提供跨上下文或持久状态；
- 只有 manifest 与最终构建真实包含的入口才能写入文档和验收结论。

生成的原生 Fetch client、三个 header、Token/401、统一分页，以及未来 REST/OpenAPI、GraphQL、SSE 与可选 RxJS 的认证、多基地址、长连接生命周期和状态投影都以 [`DATA_ACCESS.md`](DATA_ACCESS.md) 为准；增加跨域 endpoint 时必须按真实消费者单独评审 CORS、最小 `host_permissions` 与真实 Chrome 失败路径。

## 6. 单包目录基线

Web：

```text
.env.development
.env.test
.env.production
.harness/project.json
.harness/brand/logo-1024.png
public/logo.png
public/favicon.png
src/api/README.md
src/api/client/httpClient.ts
src/api/client/httpClient.test.ts
src/app/
src/config/environment.schema.ts
src/config/environment.ts
src/config/environment.test.ts
src/features/
src/i18n/
src/i18n/language.ts
src/i18n/language.test.ts
src/observability/logger.ts
src/observability/logger.test.ts
src/pagination/PaginationControls.tsx
src/pagination/useSessionPagination.ts
src/pagination/pagination.test.tsx
src/routes/
src/main.tsx
index.html
package.json
tsconfig.json
```

Extension：

```text
.env.development
.env.test
.env.production
.harness/project.json
.harness/brand/logo-1024.png
assets/icon.png
src/
  api/client/httpClient.ts
  api/client/httpClient.test.ts
  config/environment.schema.ts
  config/environment.ts
  config/environment.test.ts
  i18n/language.ts
  i18n/language.test.ts
  observability/logger.ts
  observability/logger.test.ts
  pagination/PaginationControls.tsx
  pagination/useSessionPagination.ts
  pagination/pagination.test.tsx
  popup.tsx
  options.tsx
  style.css
  ...
package.json
tsconfig.json
```

模板可以因真实职责增加当前宿主需要的文件，但不得为了目录对称生成空入口，也不得加入另一宿主的结构。

## 7. 生成项目命令契约

两种项目都提供以下单包脚本：

```bash
pnpm dev
pnpm build
pnpm build:development
pnpm build:test
pnpm build:release
pnpm test
pnpm typecheck
pnpm lint
pnpm env:validate
pnpm release:inspect
```

命令名相同但宿主行为不同。Web 由 Vite 驱动，Extension 由 Plasmo 驱动；`dev`、`test`、`typecheck`、全部构建和 `release:inspect` 在其适用阶段验证受管环境，`lint` 执行 ESLint 与中文声明注释门禁，格式命令只检查格式。注释声明矩阵和精确排除以 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §3.1 为准。`dev` 使用 development，`test` 使用 test，`build` 固定委派 `build:release` 并读取 `.env.production`。`build:development` 与 `build:test` 只生成诊断构建。`env:validate` 默认验证全部三份配置；指定 `--profile development|test|release` 时仍检查三份文件，只允许当前进程用当前宿主的四个已声明键覆盖所选 profile。`.env`、四种 `.env*.local` 或未知公开键都会失败。

`build:release` 在宿主构建后自动运行 `release:inspect`（Web 同一脚本还运行 `tsc --noEmit`）。Extension 在 inspector 前还运行 `pnpm harness validate`，核对 browser target 并扫描 production JS 中未被打包的运行时依赖 self-map；`package` 在 zip 构建后执行同样两道门禁。产物检查针对 `build/chrome-mv3-prod`，不会直接解包 zip：文件名层拒绝 `.env*`/`.map`，仅在受支持的可读文本扩展中扫描非 Release BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、本机绝对路径与 `sourceMappingURL`；它不提供通用秘密扫描。

Web 还提供 `pnpm routes:generate`。`dev`/`build` 通过 Vite plugin 再生路由树，`test`/`typecheck` 在自身命令中先生成；该生成文件不进入 Git。Extension 不包含 Router plugin、CLI 或路由生成脚本。

当前类型的品牌刷新与结构校验使用：

```bash
pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
pnpm harness validate
```

方括号表示可选参数，不应原样输入。品牌刷新只更新母版、当前宿主派生与事实源，不提供项目类型切换。

## 8. 初始化完成条件

初始化只有同时满足以下条件才算完成：

1. 非交互 `--type` 或无默认值的交互提示已解析为一个合法值，`.harness/project.json.projectType` 与之相同。
2. 目标中只有当前宿主文件，不含另一宿主或 monorepo 痕迹。
3. `.harness/brand/logo-1024.png` 存在，当前宿主品牌派生齐全且身份一致。
4. JSON 与 TypeScript 配置可解析，依赖和脚本与当前宿主匹配。
5. 三份环境文件齐全且宿主前缀正确，`APP_CONFIG` 和 logger 测试非空；`pnpm env:validate` 验证全部环境，Release 配置使用 HTTPS 且日志最低级别为 `warn`。
6. `src/pagination/`、`src/api/client/`、语言持久化和对应非空测试齐全；validator 锁定文件、接线与关键安全结构锚点，非空行为测试锁定 page/pageSize 状态机、三个 header、内存 Token/continuation、revision、`ApiError` 与 single-flight 401 语义。manifest 不因该基础新增 Ky/Axios，Extension manifest 仍无预置权限。
7. 基线没有业务 endpoint、虚构登录 route、refresh/replay、Cookie 策略或对静态页面的假分页接线；真实 CORS、登录导航和 Extension 跨上下文/远端访问明确保持 `Unverified`，直到产品实现并完成相应门禁。
8. 普通首次安装已生成与 manifest 一致的 `pnpm-lock.yaml`；若受控自动化使用 `--skip-install`，结果明确报告安装和后续检查尚未执行。
9. Web 的动态文件路由树已由命令生成，且生成项目的 `lint`（含中文声明注释门禁）、`typecheck`、非空 `test` 与三种 profile 构建已实际执行并通过；Extension 完成自身对应门禁。初始化结果若明确使用 `--skip-install`，必须报告哪些生成与检查尚未执行，未运行不得记为通过。
10. Release 构建已自动通过 `pnpm release:inspect`：候选文件名不含 `.env*`/`.map`，受支持的可读文本扩展未命中开发/测试 BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、本机绝对路径或 `sourceMappingURL`；另行确认测试使用的 Token/continuation 值没有进入候选。Extension 还通过 `pnpm harness validate` 的 browser target 与运行时依赖自包含检查，记录的是 `build/chrome-mv3-prod` 检查结果，而不是通用秘密或 zip 解包扫描结论。
11. 非空目标、源内目标、路径、参数和输入资产等预检失败保持目标零写入；`instantiate` 的依赖安装、检查或构建失败也不得发布 sibling staging 内容到目标，且必须保持原目标不存在或为空。
12. `docs/MANTINE_UI_GUIDELINES.md`、终端 Agent 读取入口与校验门禁存在；规范保留共同规则和当前宿主章节，不包含另一宿主专属布局约定。
13. 成功下游已删除 `instantiate`、`harness:init`、源专用 `$web-instantiate-project`、内部 init/instantiate tooling 及其他只服务模板派生的入口；源 Harness 方法论文档被删除，剩余工程/发布文档只描述已选类型。

## 9. Harness 未来增减能力

Harness 维护者未来可以增加新的**独立项目类型**或更新某一模板技术能力。每次新增类型至少需要：

- 一个新的显式 `projectType` 枚举值与 CLI 校验；
- 独立单包模板，不依赖现有 Web/Extension 仓库；
- 自己的品牌派生、开发脚本、测试与里程碑验收；
- 初始化器回归，证明所有已有类型仍然互斥且可生成；
- README、AGENTS、本文档、发布规则和适用 Skills 同步更新。

移除支持类型时，要说明对既有下游的维护与升级策略。无论增减，已生成仓库都不会变成多宿主项目。
