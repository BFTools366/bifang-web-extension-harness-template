---
name: workspace-implement-permissions
description: 在 Workspace 按具体操作完成角色维护、服务端授权、有效权限与撤权的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。
---

# Web Harness：实施权限与角色

先读根 .harness/workspace.json、唯一 PRD 与 [领域知识](../web-compose-capabilities/knowledge/permissions.md)，只取当前操作需要的固定设计和模板。由 workspace-implement-feature 或 web-implement-change 委托，收到范围、成员、服务归属、写入所有权和验收合同后执行，完成后返回调用方，不重启创建或重复问卷。

已有服务：核对 BaseURL、endpoint/SDL、字段、认证、授权、错误及恢复语义，仅实现消费侧，不擅自扩张服务端写入。自建服务：调用 go-implement-service 与 go-implement-persistence，在 _server 实现该领域，再按 web-implement-change 接齐真实 typed adapter、Query、页面和错误恢复；不要求用户单独填写 Go 表单。

固定 Go 上游没有 RBAC；本地团队 overlay 已有 OrganizationRole、RolePermission、OrganizationUserRole、Permission 与真实查询/写入接口，见 [Go 客户端合同](../../../docs/GO_CLIENT_CONTRACT.md)。完整账号用 identity.workspace 装配，所有成员含 owner 的权限都通过角色链计算，不保留成员直接授权旁路。前端页面、菜单、按钮和执行前只判断有效 code，不判断角色名称；后端再次执行 RBAC、团队及对象归属校验。系统角色、成员私有边界及保留管理权限以 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md) 为准。新增领域先在服务声明权限目录，再在真实业务事务内授权。

服务端在每个敏感读取和写入校验主体、组织、权限码、资源范围；前端路由、导航、页面、元素与提交前复用同一合同。缺失/未加载/撤销默认拒绝；403 保留有效身份。防止删除最后 owner/admin、权限提升与旧组织查询泄漏，撤权后取消私有请求并精确失效缓存。

先锁定数据和 wire 合同：实体/ID/单位/租户 → REST 写与无查询条件的单对象读取 → GraphQL 带条件读取与集合 → 认证/权限/错误 → 幂等及恢复。协议分工遵循 [工程规则](../../../docs/ENGINEERING_RULES.md) 与 [数据访问规范](../../../docs/DATA_ACCESS.md#12-rest-与-graphql-分工)。只为本次操作补最小依赖，不从模块名自动启用全部功能；与其他领域共享的事实通过明确接口消费，避免双向依赖。前端状态归既有 Query/会话 owner，不复制到新的全局状态。

产品运行只用真实服务，禁止业务 Mock、默认演示账号或 fixtures。测试使用隔离数据库和测试替身可行；完成需真实 HTTP 证明核心成功、最高风险失败和数据持久化，核对前端实际请求及恢复。同步根 docs/api 的受影响契约和业务关联，返回实际路径、运行结果及未决外部条件。

成员范围严格来自 Workspace：纯 Server 只完成后端、接口及实际 HTTP/持久化验证，不生成前端或索要 UI 表单；存在所选前端成员时完成这些成员的真实消费端与联调。
