# 分页、数据访问与事件流集成技术选型

本文档是 Bifang Web Harness Template 及其生成下游在统一分页、HTTP 请求上下文、REST/OpenAPI、GraphQL、Server-Sent Events（SSE）与可选事件流编排上的唯一详细事实来源。初始化器为 Web 与 Extension 都生成不含业务 endpoint 的原生 Fetch client、语言偏好、分页基础与非空测试；它不安装 Ky、Axios 或其他请求库，不生成占位业务请求、登录页或事件总线，也不为 Extension 预置网络或 Storage 权限。只有真实 endpoint、Schema、跨上下文认证或复杂事件流出现时才增加相应适配器、依赖与权限。环境字段和日志安全分别由 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 与 [`LOGGING.md`](LOGGING.md) 约束。

固定生成的 HTTP/分页基础（`.harness/tooling/templates/http.ts`、`pagination.ts`）体量明显大于"不生成空壳"原则通常允许的规模，这是刻意例外而非疏漏：动态 header、乱序 revision、迟到 401 与 single-flight 是认证/并发正确性问题，一旦交给每个下游各自实现，出错代价（安全绕过、竞态覆盖新状态）远高于集中维护的成本；因此即便当前项目零业务 endpoint，也在初始化阶段一次性生成并测试，而不是等首个真实 endpoint 出现才补。这与 Ky/OpenAPI/GraphQL/SSE/RxJS 按真实消费者才安装的策略并不矛盾：后者是可替换的传输/协议适配器，前者是所有适配器共享、不可省略的正确性契约。

## 1. 选型结论

| 能力                           | 默认选型                                                    | 何时改选                                                                                                      |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 统一集合分页                   | 生成的 1-based `page`/`pageSize` 契约与 sessionStorage 状态 | 真实接口使用 cursor、offset 或其他字段时，由域 service 映射为内部契约，不另建页面私有分页标准                 |
| 基础 HTTP                      | 生成的类型化原生 Fetch client factory                       | 保持 header、并发 revision、错误与 401 语义不变；初始化阶段不生成任何业务 endpoint                            |
| 无可靠 OpenAPI 契约的 REST     | 原生 Fetch 基础；真实复杂度需要时可加 `ky` adapter          | 只有真实消费者需要 Ky 的 hooks/人体工学时安装；已有必须保留的 Axios 生态或 Fetch 无法满足的能力才使用 `axios` |
| 有可靠 OpenAPI 契约的 REST     | `openapi-typescript` + `openapi-fetch`                      | Schema 不完整、长期漂移或无法进入生成/类型检查门禁时使用原生 Fetch 或 Ky adapter，并在运行时校验响应          |
| 不需要规范化实体缓存的 GraphQL | `graphql-request` + `@graphql-codegen/client-preset`        | 只有明确需要跨查询实体归一化、Fragments 驱动缓存更新等能力时才选择 Apollo Client                              |
| 简单 SSE                       | 浏览器原生 `EventSource`                                    | 需要自定义 headers、POST/body、可控重连或 async iterator 时使用 `eventsource-client`                          |
| Fetch 风格 SSE 备选            | `@microsoft/fetch-event-source`                             | 其回调/页面可见性生命周期模型比 `eventsource-client` 更贴合既有实现时采用；它不是模板默认值                   |
| 多来源持续事件编排             | RxJS（按需）                                                | 只有组合、切换、节流、取消或共享底层订阅等真实时序复杂度时采用；简单事件继续使用宿主原生机制                  |
| 安全关键/外部响应的运行时校验  | `zod` 将 `unknown` 响应收窄为业务类型                       | `openapi-fetch` 等适配器已自带对应运行时校验时复用其结果，不重复引入第二套校验库                              |

原生 Fetch、分页和语言基础是生成项目的固定源码与测试，不是新增运行时依赖。Ky、OpenAPI、GraphQL、SSE、RxJS 与 `zod` 仍是按真实消费者加入的可选集成；实际安装时选择与当前 Node.js、TypeScript、浏览器基线兼容的稳定版本，并由 `pnpm-lock.yaml` 固定解析结果，不在长期文档中写死易过期的包版本。

## 2. 共同边界与统一分页

