---
name: go-implement-service
description: 在 Workspace 的 _server 成员中实施 Go HTTP 服务与业务，复用 Gin、GORM、真实持久化与既有 HTTP 边界，不运行独立初始化问卷。
---

# Web Harness：实施 Go 服务

新项目首版的前后端业务开发和测试必须等待原型确认。在 Workspace 根展示单一原型、取得用户明确确认并通过 `pnpm prototype:check initial-create <设计请求来源>` 后，才可装配业务模块、修改前后端产品代码或运行业务测试；将同一 scope/request 和通过证据交给被委托的领域 Skill。创建范围确认不能代替设计反馈，不允许先做后端等待前端原型。中性工程生成、需求/接口只读分析及原型自查仍可先进行；纯 Server 任务和后续无设计变化的维护按各自已确认范围处理。

用户系统的固定归属见 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md)。首次 install-users 同时装配本地 assets/team-baseline：八表 RBAC、归属嵌入模型、事务内授权、成员/角色版本、邀请、REST 命令和 GraphQL 查询。所有成员含 owner 都经过角色权限链；前端只判断有效 code。默认 SQLite 的锁合同不能直接外推到其他数据库。原始上游快照保持不变。

先读根 docs/GO_SERVICE.md 与 .harness/workspace.json；服务成员目录是 Go 命令的 cwd，根拥有唯一策略与 PRD，Git 可选且启用时仅归根管理。遵循 cmd → bootstrap → api/v1 → service → repository → database；service 不依赖 gin.Context，handler 只解码、调用和响应。

[上游快照](assets/UPSTREAM.json) 固定来源与逐文件摘要，[服务基础资产](assets/go-service/README.md) 仅用于工程创建器。维护时按现有功能增量修改，不覆盖产品文件；[账号条件资产](assets/go-service-user-api/README.md) 和 [GraphQL 条件资产](assets/go-service-graphql/README.md) 只作为受校准的参考，禁止照搬其中初始化开关、Mock 或独立生命周期。

持久化委托 go-implement-persistence；仅列表查询或其他带业务查询条件的 GET 类读取委托 go-implement-graphql，其余请求全部 RESTful；验证码委托 go-implement-verification；文件与子进程分别委托 go-implement-file-operations / go-implement-external-command。按本次变化执行非空 go test，接口或装配变化补真实 HTTP 成功和风险失败；构建按 go-build-local。返回调用方，不自动提交、发布或升级。

首次用户装配使用 [账号装配器](scripts/install-users.ts)：在根运行 node .agents/skills/go-implement-service/scripts/install-users.ts --workspace . --check 只读核对；通过后去掉 --check 写入。--operations 接受 register,login,profile,logout,refresh,password.change,verification，默认 register、login、profile、logout、password.change 并随 register 自动补齐 verification；不另问是否验证。verification 只与已选 register 组合；装配器应用独立中性 overlay，原始快照摘要不变。只适用尚无账号业务文件的自建成员；存在实现时增量编辑。装配器先检查全部目标和格式，不覆盖已存在文件；随后在服务成员运行 go mod tidy 与相关测试。邮箱注册默认挂载验证码表与发码路由并开启校验；未接邮件服务时 dev 配置默认 mock=true，发送成功后表单显示实际验证码，其他环境 mock=false。真实 SMTP 与关闭 mock 一起配置，真实回执自动移除页面回显，配置不完整则明确失败。找回路由仍需独立接线；条件源码中的旧 Mock/问卷说明不构成当前执行规则。

本 Skill 同时承接上游 Go HTTP adapter、行为保持重构与服务端 i18n：按 docs/GO_SERVICE.md 的能力归属和日常开发规则处理配置、日志、超时/取消、并发退出、注释及稳定错误。源码结构变化保持可观察行为并运行受影响非空测试；并发写变化加 race。不会另创 Go 产品、Task、Git 或发布状态。
