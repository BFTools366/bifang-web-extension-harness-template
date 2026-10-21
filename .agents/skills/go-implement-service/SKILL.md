---
name: go-implement-service
description: 在 Workspace 的 _server 成员中实施 Go HTTP 服务与业务，复用 Gin、GORM、真实持久化与既有 HTTP 边界，不运行独立初始化问卷。
---

# Web Harness：实施 Go 服务

先读根 docs/GO_SERVICE.md 与 .harness/workspace.json；服务成员目录是 Go 命令的 cwd，根是唯一 Git、策略与 PRD。遵循 cmd → bootstrap → api/v1 → service → repository → database；service 不依赖 gin.Context，handler 只解码、调用和响应。

[上游快照](assets/UPSTREAM.json) 固定来源与逐文件摘要，[服务基础资产](assets/go-service/README.md) 仅用于工程创建器。维护时按现有功能增量修改，不覆盖产品文件；[账号条件资产](assets/go-service-user-api/README.md) 和 [GraphQL 条件资产](assets/go-service-graphql/README.md) 只作为受校准的参考，禁止照搬其中初始化开关、Mock 或独立生命周期。

持久化委托 go-implement-persistence；带查询条件的远端读取与有限集合必须委托 go-implement-graphql；验证码委托 go-implement-verification；文件与子进程分别委托 go-implement-file-operations / go-implement-external-command。按本次变化执行非空 go test，接口或装配变化补真实 HTTP 成功和风险失败；构建按 go-build-local。返回调用方，不自动提交、发布或升级。

首次用户装配使用 [账号装配器](scripts/install-users.ts)：在根运行 node .agents/skills/go-implement-service/scripts/install-users.ts --workspace . --check 只读核对；通过后去掉 --check 写入。--operations 接受 register,login,profile,logout,refresh,password.change,verification，默认前四项。verification 只与已选 register 组合；装配器应用独立中性 overlay，原始快照摘要不变。只适用尚无账号业务文件的自建成员；存在实现时增量编辑。装配器先检查全部目标和格式，不覆盖已存在文件；随后在服务成员运行 go mod tidy 与相关测试。验证码表与发码路由仅选择 verification 时挂载，并开启校验；发送配置不完整则明确启动失败。Mock 默认关闭，只有用户明确要求时才在 dev 配置启用。找回路由仍需独立接线；条件源码中的旧 Mock/问卷说明不构成当前执行规则。

本 Skill 同时承接上游 Go HTTP adapter、行为保持重构与服务端 i18n：按 docs/GO_SERVICE.md 的能力归属和日常开发规则处理配置、日志、超时/取消、并发退出、注释及稳定错误。源码结构变化保持可观察行为并运行受影响非空测试；并发写变化加 race。不会另创 Go 产品、Task、Git 或发布状态。