- TanStack Query 负责有明确完成时刻的远端服务器状态、缓存、失效和瞬态重试；HTTP client 只负责传输、请求上下文、认证交接、协议错误与取消，不把同一份服务器数据复制进 Jotai、sessionStorage 或分页 hook。
- RxJS 只编排瞬时事件和来源生命周期，不成为服务器缓存、客户端状态库、持久事件日志或 Chrome 跨上下文传输层。当前状态仍分别归 TanStack Query、Jotai 或局部 React 状态所有。
- 默认 API base URL 与请求超时来自冻结的 `APP_CONFIG.apiBaseUrl` 和 `APP_CONFIG.requestTimeoutMs`；业务代码只能通过类型化的 service/feature 边界发起请求，不能直接读环境变量，也不能从用户输入、远端配置或任意字符串选择完整 URL。多基地址在 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 的基础上使用受控 target 联合类型和只读 registry。
- Token、Cookie、continuation、API 错误体、GraphQL 响应和 SSE 事件都属于边界数据。进入业务状态前校验未知响应；只通过统一 logger 记录 [`LOGGING.md`](LOGGING.md) 允许的状态、耗时、稳定错误码与清理后路径，不记录 header、body、Token、continuation、variables 或原始事件载荷。
- 将 `AbortSignal` 从 TanStack Query 或组件生命周期传到底层传输；页面卸载、参数变化或显式取消后，不继续更新失效 UI。
- Web 在真实 endpoint 落地前确认 CORS、credentials、CSP、BaseURL 与部署环境变量；浏览器环境变量不是秘密存储。Extension 的公开 BaseURL 也不会自动获得跨域权限。
- Extension 对每个跨域服务只申请真实使用的最小 `host_permissions`，并覆盖未授权/被撤销路径。本知识基线本身不新增任何 `permissions`、`host_permissions`、background 或 content script。

### 2.1 规范化分页结构

所有真实集合页在 feature/service 边界统一使用以下语义：

- `page` 从 1 开始，必须是正整数；组件是受控组件，不能同时维护第二份隐式页码。
- `pageSize` 是每页数据量，必须来自受控正整数候选集合；生成基线固定为 `10|20|50|100`，初始状态是 `{ page: 1, pageSize: 20 }`。更改 `pageSize` 同时把 `page` 重置为 1。
- 业务 service 把 cursor、offset、`current`、`size`、`records` 等外部协议映射为 `{ items, total }`；`items` 是当前页已校验项目，`total` 是非负安全整数。外部字段不得直接扩散到通用分页组件。
- TanStack Query key 必须包含会影响结果的稳定 scope、`page`、`pageSize`、target 和语言；列表数据、`total`、loading/error 与 placeholder 状态仍只由 Query/feature 拥有。

### 2.2 sessionStorage 与 scope

- `src/pagination/` 使用 `<project-id>:pagination:v1:<encodeURIComponent(scope)>` 作为 Storage key。同一页面的多个集合必须使用不同稳定 scope；scope 不得包含 Token、个人信息、任意用户输入或会无限增长的值。
- sessionStorage 只保存 `{ version: 1, page, pageSize }`。不得保存 `items`、`total`、错误、响应、筛选敏感值或任何认证信息。
- 读取时校验对象形状、版本、正整数和允许的 `pageSize`；缺失、损坏、版本不符、容量/安全异常或浏览器拒绝 Storage 时回退声明的初始值，不能阻断渲染。写入失败同样只退化为当前内存状态。
- Web 的 sessionStorage 只承诺当前浏览器标签页会话。Extension 的 Popup、Options、content script 与 service worker 是独立执行上下文；普通 sessionStorage 不提供跨上下文共享，Popup 销毁或 service worker 回收后也不得宣称状态仍存在。需要跨上下文或持久分页状态时必须另行设计类型化消息/Storage，并评审数据与权限边界。

### 2.3 成功空页回退状态机

从非第一页回到第一页只能由一次与**当前**分页状态完全对应的成功结果触发，并同时满足：

1. 请求记录的 `page`/`pageSize` 与此刻受控状态完全相同，避免迟到旧响应改变新页面。
2. Query/请求状态明确为 success，当前既非 fetching、非 loading，也非 placeholder。
3. 已校验的 `items` 为空且当前 `page > 1`。

