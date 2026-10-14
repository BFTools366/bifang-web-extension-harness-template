# 数据层、存储与 API 职责

本文档是 Bifang Web Harness Template 及其生成下游在统一分页、Web 列表状态所有权、HTTP 请求上下文、REST/OpenAPI、GraphQL、Server-Sent Events（SSE）与可选事件流编排上的唯一详细事实来源。初始化器为 Web 与 Extension 都生成基于 Ky 的无业务 endpoint HTTP client、语言偏好、分页基础与非空测试；`ky` 是两种宿主共有的运行时依赖，不生成占位业务请求、业务列表页或事件总线；初始化不注入认证等业务，也不为 Extension 预置网络或 Storage 权限。只有真实 endpoint、Schema、跨上下文认证或复杂事件流出现时才增加相应适配器、依赖与权限。环境字段和日志安全分别由 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 与 [`LOGGING.md`](LOGGING.md) 约束。

固定生成的 HTTP/分页基础（`.harness/tooling/templates/http.ts`、`pagination.ts`）体量明显大于"不生成空壳"原则通常允许的规模，这是刻意例外而非疏漏：动态 header、乱序 revision、迟到 401 与 single-flight 是认证/并发正确性问题，一旦交给每个下游各自实现，出错代价（安全绕过、竞态覆盖新状态）远高于集中维护的成本；因此即便当前项目零业务 endpoint，也在初始化阶段一次性生成并测试，而不是等首个真实 endpoint 出现才补。这套正确性契约由请求上下文维护，默认使用 Ky 的 Fetch 传输；OpenAPI/GraphQL/SSE/RxJS 协议适配器仍按真实消费者加入并复用该契约。

## 1. 选型结论

| 能力                          | 默认选型                                                     | 何时改选                                                                                                           |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 统一集合分页                  | 生成的 1-based `page`/`pageSize` 契约与 sessionStorage 状态  | 真实接口使用 cursor/offset 时由域 service 映射；Web 路由列表按 §2.5 改用 Router 运行时 owner，但仍复用同一内部契约 |
| 基础 HTTP                     | 生成的类型化 Ky HTTP client factory                          | 保持 header、并发 revision、错误与 401 语义不变；初始化阶段不生成任何业务 endpoint                                 |
| 请求前缓存与有限查询状态      | `@tanstack/react-query`，REST / GraphQL 复用同一 QueryClient | feature 声明 key 与新鲜度，Ky 只负责实际传输；本地偏好和 IndexedDB 领域数据保持独立所有权                          |
| 无可靠 OpenAPI 契约的 REST    | 生成的 Ky HTTP 基础                                          | 统一复用请求上下文；已有必须保留的 Axios 生态或 Ky/Fetch 无法满足的能力才使用 `axios`                              |
| 有可靠 OpenAPI 契约的 REST    | `openapi-typescript` + 受管 Ky 领域 adapter                  | 已有可靠 `openapi-fetch` 消费者且迁移无收益时保留协议 adapter，不复制请求上下文；运行时仍校验外部响应              |
| GraphQL 列表及复杂查询        | `graphql-request` + `@graphql-codegen/client-preset` + Query | 列表查询必须使用 GraphQL；Apollo 缓存所有权仍须明确批准例外                                                        |
| 简单 SSE                      | 浏览器原生 `EventSource`                                     | 需要自定义 headers、POST/body、可控重连或 async iterator 时使用 `eventsource-client`                               |
| Fetch 风格 SSE 备选           | `@microsoft/fetch-event-source`                              | 其回调/页面可见性生命周期模型比 `eventsource-client` 更贴合既有实现时采用；它不是模板默认值                        |
| 多来源持续事件编排            | RxJS（按需）                                                 | 只有组合、切换、节流、取消或共享底层订阅等真实时序复杂度时采用；简单事件继续使用宿主原生机制                       |
| 安全关键/外部响应的运行时校验 | `zod` 将 `unknown` 响应收窄为业务类型                        | 已有等价运行时校验器时复用；`openapi-fetch` 的静态类型本身不能验证运行时响应                                       |

Ky HTTP、分页和语言基础是生成项目的固定源码与测试，`ky` 声明在运行时 dependencies 中。OpenAPI、GraphQL、SSE、RxJS 与 `zod` 仍是按真实消费者加入的可选集成；实际安装时选择与当前 Node.js、TypeScript、浏览器基线兼容的稳定版本，并由 `pnpm-lock.yaml` 固定解析结果，不在长期文档中写死易过期的包版本。

### 1.1 统一数据层结构

API 与存储统一归入 `src/data/` 数据层，包含数据契约、访问和持久化；它不是只放 interface 的“数据结构”目录。新生成项目使用以下结构，标为按需的部分仅在真实消费者出现时创建：

```text
src/data/
  README.md
  api/
    README.md
    client/                 # 已生成：Ky、认证上下文、错误与取消
    <domain>/               # 按需：领域类型、REST、远端 API Mock 与响应映射
    graphql/                # 按需：复杂查询、Codegen 文档与订阅 adapter
  storage/
    README.md
    webStorage.ts           # 已生成：LocalStorage / SessionStorage 原生入口
    webStorage.test.ts
    colorScheme.ts          # 已生成：Mantine 外观偏好适配
    cookie/                 # 按需：非 HttpOnly Cookie 的领域访问
    memory/                 # 按需：当前执行上下文的领域内存仓库
    indexeddb/              # 按需：Dexie 数据库、表与版本迁移
```

- `i18n/` 保留语言规范化、运行时切换与翻译资源；`pagination/` 保留分页状态机、hook 和控件；浏览器 Storage 访问通过 `data/storage/webStorage.ts`。外观偏好在 `data/storage/colorScheme.ts` 复用 Mantine manager，不重写其订阅和异常处理。
- `features/` 拥有 Query key、缓存策略、交互编排与事件投影，调用数据层的领域函数。数据层不反向依赖 feature/route，不建立万能 repository、第二套 `services/` 或自动同步所有存储的总线。
- 同一业务域的 REST、GraphQL 查询与 Mock 使用明确操作名和同一领域模型；传输 adapter 与生成文档放 `data/api/graphql/`，避免因协议不同复制两份业务判断。
- 此结构适用于新生成项目。既有下游的 `src/**` 仍受升级保护，不能通过 ownership 规则自动搬迁产品源码；迁移需在对应下游授权范围内同步 imports、消费者与测试，保留原有 Storage key、格式和权限，再更新依赖该结构的 validator。

### 1.2 REST 与 GraphQL 分工

| 场景                                                     | 责任                  | 传输与状态                                                                        |
| -------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| 单对象详情、创建/修改/删除、登录登出、上传及主要业务动作 | REST 为主入口         | 受管 Ky client；Query 管读取与 mutation 缓存生命周期                              |
| 远端列表、集合、搜索、筛选、排序及分页读取               | GraphQL Query，强约定 | 条件、排序与分页按可信 Schema 经 variables/参数传递；Query 统一缓存               |
| 多实体关联、聚合、按需字段裁剪等复杂读取                 | GraphQL Query         | `graphql-request` + Codegen，HTTP adapter 复用受管 Ky 请求上下文                  |
| 服务端向客户端连续推送数据变化                           | GraphQL Subscription  | 按服务端协议选 `graphql-ws` 或 `graphql-sse`；feature 管订阅生命周期和 Query 投影 |

默认写操作全部走 REST，不为同一业务动作再建立 GraphQL Mutation。已有服务只能提供 Mutation 时，按明确的真实契约记录例外、幂等和缓存所有者，不能悄悄改变默认分工。复杂查询的传输 POST 不代表业务写入，其安全重试必须按 operation 语义判断。REST 读取和 GraphQL 查询访问相同实体时，feature 明确缓存键、失效与投影关系，避免维护无法对账的副本。

#### 列表查询协议强约定

