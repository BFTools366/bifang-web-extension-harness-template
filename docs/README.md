# 文档索引

本目录维护 TypeScript Web/Chrome MV3/Firefox MV2 Extension Harness 当前有效的长期工程事实。

| 文档                                                   | 何时读取                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| [`AGENT_POLICY.md`](AGENT_POLICY.md)                   | 读取能力偏好、统一标题、持久计划、并行与候选门禁                     |
| [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)         | 修改代码、测试、文档或配置                                           |
| [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) | 修改主题、页面、组件、布局、交互状态或 UI 无障碍                     |
| [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md)             | 初始化、维护 Web 或 Extension 模板与品牌派生                         |
| [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) | 初始化、读取或验证 development/test/release 配置                     |
| [`LOGGING.md`](LOGGING.md)                             | 设计日志、脱敏 Release 记录或扫描最终产物                            |
| [`API.md`](API.md)                                     | 查阅基础 API 契约及 [功能模块映射与缺口](API.md#功能模块与-api-关联) |
| [`DATA_ACCESS.md`](DATA_ACCESS.md)                     | 分页、HTTP/认证、数据访问或事件流变化                                |
| [`ACCOUNT_OWNERSHIP.md`](ACCOUNT_OWNERSHIP.md)         | 账号、团队、成员、邀请、权限与业务数据归属                           |
| [`RELEASE.md`](RELEASE.md)                             | 准备版本、候选或发布                                                 |
| [`VERIFICATION.md`](VERIFICATION.md)                   | 完整验收或候选证据                                                   |
| [`TECH_DEBT.md`](TECH_DEBT.md)                         | 记录当前范围外的已知限制                                             |
| [`HARNESS_ENGINEERING.md`](HARNESS_ENGINEERING.md)     | 需要理解模板方法、生命周期和扩展边界                                 |

按任务读取，不要为了“完整”一次性加载全部文档。职责与调用地图见 [Skill 职责与组合](harness_engineering/skill_composition.md)。接口契约、模块边界、访问控制、写入恢复、存储、持续事件与左侧 Task 已有独立入口，由当前流程按事件委托并返回。

功能按具体操作组合，知识库与模板库见 [功能组合 Skill](../.agents/skills/web-compose-capabilities/SKILL.md)，当前选择归下游唯一 PRD。完整创建在下游按已确认需求持续完成首版页面、功能及开发验证；工程事务只是内部阶段。能力采用固定设计与代码接线，操作依赖由 catalog 明确计算。

API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 统一归入 `src/data/`；REST/Ky 负责主要交互，GraphQL 负责复杂查询与订阅，Dexie 仅用于 IndexedDB。目录、选型与生命周期以 [`DATA_ACCESS.md`](DATA_ACCESS.md) §1.1–1.3 为准。

下游需要导出 API 与业务说明时，调用 [`$web-document-api`](../.agents/skills/web-document-api/SKILL.md)，在 `docs/api/` 导出统一文档包：根关联说明、`api/` 内一份通用结构与一份 API 元数据及按业务聚合的接口文档、`business/` 内已实现业务目标/调用流程/设计思路。每次对照已有文档、当前接口与真实消费者核对差异；局部委托仅同步受影响范围与关联。REST 保持六项与 JSON 加字段表，GraphQL 保留有来源的 Schema；导出不含本地代码或路径。未接入契约与设计建议仍保留并标明状态，不冒充已实现业务或联调通过。布局、迁移与检查以 Skill 为准，初始化只分发能力，不生成业务文档。 `API.md` 仍是可选基础契约参考。