满足后只执行一次 `page = 1` 转移并持久化新状态，由 Query key 变化发起第一页请求。loading、error、取消、placeholder、旧 `page`/`pageSize` 响应、第一页空态和成功非空页都保持当前位置；不得仅根据缺失数据、`total` 变化或渲染时的暂时空数组猜测回退。

## 3. HTTP、认证与 REST/OpenAPI

### 3.1 生成的原生 Fetch 基础

两种宿主都生成 `src/api/client/` 的类型化原生 Fetch client factory 与非空测试。当前基线只接受 `APP_CONFIG.apiBaseUrl` 边界内的相对路径，并拒绝绝对 URL、越界路径和 redirect；它使用 `APP_CONFIG.requestTimeoutMs`、调用方 `AbortSignal`、统一请求上下文和 `ApiError`，但不声明任何真实路径、Schema、登录地址、Cookie 策略或业务 service。未来确有多 target 时，由真实域 adapter 和初始化即校验的只读 registry 扩展，不能让页面绕过边界。React route/组件不能直接调用任意 URL，也不能依赖传输实现细节。

模块职责保持明确：

- HTTP client：受控 BaseURL、三个标准 header、timeout、取消、response interception 与错误映射。
- Request context/session：语言、continuation、Token、单调 dispatch sequence 和 Token revision；不依赖 React route。
- `UnauthorizedHandler`：由真实宿主组合层注入的异步回调；client 不导入 Router、`window.location` 或 Chrome 导航 API。
- Feature/domain service：在真实 endpoint 出现后声明路径、方法、输入/输出校验、外部分页映射和业务语义。

### 3.2 三个标准 header 与语言

每次真正 dispatch 时动态读取上下文，只有值通过校验且非空时才设置 header：

| Header           | 请求值来源                                     | 成功响应处理                                                                                                        | 存储边界                                             |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `X-Http-Request` | 当前内存中的服务端 continuation/correlation 值 | 只从同一受控 API 边界的 2xx 响应提取并供后续请求携带；它不是客户端生成或复用的每请求唯一 request-id                 | 当前执行上下文内存；不写 Storage、环境或默认日志     |
| `X-Lang`         | 每次 dispatch 动态读取的规范化当前语言         | 不以任意响应值静默改写用户偏好；若响应内容随语言变化，Query key 必须包含语言                                        | 项目命名空间 localStorage，只保存支持的语言标识      |
| `X-AUTH-TOKEN`   | 当前 Token revision 的内存值                   | 默认从同名 header 提取；真实协议可注入异步 `extractAuthToken(response.clone())`，但必须保留相同信任、并发和存储规则 | 当前执行上下文内存；禁止 local/sessionStorage 与 env |

语言偏好以 `<project-id>:language:v1` 保存当前支持的 `en|zh`。读取顺序是：项目命名空间下可识别的 localStorage 值、规范化浏览器语言、英文 fallback。非法/未知语言、Storage 异常或浏览器拒绝访问时回退且不阻断应用；i18next 的真实语言变化同步更新该偏好，下一次请求才读取新值。不得把语言存储与认证 Token 混在同一个对象中。

client 会先移除调用方伪造的三个标准 header，再根据当前受控状态写入。只有同一受控 API 边界的 2xx 响应可以推进 continuation 或 Token。每次 dispatch 分配单调 sequence，并让 Token 更新/显式登录产生新的 revision；迟到的旧响应不得覆盖较新值，迟到的旧 401 也不得清理新 revision。响应 header 按不可信有界字符串校验，不把 `Response`、body 或全量 headers 保存进状态。

### 3.3 `ApiError`、安全日志与 401

client 把 HTTP 非成功、timeout、网络失败、取消和响应/提取校验失败转换为统一 `ApiError`。稳定契约至少区分 `http|timeout|network|aborted|invalid-response|unauthorized-handler`，并可包含 HTTP `status`、稳定业务 `code`、安全 message、`retryable` 和受控 cause；UI 不依赖第三方错误类，也不展示未经校验的服务端消息。

