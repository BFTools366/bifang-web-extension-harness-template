---
name: web-implement-saas-auth
description: 在已初始化 React Web 下游中完善或实施 SaaS 客户端及 SaaS 大后台的认证需求与用户 SOP，覆盖登录、退出登录、密码找回、LocalStorage 凭据、路由校验和权限码；客户端另含邮箱验证码注册及组织切换。仅用于明确采用 SaaS 认证的 Web，不用于 Extension，初始化不生成认证页面。
---

# Web Harness：规范与实施 SaaS 认证

为 SaaS 客户端或大后台建立一致的认证体验。需求与用户操作以 [requirements-and-sop.md](references/requirements-and-sop.md) 为通用基线；会话、持久化和权限以 [session-contract.md](references/session-contract.md) 为实施合同。

## 适用范围

- 源 Harness 只维护和分发本通用 Skill，不记录具体产品 PRD、服务地址、账号或凭据，不生成认证页面。三种 Web 类型均可经源创建入口生成中性工程；本 Skill 只在成功下游的对应需求、原型或实施阶段消费。
- 产品需求记录、原型或实施只在 `.harness/project.json.projectType=web` 的已初始化下游进行；Extension 不分发也不调用本 Skill。工具站点不自动增加 SaaS 认证。
- 模式使用 `saas-client`（SaaS 客户端）或 `saas-admin`（SaaS 大后台），统一遵循 [Web 类型与可选能力](../web-design-prototype/references/prd-outline.md#web-类型与可选能力)。复用已确认 PRD；首次需求可复用 README 创建交接中用户明确选择的类型，不重问已有选择，不从页面名称或目录推断持久模式，不新增身份 Schema 字段。只有当前工作依赖而模式确实缺失时才询问。
- 本次只要求需求/SOP 时完成记录，不自动开发页面、接入服务或运行候选验收。实施仍使用 `$web-implement-change` 的工程与检查流程。

## 按当前任务执行

通用流程读取本 Skill 时，仅补充当前阶段的领域合同与检查项，随后返回调用方，不反向重复启动定义、原型、实施或接入流程。发现真实范围变化时，将差异交回当前编排入口处理。

缺项按工程规则“渐进式交互引导”逐项补问，每轮优先一个关键问题，给已有通用基线的建议及理由；不要求用户一次提供全套认证资料。接口核对委托 `$web-review-api-contract`，限定本次操作及最小依赖链，完整阅读合同由 Agent 完成。模式、权限、组织归属和真实服务契约缺失时明确待定，不能用默认值编造。

1. 读取项目入口、Agent Policy 头部、工程规则和 Git 状态。需求任务完整读取 `requirements-and-sop.md`；涉及凭据、路由、权限或组织切换时再完整读取 `session-contract.md`、`docs/DATA_ACCESS.md` 的认证章节与 `docs/LOGGING.md`。UI 实施读取当前 Web UI 规范。
2. 固定模式与本次结果。两模式共用登录、退出登录、密码找回、当前用户、持久凭据、路由校验和权限控制；只有客户端有注册与切换组织。大后台没有注册入口/路由/API 调用，也没有切换组织入口/弹窗/API 调用。
3. 首次采用、需求/SOP 范围变化或用户明确要求需求定义时，通过 `$web-define-product` 把已选模式、页面/路由清单、用户 SOP、状态与验收标准纳入唯一 Product Spec，不另建竞争正文。日常修复复用已有确认事实，列出真实服务尚未提供的契约，不为补表重复提问。原型按通用触发条件执行；已有有效选择且范围未变时复用，由调用方检查有效性。
4. 进入真实 HTTP 接入前读取 [基础 API 与 SaaS 关联](../../../docs/API.md#saas-能力与-api-关联)，再按已选操作核对来源章节和真实服务：登录、凭据校验、当前用户/权限、退出、找回及客户端注册/切组织的方法/路径、输入、响应、鉴权 header、错误分类、组织作用域和吊销范围。参考已定义的认证操作不等于已经接入；profile 只返回账号与默认组织，不提供权限码或组织切换。缺少契约时保留待确认，不猜 endpoint；采用来源服务时明确 Bearer/body Token 适配、验证码差异及全账号令牌吊销。接入按 `$web-connect-http-service`；未配置服务时按既有数据规则仅 Mock 远端边界，真实执行本地存储和会话逻辑。
5. 实施复用受管 Ky client、TanStack Router/Query、Mantine、i18next 和 `src/data/storage/`，保持单一会话协调者。没有真实登录页前不装配虚假导航。不得把客户端按钮隐藏当成服务端鉴权，也不得把网络失败当成新授权。
6. 按本次变化验证两份参考中的适用行为，受限页面按会话合同建立权限差异测试矩阵，核对授权、拒绝、登录返回与当前 scope 撤权；不能用全权限演示身份代替拒绝路径。需求记录用逐项对照，代码变更用相关非空测试。只执行当前事件要求的检查，不自动构建、浏览器、E2E 或发布。报告模式、实际覆盖、待确认契约和未执行验证。

## 已明确的 SaaS 例外

用户要求的服务端会话凭据存入 LocalStorage，由认证 feature 经数据层拥有，供刷新后恢复并在 API header 中携带。这是 **Web SaaS 两模式** 对默认“Token 只存内存”的限定例外，详细合同见 `session-contract.md`；continuation 仍只在内存。普通 Web、Extension、基础生成 client 和初始化流程保持默认规则。本 Skill 不把持久化授权扩张为真实凭据采集、生产访问或其他外部副作用。

权限入口实现委托 `$web-implement-access-control`，凭据存储访问委托 `$web-implement-browser-storage`；身份/组织/权限获取、会话协调和 LocalStorage 限定例外仍归本认证合同。仅在实施阶段命中对应变化时调用，需求或原型阶段不因此修改代码。

## 基础设计复用

需求、原型与实施均读取 `docs/MANTINE_UI_GUIDELINES.md` 的 SaaS 基础设计和本 Skill 的入口 SOP：匿名默认登录、表单内紧凑语言/外观、完整工作区侧栏与账号菜单、底部身份/作用域、窄屏等价导航、演示模式说明与真实状态恢复。营销首页另行确认；后台不增加客户端注册或组织切换。已有有效范围与原型直接复用。

## 交付内容

- 需求/SOP：已选模式、页面与入口、完整操作流程、异常与恢复、权限规则、接口待确认项和可观察验收标准。
- 实施：上述需求对应的真实入口、会话/存储/API/路由所有者与相关测试；Mock 和真实 HTTP 分别标记。
- 明确说明注册是否禁用、组织切换是否禁用、LocalStorage 例外范围、实际检查与剩余风险，不把 Skill 编写或 Mock 测试称为产品认证已可用。
