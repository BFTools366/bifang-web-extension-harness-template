# Go 服务工程与协议

Go 服务是 Workspace 中的 `_server` 成员，Git、产品规格、Task、策略和 API 文档归根。技术资产来源和校验摘要见 [固定 Go 快照](../.agents/skills/go-implement-service/assets/UPSTREAM.json)，双语许可原文随资产保留。此文按迁入代码校准知识，不继承上游独立初始化、版本或发布流程。

## 基线与分层

Go >=1.26.0；具体依赖版本见服务 `go.mod/go.sum`。迁入 Gin 1.12.0、GORM 1.31.2、SQLite、Viper 配置、validator、logrus、日志轮转、雪花 ID、请求 ID、i18n、CORS、限流、Swagger 和优雅退出。默认持久化为 SQLite，驱动声明不意味着授权创建 MySQL/PostgreSQL 服务。

```text
cmd/server → bootstrap → api/v1 → service → repository → database
                         ↓
                    middleware / pkg
```

service 只收 context.Context 和领域 DTO，不依赖 Gin；handler 负责解码、调用、响应映射。中间件通过窄接口消费认证服务，模块自行装配领域依赖，bootstrap 只拥有进程级资源。规则、状态转换和业务默认值归 service；持久化归 repository；认证上下文不由客户端 ID 决定。

中性服务只提供 `GET /healthz` 与 `GET /api/v1/system/health-check`。业务只随具体需求添加，实体进入 `AllModels()`，模块进入 `Modules()`；不得生成无消费者的表、入口或占位 API。开发空库 AutoMigrate 不代表生产迁移已授权或已验证。

Go 命令始终在服务成员执行：`go test ./...`、`go vet ./...`、`go build -o bin/server ./cmd/server`。工具链不存在或低于下界时按实际失败诊断，仅安装/升级受影响全局工具，不引入项目 shim 或隐式下载替代工具链。

## HTTP 协议

身份使用 `Authorization: Bearer <access_token>`，请求关联使用 `X-Request-Id`，响应关联为 `request_id`。前端旧 `X-AUTH-TOKEN` 必须显式映射，`X-Http-Request` continuation 不能改名成 request_id 冒充同一语义。语言首选 `X-Lang`，备选 Accept-Language；适配 en/zh_CN 与服务 en-US/zh-CN 资源。

REST 单对象：`{model,data,request_id}`；空结果为 HTTP 200 `{model:"empty",request_id}`；失败是 `{model:"errors",errors:{model:"data.set",datas:[{model:"error",code,message}],total},request_id}`。错误码稳定，UI 不把服务 message 直接当本地化键。