401 是有界会话失效流程，不是模板内置 refresh/replay：

1. 请求记录 dispatch 时实际使用的 Token 与 revision。收到 401 时，只有该 Token 仍是当前 revision 才清理它及同一会话的 continuation；旧请求的迟到 401 不能登出或清理更新后的会话。
2. 基线只记录稳定 scope/event、状态码和安全 code/reason/retryable；不得记录三个 header 的值、请求/响应 body、Token、continuation、完整 URL、Error stack/cause 或本机路径。真实域层只有提供不含标识符的静态 endpoint 模板后才可记录该模板。
3. 同一会话失效周期内，共享一个 in-flight Promise 调用 `UnauthorizedHandler`；并发 401 只能触发一次 handler/导航。新的显式认证会话重置该 latch；handler 自身失败只记录稳定 `unauthorized-handler` 错误且不递归调用，原 request 仍向调用方抛出 `authentication_required` 401。
4. Web 只有在产品已经存在真实、可访问的登录路由后，才在 app/route 组合层注入类型化 `router.navigate` adapter；登录目标与可选 return target 必须显式、同源且受控。模板不得硬编码不存在的 `/login`，也不得在 client 中使用 `window.location`。
5. Extension 不使用 TanStack Router。只有产品明确真实登录入口后，Popup/Options 才呈现重新认证状态或由宿主 adapter 打开批准的入口；模板不虚构登录页面、background 或 Chrome 导航。跨 Popup/Options 的 single-flight 与会话共享不能依赖模块全局变量，必须另行设计 background/message/Storage 所有者并取得权限与隐私专项批准。

refresh endpoint、Cookie/credentials 策略、自动重放和非幂等幂等键都不属于初始化基线。真实产品增加这些能力时必须只有一个重试/重放所有者，防止 client 与 TanStack Query 次数相乘，并覆盖 refresh 自身 401、并发、重放上限和副作用安全。

### 3.4 CORS、缓存与 Extension 权限

- 跨域 Web 服务若接收三个自定义请求 header，预检必须按批准 origin/method 返回覆盖 `X-Http-Request, X-Lang, X-AUTH-TOKEN` 的 `Access-Control-Allow-Headers`；返回 continuation 或 Token 时还必须用 `Access-Control-Expose-Headers` 暴露实际需要读取的 `X-Http-Request, X-AUTH-TOKEN`。使用 credentials 时不得把 `Access-Control-Allow-Origin` 写成 `*`。
- 动态反射 origin 的响应包含 `Vary: Origin`；按语言生成不同表示的响应包含 `Vary: X-Lang`。认证响应默认使用 `Cache-Control: private, no-store`；若真实架构明确允许缓存依赖 Token 的表示，必须单独评审缓存键，并至少按 `X-AUTH-TOKEN` 区分，不能让共享缓存混用用户响应。缓存预检响应时还必须按 `Origin, Access-Control-Request-Method, Access-Control-Request-Headers` 区分。
- Extension 的 CORS 与 `host_permissions` 按执行上下文区分：扩展页面或 service worker 从扩展 origin 发起跨域 Fetch 时必须有精确最小 `host_permissions`；content script 代表页面 origin 发起请求，仍受同源/CORS 限制，即使扩展已经拥有该 host permission 也不能绕过。需要由特权上下文代请求时，只允许类型化消息选择受控 endpoint/参数，禁止让 content script 传任意 URL。初始化生成 client 不代表获准访问任何远端 origin；首次真实消费者必须覆盖未授权/撤销、非法 sender/message 与上下文销毁路径，并在真实 Chrome 验证。仅为共享 Token 或 continuation 增加 `storage`、background 或消息入口同样需要显式架构与权限/隐私评审。

### 3.5 Ky 作为未来 adapter

Ky 基于 Fetch API，提供实例默认值、非 2xx 错误、timeout、hooks 与类型友好的响应读取。只有真实 REST 消费者需要这些能力时才安装，并按 API 域创建少量命名实例或受控 registry；不能建立可访问任意绝对 URL 的万能客户端，也不能另建一套 header、Token、revision、401 或 `ApiError` 语义。面向 TanStack Query 时关闭会与 Query 重复的自动网络/状态码重试。

