# 中性页面模板的来源与定制

主界面和认证最初基于 `bifang-mini-cb` 的实际 React 实现提取；账号下拉、持续外壳及当前组织槽位进一步参考 `bifang-usage-leaderboard` 的实际实现。商品、订单和钱包以原项目的交互原型为设计来源。来源快照和 SHA-256 见 [source-map.json](source-map.json)，来源条目中的 `project` 覆盖默认来源项目。这些摘要只用于追溯，不是发布或产品验收证据，使用模板不要求来源项目存在。

## 已确认规范与来源事实

当前通用规范以[主界面设计](design.md)、[身份知识](../../knowledge/identity.md#完整用户信息)和[组织知识](../../knowledge/organization.md)为准：完整用户必有账号、自有组织和成员；账号菜单提供邮箱/昵称摘要、切换组织、个人设置、修改密码和退出。Web 左侧组织管理分组提供组织设置、成员管理和角色管理三个子菜单，语言/外观设置保留底部入口。来源快照/SHA 不变，仅证明提取来源；当前中性模板已实现个人设置、本人昵称写入、改密和组织入口分层，具体接线见[合同](wiring.md)。

## 原提取范围

| 来源层级 | 来源相对路径                                                                    | 固化结果                                                                                |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 实际实现 | `src/features/client/ClientLayout.tsx`、`AccountMenu.tsx`、`Preferences.tsx`    | 品牌、侧栏、顶部账号区、偏好与正文插槽；Web 多页提供侧栏，单页和 Extension 使用紧凑导航 |
| 实际实现 | `src/features/auth/AuthPage.tsx`、`session.ts`、`src/data/api/auth/mockAuth.ts` | 品牌说明与表单分区、输入保留、认证生命周期；独立用户能力使用一个会话 owner，接口为 Mock |
| 交互原型 | `docs/prototypes/saas-commerce/v2/catalog-view.js`、`checkout-view.js`          | 商品分类与卡片、购买确认的商品说明和订单摘要分区，接入现有购买协调器                    |
| 交互原型 | 同目录 `center-view.js`、`records-view.js`、`order-dialog.js`                   | 费用中心、订单与钱包的丰富设计参考；基础代码只承诺当前 contracts 支持的读取与购买流程   |

[账户协议参考](../compositions/account-workspace/README.md) 只保留服务协议、验证码、Mock 与精确存储回归；旧主壳、设置、注册/找回 UI 和第二套会话已退役。当前唯一装配采用 applicationFiles，注册/找回按真实需求另行接线，独立 identity.session 不自动生成这些入口。

既有主壳参考提取了头像/昵称触发器、菜单顺序、独立设置入口、`content/context` 槽位及切换时保留外壳的结构。排行榜专属名称、`lb.*` 文案、路径、角色、API、Mock 提示和“只读成员验证后本地选择”的回滚不进入模板；通用组织继续采用服务端切换后的权威重读合同；本地选择的最后接受快照回滚规则只记入知识库，不能套到真实服务写入。原资产的账号资料只有注入槽，完整用户方案需按已确认规范补齐，不能借来源槽位省略资料页。

公开设置与认证表单进一步提取该项目的 `SettingsPage.tsx`、`SettingsLink.tsx`、`settingsNavigation.ts`、`LoginPage.tsx` 和 `AuthPages.tsx`：固化无需登录的设置页、认证底部入口、本地化占位提示与安全返回。通用登录保持账号语义，不强制邮箱；可选注册进一步提取为中性的 AuthLayout、RegistrationPage、useEmailVerification 与 RegistrationApi；找回仍按真实需求增量接线，不增加基础身份操作。原有主题、语言、身份和持久化拥有者继续复用，凭据输入不随离页保存。

来源商品模块尚无产品 React 实现，原型选择也未完成。这里提取的是可复用结构；原型的方案标记、选择状态、固定商品、场景按钮和评审截图不作为下游确认，不照搬为领域契约。多钱包、报价有效期、钱包流水、冻结及更多订单状态，须有对应需求与 Mock/服务合同后实施，不能让页面装饰冒充已接线功能。

## 接入时替换内容

中性化后的完整[离线商品参考](../compositions/purchase-checkout/source-reference/index.html)随模板分发，无需访问来源项目；参考内的业务结果仅属于内存 Mock。

- 品牌名称、描述、Logo 沿用当前 `.harness/project.json` 派生值，不复制来源品牌。
- 主界面正文始终由 `homePageSource` 提供；不内置来源“暂无工具”、统计或测试菜单。
- `content.translations.zh/en` 替换固定模板已声明的文案键，例如认证侧栏说明、商品页说明及导航名称；键名见 [locales.ts](locales.ts)。项目身份键不可通过这里覆盖。
- `content.pageSources` 可替换已选能力的页面组件。以模块 id 为键（例如 `catalog`），导出原组件名（例如 `CatalogPage`），保持对应 API、scope 和动作回调 props；路由、匿名守卫、页面权限与提交前校验仍由装配器拥有。新增页面或改变行为按需求另行实施。
- 商品名称、描述、分类与价格来自 `fixtures.products`；账号、组织、权限、余额和审计也只在对应 fixtures/API Mock 中维护。UI 内不硬编码第二份数据，不从前端表单决定订单价格。

```ts
content: {
  translations: {
    zh: { identityIntroTitle: "登录项目工作台", catalogDescription: "选择本项目提供的商品。" },
    en: { identityIntroTitle: "Sign in to the project", catalogDescription: "Choose a product." }
  },
  pageSources: { catalog: confirmedCatalogPageSource }
}
```

覆盖是首次装配的显式输入；已有项目增量修改其唯一页面 owner，不重新生成覆盖产品。修改文案或正文不得削弱认证、权限、作用域、取消或未知结果恢复，并通过对应行为回归核对。

## Mock 边界

历史测试参考接口位于 `src/data/api/<domain>/mock.ts`（只读订单与只读钱包使用 `readMock.ts`），只供隔离测试；产品装配只接受真实 adapter。Mock 与开发投递边界写入开发交付材料，产品页面不显示通用 Mock 说明；自建邮箱注册默认 dev 模拟投递，发送后在表单直接显示验证码及简短未接邮件提示，用户手动输入，真实投递移除回显，不声称已发邮件。本地偏好、页面交互与路由仍真实执行。购买确认使用 API 的权威金额，结果未知时复查原请求，不能重新下单。

`dataMode: "adapter"` 只接收下游按可信契约自行提供的代码，不是模板内置的联网实现，也不隐式迁移。用户另行授权真实接入后，由 HTTP 接入 Skill 替换受影响 API，保留页面与状态 owner；失败不回落 Mock。

## 组织语义与拥有者管理提取

既有资产提供 Account / Organization / OrganizationUser 分层、注册自有组织的协议参考、成员关系独立、基于组织用户授权、多组织弹窗、同目标 no-op、撤权恢复与 owner 改名。固定模板提供中性组织合同、规范化 Mock、共享 Query、独立管理能力和 Web/Extension 接线；不复制排行资源、品牌、邀请接口或产品权限码。当前主 identity.session 尚未提供注册和邀请接线；规范要求账号与自有组织原子建立，组织共享数据按组织隔离，不能用当前成员 actor 分区或协议参考代替完整实现。

来源管理页使用独立非嵌套文件路由；返回链接按 Router 默认 search 解析保存数字/JSON 形态字符串，权限刷新共享读取但取消分离。来源摘要只证明提取来源，不证明模板已通过真实服务或发布验收。

## 账号弹窗与统一列表复盘

从当前下游提取 Header 对齐、单一账号名、统一无图标菜单、资料/改密弹窗，以及 ListSurface/ListTable/ListFooter 与弹窗独立分页；同步两种宿主生成链及权限刷新期间的草稿保留。来源摘要见 source-map，排名算法、榜单 API、产品权限、品牌和数据不进入源模板。旧领域私有分页模板以墓碑退役，已有产品实现保持升级保护，新的标准通过受管技能与模板传递。
