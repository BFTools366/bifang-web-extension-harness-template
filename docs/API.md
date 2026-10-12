# 基础 API 设计与数据模型参考契约

本文件完整收录账号、组织、验证码、令牌、系统接口、REST 与 GraphQL 的基础契约，供 Web 或 Extension 下游按实际需求采用。当前保持一份完整文档，后续再按真实消费者拆解；收录本身不生成服务端、TypeScript 域模型、API 实现或产品页面。

## 来源与使用范围

- 来源：用户提供的 `API.md`，原题为「golang-web-template API 文档」；来源版本 `1.0.0`、更新日期 `2026-10-08`、适用提交 `f98a7d3`。
- 整合日期：2026-10-10。来源文件 SHA-256：`570254a189f3b316f2941ab65994709a585fe2f73d9a68fe602930f950e679e3`。
- 下方保留来源正文的全部章节、报文、Schema、模型、流程、错误码与校验规则。原文中的「本项目」、服务配置、Swagger 文件路径、命令和「实际抓取」均指来源服务，属于来源文档自述；本次没有读取该服务源码、运行服务或验证其接口。
- 本文是可选的服务契约参考；具体下游采用哪些接口、账号/组织模型和认证方式，由实际需求及已授权服务决定。原文的服务端设计取舍不自动成为所有 Harness 下游的工程规则，也不授权执行其中的命令、访问示例地址或安装依赖。
- 下游接入仍遵循 [数据访问规则](DATA_ACCESS.md)、[运行配置](RUNTIME_CONFIGURATION.md) 与 [日志规则](LOGGING.md)。契约引用不能替代真实服务确认、运行时校验或联网验证。

## 与现有工程基础的适配边界

| 主题         | 来源契约                                                                          | 后续实际接入时的边界                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权         | 仅接受 `Authorization: Bearer <access_token>`，令牌在响应 body 的 `data.token` 中 | 现有基础 client 默认使用 `X-AUTH-TOKEN`；仅配置 BaseURL 或 Token extractor 不会改变发出的鉴权 header。接入时须明确服务专用适配与会话所有者，保持既有 revision、401/403、取消和内存存储边界；本次未做适配。 |
| 请求追踪     | `X-Request-Id` / `request_id` 是单次请求追踪标识                                  | 现有 `X-Http-Request` 是服务端 continuation，二者不能互换；真实服务的 CORS、允许/暴露 header 与缓存策略需按所选协议确认。                                                                                  |
| 响应与错误   | `model` 判别响应，业务错误位于 `errors.datas[].code`                              | 未来域 API 负责运行时校验与错误映射；注册与 profile 虽同为 `model: account`，其 `data` 形状不同，需结合 endpoint 判断。空结果是 HTTP 200 的 `model: empty`；`/healthz` 使用纯文本。                        |
| 数据与分页   | 字符串 ID、unix 秒、nullable 字段；分页为 `current` / `size` 与 `grid.result`     | 未来域边界负责保留 ID 精度、显式转换时间单位，并将外部分页映射到内部 `page` / `pageSize` / `items` / `total`；不改内部统一分页合同。                                                                       |
| 认证生命周期 | 注册/重置不自动登录；登出、改密与重置吊销全部令牌                                 | refresh、缓存清理、登录导航和并发重放均须在实际功能中明确所有者与验证范围；当前基础没有自动 refresh/replay。                                                                                               |
| GraphQL      | 只读独立投影，可选鉴权；业务错误 200，语法/校验错误 422                           | 该行为只属于来源服务，接入时分别处理协议错误、业务错误与 partial data；当前没有安装 GraphQL 依赖或生成客户端。                                                                                             |

