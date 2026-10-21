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

按[选择合同](references/requirements-selection.md)处理调用方已分析的流程，保留“模块 + 操作 + 数据范围 + 角色 + 宿主”与依据，不重新通读文档建立另一份完整需求或重启问卷。日常范围清楚的修复不重新定义产品。按具体操作解析 catalog 的当前最小依赖，返回 requested、resolved、requiredBy；购买自动包含基础身份，但现有依赖图不自动生成组织、资料、注册或找回。完整用户方案必须满足[账号与组织基线](knowledge/identity.md#完整用户信息)，缺失操作及资源交还实施入口，不用技术依赖闭包缩减已确认需求。完整闭包、补齐范围及原因纳入一次范围确认，当前会话已确认的内容直接复用；不扩大为模块全部操作。

[模块索引](catalog.json) 给出两库路径、模板类型与宿主。只读取命中模块的知识；只有需要产出或实施时才读取对应模板。

| 模块     | 知识库                                          | 模板库                                                                                            |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 身份认证 | [identity](knowledge/identity.md)               | [固定设计与接线](templates/identity/design.md)、[独立会话代码](templates/identity/session.ts.txt) |
| 组织管理 | [organization](knowledge/organization.md)       | [固定设计与接线](templates/organization/design.md)                                                |
| 权限管理 | [permissions](knowledge/permissions.md)         | [固定设计与接线](templates/permissions/design.md)                                                 |
| 商品目录 | [catalog](knowledge/catalog.md)                 | [固定设计与接线](templates/catalog/design.md)                                                     |
| 订单管理 | [orders](knowledge/orders.md)                   | [固定设计与接线](templates/orders/design.md)                                                      |
| 钱包支付 | [wallet-payments](knowledge/wallet-payments.md) | [固定设计与接线](templates/wallet-payments/design.md)                                             |
| 审计     | [audit](knowledge/audit.md)                     | [固定设计与接线](templates/audit/design.md)                                                       |

可执行只读选择器：

```sh
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts list
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts resolve --host web --modules identity,catalog
node .agents/skills/web-compose-capabilities/scripts/capabilities.ts resolve --host web --operations orders.purchase
```

选择器只读计算明确操作依赖并返回固定设计和代码资源，不修改工程或授予外部副作用。内部 orders.create 与 wallet-payments.pay 只作购买接线依赖，不能单独声明为已交付入口；公开选择 orders.purchase。未知操作、循环、资源缺失或不支持宿主时失败。只读订单不要求用户系统。

## 组合参考与实施约束

- 独立认证代码仅依赖注入的认证 API 与原子凭据存储，不要求组织、权限、业务 UI 或第三方运行库；这是低层资源独立性，不代表完整用户信息可以省略组织。存储适配器不能扩大当前宿主持久化授权。
- 当前装配使用[固定应用模板](templates/application/files.ts)与[接线合同](templates/application/wiring.md)。当前已支持操作按其代码范围返回页面、路由导航、API/Query、状态与失败恢复接线；尚未覆盖的完整账号与组织目标逐项报告并补齐，不能仅凭模板存在声明已实现。基础真实 HomePage 必须由需求提供。
- 主界面和认证源自既有客户端实现，商品源自其交互原型；按 [提取与定制合同](templates/application/extraction.md) 区分来源证据。文案使用 content.translations，已选能力正文通过 content.pageSources 适配，测试 fixtures 仅留测试目录；不复制来源品牌、产品正文、服务地址或评审结论。产品接口必须提供真实 adapter，下游按已授权合同实施。
- 当前基础身份资源包含登录页面与路由、主界面用户信息、匿名守卫、安全返回、Token 自动携带及退出/当前 401 清理；完整用户方案还必须接齐账号、组织、成员及所需生命周期。权限码同时用于路由、页面、菜单、动作元素及提交前复核。`.harness/application-wiring.json` 仅记录机械接线，不替代 PRD 或验证。
- [账户协议参考](templates/compositions/account-workspace/README.md) 仅保留协议、Mock 服务、精确存储及回归，不再提供第二套应用/会话/UI；首版装配统一使用下文 `applicationFiles`，注册、找回等操作按真实需求另行实施。
- [来源商品设计参考](templates/compositions/purchase-checkout/source-reference/index.html) 保留中性费用中心、商品选购、订单/钱包结构；[购买最小演示](templates/compositions/purchase-checkout/commerce-reference.html) 用于专项交互参考。两者均为 Web 离线设计，无真实扣款，也不作为当前基础装配入口。
- 先核对真实契约和具体操作，再适配模板；已经实现的模块复用唯一所有者。组织 ID 负责租户隔离，组织用户 ID 负责成员授权、成员私有范围及审计，详见组织知识；身份、组织、权限、查询与业务各自拥有状态，不另建会话或相互反向调用。组织管理不切换操作者身份；切换不得代替授权。organization.manage 仍是当前显式选择的 owner 改名资源，switch 不自动生成管理、注册或邀请；这些代码边界不能替代完整方案的目标范围。Web 默认左侧仅工作台与底部设置，账号及组织操作集中在右上账号菜单，现有资产迁移差异见接线合同。
- 功能选择不授予权限；集合操作按 [列表查询协议强约定](../../../docs/DATA_ACCESS.md#列表查询协议强约定) 核对契约，返回实际协议缺口，不将模板当作服务事实。
- 结果未知时先查询，不自动重放创建订单或支付；真实付费、生产账户和扣款没有因编写 Skill 或运行演示获得授权。

读取后返回当前调用方，不反向重启父流程。需要 API 契约核对、访问控制、写入恢复、HTTP 接入、列表视图或 API 文档时返回适用叶子与缺口，由当前阶段入口按真实事件委托。新增业务和接口变化由实施入口通过 API 导出 Skill 核对，按实际业务聚合接口及业务说明，而不是每个模块固定拆一份文档。

## 验证

只读选择检查所选操作及其明确依赖具有领域 Skill 和参考资源；基础模板未实现的扩展操作必须交给领域 Skill 增量实现，宿主适用、未选操作不产生入口。代码实施时由调用方验证未选操作不产生菜单、路由或请求、状态所有者唯一，以及匿名、拒绝、撤权、切换、并发迟到和未知写结果。模板中的 Mock 或离线演示不能证明真实服务、权限或资金流程通过。返回所选模块与操作、资源类型、依据和缺口，不声明业务已实现。

## 可执行模板索引

完整创建在成功下游使用 `applicationFiles(base, options)`，只返回 Map，由实施入口写入。必需输入为真实首页源码、固定 dataMode=adapter、选择及可信权限要求，缺项失败。固定设计入口为各模块 `design.md`，实际接线资产与 helper 全部由 catalog 索引；旧 [账户能力实现地图](templates/compositions/account-workspace/README.md) 仅作丰富操作参考。

## Workspace 全栈委托

操作仍由本 Skill 解析最小依赖；所选模块的 implementationSkill 负责对应前端、Go 后端、契约与真实联调。根服务归属来自 .harness/workspace.json：已有服务核对 BaseURL 和可信接口，没有服务在 _server 实现并连接，不另开 Go 问卷。完整用户包含注册自有组织及 owner 成员；注册、资料、验证码、组织成员、角色等操作逐项选择。邮箱注册和条件验证码已有 application 模板；验证码不因基础登录或注册自动启用，开发模拟投递遵循 go-implement-verification 的显式授权分支。固定应用装配只接受 dataMode=adapter，禁止产品 Mock；历史 Mock 资源仅为测试参考。委托完成后返回当前编排者，不重启定义或设计问卷。