- **远端列表查询必须使用 GraphQL**，接口设计、Mock 协议设计、接入与文档导出均适用，Web 与 Extension 一致。列表包括独立获取集合、搜索结果、筛选/排序/分页结果、树与候选项；首次无筛选、固定列表或数据量小也不能改走 REST。按操作的业务用途判断，不从 GET/POST、函数名或 JSON 中出现数组机械推断。
- 列表实际需要的条件、排序与分页必须有真实 Schema 或明确标注的设计 SDL/variables；遵循实际参数、输入类型、可空性和分页方式，不拼接用户条件到查询字符串，不补造服务已支持的筛选字段。尚无可信 GraphQL 契约时，设计阶段可在授权范围内提出待确认建议；真实接入保持阻断，不借用 REST 列表绕过。
- 单对象详情内的子数组、写操作返回的结果集合以及纯客户端本地集合处理，不因此成为远端列表查询；不为本地列表虚构 GraphQL 服务。服务端查询库、TanStack Query 缓存与 HTTP POST 都不能单独证明采用 GraphQL，必须核对实际 operation 与 Schema。
- 已有 REST 列表实现或已采用 REST 列表契约按事实保留，明确登记为**不符合列表协议强约定**；导出不能改写成已实现 GraphQL、隐藏该操作或把新 GraphQL 设计建议当作迁移完成。此类材料可作为差异/迁移评审文档保存，但协议检查失败，不能宣布本轮导出符合规范。迁移只在获得实现范围授权与可信 GraphQL 契约后执行；既有服务限制不构成自动例外。

推送指客户端主动订阅后的服务端事件，不等同于浏览器 Push API、离线通知或自动双向同步。GraphQL 本身不提供传输实现：Ky 处理 HTTP，不承担 WebSocket；`graphql-request` 处理有限请求，不承担长期订阅。服务端没有 Subscription schema 与协议时，不能从查询接口推断支持推送。当前 [`API.md`](API.md) 的参考契约只定义只读 GraphQL 查询，没有订阅契约；采用时须保持这项事实。

### 1.3 存储机制与选型

| 机制           | 默认实现                                                | 职责与生命周期                                                                                                           |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cookie         | 浏览器/服务端原生机制；复杂非敏感操作按需用 `js-cookie` | 需要随请求发送的少量状态；声明 path/domain、Secure、SameSite 与期限，认证 HttpOnly Cookie 只能由服务端设置，前端不能读取 |
| LocalStorage   | 原生 Storage，经 `getWebStorage("local")`               | 语言、外观等少量非敏感持久偏好；同步字符串键值，按 origin 隔离                                                           |
| SessionStorage | 原生 Storage，经 `getWebStorage("session")`             | 当前标签页会话恢复；同步字符串键值，按 origin 与标签页隔离                                                               |
| Memory         | 模块闭包、Map 或现有 Query/Jotai 状态所有者             | 当前执行上下文临时状态，页面/Worker 销毁即丢失；不能冒充持久或跨上下文共享存储                                           |
| IndexedDB      | `dexie`                                                 | 大量结构化本地数据、索引、事务与显式版本迁移；按真实领域定义 schema，异步读取                                            |

Dexie 只封装 IndexedDB，不能替换 Cookie、LocalStorage 或 SessionStorage，也不自动把它们迁入数据库。当前已有同步偏好访问不需要额外存储库；不为统一接口引入会隐藏后端或生命周期变化的透明 fallback。IndexedDB 是默认采用 Dexie 的场景；只有确需更薄的原生 Promise 封装且不需要 Dexie 查询/迁移能力时，才评估 `idb` 并记录具体理由。

- 现有语言、外观、分页键和 payload 保持不变；所有存储读入仍是未知数据，领域边界负责版本/形状校验。浏览器拒绝访问、损坏内容与容量失败不能阻断非关键偏好交互；持久写入失败不得报告“已保存”。
- HTTP Token/continuation 默认仍只保存在 `data/api/client/` 的单个会话闭包，不因为归类到数据层而复制到通用 Memory 仓库，更不能写入 Cookie、LocalStorage、SessionStorage 或 IndexedDB。真实 HttpOnly Cookie 认证属于另行确认的服务端认证契约，不是把当前 Token 持久化。
- Dexie 依赖只在真实 IndexedDB 消费者出现时声明并固定 lockfile；初始化不生成空表、离线队列、Cookie 策略或占位 repository。迁移需覆盖升级失败/事务回滚、blocked/versionchange、多连接与数据 scope 清理；本地结构化数据不自动成为服务器 Query 缓存的第二权威。
- Extension service worker 没有 Window/DOM，不能使用 Web Storage 或 `document.cookie`；IndexedDB/Memory 的可用性和生命周期按实际上下文核对。跨上下文或浏览器同步使用受控 `chrome.storage`/消息 adapter，权限和 Chrome/Firefox 差异仍需对应评审，统一目录不授予权限。

### 1.3.1 Web 身份认证凭据持久化例外

仅 `projectType=web` 且已明确选择身份认证及 LocalStorage 凭据方案时，按已确认需求将服务端会话凭据写入 LocalStorage。由认证 feature 经 `src/data/storage/` 维护版本化、项目/服务/环境隔离的必要记录，并恢复到受管 client；默认基础 client、未选择持久化方案的 Web 和 Extension 不启用此行为，continuation 始终只留内存。此段是上文 Token 默认禁持久化规则的限定例外。

使用 [身份认证知识库](../.agents/skills/web-compose-capabilities/knowledge/identity.md) 的会话合同。唯一所有者负责写入/删除失败、轮换、跨标签页和恢复。用户/权限不持久化；密码、验证码和 continuation 不写入记录。普通业务 403 保留会话；凭据校验错误与无响应网络失败分别按已确认策略处理。仅实际选择并装配此方案时生效，初始化和模板分发不授予持久化能力。

已采用的 Mock 会话如需跨刷新恢复，只按此例外与认证会话合同保存最小演示引用，不保存原始 TokenPair，并说明服务重置后的恢复边界；这不授予真实凭据或额外持久化权限，不能凭演示引用重建用户或权限。

## 2. 共同边界与统一分页

- TanStack Query 负责有明确完成时刻的远端服务器状态、缓存、失效和瞬态重试；HTTP client 只负责传输、请求上下文、认证交接、协议错误与取消，不把同一份服务器数据复制进 Jotai、sessionStorage 或分页 hook。
- RxJS 只编排瞬时事件和来源生命周期，不成为服务器缓存、客户端状态库、持久事件日志或 Chrome 跨上下文传输层。当前状态仍分别归 TanStack Query、Jotai 或局部 React 状态所有。
- 默认 API base URL 与请求超时来自冻结的 `APP_CONFIG.apiBaseUrl` 和 `APP_CONFIG.requestTimeoutMs`；业务代码只能通过类型化的 service/feature 边界发起请求，不能直接读环境变量，也不能从用户输入、远端配置或任意字符串选择完整 URL。多基地址在 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 的基础上使用受控 target 联合类型和只读 registry。
- Token、Cookie、continuation、API 错误体、GraphQL 响应和 SSE 事件都属于边界数据。进入业务状态前校验未知响应；只通过统一 logger 记录 [`LOGGING.md`](LOGGING.md) 允许的状态、耗时、稳定错误码与清理后路径，不记录 header、body、Token、continuation、variables 或原始事件载荷。
- 将 `AbortSignal` 从 TanStack Query 或组件生命周期传到底层传输；页面卸载、参数变化或显式取消后，不继续更新失效 UI。
- Web 在真实 endpoint 落地前确认 CORS、credentials、CSP、BaseURL 与部署环境变量；浏览器环境变量不是秘密存储。Extension 的公开 BaseURL 也不会自动获得跨域权限。
- Extension 对每个跨域服务只申请真实使用的最小 `host_permissions`，并覆盖未授权/被撤销路径。本知识基线本身不新增任何 `permissions`、`host_permissions`、background 或 content script。