分页实际形状：`{model,page:{current,size,total},result:{model:"data.set",datas,total,request_id}}`。上游文档的 `page.total_page` 和顶层 request_id 并未由当前代码输出；消费者按真实形状解析，不编造字段。带查询条件的远端读取与远端集合必须按 [工程规则](ENGINEERING_RULES.md) 和 [数据访问协议](DATA_ACCESS.md#12-rest-与-graphql-分工) 使用 GraphQL；REST 单对象或分页能力不代表可以绕过该约定。

ID 一律字符串，时间单位显式为 Unix 秒，前端不得当毫秒或 Number ID。GraphQL 使用标准 `{data,errors}`，不套 REST 信封。业务查询的 SDL、resolver 和授权随操作实施；基础 health/me 不能冒充商品、成员、订单等列表。

CORS 按真实前端 Origin 和 headers 配置，拒绝无依据通配凭据；Extension host 权限另按已授权服务精确配置，不因存在 BaseURL 自动增加宽权限。

客户端能力、原始 DTO、操作矩阵与扩展边界统一见 [Go 客户端合同](GO_CLIENT_CONTRACT.md)。它明确区分上游账号自服务、Workspace 成员扩展、未实现 CRM 与角色权限接口。

## 身份、组织与验证码

本地完整账号装配在上游之上增加八表团队 RBAC、邀请、成员/角色版本、真实 GraphQL 集合和 REST 写入，唯一规则见 [ACCOUNT_OWNERSHIP.md](ACCOUNT_OWNERSHIP.md)。权限按成员角色与角色权限的并集计算，owner 无授权旁路，前端只判断有效 code。资产位于 go-implement-service/assets/team-baseline；首次装配在隔离副本按 SDL 生成真实 gqlgen 代码再写回。TeamOwned、MemberOwned 是新增领域实体可嵌入的归属字段，RequireTeamResource 必须进入实际领域读写事务。

上游账号条件资产提供真实 SQLite 密码哈希、JWT、注册/登录/profile/refresh/logout/已登录改密；不是完整用户方案。完整用户模块需要同一注册事务创建账号、自有组织和 owner 成员，组织 ID 与成员授权主体分开。

上游 logout 自增账号 token_version，会撤销该账号所有会话；refresh 没有单 refresh token 的轮换撤销语义。实施者需按需求明确该行为，不能在前端假设只退出当前设备或宣称 refresh 单次轮换。非开发环境必须拒绝公开默认 JWT 密钥，实际秘密由服务端环境注入。

自建邮箱注册默认启用验证码、发码入口及验证码表；仅基础登录不增加这些功能。原始快照不修改，本地 verification overlay 提供 SMTP TLS 与完整生命周期。没有邮件服务时 dev 默认模拟投递，随机码随开发回执返回并直接显示在当前注册表单，提示暂未接通邮件发送；账号创建和验证码校验仍由真实服务完成。接通 SMTP 时同时关闭 mock，真实回执省略 code，页面移除回显。非 dev 与找回拒绝 Mock；投递未知不自动重发，真实模式配置缺失明确失败。

## 验证与协作

领域变化运行相关非空 Go 测试；handler、装配、协议或持久化变化还需实际 HTTP 和临时数据库覆盖成功、鉴权/授权失败与恢复。验证注册/登录等流程时重启后再读取或登录，证明持久化；业务联调同时验证前端实际请求及错误反馈。测试替身不能代替真实服务连通证据。

正式发布不照搬上游独立 Git/tag 流程，按根当前请求明确目标平台、配置、制品与部署责任；未测试平台标为 Unverified。根前端构建仍遵循各成员现有候选门禁。

GraphQL 原始 generated.go 引导快照单独保存于资产 generated/（真实 gqlgen 输出）；装配时恢复目标原路径并替换身份，再按当前 SDL 生成，不能把该快照当成人工业务代码。具体顺序归 go-implement-graphql。上游 README 保留来源原文，其独立问卷、Mock、初始化命令和“生成物在原路径”陈述均由当前 Skills 合同取代。

生成器修正上游日志：正文日志关闭时不捕获请求/响应正文；显式调试时仅保留有界副本，超过 1 MiB 的正文不记入日志，实际数据、读取错误与关闭语义完整透传。自定义敏感键与固定敏感键合并，TokenPair、Cookie 和认证/continuation 请求头不允许原文进入日志。默认开发关闭请求/响应正文与请求头日志。

## 上游能力归属与日常开发

| 上游职责                                                                | 本 Workspace 中的归属                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| implement-change、add-http-adapter、refactor-code、extract-i18n-strings | go-implement-service，按需委托底层 Skill；不重新定义产品         |
| Go 初始化与改名                                                         | 唯一 Workspace 创建器与固定成员命名，不分发独立 Go 问卷          |
| product、plan、Task、Git、历史与策略                                    | 复用根对应已有流程，不创建第二份生命周期                         |
| build-local、测试与真实接口走查                                         | go-build-local、go-test-service                                  |
| release、版本、候选及收集                                               | 按根明确发布请求绑定服务成员、平台与产物；本机编译不冒充正式发布 |
| Harness 升级                                                            | 既有独立单包升级维持原范围，Workspace 迁移须另行实施合同         |

外部 HTTP 适配器持有可复用且有总超时的 http.Client，用 NewRequestWithContext；非 2xx、超限响应、非法结构与网络失败区分处理。限制响应体大小并关闭 Body；重试只用于已确认可重试的操作，不重放未知写入。秘密只从服务端配置注入，不返回浏览器配置或日志。

配置按默认值、配置文件与显式环境覆盖加载，并在进程资源启动前验证；开发与生产不得共享弱密钥；未接邮件时默认模拟投递仅允许 dev 注册，非 dev 启动校验拒绝。日志只包含稳定事件、请求关联和安全字段，错误响应使用已定义的错误码与服务端 i18n，支持 zh-CN/en-US；新增错误同步资源，禁止把内部错误、SQL 或秘密原文返回前端。

并发工作必须有 context 取消、明确拥有者与退出等待；不在锁内阻塞 I/O，不持有请求 Context 启动失去归属的后台 goroutine。共享写状态与事务竞态需要相关 go test -race 证据，资源关闭遵守唯一归属。纯计算与领域不变量可独立于 HTTP/ORM 测试，不为单次调用预建通用框架。

行为保持重构按真实职责拆同包文件，不增加空壳转发或兜底 utils/common；只有独立依赖、生命周期或权限边界才建立子包。受改 Go 稳定声明紧邻中文职责注释；Go 401–800 行需复核，801 行起按职责拆分，上游生成物与手写 resolver 分开。性能修改须有真实瓶颈或基准，不凭预感优化。死锁、超时、泄漏或热点定位调用 `$workspace-review-performance` 只读审查。源 Harness 中的 Go 资产按工程规则“其他受管人工文本”500/2000 行门禁校验，上述 401–800 行复核用于下游 Go 成员。
