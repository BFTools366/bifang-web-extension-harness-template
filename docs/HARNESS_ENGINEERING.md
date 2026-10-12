# Harness 工程方法

本索引解释 Bifang Web Harness 的工程方法，不复制宿主技术、运行时、UI、日志、数据、测试或发布细则。只在当前任务需要理解治理取舍时进入，并继续按主题渐进读取。

## 专题

- [以智能体为首要使用者的设计](harness_engineering/agent_first_design.md)：事实来源、事件驱动执行、统一标题、项目绑定、Subagent 和人类授权边界。
- [工程基础](harness_engineering/foundations.md)：单宿主单包、身份/品牌派生、Extension Chrome MV3 / Firefox MV2 兼容责任、环境、数据、日志、UI 与依赖原则。
- [项目生命周期](harness_engineering/project_lifecycle.md)：源工程冻结、实例化、日常开发、候选验收、发布与下游升级。

- [Skill 职责与组合](harness_engineering/skill_composition.md)：全量能力地图、独立触发、单向委托、参考资料按需读取与分发边界。

## 规范入口

| 需要决定的事实                             | 唯一规范                                                         |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 宿主、初始化、品牌与目录                   | [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md)                       |
| 智能体运行策略、标题、计划、并行、E2E 建议 | [`AGENT_POLICY.md`](AGENT_POLICY.md)                             |
| 文件、注释、测试与构建                     | [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)                   |
| Mantine UI                                 | [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md)           |
| 三环境与公开配置                           | [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)           |
| 日志与脱敏                                 | [`LOGGING.md`](LOGGING.md)                                       |
| 数据访问                                   | [`DATA_ACCESS.md`](DATA_ACCESS.md)                               |
| 候选、验证与发布                           | [`VERIFICATION.md`](VERIFICATION.md)、[`RELEASE.md`](RELEASE.md) |

日常任务继续遵循根 [`AGENTS.md`](../AGENTS.md) 的最小闭环；方法论不能覆盖更具体的事实源。
