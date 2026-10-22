# Go Harness 与客户端能力合同

数据结构与接口以 [Go Harness 63617d62f76f3ddc6b27a6861b3fb5acf36a9dc2](https://github.com/BFTools366/bifang-golang-harness-template/tree/63617d62f76f3ddc6b27a6861b3fb5acf36a9dc2) 的实际代码为基准。来源资产及摘要见 [UPSTREAM.json](../.agents/skills/go-implement-service/assets/UPSTREAM.json)。知识库表达实施规则，catalog 表达操作选择；二者都不能证明服务已有对应 endpoint。

## 支持与缺口

| 能力        | Go 现有实现                                        | 客户端资源与边界                                                                                  |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 用户/账号   | 注册、用户名或邮箱登录、本人资料、刷新、退出、改密 | 登录/会话及可选邮箱注册有应用模板；资料按 users Skill 增量接线，真实 adapter 提供对应请求         |
| 客户管理    | 无 Customer、联系人、客户归属及管理端账号 CRUD     | 不把 Account 或 Org 冒充 CRM；须先实施真实模型和合同                                              |
| 组织        | 注册事务创建默认 Org、读取本人默认 Org             | switch/manage 有通用模板，但上游没有切换、改名、成员/邀请接口                                     |
| 权限        | Bearer 身份、账号状态、token_version               | 前端提供访问控制；上游没有角色、权限码、RBAC 或权限读取接口，未知默认拒绝                         |
| 验证码/找回 | 条件资产有接口和生命周期                           | 自建邮箱注册默认挂载；无邮件服务时 dev 模拟投递并在表单回显，真实 SMTP 关闭回显，找回要求真实投递 |
| GraphQL     | health、me                                         | 无客户、组织成员、角色等集合查询；按操作补 SDL/resolver，不能从基础 me 推断                       |

上表描述固定上游快照，不代表本地扩展的全部能力。本地 install-users 在上游之上装配八表 RBAC、组织邀请/成员/角色/权限、GraphQL 查询和 REST 命令；数据归属及不变量的唯一来源是 [ACCOUNT_OWNERSHIP.md](ACCOUNT_OWNERSHIP.md)。profile 仍只返回账号与自有默认组织，当前工作组织从 teamContext 读取，不能混用。

## 本地个人设置

完整 identity.workspace 提供独立 /account/settings 与 /account/password，不进入业务侧栏。账号菜单显示可信邮箱/昵称摘要、切换组织、个人设置、修改密码和退出；组织管理分组包含组织设置、成员管理、角色管理，各按读取码控制。详见 [Auth 标准](ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)。

- GET /api/v1/auth/profile：权威读取当前账号、邮箱及昵称；组织切换不改变个人资料。
- PATCH /api/v1/auth/profile：仅提交 nickname，trim 后 1–64 个字符；目标账号由认证上下文确定，不接受账号、邮箱或组织更改。成功返回 empty，客户端权威重读资料并刷新唯一 session；失败或未知不自动重放。
- PUT /api/v1/auth/password：old_password、new_password；沿用原有新密码校验和并发规则。成功撤销全部旧 access/refresh，页面清本地会话并返回登录；未知结果通过重新登录核对。

昵称 PATCH 是本地 overlay 新增合同，原始快照与已有外部服务不自动具备。前端 personalSettingsApi 复用当前 HTTP owner，不读取 Token；个人页不要求组织业务权限，与公开语言/外观 /settings 分开。

## 本地组织接口

以下均为本地 overlay 的实际合同，原始快照和外部已有服务不自动具备。REST 前缀 /api/v1/auth/teams；全部需要有效 Bearer。ID 为字符串，字段为 camelCase，成功空结果沿用既有 empty 信封。

| 操作                  | 方法 / 路径                              | JSON                                                          |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| 切换组织              | POST /switch                             | organizationId                                                |
| 组织改名              | PUT /name                                | organizationId, name                                          |
| 定向邀请              | POST /invitations                        | organizationId, email；返回 team.invitation 对象及 id/version |
| 接受 / 拒绝 / 撤销    | POST /invitations/accept、reject、revoke | invitationId, version                                         |
| 本人退出 / 管理员移除 | POST /members/remove                     | organizationId, memberId, version                             |
| 修改组织内成员昵称    | PUT /members/nickname                    | organizationId, memberId, version, nickname                   |
| 替换成员自定义角色    | PUT /members/roles                       | organizationId, memberId, version, roleIds                    |
| 创建角色              | POST /roles                              | organizationId, code, name, codes                             |
| 修改角色名称和权限    | PUT /roles                               | organizationId, roleId, version, name, codes                  |
| 删除角色              | POST /roles/remove                       | organizationId, roleId, version                               |

POST /graphql 使用标准 data/errors；实际 SDL 随服务生成在 internal/graphql/team.graphqls。teamContext 返回 current 和有效成员组织 available；teamMembers(organizationId,page,pageSize) 与 teamInvitations(organizationId?,page,pageSize) 返回 items/total，page 从 1 起、pageSize 1–100。未指定组织的邀请查询只读本人收到的邀请，指定组织则要求 team.members.read + team.members.invite。teamPermissions(organizationId,subjectId) 只返回当前账号在该组织真实成员的权限；teamPermissionCatalog(organizationId) 要求 team.roles.read，只返回操作者可授予的有效权限。错误码沿用 common.forbidden/conflict/bad.request 等既有稳定码，不暴露 SQL。

teamRoles(organizationId,page,pageSize) 要求 team.roles.read，返回角色 items/total；角色字段 id/organizationId/code/name/protected/canManage/version/permissions。角色归组织，角色权限必须来自服务目录；创建、修改和分配角色不得授予操作者自己没有的权限，系统角色不可经客户端更改。

成员投影含 id/accountId/organizationId/displayName/role/status/version/permissions/roleIds/roleNames/canRemove/canAssignRoles；role 是兼容的拥有关系展示标记，不是前端授权依据，permissions 才是经 RBAC 计算的有效 code。canRemove/canAssignRoles 表达目标的对象保护，调用者还必须拥有动作权限。邀请投影含 id/organizationId/organizationName/accountId/status/version/expiresAt（Unix 秒）。成员状态 active/removed；查询只返回 active 成员。邀请状态 pending/accepted/rejected/revoked，过期 pending 在查询中投影为 expired。并发成员/角色变更和邀请续发增加各自版本；未知写结果先查询核对，禁止自动重放。

## 数据结构

REST 字段均保留原始 snake_case；ID 为十进制字符串，Unix 时间为秒数字，计数为安全整数。密码哈希与 token_version 不外发；不从 JWT 解码、owner_id 或账号名称推断权限。

| DTO               | 字段及可空性                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account           | id、username、email、phone（string/null）、nickname（string，可空字符串）、status（0/1）、last_login_at（秒/null）、last_login_ip、created_time、updated_time |
| Org               | id、name、owner_id、is_default、created_time、updated_time                                                                                                    |
| TokenPair         | access_token、refresh_token、token_type="Bearer"、expires_in（正整数秒）                                                                                      |
| 上游 profile      | account: Account，org: Org/null，无 organization_user                                                                                                         |
| Workspace profile | 上游字段 + organization_user: {id, organization_id, account_id, role:"owner"}；缺失/错配失败关闭                                                              |

共享 wire 类型和校验来自 [serviceContract](../.agents/skills/web-compose-capabilities/templates/compositions/account-workspace/data/api/auth/serviceContract.ts.txt)，REST 信封来自 [foundationProtocol](../.agents/skills/web-compose-capabilities/templates/compositions/account-workspace/data/api/foundationProtocol.ts.txt)，实际请求使用 [Go identity adapter](../.agents/skills/workspace-implement-users/assets/go-identity-adapter.ts.txt)。上游 nullable org 可用于最小身份；不能因此宣称完整组织方案已就绪。

GraphQL 另有 camelCase DTO：Account 无 phone，lastLoginTime 对应 REST last_login_at；Org 无 owner_id，字段为 id/name/isDefault/createdTime/updatedTime。返回标准 data/errors，业务码位于 errors[].extensions.code。me 为非空字段；OptionalAuth 会把无效 Token 降为匿名，me 报 auth.token.missing，不保留 REST 的 expired/revoked 细分原因。

## HTTP 操作

下表路径均以 /api/v1/auth 为前缀。public 不携带旧访问令牌；authed 使用 Authorization: Bearer。注册和登录是独立操作。

| 操作         | 方法与相对路径          | 请求 JSON                                                                            | 成功 data/model                             |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| 注册         | POST /register          | 邮箱注册 email,password；已选验证需 code；兼容可选 username,phone,nickname,code_type | Account / account，不签发 Token             |
| 登录         | POST /login             | account,password                                                                     | {token,account} / auth.token                |
| 本人资料     | GET /profile（authed）  | 无                                                                                   | {account,org} / account；Workspace 追加成员 |
| 刷新         | POST /refresh（public） | refresh_token                                                                        | {token,account} / auth.token                |
| 退出         | POST /logout（authed）  | 无                                                                                   | empty，HTTP 200                             |
| 改密         | PUT /password（authed） | old_password,new_password                                                            | empty，HTTP 200                             |
| 发码（条件） | POST /verification-code | target,target_type,scene                                                             | verification.code                           |
| 找回（条件） | POST /password/reset    | target,target_type,code,new_password                                                 | empty，HTTP 200                             |

REST 对象 {model,data,request_id}；empty 没有 data；失败 {model:"errors",errors:{model:"data.set",datas:[{model:"error",code,message}],total},request_id}。分页实际为 {model,page:{current,size,total},result:{model:"data.set",datas,total,request_id}}，没有 page.model、page.total_page 或顶层 request_id。集合读取仍使用 GraphQL，分页参考不授权生成 REST 列表。

前端桥接只把受管 X-AUTH-TOKEN 转为 Bearer，移除 continuation，逐请求生成 X-Request-Id；zh_CN/zh 转 zh-CN，其他当前支持语言转 en-US。X-Request-Id 仅用于关联，不是幂等键。错误按 HTTP 状态和稳定 code 处理，403 不凭状态自动注销普通业务会话。

## Token 生命周期

- access 与 refresh 类型互斥；只把 access 提交给 HTTP owner。expires_in 来自服务，不能当作授权依据或自动重放条件。
- refresh 重新签发令牌对，但不更新 token_version、不保存 jti，也不撤销旧 refresh；同秒可能签发相同 Token。前端显式 refresh 方法返回结果，不自动采用、持久化或重放。
- logout 自增账号 token_version，撤销该账号全部设备的 access/refresh。不能实现“只退出本设备”或当作未采用签发的窄化回收。
- 改密、找回更新密码并递增版本，旧访问/刷新令牌全部失效；成功后由唯一会话 owner 清理，失败或未知结果不自动重放。
- 本地账号 overlay 的改密提交同时比对读取的密码哈希与 token_version；并发改密或读取后的退出导致冲突时返回现有 account.password.mismatch，不能覆盖新密码或跨过撤销。
- Authenticate 区分 auth.token.expired/malformed/wrong.type/invalid/revoked。Refresh 的解析失败统一 auth.token.invalid；账号缺失为 account.not.found（404），禁用为 auth.account.disabled（403），版本不匹配为 auth.token.revoked（401）。

真实 adapter 保持默认 workspace 模式，要求成员扩展。连接未扩展的 Go Harness 时显式调用 createGoIdentityAdapter(config, "upstream")；readServiceProfile 返回原始资料，readProfile 仅用于 Workspace 完整资料。基础会话 login 只采用 access；refresh 令牌存储、轮换协调及 UI 仍需按明确需求接入唯一 owner。

## 回归边界

源测试 `tests/go-identity-contract.test.ts` 编译生成服务和前端 adapter，使用隔离 SQLite 与真实 HTTP 验证注册、重复注册、错误密码、完整资料、刷新复用、改密/退出撤销及重启持久化；协议回归另覆盖 nullable org 与成员扩展隔离、空昵称、秒时间、Bearer/追踪及 continuation 边界。历史 Mock 只作测试参考，其固定身份和权限不属于 Go 服务合同。

## 本地邮箱注册与验证扩展

原始 Go 快照不修改；[注册适配器](../.agents/skills/go-implement-verification/scripts/registration.ts) 在首次 install-users 的冻结 Map 上校准 DTO、名称生成、旧用户名登录和验证码。选择 register 自动补齐 verification，增加验证码表、目标预留锁和发码路由；主配置 mock=false，开发覆盖 mock=true，无邮件服务也可完成真实账号校验。SMTP 通过服务端 APP_VERIFICATION_* 配置，接通时同时设置 MOCK=false，真实回执自动移除页面回显。

注册发码响应为 verification.code，含 target、target_type=email、scene=register、expires_in（秒）、expires_at（Unix 秒）、code_length、resend_after（秒）、mock；仅 dev Mock 含 code。真实回执省略 code。前端映射绝对毫秒期限并校验环境。本次注册发码入口仅允许 register；其他用途（包括大小写/空格变体）明确拒绝。独立接线找回时使用防枚举 empty 响应，拒绝 Mock；找回页面/路由不是注册装配的隐式依赖。

新密码遵循 Go password 校验：8–64 个 UTF-8 字节，同时含 ASCII 字母与数字；Go adapter 导出 registrationPasswordPolicy 供注册表单校验并显示本地化提示。既有账号登录保留旧口令兼容性，不套用新注册规则。

发码先按规范化目标与用途事务预留配额，再单次发送，再确认最新预留并激活；失败/未知不自动重复发送，迟到激活不能替换新码。消费时同时复核状态、到期及尝试次数，和 Account、Org、owner 成员在同一事务提交；失败回滚后原验证码仍可用。生成工程回归覆盖缺码、错码、过期、用途、尝试耗尽、重发、并发额度、并发单次消费和 owner 失败回滚。

teamAssignableRoles(organizationId) 返回有界角色 items/total，只要求 team.members.read 与 team.members.roles.assign。canManage 表达服务计算的角色可操作性；roleNames 与 roleIds 对齐，昵称仅属于成员。全部动作的读取依赖、对象保护、旧码迁移与未知恢复以 [Auth 标准](ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)为准。
