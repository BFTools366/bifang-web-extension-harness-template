<a id="v1-verification-code"></a>

## 接口名称

发送验证码

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 向邮箱或国际手机号发送指定用途验证码；register 与 reset_password 隔离，找回要求目标已注册。有效期 300 秒、重发间隔 60 秒，重发使旧码失效。当前应用表单只走邮箱分支；非 Mock 服务不返回明文 code。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/verification-code`

## 请求体

```json
{
  "target": "user@example.com",
  "target_type": "email",
  "scene": "register"
}
```

| 字段路径    | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                    | 示例值             |
| ----------- | --------- | --------- | ---- | --------------------------------------------- | ------------------ |
| target      | string    | 是        | 否   | 接收目标，邮箱或国际手机号；请求最多 128 字符 | "user@example.com" |
| target_type | string    | 是        | 否   | email 或 phone                                | "email"            |
| scene       | string    | 否        | 否   | register 或 reset_password；省略默认 register | "register"         |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "verification.code",
  "data": {
    "target": "u***@example.com",
    "target_type": "email",
    "scene": "register",
    "expires_in": 300,
    "resend_after": 60,
    "mock": true,
    "code": "123456"
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径          | JSON 类型 | 必填/必有                         | 可空 | 说明与约束                                                | 示例值                                                                                                                                |
| ----------------- | --------- | --------------------------------- | ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| model             | string    | 是                                | 否   | 响应模型判别标识；按本响应示例取值                        | "verification.code"                                                                                                                   |
| data              | object    | 是                                | 否   | 当前操作的结果对象                                        | {"target":"u***@example.com","target_type":"email","scene":"register","expires_in":300,"resend_after":60,"mock":true,"code":"123456"} |
| data.target       | string    | 是                                | 否   | 脱敏后的目标，不回显完整邮箱或手机号                      | "u***@example.com"                                                                                                                    |
| data.target_type  | string    | 是                                | 否   | email 或 phone                                            | "email"                                                                                                                               |
| data.scene        | string    | 是                                | 否   | register 或 reset_password；省略默认 register             | "register"                                                                                                                            |
| data.expires_in   | number    | 是                                | 否   | 有效持续秒数，正整数；不是时间戳                          | 300                                                                                                                                   |
| data.resend_after | number    | 是                                | 否   | 距可重发的秒数，非负整数                                  | 60                                                                                                                                    |
| data.mock         | boolean   | 是                                | 否   | 是否验证码模拟模式                                        | true                                                                                                                                  |
| data.code         | string    | mock=true 时有；mock=false 时缺省 | 否   | 仅模拟模式返回明文；正式发送时整个字段不出现，不能是 null | "123456"                                                                                                                              |
| request_id        | string    | 是                                | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键           | "00000000-0000-4000-8000-000000000001"                                                                                                |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                             | 触发条件                                               |
| --------- | ---------------------------------- | ------------------------------------------------------ |
| 400       | common.validate.error              | 缺字段、类型或格式不符合要求                           |
| 404       | common.route.not.found             | 相对路径不存在                                         |
| 405       | common.method.not.allowed          | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit                  | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error              | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |
| 400       | verification.target.invalid        | 目标格式不合法                                         |
| 400       | verification.scene.unsupported     | 未知场景                                               |
| 404       | verification.target.not.registered | 找回目标未注册；此语义会暴露账号存在性                 |
| 429       | verification.code.too.frequent     | 60 秒内重发                                            |
| 429       | verification.code.daily.limit      | 同一目标/场景发送次数超限                              |
| 503       | verification.disabled              | 来源服务验证码关闭分支，当前 Mock 未模拟               |
| 503       | verification.channel.unavailable   | 真实发送通道未配置，当前 Mock 不模拟真实投递           |

<a id="v1-register"></a>

## 接口名称

注册账号

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 创建账号与独立默认组织，用户名/邮箱及非空手机号唯一；不返回令牌、不自动登录。当前客户端要求邮箱验证码。服务来源对验证码关闭时携带 code 的行为有冲突；当前 Mock 始终要求验证码且不模拟关闭分支；真实服务需确认，不能据此取消客户端邮箱验证。查重失败不消耗有效验证码。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/register`

## 请求体

```json
{
  "username": "example_user",
  "email": "user@example.com",
  "password": "Example123",
  "phone": "+8613800138000",
  "nickname": "示例用户",
  "code": "123456",
  "code_type": "email"
}
```