源码未随文档提供，以下两处来源表述须在真实接入前核实：§4.2 同时描述验证码关闭时忽略 `code`，又列出携带 `code` 时可能返回 `verification.disabled`；§5 开头对 GraphQL HTTP 200 的概括须结合 §5.4 的 422 协议错误分界理解。保留原文，不据此猜测服务端行为。

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
  "page": { "model": "page", "current": 1, "size": 10, "total": 0, "total_page": 0 },
  "result": { "model": "data.set", "datas": [], "total": 0 },
  "request_id": "..."
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
        "code": "auth.password.wrong",
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
    "datas": [{ "code": "auth.password.wrong", "message": "Incorrect account or password" }]
  }
}
```

兜底语言 `zh-CN`（`i18n.fallback` 可配）。**错误码本身不翻译**，只翻译 `message`。

### 2.5 限流

全局 IP 限流中间件，默认 `50 rps` / 突发 `100`（`rate_limit.rps` / `burst`）。超出返回 429 `common.rate.limit`。

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
| 400    | `common.validate.error`              | 缺必填字段 / 字段格式不合法                        |
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

| 字段        | 类型   | 必填 | 约束                    | 说明                                           |
| ----------- | ------ | ---- | ----------------------- | ---------------------------------------------- |
| `username`  | string | ✅   | 3-32 位 `[A-Za-z0-9_-]` | 用户名                                         |
| `email`     | string | ✅   | 合法邮箱，≤ 128         | 邮箱，服务端归一化为小写                       |
| `password`  | string | ✅   | 8-64 位，含字母与数字   | 密码                                           |
| `phone`     | string | -    | E.164                   | 手机号。填了会做唯一性校验，也可作为验证码目标 |
| `nickname`  | string | -    | ≤ 64                    | 昵称，留空回落为用户名                         |
| `code`      | string | 见下 | 纯数字，≤ 16            | 验证码                                         |
| `code_type` | string | -    | `email` / `phone`       | 用哪个标识匹配验证码，留空默认 `email`         |

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
| 400    | `common.validate.error`               | 字段格式不合法（用户名 / 密码 / 邮箱 / 手机号） |
| 400    | `verification.code.required`          | 开启验证码但未提供 `code`                       |
| 400    | `verification.code.invalid`           | 验证码不正确，或已被使用 / 被重发顶掉           |
| 400    | `verification.code.expired`           | 验证码已过期                                    |
| 400    | `verification.target.missing`         | `code_type=phone` 但未填 `phone`                |
| 409    | `account.username.exists`             | 用户名已被占用                                  |
| 409    | `account.email.exists`                | 邮箱已被注册                                    |
| 409    | `account.phone.exists`                | 手机号已被注册                                  |
| 429    | `verification.code.attempts.exceeded` | 该验证码错误次数超限                            |
| 503    | `verification.disabled`               | 验证码功能未启用（此时不该带 `code`）           |

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

| 状态码 | 错误码                  | 触发条件                                             |
| ------ | ----------------------- | ---------------------------------------------------- |
| 400    | `common.validate.error` | 缺字段                                               |
| 401    | `auth.password.wrong`   | **账号不存在与密码错误返回同一个错误**，避免账号枚举 |
| 403    | `auth.account.disabled` | 账号已被禁用                                         |

### 4.4 刷新令牌

```
POST /api/v1/auth/refresh
```

用刷新令牌换取新的令牌对。返回结构与登录相同。

**请求体**

| 字段            | 类型   | 必填 | 说明                 |
| --------------- | ------ | ---- | -------------------- |
| `refresh_token` | string | ✅   | 登录时拿到的刷新令牌 |

**错误**

| 状态码 | 错误码                   | 触发条件                                     |
| ------ | ------------------------ | -------------------------------------------- |
| 401    | `auth.token.invalid`     | 令牌无效                                     |
| 401    | `auth.token.expired`     | 令牌已过期                                   |
| 401    | `auth.token.wrong.type`  | 传的是访问令牌                               |
| 401    | `auth.token.revoked`     | 账号已登出 / 改密 / 重置密码，令牌版本不匹配 |
| 401    | `auth.account.not.found` | 账号不存在或已注销                           |
| 403    | `auth.account.disabled`  | 账号已被禁用                                 |

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
| 400    | `common.validate.error`               | 字段格式不合法                     |
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

| 状态码 | 错误码                    | 触发条件             |
| ------ | ------------------------- | -------------------- |
| 400    | `auth.old.password.wrong` | 原密码错误           |
| 400    | `common.validate.error`   | 新密码不符合强度要求 |
| 401    | 同 4.6                    | 鉴权失败             |

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

③ 旧密码登录 → 401 auth.password.wrong
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

格式为「域.子域.原因」，**错误码本身即 i18n key**，不随语言变化。

### 8.1 通用

| 错误码                      | HTTP | 说明                                       |
| --------------------------- | ---- | ------------------------------------------ |
| `common.bad.request`        | 400  | 请求参数错误                               |
| `common.validate.error`     | 400  | 参数校验失败，`message` 里带具体字段与原因 |
| `validate.json.syntax`      | 400  | 请求体不是合法 JSON                        |
| `validate.type.mismatch`    | 400  | 字段类型不匹配                             |
| `common.forbidden`          | 403  | 无访问权限                                 |
| `common.not.found`          | 404  | 资源不存在                                 |
| `common.route.not.found`    | 404  | 接口不存在                                 |
| `common.method.not.allowed` | 405  | 请求方法不被允许                           |
| `common.conflict`           | 409  | 资源已存在                                 |
| `common.rate.limit`         | 429  | 触发限流                                   |
| `common.database.error`     | 500  | 数据库操作异常                             |
| `common.internal.error`     | 500  | 服务内部异常                               |

### 8.2 鉴权

| 错误码                    | HTTP | 说明                                     |
| ------------------------- | ---- | ---------------------------------------- |
| `auth.token.missing`      | 401  | 缺少鉴权令牌（或用了不支持的携带方式）   |
| `auth.token.malformed`    | 401  | 令牌格式非法，期望 `Bearer <token>`      |
| `auth.token.invalid`      | 401  | 令牌无效                                 |
| `auth.token.expired`      | 401  | 令牌已过期                               |
| `auth.token.revoked`      | 401  | 令牌已失效（登出 / 改密 / 重置密码后）   |
| `auth.token.wrong.type`   | 401  | 令牌类型不正确（如用刷新令牌访问接口）   |
| `auth.account.not.found`  | 401  | 账号不存在或已注销                       |
| `auth.password.wrong`     | 401  | 账号或密码错误（**不区分账号是否存在**） |
| `auth.old.password.wrong` | 400  | 原密码错误                               |
| `auth.account.disabled`   | 403  | 账号已被禁用                             |
| `auth.token.sign.failed`  | 500  | 令牌签发失败                             |

### 8.3 账号

| 错误码                         | HTTP | 说明           |
| ------------------------------ | ---- | -------------- |
| `account.not.found`            | 404  | 账号不存在     |
| `account.username.exists`      | 409  | 用户名已被占用 |
| `account.email.exists`         | 409  | 邮箱已被注册   |
| `account.phone.exists`         | 409  | 手机号已被注册 |
| `account.create.failed`        | 500  | 创建账号失败   |
| `account.update.failed`        | 500  | 更新账号失败   |
| `account.password.hash.failed` | 500  | 密码加密失败   |

### 8.4 验证码

| 错误码                                | HTTP | 说明                                                   |
| ------------------------------------- | ---- | ------------------------------------------------------ |
| `verification.disabled`               | 503  | 验证码功能未启用                                       |
| `verification.target.invalid`         | 400  | 接收目标格式不正确                                     |
| `verification.target.missing`         | 400  | 缺少指定类型的接收目标                                 |
| `verification.target.not.registered`  | 404  | 目标尚未注册（`reset_password` 场景）                  |
| `verification.scene.unsupported`      | 400  | 不支持的验证码场景                                     |
| `verification.code.required`          | 400  | 请先获取验证码                                         |
| `verification.code.invalid`           | 400  | 验证码不正确（**也覆盖「没发过 / 已用过 / 被顶掉」**） |
| `verification.code.expired`           | 400  | 验证码已过期                                           |
| `verification.code.consumed`          | 400  | 验证码已被使用（并发抢同一个码时失败的一方）           |
| `verification.code.attempts.exceeded` | 429  | 验证码错误次数过多                                     |
| `verification.code.too.frequent`      | 429  | 发送过于频繁，`message` 带需等待秒数                   |
| `verification.code.daily.limit`       | 429  | 当日发送次数已达上限                                   |
| `verification.channel.unavailable`    | 503  | 发送通道未配置                                         |
| `verification.send.failed`            | 500  | 验证码发送失败                                         |
| `verification.code.generate.failed`   | 500  | 验证码生成失败                                         |
| `verification.code.save.failed`       | 500  | 验证码保存失败                                         |

> **「没发过 / 已被使用 / 被重发顶掉」归一为同一个 `verification.code.invalid`**，不做细分 —— 细分等于给攻击者一个探测「这个邮箱是否正在注册」的接口。对客户端来说处理动作完全一样：重新获取验证码。

### 8.5 组织

| 错误码              | HTTP | 说明                                     |
| ------------------- | ---- | ---------------------------------------- |
| `org.not.found`     | 404  | 组织不存在                               |
| `org.create.failed` | 500  | 创建组织失败（注册时初始化默认组织失败） |

---

## 9. 参数校验规则

字段格式校验失败统一返回 `common.validate.error`，`message` 形如 `参数校验失败: password 需为 8-64 位且同时包含字母和数字`。

| 字段                        | 规则                                        | 提示                                   |
| --------------------------- | ------------------------------------------- | -------------------------------------- |
| `username`                  | `^[A-Za-z0-9_-]{3,32}$`                     | 需为 3-32 位字母、数字、下划线或短横线 |
| `password` / `new_password` | 8-64 位，**同时**含字母和数字               | 需为 8-64 位且同时包含字母和数字       |
| `email`                     | 标准邮箱格式，≤ 128                         | 邮箱格式不正确                         |
| `phone`                     | E.164：`+` 开头，1-9 起头，总长 7-15 位数字 | 需为合法国际手机号                     |
| `target`（验证码）          | 邮箱或 E.164 手机号，≤ 128                  | 目标格式不正确                         |
| `code`                      | 纯数字，≤ 16 位                             | -                                      |
| `nickname`                  | ≤ 64                                        | -                                      |

**手机号归一化**：服务端会去掉空格、短横线、括号、点，再做 E.164 校验。因此 `+86 138-0013-8000`、`+86 138.0013.8000` 都能通过；但**缺国家码的 `13800138000` 会被拒**（`verification.target.invalid`）。

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
        "code": "common.validate.error",
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