### 2.1 状态的单一所有者

- 每项可恢复状态先选择一个权威所有者：组件私有交互使用 React 局部状态；确需跨组件共享的纯客户端状态使用 Jotai；远端结果使用 TanStack Query。不得把同一筛选、页码、实体或异步结果同时写入 URL、sessionStorage、Jotai 与 Query 再靠 effect 同步。
- Web 中需要分享、书签、前进/后退或刷新恢复的筛选、排序和页码使用经过运行时校验的 TanStack Router search；只在当前标签页会恢复、且不需要 URL 语义的状态才使用 sessionStorage。除下一条的封闭启动恢复外，路由 search 与 sessionStorage 不能同时拥有同一字段。
- `projectType=web` 的重复记录列表只有一个封闭例外：Router search 始终是已应用搜索、筛选、排序、`page` 和 `pageSize` 的运行时 owner。原始 URL 包含任一当前列表 owned key 时只采用其合法值并以默认值补齐，不混入旧会话；完全没有 owned key 时才按稳定 `listId` 从 sessionStorage 读取一次启动快照。首次 Query 前以一次 `replace` 写入 canonical search 并保留无关 query；此后只由 Router 驱动，sessionStorage 最多单向记录已应用快照，不是第二个可写权威或 effect 双向同步对象。
- Extension 的 Popup/Options 局部短会话状态留在组件；需要跨重新打开或跨执行上下文恢复时，使用类型化 `chrome.storage` 与消息契约并先评审数据、权限和失效策略。Jotai/React 内存不能冒充 Popup、Options、content script 或 service worker 之间的共享存储。
- 派生值在读取时计算，不保存为可漂移副本。状态所有权变化必须覆盖刷新、卸载/重挂载、浏览器导航或 Extension 上下文销毁中实际适用的边界测试。

### 2.2 规范化分页结构

所有真实集合页在 feature/service 边界统一使用以下语义：

- `page` 从 1 开始，必须是正整数；组件是受控组件，不能同时维护第二份隐式页码。
- `pageSize` 是每页数据量，必须来自受控正整数候选集合；生成基线固定为 `10|20|50|100`，初始状态是 `{ page: 1, pageSize: 20 }`。更改 `pageSize` 同时把 `page` 重置为 1。
- 业务 service 把 cursor、offset、`current`、`size`、`records` 等外部协议映射为 `{ items, total }`；`items` 是当前页已校验项目，`total` 是非负安全整数。外部字段不得直接扩散到通用分页组件。
- TanStack Query key 必须包含会影响结果的稳定 scope、`page`、`pageSize`、target 和语言；列表数据、`total`、loading/error 与 placeholder 状态仍只由 Query/feature 拥有。

### 2.3 sessionStorage 与 scope

- `src/pagination/` 使用 `<project-id>:pagination:v1:<encodeURIComponent(scope)>` 作为 Storage key。同一页面的多个集合必须使用不同稳定 scope；scope 不得包含 Token、个人信息、任意用户输入或会无限增长的值。
- sessionStorage 只保存 `{ version: 1, page, pageSize }`。不得保存 `items`、`total`、错误、响应、筛选敏感值或任何认证信息。
- 读取时校验对象形状、版本、正整数和允许的 `pageSize`；缺失、损坏、版本不符、容量/安全异常或浏览器拒绝 Storage 时回退声明的初始值，不能阻断渲染。写入失败同样只退化为当前内存状态。
- Web 的 sessionStorage 只承诺当前浏览器标签页会话。Extension 的 Popup、Options、content script 与 service worker 是独立执行上下文；普通 sessionStorage 不提供跨上下文共享，Popup 销毁或 service worker 回收后也不得宣称状态仍存在。需要跨上下文或持久分页状态时必须另行设计类型化消息/Storage，并评审数据与权限边界。

### 2.4 成功空页回退状态机

从非第一页回到第一页只能由一次与**当前**分页状态完全对应的成功结果触发，并同时满足：

1. 请求记录的 `page`/`pageSize` 与此刻受控状态完全相同，避免迟到旧响应改变新页面。
2. Query/请求状态明确为 success，当前既非 fetching、非 loading，也非 placeholder。
3. 已校验的 `items` 为空且当前 `page > 1`。

满足后只执行一次 `page = 1` 转移并持久化新状态，由 Query key 变化发起第一页请求。loading、error、取消、placeholder、旧 `page`/`pageSize` 响应、第一页空态和成功非空页都保持当前位置；不得仅根据缺失数据、`total` 变化或渲染时的暂时空数组猜测回退。

### 2.5 React Web 路由列表契约

- 列表实现复用 `src/pagination/` 的 1-based `page`、`10|20|50|100` 受控 `pageSize`、safe-integer 校验与受控组件；Router adapter 在该页拥有页码时，不再挂载 `useSessionPagination` 作为第二份可变状态。外部 cursor/offset 仍只在 endpoint adapter 映射，不建立页面私有分页标准。
- 每个列表声明稳定 `listId`、业务 id 类型、默认确定性排序与允许排序字段；同值记录由服务端追加稳定业务 id tie-breaker。搜索、筛选、排序或 `pageSize` 变化与 `page=1` 原子提交。
- 业务行、`total`、错误、loading 与 placeholder 只属于 TanStack Query/feature，不写入 Router、Jotai 或 Storage。Query key 至少包含 `listId`、非 PII scope、规范化筛选、sort、`pageSize`、`page` 和影响结果的语言/target。
- 只在成功、非 fetching、非 placeholder 且响应通过 items/total/业务 id 一致性校验后纠正越界页：非零总页数使用 `replace` 转到末页，零结果规范为第 1 页。这是对 §2.4 通用空页回首页的 Web 路由列表特化，不改写通用 `useSessionPagination` 行为。
- 本节仅用于 React Web，并由 `$web-implement-list-view` 编排。Extension Popup/Options 虽有各自的 Router，但不复用该启动恢复；它们按 Extension 执行上下文、类型化消息和 Storage 边界单独实现。

### 2.6 Query 重试、mutation 与缓存生命周期

初始化 QueryClient 已接入安全错误反馈，读取仅对可重试 `ApiError` 最多重试两次，mutation 默认不重试。真实请求使用 `requestHttpQuery(path, { signal })`，把中间尝试交给 Query，只有最终失败进入 QueryCache/MutationCache 反馈；直接调用使用 `applicationHttp.request`。feature 仍必须确认读取可安全重复，并显式确定以下策略：

- Query 使用有界重试并尊重 `ApiError.retryable`；取消、401/403、输入校验和不可恢复的协议错误不自动重试。网络失败、超时、429 或 5xx 也只有在操作可安全重复时才能重试。client、Query、Router loader 与未来 adapter 只有一个自动重试所有者，禁止次数相乘。
- mutation 默认不自动重试。服务端幂等协议或可证明的幂等操作出现后，才明确重试上限和业务幂等键；按钮防重、串行队列和取消请求都不能代替服务端幂等，也不证明已经撤销写入。
- 查询 `staleTime`、`gcTime`、窗口聚焦刷新和断网恢复根据真实数据的时效及读取成本声明在 feature；初始化不设一个万能缓存寿命，也不预装持久化 Query cache 或离线写入队列。
- mutation 成功后，根据已校验返回值更新精确 Query key，或失效受影响的详情、列表和统计；禁止无理由清空全部缓存。需要等待刷新才能完成当前动作时，返回或等待失效 Promise；服务端写入成功但后续读取失败必须分别反馈，不能诱导用户再次提交。
- 乐观更新只在真实交互需要时开启：取消冲突查询、保存可回滚快照、受控更新、失败恢复并最终对账；并发 mutation 不能用旧快照覆盖后来已经成功的修改。
- 认证会话或数据 scope 改变时，先取消相关请求，再移除属于旧 scope 的私有缓存；key 不包含 Token。迟到响应不能回填新 scope，新的凭据与 Query 会话隔离由真实认证 feature 共同完成。
- Router loader 若准备远端数据，复用 feature 的 Query options 与同一 QueryClient，按 §2.7 的新鲜度语义读取；组件订阅该缓存，不在 Router/Jotai 建立第二份服务器数据。Query 的取消 signal 传到受管 client。

