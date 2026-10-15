---
name: web-compose-capabilities
description: 按具体操作选择身份认证、组织、权限、商品、订单、钱包支付与审计的独立知识库和模板库。支持创建阶段受委托的只读能力建议及已初始化 React Web 或 Plasmo Extension 下游的资源组合；不拥有完整需求分析、PRD、UI 设计或代码装配，不按产品分类自动启用功能。
---

# Web Harness：组合功能模块

拥有独立能力、具体操作、领域知识与模板选择，完成后返回当前调用方。知识库与模板库独立索引，模块选择不等于功能启用、接口实现或权限授予；完整需求语义、PRD、实际 UI 和代码分别归其阶段入口。

## 阶段与职责

- 创建前只读建议：只接受需求定义调用方传入的 `creation-analysis`、明确宿主和已分析流程，按 [需求到能力选择](references/requirements-selection.md) 返回建议、依据、所选知识与缺口；源阶段不取代码模板、不写入工程、不调用组装器，不回调实例化或启动产品定义。
- 下游需求、设计和实施：要求有效 `.harness/project.json`，复用当前唯一 PRD 或本次明确范围，按当前阶段返回知识、设计参考或适用模板。代码装配与测试由 `$web-implement-change` 负责，真实服务接入由其按事件委托；本 Skill 不独立启动实施。
- 创建前的宿主来自明确用户选择，下游宿主来自身份配置；缺少阶段、宿主或需求依据时返回缺口，不猜测、不自动补选。阶段仅是调用上下文，不新增持久开关或 CLI 模式。

## 选择与读取

按 [选择合同](references/requirements-selection.md) 处理调用方已分析的流程，保留“模块 + 操作 + 数据范围 + 角色 + 宿主”与依据，不重新通读文档建立另一份完整需求或重启问卷。日常范围清楚的修复不重新定义产品。认证、组织、权限、商品、订单、钱包支付和审计可独立采用，具体操作不随模块名称默认启用。

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

## 组合参考与实施约束

- 独立认证代码仅依赖注入的认证 API 与原子凭据存储，不要求组织、权限、业务 UI 或第三方运行库；存储适配器不能扩大当前宿主持久化授权。
- [账户工作区组合](templates/compositions/account-workspace/files.ts) 是 Web 的身份认证 + 组织 + 权限可执行 Mock 示例；需要三者时才参考装配，不能冒充独立认证或真实服务接入。其注册和找回等操作仍按当前需求删减。
- [购买组合演示](templates/compositions/purchase-checkout/commerce-reference.html) 是 Web 的商品 + 订单 + 钱包离线设计参考，未连接后端、不能执行真实扣款。各模块的操作模板是设计表单，不是可直接运行的实现。
- 先核对真实契约和具体操作，再适配模板；已经实现的模块复用唯一所有者。组合时明确身份、组织作用域、授权、查询缓存、订单、支付和审计各自归属，不让每个模块另建会话或相互反向调用。组织管理不切换操作者身份；组织切换不得代替授权。
- 功能选择不授予权限；远端列表查询必须使用 GraphQL，包括初次无筛选的查询。服务不支持时保留缺口，不伪造 Schema 或用 REST 列表替代。单对象和写操作依据实际契约。
- 结果未知时先查询，不自动重放创建订单或支付；真实付费、生产账户和扣款没有因编写 Skill 或运行演示获得授权。

读取后返回当前调用方，不反向重启父流程。需要 API 契约核对、访问控制、写入恢复、HTTP 接入、列表视图或 API 文档时返回适用叶子与缺口，由当前阶段入口按真实事件委托。新增业务和接口变化由实施入口通过 API 导出 Skill 核对，按实际业务聚合接口及业务说明，而不是每个模块固定拆一份文档。

## 验证

只读选择检查所选资源存在、宿主适用、未选能力不被补入。代码实施时由调用方验证未选操作不产生菜单、路由或请求、状态所有者唯一，以及匿名、拒绝、撤权、切换、并发迟到和未知写结果。模板中的 Mock 或离线演示不能证明真实服务、权限或资金流程通过。返回所选模块与操作、资源类型、依据和缺口，不声明业务已实现。

## 可执行模板索引

按操作使用 [账户能力实现地图](templates/compositions/account-workspace/README.md)，身份、组织和权限的独立模板与组合代码分别列出；初始化不调用组装器。
