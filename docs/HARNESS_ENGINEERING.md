# Harness 工程方法

本索引解释 Bifang Web Harness 的工程方法，不复制宿主技术、运行时、UI、日志、数据、测试或发布细则。只在当前任务需要理解治理取舍时进入，并继续按主题渐进读取。

## 源码职责与生成链

源工程维护规则、工具和中性模板；生成的 Web 或 Extension 各自成为独立单包。工程生成和首版产品实施有不同的完成条件，详见[项目生命周期](harness_engineering/project_lifecycle.md)。

```mermaid
flowchart LR
  cli[公开实例化入口] --> input[身份、策略与目标校验]
  input --> stage[源快照与 sibling staging]
  stage --> generate[当前宿主工程模板]
  generate --> terminal[终端工具投影与源专用裁剪]
  terminal --> check[结构校验、安装与 Git 基线]
  check --> publish[原子发布独立目录]
  publish --> product[下游 PRD、原型与首版实施]
  product --> capability[按所选操作装配能力]
```

| 边界       | 实际入口与职责                                                                                                                                                                                                                                                                     | 直接验证入口                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 创建输入   | [`scripts/instantiate.ts`](../scripts/instantiate.ts)、[`prompts.ts`](../.harness/tooling/prompts.ts)：复用输入、逐项补缺、汇总确认；不实现产品                                                                                                                                    | `tests/harness-governance.test.ts`、`tests/creation-requirements.test.ts`                                   |
| 创建事务   | [`instantiate.ts`](../.harness/tooling/instantiate.ts)、[`instantiate-target.ts`](../.harness/tooling/instantiate-target.ts)：冻结源、隔离 staging、目录身份与提交点、失败回收                                                                                                     | `tests/initialization-atomicity.test.ts`、`tests/initialization-source-boundary.test.ts`                    |
| 工程模板   | [`init.ts`](../.harness/tooling/init.ts)、[`templates/`](../.harness/tooling/templates/)：仅生成当前宿主的配置、品牌、数据与 UI 基础                                                                                                                                               | `tests/harness-initialization-web.test.ts`、`tests/harness-initialization-extension.test.ts`                |
| 终端化     | [`finalize.ts`](../.harness/tooling/finalize.ts)、[`config.ts`](../.harness/tooling/config.ts)：替换终端工具与治理文档，裁剪创建入口、源测试和源记忆                                                                                                                               | `tests/harness-instantiation-terminal.test.ts`、`tests/harness-terminal-governance.test.ts`                 |
| 能力装配   | [`application/files.ts`](../.agents/skills/web-compose-capabilities/templates/application/files.ts)：按 catalog 操作闭包装配两宿主，保护已有实现；[账户工作区](../.agents/skills/web-compose-capabilities/templates/compositions/account-workspace/README.md)是独立 Web 富组合参考 | `tests/application-wiring.test.ts`、`tests/application-capabilities.test.ts`、`tests/saas-creation.test.ts` |
| 升级所有权 | [`upgrade-core.ts`](../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts)：冻结源/候选/目标证据，规划、应用与登记；生产清单、运行时最低保护和源独立校验分别承担防弱化责任                                                                                                 | `tests/harness-upgrade-ownership.test.ts`、`tests/harness-upgrade-cli.test.ts`                              |
| 源治理     | [`scripts/validate-harness.ts`](../scripts/validate-harness.ts)：Skills、链接、终端化、独立所有权、文件规模和注释合同                                                                                                                                                              | `tests/harness-validator.test.ts`、`tests/harness-skill-validation.test.ts`                                 |

新增能力资产时同时核对 catalog、装配输出和升级精确传播清单；新增源测试时核对终端裁剪及升级删除规则。上述测试按改动选择，完整执行条件继续由工程规则决定。

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
