---
name: web-connect-http-service
description: 在已初始化 React Web 或 Plasmo Extension 下游中，把已授权服务的类型化 API Mock 迁移到真实 HTTP，或接入已批准的真实 endpoint，处理配置、域契约、响应映射、缓存切换及相关验证；不从 BaseURL 猜接口，不扩张凭据、生产或权限授权。
---

# Web Harness：接入真实 HTTP 服务

## 触发与范围

- 仅用于已初始化且 `projectType=web|extension` 的下游；先读取 `.harness/project.json`。Harness 源不接收、分析或记录产品地址、endpoint 或凭据，交回调用方执行源范围门禁。
- 当前授权明确包含真实服务接入或 API Mock 到 HTTP 的迁移时使用。初始化、只填写 BaseURL、继续 Mock 开发或纯 UI 修改不自动触发。
- 本 Skill 拥有批准范围内有限 REST/GraphQL 请求的域 API 迁移；产品范围、UI/Router 呈现和候选验收继续由调用方负责。
- 本地能力直接真实实现，不要求 BaseURL，也不属于本 Skill 的 Mock 迁移范围；混合流程仅接入真实依赖远端 API 的操作。

## 输入与事实源

由 Agent 从会话、现有实现和契约中恢复服务及环境、有效 BaseURL、endpoint 路径/方法、输入/响应/认证契约、现有域 API、调用方和允许修改范围。按工程规则“渐进式交互引导”逐项补问阻断缺项，每轮优先问一个与本次操作及最小依赖链相关的问题；有可靠默认方案时给出建议与理由。清单用于 Agent 自查，不要求用户一次提供全部环境或接口；非阻断项标待定并继续独立工作，不从地址猜接口、编造权限或虚构登录入口。

读取 `docs/RUNTIME_CONFIGURATION.md`、`docs/DATA_ACCESS.md` 的 HTTP/认证、迁移与测试章节；仅按真实传输需要扩大读取。没有消费者时不新增依赖、跨上下文架构或通用 adapter。

按 [列表查询协议强约定](../../../docs/DATA_ACCESS.md#列表查询协议强约定) 核对实际操作和可信服务契约；协议不符合或契约缺失时返回阻断，迁移不超出当前实现授权。

按 [功能模块组合](../web-compose-capabilities/references/requirements-selection.md) 复用唯一 PRD 或本次明确需求的模块、操作与作用域；命中时调用 `$web-compose-capabilities`，只读所选知识，实施需要时再取模板。不按产品分类默认启用功能，不从已安装 Skill 推断授权；范围清楚的日常修复直接返回当前流程。Web 与 Extension 各自遵守宿主边界。

持续 SSE/GraphQL Subscription 由 `$web-implement-event-stream` 拥有连接与恢复；收到这类接入时传递已有配置、契约和授权范围给它，不套用有限 `requestHttpQuery`、不建立第二连接。混合流程只在此接入有限请求部分，两者返回当前调用方。

## 工作流程

1. 委托 `$web-review-api-contract` 只核对本次操作与最小依赖链，复用已有且未漂移的证据；缺口先补齐，不从参考或 Mock 生成服务端保证。按环境和服务确定本次迁移范围。配置只通过既有冻结 `APP_CONFIG` 加载；公开变量不承载秘密，不新增隐式环境覆盖。
2. 保持 UI/Query 消费的领域契约，在 `src/data/api/<domain>/` 替换对应 Mock 或新增真实实现。复用 `applicationHttp` / `requestHttpQuery`、受控 target、取消、错误和认证边界；输入、外部响应和分页字段在 API 层校验、映射。
   按 DATA_ACCESS 的“已选服务的通用 HTTP 合同”装配真实请求 Header：X-Lang、逐请求 X-Request-Id 和受保护请求的 Authorization: Bearer 不写入业务 JSON/URL；公开请求隔离旧凭据与 401 副作用。现有默认 client 协议不同则先做显式服务适配，不仅替换 extractor。保留响应 Header、REST 合同已定义的 JSON request_id、TokenPair 与刷新请求体各自的方向，逐 endpoint 校验成功/错误 envelope、字符串 ID、秒时间和分页映射。
3. 已迁移服务移除运行路径中的 Mock 分支和业务样例；未配置地址的远端 API 明确显示未就绪并报告剩余范围，不生成产品 Mock。本地实现继续真实运行，不纳入 Mock 迁移。真实请求失败不得回落 Mock，测试样例 留在测试边界内。
4. 按配置加载方式重新启动；切换时取消相关旧请求并清理对应 Mock Query 缓存，防止样例数据或迟到响应覆盖真实结果。
5. 复用既有认证及反馈所有者；真实登录入口存在时才装配批准的导航。会话转换或失效接线变化交回当前实施入口委托 `$web-implement-auth-session`；新增凭据刷新、Cookie、自动重放、跨上下文认证或权限变化先由调用方处理范围和专用门禁。
6. 网络验证仅使用已授权环境、身份及操作，不扩张生产、付费、凭据或不可逆写入授权。Extension 的 BaseURL 不授予 host 权限；相关兼容审查调用 `$web-review-extension-compatibility`，真实双浏览器硬门禁交回调用方的既有候选验收链。
7. 真实接入改变公开 API、传输或消费者业务流程后，委托 `$web-document-api` 同步受影响接口、已实现业务说明与关联，并核对旧文档和当前代码差异。沿用其聚合布局、协议格式与只读检查；调用方已同步的同一变更复用，不重复全项目生成。

## 验证与交付

按工程规则运行本次受影响的相关非空测试；环境或结构合同确实变化时再运行对应 `pnpm env:validate` 或 `pnpm harness validate`。覆盖适用的真实成功、最高风险失败不回落 Mock、响应/分页校验及旧请求和缓存切换；不为未修改的 client 重建测试。将实际命令、范围和结果返回调用方，同一源码状态已完成的检查直接复用，后续修改使证据失效时才重跑。

不自动追加构建、E2E 或完整验收。真实服务、CORS、登录导航、权限或浏览器场景未执行时标为 `Unverified`；候选或硬要求返回调用方处理。

逐环境、逐远端服务报告当前真实 HTTP 接入状态、修改文件、域契约、检查和测试、实际联网证据、剩余未接入接口、未验证项及后续门禁。本地实现单独按真实行为报告，不计入待接入服务。配置成功、Mock 测试或 HTTP 替身测试不等于真实服务可达。

## 历史协议参考（仅测试）

按需参考 [账户组合的API与Mock](../web-compose-capabilities/templates/compositions/account-workspace/README.md)：原始请求快照、Header、REST/GraphQL解析、领域投影和内存服务分层。该历史 Mock 仅可用于隔离测试，不进入产品装配；模板协议仅属于已采用参考合同，真实接入仍逐操作核对。
