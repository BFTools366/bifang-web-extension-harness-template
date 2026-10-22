# 基础 API 设计与数据模型参考契约

本文件完整收录账号、组织、验证码、令牌、系统接口、REST 与 GraphQL 的基础契约，供 Web 或 Extension 下游按实际需求采用。当前保持一份完整文档，后续再按真实消费者拆解；收录本身不生成服务端、TypeScript 域模型、API 实现或产品页面。

## 来源与使用范围

- 当前基准：[Go Harness 固定快照](GO_CLIENT_CONTRACT.md)及其实际 DTO、handler、service 与响应编码。账号、组织、权限和客户能力的真实支持边界以该合同为准。
- 历史文档来源：用户提供的 `API.md`，原题为「golang-web-template API 文档」；来源版本 `1.0.0`、更新日期 `2026-10-08`、适用提交 `f98a7d3`。
- 整合日期：2026-10-10。来源文件 SHA-256：`570254a189f3b316f2941ab65994709a585fe2f73d9a68fe602930f950e679e3`。
- 下方沿用历史章节并按当前 Go 源码校准报文、错误码和校验规则；旧来源摘要仅用于追溯，不再表示当前文件逐字不变。服务配置、Swagger 路径及命令仍须在目标服务核对，不能由示例推断部署已接通。
- 本文是可选的服务契约参考；具体下游采用哪些接口、账号/组织模型和认证方式，由实际需求及已授权服务决定。原文的服务端设计取舍不自动成为所有 Harness 下游的工程规则，也不授权执行其中的命令、访问示例地址或安装依赖。
- 下游接入仍遵循 [数据访问规则](DATA_ACCESS.md)、[运行配置](RUNTIME_CONFIGURATION.md) 与 [日志规则](LOGGING.md)。契约引用不能替代真实服务确认、运行时校验或联网验证。

## 与现有工程基础的适配边界

| 主题         | 来源契约                                                                          | 后续实际接入时的边界                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权         | 仅接受 `Authorization: Bearer <access_token>`，令牌在响应 body 的 `data.token` 中 | 现有基础 client 默认使用 `X-AUTH-TOKEN`；仅配置 BaseURL 或 Token extractor 不会改变发出的鉴权 header。接入时须明确服务专用适配与会话所有者，保持既有 revision、401/403、取消和内存存储边界；Workspace 自建服务已有 Bearer/语言/追踪桥接；已有服务仍按目标合同接线。 |
| 请求追踪     | `X-Request-Id` / `request_id` 是单次请求追踪标识                                  | 现有 `X-Http-Request` 是服务端 continuation，二者不能互换；真实服务的 CORS、允许/暴露 header 与缓存策略需按所选协议确认。                                                                                                                                           |
| 响应与错误   | `model` 判别响应，业务错误位于 `errors.datas[].code`                              | 未来域 API 负责运行时校验与错误映射；注册与 profile 虽同为 `model: account`，其 `data` 形状不同，需结合 endpoint 判断。空结果是 HTTP 200 的 `model: empty`；`/healthz` 使用纯文本。                                                                                 |
| 数据与分页   | 字符串 ID、unix 秒、nullable 字段；分页为 `current` / `size` 与 `grid.result`     | 未来域边界负责保留 ID 精度、显式转换时间单位，并将外部分页映射到内部 `page` / `pageSize` / `items` / `total`；不改内部统一分页合同。                                                                                                                                |
| 认证生命周期 | 注册/重置不自动登录；登出、改密与重置吊销全部令牌                                 | refresh、缓存清理、登录导航和并发重放均须在实际功能中明确所有者与验证范围；当前基础没有自动 refresh/replay。                                                                                                                                                        |
| GraphQL      | 只读独立投影，可选鉴权；业务错误 200，语法/校验错误 422                           | 该行为只属于来源服务，接入时分别处理协议错误、业务错误与 partial data；当前没有安装 GraphQL 依赖或生成客户端。                                                                                                                                                      |

当前 Go 源码在 verification.enabled=false 时忽略注册 code；发码与找回仍要求验证码能力启用。GraphQL 业务错误通常为 HTTP 200，协议错误按 §5.4 的 422 分界处理；目标服务升级后重新核对。

## 功能模块与 API 关联

本节按实际操作关联身份、组织、权限、目录、订单、钱包支付与审计；通过 `$web-compose-capabilities` 按需读取知识与模板，两类宿主均不因参考文档而启用功能。“参考已定义”只代表来源正文描述该操作，不表示当前实现或服务验证。