| 字段路径  | JSON 类型 | 必填/必有                          | 可空 | 说明与约束                                                      | 示例值             |
| --------- | --------- | ---------------------------------- | ---- | --------------------------------------------------------------- | ------------------ |
| username  | string    | 是                                 | 否   | 用户名，3–32 位字母、数字、下划线或短横线                       | "example_user"     |
| email     | string    | 是                                 | 否   | 合法邮箱，最多 128 字符；归一化为小写                           | "user@example.com" |
| password  | string    | 是                                 | 否   | 密码；创建/重置时为 8–64 字符且同时含字母与数字                 | "Example123"       |
| phone     | string    | 否                                 | 否   | 可省略；非空时归一化并校验 E.164 与唯一性；不能以 null 代替省略 | "+8613800138000"   |
| nickname  | string    | 否                                 | 否   | 昵称，最多 64 字符；注册留空回落为用户名                        | "示例用户"         |
| code      | string    | 当前客户端必填；服务启用验证时必填 | 否   | 验证码，1–16 位数字字符串；不能跨场景使用                       | "123456"           |
| code_type | string    | 否                                 | 否   | email 或 phone；省略默认 email                                  | "email"            |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "account",
  "data": {
    "id": "2108046372081659904",
    "username": "example_user",
    "email": "user@example.com",
    "phone": "+8613800138000",
    "nickname": "示例用户",
    "status": 1,
    "last_login_at": null,
    "last_login_ip": "",
    "created_time": 1791432395,
    "updated_time": 1791432395
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径           | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                                                                                                                                                  |
| ------------------ | --------- | --------- | ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model              | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "account"                                                                                                                                                                                                                               |
| data               | object    | 是        | 否   | 当前操作的结果对象                              | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":"+8613800138000","nickname":"示例用户","status":1,"last_login_at":null,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395} |
| data.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                     | "2108046372081659904"                                                                                                                                                                                                                   |
| data.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线       | "example_user"                                                                                                                                                                                                                          |
| data.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写           | "user@example.com"                                                                                                                                                                                                                      |
| data.phone         | string    | 是        | 是   | E.164 手机号；未填写时为 null                   | "+8613800138000"                                                                                                                                                                                                                        |
| data.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名        | "示例用户"                                                                                                                                                                                                                              |
| data.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                        | 1                                                                                                                                                                                                                                       |
| data.last_login_at | number    | 是        | 是   | 最近登录时间，Unix 秒整数；未登录时为 null      | null                                                                                                                                                                                                                                    |
| data.last_login_ip | string    | 是        | 否   | 最近登录 IP；未登录时为空字符串                 | ""                                                                                                                                                                                                                                      |
| data.created_time  | number    | 是        | 否   | 创建时间，Unix 秒整数                           | 1791432395                                                                                                                                                                                                                              |
| data.updated_time  | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本             | 1791432395                                                                                                                                                                                                                              |
| request_id         | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                                                                                                                                                  |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                              | 触发条件                                                         |
| --------- | ----------------------------------- | ---------------------------------------------------------------- |
| 400       | common.validate.error               | 缺字段、类型或格式不符合要求                                     |
| 404       | common.route.not.found              | 相对路径不存在                                                   |
| 405       | common.method.not.allowed           | 路径存在但方法不被允许                                           |
| 429       | common.rate.limit                   | 参考服务全局 IP 限流；当前 Mock 未实现全局限流                   |
| 500       | common.internal.error               | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障           |
| 400       | verification.code.required          | 未提供验证码                                                     |
| 400       | verification.code.invalid           | 验证码错误、未发送、已用或重发后失效                             |
| 400       | verification.code.expired           | 验证码过期                                                       |
| 429       | verification.code.attempts.exceeded | 验证码错误次数超限                                               |
| 400       | verification.target.missing         | code_type=phone 且未提供 phone                                   |
| 409       | account.username.exists             | 用户名占用                                                       |
| 409       | account.email.exists                | 邮箱占用                                                         |
| 409       | account.phone.exists                | 手机号占用                                                       |
| 503       | verification.disabled               | 来源服务验证码关闭分支，当前 Mock 未模拟；携带 code 的语义待核实 |

<a id="v1-login"></a>

## 接口名称

登录

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 用用户名或邮箱和密码建立会话。账号不存在与密码错误使用相同错误码。成功返回完整令牌对及账号，不包含权限或成员组织列表。当前内存 Token 为演示值，不是真实 JWT，不能用于真实 HTTP。登录更新最近登录时间和 IP。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/login`

## 请求体

```json
{
  "account": "example_user",
  "password": "Example123"
}
```

| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                                   | 示例值         |
| -------- | --------- | --------- | ---- | ------------------------------------------------------------ | -------------- |
| account  | string    | 是        | 否   | 用户名或邮箱，必填且最多 128 字符                            | "example_user" |
| password | string    | 是        | 否   | 登录密码，必填且最多 64 字符；不把注册强度规则当登录前置条件 | "Example123"   |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "auth.token",
  "data": {
    "token": {
      "access_token": "<access_token>",
      "refresh_token": "<refresh_token>",
      "token_type": "Bearer",
      "expires_in": 7200
    },
    "account": {
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
    }
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径                   | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                             | 示例值                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------- | --------- | ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model                      | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值                     | "auth.token"                                                                                                                                                                                                                                                                                                                                                      |
| data                       | object    | 是        | 否   | 当前操作的结果对象                                     | {"token":{"access_token":"<access_token>","refresh_token":"<refresh_token>","token_type":"Bearer","expires_in":7200},"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395}} |
| data.token                 | object    | 是        | 否   | 完整令牌对                                             | {"access_token":"<access_token>","refresh_token":"<refresh_token>","token_type":"Bearer","expires_in":7200}                                                                                                                                                                                                                                                       |
| data.token.access_token    | string    | 是        | 否   | 访问凭据，仅放受保护请求 Authorization；示例为脱敏占位 | "<access_token>"                                                                                                                                                                                                                                                                                                                                                  |
| data.token.refresh_token   | string    | 是        | 否   | 刷新凭据，仅用于刷新请求 JSON；示例为脱敏占位          | "<refresh_token>"                                                                                                                                                                                                                                                                                                                                                 |
| data.token.token_type      | string    | 是        | 否   | 固定 Bearer                                            | "Bearer"                                                                                                                                                                                                                                                                                                                                                          |
| data.token.expires_in      | number    | 是        | 否   | 有效持续秒数，正整数；不是时间戳                       | 7200                                                                                                                                                                                                                                                                                                                                                              |
| data.account               | object    | 是        | 否   | 账号对象                                               | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395}                                                                                                                                 |
| data.account.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                            | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                             |
| data.account.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线              | "example_user"                                                                                                                                                                                                                                                                                                                                                    |
| data.account.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写                  | "user@example.com"                                                                                                                                                                                                                                                                                                                                                |
| data.account.phone         | string    | 是        | 是   | E.164 手机号；未填写时为 null                          | null                                                                                                                                                                                                                                                                                                                                                              |
| data.account.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名               | "示例用户"                                                                                                                                                                                                                                                                                                                                                        |
| data.account.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                               | 1                                                                                                                                                                                                                                                                                                                                                                 |
| data.account.last_login_at | number    | 是        | 是   | 最近登录时间，Unix 秒整数；未登录时为 null             | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| data.account.last_login_ip | string    | 是        | 否   | 最近登录 IP；未登录时为空字符串                        | ""                                                                                                                                                                                                                                                                                                                                                                |
| data.account.created_time  | number    | 是        | 否   | 创建时间，Unix 秒整数                                  | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| data.account.updated_time  | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本                    | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| request_id                 | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键        | "00000000-0000-4000-8000-000000000001"                                                                                                                                                                                                                                                                                                                            |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 400       | common.validate.error     | 缺字段、类型或格式不符合要求                           |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit         | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |
| 401       | auth.password.wrong       | 账号不存在或密码错误                                   |
| 403       | auth.account.disabled     | 账号禁用                                               |

<a id="v1-refresh"></a>

## 接口名称

刷新令牌

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 使用刷新凭据显式换取新令牌对，公开请求不携带旧访问凭据。当前实现没有自动刷新或失败重放；来源没有确认旧刷新令牌一次性消费或轮换保证，不能据此假定旧令牌立即失效。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/refresh`

## 请求体

```json
{
  "refresh_token": "<refresh_token>"
}
```

| 字段路径      | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                    | 示例值            |
| ------------- | --------- | --------- | ---- | --------------------------------------------- | ----------------- |
| refresh_token | string    | 是        | 否   | 刷新凭据，仅用于刷新请求 JSON；示例为脱敏占位 | "<refresh_token>" |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "auth.token",
  "data": {
    "token": {
      "access_token": "<access_token>",
      "refresh_token": "<refresh_token>",
      "token_type": "Bearer",
      "expires_in": 7200
    },
    "account": {
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
    }
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径                   | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                             | 示例值                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------- | --------- | ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model                      | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值                     | "auth.token"                                                                                                                                                                                                                                                                                                                                                      |
| data                       | object    | 是        | 否   | 当前操作的结果对象                                     | {"token":{"access_token":"<access_token>","refresh_token":"<refresh_token>","token_type":"Bearer","expires_in":7200},"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395}} |
| data.token                 | object    | 是        | 否   | 完整令牌对                                             | {"access_token":"<access_token>","refresh_token":"<refresh_token>","token_type":"Bearer","expires_in":7200}                                                                                                                                                                                                                                                       |
| data.token.access_token    | string    | 是        | 否   | 访问凭据，仅放受保护请求 Authorization；示例为脱敏占位 | "<access_token>"                                                                                                                                                                                                                                                                                                                                                  |
| data.token.refresh_token   | string    | 是        | 否   | 刷新凭据，仅用于刷新请求 JSON；示例为脱敏占位          | "<refresh_token>"                                                                                                                                                                                                                                                                                                                                                 |
| data.token.token_type      | string    | 是        | 否   | 固定 Bearer                                            | "Bearer"                                                                                                                                                                                                                                                                                                                                                          |
| data.token.expires_in      | number    | 是        | 否   | 有效持续秒数，正整数；不是时间戳                       | 7200                                                                                                                                                                                                                                                                                                                                                              |
| data.account               | object    | 是        | 否   | 账号对象                                               | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395}                                                                                                                                 |
| data.account.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                            | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                             |
| data.account.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线              | "example_user"                                                                                                                                                                                                                                                                                                                                                    |
| data.account.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写                  | "user@example.com"                                                                                                                                                                                                                                                                                                                                                |
| data.account.phone         | string    | 是        | 是   | E.164 手机号；未填写时为 null                          | null                                                                                                                                                                                                                                                                                                                                                              |
| data.account.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名               | "示例用户"                                                                                                                                                                                                                                                                                                                                                        |
| data.account.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                               | 1                                                                                                                                                                                                                                                                                                                                                                 |
| data.account.last_login_at | number    | 是        | 是   | 最近登录时间，Unix 秒整数；未登录时为 null             | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| data.account.last_login_ip | string    | 是        | 否   | 最近登录 IP；未登录时为空字符串                        | ""                                                                                                                                                                                                                                                                                                                                                                |
| data.account.created_time  | number    | 是        | 否   | 创建时间，Unix 秒整数                                  | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| data.account.updated_time  | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本                    | 1791432395                                                                                                                                                                                                                                                                                                                                                        |
| request_id                 | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键        | "00000000-0000-4000-8000-000000000001"                                                                                                                                                                                                                                                                                                                            |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 400       | common.validate.error     | 缺字段、类型或格式不符合要求                           |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit         | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |
| 401       | auth.token.invalid        | 令牌无效                                               |
| 401       | auth.token.expired        | 刷新令牌过期                                           |
| 401       | auth.token.revoked        | 账号全部令牌已吊销或引用失效                           |
| 401       | auth.token.wrong.type     | 访问令牌被当作刷新令牌                                 |
| 401       | auth.account.not.found    | 账号不存在                                             |
| 403       | auth.account.disabled     | 账号禁用                                               |

<a id="v1-password-reset"></a>

## 接口名称

重置密码

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 匿名凭邮箱/手机号的 reset_password 场景验证码更新密码；不自动登录。成功吊销该账号全部已签发令牌，含共享客户端会话，须重新登录。当前表单映射邮箱；与已登录改密分开。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/password/reset`

## 请求体

```json
{
  "target": "user@example.com",
  "target_type": "email",
  "code": "123456",
  "new_password": "Example456"
}
```

| 字段路径     | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                    | 示例值             |
| ------------ | --------- | --------- | ---- | --------------------------------------------- | ------------------ |
| target       | string    | 是        | 否   | 接收目标，邮箱或国际手机号；请求最多 128 字符 | "user@example.com" |
| target_type  | string    | 是        | 否   | email 或 phone                                | "email"            |
| code         | string    | 是        | 否   | 验证码，1–16 位数字字符串；不能跨场景使用     | "123456"           |
| new_password | string    | 是        | 否   | 新密码，8–64 字符，同时包含字母与数字         | "Example456"       |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

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

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                              | 触发条件                                               |
| --------- | ----------------------------------- | ------------------------------------------------------ |
| 400       | common.validate.error               | 缺字段、类型或格式不符合要求                           |
| 404       | common.route.not.found              | 相对路径不存在                                         |
| 405       | common.method.not.allowed           | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit                   | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error               | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |
| 400       | verification.code.required          | 未提供验证码                                           |
| 400       | verification.code.invalid           | 验证码错误、未发送、已用或重发后失效                   |
| 400       | verification.code.expired           | 验证码过期                                             |
| 429       | verification.code.attempts.exceeded | 验证码错误次数超限                                     |
| 400       | verification.target.invalid         | 目标格式非法                                           |
| 404       | verification.target.not.registered  | 目标未注册                                             |
| 403       | auth.account.disabled               | 账号禁用                                               |
| 503       | verification.disabled               | 来源服务验证码关闭分支，当前 Mock 未模拟               |

<a id="v1-logout"></a>

## 接口名称

退出登录

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 作用于当前账号，吊销该账号全部已签发令牌，包含其他设备或客户端。当前 Mock 保证同一内存服务中共享客户端的吊销；真实页面重建后的持久吊销不作保证。成功为 HTTP 200 的 empty JSON，不是 204。

## 请求头

| 名称          | 必填 | 值或格式               | 说明                                         |
| ------------- | ---- | ---------------------- | -------------------------------------------- |
| Authorization | 是   | Bearer <access_token>  | 受保护操作访问凭据                           |
| X-Lang        | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id  | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`POST /api/v1/auth/logout`

## 请求体

无请求体。

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

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

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "auth.token.missing",
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
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"auth.token.missing","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                      |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"auth.token.missing","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"auth.token.missing","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                         |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "auth.token.missing"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                  |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                               |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                          |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 401       | auth.token.missing        | 未带 Authorization 或使用不支持的携带方式              |
| 401       | auth.token.malformed      | Bearer 格式非法                                        |
| 401       | auth.token.invalid        | 令牌无效                                               |
| 401       | auth.token.expired        | 访问令牌过期                                           |
| 401       | auth.token.revoked        | 账号全部令牌已吊销或引用失效                           |
| 401       | auth.token.wrong.type     | 刷新令牌被当作访问令牌                                 |
| 401       | auth.account.not.found    | 账号不存在                                             |
| 403       | auth.account.disabled     | 账号禁用                                               |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit         | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |

<a id="v1-profile"></a>

## 接口名称

读取当前账号与默认组织

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 根据访问凭据读取当前账号，不接受目标账号 ID。org 仅为默认组织且允许 null，不代表可用成员组织或权限。与注册虽同为 model:account，其 data 形状不同。

## 请求头

| 名称          | 必填 | 值或格式               | 说明                                         |
| ------------- | ---- | ---------------------- | -------------------------------------------- |
| Authorization | 是   | Bearer <access_token>  | 受保护操作访问凭据                           |
| X-Lang        | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id  | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`GET /api/v1/auth/profile`

## 请求体

无请求体。

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "account",
  "data": {
    "account": {
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
    "org": {
      "id": "2108046372081659905",
      "name": "示例组织",
      "owner_id": "2108046372081659904",
      "is_default": true,
      "created_time": 1791432395,
      "updated_time": 1791432395
    }
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径                   | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                          | 示例值                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------- | --------- | ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model                      | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值                  | "account"                                                                                                                                                                                                                                                                                                                                                                                                 |
| data                       | object    | 是        | 否   | 当前操作的结果对象                                  | {"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395},"org":{"id":"2108046372081659905","name":"示例组织","owner_id":"2108046372081659904","is_default":true,"created_time":1791432395,"updated_time":1791432395}} |
| data.account               | object    | 是        | 否   | 账号对象                                            | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","phone":null,"nickname":"示例用户","status":1,"last_login_at":1791432395,"last_login_ip":"","created_time":1791432395,"updated_time":1791432395}                                                                                                                                                                         |
| data.account.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                                                                     |
| data.account.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线           | "example_user"                                                                                                                                                                                                                                                                                                                                                                                            |
| data.account.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写               | "user@example.com"                                                                                                                                                                                                                                                                                                                                                                                        |
| data.account.phone         | string    | 是        | 是   | E.164 手机号；未填写时为 null                       | null                                                                                                                                                                                                                                                                                                                                                                                                      |
| data.account.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名            | "示例用户"                                                                                                                                                                                                                                                                                                                                                                                                |
| data.account.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                            | 1                                                                                                                                                                                                                                                                                                                                                                                                         |
| data.account.last_login_at | number    | 是        | 是   | 最近登录时间，Unix 秒整数；未登录时为 null          | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                |
| data.account.last_login_ip | string    | 是        | 否   | 最近登录 IP；未登录时为空字符串                     | ""                                                                                                                                                                                                                                                                                                                                                                                                        |
| data.account.created_time  | number    | 是        | 否   | 创建时间，Unix 秒整数                               | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                |
| data.account.updated_time  | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本                 | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                |
| data.org                   | object    | 是        | 是   | 账号默认组织；无默认组织时为 null，不是成员组织列表 | {"id":"2108046372081659905","name":"示例组织","owner_id":"2108046372081659904","is_default":true,"created_time":1791432395,"updated_time":1791432395}                                                                                                                                                                                                                                                     |
| data.org.id                | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659905"                                                                                                                                                                                                                                                                                                                                                                                     |
| data.org.name              | string    | 是        | 否   | 名称                                                | "示例组织"                                                                                                                                                                                                                                                                                                                                                                                                |
| data.org.owner_id          | string    | 是        | 否   | 组织拥有者账号字符串 ID，不代表权限码               | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                                                                     |
| data.org.is_default        | boolean   | 是        | 否   | 是否默认组织                                        | true                                                                                                                                                                                                                                                                                                                                                                                                      |
| data.org.created_time      | number    | 是        | 否   | 创建时间，Unix 秒整数                               | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                |
| data.org.updated_time      | number    | 是        | 否   | 更新时间，Unix 秒整数；不是并发版本                 | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                |
| request_id                 | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键     | "00000000-0000-4000-8000-000000000001"                                                                                                                                                                                                                                                                                                                                                                    |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "auth.token.missing",
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
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"auth.token.missing","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                      |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"auth.token.missing","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"auth.token.missing","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                         |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "auth.token.missing"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                  |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                               |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                          |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 401       | auth.token.missing        | 未带 Authorization 或使用不支持的携带方式              |
| 401       | auth.token.malformed      | Bearer 格式非法                                        |
| 401       | auth.token.invalid        | 令牌无效                                               |
| 401       | auth.token.expired        | 访问令牌过期                                           |
| 401       | auth.token.revoked        | 账号全部令牌已吊销或引用失效                           |
| 401       | auth.token.wrong.type     | 刷新令牌被当作访问令牌                                 |
| 401       | auth.account.not.found    | 账号不存在                                             |
| 403       | auth.account.disabled     | 账号禁用                                               |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit         | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |

<a id="v1-password-change"></a>

## 接口名称

修改密码

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 校验当前账号原密码，成功更新密码并吊销全部旧令牌；原密码错误不改变会话。与匿名找回分开。

## 请求头

| 名称          | 必填 | 值或格式               | 说明                                         |
| ------------- | ---- | ---------------------- | -------------------------------------------- |
| Content-Type  | 是   | application/json       | JSON 请求体                                  |
| Authorization | 是   | Bearer <access_token>  | 受保护操作访问凭据                           |
| X-Lang        | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id  | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`PUT /api/v1/auth/password`

## 请求体

```json
{
  "old_password": "Example123",
  "new_password": "Example456"
}
```

| 字段路径     | JSON 类型 | 必填/必有 | 可空 | 说明与约束                            | 示例值       |
| ------------ | --------- | --------- | ---- | ------------------------------------- | ------------ |
| old_password | string    | 是        | 否   | 原密码，必填且最多 64 字符            | "Example123" |
| new_password | string    | 是        | 否   | 新密码，8–64 字符，同时包含字母与数字 | "Example456" |

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

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

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.validate.error",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                             |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                           |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.validate.error","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                         |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.validate.error","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.validate.error","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                            |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.validate.error"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                     |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                  |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                             |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 400       | common.validate.error     | 缺字段、类型或格式不符合要求                           |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.rate.limit         | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |
| 401       | auth.token.missing        | 未带 Authorization 或使用不支持的携带方式              |
| 401       | auth.token.malformed      | Bearer 格式非法                                        |
| 401       | auth.token.invalid        | 令牌无效                                               |
| 401       | auth.token.expired        | 访问令牌过期                                           |
| 401       | auth.token.revoked        | 账号全部令牌已吊销或引用失效                           |
| 401       | auth.token.wrong.type     | 刷新令牌被当作访问令牌                                 |
| 401       | auth.account.not.found    | 账号不存在                                             |
| 403       | auth.account.disabled     | 账号禁用                                               |
| 400       | auth.old.password.wrong   | 原密码错误                                             |

<a id="unversioned-account-me"></a>

## 接口名称

当前账号查询（me）

## 接口说明

仅返回访问令牌对应账号与默认组织。可选鉴权会将缺失/无效/过期/吊销凭据降为匿名；me 字段返回 auth.token.missing，不保留具体认证失效原因。不能用 HTTP 200 或该查询替代 REST profile 的导航强鉴权校验。

### Schema 子集

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

type Query {
  me: AccountDetail!
}
```

Timestamp 序列化为 Unix 秒整数；ID 保持字符串。AccountDetail.account 非空，org 可空；lastLoginTime 可空。未包含 phone、owner_id、密码或 token version。

### 请求

`POST /graphql`；若查询 me，客户端发送访问凭据。

| 名称          | 必填 | 值或格式               | 说明                                         |
| ------------- | ---- | ---------------------- | -------------------------------------------- |
| Content-Type  | 是   | application/json       | JSON 请求体                                  |
| Authorization | 是   | Bearer <access_token>  | 受保护操作访问凭据                           |
| X-Lang        | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id  | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

```json
{
  "query": "{ me { account { id username email nickname status lastLoginIp lastLoginTime createdTime updatedTime } org { id name isDefault createdTime updatedTime } } }"
}
```

| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                                                    | 示例值                                                                                                                                                         |
| -------- | --------- | --------- | ---- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| query    | string    | 是        | 否   | GraphQL 查询文档；当前 Mock 最大 16,384 字符，只支持已说明的无参数 Query 子集 | "{ me { account { id username email nickname status lastLoginIp lastLoginTime createdTime updatedTime } org { id name isDefault createdTime updatedTime } } }" |

### 响应

成功 HTTP 200；响应 Header 同 health。以下为全部选择字段的说明示例。

```json
{
  "data": {
    "me": {
      "account": {
        "id": "2108046372081659904",
        "username": "example_user",
        "email": "user@example.com",
        "nickname": "示例用户",
        "status": 1,
        "lastLoginIp": "",
        "lastLoginTime": 1791432395,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      },
      "org": {
        "id": "2108046372081659905",
        "name": "示例组织",
        "isDefault": true,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      }
    }
  }
}
```

| 字段路径                      | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                          | 示例值                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------- | --------- | ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data                          | object    | 是        | 否   | GraphQL 选择集结果；业务鉴权错误可为 null           | {"me":{"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395},"org":{"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}}} |
| data.me                       | object    | 是        | 否   | 当前账号和默认组织投影，不包含权限或成员组织列表    | {"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395},"org":{"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}}        |
| data.me.account               | object    | 是        | 否   | 账号对象                                            | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395}                                                                                                                                            |
| data.me.account.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                       |
| data.me.account.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线           | "example_user"                                                                                                                                                                                                                                                                                                                                              |
| data.me.account.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写               | "user@example.com"                                                                                                                                                                                                                                                                                                                                          |
| data.me.account.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名            | "示例用户"                                                                                                                                                                                                                                                                                                                                                  |
| data.me.account.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                            | 1                                                                                                                                                                                                                                                                                                                                                           |
| data.me.account.lastLoginIp   | string    | 是        | 否   | 最近登录 IP；当前 Mock 为空字符串                   | ""                                                                                                                                                                                                                                                                                                                                                          |
| data.me.account.lastLoginTime | number    | 是        | 是   | 最近登录 Unix 秒；从未登录为 null                   | 1791432395                                                                                                                                                                                                                                                                                                                                                  |
| data.me.account.createdTime   | number    | 是        | 否   | 创建 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                  |
| data.me.account.updatedTime   | number    | 是        | 否   | 更新 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                  |
| data.me.org                   | object    | 是        | 是   | 账号默认组织；无默认组织时为 null，不是成员组织列表 | {"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}                                                                                                                                                                                                                                           |
| data.me.org.id                | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659905"                                                                                                                                                                                                                                                                                                                                       |
| data.me.org.name              | string    | 是        | 否   | 名称                                                | "示例组织"                                                                                                                                                                                                                                                                                                                                                  |
| data.me.org.isDefault         | boolean   | 是        | 否   | 是否默认组织                                        | true                                                                                                                                                                                                                                                                                                                                                        |
| data.me.org.createdTime       | number    | 是        | 否   | 创建 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                  |
| data.me.org.updatedTime       | number    | 是        | 否   | 更新 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                  |

<a id="unversioned-account-context"></a>

## 接口名称

账号上下文组合查询（AccountContext）

## 接口说明

当前客户端一次读取 health 与 me 的固定命名查询。这是既有两个根字段的组合，不是新增服务 endpoint。账号上下文另外叠加本地 Mock 成员组织和能力，后者不是 GraphQL 字段。

### 当前采用的 Schema

以下为基础服务已提供的只读 Schema；不是从选择集反推的类型。

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

### 请求

`POST /graphql`，Header 同 me。命名写在 query 文档中；实际请求体只含 query。operationName 与 variables 均不发送。

```json
{
  "query": "query AccountContext { health { available name version env } me { account { id username email nickname status lastLoginIp lastLoginTime createdTime updatedTime } org { id name isDefault createdTime updatedTime } } }"
}
```

| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                                                    | 示例值                                                                                                                                                                                                                    |
| -------- | --------- | --------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| query    | string    | 是        | 否   | GraphQL 查询文档；当前 Mock 最大 16,384 字符，只支持已说明的无参数 Query 子集 | "query AccountContext { health { available name version env } me { account { id username email nickname status lastLoginIp lastLoginTime createdTime updatedTime } org { id name isDefault createdTime updatedTime } } }" |

### 响应

成功 HTTP 200，JSON 按 GraphQL 原始结构返回。

```json
{
  "data": {
    "health": {
      "available": true,
      "name": "example-mock-service",
      "version": "1.0.0",
      "env": "dev"
    },
    "me": {
      "account": {
        "id": "2108046372081659904",
        "username": "example_user",
        "email": "user@example.com",
        "nickname": "示例用户",
        "status": 1,
        "lastLoginIp": "",
        "lastLoginTime": 1791432395,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      },
      "org": {
        "id": "2108046372081659905",
        "name": "示例组织",
        "isDefault": true,
        "createdTime": 1791432395,
        "updatedTime": 1791432395
      }
    }
  }
}
```

| 字段路径                      | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                          | 示例值                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | --------- | --------- | ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data                          | object    | 是        | 否   | GraphQL 选择集结果；业务鉴权错误可为 null           | {"health":{"available":true,"name":"example-mock-service","version":"1.0.0","env":"dev"},"me":{"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395},"org":{"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}}} |
| data.health                   | object    | 是        | 否   | 服务健康投影                                        | {"available":true,"name":"example-mock-service","version":"1.0.0","env":"dev"}                                                                                                                                                                                                                                                                                                                                                                      |
| data.health.available         | boolean   | 是        | 否   | 服务可用状态                                        | true                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| data.health.name              | string    | 是        | 否   | 名称                                                | "example-mock-service"                                                                                                                                                                                                                                                                                                                                                                                                                              |
| data.health.version           | string    | 是        | 否   | 版本                                                | "1.0.0"                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| data.health.env               | string    | 是        | 否   | dev、test 或 prod                                   | "dev"                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| data.me                       | object    | 是        | 否   | 当前账号和默认组织投影，不包含权限或成员组织列表    | {"account":{"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395},"org":{"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}}                                                                                                |
| data.me.account               | object    | 是        | 否   | 账号对象                                            | {"id":"2108046372081659904","username":"example_user","email":"user@example.com","nickname":"示例用户","status":1,"lastLoginIp":"","lastLoginTime":1791432395,"createdTime":1791432395,"updatedTime":1791432395}                                                                                                                                                                                                                                    |
| data.me.account.id            | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659904"                                                                                                                                                                                                                                                                                                                                                                                                                               |
| data.me.account.username      | string    | 是        | 否   | 用户名，3–32 位字母、数字、下划线或短横线           | "example_user"                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| data.me.account.email         | string    | 是        | 否   | 合法邮箱，最多 128 字符；归一化为小写               | "user@example.com"                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| data.me.account.nickname      | string    | 是        | 否   | 昵称，最多 64 字符；注册留空回落为用户名            | "示例用户"                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.account.status        | number    | 是        | 否   | 账号状态：1 正常、0 禁用                            | 1                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| data.me.account.lastLoginIp   | string    | 是        | 否   | 最近登录 IP；当前 Mock 为空字符串                   | ""                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| data.me.account.lastLoginTime | number    | 是        | 是   | 最近登录 Unix 秒；从未登录为 null                   | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.account.createdTime   | number    | 是        | 否   | 创建 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.account.updatedTime   | number    | 是        | 否   | 更新 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.org                   | object    | 是        | 是   | 账号默认组织；无默认组织时为 null，不是成员组织列表 | {"id":"2108046372081659905","name":"示例组织","isDefault":true,"createdTime":1791432395,"updatedTime":1791432395}                                                                                                                                                                                                                                                                                                                                   |
| data.me.org.id                | string    | 是        | 否   | 字符串标识，不转换为 Number                         | "2108046372081659905"                                                                                                                                                                                                                                                                                                                                                                                                                               |
| data.me.org.name              | string    | 是        | 否   | 名称                                                | "示例组织"                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.org.isDefault         | boolean   | 是        | 否   | 是否默认组织                                        | true                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| data.me.org.createdTime       | number    | 是        | 否   | 创建 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| data.me.org.updatedTime       | number    | 是        | 否   | 更新 Unix 秒整数                                    | 1791432395                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### DTO 映射

