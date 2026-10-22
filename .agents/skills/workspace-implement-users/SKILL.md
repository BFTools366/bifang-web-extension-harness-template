---
name: workspace-implement-users
description: 在 Workspace 按具体操作完成用户生命周期、注册、登录、刷新、退出、资料与改密的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。
---

# Web Harness：实施用户与会话

完整用户数据归属以 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md) 为准。首次自建账号服务使用 install-users，同时安装八表组织 RBAC 和真实 gqlgen 查询。前端统一使用 [goAccountApplicationFiles](scripts/assemble-account.ts)，提供真实首页、host、operations 和业务权限；装配器保留账号、组织恢复及个人设置核心依赖；仅显式选择 identity.workspace 时自动接通用户、组织、成员、邀请、角色权限、成员角色分配及协议桥，前端只以有效 code 授权。identity.session 只作低层会话复用，不能作为完整用户系统交付；已有产品和外部服务继续按可信合同增量接线，不重装。

先读根 .harness/workspace.json、唯一 PRD 与 [领域知识](../web-compose-capabilities/knowledge/identity.md)，只取当前操作需要的固定设计和模板。由 workspace-implement-feature 或 web-implement-change 委托，收到范围、成员、服务归属、写入所有权和验收合同后执行，完成后返回调用方，不重启创建或重复问卷。

已有服务：核对 BaseURL、endpoint/SDL、字段、认证、授权、错误及恢复语义，仅实现消费侧，不擅自扩张服务端写入。自建服务：调用 go-implement-service 与 go-implement-persistence，在 _server 实现该领域，再按 web-implement-change 接齐真实 typed adapter、Query、页面和错误恢复；不要求用户单独填写 Go 表单。

复用 Go 账号条件资产和前端身份状态机；注册在数据库同一事务创建 Account、自有 Organization 与 owner OrganizationUser，不能只有旧 Org.owner_id。账号加入其他组织不丢自有组织。已选注册默认邮箱加密码，用户名由服务生成并保留旧客户端可选字段，登录兼容旧用户名。自建邮箱注册默认补齐 verification 和 identity.verification；无邮件服务时默认开发模拟投递，发送后在注册表单直接显示验证码，接入真实 SMTP 并关闭 mock 后自动移除回显。发码与找回委托 go-implement-verification，已有服务遵循可信合同。TokenPair/Unix 秒/字符串 ID、全账号 logout 与 refresh 失效语义必须按真实实现告知前端；非开发环境拒绝公开默认 JWT secret。

上游真实支持与本地成员扩展的区别以 [Go 客户端合同](../../../docs/GO_CLIENT_CONTRACT.md) 为准；不是把账号自服务当成客户 CRM 或管理端 CRUD。连接既有标准 Go 服务时不得要求其返回本地 organization_user 扩展。

先锁定数据和 wire 合同：实体/ID/单位/租户 → REST 写与无查询条件的单对象读取 → GraphQL 带条件读取与集合 → 认证/权限/错误 → 幂等及恢复。协议分工遵循 [工程规则](../../../docs/ENGINEERING_RULES.md) 与 [数据访问规范](../../../docs/DATA_ACCESS.md#12-rest-与-graphql-分工)。只为本次操作补最小依赖，不从模块名自动启用全部功能；与其他领域共享的事实通过明确接口消费，避免双向依赖。前端状态归既有 Query/会话 owner，不复制到新的全局状态。

产品运行只用真实服务，禁止业务 Mock、默认演示账号或 fixtures。测试使用隔离数据库和测试替身可行；完成需真实 HTTP 证明核心成功、最高风险失败和数据持久化，核对前端实际请求及恢复。同步根 docs/api 的受影响契约和业务关联，返回实际路径、运行结果及未决外部条件。

自建服务首次用户场景：先按 go-implement-service 的账号装配器完成 register/login/profile/logout/password.change 及 owner 成员事务，再把 [Go 身份 adapter](assets/go-identity-adapter.ts.txt) 放入对应前端 src/data/api/identity/adapter.ts；复用已有 session/Query/client，不能再写 fetch。已选 register 可由 applicationFiles 装配邮箱注册页、条件发码、路由及 i18n；完整基线包含 /account/settings：/account/settings 邮箱只读及昵称保存，/account/password 独立改密，已有服务按可信合同接线。验证取消、字段错误、注册后显式登录、已注册只重试登录及未知创建不重放。基础应用装配器仅支持既有基础操作；扩展操作由本 Skill 增量完成，不能仅把它写入 wiring.resolved 当作已实现。两前端同时选中时分别接入，后端只实现一次。若只加 refresh/改密则不重复安装账号模板；按现有 owner 增量挂载已选路由。资料必须含有效 Account、Organization、OrganizationUser；重启服务后重读一致，并证明退出使旧 access/refresh 失效。

成员范围严格来自 Workspace：纯 Server 只完成后端、接口及实际 HTTP/持久化验证，不生成前端或索要 UI 表单；存在所选前端成员时完成这些成员的真实消费端与联调。

Go adapter 接线另复制 [注册回执映射](assets/registration-verification.ts.txt) 到 src/data/api/identity/verification.ts，再同时复制 [共享 wire 类型](../web-compose-capabilities/templates/compositions/account-workspace/data/api/auth/serviceContract.ts.txt) 到 src/data/api/identity/goContract.ts、[REST 信封](../web-compose-capabilities/templates/compositions/account-workspace/data/api/foundationProtocol.ts.txt) 到 src/data/api/foundationProtocol.ts，保持同一来源，不重新定义 DTO。默认 workspace 模式要求真实成员扩展；既有未扩展 Go 服务显式选择 upstream 模式，仅证明账号身份，不把 nullable org 当完整用户。adapter.refresh 返回完整 TokenPair/Account，changePassword 调用真实 PUT；这些窄方法不自动采用新凭据、清理会话或提供页面，调用方按唯一 owner 处理成功、失效和未知结果。未选中/未挂载操作不得生成入口。

前后端固定 Auth 设计、11 码、读取依赖、版本及恢复合同见 [Auth 标准](../../../docs/ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)。首次装配同步页面、HTTP adapter、Go overlay、迁移及相关行为测试；已有产品按同一 owner 增量实现，不仅更新菜单或文档。