关联阅读：[认证操作映射](#认证操作映射)、[协议与会话适配](#协议与会话适配)、[组合契约缺口](#组合契约缺口)、[管理操作契约缺口](#管理操作契约缺口)、[下游落地与文档回写](#下游落地与文档回写)。新增操作仍需真实服务合同，不凭文档生成未实现的 endpoint。

### 认证操作映射

以下路径均采用来源契约的完整前缀；登录与注册表单字段经域 API 映射，不在页面中拼 URL。

| 用户操作 / 能力         | 参考已定义的操作与来源                                           | 输入与成功结果                                                                                                  | 与所选操作的关联                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 发送邮箱验证码          | `POST /api/v1/auth/verification-code`，[§4.1](#41-发送验证码)    | `{ target, target_type: "email", scene }` → `model: verification.code`，`data.expires_in` / `resend_after` 为秒 | 注册显式用 `scene: "register"`，找回用 `"reset_password"`；更换邮箱、场景或重发后重置旧验证码状态。不能依赖非 mock 响应存在 `code`。                               |
| 客户端注册              | `POST /api/v1/auth/register`，[§4.2](#42-注册)                   | `{ username, email, password, code, code_type: "email" }` → `model: account`，`data` 是 Account                 | 成功创建默认组织但不返回令牌、不自动登录，回到登录页；未选择注册时不提供页面或调用分支。本地自建邮箱注册默认启用验证码和发码；找回另选，已有服务遵循可信合同。     |
| 登录                    | `POST /api/v1/auth/login`，[§4.3](#43-登录)                      | `{ account, password }` → `model: auth.token`，`data.token` 与 `data.account`                                   | 用户名映射到 `account`；该契约也支持邮箱。只从 `data.token.access_token` 获取访问凭据；用户、权限和组织上下文就绪后才进入主 UI，不能把返回 Account 当成完整授权。  |
| 当前用户 / 导航校验候选 | `GET /api/v1/auth/profile`，[§4.7](#47-当前账号)                 | 无目标账号 ID → `model: account`，`data: { account, org }`                                                      | 可在确认真实服务满足当前会话校验语义后，以每次导航的新鲜请求校验凭据；不能用旧 Query 命中替代。返回的 `org` 仅是默认组织，不是多组织列表或已切换组织，且无权限码。 |
| 退出登录                | `POST /api/v1/auth/logout`，[§4.6](#46-登出)                     | 无 body，带访问令牌 → HTTP 200、`model: empty`                                                                  | 来源会吊销该账号全部令牌，含其他设备/客户端；采用时 UI 必须说明这个范围。远端失败仍执行本地退出，不能宣称服务器已吊销成功，退出自身失败不递归调用。                |
| 忘记密码                | `POST /api/v1/auth/password/reset`，[§4.5](#45-重置密码忘记密码) | `{ target, target_type: "email", code, new_password }` → `model: empty`                                         | 使用找回用途验证码，成功后全部旧令牌失效；清理本地上下文并回登录，不自动登录。后台只有服务明确支持其账号恢复时才能复用。                                           |
| 已登录修改密码（按需）  | `PUT /api/v1/auth/password`，[§4.8](#48-修改密码)                | `{ old_password, new_password }` → `model: empty`                                                               | 与忘记密码分开；成功后全部令牌失效，进入统一退出/重新登录流程。已有接口不意味着自动增加账户设置页。                                                                |
| 刷新令牌（按需）        | `POST /api/v1/auth/refresh`，[§4.4](#44-刷新令牌)                | `{ refresh_token }` → 与登录相同的 AuthResponse                                                                 | 来源提供刷新能力，但不自动启用刷新或重放。选用时由唯一会话 owner 管理刷新凭据生命周期、并发与持久化；刷新凭据不能作为访问令牌发给受保护接口。                      |

采用上述契约时，用户名、密码、邮箱和验证码格式直接核对 [§9 参数规则](#9-参数校验规则)，不把这些来源限制升级为所有服务的统一规则。验证码倒计时取已校验的 `resend_after` / `expires_in`；失败时按稳定错误码反馈，不从本地化 `message` 中解析秒数。注册/找回场景隔离、重发旧码失效和错误次数限制由服务端保证。

本地自建邮箱注册默认启用验证，尚无邮件服务时 dev 默认模拟投递并在表单显示实际验证码；接通 SMTP 同时关闭 mock，真实回执不含 code，页面移除回显。非开发拒绝 Mock；已有服务按可信验证合同接线。找回接口会以 `verification.target.not.registered` 暴露账号是否存在，UI 可保持中性提示，但不能因此声称服务端已经防止枚举；下游采用时记录差异，需要消除时由服务端提供统一反馈契约。

### 协议与会话适配

- **凭据传输**：来源只接受 `Authorization: Bearer <access_token>`（[§2.3](#23-鉴权)）；基础 client 默认 `X-AUTH-TOKEN`。在受控服务 target 的请求边界明确适配，保持一个会话 owner、revision、取消与 401 single-flight，不叠加第二套 client，也不同时发送冲突凭据。登录响应令牌在 body 的 `data.token`，不是默认响应 header；仅设置 BaseURL 或 Token extractor 不会完成 Bearer 适配。
- **持久化**：已选择凭据持久化方案的 Web 按 [数据规则](DATA_ACCESS.md) 的 Web 身份认证限定例外保存访问凭据及必要 token type/expiry；不能持久化整个 AuthResponse、用户、权限或 continuation。默认不因存在 `refresh_token` 字段就保存它或自动刷新。登录、换凭据和退出仍按 身份认证会话合同协调内存与 Storage。
- **成功解析**：按 endpoint、HTTP 状态和 `model` 联合校验外部数据。注册的 `model: account` 是 `data: Account`，profile 则是 `data: { account, org }`；`model: empty` 是 HTTP 200 且无 `data`，不是 204。令牌发布前完整校验 TokenPair，不将任意 2xx 当作登录成功。
- **错误与退出**：REST 读取 `errors.datas[].code`（[§2.2](#22-错误响应)、[§8](#8-错误码总表)），不匹配翻译后的 message。普通受保护请求当前 401 统一退出；`auth.account.disabled` 可按认证错误退出，普通业务 `common.forbidden` / 403 保留会话并处理权限。公开登录失败留在表单，不触发旧会话的 401 handler。明确指定的导航凭据校验操作返回 HTTP/业务错误或非法成功报文时，按用户 SOP 退出；仅无响应 network/timeout 保留凭据且不新增授权，取消/本地异常分别处理。**校验失败后不自动 refresh/replay 来绕过退出规则**。
- **追踪与数据映射**：`X-Request-Id` / `request_id` 只用于单次追踪，不是 `X-Http-Request` continuation、幂等键或支付凭证。ID 保持字符串，unix 秒显式转换，`expires_in` / `resend_after` 是持续时间；保留 nullable。来源尚无列表操作，若后续服务采用 [§2.6](#26-分页与排序固定契约)，在域 API 将 `current` / `size` 与 `grid.result` 映射为内部 `page` / `pageSize` / `items` / `total`，不能据此推断已经有管理列表接口。
- **状态与版本**：Account 的 `status: 1/0` 不定义商品、组织、订单或成员状态；秒级 `updated_time` 不是可靠的并发版本，JWT `ver` 是令牌吊销版本。来源 `common.conflict` 表示资源已存在，不能未经服务确认映射为版本冲突；管理并发与幂等需另有契约。
- **GraphQL**：[§5](#5-graphql-查询层) 仅有 `health` 和 `me`，无 Mutation、列表、权限或 Subscription。`health` 公开，不校验用户凭据；`me` 可选鉴权会把失效令牌降为匿名，不能仅凭 HTTP 200 放行路由或替代 REST 强鉴权校验。处理 `errors[].extensions.code`、partial data 与 422 协议错误；独立映射 camelCase 投影，不能直接强转 REST AccountDetail。

### 组合契约缺口

以下均为**待服务端补齐或由已授权真实契约替换**，不为其臆造路径、方法、字段拼写或权限码。来源的账号/组织模型不等于这些操作已存在。

| 功能模块             | 已有参考可复用的部分                       | 尚缺的接口与语义                                                                                                                                                         |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 当前权限与授权上下文 | 登录 Account、profile 的默认 Org           | 当前用户有效权限码及作用域、权限更新/版本与 all/any 规则；客户端组织权限和后台平台权限分别确认。Account.status、Org.owner_id 和 JWT 声明都不能替代权限。                 |
| 可用组织与切换       | Org / AccountDetail（[§6.2–6.3](#62-org)） | 有效成员组织清单、当前组织、切换命令、成员资格校验、新作用域凭据/上下文与未知结果恢复。来源明确 `org_user` 尚未实现，默认组织不证明成员资格或可切换；不能先在本地改 ID。 |
| 分类树与商品         | 仅有通用 ID/分页约定                       | 分类父级、排序、直属/后代查询范围、可见性及商品分类归属、规格、可售状态、分页/懒加载契约。                                                                               |
| 报价与支付方式       | 无业务契约                                 | 权威报价、准确金额/币种/精度、有效期/版本；服务返回支付方式 ID、wallet 类型、钱包归属与可用原因。不能固定一个钱包选项冒充服务结果。                                      |
| 创建订单             | 无业务契约                                 | 商品/规格/数量与报价、支付选项；订单身份、历史快照、应付金额、归属、建单幂等及原请求恢复查询。                                                                           |
| 钱包支付与原单续付   | 无业务契约                                 | 原订单/支付尝试、支付幂等、原单允许动作、扣款结果查询、关闭/过期与并发规则；结果未知先查询，确认仍可付才继续。                                                           |
| 订单查询与钱包管理   | 无业务契约                                 | 订单列表/详情、支付与权益独立状态；钱包归属/币种、余额/冻结与流水分页、订单关联、一致性和可见权限。                                                                      |
| 支付后账户刷新       | profile 可重取账号档案与默认组织           | 原订单/列表、钱包/流水、购买影响的权益/额度及需要时权限的权威读取；仅刷新 profile 不满足“当前账户数据刷新”。原组织响应不得写入新组织。                                   |

权限尚缺时不能给默认全集、把 owner 当管理员或开放私有路由；冷启动只有 Token/profile 时停在上下文恢复。只有默认组织的服务不能宣称支持多组织切换。购买范围缺少建单/扣款幂等或结果查询时，不执行真实扣款；规范或类型化 Mock 仍须标明边界。

### 管理操作契约缺口

后台可复用已确认的登录、找回、退出和当前操作员档案契约；是否支持平台账号及平台权限必须另外确认。来源所有受保护操作只面向当前账号自己，profile 不接受目标账号 ID，不能将自服务接口用于管理客户、重置他人密码或跨组织读取。

| 管理页面 / 动作 | 来源可关联的事实                              | 需要补齐的管理契约                                                                                                                                    |
| --------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 分类维护        | 通用 ID / 响应 / 分页约定                     | 树读取、创建/编辑/排序/移动/停用或归档；树无环、引用/影响校验、条件写入与未知结果查询。                                                               |
| 商品维护        | 无商品接口                                    | 商品列表/详情、有效分类、规格与准确价格、发布/下架/归档、版本及报价失效；保护已有订单快照。                                                           |
| 组织管理        | Org 仅描述默认组织                            | 目标组织查询/详情、服务允许的创建/编辑/启停、影响范围、版本与负责人交接；目标组织不是操作员会话组织。                                                 |
| 用户与成员      | 当前 Account 自服务、`org_user` 未实现        | 目标账户查询/允许状态操作、成员/邀请/组织角色；全局账户与组织成员分离，唯一负责人及跨组织边界由服务校验。后台开通账号不能偷偷调用公开 register 代替。 |
| 订单管理        | 无订单接口                                    | 授权范围内的订单/支付/权益查询；仅服务允许时取消未支付订单，绑定原因、版本、幂等和支付竞争结果；不编辑金额或强制置为已支付。                          |
| 钱包与支付记录  | 无钱包/流水/支付接口                          | 指定合法目标的只读查询、支付尝试/订单/流水关联及一致性规则；不从余额差额认定支付成功，不增加资金写入。                                                |
| 平台访问控制    | 错误码含 `common.forbidden`，但无权限数据接口 | 当前平台权限、可授予角色/范围、角色分配与撤销、最后管理员保护；不借用客户组织权限或凭角色名放行。                                                     |
| 操作审计        | 只有 `request_id` 请求追踪                    | 可信操作员、目标/组织、动作、原因、结果、脱敏及查询权限；管理写入与审计一致性由服务保证，浏览器日志和 request_id 不能冒充审计账本。                   |

管理操作共同补齐：服务授权、可执行动作、版本/条件写入、幂等与未知结果恢复、审计关联。只读取现有契约能证明的数据，缺少相应能力时不呈现假成功表单或调用自行猜测的 `/admin/...` 路径。

### 下游落地与文档回写

列表设计与导出遵循 [数据规则的列表查询协议强约定](DATA_ACCESS.md#列表查询协议强约定)：远端列表使用 GraphQL，包括无筛选的首次读取。以下 imported 原文仅为来源契约，分页形状和已有只读 Schema 不证明来源服务已经提供业务列表；REST 列表如实记为不符合项，不改写来源或冒充 GraphQL 已实现。

1. 采用来源契约前核对真实服务版本及可信 Schema/实现，选择本次操作；在下游唯一 PRD 的对应范围记录“参考已定义 / 待补契约”、实际差异与采用依据，不改写本文件的来源正文。真实地址只进入运行配置，不进入通用 Skill。
2. 按功能在 `src/data/api/<domain>/` 放输入/输出校验、请求与映射；`features/` 拥有认证/购买/管理编排、Query key 和精确失效，route 只装配。客户端与后台只有真实相同的契约才复用，不能用通用 CRUD 函数绕过对象、动作与作用域检查。
3. 真实 HTTP 接入由 `$web-connect-http-service` 承接；未配置远端时仅 Mock 远端边界。结合上表验证登录 body Token/Bearer、公开请求隔离、profile 与注册形状、空结果、错误退出、缺权限拒绝、默认/当前组织、秒时间/字符串 ID、分页，以及本次写入的幂等和恢复；Mock 不证明服务约束成立。
4. 由 `$web-document-api` 结合当前实现、采用合同与已确认设计同步导出。在 `docs/api/` 导出统一文档包：根关联说明、`api/` 内一份通用结构与一份 API 元数据及按业务聚合的接口文档、`business/` 内已实现业务目标/调用流程/设计思路。每次对照已有文档、当前接口与真实消费者核对差异；局部委托仅同步受影响范围与关联。REST 保持六项与 JSON 加字段表，GraphQL 保留有来源的 Schema；导出不含本地代码或路径。未接入契约与设计建议仍保留并标明状态，不冒充已实现业务或联调通过。布局、迁移与检查以 Skill 为准，初始化只分发能力，不生成业务文档。

## 来源正文

<!-- imported-api-contract:start -->

**版本** 1.0.0 ｜ **更新日期** 2026-10-08 ｜ **适用代码** `f98a7d3`

本文档面向接口调用方（前端 / 移动端 / 第三方）。文档中的所有请求与响应报文均为**在 `-e dev`（mock 验证码 + sqlite）下实际抓取**，不是手写示例。

> **与 Swagger 的关系**：`docs/swagger.json` / `swagger.yaml` 由 `make docs` 从代码注释生成，是机器可读版本；本文档是它的可读版本，额外补充了错误码全表、鉴权细节与典型流程。两者不一致时以代码为准（Swagger 由代码生成，本文档为人工维护）。

---

## 目录

- [1. 概览](#1-概览)
- [2. 通用约定](#2-通用约定)
- [3. 系统接口](#3-系统接口)
- [4. 认证与账号接口](#4-认证与账号接口)
- [5. GraphQL 查询层](#5-graphql-查询层)
- [6. 数据模型](#6-数据模型)
- [7. 典型流程](#7-典型流程)
- [8. 错误码总表](#8-错误码总表)
- [9. 参数校验规则](#9-参数校验规则)

---

## 1. 概览

### 1.1 Base URL

```
http://{host}:{port}
```

默认 `http://127.0.0.1:8080`（`server.port` 可配，可用 `APP_SERVER_PORT` 覆盖）。

### 1.2 内容类型

| 场景   | Content-Type                                                       |
| ------ | ------------------------------------------------------------------ |
| 请求体 | `application/json`                                                 |
| 响应体 | `application/json`（**唯一例外**：`GET /healthz` 返回纯文本 `ok`） |

### 1.3 接口总表

| #   | 方法 | 路径                             | 鉴权 | 说明                                            |
| --- | ---- | -------------------------------- | ---- | ----------------------------------------------- |
| 1   | GET  | `/healthz`                       | -    | 存活探针（纯文本）                              |
| 2   | GET  | `/api/v1/system/health-check`    | -    | 健康检查                                        |
| 3   | POST | `/api/v1/auth/verification-code` | -    | 发送验证码                                      |
| 4   | POST | `/api/v1/auth/register`          | -    | 注册                                            |
| 5   | POST | `/api/v1/auth/login`             | -    | 登录                                            |
| 6   | POST | `/api/v1/auth/refresh`           | -    | 刷新令牌                                        |
| 7   | POST | `/api/v1/auth/password/reset`    | -    | 重置密码（忘记密码）                            |
| 8   | POST | `/api/v1/auth/logout`            | ✅   | 登出                                            |
| 9   | GET  | `/api/v1/auth/profile`           | ✅   | 当前账号 + 默认组织                             |
| 10  | PUT  | `/api/v1/auth/password`          | ✅   | 修改密码                                        |
| 11  | POST | `/graphql`                       | 可选 | GraphQL 查询                                    |
| 12  | GET  | `/graphql`                       | -    | GraphiQL 调试页（仅 `graphql.playground` 开启） |
| -   | GET  | `/swagger/*any`                  | -    | Swagger UI                                      |

接口只有**认证**与**账号自服务**两类。所有受保护接口都只操作当前登录账号自己，**路径里不带目标账号 ID** —— 从形状上就不存在越权枚举的可能。

### 1.4 路由兜底

| 情况         | 状态码 | 错误码                      |
| ------------ | ------ | --------------------------- |
| 路径不存在   | 404    | `common.route.not.found`    |
| 方法不被允许 | 405    | `common.method.not.allowed` |

两者都返回统一错误响应体（不是 gin 默认的纯文本）。

---

## 2. 通用约定

### 2.1 统一响应体

成功响应有四种固定形状，客户端按 `model` 字段分发：

**① 单对象** —— 大多数接口

```json
{
  "model": "account",
  "data": { "...": "..." },
  "request_id": "d75fa120-c610-4325-8fbd-89d814b2d754"
}
```

**② 空结果** —— 登出 / 改密 / 重置密码

```json
{
  "model": "empty",
  "request_id": "9e8b3115-611e-4519-af43-06923662e4f7"
}
```

> 注意是 **HTTP 200 + `{"model":"empty"}`**，不是裸 `204 No Content`。统一响应体约定优先，客户端只需一套解析逻辑。

**③ 数据集** —— 当前接口面暂未使用，属固定契约

```json
{
  "model": "data.set",
  "datas": [],
  "total": 0,
  "request_id": "..."
}
```

**④ 分页数据集** —— 当前接口面暂未使用，属固定契约

```json
{
  "model": "grid.result",
  "page": { "current": 1, "size": 10, "total": 0 },
  "result": { "model": "data.set", "datas": [], "total": 0, "request_id": "..." }
}
```

> ③ ④ 虽然暂时没有接口在用，但**是模板的一部分**，不是死代码 —— 新增列表接口时直接复用，形状不会变。

`request_id` 与请求头 `X-Request-Id` 一致；未携带时由服务端生成。排障时把 `request_id` 给后端即可定位到具体日志。

### 2.2 错误响应

所有错误（含 404 / 405 / 参数校验失败）都是同一个形状：

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "auth.credentials.invalid",
        "message": "账号或密码错误"
      }
    ],
    "total": 1
  },
  "request_id": "313e1f17-81a6-4a6e-b398-cfd7b3e61be0"
}
```

**客户端应以 `errors.datas[0].code` 为准**，不要匹配 `message` —— 后者随语言变化。完整错误码见 [第 8 节](#8-错误码总表)。

### 2.3 鉴权

只认标准写法，**不做任何兼容**：

```http
Authorization: Bearer <access_token>
```

| 写法                                | 结果                               |
| ----------------------------------- | ---------------------------------- |
| `Bearer <token>`                    | ✅                                 |
| `bearer <token>` / `BEARER <token>` | ✅ scheme 按 RFC 7235 大小写不敏感 |
| `<token>`（裸令牌）                 | ❌ 401 `auth.token.malformed`      |
| `Token <token>`（其他 scheme）      | ❌ 401 `auth.token.malformed`      |
| `?token=<token>` 查询参数           | ❌ 401 `auth.token.missing`        |
| 自定义请求头名                      | ❌ 401 `auth.token.missing`        |

> 不接受 `?token=` 是有意的：令牌出现在 URL 里会进浏览器历史、`Referer` 头和各级访问日志，属于凭据泄漏。

令牌是 JWT，声明包含 `aid`（账号 ID）、`username`、`ver`（令牌版本）、`typ`（`access` / `refresh`）、`iss` / `sub` / `exp` / `nbf` / `iat`。其中 `exp` / `nbf` / `iat` 按 JWT 规范是 **unix 秒**，与响应体里的时间字段同一种表示法。

**访问令牌用 `typ=access`，刷新令牌用 `typ=refresh`，两者不能互换** —— 拿刷新令牌访问受保护接口会返回 `auth.token.wrong.type`。

**吊销机制**：每个账号有 `token_version`。登出、修改密码、重置密码都会递增它，从而**立即吊销该账号已签发的全部令牌**（含其他设备）。校验时比对 JWT 里的 `ver` 与数据库当前值，不一致即 `auth.token.revoked`。

### 2.4 多语言

错误 `message` 支持中英双语，协商优先级：

```
X-Lang  >  Accept-Language  >  ?lang=
```

响应会带上 `Content-Language` 与 `Vary` 头（便于 CDN 正确缓存）。

```http
POST /api/v1/auth/login
X-Lang: en-US
```

```json
{
  "errors": {
    "datas": [{ "code": "auth.credentials.invalid", "message": "Incorrect account or password" }]
  }
}
```

兜底语言 `zh-CN`（`i18n.fallback` 可配）。**错误码本身不翻译**，只翻译 `message`。

### 2.5 限流

全局 IP 限流中间件，默认 `50 rps` / 突发 `100`（`rate_limit.rps` / `burst`）。超出返回 429 `common.too.many.requests`。

`dev` 环境默认关闭（`config-dev.yaml` 里 `rate_limit.enabled: false`）。

### 2.6 分页与排序（固定契约）

当前没有列表接口，但参数契约已固定，新增列表接口时直接内嵌使用：

| 参数       | 类型   | 默认   | 说明                               |
| ---------- | ------ | ------ | ---------------------------------- |
| `current`  | int    | 1      | 页码，从 1 开始                    |
| `size`     | int    | 10     | 每页条数，上限 200                 |
| `order_by` | string | -      | 排序字段，按模型真实字段白名单校验 |
| `order`    | string | `desc` | `asc` / `desc`                     |

越界值静默回落到默认值；`order_by` 传了不存在的列时回落到 `id`（不报 500）。

### 2.7 字段约定

| 约定           | 说明                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **主键 `id`**  | 雪花算法生成的 19 位整数，**JSON 中以字符串返回**（`"2108041211712008192"`）。19 位十进制超出 JS `Number.MAX_SAFE_INTEGER`（16 位），字符串可避免精度丢失 |
| **时间字段**   | **unix 秒整数**（`1791432395`），不是字符串。数据库列、REST 响应、GraphQL 响应三处同一种表示法                                                            |
| **时间精度**   | 秒级。同一秒内的先后顺序不可区分 —— 短时间内完成的流程（注册即登录）会让 `created_time` 与 `last_login_at` 取到**相同**的值，这是正常的，不要用它判断先后 |
| **可空字段**   | `null`，例如未填手机号时 `phone: null`                                                                                                                    |
| **`status`**   | `1` = 正常，`0` = 禁用                                                                                                                                    |
| **脱敏**       | 验证码接口响应里的 `target` 是脱敏值：邮箱 `d***@example.com`、手机号 `+86****8000`                                                                       |
| **验证码明文** | 仅 mock 模式返回；非 mock 模式下 `code` 字段**整个不出现**（不是空串）                                                                                    |

---

## 3. 系统接口

### 3.1 存活探针

```
GET /healthz
```

供容器编排（k8s livenessProbe 等）探测，**不返回业务信息**，响应是纯文本。

**响应** `200 OK`，`Content-Type: text/plain`

```
ok
```

### 3.2 健康检查

```
GET /api/v1/system/health-check
```

返回服务可用性与应用基础信息。

**响应** `200 OK`

```json
{
  "model": "system.health.check",
  "data": {
    "available": true,
    "name": "golang-web-template",
    "version": "1.0.0",
    "env": "dev"
  },
  "request_id": "e625954c-92f7-4624-bb76-8c33c5fa1772"
}
```

| 字段        | 类型   | 说明                              |
| ----------- | ------ | --------------------------------- |
| `available` | bool   | 服务是否可用                      |
| `name`      | string | 应用名（`app.name`）              |
| `version`   | string | 版本（`app.version`）             |
| `env`       | string | 当前环境：`dev` / `test` / `prod` |

---

## 4. 认证与账号接口

### 4.1 发送验证码

```
POST /api/v1/auth/verification-code
```

向指定邮箱或手机号发送验证码。`scene` 决定用途，两个场景**互相独立**（各自计数、各自过期）。

| `scene`                | 用途       | 要求目标已注册 |
| ---------------------- | ---------- | -------------- |
| `register`（留空默认） | 注册新账号 | 否             |
| `reset_password`       | 忘记密码   | **是**         |

**请求体**

| 字段          | 类型   | 必填 | 约束              | 说明                  |
| ------------- | ------ | ---- | ----------------- | --------------------- |
| `target`      | string | ✅   | ≤ 128             | 邮箱或手机号（E.164） |
| `target_type` | string | ✅   | `email` / `phone` | 目标类型              |
| `scene`       | string | -    | ≤ 32              | 留空默认 `register`   |

**请求示例**

```json
{
  "target": "Demo@Example.com",
  "target_type": "email"
}
```

**响应** `200 OK`

```json
{
  "model": "verification.code",
  "data": {
    "target": "d***@example.com",
    "target_type": "email",
    "scene": "register",
    "expires_in": 300,
    "resend_after": 60,
    "mock": true,
    "code": "582701"
  },
  "request_id": "6d7bdd9b-fccd-4c8c-b2b9-7efe946a4641"
}
```

| 字段           | 类型   | 说明                                             |
| -------------- | ------ | ------------------------------------------------ |
| `target`       | string | **脱敏后**的目标，不回显完整邮箱 / 手机号        |
| `target_type`  | string | 实际生效的目标类型                               |
| `scene`        | string | 实际生效的场景                                   |
| `expires_in`   | int    | 验证码有效期（秒）                               |
| `resend_after` | int    | 距离下次可重发的秒数                             |
| `mock`         | bool   | 是否模拟模式                                     |
| `code`         | string | **仅 mock 模式返回**。非 mock 模式下该字段不出现 |

**错误**

| 状态码 | 错误码                               | 触发条件                                           |
| ------ | ------------------------------------ | -------------------------------------------------- |
| 400    | `common.bad.request`                 | 缺必填字段 / 字段格式不合法                        |
| 400    | `verification.target.invalid`        | 目标格式不正确（如邮箱缺域名后缀、手机号缺国家码） |
| 400    | `verification.scene.unsupported`     | 场景不在注册表中                                   |
| 404    | `verification.target.not.registered` | `reset_password` 场景下目标未绑定账号              |
| 429    | `verification.code.too.frequent`     | 重发间隔内重复发送，`message` 里带需等待秒数       |
| 429    | `verification.code.daily.limit`      | 该目标该场景 24h 内发送次数达上限                  |
| 503    | `verification.disabled`              | 验证码功能未启用                                   |
| 503    | `verification.channel.unavailable`   | 非 mock 且发送通道未接入                           |

**错误示例**

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "verification.target.not.registered",
        "message": "该 g***@example.com 尚未注册"
      }
    ],
    "total": 1
  },
  "request_id": "3ac85f9f-014f-4790-a86c-30ac6fccc8fd"
}
```

**注意事项**

- **同一目标同一场景**才互相影响：给 `demo@example.com` 发了注册码，不影响它发重置码。
- **重发即作废旧码**：任一时刻同一 `(目标, 场景)` 最多只有一个可用验证码。
- **未注册目标会暴露**：`reset_password` 场景下返回 404 会暴露「该邮箱是否已注册」。这是刻意取舍 —— 否则用户会拿到一个永远用不上的码且没有任何反馈。
- **非 mock 且发送失败时不落库**：发送失败还留一条有效记录，用户会永远等不到码，而服务端看起来一切正常。

### 4.2 注册

```
POST /api/v1/auth/register
```

创建新账号，用户名与邮箱全局唯一；注册成功**同时**创建该账号的默认组织（两者在同一事务内，只成功一半会留脏数据）。**不自动登录**。

**请求体**

| 字段        | 类型   | 必填 | 约束                   | 说明                                           |
| ----------- | ------ | ---- | ---------------------- | ---------------------------------------------- |
| `username`  | string | ✅   | 3-32 位 `[A-Za-z0-9_]` | 用户名                                         |
| `email`     | string | ✅   | 合法邮箱，≤ 128        | 邮箱，服务端归一化为小写                       |
| `password`  | string | ✅   | 8-64 位，含字母与数字  | 密码                                           |
| `phone`     | string | -    | E.164                  | 手机号。填了会做唯一性校验，也可作为验证码目标 |
| `nickname`  | string | -    | ≤ 64                   | 昵称，留空回落为用户名                         |
| `code`      | string | 见下 | 纯数字，≤ 16           | 验证码                                         |
| `code_type` | string | -    | `email` / `phone`      | 用哪个标识匹配验证码，留空默认 `email`         |

> `code` 的必填性**取决于服务端配置** `verification.enabled`：开启时必填，关闭时忽略。所以它没有写死在参数校验里，缺失时由业务层返回 `verification.code.required`（而不是笼统的参数校验失败）。

**请求示例**

```json
{
  "username": "demo",
  "email": "Demo@Example.com",
  "password": "demo1234",
  "code": "582701"
}
```

**响应** `200 OK`

```json
{
  "model": "account",
  "data": {
    "id": "2108041211712008192",
    "username": "demo",
    "email": "demo@example.com",
    "phone": null,
    "nickname": "demo",
    "status": 1,
    "last_login_at": null,
    "last_login_ip": "",
    "created_time": 1791432395,
    "updated_time": 1791432395
  },
  "request_id": "8a84c3c6-6b22-4d88-b3ea-2b4c31982ba1"
}
```

**错误**

| 状态码 | 错误码                                | 触发条件                                        |
| ------ | ------------------------------------- | ----------------------------------------------- |
| 400    | `common.bad.request`                  | 字段格式不合法（用户名 / 密码 / 邮箱 / 手机号） |
| 400    | `verification.code.required`          | 开启验证码但未提供 `code`                       |
| 400    | `verification.code.invalid`           | 验证码不正确，或已被使用 / 被重发顶掉           |
| 400    | `verification.code.expired`           | 验证码已过期                                    |
| 400    | `verification.target.missing`         | `code_type=phone` 但未填 `phone`                |
| 409    | `account.username.taken`              | 用户名已被占用                                  |
| 409    | `account.exists`                      | 邮箱已被注册                                    |
| 409    | `account.phone.taken`                 | 手机号已被注册                                  |
| 429    | `verification.code.attempts.exceeded` | 该验证码错误次数超限                            |

**注意事项**

- 邮箱归一化为小写，手机号去掉空格 / 短横线 / 括号 / 点。
- **验证码错误一次不会消耗它**：输错后可以用同一个码重试，直到次数上限。
- 校验顺序是「验证码 → 查重 → 哈希」，因此**「用户名已占用」这类失败不会吃掉验证码**，可以换个用户名用同一个码重试。

### 4.3 登录

```
POST /api/v1/auth/login
```

**请求体**

| 字段       | 类型   | 必填 | 约束  | 说明             |
| ---------- | ------ | ---- | ----- | ---------------- |
| `account`  | string | ✅   | ≤ 128 | 用户名**或**邮箱 |
| `password` | string | ✅   | ≤ 64  | 密码             |

**响应** `200 OK`

```json
{
  "model": "auth.token",
  "data": {
    "token": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "token_type": "Bearer",
      "expires_in": 7200
    },
    "account": {
      "id": "2108046372081659904",
      "username": "demo",
      "email": "demo@example.com",
      "phone": null,
      "nickname": "demo",
      "status": 1,
      "last_login_at": 1791432395,
      "last_login_ip": "127.0.0.1",
      "created_time": 1791432395,
      "updated_time": 1791432395
    }
  },
  "request_id": "8067b74e-2ee8-464d-88ad-cfe8314346cd"
}
```

| 字段                  | 说明                                                           |
| --------------------- | -------------------------------------------------------------- |
| `token.access_token`  | 访问令牌，放在 `Authorization: Bearer` 里                      |
| `token.refresh_token` | 刷新令牌，用于 `POST /auth/refresh`                            |
| `token.token_type`    | 固定 `Bearer`                                                  |
| `token.expires_in`    | `access_token` 有效期（秒），默认 7200（`jwt.access_ttl: 2h`） |

刷新令牌默认有效期 7 天（`jwt.refresh_ttl: 168h`）。

**错误**

| 状态码 | 错误码                     | 触发条件                                             |
| ------ | -------------------------- | ---------------------------------------------------- |
| 400    | `common.bad.request`       | 缺字段                                               |
| 401    | `auth.credentials.invalid` | **账号不存在与密码错误返回同一个错误**，避免账号枚举 |
| 403    | `auth.account.disabled`    | 账号已被禁用                                         |

### 4.4 刷新令牌

```
POST /api/v1/auth/refresh
```

用刷新令牌换取新的令牌对。返回结构与登录相同。重发不撤销旧 refresh，也不递增 token_version；不能假定单次轮换或自动重放。

**请求体**

| 字段            | 类型   | 必填 | 说明                 |
| --------------- | ------ | ---- | -------------------- |
| `refresh_token` | string | ✅   | 登录时拿到的刷新令牌 |

**错误**

| 状态码 | 错误码                  | 触发条件                                     |
| ------ | ----------------------- | -------------------------------------------- |
| 401    | `auth.token.invalid`    | 解析失败、过期或类型错误均归此码             |
| 401    | `auth.token.revoked`    | 账号已登出 / 改密 / 重置密码，令牌版本不匹配 |
| 404    | `account.not.found`     | 账号不存在或已注销                           |
| 403    | `auth.account.disabled` | 账号已被禁用                                 |

### 4.5 重置密码（忘记密码）

```
POST /api/v1/auth/password/reset
```

**匿名**接口，唯一凭证是发到邮箱 / 手机号的 `reset_password` 场景验证码。

**请求体**

| 字段           | 类型   | 必填 | 约束                  | 说明                                     |
| -------------- | ------ | ---- | --------------------- | ---------------------------------------- |
| `target`       | string | ✅   | ≤ 128                 | 接收验证码的邮箱或手机号，必须已绑定账号 |
| `target_type`  | string | ✅   | `email` / `phone`     | 目标类型                                 |
| `code`         | string | 见下 | 纯数字，≤ 16          | `reset_password` 场景的验证码            |
| `new_password` | string | ✅   | 8-64 位，含字母与数字 | 新密码                                   |

**请求示例**

```json
{
  "target": "demo@example.com",
  "target_type": "email",
  "code": "730564",
  "new_password": "demo5678"
}
```

**响应** `200 OK`

```json
{
  "model": "empty",
  "request_id": "7a335c4e-51e7-46bf-ac49-886725f7044d"
}
```

**不自动登录**，客户端拿新密码重新调 `/auth/login`。

**错误**

| 状态码 | 错误码                                | 触发条件                           |
| ------ | ------------------------------------- | ---------------------------------- |
| 400    | `common.bad.request`                  | 字段格式不合法                     |
| 400    | `verification.code.required`          | 未提供 `code`                      |
| 400    | `verification.code.invalid`           | 验证码不正确 / 已使用 / 被重发顶掉 |
| 400    | `verification.code.expired`           | 验证码已过期                       |
| 404    | `verification.target.not.registered`  | 目标未绑定任何账号                 |
| 403    | `auth.account.disabled`               | 账号已被禁用                       |
| 429    | `verification.code.attempts.exceeded` | 验证码错误次数超限                 |
| 503    | `verification.disabled`               | 验证码功能未启用                   |

**注意事项**

- **成功后该账号全部已签发令牌立即失效**（含其他设备），必须重新登录。这是重置密码的关键语义：否则「账号被盗 → 重置密码」之后，攻击者手上的旧令牌仍然有效。
- 与 [4.8 修改密码](#48-修改密码) 的区别：改密靠「登录态 + 原密码」证明身份，重置是匿名入口，靠验证码。
- 验证码错误一次不消耗，可重试。

### 4.6 登出

```
POST /api/v1/auth/logout
```

🔒 需要 `Authorization: Bearer <access_token>`。

递增该账号的 `token_version`，**吊销其全部已签发令牌**（含其他设备与其他客户端），不只是当前这一个。

**请求体** 无。

**响应** `200 OK`

```json
{
  "model": "empty",
  "request_id": "e2083925-a9c0-4c8d-9e44-e95b6a2e8532"
}
```

**错误**

| 状态码 | 错误码                  | 触发条件                         |
| ------ | ----------------------- | -------------------------------- |
| 401    | `auth.token.missing`    | 未携带 `Authorization` 头        |
| 401    | `auth.token.malformed`  | 头格式不对（缺 `Bearer` 前缀等） |
| 401    | `auth.token.expired`    | 令牌已过期                       |
| 401    | `auth.token.revoked`    | 令牌已被吊销                     |
| 403    | `auth.account.disabled` | 账号已被禁用                     |

### 4.7 当前账号

```
GET /api/v1/auth/profile
```

🔒 需要 `Authorization: Bearer <access_token>`。

返回**当前登录账号**及其默认组织。账号由令牌解析得到，**不接受任何目标账号 ID 入参**。

**响应** `200 OK`

```json
{
  "model": "account",
  "data": {
    "account": {
      "id": "2108046372081659904",
      "username": "demo",
      "email": "demo@example.com",
      "phone": null,
      "nickname": "demo",
      "status": 1,
      "last_login_at": 1791432395,
      "last_login_ip": "127.0.0.1",
      "created_time": 1791432395,
      "updated_time": 1791432395
    },
    "org": {
      "id": "2108046372081659905",
      "name": "demo的组织",
      "owner_id": "2108046372081659904",
      "is_default": true,
      "created_time": 1791432395,
      "updated_time": 1791432395
    }
  },
  "request_id": "d4c3c5a7-08ea-4f07-827f-45890cc3bb35"
}
```

> 上面四个时间字段取值完全相同，是因为抓取时整个「注册 → 登录 → 查详情」流程在同一秒内跑完。秒级精度下这是正常结果，不代表字段没写入 —— 想验证写入时机可以隔一秒再登录一次。

组织作为独立字段返回而不是拍平进 `account`：账号与组织是一对多的，后续引入 `org_user` 后形状不需要改。

**错误**：同 [4.6 登出](#46-登出)。

### 4.8 修改密码

```
PUT /api/v1/auth/password
```

🔒 需要 `Authorization: Bearer <access_token>`。

校验原密码后更新密码，并**吊销该账号全部已签发令牌**（需重新登录）。

**请求体**

| 字段           | 类型   | 必填 | 约束                  | 说明   |
| -------------- | ------ | ---- | --------------------- | ------ |
| `old_password` | string | ✅   | ≤ 64                  | 原密码 |
| `new_password` | string | ✅   | 8-64 位，含字母与数字 | 新密码 |

**响应** `200 OK`

```json
{
  "model": "empty",
  "request_id": "9e8b3115-611e-4519-af43-06923662e4f7"
}
```

**错误**

| 状态码 | 错误码                      | 触发条件             |
| ------ | --------------------------- | -------------------- |
| 422    | `account.password.mismatch` | 原密码错误           |
| 400    | `common.bad.request`        | 新密码不符合强度要求 |
| 401    | 同 4.6                      | 鉴权失败             |

---

## 5. GraphQL 查询层

```
POST /graphql
```

**只读查询层，不提供 Mutation。** 写操作全部走 REST —— 写需要事务边界、幂等与鉴权的一致语义，而 GraphQL 一律返回 HTTP 200，失败只能从 `errors[]` 里看，对登录这类需要明确状态码的场景是净损失。

路径与开关由 `graphql.*` 配置控制。关闭时**一条路由都不挂**。

### 5.1 鉴权

端点使用**可选鉴权**：令牌有效则注入账号，缺失或无效都放行，由字段自己决定要不要登录。

> ⚠️ **`me` 字段需要令牌，但令牌无效 / 已吊销时不会返回具体原因** —— `OptionalAuth` 会静默按匿名处理，`me` 返回 `auth.token.missing` 而不是 `auth.token.revoked`。REST 端点（强制鉴权）会给出准确原因。

### 5.2 Schema

```graphql
scalar Timestamp # unix 秒整数，与 REST 同一表示法
type Account {
  id: ID!
  username: String!
  email: String!
  nickname: String!
  status: Int!
  lastLoginIp: String!
  lastLoginTime: Timestamp
  createdTime: Timestamp!
  updatedTime: Timestamp!
}

type Org {
  id: ID!
  name: String!
  isDefault: Boolean!
  createdTime: Timestamp!
  updatedTime: Timestamp!
}

type AccountDetail {
  account: Account!
  org: Org
}

type Health {
  available: Boolean!
  name: String!
  version: String!
  env: String!
}

type Query {
  health: Health! # 公开，无需令牌
  me: AccountDetail! # 需要令牌，只返回令牌对应的账号本身
}
```

GraphQL 类型是**独立投影**，不复用数据库实体，也不含 `password` / `tokenVersion` 等敏感字段 —— 数据库新增列不会自动对外暴露。

### 5.3 请求与响应

**请求**

```json
{
  "query": "{ health { name } me { account { id username nickname status lastLoginTime createdTime updatedTime } org { id name isDefault createdTime updatedTime } } }"
}
```

**响应** `200 OK`（带有效令牌）

```json
{
  "data": {
    "health": { "name": "golang-web-template" },
    "me": {
      "account": {
        "id": "2108046372081659904",
        "username": "demo",
        "nickname": "demo",
        "status": 1,
        "lastLoginTime": 1791432395,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      },
      "org": {
        "id": "2108046372081659905",
        "name": "demo的组织",
        "isDefault": true,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      }
    }
  }
}
```

时间字段与 REST 一样是 **unix 秒整数**。GraphQL 侧用的是自定义标量 `Timestamp` 而不是内置的 `Int` —— 规范的 `Int` 是 32 位，unix 秒会在 2038 年溢出。

### 5.4 错误：200 与 422 的分界

这是接入时最容易踩的点：

| 类型                        | HTTP 状态码 | `errors[].extensions.code`                           |
| --------------------------- | ----------- | ---------------------------------------------------- |
| **业务错误**                | **200**     | 与 REST 同一套错误码，如 `auth.token.missing`        |
| **协议错误**（语法 / 校验） | **422**     | `GRAPHQL_PARSE_FAILED` / `GRAPHQL_VALIDATION_FAILED` |

**业务错误（HTTP 200）**

```json
{
  "errors": [
    {
      "message": "缺少鉴权令牌，请在 Authorization 请求头中携带",
      "path": ["me"],
      "locations": [{ "line": 1, "column": 3 }],
      "extensions": { "code": "auth.token.missing" }
    }
  ],
  "data": null
}
```

**语法错误（HTTP 422）**

```json
{
  "errors": [
    {
      "message": "Expected Name, found <EOF>",
      "locations": [{ "line": 1, "column": 11 }],
      "extensions": { "code": "GRAPHQL_PARSE_FAILED" }
    }
  ],
  "data": null
}
```

**校验错误（HTTP 422）**

```json
{
  "errors": [
    {
      "message": "Cannot query field \"nope\" on type \"Query\".",
      "locations": [{ "line": 1, "column": 3 }],
      "extensions": { "code": "GRAPHQL_VALIDATION_FAILED" }
    }
  ],
  "data": null
}
```

> **只看状态码会把 422 当成传输层故障**，反而漏掉真正的语法 / 字段错误。正确做法是：先按状态码区分「协议错误」与「业务错误」，业务错误再看 `extensions.code`。

### 5.5 GraphiQL 调试页

开发环境（`graphql.playground: true`）浏览器直接访问 `GET /graphql` 打开 GraphiQL，右侧 Docs 面板即接口文档。

打开时会**重定向一次**（302），把示例查询塞进 URL —— GraphiQL 从浏览器地址栏读初始查询，服务端改写请求 URL 没用。示例用「一次取两个资源」（`health` + `me`）而非分页列表，因为本项目没有列表接口。

---

## 6. 数据模型

### 6.1 Account

| 字段            | 类型   | 可空 | 说明                                         |
| --------------- | ------ | ---- | -------------------------------------------- |
| `id`            | string | -    | 雪花 ID，19 位，字符串形式                   |
| `username`      | string | -    | 用户名，全局唯一                             |
| `email`         | string | -    | 邮箱，全局唯一，小写                         |
| `phone`         | string | ✅   | 手机号（E.164），未填时为 `null`             |
| `nickname`      | string | -    | 昵称                                         |
| `status`        | int    | -    | `1` 正常 / `0` 禁用                          |
| `last_login_at` | int    | ✅   | 最近登录时间（unix 秒），从未登录时为 `null` |
| `last_login_ip` | string | -    | 最近登录 IP，从未登录时为空串                |
| `created_time`  | int    | -    | 创建时间（unix 秒）                          |
| `updated_time`  | int    | -    | 更新时间（unix 秒）                          |

响应中**不含** `password` / `token_version`。

### 6.2 Org

| 字段                            | 类型   | 说明                              |
| ------------------------------- | ------ | --------------------------------- |
| `id`                            | string | 雪花 ID                           |
| `name`                          | string | 组织名，注册时默认 `{昵称}的组织` |
| `owner_id`                      | string | 拥有者账号 ID                     |
| `is_default`                    | bool   | 是否该账号的默认组织              |
| `created_time` / `updated_time` | int    | 时间戳（unix 秒）                 |

> 一个账号可以拥有多个组织（`owner_id` 是普通索引，非唯一），`is_default` 单独一列回答「登录后进哪个组织」。`org_user` 成员关系表尚未实现。

### 6.3 AccountDetail

| 字段      | 类型        | 说明             |
| --------- | ----------- | ---------------- |
| `account` | Account     | 账号信息         |
| `org`     | Org \| null | 该账号的默认组织 |

### 6.4 TokenPair

| 字段            | 类型   | 说明                        |
| --------------- | ------ | --------------------------- |
| `access_token`  | string | 访问令牌                    |
| `refresh_token` | string | 刷新令牌                    |
| `token_type`    | string | 固定 `Bearer`               |
| `expires_in`    | int64  | `access_token` 有效期（秒） |

### 6.5 AuthResponse

| 字段      | 类型      | 说明     |
| --------- | --------- | -------- |
| `token`   | TokenPair | 令牌对   |
| `account` | Account   | 账号信息 |

### 6.6 HealthCheckResponse

见 [3.2 健康检查](#32-健康检查)。

---

## 7. 典型流程

### 7.1 注册 → 登录 → 访问受保护接口

```
① POST /api/v1/auth/verification-code   {target, target_type}
   ← 200 { model: "verification.code", data: { code } }     ← mock 模式才有 code

② POST /api/v1/auth/register            {username, email, password, code}
   ← 200 { model: "account", data: { id, ... } }            ← 不返回令牌

③ POST /api/v1/auth/login               {account, password}
   ← 200 { model: "auth.token", data: { token: { access_token, ... }, account } }

④ GET  /api/v1/auth/profile             Authorization: Bearer <access_token>
   ← 200 { model: "account", data: { account, org } }

⑤ POST /api/v1/auth/refresh             {refresh_token}
   ← 200 { model: "auth.token", data: { token, account } }   ← access_token 过期后用

⑥ POST /api/v1/auth/logout              Authorization: Bearer <access_token>
   ← 200 { model: "empty" }                                  ← 全部令牌失效
```

### 7.2 忘记密码

```
① POST /api/v1/auth/verification-code   {target, target_type, scene: "reset_password"}
   ← 200 { data: { scene: "reset_password", code } }
   ← 404 verification.target.not.registered   ← 该邮箱未注册

② POST /api/v1/auth/password/reset      {target, target_type, code, new_password}
   ← 200 { model: "empty" }

③ 旧密码登录 → 401 auth.credentials.invalid
   旧 refresh_token → 401 auth.token.revoked      ← 重置前签发的令牌全部失效
   新密码登录 → 200
```

### 7.3 验证码模式对照

|             | mock 模式（`verification.mock: true`） | 非 mock 模式                                         |
| ----------- | -------------------------------------- | ---------------------------------------------------- |
| 发送        | 不调用任何通道                         | 经 `notify.Sender` 投递                              |
| 响应 `code` | 返回明文                               | 字段不出现                                           |
| 通道未接入  | 不适用                                 | 503 `verification.channel.unavailable`，**且不落库** |
| 适用环境    | 本地开发 / 联调 / 测试                 | 生产                                                 |

> 生产环境**禁止** mock —— 它会把验证码回显给调用方，验证环节形同虚设。服务启动期会校验并直接报错。

---

## 8. 错误码总表

下表逐项来自固定 Go 快照的 internal/apperr/apperr.go。定义存在不等于当前路由会发送：例如 refresh 的 Parse 失败统一 auth.token.invalid，而 auth.refresh.invalid/expired 当前没有调用方。具体返回以本文件操作表和 [Go 客户端合同](GO_CLIENT_CONTRACT.md) 为准；不得凭错误码推断客户、角色或成员接口已实现。

| 错误码                                | HTTP | 定义语义                                                     |
| ------------------------------------- | ---- | ------------------------------------------------------------ |
| `common.bad.request`                  | 400  | 表示请求参数不合法。                                         |
| `common.unauthorized`                 | 401  | 表示请求缺少有效身份凭据。                                   |
| `common.forbidden`                    | 403  | 表示当前身份无权执行该操作。                                 |
| `common.not.found`                    | 404  | 表示目标资源不存在。                                         |
| `common.conflict`                     | 409  | 表示目标资源存在冲突。                                       |
| `common.unprocessable`                | 422  | 表示请求语义无法被业务规则接受。                             |
| `common.too.many.requests`            | 429  | 表示请求超过限流阈值。                                       |
| `common.internal.error`               | 500  | 表示服务端内部错误，不向外部暴露细节。                       |
| `common.route.not.found`              | 404  | 表示请求的路由不存在。                                       |
| `common.method.not.allowed`           | 405  | 表示请求方法不被该路由支持。                                 |
| `common.unsupported.media.type`       | 415  | 表示请求体类型不受支持。                                     |
| `common.payload.too.large`            | 413  | 表示请求体超过允许大小。                                     |
| `auth.token.missing`                  | 401  | 表示请求未携带访问令牌。                                     |
| `auth.token.invalid`                  | 401  | 表示访问令牌格式或签名不合法。                               |
| `auth.token.expired`                  | 401  | 表示访问令牌已过期。                                         |
| `auth.token.revoked`                  | 401  | 表示访问令牌已被撤销。                                       |
| `auth.token.malformed`                | 401  | 表示访问令牌的结构无法解析。                                 |
| `auth.refresh.invalid`                | 401  | 表示刷新令牌不合法。                                         |
| `auth.refresh.expired`                | 401  | 表示刷新令牌已过期。                                         |
| `auth.credentials.invalid`            | 401  | 表示账号或凭据不匹配。                                       |
| `auth.account.disabled`               | 403  | 表示账号已被禁用。                                           |
| `auth.signing.key.missing`            | 500  | 表示签发密钥缺失。                                           |
| `auth.issuer.mismatch`                | 401  | 表示令牌签发方与当前服务不一致。                             |
| `auth.token.wrong.type`               | 401  | 表示令牌类型与当前用途不匹配，例如把刷新令牌当访问令牌使用。 |
| `auth.token.sign.failed`              | 500  | 表示令牌签发过程失败。                                       |
| `account.not.found`                   | 404  | 表示账号不存在。                                             |
| `account.exists`                      | 409  | 表示账号已存在。                                             |
| `account.password.weak`               | 422  | 表示口令强度不足。                                           |
| `account.password.mismatch`           | 422  | 表示原口令校验失败。                                         |
| `account.username.taken`              | 409  | 表示用户名已被占用。                                         |
| `account.profile.locked`              | 409  | 表示账号资料当前不可修改。                                   |
| `account.phone.taken`                 | 409  | 表示手机号已被占用。                                         |
| `verification.disabled`               | 503  | 表示验证码功能已关闭，但接口仍被调用。                       |
| `verification.target.invalid`         | 400  | 表示接收目标格式不正确。                                     |
| `verification.target.missing`         | 400  | 表示按目标类型取不到对应的接收目标。                         |
| `verification.target.not.registered`  | 404  | 表示接收目标未绑定任何账号。                                 |
| `verification.scene.unsupported`      | 400  | 表示不支持的验证码场景。                                     |
| `verification.code.required`          | 400  | 表示未提供验证码。                                           |
| `verification.code.invalid`           | 400  | 表示验证码不正确。                                           |
| `verification.code.expired`           | 400  | 表示验证码已过期。                                           |
| `verification.code.consumed`          | 400  | 表示验证码已被使用。                                         |
| `verification.code.attempts.exceeded` | 429  | 表示校验失败次数超限。                                       |
| `verification.code.too.frequent`      | 429  | 表示发送过于频繁。                                           |
| `verification.code.daily.limit`       | 429  | 表示当日发送次数超限。                                       |
| `verification.channel.unavailable`    | 503  | 表示发送通道未接入。                                         |
| `verification.send.failed`            | 500  | 表示验证码发送失败。                                         |
| `verification.code.generate.failed`   | 500  | 表示验证码生成失败。                                         |
| `verification.code.save.failed`       | 500  | 表示验证码保存失败。                                         |
| `org.not.found`                       | 404  | 表示组织不存在。                                             |
| `org.member.exists`                   | 409  | 表示成员已在组织中。                                         |
| `validate.required`                   | 422  | 表示必填字段缺失。                                           |
| `validate.format`                     | 422  | 表示字段格式不合法。                                         |
| `validate.length`                     | 422  | 表示字段长度不合法。                                         |

## 9. 参数校验规则

字段格式校验失败统一返回 `common.bad.request`，`message` 形如 `参数校验失败: password 需为 8-64 位且同时包含字母和数字`。

| 字段                        | 规则                                        | 提示                             |
| --------------------------- | ------------------------------------------- | -------------------------------- |
| `username`                  | `^[A-Za-z0-9_]{3,32}$`                      | 需为 3-32 位字母、数字或下划线   |
| `password` / `new_password` | 8-64 位，**同时**含字母和数字               | 需为 8-64 位且同时包含字母和数字 |
| `email`                     | 标准邮箱格式，≤ 128                         | 邮箱格式不正确                   |
| `phone`                     | E.164：`+` 开头，1-9 起头，总长 7-15 位数字 | 需为合法国际手机号               |
| `target`（验证码）          | 邮箱或 E.164 手机号，≤ 128                  | 目标格式不正确                   |
| `code`                      | 纯数字，≤ 16 位                             | -                                |
| `nickname`                  | ≤ 64                                        | -                                |

**手机号归一化**：验证码与找回的 target 会去掉分隔符再校验 E.164；缺国家码仍拒绝。注册 phone 会先经过 binding 的 e164 校验，必须提交规范值，例如 `+8613800138000`，带分隔符会返回 common.bad.request。

**邮箱归一化**：统一转小写。注册时 `Demo@Example.com` 与 `demo@example.com` 视为同一账号。

**校验失败示例**

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.bad.request",
        "message": "参数校验失败: password 需为 8-64 位且同时包含字母和数字"
      }
    ],
    "total": 1
  },
  "request_id": "b39715ba-5e85-4995-ade3-6e17dd8d3d4a"
}
```

---

## 附：请求头速查

| 请求头            | 必填           | 说明                                                                   |
| ----------------- | -------------- | ---------------------------------------------------------------------- |
| `Authorization`   | 受保护接口必填 | `Bearer <access_token>`，不接受其他写法                                |
| `Content-Type`    | 带请求体时必填 | `application/json`                                                     |
| `X-Request-Id`    | -              | 链路追踪 ID。不传则服务端生成；会原样回显在响应头与响应体 `request_id` |
| `X-Lang`          | -              | 指定响应语言，优先级最高                                               |
| `Accept-Language` | -              | 标准语言协商头                                                         |

| 响应头             | 说明                         |
| ------------------ | ---------------------------- |
| `X-Request-Id`     | 本次请求的追踪 ID            |
| `Content-Language` | 实际生效的语言               |
| `Vary`             | 语言协商相关头的缓存变体标记 |
