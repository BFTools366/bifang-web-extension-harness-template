---
name: web-compose-capabilities
description: 在已初始化 React Web 或 Plasmo Extension 下游中，按具体操作组合身份认证、组织、权限、商品、订单、钱包支付与审计的独立知识库和模板库；用于需求、设计或实施涉及这些能力时，不按产品分类自动启用功能。
---

# Web Harness：组合功能模块

仅在已初始化下游应用。Harness 源只维护通用资源；创建阶段只选择宿主和工程身份，不收集业务范围、不注入功能。知识库与模板库独立索引，模块选择不等于功能启用、接口实现或权限授予。

## 选择与读取

复用当前唯一 PRD 或本次明确需求，按“模块 + 操作 + 数据范围 + 角色 + 宿主”选择。日常范围清楚的修复不重新定义产品。不再要求 Web 产品分类；认证、组织、权限、商品、订单、钱包支付和审计可独立采用。组织管理、注册、组织切换、购买、资金写入都是各自的操作选择，不随模块名称默认启用。

[模块索引](catalog.json) 给出两库路径、模板类型与宿主。只读取命中模块的知识；只有需要产出或实施时才读取对应模板。

| 模块     | 知识库                                          | 模板库                                                                                              |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 身份认证 | [identity](knowledge/identity.md)               | [操作设计](templates/identity/operation-plan.md)、[独立会话代码](templates/identity/session.ts.txt) |
| 组织管理 | [organization](knowledge/organization.md)       | [操作设计](templates/organization/operation-plan.md)                                                |
| 权限管理 | [permissions](knowledge/permissions.md)         | [操作设计](templates/permissions/operation-plan.md)                                                 |
| 商品目录 | [catalog](knowledge/catalog.md)                 | [操作设计](templates/catalog/operation-plan.md)                                                     |
| 订单管理 | [orders](knowledge/orders.md)                   | [操作设计](templates/orders/operation-plan.md)                                                      |
| 钱包支付 | [wallet-payments](knowledge/wallet-payments.md) | [操作设计](templates/wallet-payments/operation-plan.md)                                             |
| 审计     | [audit](knowledge/audit.md)                     | [操作设计](templates/audit/operation-plan.md)                                                       |

可执行只读选择器：

```sh
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts list
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts resolve --host web --modules identity,catalog
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts resolve --host web --recipe account-workspace
```

选择器仅返回所选资源，不修改工程、不自动启用功能。模块没有全局强制依赖；组合模板显式声明所需模块。普通模块可在两类宿主使用，代码模板按实际 adapter 与宿主限制适配。未知模块、未知参数、不支持宿主或缺失资源应失败，不静默补选。

## 组合与实施

- 独立认证代码仅依赖注入的认证 API 与原子凭据存储，不要求组织、权限、业务 UI 或第三方运行库；存储适配器不能扩大当前宿主持久化授权。
- [账户工作区组合](templates/compositions/account-workspace/files.ts) 是 Web 的身份认证 + 组织 + 权限可执行 Mock 示例；需要三者时才参考装配，不能冒充独立认证或真实服务接入。其注册和找回等操作仍按当前需求删减。
- [购买组合演示](templates/compositions/purchase-checkout/commerce-reference.html) 是 Web 的商品 + 订单 + 钱包离线设计参考，未连接后端、不能执行真实扣款。各模块的操作模板是设计表单，不是可直接运行的实现。
- 先核对真实契约和具体操作，再适配模板；已经实现的模块复用唯一所有者。组合时明确身份、组织作用域、授权、查询缓存、订单、支付和审计各自归属，不让每个模块另建会话或相互反向调用。组织管理不切换操作者身份；组织切换不得代替授权。
- 功能选择不授予权限；远端列表查询必须使用 GraphQL，包括初次无筛选的查询。服务不支持时保留缺口，不伪造 Schema 或用 REST 列表替代。单对象和写操作依据实际契约。
- 结果未知时先查询，不自动重放创建订单或支付；真实付费、生产账户和扣款没有因编写 Skill 或运行演示获得授权。

读取后返回当前需求、设计或实施流程。仅在相关事件委托现有 API 契约核对、访问控制、写入恢复、HTTP 接入、列表视图或 API 文档 Skill；不反向重启父流程。新增业务和接口变化继续通过 API 导出 Skill 核对已有文档与代码差异，按实际业务聚合接口及业务说明，而不是每个模块固定拆一份文档。

## 验证

按实际改动检查：未选操作不产生菜单、路由或请求；组合只保留一份状态所有者；匿名、拒绝、撤权、切换、并发迟到和未知写结果按命中知识验证。模板中的 Mock 或离线演示不能证明真实服务、权限或资金流程通过。完成后报告所选模块与操作、适配内容、实际验证和契约缺口。

## 可执行模板索引

按操作使用 [账户能力实现地图](templates/compositions/account-workspace/README.md)，身份、组织和权限的独立模板与组合代码分别列出；初始化不调用组装器。
