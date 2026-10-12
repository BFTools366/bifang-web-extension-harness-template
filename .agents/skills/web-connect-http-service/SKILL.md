---
name: web-connect-http-service
description: 在已初始化 React Web 或 Plasmo Extension 下游中，把已授权服务的类型化 API Mock 迁移到真实 HTTP，或接入已批准的真实 endpoint，处理配置、域契约、响应映射、缓存切换及相关验证；不从 BaseURL 猜接口，不扩张凭据、生产或权限授权。
---

# Web Harness：接入真实 HTTP 服务

## 触发与范围

- 仅用于已初始化且 `projectType=web|extension` 的下游；先读取 `.harness/project.json`。Harness 源不接收、分析或记录产品地址、endpoint 或凭据，交回调用方执行源范围门禁。
- 当前授权明确包含真实服务接入或 API Mock 到 HTTP 的迁移时使用。初始化、只填写 BaseURL、继续 Mock 开发或纯 UI 修改不自动触发。
- 本 Skill 拥有批准范围内的域 API 迁移；产品范围、UI/Router 呈现和候选验收继续由调用方负责。
- 本地能力直接真实实现，不要求 BaseURL，也不属于本 Skill 的 Mock 迁移范围；混合流程仅接入真实依赖远端 API 的操作。

## 输入与事实源

确认服务及环境、有效 BaseURL、endpoint 路径/方法、输入/响应/认证契约、现有域 API、调用方和允许修改范围。复用已确认事实，只汇总询问必要缺项，不从地址猜接口或虚构登录入口。

读取 `docs/RUNTIME_CONFIGURATION.md`、`docs/DATA_ACCESS.md` 的 HTTP/认证、迁移与测试章节；仅按真实传输需要扩大读取。没有消费者时不新增依赖、跨上下文架构或通用 adapter。

## 工作流程

1. 按环境和服务确定本次迁移范围。配置只通过既有冻结 `APP_CONFIG` 加载；公开变量不承载秘密，不新增隐式环境覆盖。
2. 保持 UI/Query 消费的领域契约，在 `src/data/api/<domain>/` 替换对应 Mock 或新增真实实现。复用 `applicationHttp` / `requestHttpQuery`、受控 target、取消、错误和认证边界；输入、外部响应和分页字段在 API 层校验、映射。
3. 已迁移服务移除运行路径中的 Mock 分支和业务 fixture；未配置地址的远端 API 保持完整 API Mock 并报告剩余范围。本地实现继续真实运行，不纳入 Mock 迁移。真实请求失败不得回落 Mock，测试 fixture 留在测试边界内。
4. 按配置加载方式重新启动；切换时取消相关旧请求并清理对应 Mock Query 缓存，防止样例数据或迟到响应覆盖真实结果。
5. 复用既有认证及反馈所有者；真实登录入口存在时才装配批准的导航。新增 refresh、Cookie、自动重放、跨上下文认证或权限变化交回调用方处理范围和专用门禁。
6. 网络验证仅使用已授权环境、身份及操作，不扩张生产、付费、凭据或不可逆写入授权。Extension 的 BaseURL 不授予 host 权限；相关兼容审查调用 `$web-review-extension-compatibility`，真实双浏览器硬门禁交回调用方的既有候选验收链。

## 验证与交付

按 `docs/DATA_ACCESS.md` 的数据变更门禁运行 `pnpm env:validate`、`pnpm harness validate` 与相关非空测试。覆盖适用的 Mock 路径零网络、真实成功、最高风险失败不回落 Mock、响应/分页校验及旧请求和缓存切换；不为未修改的 client 重建测试。将实际命令、范围和结果返回调用方，同一源码状态已完成的检查直接复用，后续修改使证据失效时才重跑。

不自动追加构建、E2E 或完整验收。真实服务、CORS、登录导航、权限或浏览器场景未执行时标为 `Unverified`；候选或硬要求返回调用方处理。

逐环境、逐远端服务报告当前 Mock/HTTP 模式、修改文件、域契约、检查和测试、实际联网证据、剩余远端 API Mock、未验证项及后续门禁。本地实现单独按真实行为报告，不计入待接入服务。配置成功、Mock 测试或 HTTP 替身测试不等于真实服务可达。
