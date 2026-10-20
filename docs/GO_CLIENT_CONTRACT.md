# Go Harness 与客户端能力合同

数据结构与接口以 [Go Harness 63617d62f76f3ddc6b27a6861b3fb5acf36a9dc2](https://github.com/BFTools366/bifang-golang-harness-template/tree/63617d62f76f3ddc6b27a6861b3fb5acf36a9dc2) 的实际代码为基准。来源资产及摘要见 [UPSTREAM.json](../.agents/skills/go-implement-service/assets/UPSTREAM.json)。知识库表达实施规则，catalog 表达操作选择；二者都不能证明服务已有对应 endpoint。

## 支持与缺口

| 能力        | Go 现有实现                                        | 客户端资源与边界                                                                   |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 用户/账号   | 注册、用户名或邮箱登录、本人资料、刷新、退出、改密 | 登录/会话有基础应用；注册/资料等由 users Skill 增量接线，真实 adapter 提供这些请求 |
| 客户管理    | 无 Customer、联系人、客户归属及管理端账号 CRUD     | 不把 Account 或 Org 冒充 CRM；须先实施真实模型和合同                               |
| 组织        | 注册事务创建默认 Org、读取本人默认 Org             | switch/manage 有通用模板，但上游没有切换、改名、成员/邀请接口                      |
| 权限        | Bearer 身份、账号状态、token_version               | 前端提供访问控制；上游没有角色、权限码、RBAC 或权限读取接口，未知默认拒绝          |
| 验证码/找回 | 条件资产有接口和生命周期                           | 默认装配不挂载，SMTP/HTTP 发送器未配置；选中后需真实投递，不启用开发回显           |
| GraphQL     | health、me                                         | 无客户、组织成员、角色等集合查询；按操作补 SDL/resolver，不能从基础 me 推断        |

组织私有完整方案仍须满足本地既定的 Account + Organization + OrganizationUser 基线。当前 install-users 装配器在上游之上增加 owner 成员事务和 profile.organization_user；这是明确的 Workspace 扩展，原始 Go Harness 没有该实体。profile 返回的是自有默认组织，不是加入其他组织后的任意当前组织；当前组织权限必须另从真实成员及权限合同读取。

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

| 操作         | 方法与相对路径          | 请求 JSON                                                   | 成功 data/model                             |
| ------------ | ----------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| 注册         | POST /register          | username,email,password；可选 phone,nickname,code,code_type | Account / account，不签发 Token             |
| 登录         | POST /login             | account,password                                            | {token,account} / auth.token                |
| 本人资料     | GET /profile（authed）  | 无                                                          | {account,org} / account；Workspace 追加成员 |
| 刷新         | POST /refresh（public） | refresh_token                                               | {token,account} / auth.token                |
| 退出         | POST /logout（authed）  | 无                                                          | empty，HTTP 200                             |
| 改密         | PUT /password（authed） | old_password,new_password                                   | empty，HTTP 200                             |
| 发码（条件） | POST /verification-code | target,target_type,scene                                    | verification.code                           |
| 找回（条件） | POST /password/reset    | target,target_type,code,new_password                        | empty，HTTP 200                             |

REST 对象 {model,data,request_id}；empty 没有 data；失败 {model:"errors",errors:{model:"data.set",datas:[{model:"error",code,message}],total},request_id}。分页实际为 {model,page:{current,size,total},result:{model:"data.set",datas,total,request_id}}，没有 page.model、page.total_page 或顶层 request_id。集合读取仍使用 GraphQL，分页参考不授权生成 REST 列表。

前端桥接只把受管 X-AUTH-TOKEN 转为 Bearer，移除 continuation，逐请求生成 X-Request-Id；zh_CN/zh 转 zh-CN，其他当前支持语言转 en-US。X-Request-Id 仅用于关联，不是幂等键。错误按 HTTP 状态和稳定 code 处理，403 不凭状态自动注销普通业务会话。

## Token 生命周期

- access 与 refresh 类型互斥；只把 access 提交给 HTTP owner。expires_in 来自服务，不能当作授权依据或自动重放条件。
- refresh 重新签发令牌对，但不更新 token_version、不保存 jti，也不撤销旧 refresh；同秒可能签发相同 Token。前端显式 refresh 方法返回结果，不自动采用、持久化或重放。
- logout 自增账号 token_version，撤销该账号全部设备的 access/refresh。不能实现“只退出本设备”或当作未采用签发的窄化回收。
- 改密、找回更新密码并递增版本，旧访问/刷新令牌全部失效；成功后由唯一会话 owner 清理，失败或未知结果不自动重放。
- Authenticate 区分 auth.token.expired/malformed/wrong.type/invalid/revoked。Refresh 的解析失败统一 auth.token.invalid；账号缺失为 account.not.found（404），禁用为 auth.account.disabled（403），版本不匹配为 auth.token.revoked（401）。

真实 adapter 保持默认 workspace 模式，要求成员扩展。连接未扩展的 Go Harness 时显式调用 createGoIdentityAdapter(config, "upstream")；readServiceProfile 返回原始资料，readProfile 仅用于 Workspace 完整资料。基础会话 login 只采用 access；refresh 令牌存储、轮换协调及 UI 仍需按明确需求接入唯一 owner。

## 回归边界

源测试 `tests/go-identity-contract.test.ts` 编译生成服务和前端 adapter，使用隔离 SQLite 与真实 HTTP 验证注册、重复注册、错误密码、完整资料、刷新复用、改密/退出撤销及重启持久化；协议回归另覆盖 nullable org 与成员扩展隔离、空昵称、秒时间、Bearer/追踪及 continuation 边界。历史 Mock 只作测试参考，其固定身份和权限不属于 Go 服务合同。
