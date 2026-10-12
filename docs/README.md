# 文档索引

本目录维护 TypeScript Web/Chrome MV3/Firefox MV2 Extension Harness 当前有效的长期工程事实。

| 文档                                                   | 何时读取                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`AGENT_POLICY.md`](AGENT_POLICY.md)                   | 读取能力偏好、统一标题、持久计划、并行与候选门禁                       |
| [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)         | 修改代码、测试、文档或配置                                             |
| [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) | 修改主题、页面、组件、布局、交互状态或 UI 无障碍                       |
| [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md)             | 初始化、维护 Web 或 Extension 模板与品牌派生                           |
| [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) | 初始化、读取或验证 development/test/release 配置                       |
| [`LOGGING.md`](LOGGING.md)                             | 设计日志、脱敏 Release 记录或扫描最终产物                              |
| [`API.md`](API.md)                                     | 查阅基础 API 契约及 [SaaS 操作映射与缺口](API.md#saas-能力与-api-关联) |
| [`DATA_ACCESS.md`](DATA_ACCESS.md)                     | 分页、HTTP/认证、数据访问或事件流变化                                  |
| [`RELEASE.md`](RELEASE.md)                             | 准备版本、候选或发布                                                   |
| [`VERIFICATION.md`](VERIFICATION.md)                   | 完整验收或候选证据                                                     |
| [`TECH_DEBT.md`](TECH_DEBT.md)                         | 记录当前范围外的已知限制                                               |
| [`HARNESS_ENGINEERING.md`](HARNESS_ENGINEERING.md)     | 需要理解模板方法、生命周期和扩展边界                                   |

按任务读取，不要为了“完整”一次性加载全部文档。职责与调用地图见 [Skill 职责与组合](harness_engineering/skill_composition.md)。接口契约、模块边界、访问控制、写入恢复、存储、持续事件与左侧 Task 已有独立入口，由当前流程按事件委托并返回。

工具站点、SaaS 客户端与 SaaS 大后台的 PRD 事实、可选能力和流程交接见 [Web 类型与可选能力](../.agents/skills/web-design-prototype/references/prd-outline.md#web-类型与可选能力)；创建期选择、固定宿主身份与下游业务模式分别取证，购买未选择时保持关闭。

API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 统一归入 `src/data/`；REST/Ky 负责主要交互，GraphQL 负责复杂查询与订阅，Dexie 仅用于 IndexedDB。目录、选型与生命周期以 [`DATA_ACCESS.md`](DATA_ACCESS.md) §1.1–1.3 为准。

已初始化 React Web 的 SaaS 客户端/大后台认证需求、用户 SOP 与实施合同见 [`$web-implement-saas-auth`](../.agents/skills/web-implement-saas-auth/SKILL.md)。源只维护通用能力；不会生成产品页面或开放预留创建流程。

可选 SaaS 客户端购买能力见 [`$web-implement-saas-commerce`](../.agents/skills/web-implement-saas-commerce/SKILL.md)：默认关闭，明确选中后才应用树形分类、商品、钱包支付、原订单续付和账户刷新；附[中性设计说明](../.agents/skills/web-implement-saas-commerce/references/neutral-ui-design.md)与[离线交互示例](../.agents/skills/web-implement-saas-commerce/assets/commerce-reference.html)。

SaaS 大后台管理见 [`$web-implement-saas-admin`](../.agents/skills/web-implement-saas-admin/SKILL.md)，页面与 SOP 覆盖商品分类、组织成员、订单，以及钱包支付查询、访问控制和审计；[中性页面设计](../.agents/skills/web-implement-saas-admin/references/neutral-ui-design.md)按真实服务和权限裁剪。

下游需要从当前代码整理 API 文档或公开 API 实际变化时，调用 [`$web-document-api`](../.agents/skills/web-document-api/SKILL.md)，在 `docs/api/` 维护模块文档与索引；实现/接入流程仅同步受影响模块。REST 按接口名称、接口说明、请求路径、请求方法、请求头、请求与响应数据展示，JSON 数据使用字段表；GraphQL 按接口名称、接口说明和有来源的 Schema 展示。`API.md` 仍是可选基础契约参考，不能替代当前实现证据。