### 3.6 有 OpenAPI 时优先 openapi-fetch

当团队拥有可信且会随实现同步的 OpenAPI 3 Schema 时，使用 `openapi-typescript` 生成 `paths` 类型，再由 `openapi-fetch` 提供类型化 method/path/params/body/response。每个独立服务或不兼容版本拥有自己的 schema 输入、生成目录和 client registry 条目。

- Schema 或 operation 变化后必须重新生成并运行 `pnpm typecheck`；生成目录不手工编辑。
- Token/continuation 获取、语言、并发 revision、401、错误归一化、取消和观测规则与原生 Fetch 基础相同，通过 `openapi-fetch` middleware 或清晰的外层 service 复用。
- Schema 只提供静态契约，不能证明运行时响应可信；对安全关键或外部服务响应仍用 §1 表中的 `zod`（或已有的等价校验结果）执行运行时校验。
- 不在同一端点外层叠加原生 Fetch、Ky 和 openapi-fetch 多套 retry/error 语义。

### 3.7 Axios 例外

Axios 不是新项目默认值。只有现有业务已经依赖其 interceptors、adapter、取消/进度语义或第三方生态，并且迁移成本高于收益时保留；例外要记录具体消费者、无法由 Ky/Fetch 满足的已验证能力和退出条件，不能只以“团队熟悉”作为理由。

## 4. GraphQL

### 4.1 默认组合

在不需要规范化实体缓存时，使用 `graphql-request` 发起最小 GraphQL 请求，并使用 GraphQL Code Generator 的 `client` preset 生成 `TypedDocumentNode`/类型化文档。运行时依赖通常包括 `graphql` 与 `graphql-request`，生成期依赖包括 `@graphql-codegen/cli` 和 `@graphql-codegen/client-preset`；只有首次真实 GraphQL 功能落地时才安装。

### 4.2 多 GraphQL 基地址

多基地址使用编译期可枚举的 target registry：

- 定义稳定的 `GraphqlTarget` 联合类型，例如账户域、目录域；registry 为每个 target 保存 endpoint、动态 headers/token provider 与对应生成文档边界。
- 业务调用传 target，不传任意 URL；registry 初始化时校验 URL，Extension 还要校验它与已批准的最小 `host_permissions` 一致。
- 每个不同 GraphQL schema 使用独立的 Codegen `generates` 输出目录。不能把 A schema 生成的 operation/type 发往 B endpoint。
- 同一 schema 的多个环境或副本可以复用生成类型，但运行时 target 仍必须显式，认证 headers 在每次请求时动态获取。
- 若接入 TanStack Query，`queryKey` 至少包含 GraphQL target、operation 标识和影响结果的 variables；否则不同服务的相同 operation 会污染缓存。

### 4.3 “不需要缓存”的含义

- 真正不保留结果时，直接调用 `graphql-request`，由组件或 feature service 管理一次性 pending/error/result 生命周期。
- 仍想复用 TanStack Query 的取消、错误状态或去重时，可以设置 `gcTime: 0` 并按业务设置 `staleTime`/`retry`；这只会在 query 失去最后一个 observer 后尽快回收，活跃 observer 仍会持有当前结果，不能宣称为绝对零缓存。
- GraphQL errors 与 HTTP/network errors 分开归一化；是否接受 partial data 必须显式决定，不能静默吞掉 `errors`。

### 4.4 何时选择 Apollo Client

只有产品明确需要规范化实体缓存、跨 operation 的 entity 更新、复杂 fragment/cache policy、Apollo Link 生态或 Apollo 本地状态时选择 Apollo Client。若采用 Apollo，它独占该 GraphQL 数据的缓存；TanStack Query 继续管理 REST 或其他异步数据，不对同一 GraphQL operation 再包一层 Query 缓存。

## 5. Server-Sent Events

### 5.1 客户端选择

- 原生 `EventSource`：适合 GET、无需自定义请求 headers/body，且可通过同源 Cookie 或明确 CORS/credentials 策略认证的简单流。
- `eventsource-client`：需要 Bearer header、任意 HTTP method、POST/body、可控重连、Last-Event-ID 或 async iterator 时使用。
- `@microsoft/fetch-event-source`：当项目更需要 Fetch 风格请求和回调/页面可见性生命周期时作为备选；不要同时引入两套 SSE client。

