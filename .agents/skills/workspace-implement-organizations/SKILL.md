---
name: workspace-implement-organizations
description: 在 Workspace 按具体操作完成组织切换、成员管理、邀请、加入与退出的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。
---

# Web Harness：实施组织与成员

数据归属统一遵循 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md)。本地 install-users 装配八表 RBAC 与组织服务；完整前端入口是 workspace-implement-users/scripts/assemble-account.ts，不另建组织 owner。新增共享实体嵌入 TeamOwned，私有实体嵌入 MemberOwned；在实际领域事务内调用 RequireTeamResource 并约束 SQL/total，不能按创建者或成员 actor 分区组织共享数据。组织管理 adapter 位于 assets/go-team-adapter.ts.txt，前端只消费有效权限 code，既有服务须提供等效合同。

先读根 .harness/workspace.json、唯一 PRD 与 [领域知识](../web-compose-capabilities/knowledge/organization.md)，只取当前操作需要的固定设计和模板。由 workspace-implement-feature 或 web-implement-change 委托，收到范围、成员、服务归属、写入所有权和验收合同后执行，完成后返回调用方，不重启创建或重复问卷。

已有服务：核对 BaseURL、endpoint/SDL、字段、认证、授权、错误及恢复语义，仅实现消费侧，不擅自扩张服务端写入。自建服务：调用 go-implement-service 与 go-implement-persistence，在 _server 实现该领域，再按 web-implement-change 接齐真实 typed adapter、Query、页面和错误恢复；不要求用户单独填写 Go 表单。

Account、Organization、OrganizationUser 分开建模；组织 ID 是租户边界，成员 ID 是授权和审计主体。注册 owner 成员只在注册事务创建；邀请签发/接受/过期/撤销按真实合同，不能凭客户端组织 ID 成为成员。切换写入未知时重读权威上下文及权限，禁止丢失自有组织或自动重放。

先锁定数据和 wire 合同：实体/ID/单位/租户 → GraphQL 列表查询与其他带业务查询条件的 GET 类读取 → 其余请求全部 RESTful（含路径 ID 详情和全部写入） → 认证/权限/错误 → 幂等及恢复。协议分工遵循 [工程规则](../../../docs/ENGINEERING_RULES.md) 与 [数据访问规范](../../../docs/DATA_ACCESS.md#12-rest-与-graphql-分工)。只为本次操作补最小依赖，不从模块名自动启用全部功能；与其他领域共享的事实通过明确接口消费，避免双向依赖。前端状态归既有 Query/会话 owner，不复制到新的全局状态。

产品运行只用真实服务，禁止业务 Mock、默认演示账号或 fixtures。测试使用隔离数据库和测试替身可行；完成需真实 HTTP 证明核心成功、最高风险失败和数据持久化，核对前端实际请求及恢复。同步根 docs/api 的受影响契约和业务关联，返回实际路径、运行结果及未决外部条件。

成员范围严格来自 Workspace：纯 Server 只完成后端、接口及实际 HTTP/持久化验证，不生成前端或索要 UI 表单；存在所选前端成员时完成这些成员的真实消费端与联调。

前后端固定 Auth 设计、11 码、读取依赖、版本及恢复合同见 [Auth 标准](../../../docs/ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)。首次装配同步页面、HTTP adapter、Go overlay、迁移及相关行为测试；已有产品按同一 owner 增量实现，不仅更新菜单或文档。
