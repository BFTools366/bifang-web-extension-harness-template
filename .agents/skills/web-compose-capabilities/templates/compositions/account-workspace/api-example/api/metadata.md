# API 元数据

## 用途与合同

账号和系统采用已提供的基础服务 1.0.0 参考合同；认证 REST 路径使用 v1，GraphQL 与存活探针未声明独立 API 版本。实际全部为内存协议 Mock，尚未接入 HTTP。仅使用服务相对路径，不包含环境地址。

| API 版本   | 状态                              | 操作范围                               | 兼容/弃用说明                          |
| ---------- | --------------------------------- | -------------------------------------- | -------------------------------------- |
| v1         | 服务契约已定义，当前示例 API Mock | 八个认证 REST、系统健康 REST           | 未接入 HTTP，来源固定模型继续保留      |
| 未声明版本 | 示例 API Mock                     | 存活探针、GraphQL health/me 及账号组合 | 组合复用相同根字段，不新增 Schema 能力 |

## 操作目录

| 操作标识                    | 接口名称                             | 版本       | 操作类型   | 协议    | 实现状态      | 接口文档                                                                       | 关联业务                           |
| --------------------------- | ------------------------------------ | ---------- | ---------- | ------- | ------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| v1-verification-code        | 发送验证码                           | v1         | 写操作     | REST    | 示例 API Mock | [发送验证码](account.md#v1-verification-code)                                  | [账号流程](../business/account.md) |
| v1-register                 | 注册账号                             | v1         | 写操作     | REST    | 示例 API Mock | [注册账号](account.md#v1-register)                                             | [账号流程](../business/account.md) |
| v1-login                    | 登录                                 | v1         | 写操作     | REST    | 示例 API Mock | [登录](account.md#v1-login)                                                    | [账号流程](../business/account.md) |
| v1-refresh                  | 刷新令牌                             | v1         | 写操作     | REST    | 示例 API Mock | [刷新令牌](account.md#v1-refresh)                                              | [账号流程](../business/account.md) |
| v1-password-reset           | 重置密码                             | v1         | 写操作     | REST    | 示例 API Mock | [重置密码](account.md#v1-password-reset)                                       | [账号流程](../business/account.md) |
| v1-logout                   | 退出登录                             | v1         | 写操作     | REST    | 示例 API Mock | [退出登录](account.md#v1-logout)                                               | [账号流程](../business/account.md) |
| v1-profile                  | 读取当前账号与默认组织               | v1         | 单对象查询 | REST    | 示例 API Mock | [读取当前账号与默认组织](account.md#v1-profile)                                | [账号流程](../business/account.md) |
| v1-password-change          | 修改密码                             | v1         | 写操作     | REST    | 示例 API Mock | [修改密码](account.md#v1-password-change)                                      | [账号流程](../business/account.md) |
| unversioned-account-me      | 当前账号查询（me）                   | 未声明版本 | 单对象查询 | GraphQL | 示例 API Mock | [当前账号查询（me）](account.md#unversioned-account-me)                        | 当前无客户端调用方                 |
| unversioned-account-context | 账号上下文组合查询（AccountContext） | 未声明版本 | 单对象查询 | GraphQL | 示例 API Mock | [账号上下文组合查询（AccountContext）](account.md#unversioned-account-context) | [账号流程](../business/account.md) |
| unversioned-liveness        | 存活探针                             | 未声明版本 | 单对象查询 | REST    | 示例 API Mock | [存活探针](system.md#unversioned-liveness)                                     | 当前无客户端调用方                 |
| v1-system-health            | 系统健康检查                         | v1         | 单对象查询 | REST    | 示例 API Mock | [系统健康检查](system.md#v1-system-health)                                     | 当前无客户端调用方                 |
| unversioned-graphql-health  | 服务健康查询（health）               | 未声明版本 | 单对象查询 | GraphQL | 示例 API Mock | [服务健康查询（health）](system.md#unversioned-graphql-health)                 | 当前无客户端调用方                 |

## 协议补充

- 受保护基础服务请求采用 Authorization: Bearer；公开登录、注册、验证码、找回和刷新隔离旧访问凭据，刷新值仅放刷新 JSON。X-Lang 与单次 X-Request-Id 走 Header，REST request_id 与本次追踪一致；GraphQL 不套 REST envelope。
- [通用结构](common.md)保留成功、空结果、异常与固定分页模型。客户端通用传输仍兼容独立的 X-AUTH-TOKEN / X-Http-Request continuation 协议；它与本服务 Bearer/单次追踪分开，不表示真实业务已接通。取消、超时、网络和配置错误没有服务 HTTP 错误体。
- REST 按状态、内容类型、追踪、model 与操作对象联合校验。GraphQL 按状态、追踪、data/errors 和字段校验；错误列表及 partial data 不进入完整账号上下文，错误按稳定 code 处理，不显示或解析消息正文。
- 当前 GraphQL Mock 支持无参数命名/匿名 query、别名、嵌套、注释、__typename 和兼容的重复选择合并；明确拒绝 fragment、变量、指令、Mutation、Subscription、参数及请求体的 variables/operationName。来源 SDL 与模拟支持范围分开。
- 有状态模拟明确服务重置与客户端共享。引用、访问值和刷新值独立生成，原始令牌对只留服务内存，不写日志或持久化、不注入真实 HTTP。只存演示引用不构成跨服务恢复保证。

## 本次同步

本轮局部核对认证、账号菜单、账号资料与公开设置消费者。偏好移至独立公开设置页，认证页改为底部导航并补占位提示；公开设置不初始化认证或监听认证记录变化，返回保留可信来源和安全业务目标。接口、报文字段和既有双向操作关联未变化，其余13个公开操作与基础参考合同未在本轮重新全量核对。

既有边界：模拟会话仅同服务查表恢复，显式重置与独立服务均使旧引用失效；可控报文边界校验取消、状态、追踪和原始 DTO。新注册账号不继承固定演示身份的成员组织与能力，缺少成员作用域时保持恢复入口。

未知：真实服务地址、CORS、成员组织/权限、真实资金及分发渠道仍未接入或确认。模拟测试不证明这些能力成立。