| REST 原始字段 | GraphQL 投影  | 说明             |
| ------------- | ------------- | ---------------- |
| last_login_at | lastLoginTime | Unix 秒，可空    |
| last_login_ip | lastLoginIp   | 字符串，允许空串 |
| created_time  | createdTime   | Unix 秒          |
| updated_time  | updatedTime   | Unix 秒          |
| is_default    | isDefault     | 布尔             |

### 业务错误

HTTP 200。当前 Mock 的错误条目只有 message / extensions.code；me:AccountDetail! 是非空根字段，鉴权失败使整个 data:null，同查询的 health 结果也不保留。

```json
{
  "data": null,
  "errors": [
    {
      "message": "Authentication required",
      "extensions": {
        "code": "auth.token.missing"
      }
    }
  ]
}
```

| 字段路径                 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                           | 示例值                                                                             |
| ------------------------ | --------- | --------- | ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| data                     | object    | 是        | 是   | me 非空失败向根传播，整个 data 为 null               | null                                                                               |
| errors                   | array     | 是        | 否   | GraphQL 错误数组，非 REST errors 对象                | [{"message":"Authentication required","extensions":{"code":"auth.token.missing"}}] |
| errors[]                 | object    | 是        | 否   | 一条 GraphQL 错误                                    | {"message":"Authentication required","extensions":{"code":"auth.token.missing"}}   |
| errors[].message         | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支             | "Authentication required"                                                          |
| errors[].extensions      | object    | 是        | 否   | GraphQL 错误扩展                                     | {"code":"auth.token.missing"}                                                      |
| errors[].extensions.code | string    | 是        | 否   | 稳定业务码；当前缺失/无效凭据统一 auth.token.missing | "auth.token.missing"                                                               |