首次真实读写功能的非空测试覆盖适用的成功、不可重试失败、重试上限、取消、提交防重、精确缓存更新/失效；启用乐观更新或认证 scope 时，额外验证回滚、并发与迟到响应。表单交互由 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) §5.2 定义；这些规则不生成业务 endpoint 或占位表单。

### 2.7 请求前缓存统一由 TanStack Query 处理

React 项目使用已声明的 `@tanstack/react-query`。REST 读取与 GraphQL 有限查询的应用缓存命中、同 key 在途读取去重、新鲜度判断和失效刷新，统一由当前执行上下文的 QueryClient 处理；Ky、`applicationHttp` 和协议 adapter 不再建立 Map、Storage 或其他请求结果缓存。请求链为：feature Query options → QueryClient 检查缓存 → 缺失/过期时调用领域 API → Ky 传输 → 解析与校验 → Query 缓存领域数据。

- feature 用 `queryOptions` 集中声明 `queryKey`、`queryFn` 和 `staleTime`；组件 `useQuery` / `useSuspenseQuery`、loader 与命令式读取复用这组 options 和同一 QueryClient。Web 从 `app/queryClient.ts` 导入，Extension 从 `providers.tsx` 导入，不能在页面、hook 或 loader 中另建实例。
- 当前固定版本的命令式入口为 `queryClient.query(options)`：未失效且处于 `staleTime` 内时返回缓存，缺失或过期时等待请求。同 key 的在途有限读取共享请求；mutation 不具有这种缓存命中或自动提交防重语义。
- 默认 `staleTime: 0` 表示结果立即过期，不等于关闭缓存；`gcTime` 只决定无 observer 后保留多久，不能充当新鲜度。按领域确定时效，不能为展示命中而给所有请求统一长 TTL。显式 `refetch`、轮询或失效仍按各自语义执行。
- 既有 `fetchQuery` 仍可兼容相同的新鲜度读取，但当前固定版本已标记弃用。`ensureQueryData` 默认有缓存就返回，即使已过期；`revalidateIfStale: true` 只在后台刷新。只有明确允许旧值优先时才采用该语义，不能将其当作等待最新数据的门禁。
- 预取复用同组 options 与同一实例，当前版本可提前调用 `queryClient.query(options)` 并处理 Promise；组件随后消费同一缓存。现有 QueryCache 仍反馈最终失败，吞掉 Promise 不会关闭全局反馈；需要无提示的可选预取时，先定义并验证其与实际读取的错误归属。Router 预加载应让 Query 决定新鲜度，例如对应路由设置 `staleTime: 0`、`preloadStaleTime: 0`，loader 不返回远端结果副本。
- Query 缓存解析、运行时校验后的领域结果；不缓存 `Response`、Stream 或可消耗的 body。key 覆盖 target、操作/数据形状、参数、语言与非敏感会话 scope，不放 Token。REST 与 GraphQL 只有形状和语义都一致才共用 key；同一 QueryClient 不等于不同操作强行共用 key。
- REST 写操作使用 mutation，成功后精确更新/失效读取缓存；GraphQL Subscription 连接由 feature 管理，校验事件后投影到这份缓存。LocalStorage 偏好、SessionStorage 恢复和 Dexie 本地领域数据仍按 §1.3 访问，不自动变成 Query 结果的持久副本；浏览器 HTTP 缓存仍遵守 §3.4。
- Extension 每个 Popup、Options、content script 或 Worker 执行上下文拥有独立内存和生命周期；统一缓存策略不承诺跨上下文共享、重开 Popup 或 Worker 回收后恢复。跨上下文需求按真实消息/Storage 合同另行设计。

生成回归在两种宿主的实际 QueryClient 与 Ky 上证明：fresh 命中不再传输、同 key 并发去重、组件复用预先读取的领域数据、过期/失效后重新读取，以及语言/scope 隔离。真实业务继续按 §2.6 覆盖 mutation 与订阅投影。

## 3. HTTP、认证与 REST/OpenAPI

[`API.md`](API.md) 完整收录可选的基础服务契约与数据模型，当前整体保留，后续按实际需求拆解。其 Bearer 鉴权、请求追踪、响应 envelope 与 GraphQL 语义须按该文档的适配边界另行确认；文档收录不表示现有 client 已接通，也不替换本文的默认工程规则。

### 3.1 生成的 Ky HTTP 基础

两种宿主都生成 `src/data/api/client/` 的类型化 Ky HTTP client、错误分类、本地化界面和非空测试。`applicationHttp` 是当前执行上下文的惰性会话 owner；静态页面可在 BaseURL 留空时启动，首次真实操作才校验配置。真实 feature 与 Router loader 复用该实例；测试或受控 adapter 才按需使用 factory。当前基线只接受 `APP_CONFIG.apiBaseUrl` 边界内的相对路径，并拒绝绝对 URL、越界路径和 redirect；它使用 `APP_CONFIG.requestTimeoutMs`、调用方 `AbortSignal`、统一请求上下文和 `ApiError`，但不声明任何真实路径、Schema、登录地址、Cookie 策略或业务 service。未来确有多 target 时，由真实域 adapter 和初始化即校验的只读 registry 扩展，不能让页面绕过边界。React route/组件不能直接调用任意 URL，也不能依赖传输实现细节。

#### 未配置远端地址时的能力分工

未配置远端地址时，只有依赖该远端 API 的操作使用 Mock；本地能力直接真实实现，不要求 BaseURL。先按操作识别真实依赖，不能把整个功能或所有数据一律归为远端服务：

- 远端 API：当前环境的对应服务 BaseURL 未配置时，由 `src/data/api/<domain>/` 中的类型化异步 API 函数提供 Mock。Mock 数据、读取、写入及必要的筛选、排序和分页语义集中在 API 层；React 组件、route、feature hook 和 Query 只消费这些函数，不内嵌业务样例数据或各自建立 Mock 分支。Query 继续拥有远端异步服务结果与缓存，Jotai、Storage 和 UI 不成为第二份服务数据源。
- 本地能力：计算、转换、浏览器存储与本地数据操作按真实需求直接实现。纯业务逻辑留在对应 feature，存储访问通过 `src/data/storage/`，真实读取、写入、校验与失败处理不能替换为 Mock；不为本地操作包装假 HTTP 请求、等待远端配置或创建占位 endpoint。
- 混合流程：本地部分照常执行，仅隔离缺少地址的远端 API 边界。一个远端服务未配置，不影响独立的本地能力或已配置的其他服务；Mock 结果不能冒充真实远端响应或本地已保存数据。

Mock 应覆盖当前远端 API 契约的完整可观察行为，不能用恒定成功、空函数或不可达占位代替实现；按当前需求提供确定性数据和必要的状态变更，不预建通用 Mock 框架。Mock API 不调用 HTTP client、不触发 Fetch、不猜测地址，也不把模拟凭据、continuation 或调用结果当成真实会话及网络成功证据。初始化只提供中性工程；显式账户工作区组合模板含标注的认证域 Mock，固定账户、组织与权限仅用于该示例。没有产品功能时不制造业务 Mock 或假 endpoint。真实 HTTP client 保持空地址时在 Fetch 前拒绝的边界，Release 的非空 HTTPS 地址门禁继续遵循运行配置规则。

