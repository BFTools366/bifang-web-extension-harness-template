# 通用响应、异常与分页模型

这些是已采用基础服务的 REST 原始合同与当前边界校验依据；当前认证/系统为内存服务协议 Mock，未完成真实 HTTP 联调。GraphQL 使用独立 data/errors[]，不套 REST envelope。以下示例均为虚构脱敏说明。

## 通用 Header 与字段约定

| 名称          | 必填 | 值或格式               | 说明                                         |
| ------------- | ---- | ---------------------- | -------------------------------------------- |
| Content-Type  | 是   | application/json       | JSON 请求体                                  |
| Authorization | 是   | Bearer <access_token>  | 受保护操作访问凭据                           |
| X-Lang        | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id  | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

上表 Authorization 仅受保护请求必填，Content-Type 仅有 JSON 请求体时必填。公开登录、注册、验证码、找回及刷新不带旧访问凭据。响应 Header 为 X-Request-Id、Content-Language、Vary、实际 Content-Type；REST JSON request_id 仍保留，追踪不是 continuation、会话版本或幂等键。基础公共 client 的 X-AUTH-TOKEN / X-Http-Request 协议与这里不同，不能只配置地址就当成 Bearer 服务适配。

ID 保持字符串；时间字段为 Unix 秒，expires_in/resend_after 是持续秒数；nullable 与字段可省略分别记录。示例的账号 status=1/0 只描述账号，不定义商品或订单状态。

## 单对象成功响应