### 协议错误

HTTP 422。当前 Mock 只返回 errors[]，不含 data；来源示例带 data:null。当前 Mock 还省略来源错误示例的 path / locations。这些实现差异不改变错误码分流，不能把省略字段写成必有。

```json
{
  "errors": [
    {
      "message": "Invalid query syntax",
      "extensions": {
        "code": "GRAPHQL_PARSE_FAILED"
      }
    }
  ]
}
```

| 字段路径                 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                                                                | 示例值                                                                            |
| ------------------------ | --------- | --------- | ---- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| errors                   | array     | 是        | 否   | GraphQL 错误数组                                                                          | [{"message":"Invalid query syntax","extensions":{"code":"GRAPHQL_PARSE_FAILED"}}] |
| errors[]                 | object    | 是        | 否   | 协议错误条目                                                                              | {"message":"Invalid query syntax","extensions":{"code":"GRAPHQL_PARSE_FAILED"}}   |
| errors[].message         | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支                                                  | "Invalid query syntax"                                                            |
| errors[].extensions      | object    | 是        | 否   | GraphQL 错误扩展                                                                          | {"code":"GRAPHQL_PARSE_FAILED"}                                                   |
| errors[].extensions.code | string    | 是        | 否   | GRAPHQL_PARSE_FAILED（语法）或 GRAPHQL_VALIDATION_FAILED（字段/不支持语法或请求控制参数） | "GRAPHQL_PARSE_FAILED"                                                            |

两类协议错误使用相同报文形状。

| HTTP | extensions.code           | 触发条件                                                                         |
| ---- | ------------------------- | -------------------------------------------------------------------------------- |
| 200  | auth.token.missing        | me 缺少有效访问凭据；整个 data:null                                              |
| 422  | GRAPHQL_PARSE_FAILED      | 文档语法非法、空文档、超长或解析深度越界                                         |
| 422  | GRAPHQL_VALIDATION_FAILED | 未知字段、选择集不匹配、冲突别名、被拒绝语法，或 body 含 operationName/variables |

### 当前 Mock 与客户端接受范围

Mock 支持命名/匿名 query、别名、嵌套、注释、__typename 与兼容的重复字段合并。拒绝 Mutation、Subscription、fragment、参数、变量、directive；body 出现 operationName 或 variables 即拒绝，空值也不例外。此限制属于当前实现，不表示参考服务的通用 GraphQL 能力同样受限。

当前账号组合查询只接受完整且经字段校验的结果；任何非空 errors 按首项 extensions.code 返回稳定业务错误，即使 errors:[] 也被拒绝，不接受 partial data。GraphQL 错误不是 REST envelope。参考服务真实 Schema/协议与 CORS 尚未联网核实。