当前功能已采用可信服务协议，且依赖 Header、原始封装、错误码或 DTO 映射时，产品 Mock 也经过对应的请求序列化、内存 exchange、原始响应边界校验与领域投影，复用 API 模块的解析器；不能直接返回领域对象后声称协议适配已覆盖。测试在可注入的 exchange 边界观察请求与响应，证明公开操作隔离、适用报文及最高风险错误分支，同时断言零网络调用。只模拟本次采用的操作和协议支持面，不复制完整服务器或自建通用解析框架；来源 Schema、协议合同与当前 Mock 的实际支持范围分别说明。

有状态 Mock 明确服务实例、客户端适配器与状态重置/跨刷新生命周期；多个客户端或协议模拟同一服务时显式共享一个服务状态，独立测试默认使用隔离实例。时效、重发、限流和并发提交用注入时钟及可控制的异步边界验证，不以真实等待或两份独立服务态证明共享行为。认证协议确需模拟 TokenPair 时，仅在内存模拟服务中签发可识别的演示值；不注入真实 HTTP client、不联网或记录到日志，也不持久化原始 TokenPair。

#### 用户要求真实联网后的迁移

已初始化下游通过 `$web-connect-http-service` 执行本节工作流；实施与列表 Skill 按真实接入事件委托，数据契约仍以本文件为唯一来源。

1. 用户明确提出真实联网时，先复用有效配置，再按 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 逐项补问本次操作依赖的环境与服务 BaseURL；不要求一次补齐全部环境或服务。初始化、本地能力开发或普通 Mock 开发不提前询问这些地址。具体产品地址只在已初始化下游收集。
2. 确认当前功能需要的 endpoint 路径、方法、输入/响应与认证契约；缺失时询问，不从 BaseURL 猜测接口。校验配置后，把对应 API 函数的 Mock 实现替换为真实 HTTP 请求，复用 `applicationHttp` / `requestHttpQuery`、受控 target、取消、错误与认证边界。UI 和 Query 保持相同的领域契约，外部响应与分页字段在 API 层校验、映射。
3. 按环境和远端服务逐项完成迁移；尚未配置的远端 API 继续通过其 API Mock 提供数据，明确报告剩余范围。本地实现继续真实运行，不纳入 Mock 迁移。已接入服务移除运行路径中的 Mock 分支和业务 fixture；网络、超时、401/403、协议或服务端错误正常进入统一失败反馈，禁止失败后自动回落 Mock。测试专用 fixture 继续隔离在测试中。
4. 配置变更按冻结 `APP_CONFIG` 的加载方式重新启动；切换时取消相关旧请求并清理对应 Mock Query 缓存，避免样例数据残留或迟到响应覆盖真实结果。测试至少证明 Mock 路径零网络调用、真实请求成功及最高风险失败不回落 Mock；真实服务、CORS、权限或浏览器未验证时如实报告，不把 Mock 测试写成联网通过。

取消与超时覆盖 Fetch、异步 credential extractor 及 401 handler 等待阶段。即使 adapter 不响应 AbortSignal 或 extractor 挂起，外层 request 也必须及时以首次终止原因拒绝，清理计时器与监听器；迟到的成功或失败均不更新 Token/continuation。它不能强制停止任意自定义提取器内部副作用，提取器仍应只负责读取并返回结果。

模块职责保持明确：

- 请求拦截：受控相对路径、标准 Header 编码、动态语言与当前会话；移除调用方伪造的三个标准 header。非法 header 归一为不可重试的 `invalid_request_headers`，不发送网络请求。
- 响应拦截：校验实际响应边界，只有可信 2xx 自动提取并原子提交 continuation/Token，先校验两项再更新状态；保留原始 Response/body。
- 错误拦截：统一 `ApiError`、401 single-flight 与安全日志；`interceptors.onError` 只同步投影客户端反馈，不接管认证、重放或异步副作用。观察器抛错/误传异步拒绝只记录 `http.error_interceptor_failed`，不延长请求或替换原错误。
- 请求上下文与会话：语言、continuation、Token、单调 dispatch sequence 和 Token revision；不依赖 React route。
- `UnauthorizedHandler`：运行时默认呈现认证失效；真实登录存在后，组合层通过 `configureUnauthorizedHandler` 注入受控导航。client 不导入 Router、`window.location` 或 Chrome 导航 API。
- UI 组合层：`httpErrors` 只输出固定本地化键、分类和恢复能力，`HttpErrorView` 处理局部/路由失败，根 Provider 的 `HttpFeedback` 处理直接请求和最终 Query/mutation 失败。
- API 领域模块：拥有类型化远端数据函数、未配置对应 BaseURL 时的远端 API Mock，以及接入后的路径、方法、输入/输出校验、外部分页映射和业务语义；feature 只消费该边界。本地业务逻辑与真实存储访问按前述分工实现，不伪装成未接入的远端 API。

### 3.2 现有基础 client 的三个请求头与语言

每次真正 dispatch 时动态读取上下文，只有值通过校验且非空时才设置 header：

| 请求头           | 请求值来源                                     | 成功响应处理                                                                                                        | 存储边界                                                                          |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `X-Http-Request` | 当前内存中的服务端 continuation/correlation 值 | 只从同一受控 API 边界的 2xx 响应提取并供后续请求携带；它不是客户端生成或复用的每请求唯一 request-id                 | 当前执行上下文内存；不写 Storage、环境或默认日志                                  |
| `X-Lang`         | 每次 dispatch 动态读取的规范化当前语言         | 不以任意响应值静默改写用户偏好；若响应内容随语言变化，Query key 必须包含语言                                        | 项目命名空间 localStorage，只保存支持的语言标识                                   |
| `X-AUTH-TOKEN`   | 当前 Token revision 的内存值                   | 默认从同名 header 提取；真实协议可注入异步 `extractAuthToken(response.clone())`，但必须保留相同信任、并发和存储规则 | 当前执行上下文内存；默认禁止 local/sessionStorage 与 env，Web 身份认证例外见 §1.3 |

语言偏好以 `<project-id>:language:v1` 保存当前支持的 `en|zh`。读取顺序是：项目命名空间下可识别的 localStorage 值、规范化浏览器语言、回退为英文。非法/未知语言、Storage 异常或浏览器拒绝访问时回退且不阻断应用；i18next 的真实语言变化同步更新该偏好，下一次请求才读取新值。不得把语言存储与认证 Token 混在同一个对象中。

client 会先移除调用方伪造的三个标准 header，再根据当前受控状态写入。自动更新只来自同一受控 API 边界的 2xx 响应；真实认证协议确认登录成功后也可调用 `applicationHttp.setAuthToken(token)` 显式建立会话。每次 dispatch 分配单调 sequence，并让 Token 更新/显式登录产生新的 revision；迟到的旧响应不得覆盖较新值，迟到的旧 401 也不得清理新 revision。响应 header 与自定义 Token 提取结果按不可信有界字符串校验，并验证浏览器 Headers 编码；不把 `Response`、body 或全量 headers 保存进状态。

显式 setter 要求非空、有界、无控制字符且可编码的字符串；非法输入在改变状态前拒绝，不泄漏值或原始编码异常。合法 setter 清理旧 continuation、提高 revision/sequence 门槛并重置认证失效 latch，下一请求自动携带新 Token。登录响应若在 body，先按真实 Schema 校验，再调用 setter；或由只读 `extractAuthToken(response.clone())` 返回已校验值。提取器不得消费原始 body、写 Storage、导航或自行修改会话。登出调用 `clearSession()`；真实认证 feature 同时取消旧 scope 请求并移除其私有 Query cache，不能只清 Token 而保留旧用户数据。

### 3.2.1 已选服务的通用 HTTP 合同

调用和文档先分清请求 Header、请求业务参数、响应 Header 与响应 JSON。`docs/API.md` 中基础服务的合同按下表采用；Header 名大小写不敏感，文档统一使用下列拼写，不另造 `RequestID`、`X-LANG` 等业务字段。

