# 固定设计与代码接线合同

实施入口在成功下游读取已确认 PRD 与有效原型登记，首次工程基线以当前已发布下游文件快照构成 base Map，调用 applicationFiles(base, options) 返回文件 Map，再在授权范围写入当前宿主。该 helper 不要求终端恢复已删除的初始化器，也不调用源 webFiles/extensionFiles。已有产品按现有路由和状态 owner 增量接入固定资产，不能重复全量装配。源 Harness 只维护这些可复用资产，不装配具体产品。

## 必需输入

- selection：明确宿主及 modules、operations、recipe 三者之一；空 modules 只选择基础布局，实际首页仍必填。
- homePageSource：按需求实现、导出 HomePage 的真实组件；主内容 landmark 由固定主界面提供。
- dataMode：明确 mock 或 adapter。Mock 提供测试账号及当前流程必要 fixture；真实模式为每个所选模块提供导出 api 的实现，不从 BaseURL 猜 endpoint。
- 采用权限时，pagePermissions 与 actionPermissions 来自 PRD/可信服务，所有生成页面及写操作必须具有非空要求；Mock 授权按 subjectId 与 organizationId 的结构化上下文提供，默认空权限，不能从模块选择推导授权。
- content 为可选内容适配：translations 只覆盖既有 zh/en 模板键；pageSources 只替换已选能力的固定组件，必须保留其 API、scope 和动作 props。来源与完整例子见 [提取合同](extraction.md)，不覆盖项目身份或既有产品实现。

## 接线结果

应用布局与真实首页、实际路由/导航、各能力固定页面、单一身份/权限 owner、Query/API 边界、错误恢复和 i18n 一起返回。.harness/application-wiring.json 只记录实际接线与操作依赖，不是第二份 PRD、特性开关或完成证据。

固定资产之外的实际业务页面、路由、入口和功能继续由实施入口按已确认需求补齐，不能把这组能力页当作全部产品范围。

基础身份固定包含登录、恢复、退出、主界面用户区、匿名重定向、安全返回、HTTP Token 同步与当前 401 清理；注册、找回、组织、权限独立选择。购买依赖闭包必须包含 identity.session，依赖原因在选择结果中展示并纳入一次范围确认。

Web 保留 Vite 与 TanStack 文件路由。Extension 每个入口有独立 Router 与当前上下文会话，默认内存凭据；不自动增加 background、浏览器权限或跨入口持久登录。真实 API 读取使用既有 Query，传输使用 applicationHttp，身份 adapter 的 login/validate/logout 使用隔离认证传输：login 不携带旧 Token，validate/logout 显式使用传入凭据，不能提前修改 applicationHttp。认证临时传输的 Token 不成为第二个应用会话 owner，应用 Token 只由 IdentityTransport 在校验后提交。其他业务传输复用 applicationHttp；订单只读 adapter 只需 list，不要求未选 find/create。

## 完成核对

按“需求 → 固定设计 → 代码落点 → 路由/元素 → API/状态 → 行为测试”逐项核对。测试至少覆盖匿名直达、登录返回、请求 Token、退出/401、权限拒绝/撤权及购买身份依赖、幂等与未知结果恢复。编译与相关测试之外，创建交付必须实际走查首版关键流程；最终 dist/zip 要求另走真实产物门禁。

模板生成成功只是实现输入，不能代替实际产品首页、真实服务接入或创建交付完成。

## 输入示例

```ts
const options = {
  selection: { host: "web", operations: ["orders.purchase"] },
  homePageSource: confirmedHomePageSource, // 由当前真实需求实施，不使用默认欢迎页
  dataMode: "mock",
  fixtures: {
    accounts: [{ id: "test-user", account: "demo", password: "demo", displayName: "测试用户" }],
    products: [
      {
        id: "item",
        name: "测试商品",
        description: "已确认流程测试数据",
        price: { minor: 1000, currency: "CNY" }
      }
    ],
    balances: { "test-user": { minor: 5000, currency: "CNY" } }
  }
}
```

这里只展示参数结构，测试账号仅用于明确 Mock。采用组织时，余额和审计 actor 使用 `JSON.stringify([subjectId, organizationId])`，权限 fixtures 使用 `{subjectId, organizationId, codes}` 数组，避免字符串拼接碰撞。真实 adapter 从可信契约映射当前 owner，不能信任前端 actor 作为服务端授权。
