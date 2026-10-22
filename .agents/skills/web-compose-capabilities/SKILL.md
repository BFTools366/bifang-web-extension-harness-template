---
name: web-compose-capabilities
description: 按具体操作选择身份认证、组织、权限、商品、订单、钱包支付与审计的独立知识库和模板库。支持创建阶段受委托的只读能力建议及已初始化 React Web 或 Plasmo Extension 下游的资源组合；不拥有完整需求分析、PRD、UI 设计或代码装配，不按产品分类自动启用功能。
---

# Web Harness：组合功能模块

完整用户模块默认提供 identity.workspace 协作预设；明确取消协作时按核心账号操作装配，不恢复已取消功能。显式协作预设解析组织切换、邀请、成员维护、角色管理、角色权限与成员角色分配，遵循八表 RBAC。前端统一判断有效权限 code，不按角色名授权。底层 identity.session 仍可显式独立复用。数据归属统一遵循 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md)；自建 Go 前端装配统一调用 workspace-implement-users/scripts/assemble-account.ts，未选账号的公开项目不产生账号表。

拥有独立能力、具体操作、领域知识与模板选择，完成后返回当前调用方。知识库与模板库独立索引，模块选择不等于功能启用、接口实现或权限授予；完整需求语义、PRD、实际 UI 和代码分别归其阶段入口。

## 阶段与职责

- 创建前只读建议：只接受需求定义调用方传入的 `creation-analysis`、已知宿主或宿主未定状态和已分析流程，按 [需求到能力选择](references/requirements-selection.md) 返回自动选择或待取舍推荐、依据、所选知识与缺口；源阶段不取代码模板、不写入工程、不调用组装器，不回调实例化或启动产品定义。
- 下游需求、设计和实施：要求有效 `.harness/project.json`，复用当前唯一 PRD 或本次明确范围，按当前阶段返回知识、设计参考或适用模板。代码装配与测试由 `$web-implement-change` 负责，真实服务接入由其按事件委托；本 Skill 不独立启动实施。
- 创建前宿主复用用户选择，或由需求定义基于充分需求自动确定；宿主未定先返回无关宿主的操作与依赖，延迟可执行选择器和模板适配。下游复用身份配置，不自动切换。缺阶段或需求依据时返回缺口；唯一适配的必要能力自动选择，等价或有争议时才推荐。阶段仅是调用上下文，不新增持久开关或 CLI 模式。

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
- 先核对真实契约和具体操作，再适配模板；已经实现的模块复用唯一所有者。组织 ID 负责租户隔离，组织用户 ID 负责成员授权、成员私有范围及审计，详见组织知识；身份、组织、权限、查询与业务各自拥有状态，不另建会话或相互反向调用。组织管理不切换操作者身份；切换不得代替授权。organization.manage 单独接通组织设置，菜单、直达和写入按 settings.read/update 授权，不按 owner 名称放行；完整 identity.workspace 另接成员管理和角色管理。switch 不自动生成管理、注册或邀请。账号菜单提供邮箱/昵称摘要、切换组织、个人设置、修改密码和退出；Web 默认左侧包含工作台、组织管理分组与底部设置，组织管理下设组织设置、成员管理、角色管理三个子页，本人邀请在切换弹窗。具体前后端合同以 Auth 标准和接线合同为准。
- 功能选择不授予权限；集合操作按 [列表查询协议强约定](../../../docs/DATA_ACCESS.md#列表查询协议强约定) 核对契约，返回实际协议缺口，不将模板当作服务事实。
- 结果未知时先查询，不自动重放创建订单或支付；真实付费、生产账户和扣款没有因编写 Skill 或运行演示获得授权。

读取后返回当前调用方，不反向重启父流程。需要 API 契约核对、访问控制、写入恢复、HTTP 接入、列表视图或 API 文档时返回适用叶子与缺口，由当前阶段入口按真实事件委托。新增业务和接口变化由实施入口通过 API 导出 Skill 核对，按实际业务聚合接口及业务说明，而不是每个模块固定拆一份文档。

## 验证

只读选择检查所选操作及其明确依赖具有领域 Skill 和参考资源；基础模板未实现的扩展操作必须交给领域 Skill 增量实现，宿主适用、未选操作不产生入口。代码实施时由调用方验证未选操作不产生菜单、路由或请求、状态所有者唯一，以及匿名、拒绝、撤权、切换、并发迟到和未知写结果。模板中的 Mock 或离线演示不能证明真实服务、权限或资金流程通过。返回所选模块与操作、资源类型、依据和缺口，不声明业务已实现。

## 可执行模板索引

完整创建在成功下游使用 `applicationFiles(base, options)`，只返回 Map，由实施入口写入。必需输入为真实首页源码、固定 dataMode=adapter、选择及可信权限要求，缺项失败。固定设计入口为各模块 `design.md`，实际接线资产与 helper 全部由 catalog 索引；旧 [账户能力实现地图](templates/compositions/account-workspace/README.md) 仅作丰富操作参考。

## Workspace 全栈委托

操作仍由本 Skill 解析最小依赖；所选模块的 implementationSkill 负责对应前端、Go 后端、契约与真实联调。根服务归属来自 .harness/workspace.json：已有服务核对 BaseURL 和可信接口，选择 create 时在 _server 实现并连接；none 直接实现本地功能，不另开 Go 问卷。完整用户包含注册自有组织及 owner 成员；注册、资料、验证码、组织成员、角色等操作逐项选择。邮箱注册和条件验证码已有 application 模板；自建邮箱注册默认补齐 verification 和 identity.verification，未接邮件服务时开发环境默认模拟投递并在注册表单显示验证码；真实邮件回执自动移除回显。基础登录不自动增加注册，已有外部服务服从可信合同。固定应用装配只接受 dataMode=adapter，禁止产品 Mock；历史 Mock 资源仅为测试参考。委托完成后返回当前编排者，不重启定义或设计问卷。

完整 Auth 的前后端标准由 [ACCOUNT_OWNERSHIP.md](../../../docs/ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)统一拥有；组合时保留个人设置与独立改密、组织切换弹窗、三页细权限、Go 迁移及写入恢复，不将固定界面降为混合设置页或粗权限。仅组织设置的独立操作不扩张成员／角色协作。