| 信息     | 请求位置                                                              | 响应位置及处理                                                                              |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 语言     | `X-Lang: en/zh`；客户端每次按当前语言设置                             | `Content-Language` 与 `Vary` 属于响应 Header；不改写语言偏好                                |
| 单次追踪 | 每次 dispatch 新建 `X-Request-Id`，只放请求 Header                    | 同名响应 Header 回显；REST 成功/错误 JSON 保留 `request_id`，与本次请求关联                 |
| 访问凭据 | 仅受保护请求使用 `Authorization: Bearer <access_token>`               | 登录/刷新结果仍从 JSON `data.token` 读取并校验 TokenPair，不假定响应有 Authorization Header |
| 内容类型 | 有 JSON 请求体时设置 `Content-Type: application/json`；无体不机械添加 | 响应 Content-Type 按实际内容类型；纯文本探针不伪造 JSON                                     |

采用这套服务时，语言、请求追踪与访问鉴权通过 Header 携带，不重复序列化到业务 body、路径或 query。服务允许 X-Lang、X-Request-Id 省略并自行回退/生成，不代表客户端不发送；服务原有 Accept-Language 或 query 语言回退保持来源事实。公开登录、注册、验证码、找回和匿名刷新隔离旧访问凭据及受保护会话的 401 副作用。刷新操作的 `refresh_token` 按合同在请求 JSON 中提交，不与访问鉴权混淆；本规则不自动启用刷新或重放。

基础 client 的 §3.2 仍是现有 X-AUTH-TOKEN / X-Http-Request 协议。接入 Bearer 服务须实施明确的服务专用请求适配和公开请求隔离，不能只设置 BaseURL、换 Token extractor 或把 continuation 重命名为 RequestID。单次 RequestID 不持久化、不复用于后续请求、不作为幂等键、会话版本或权限证据；迟到响应不能污染当前追踪或会话。

以下 envelope、JSON request_id、异常与分页仅适用于已选基础服务的 REST JSON 合同；GraphQL 沿用自身 data/errors[] 与 extensions.code，不额外注入这些字段。统一 REST 响应按原始模型记录：单对象 `{model,data,request_id}`、HTTP 200 的 `{model:"empty",request_id}`、数据集 `data.set` 和分页 `grid.result`。分页保留 `page:{model,current,size,total,total_page}` 与 `result:{model,datas,total}`，两处 total 一致；请求 current 从 1 开始、size 默认 10 上限 200、order 默认 desc、order_by 按模型白名单。域 API 显式映射内部 page/pageSize/items/total，内部默认 20 不静默改成服务默认 10。尚无列表 endpoint 时仍记录固定模型，不伪造列表功能。

错误 JSON 保留 `model:"errors"`、`errors:{model:"data.set",datas:[{model:"error",code,message}],total}` 与 request_id；按首项稳定 code 和 HTTP 状态处理，不匹配多语言 message。404/405、参数校验与限流同样采用服务错误封装；通用 client 的 ApiError 与服务原始错误分开描述。字符串 ID 不转换为 Number，Unix 秒与 expires_in/resend_after 持续时间分开，可空值与字段缺省分开校验。业务模型、错误码、限流阈值和认证生命周期以实际采用合同为准，不把这套 envelope 强加给其他服务。

### 3.3 `ApiError`、401/403 与 Router/UI

HTTP、timeout、网络、取消和响应校验失败统一为 `ApiError`，保留稳定 kind、code、status、retryable；UI 不展示远端正文、Error message、stack 或 cause，也不依赖 Ky 的错误类。

| 失败                          | 会话和重试                                                                          | 用户反馈                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 401 `authentication_required` | 当前 revision 清 Token/continuation，同一失效周期只触发一次认证 handler；不普通重试 | 默认显示重新认证状态，只有真实入口存在才配置导航或认证按钮        |
| 403 `access_forbidden`        | 保留 Token/continuation；不触发登录、refresh 或普通重试                             | 专用权限不足状态，可返回真实首页或批准的申请权限入口              |
| 400/404、非法输入或协议       | 不自动重试，不改变认证                                                              | 固定操作失败提示；业务字段校验仍由真实 feature 负责               |
| network/timeout/429/5xx       | 仅可安全重复的读取由 Query 有界重试，写入不自动重放                                 | 最终失败持续提示；超时/断网写入先确认服务端结果，不能诱导重复提交 |
| aborted、过期会话 401         | 不自动重试或全局播报，不清理新会话                                                  | 取消保持安静；需要恢复的局部旧会话界面可提供当前会话的重新加载    |

401 handler 共用一个 in-flight Promise。同一失效周期的后续 401 保留稳定失效 revision；即使期间取得匿名 continuation，再次 401 仍清理它。新的显式 Token 或可信 2xx Token 开始新周期；旧响应和旧 handler 结束均不能影响新会话。handler 失败或挂起在请求截止时间结束后仍向调用方保留原始 401，只记安全日志。`UnauthorizedContext.signal` 与 `isCurrentSession()` 必须在每次异步导航、清理或其他副作用前复核，停止迟到操作；框架不能强行终止任意 adapter 内部副作用。

真实登录 route 已存在时，Web app/route 或 Extension 当前入口调用 `configureUnauthorizedHandler(createLoginUnauthorizedHandler({ loginUrl, navigate }))`，使用类型化 Router adapter 与同源受控目标。受保护 route 在 `beforeLoad`/loader 中复用真实认证 feature，并保留批准的 return target；不虚构 `/login`、后台入口或 Chrome 导航。Popup/Options 的内存会话与 single-flight 各自独立；跨上下文共享必须另行明确消息/Storage owner 并进入权限和隐私评审。

`requestHttpQuery` 强制 `{ feedback: "owner" }`，由 Query 管中间尝试、取消和最终失败。局部或 route 拥有反馈时也用该选项；直接请求默认全局反馈，恢复成功后消费方用 `clearHttpFeedback(previousError)` 精确移除此前失败，或由用户关闭提示。不能在任意成功请求后清空别处的并发错误。根 Provider 只挂载一个持续 Mantine Alert，保留已有内容；同语义重复失败不重复播报，最新失败拥有清理权。局部 `HttpErrorView` 挂载时只清理它接管的同一错误，Jotai 仅保存固定展示投影，原对象用弱引用关联，原始异常、服务器状态与 Token 不进入 atom。

Web 路由 fallback 与 Extension 两入口 Router 使用相同错误分类；401/403 没有普通重试或虚构登录按钮，回首页使用 Link 语义。允许恢复的读取以 `router.invalidate({ sync: true })` 配合 Query boundary reset，并防止重复点击；背景刷新失败保留旧内容，不用全局 `throwOnError` 卸载已成功页面。mutation 失败不自动导航或清空输入。日志只记录稳定状态、耗时、code/reason/retryable，不记录 header/body/Token/continuation 或完整 URL。

refresh、Cookie/credentials、自动重放与幂等协议由真实产品另行设计，必须只有一个重试/重放 owner，并覆盖 refresh 自身 401、并发、次数上限和写入安全。

### 3.4 CORS、缓存与 Extension 权限

- CORS 按实际采用协议配置。采用 §3.2.1 的基础服务时，Allow-Headers 覆盖 Authorization、X-Lang、X-Request-Id 及有 JSON 体时的 Content-Type；需要读取追踪/语言响应头时显式 Expose-Headers。按真实语言协商设置 Vary，认证响应遵循 private/no-store；不把响应头序列化进业务 JSON。下列 X-AUTH-TOKEN/continuation 条目仅适用于 §3.2 的现有 client 协议。