```json
{
  "model": "account",
  "data": {
    "id": "2108046372081659904",
    "username": "example_user",
    "email": "user@example.com",
    "phone": null,
    "nickname": "示例用户",
    "status": 1,
    "last_login_at": 1791432395,
    "last_login_ip": "",
    "created_time": 1791432395,
    "updated_time": 1791432395
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径           | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                                                                                                                                            |
| ------------------ | --------- | --------- | ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model              | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "account"                                                                                                                                                                                                                         |
| data               | object    | 是        | 否   | 当前操作的结果对象                              | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395} |
| data.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                     | "2108046372081659904"                                                                                                                                                                                                             |
| data.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字或下划线               | "example_user"                                                                                                                                                                                                                    |
| data.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写           | "user@example.com"                                                                                                                                                                                                                |
| data.phone         | string    | 是        | 是   | E.164 手机号；未填写时为 null                   | null                                                                                                                                                                                                                              |
| data.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名        | "示例用户"                                                                                                                                                                                                                        |
| data.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                        | 1                                                                                                                                                                                                                                 |
| data.last_login_at | number    | 是        | 是   | 最近登录时间，Unix 秒整数；未登录时为 null      | 1791432395                                                                                                                                                                                                                        |
| data.last_login_ip | string    | 是        | 否   | 最近登录 IP；未登录时为空字符串                 | ""                                                                                                                                                                                                                                |
| data.created_time  | number    | 是        | 否   | 创建时间，Unix 秒整数                           | 1791432395                                                                                                                                                                                                                        |
| data.updated_time  | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本             | 1791432395                                                                                                                                                                                                                        |
| request_id         | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                                                                                                                                            |

同为 model:account，注册 data 是 Account，profile data 是 {account,org}；必须结合操作核对结果。登录/刷新则是 model:auth.token，data 包含 token 与 account。

## 空结果

HTTP 200 JSON；没有 data，不能伪造 data:null、空对象或 204。

```json
{
  "model": "empty",
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径   | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                 |
| ---------- | --------- | --------- | ---- | ----------------------------------------------- | -------------------------------------- |
| model      | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "empty"                                |
| request_id | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001" |

## 数据集

服务固定契约，暂无已实现业务 endpoint；此处元素仅演示字段位置，不定义新的领域模型。total 为集合总数。

```json
{
  "model": "data.set",
  "datas": [
    {
      "id": "2108046372081659904"
    }
  ],
  "total": 1,
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径   | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                 |
| ---------- | --------- | --------- | ---- | ----------------------------------------------- | -------------------------------------- |
| model      | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                             |
| datas      | array     | 是        | 否   | 数据元素数组                                    | [{"id":"2108046372081659904"}]         |
| datas[]    | object    | 是        | 否   | 领域对象示例；真实元素结构由具体操作定义        | {"id":"2108046372081659904"}           |
| datas[].id | string    | 是        | 否   | 字符串标识，不转换为 Number                     | "2108046372081659904"                  |
| total      | number    | 是        | 否   | 非负整数计数，具体口径见所在模型                | 1                                      |
| request_id | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001" |

## 分页数据集

以固定 Go 快照的 response.Page 实际编码为准，暂无已实现列表 endpoint。result.datas 仅为本页元素；page.total 与 result.total 均为查询匹配总数。request_id 位于 result 内；page 不输出 model 或 total_page，顶层不输出 request_id。总页数由客户端计算。

```json
{
  "model": "grid.result",
  "page": { "current": 1, "size": 10, "total": 1 },
  "result": {
    "model": "data.set",
    "datas": [{ "id": "2108046372081659904" }],
    "total": 1,
    "request_id": "00000000-0000-4000-8000-000000000001"
  }
}
```

| 字段路径          | JSON 类型 | 必填/必有 | 可空 | 说明与约束                           |
| ----------------- | --------- | --------- | ---- | ------------------------------------ |
| model             | string    | 是        | 否   | 当前分页模型判别标识                 |
| page              | object    | 是        | 否   | 分页元数据                           |
| page.current      | number    | 是        | 否   | 从 1 开始的页码                      |
| page.size         | number    | 是        | 否   | 每页条数，1–200                      |
| page.total        | number    | 是        | 否   | 查询匹配总数                         |
| result            | object    | 是        | 否   | 当前页数据集                         |
| result.model      | string    | 是        | 否   | data.set                             |
| result.datas      | array     | 是        | 否   | 本页领域对象                         |
| result.datas[].id | string    | 是        | 否   | 示例对象的字符串 ID，不转换为 Number |
| result.total      | number    | 是        | 否   | 必须与 page.total 相同               |
| result.request_id | string    | 是        | 否   | 当前请求追踪标识，不是幂等键         |

### 原始分页参数

| 参数     | 位置  | 类型    | 默认值 | 说明与约束                            |
| -------- | ----- | ------- | ------ | ------------------------------------- |
| current  | query | integer | 1      | 从 1 开始                             |
| size     | query | integer | 10     | 最大 200；越界回落默认                |
| order_by | query | string  | 未指定 | 按实际模型字段白名单；非法字段回落 id |
| order    | query | string  | desc   | asc / desc                            |

客户端保留从 1 开始的页码，显式提交每页条数；展示前核对两处总数和页内条数，再计算总页数。上述 REST 分页仅为来源固定模型，目前没有业务列表消费者；新远端列表使用 GraphQL，不据此新增 REST 列表。

## 统一异常

所有基础服务 REST JSON 错误均采用以下形状，按首项稳定 code 与 HTTP 状态处理，不匹配 message；客户端内部错误不是此服务报文。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.bad.request",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                          |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                        |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.bad.request","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                      |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.bad.request","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 一条稳定错误对象                                | {"model":"error","code":"common.bad.request","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                         |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码，HTTP 与触发条件见下表               | "common.bad.request"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                  |
| errors.total           | number    | 是        | 否   | 错误条数，与 errors.datas 长度一致              | 1                                                                                                               |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                          |

## 稳定错误码

下表来自已采用参考服务；列出合同不代表所有服务端基础设施故障都由当前 Mock 模拟。各操作实际适用分支见对应模块。

| 错误码                              | HTTP | 触发条件                                               |
| ----------------------------------- | ---- | ------------------------------------------------------ |
| common.bad.request                  | 400  | 请求参数错误                                           |
| common.bad.request                  | 400  | 参数校验失败，`message` 里带具体字段与原因             |
| validate.json.syntax                | 400  | 请求体不是合法 JSON                                    |
| validate.type.mismatch              | 400  | 字段类型不匹配                                         |
| common.forbidden                    | 403  | 无访问权限                                             |
| common.not.found                    | 404  | 资源不存在                                             |
| common.route.not.found              | 404  | 接口不存在                                             |
| common.method.not.allowed           | 405  | 请求方法不被允许                                       |
| common.conflict                     | 409  | 资源已存在                                             |
| common.too.many.requests            | 429  | 触发限流                                               |
| common.database.error               | 500  | 数据库操作异常                                         |
| common.internal.error               | 500  | 服务内部异常                                           |
| auth.token.missing                  | 401  | 缺少鉴权令牌（或用了不支持的携带方式）                 |
| auth.token.malformed                | 401  | 令牌格式非法，期望 `Bearer <token>`                    |
| auth.token.invalid                  | 401  | 令牌无效                                               |
| auth.token.expired                  | 401  | 令牌已过期                                             |
| auth.token.revoked                  | 401  | 令牌已失效（登出 / 改密 / 重置密码后）                 |
| auth.token.wrong.type               | 401  | 令牌类型不正确（如用刷新令牌访问接口）                 |
| account.not.found                   | 404  | 账号不存在或已注销                                     |
| auth.credentials.invalid            | 401  | 账号或密码错误（**不区分账号是否存在**）               |
| account.password.mismatch           | 422  | 原密码错误                                             |
| auth.account.disabled               | 403  | 账号已被禁用                                           |
| auth.token.sign.failed              | 500  | 令牌签发失败                                           |
| account.not.found                   | 404  | 账号不存在                                             |
| account.username.taken              | 409  | 用户名已被占用                                         |
| account.exists                      | 409  | 邮箱已被注册                                           |
| account.phone.taken                 | 409  | 手机号已被注册                                         |
| account.create.failed               | 500  | 创建账号失败                                           |
| account.update.failed               | 500  | 更新账号失败                                           |
| account.password.hash.failed        | 500  | 密码加密失败                                           |
| verification.disabled               | 503  | 验证码功能未启用                                       |
| verification.target.invalid         | 400  | 接收目标格式不正确                                     |
| verification.target.missing         | 400  | 缺少指定类型的接收目标                                 |
| verification.target.not.registered  | 404  | 目标尚未注册（`reset_password` 场景）                  |
| verification.scene.unsupported      | 400  | 不支持的验证码场景                                     |
| verification.code.required          | 400  | 请先获取验证码                                         |
| verification.code.invalid           | 400  | 验证码不正确（**也覆盖「没发过 / 已用过 / 被顶掉」**） |
| verification.code.expired           | 400  | 验证码已过期                                           |
| verification.code.consumed          | 400  | 验证码已被使用（并发抢同一个码时失败的一方）           |
| verification.code.attempts.exceeded | 429  | 验证码错误次数过多                                     |
| verification.code.too.frequent      | 429  | 发送过于频繁，`message` 带需等待秒数                   |
| verification.code.daily.limit       | 429  | 当日发送次数已达上限                                   |
| verification.channel.unavailable    | 503  | 发送通道未配置                                         |
| verification.send.failed            | 500  | 验证码发送失败                                         |
| verification.code.generate.failed   | 500  | 验证码生成失败                                         |
| verification.code.save.failed       | 500  | 验证码保存失败                                         |
| org.not.found                       | 404  | 组织不存在                                             |
| org.create.failed                   | 500  | 创建组织失败（注册时初始化默认组织失败）               |

参考全局限流默认 50 rps、突发 100，开发环境默认关闭；当前 Mock 未实现该全局 IP 中间件。验证码发送/重发/尝试限制另按认证操作执行。当前 Mock 对已用验证码返回 verification.code.invalid；verification.code.consumed 是来源并发分支，不能声称内存实现复现了数据库竞争。