### 5.2 生命周期与 Query 协作

SSE 是长连接，不应作为永不 resolve 的 TanStack Query `queryFn`。连接由 feature hook/service 显式拥有，在组件/入口卸载、target 改变、登出或权限撤销时 `close`/abort；收到事件后用 `queryClient.setQueryData` 更新已知缓存，或用 `invalidateQueries` 触发普通请求重新取数。

- 校验 event name、`data` JSON、版本和业务标识；未知或畸形事件不能直接写入 UI/缓存。
- 明确 heartbeat/stall、指数退避与 jitter、最大重连间隔、`Last-Event-ID`/恢复语义，以及认证过期后的重新建连策略。
- 自动重连不得无限高频；4xx、权限拒绝和确定性协议错误通常应停止并向用户暴露可恢复动作。
- Web 的页面或路由生命周期必须关闭旧连接，避免隐藏页面、重复挂载或 target 切换产生重复订阅。
- Extension 的 Popup/Options 关闭时会销毁页面；MV3 service worker 也可能被回收，因此不能承诺把持久 SSE 连接长期托管在 service worker。需要持续连接时必须重新设计成符合宿主生命周期的架构并进入权限与后台行为专项评审。

## 6. 可选 RxJS 事件流编排

### 6.1 引入条件

RxJS 不是固定技术栈，也不是为了统一代码风格而建立的全局事件总线。只有真实功能出现以下任一需求时才安装：

- 多个持续来源需要 `merge`、切换、组合、缓冲、节流或去抖；
- 业务正确性依赖“只处理最新来源”、有界并发、显式取消或可测试的时间顺序；
- 多个消费者必须共享同一个底层连接或监听器，并需要明确的引用计数与 teardown。

普通 React callback、局部组件状态、有限 REST/GraphQL 请求、一次性 Chrome message，或单一来源的简单单消费者 SSE/WebSocket 不需要 RxJS。需要返回成功、失败或业务结果的动作继续调用类型化 service；事件流只传递已经发生的事实。

### 6.2 来源、契约与状态投影

事件流按 feature 组织，优先暴露 `taskEvents$` 等有领域边界的流，而不是允许任意模块发布任意载荷的全应用总线：

1. SSE、WebSocket、DOM、`chrome.runtime`、Port 与本地事件各自由 source adapter 转换成 Observable。Adapter 拥有对称、幂等的监听移除、`close`、abort、`onDisconnect` 与 teardown。
2. 外部 payload 先按 `unknown` 处理并运行时校验，再映射为 discriminated union 领域事件。按需要携带 `type`、`source`、`schemaVersion`、`eventId`、`entityVersion` 或 `correlationId`，不能让畸形事件进入 Query/Jotai。
3. 多个来源可能更新同一实体时，必须定义权威来源、去重、版本/sequence 与旧事件拒绝策略；`merge()` 不提供跨来源因果顺序，本地时间戳不能单独充当实体版本。
4. 每个来源在进入合并流前独立处理可预期错误、重连和取消；不能只在合并流末端 `catchError`，否则一个来源会终止全部订阅。SSE client、RxJS 和 TanStack Query 之间只能有一个重试/重连所有者。
5. `Subject` 保持私有，只导出只读 Observable 和必要的窄化发布函数。只有确需单一底层订阅时才使用 `share()`；重试策略位于共享之前，并测试 error、complete、refCount 与重新订阅语义。
6. 领域事件流默认不 replay。禁止无界 `ReplaySubject` 或把 `shareReplay` 当状态仓库；确需晚订阅快照时必须限制 buffer/time、明确清理和敏感数据边界，并以测试固定锁定版本的行为。
7. Feature effects 消费领域事件：“数据已变化”通知调用 `invalidateQueries`；只有完整、已校验且可判定更新的数据才调用 `setQueryData`；跨组件客户端状态写入 Jotai。不得把同一实体同时保存在 Query、BehaviorSubject 与 Jotai。

### 6.3 Chrome MV3 边界