- 跨域 Web 服务若接收三个自定义请求 header，预检必须按批准 origin/method 返回覆盖 `X-Http-Request, X-Lang, X-AUTH-TOKEN` 的 `Access-Control-Allow-Headers`；返回 continuation 或 Token 时还必须用 `Access-Control-Expose-Headers` 暴露实际需要读取的 `X-Http-Request, X-AUTH-TOKEN`。使用 credentials 时不得把 `Access-Control-Allow-Origin` 写成 `*`。
- 动态反射 origin 的响应包含 `Vary: Origin`；按语言生成不同表示的响应包含 `Vary: X-Lang`。认证响应默认使用 `Cache-Control: private, no-store`；若真实架构明确允许缓存依赖 Token 的表示，必须单独评审缓存键，并至少按 `X-AUTH-TOKEN` 区分，不能让共享缓存混用用户响应。缓存预检响应时还必须按 `Origin, Access-Control-Request-Method, Access-Control-Request-Headers` 区分。
- Extension 的跨域访问按执行上下文和目标区分：Chrome MV3 扩展页面/service worker 使用精确最小 `host_permissions`；Firefox MV2 后台页/扩展页的 host patterns 由 Plasmo 转到 `permissions`。content script 的 Fetch 权限与执行隔离在 Chrome MV3 和 Firefox MV2 存在差异，不能把 Chrome 的页面 CORS 行为或 Firefox MV2 的特权请求能力推为通用事实；按 [Mozilla content script 规则](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) 与 [Chrome 网络规则](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) 实测当前消费者。优先让类型化消息选择受控 endpoint/参数，禁止让 content script 传任意 URL。初始化 client 不自动授予任何 origin；真实消费者必须覆盖未授权/撤销、非法 sender/message 与上下文销毁，并在两个真实浏览器验证。仅为共享 Token 或 continuation 增加 Storage/background/消息同样需要架构与权限/隐私评审。

### 3.5 Ky 作为默认传输

Ky 基于 Fetch API，采用 MIT 许可证，无额外运行时依赖，作为 Web、Chrome MV3 与 Firefox MV2 的默认 HTTP 传输。生成 client 的 `requestWithKy` 返回原始 `Response`，关闭 `retry`、`timeout`、`totalTimeout` 与 `throwHttpErrors`：调用方/Query 决定重试，既有请求上下文统一维护截止时间、取消、header、Token、revision、401 与 `ApiError`，并覆盖异步 Token 提取。`RequestInit` 先转换为标准 `Request`，防止额外字段成为 Ky hooks、替代 fetch 或 URL override；`options.fetch` 保留受控自定义传输注入合同。页面继续调用域 service/client，不直接使用 Ky 绕过边界。

Ky 使用浏览器 Fetch，不改变 CORS、Extension 权限或后台生命周期。Chrome MV3 service worker 与 Firefox MV2 后台页沿用相同客户端接口；content script 的跨域差异按 §3.4 处理。新增 hooks、JSON helper 或域实例必须复用请求上下文，不能建立任意绝对 URL 客户端，也不能再次引入认证或重试状态机。

### 3.6 OpenAPI 类型与 Ky adapter

当团队拥有可信且会随实现同步的 OpenAPI 3 Schema 时，使用 `openapi-typescript` 生成 `paths` 类型，在领域 adapter 中约束 method/path/params/body/response，网络继续走受管 Ky client。每个独立服务或不兼容版本拥有自己的 schema 输入、生成目录和 client registry 条目。已有 `openapi-fetch` 消费者可按实际收益保留，不为了新增 Schema 替换默认 Ky 传输。

- Schema 或 operation 变化后必须重新生成并运行 `pnpm typecheck`；生成目录不手工编辑。
- Token/continuation 获取、语言、并发 revision、401、错误归一化、取消和观测规则与生成的 HTTP 请求上下文相同，通过 `openapi-fetch` middleware 或清晰的外层 service 复用。
- Schema 只提供静态契约，不能证明运行时响应可信；对安全关键或外部服务响应仍用 §1 表中的 `zod`（或已有的等价校验结果）执行运行时校验。
- 不在同一端点外层叠加 Ky 和 openapi-fetch 多套 retry/error 语义；选定协议 adapter 时仍复用同一请求上下文。

### 3.7 Axios 例外

Axios 不是新项目默认值。只有现有业务已经依赖其 interceptors、adapter、取消/进度语义或第三方生态，并且迁移成本高于收益时保留；例外要记录具体消费者、无法由 Ky/Fetch 满足的已验证能力和退出条件，不能只以“团队熟悉”作为理由。

## 4. GraphQL

### 4.1 默认组合

默认使用 `graphql-request` 发起最小 GraphQL 请求，并使用 GraphQL Code Generator 的 `client` preset 生成 `TypedDocumentNode`/类型化文档；请求前缓存统一归 TanStack Query。运行时依赖通常包括 `graphql` 与 `graphql-request`，生成期依赖包括 `@graphql-codegen/cli` 和 `@graphql-codegen/client-preset`；只有首次真实 GraphQL 功能落地时才安装。

- GraphQL Query 在 feature 层交给 TanStack Query 管理查询、取消与失效；写操作默认走 REST。`queryFn` 将 `AbortSignal` 传到实际请求，不建立另一份全局 GraphQL 缓存；长期 Subscription 不放入永不完成的 `queryFn`。
- 为 `graphql-request` 注入受管 custom Fetch adapter。adapter 先将其 URL/Request 输入与当前编译期 target registry 核对，映射到生成 HTTP client 接受的相对路径，再复用三个 header、超时、Token revision、401 single-flight、错误归一化与日志脱敏。直接调用未受管的全局 `fetch` 会绕开这条边界。
- Codegen 文档提供静态类型；GraphQL `errors`、`data`、安全关键字段与外部响应仍需按真实 schema 和信任边界做运行时校验。

### 4.2 多 GraphQL 基地址

多基地址使用编译期可枚举的 target registry：

- 定义稳定的 `GraphqlTarget` 联合类型，例如账户域、目录域；registry 为每个 target 保存 endpoint、动态 headers/token provider 与对应生成文档边界。
- 业务调用传 target，不传任意 URL；registry 初始化时校验 URL，Extension 还要校验它与已批准的最小 `host_permissions` 一致。
- 每个不同 GraphQL schema 使用独立的 Codegen `generates` 输出目录。不能把 A schema 生成的 operation/type 发往 B endpoint。
- 同一 schema 的多个环境或副本可以复用生成类型，但运行时 target 仍必须显式，认证 headers 在每次请求时动态获取。
- TanStack Query 的 `queryKey` 至少包含 GraphQL target、operation 标识和影响结果的 variables、语言与非敏感 scope；否则不同服务或会话的相同 operation 会污染缓存。

### 4.3 “不需要缓存”的含义

- 真正不保留结果的一次性读取，只有 feature 明确声明此例外后才直接调用受管 `graphql-request` adapter，并管理 pending/error/result 生命周期；这条路径不承诺 Query 的缓存命中或去重，普通有限查询仍遵循 §2.7。
- 仍想复用 TanStack Query 的取消、错误状态或去重时，可以设置 `gcTime: 0` 并按业务设置 `staleTime`/`retry`；这只会在 query 失去最后一个 observer 后尽快回收，活跃 observer 仍会持有当前结果，不能宣称为绝对零缓存。
- GraphQL errors 与 HTTP/network errors 分开归一化；是否接受 partial data 必须显式决定，不能静默吞掉 `errors`。

### 4.4 何时选择 Apollo Client

Apollo 不属于当前统一缓存默认组合。只有真实需求证明 Query 无法满足的规范化实体缓存或 fragment/cache policy 能力，且用户明确批准改变统一缓存策略时才采用；记录消费者、所有权和退出条件。该例外下 Apollo 独占对应 GraphQL 数据的缓存，TanStack Query 继续管理 REST 或其他异步数据，不对同一 GraphQL operation 再包一层 Query 缓存，也不宣称全部请求缓存仍由 Query 统一。

### 4.5 Subscription 推送

