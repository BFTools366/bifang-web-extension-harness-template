> 当前数据合同：产品装配器只接受 `dataMode: "adapter"` 和所选领域的真实 adapters。下文历史 Mock/fixture 说明只供测试和来源追溯，不是产品创建路线。自建服务由 Workspace 领域 Skill 实现 Go、前端和真实联调；已有服务按可信合同接入。

# 固定设计与代码接线合同

实施入口在成功下游读取已确认 PRD 与有效原型登记，首次工程基线以当前已发布下游文件快照构成 base Map，调用 applicationFiles(base, options) 返回文件 Map，再在授权范围写入当前宿主。该 helper 不要求终端恢复已删除的初始化器，也不调用源 webFiles/extensionFiles。已有产品按现有路由和状态 owner 增量接入固定资产，不能重复全量装配。源 Harness 只维护这些可复用资产，不装配具体产品。

返回 Map 是完整结果快照，调用方须应用新增、修改与删除的差异，不能只追加文件。对 base 中存在而结果缺失的路径，先复核磁盘字节仍等于冻结 base，才删除本轮中性基线文件；漂移则停止，不能删除产品改动。Web 的旧 `src/routes/index.tsx`、`src/app/RootLayout.tsx` 及其测试会被新应用路由替代；保留旧根首页会与 `src/routes/_application/index.tsx` 冲突。既有产品不得用此流程重装。

## 已确认的账号与组织接线规范