Observable 和 Subject 只存在于当前 JavaScript execution context。Popup、Options、content script 与 service worker 之间仍使用 `chrome.runtime`/tabs messaging 或 Port，再在每个上下文内适配为 Observable；RxJS 本身不能跨上下文，也不能让 service worker 常驻。

Service worker 的监听器必须按 Chrome 生命周期要求注册，进程内流、buffer 和全局变量在回收后均不可视为持久状态。唤醒后需要重建订阅，必要状态写入 `chrome.storage`、IndexedDB 或服务端。引入 RxJS 本身不得新增 Extension permission、host permission、后台入口或远程代码。

## 7. 落地与测试门禁

生成基础和首次真实集成都必须满足相应门禁：

1. 生成分页测试至少覆盖合法恢复、损坏/异常 Storage、版本与 scope 隔离、换页、`pageSize` 重置，以及 loading/error/placeholder/旧响应不回退、当前成功空页回第一页。
2. 生成 HTTP/语言测试至少覆盖动态 `X-Lang`、continuation/Token 后续携带、异步 Token extractor、同源 2xx 信任边界、乱序 response、迟到旧 401、新会话 latch reset、并发 401 单次 handler、handler 失败、timeout、取消、受控 URL 和安全日志。
3. 首次真实 endpoint 记录 target、认证方式、分页字段映射、数据所有者、取消/重试策略、真实登录入口，以及 Web CORS/CSP/cache 或 Extension 最小权限与执行上下文影响；不得把初始化配置冒充服务可达证据。
4. 只安装真实使用的可选依赖，检查维护状态、许可证、浏览器支持和 bundle 影响并固定 lockfile。Ky/openapi-fetch/Axios adapter 必须复用三个 header、revision、401、`ApiError` 与日志契约，并测试不会形成第二套重试/认证状态机。
5. Web 的真实跨域集成验证服务端 Allow/Expose/Vary/Cache-Control 与 credentials 配置；真实登录页存在后才测试导航。Extension 的真实网络或跨上下文认证必须覆盖权限拒绝、上下文销毁、消息 sender 校验和 service worker 重建，并把真实 Chrome 验证列为硬要求。
6. 多 GraphQL target 至少覆盖正确路由、动态 headers、非法 target 拒绝、各 schema 的生成类型和包含 target/语言的 Query key。
7. SSE 至少覆盖消息校验、错误/重连决策、显式关闭，以及不会因重新挂载产生重复连接。
8. RxJS 首次接入至少覆盖有效/无效事件映射、单来源失败隔离、重试停止与取消、监听/连接数量和最后一个订阅退出后的 teardown。
9. 使用 `share` 或 replay 时覆盖共享底层订阅、error/complete/refCount reset、晚订阅结果、缓冲边界与清理；多来源更新还要覆盖重复、乱序和旧版本拒绝。
10. 事件投影至少证明 Query/Jotai 各自只有一个状态所有者；Extension 还要覆盖非法 sender/message、Port 断开、页面卸载和 service worker 重启后的重建。涉及后台行为或权限时进入完整候选验收并在真实 Chrome 验证。
11. 运行 `pnpm env:validate`、`pnpm harness validate`、`pnpm lint`、`pnpm typecheck`、相关非空 `pnpm test` 与 `pnpm build`；验证 client 只读 `APP_CONFIG`，日志符合脱敏边界，Release 产物不包含开发/测试 BaseURL、Token/continuation fixture 或敏感数据。真实服务、CORS、登录导航、浏览器与权限场景未执行时写为 `Unverified`。

## 8. 官方参考

- [Ky](https://github.com/sindresorhus/ky)
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [graphql-request](https://github.com/graffle-js/graffle/tree/graphql-request)
- [GraphQL Code Generator client preset](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client)
- [Apollo Client caching overview](https://www.apollographql.com/docs/react/caching/overview)
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [eventsource-client](https://github.com/rexxars/eventsource-client)
- [Fetch Event Source](https://github.com/Azure/fetch-event-source)
- [Chrome Extension cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome Extension message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [RxJS overview](https://rxjs.dev/guide/overview)
- [RxJS `share`](https://rxjs.dev/api/operators/share)
- [TanStack Query important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
