<a id="unversioned-liveness"></a>

## 接口名称

存活探针

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 公开读取模拟服务存活状态；不代表浏览器应用或真实后端已通过健康检查。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`GET /healthz`

## 请求体

无请求体。

## 响应体

成功（HTTP 200），Content-Type: text/plain。JSON 不适用。正文为字符串 `ok`，不含 JSON envelope。X-Request-Id 回显本次追踪；Content-Language / Vary 为响应 Header。

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.route.not.found",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                              |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                            |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.route.not.found","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                          |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.route.not.found","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.route.not.found","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                             |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.route.not.found"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                      |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                   |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                              |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.too.many.requests  | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |

<a id="v1-system-health"></a>

## 接口名称

系统健康检查

## 接口说明

服务契约已定义，当前为产品 API 的服务协议 Mock，尚未接入真实 HTTP。以下仅为脱敏说明示例。 公开读取模拟服务的可用性、名称、版本与环境。当前默认名称 example-mock-service，不能误当真实部署信息。

## 请求头

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

## 请求动作

`GET /api/v1/system/health-check`

## 请求体

无请求体。

## 响应体

成功（HTTP 200）。以下为按服务合同构造的脱敏说明示例；当前操作由内存服务协议 Mock 执行。

响应 Header：Content-Type: application/json；X-Request-Id 回显单次追踪；Content-Language / Vary 为语言响应信息。

```json
{
  "model": "system.health.check",
  "data": {
    "available": true,
    "name": "example-mock-service",
    "version": "1.0.0",
    "env": "dev"
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径       | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                         |
| -------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| model          | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "system.health.check"                                                          |
| data           | object    | 是        | 否   | 当前操作的结果对象                              | {"available":true,"name":"example-mock-service","version":"1.0.0","env":"dev"} |
| data.available | boolean   | 是        | 否   | 服务可用状态                                    | true                                                                           |
| data.name      | string    | 是        | 否   | 名称                                            | "example-mock-service"                                                         |
| data.version   | string    | 是        | 否   | 版本                                            | "1.0.0"                                                                        |
| data.env       | string    | 是        | 否   | dev、test 或 prod                               | "dev"                                                                          |
| request_id     | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                         |

错误响应（按下表区分 HTTP 状态与稳定 code；报文结构相同，示例为其中一项）。

```json
{
  "model": "errors",
  "errors": {
    "model": "data.set",
    "datas": [
      {
        "model": "error",
        "code": "common.route.not.found",
        "message": "示例错误说明"
      }
    ],
    "total": 1
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

| 字段路径               | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                      | 示例值                                                                                                              |
| ---------------------- | --------- | --------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| model                  | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "errors"                                                                                                            |
| errors                 | object    | 是        | 否   | 统一错误集合                                    | {"model":"data.set","datas":[{"model":"error","code":"common.route.not.found","message":"示例错误说明"}],"total":1} |
| errors.model           | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "data.set"                                                                                                          |
| errors.datas           | array     | 是        | 否   | 数据元素数组                                    | [{"model":"error","code":"common.route.not.found","message":"示例错误说明"}]                                        |
| errors.datas[]         | object    | 是        | 否   | 单条错误对象                                    | {"model":"error","code":"common.route.not.found","message":"示例错误说明"}                                          |
| errors.datas[].model   | string    | 是        | 否   | 响应模型判别标识；按本响应示例取值              | "error"                                                                                                             |
| errors.datas[].code    | string    | 是        | 否   | 稳定错误码；取值、HTTP 状态与触发条件见下表     | "common.route.not.found"                                                                                            |
| errors.datas[].message | string    | 是        | 否   | 本地化说明；不得解析消息文本判断业务分支        | "示例错误说明"                                                                                                      |
| errors.total           | number    | 是        | 否   | 错误条数，等于 errors.datas 长度                | 1                                                                                                                   |
| request_id             | string    | 是        | 否   | 本次请求追踪标识，对应 X-Request-Id；不是幂等键 | "00000000-0000-4000-8000-000000000001"                                                                              |

| HTTP 状态 | 错误码                    | 触发条件                                               |
| --------- | ------------------------- | ------------------------------------------------------ |
| 404       | common.route.not.found    | 相对路径不存在                                         |
| 405       | common.method.not.allowed | 路径存在但方法不被允许                                 |
| 429       | common.too.many.requests  | 参考服务全局 IP 限流；当前 Mock 未实现全局限流         |
| 500       | common.internal.error     | 参考服务内部异常；当前 Mock 未模拟该服务端基础设施故障 |

<a id="unversioned-graphql-health"></a>

## 接口名称

服务健康查询（health）

## 接口说明

公开根字段，无需访问令牌，不检查用户凭据。当前 Mock 返回模拟服务信息，不能用于证明真实服务可达。

### Schema 子集

```graphql
type Health {
  available: Boolean!
  name: String!
  version: String!
  env: String!
}

type Query {
  health: Health!
}
```

### 请求

`POST /graphql`。

| 名称         | 必填 | 值或格式               | 说明                                         |
| ------------ | ---- | ---------------------- | -------------------------------------------- |
| Content-Type | 是   | application/json       | JSON 请求体                                  |
| X-Lang       | 否   | en / zh                | 服务可省略；客户端统一发送当前语言           |
| X-Request-Id | 否   | 每次请求新建的追踪标识 | 服务可省略；客户端每次发送新值；与幂等键分离 |

当前示例无 operationName、无 variables；查询无参数。

```json
{
  "query": "{ health { available name version env } }"
}
```

| 字段路径 | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                                                    | 示例值                                      |
| -------- | --------- | --------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| query    | string    | 是        | 否   | GraphQL 查询文档；当前 Mock 最大 16,384 字符，只支持已说明的无参数 Query 子集 | "{ health { available name version env } }" |

### 响应

成功 HTTP 200；Header 为 Content-Type: application/json、X-Request-Id、Content-Language 与 Vary。JSON 不添加 REST model 或 request_id。

```json
{
  "data": {
    "health": {
      "available": true,
      "name": "example-mock-service",
      "version": "1.0.0",
      "env": "dev"
    }
  }
}
```

| 字段路径              | JSON 类型 | 必填/必有 | 可空 | 说明与约束                                | 示例值                                                                                    |
| --------------------- | --------- | --------- | ---- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| data                  | object    | 是        | 否   | GraphQL 选择集结果；业务鉴权错误可为 null | {"health":{"available":true,"name":"example-mock-service","version":"1.0.0","env":"dev"}} |
| data.health           | object    | 是        | 否   | 服务健康投影                              | {"available":true,"name":"example-mock-service","version":"1.0.0","env":"dev"}            |
| data.health.available | boolean   | 是        | 否   | 服务可用状态                              | true                                                                                      |
| data.health.name      | string    | 是        | 否   | 名称                                      | "example-mock-service"                                                                    |
| data.health.version   | string    | 是        | 否   | 版本                                      | "1.0.0"                                                                                   |
| data.health.env       | string    | 是        | 否   | dev、test 或 prod                         | "dev"                                                                                     |
