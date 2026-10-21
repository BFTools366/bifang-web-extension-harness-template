---
name: go-implement-graphql
description: 为带查询条件的远端读取、集合与复杂读取实现 Go GraphQL SDL、resolver 和前端 typed Query，复用领域 service，不以 JSON 列表冒充 GraphQL。
---

# Web Harness：实施 Go 查询契约

按 [工程规则](../../../docs/ENGINEERING_RULES.md) 与 [数据访问规范](../../../docs/DATA_ACCESS.md#12-rest-与-graphql-分工)，带查询条件的远端读取必须使用 GraphQL，返回单对象、数量或布尔值也适用。只为已选查询创建 SDL：按真实返回形状明确条件、字段与授权；分页集合再明确过滤、排序、1-based page/pageSize 和 items/total，不给单对象或标量强加分页。不假设 health/me 基础包含业务列表。已有服务使用其真实 Schema；自建服务复用领域 service/repository，resolver 不复制业务规则。

参考 assets 位于 ../go-implement-service/assets/go-service-graphql；gqlgen 固定 v0.17.95、Go >=1.26。首次从原始资产增量装配时，先具备用户 service/token（me 的依赖）；替换 project_id，把 generated/internal/graphql/generated.go 引导快照放到目标 internal/graphql/generated.go，保留 model/models_gen.go。快照是生成物，不能代替业务 resolver。先在 go.mod 显式声明 github.com/99designs/gqlgen v0.17.95，恢复完整引导快照后运行 go mod tidy，再运行 go run -mod=mod github.com/99designs/gqlgen generate；首次不得先 tidy 一个缺本地 model/执行引擎的树。按目标 SDL 重新生成后仅当 deps.Config.GraphQL.Enabled 时追加 newGraphQLModule(deps)，同步配置 graphql.enabled 并核对真实 endpoint；依赖声明进入该成员 go.mod/go.sum。不能把缺生成文件当成已交付。

标准 GraphQL {data,errors} 与 REST 信封分开解析；Query 缓存继续归前端 TanStack Query。按 service 身份校验每次 resolver，匿名或越权不泄漏条目/total；拒绝无限 pageSize 与无界树。写操作沿已有 REST 主交互合同。覆盖真实 HTTP 的成功、匿名拒绝、跨组织、空页和非法变量，再返回调用方。