- 先确认真实 Subscription schema、endpoint、认证握手、事件字段与版本/恢复契约。WebSocket 使用 `graphql-ws` 的 `graphql-transport-ws` 协议；服务端采用 GraphQL over SSE 时使用 `graphql-sse`。旧 `subscriptions-transport-ws` 的 `graphql-ws` 子协议与前者不同，不可混用，也不同时安装两个无消费者的 client。
- 浏览器 WebSocket 不能任意设置 HTTP headers；不得声称 Ky 的三个 header 拦截器会自动作用于握手。按服务端已批准协议将动态认证信息送入 `connectionParams`，或采用明确 Cookie 策略；不把 Token 放入 URL/日志，不擅自将 continuation 作为认证信息。
- 订阅 adapter 放在 `data/api/graphql/`，只暴露类型化事件和幂等 dispose/取消；feature hook/service 拥有启停、连接状态、重连上限、退避与 jitter。在卸载、target/scope 变更、登出、权限撤销和认证 revision 变化时关闭旧连接，拒绝旧会话迟到事件；重连与认证失败只有一个 owner，401/403 或确定性协议错误不能无限重试。
- 外部事件先做运行时校验，再按 eventId/实体版本拒绝重复与乱序。只有完整且可判定更新的事件才能 `setQueryData`，其他事件只失效精确 Query。初始快照与订阅之间的窗口通过服务端 cursor/sequence、缓冲对账或重取快照解决，不能假定连接后绝不漏事件。
- 两种 Extension 后台生命周期差异继续适用：不承诺 MV3 service worker 永久保持连接；跨 Popup/Options/后台的共享推送须先定义唯一连接所有者、消息与恢复策略。
- 首次真实接入测试成功推送、partial/error payload、取消与最后一个消费者退出、重复/乱序、断线恢复、认证轮换和晚到事件；WebSocket 或 SSE 必须验证与服务端协议匹配，Mock 订阅不证明真实推送可达。

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

### 6.3 Chrome MV3 / Firefox MV2 边界

Firefox MV2 使用后台 scripts/page，Chrome MV3 使用可回收 service worker。不要让公共实现依赖后台页永不销毁；对 API 支持、callback/Promise、消息异步响应、Port 断开和重启恢复逐个适配与测试。MV2 与 MV3 的权限/CSP/资源声明由 Plasmo 转换，业务能力仍由 Agent 对照两浏览器官方文档自行保证。

Observable 和 Subject 只存在于当前 JavaScript execution context。Popup、Options、content script 与 service worker 之间仍使用 `chrome.runtime`/tabs messaging 或 Port，再在每个上下文内适配为 Observable；RxJS 本身不能跨上下文，也不能让 service worker 常驻。

Service worker 的监听器必须按 Chrome 生命周期要求注册，进程内流、buffer 和全局变量在回收后均不可视为持久状态。唤醒后需要重建订阅，必要状态写入 `chrome.storage`、IndexedDB 或服务端。引入 RxJS 本身不得新增 Extension permission、host permission、后台入口或远程代码。

## 7. 落地与测试门禁

生成基础和首次真实集成都必须满足相应门禁：

1. 生成分页测试至少覆盖合法恢复、损坏/异常 Storage、版本与 scope 隔离、换页、`pageSize` 重置，以及 loading/error/placeholder/旧响应不回退、当前成功空页回第一页。
2. 生成 HTTP/语言测试至少覆盖动态 `X-Lang`、continuation/Token 后续携带、异步 Token extractor、同源 2xx 信任边界、乱序 response、迟到旧 401、新会话 latch reset、并发 401 单次 handler、handler 失败、timeout、取消、受控 URL 和安全日志。
3. 首次真实 endpoint 记录 target、认证方式、分页字段映射、数据所有者、取消/重试策略、真实登录入口，以及 Web CORS/CSP/cache 或 Extension 最小权限与执行上下文影响；不得把初始化配置冒充服务可达证据。
4. 只安装真实使用的可选依赖，检查维护状态、许可证、浏览器支持和 bundle 影响并固定 lockfile。Ky 默认传输及 openapi-fetch/Axios adapter 必须复用三个 header、revision、401、`ApiError` 与日志契约，并测试不会形成第二套重试/认证状态机。
5. Web 的真实跨域集成验证服务端 Allow/Expose/Vary/Cache-Control 与 credentials 配置；真实登录页存在后才测试导航。Extension 的真实网络或跨上下文认证必须覆盖权限拒绝、上下文销毁、消息 sender 校验和 service worker 重建，并把真实 Chrome/Firefox 验证列为硬要求。
6. 多 GraphQL target 至少覆盖正确路由、动态 headers、非法 target 拒绝、各 schema 的生成类型和包含 target/语言的 Query key。
7. SSE 至少覆盖消息校验、错误/重连决策、显式关闭，以及不会因重新挂载产生重复连接。
8. RxJS 首次接入至少覆盖有效/无效事件映射、单来源失败隔离、重试停止与取消、监听/连接数量和最后一个订阅退出后的 teardown。
9. 使用 `share` 或 replay 时覆盖共享底层订阅、error/complete/refCount reset、晚订阅结果、缓冲边界与清理；多来源更新还要覆盖重复、乱序和旧版本拒绝。
10. 事件投影至少证明 Query/Jotai 各自只有一个状态所有者；Extension 还要覆盖非法 sender/message、Port 断开、页面卸载和 service worker 重启后的重建。涉及后台行为或权限时进入完整候选验收并在真实 Chrome 和 Firefox 分别验证。
11. 日常变更按工程规则只运行本次受影响的相关非空测试或相称最小替代检查；本次确实改变环境或 Harness 结构合同时才运行对应 `pnpm env:validate` 或 `pnpm harness validate`，lint/typecheck 同样只按实际变化需要或明确请求追加。只有用户明确要求最终候选/完整验收，或产品、安全、权限、渠道存在真实候选硬要求时，才取得当次 E2E 选择并运行唯一 `pnpm build -- --e2e=enabled|disabled`；候选需验证 client 只读 `APP_CONFIG`、日志符合脱敏边界，且 Release 产物不包含开发/测试 BaseURL、Token/continuation fixture 或敏感数据。真实服务、CORS、登录导航、浏览器与权限场景未执行时写为 `Unverified`。

新增认证与反馈测试覆盖：显式 setter 非法输入及旧响应/旧 handler 竞态、403 保留会话、错误观察器故障、Query 中间失败后成功不残留提示、最终失败重试上限、mutation 不重放、同语义并发清理权、未知异常去重、双语言以及 Web/Extension Router 的分类与恢复。真实 endpoint、浏览器 CORS/权限和最终候选验证仍由各自事件触发。

## 8. 官方参考

- [Ky](https://github.com/sindresorhus/ky)
- [Dexie：IndexedDB 文档](https://dexie.org/docs/)
- [MDN：Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [js-cookie](https://github.com/js-cookie/js-cookie)
- [idb](https://github.com/jakearchibald/idb)
- [GraphQL 订阅](https://graphql.org/learn/subscriptions/)
- [graphql-ws](https://the-guild.dev/graphql/ws)
- [graphql-sse](https://the-guild.dev/graphql/sse)
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [graphql-request](https://github.com/graffle-js/graffle/tree/graphql-request)
- [GraphQL Code Generator 客户端预设](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client)
- [Apollo Client 缓存概览](https://www.apollographql.com/docs/react/caching/overview)
- [MDN：使用服务端发送事件](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [eventsource-client](https://github.com/rexxars/eventsource-client)
- [Fetch Event Source](https://github.com/Azure/fetch-event-source)
- [Chrome 扩展跨源网络请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome 扩展消息传递](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome 扩展 service worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [RxJS 概览](https://rxjs.dev/guide/overview)
- [RxJS `share`](https://rxjs.dev/api/operators/share)
- [TanStack Query 重要默认值](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack QueryClient：命令式缓存读取](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient)
- [TanStack Query options：共享查询定义](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- [TanStack Query query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- [TanStack Query bounded retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries)
- [TanStack Router external data loading and Query error reset](https://tanstack.com/router/latest/docs/guide/external-data-loading)