完整用户方案必须同时有账号、自有组织和当前组织成员关系，领域不变量以[身份知识](../../knowledge/identity.md#完整用户信息)及[组织知识](../../knowledge/organization.md)为准，布局以[主界面设计](design.md)为准。以下是目标合同，不是当前 applicationFiles 已全部生成的声明。

| 流程      | 入口与所有者                                    | 接线及放行条件                                                                                                                                                                        |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 注册      | 公开注册页 → 认证 API                           | 服务原子建立 Account、自有 Organization、owner OrganizationUser；缺一不报成功。默认邮箱与密码，用户名和组织名由服务生成；验证码按独立操作选择。注册不签发 Token，页面成功后显式登录。 |
| 登录/恢复 | 唯一身份 owner → 组织共享 Query → 权限 owner    | 校验账号、自有组织、当前成员、当前组织及所需权限；缺失或加载失败先阻断恢复，不从本地镜像补造身份。                                                                                    |
| 账号资料  | 右上账号菜单 → 账号信息页 → 全局账号 API/Query  | 资料归 Account，组织切换不改变账号。账号资料、组织管理、成员、邀请不列入侧栏默认导航。                                                                                                |
| 邀请成员  | 右上组织管理 → 成员区 → 组织邀请 API            | 复核当前组织 owner 与可信动作权限；邀请绑定目标组织、受邀账号和允许角色，发送成功不等于成员已加入。                                                                                   |
| 接受邀请  | 右上加入组织 → 当前账号有效邀请 → 成员 API      | 原子新增目标组织成员，精确刷新组织/邀请列表；保留自有组织和当前工作组织，用户再显式切换。                                                                                             |
| 切换组织  | 右上切换组织 → 现有会话 owner → 组织/权限 Query | 目标为已加入且有效成员；同目标 no-op。阻断旧正文和动作、关闭旧弹层，使旧请求/缓存/草稿失效；确认新成员、组织和权限后才恢复页面。                                                      |

Web 工作区默认保留工作台和最下方设置，即使只有一个业务页面也保留侧栏；额外产品导航单独确认。顶部显示当前组织，右上账号菜单承载账号资料与组织操作，侧栏不注入 OrganizationContext。公开设置保持独立可返回页面；Extension 使用宿主紧凑导航，不增加 Web 侧栏或跨上下文会话。

组织数据请求和 Query 必须区分 accountId、organizationId、organizationUserId 与当前代次，语言及参数按实际结果需要加入；Token 不进入 key。组织共享资源以 organizationId 作为租户边界，成员身份用于权限、成员私有范围及审计；服务端逐次校验对象归属，不能用前端切换或 actor 分区代替租户隔离。组织切换结果未知时恢复权威上下文，未确认前不回滚旧组织继续业务；明确拒绝且服务确认原会话未改变时才保留旧 scope。

## 当前装配器与目标规范的差异

| 已确认目标                          | 当前可观察实现                                                            | 实施时必须补齐                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 注册必建账号、自有组织与 owner 成员 | 主装配已支持邮箱注册和条件验证码，Go overlay 原子建立账号/组织/owner 成员 | 已有服务按真实字段/验证合同适配；核对存量账号自有组织，缺失时恢复或迁移，不由浏览器静默创建                   |
| 右上账号信息                        | AccountMenu 只有 settings 注入槽，page-source 未接默认资料页              | 账号页面、路由、API/Query 与菜单入口；不能把公开偏好设置当账号资料                                            |
| 组织管理邀请、账号加入组织          | organization.manage 只接 read + rename，无邀请/接受/成员维护接线          | 可信邀请合同、成员列表与接受流程；待接受不进入可切换集合                                                      |
| 仅工作台与底部设置的 Web 侧栏       | ApplicationLayout 的 Web 单页保留侧栏；组织上下文在顶部和账号菜单         | 额外业务导航按下游需求；同一业务按当前组织切换数据，不拆“我的/我加入的”入口                                   |
| 组织共享数据按租户隔离              | 当前相关订单、余额 Mock 使用 OrganizationUser.id 的 actor 分区            | 按领域合同区分组织共享与成员私有范围；补同组织共享、跨组织拒绝和切换迟到隔离回归，不能直接重解释旧 fixture 键 |

注册、验证按实际选择装配，catalog 的基础登录依赖保持不变；未选验证不会生成发码流程。下文记录当前可执行接口；选择器闭包及生成成功不能证明上表目标已完成。当前资产缺口统一跟踪于[技术债](../../../../../docs/TECH_DEBT.md)。

## 当前装配器必需输入

- selection：明确宿主及 modules、operations、recipe 三者之一；空 modules 只选择基础布局，实际首页仍必填。
- homePageSource：按需求实现、导出 HomePage 的真实组件；主内容 landmark 由固定主界面提供。
- dataMode：明确 adapter。Mock 提供测试账号及当前流程必要 fixture；真实模式为每个所选模块提供导出 api 的实现，不从 BaseURL 猜 endpoint。
- 采用权限时，pagePermissions 与 actionPermissions 来自 PRD/可信服务，所有业务页面及写操作必须具有非空要求；/organization 和 organization.switch 是账号级成员关系恢复能力，不依赖组织业务权限，/organization/manage 不豁免；Mock 授权按 subjectId 与 organizationId 的上下文提供，默认空权限，不能从模块选择推导授权。
- content 为可选内容适配：translations 只覆盖既有 zh/en 模板键；pageSources 只替换已选能力的固定组件，必须保留其 API、scope 和动作 props。来源与完整例子见 [提取合同](extraction.md)，不覆盖项目身份或既有产品实现。

## 当前装配器接线结果

应用布局与真实首页、实际路由/导航、各能力固定页面、单一身份/权限 owner、Query/API 边界、错误恢复和 i18n 一起返回。.harness/application-wiring.json 只记录实际接线与操作依赖，不是第二份 PRD、特性开关或完成证据。

固定资产之外的实际业务页面、路由、入口和功能继续由实施入口按已确认需求补齐，不能把这组能力页当作全部产品范围。

当前主壳提供正文 `content` 与顶部上下文 `context(compact)` 兼容槽位；`scope.blocked` 只替换正文，不能卸载整个布局。身份能力装配 `IdentityMenu` 的头像/昵称触发器与 `AccountMenu` 组合层，组织能力才注入 `OrganizationMenu` 和 `OrganizationContext`；当前组织的页、菜单和顶部共享私有 Query。未选组织没有入口或查询，身份与组织不另建 owner。组织不进入侧栏，Extension 继续使用紧凑布局。

已有下游可在 `AccountMenu` 传入可信 `avatar` 及真实 `settings` 菜单节点；节点自身拥有导航/动作、权限与焦点，不由父容器代理。没有真实账号设置页面就省略，装配器不从槽位生成 `/profile`、资料 API、套餐或充值。语言/外观只在独立全屏设置页调整，已有 Web 侧栏的设置入口位于底部，Extension 使用独立导航；应用设置与账号资料保持独立。

通用 `SettingsPage` 为根级 `/settings`，不列入业务导航或权限页清单；Web、Popup 和 Options 均生成，即使没有身份能力也可访问。`settingsNavigationSource` 按实际选择生成登录或首页回退，并独立校验历史来源；不能扩张 `safeReturnTo` 的登录后业务目标合同。`SettingsLink` 随身份能力生成并位于认证页最下方；已明确实现的注册或找回叶页沿用同一底部入口和来源校验，不能为设置自动装配未选认证操作。新增认证页时显式补充其允许来源及安全查询合同，密码、验证码和令牌不进入设置查询或偏好存储。

当前 identity.session 包含登录、恢复、退出、主界面用户区、匿名重定向、安全返回、HTTP Token 同步与当前 401 清理；catalog 不自动补注册、找回、组织或权限。购买依赖闭包必须包含 identity.session，依赖原因在选择结果中展示。完整用户方案仍必须补齐上文账号与组织要求，不以当前最小闭包缩减需求；未覆盖的资料、找回等操作明确交接实施，不虚构可执行操作。

当前只读订单的 Mock 仅生成 list，不生成 create/find/settle；fixtures.orders 按主体键隔离记录，无身份的公共集合使用空字符串键，采用组织时使用 OrganizationUser.id。该行为只能证明现有成员主体分区，不能证明组织共享数据模型。数据快照独立复制且支持取消。能力页复用既有 HTTP 错误分类，401/403 不展示普通重试；响应可能本地化的查询键包括当前语言。

Web 保留 Vite 与 TanStack 文件路由。Extension 每个入口有独立 Router 与当前上下文会话，默认内存凭据；不自动增加 background、浏览器权限或跨入口持久登录。真实 API 读取使用既有 Query，传输使用 applicationHttp，身份 adapter 的 login/validate/logout 使用隔离认证传输：login 不携带旧 Token，validate/logout 显式使用传入凭据，不能提前修改 applicationHttp。认证临时传输的 Token 不成为第二个应用会话 owner，应用 Token 只由 IdentityTransport 在校验后提交。其他业务传输复用 applicationHttp；订单只读 adapter 只需 list，不要求未选 find/create。

## 当前组织操作的独立接线

organization.switch 生成多组织账号弹窗和 /organization 恢复页；只有一个候选时隐藏菜单，同目标在服务层直接返回。organization.manage 额外要求权限能力、可信页面与动作要求，才生成拥有者管理页及 rename 接线；它不自动启用切换、注册或邀请；真实管理 adapter 只需 OrganizationManagementApi 的 read + rename，switch 独立扩展只读合同。未选择 manage 时不存在管理页面、路由与 rename facade。主装配支持 identity.register；完整个人组织、资料及邀请生命周期仍按 [协议与知识参考](../compositions/account-workspace/README.md) 及已选领域增量实施。

Web 管理页文件为 _application/organization_.manage.tsx，对应路由 ID /_application/organization_/manage，公共 URL /organization/manage，直接属于应用布局；/organization 不是提供 Outlet 的布局。两宿主回归分别编译并验证。

## 完成核对

按“需求 → 固定设计 → 代码落点 → 路由/元素 → API/状态 → 行为测试”逐项核对。测试至少覆盖匿名直达、登录返回、请求 Token、退出/401、权限拒绝/撤权及购买身份依赖、幂等与未知结果恢复。编译与相关测试之外，创建交付必须实际走查首版关键流程；最终 dist/zip 要求另走真实产物门禁。

采用完整用户方案时，还须覆盖账号/自有组织/owner 原子创建、失败无半成品、账号资料跨组织一致、邀请接受前不可切换、接受后保留自有组织、owner/member 菜单和直达拒绝、Web 干净侧栏、单组织隐藏切换但保留加入入口、同组织授权共享及跨组织拒绝、未知结果阻断/恢复、切换旧响应与旧权限隔离。邀请与资料缺少真实 API 或 Mock 时记录未接线，不能用空入口、单一 actor 分区或原型检查替代。

模板生成成功只是实现输入，不能代替实际产品首页、真实服务接入或创建交付完成。

## 邮箱注册的装配输入

```ts
const options = {
  selection: { host: "web", operations: ["identity.register", "identity.verification"] },
  homePageSource: confirmedHomePageSource,
  dataMode: "adapter",
  adapters: { identity: confirmedIdentityAdapterSource }
}
```

identity adapter 必须导出 api（login/validate/logout）和 registerAccount；明确选择 verification 时还必须导出 sendRegistrationCode，返回 [RegistrationApi](files/identity/registration.ts.txt) 的窄合同。Go adapter 同时复制注册回执映射、共享 wire 类型和 REST 信封。基础 identity.session 只生成登录，不增加注册或发码。仅选注册时不要求验证码接口，独立验证/找回仍由领域 Skill 实施。

注册 adapter 可显式导出 registrationPasswordPolicy（validate 与本地化 messageKey），装配器把真实服务规则传入注册页，规则不作用于旧账号登录。Go adapter 已提供 UTF-8 8–64 字节且含英文字母和数字的规则；已有服务按其可信合同提供规则与翻译，不沿用 Go 假设。

已选注册生成 RegistrationPage、useEmailVerification、registration 合同、/register、登录互链与安全设置返回；注册/登录共用 AuthLayout，输入与提交状态留在各自叶页面。注册成功不签发凭据，显式调用当前 session.login；失败仅重试登录，未知注册阻断再次创建。离页同时取消注册、发码和慢登录，不能让迟到凭据进入会话。

组织 API 返回当前上下文及有效成员组织；数据按组织 ID 和成员授权主体各自归属，不能信任浏览器 actor 作为服务端授权。新增领域操作须有真实页面/API/actions，不能只登记 resolved。organization.provision 与 audit.record 是后端内部依赖，不自行生成前端页面或会话 owner。

权限 owner 的代次只随身份/组织变更；同主体权限减少或刷新失败独立使业务 scope 失效、取消并移除私有 Query。权限恢复不复活旧购买或迟到回调，同集刷新或只增加权限不改业务代次，避免权限刷新自清循环。
