# AGENTS.md

## 项目使命

本仓库是 以智能体为首要使用者的纯 TypeScript Web Harness，只生成两类互斥终端下游之一：单包 React Web，或单包 Plasmo Chrome MV3 / Firefox MV2 Extension。源模板只维护跨项目复用的规则、Skills、中性资产和交付工程，不实现任何具体产品。

## 启动门禁

1. 先读取本文件，再读取 `docs/AGENT_POLICY.md` 的 YAML 文件头元数据 与字段语义；只有创建/执行左侧 Task、显式并行、构建或修改持久策略时，才继续读取对应章节。
2. 根目录没有 `.harness/project.json` 且仍有源专用实例化入口时，先执行源范围门禁：只接受 Harness 自身维护，以及创建下游所需的固定初始化字段。产品目的、业务功能、产品专属 UI/文案/数据、远程地址、凭据、产品构建或发布需求不得在模板源中接收、分析、记录或实施；混合请求只解析允许的初始化部分，其余要求用户在完成实例化或切换到既有下游后重提。
3. 写入前确认 Git 根、分支和工作区并保护已有修改；重叠无法安全处理时停止。不存在的命令、能力或验证结果不得虚构。
4. 先判定任务类型，再只读取下表命中的事实来源与 Skill；冲突或缺失时才扩大读取，不一次加载全部文档、历史或 Skills。

## 按任务渐进读取

| 当前任务                                      | 读取内容                                                                                         | 执行入口                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Harness 文档、规则、脚本或 Skill 维护         | `docs/ENGINEERING_RULES.md`；再读直接影响的事实源、脚本和测试                                    | `$web-implement-change`；真实结构问题同时用 `$web-refactor-code`                                   |
| 创建新下游                                    | `README.md`、`docs/TS_WEB_TEMPLATE.md`、实例化 Skill 及其表单                                    | `$web-instantiate-project`；品牌步骤按需用 `$web-prepare-brand-identity`                           |
| 下游需求澄清、PRD、原型与选择                 | 已初始化下游的 `docs/product_spec/`；原型任务再读当前宿主 UI 规范和对应选择记录                  | `$web-define-product` → `$web-design-prototype` → 用户选定后 `$web-implement-change`；初始化仅分发 |
| 范围清楚的实现、问题修复或 i18n 整理          | `docs/ENGINEERING_RULES.md` 与直接命中的 UI、数据、配置或日志事实                                | `$web-implement-change`、`$web-extract-i18n-strings`                                               |
| React Web 列表、数据表格或搜索结果            | `docs/MANTINE_UI_GUIDELINES.md`、`docs/DATA_ACCESS.md` 与真实域契约                              | `$web-implement-change`、`$web-implement-list-view`；Extension 不调用                              |
| Web SaaS 客户端/大后台认证与用户 SOP          | `docs/DATA_ACCESS.md` 认证规则与真实服务契约                                                     | `$web-implement-saas-auth`；仅已初始化 Web，源只维护通用 Skill                                     |
| 可选 SaaS 客户端购买、订单与钱包 SOP          | 购买 Skill 的需求、订单/钱包合同与中性设计；真实服务契约                                         | `$web-implement-saas-commerce`；默认关闭，明确选中后才应用，仅已初始化 Web SaaS 客户端             |
| SaaS 大后台商品分类、组织成员与订单管理       | 管理 Skill 的页面/SOP、领域合同与中性设计；真实服务能力                                          | `$web-implement-saas-admin`；仅已初始化 Web 明确采用大后台时应用，源只维护通用能力                 |
| UI、页面、Popup、Options、响应式或无障碍      | `docs/MANTINE_UI_GUIDELINES.md`，只采用当前 `projectType` 章节                                   | `$web-implement-change`                                                                            |
| 下游真实 HTTP 接入或 Mock 迁移                | `docs/RUNTIME_CONFIGURATION.md`、`docs/DATA_ACCESS.md` 与真实 endpoint 契约                      | `$web-connect-http-service`；实施与列表流程按接入事件委托                                          |
| 从当前 API 代码整理模块文档                   | 当前 API 实现、类型、相关测试与既有模块文档                                                      | `$web-document-api`；在下游写入 `docs/api/`，每个模块独立成文                                      |
| Extension 宿主边界兼容审查                    | 当前下游工程规则、受影响消费者与双目标证据                                                       | `$web-review-extension-compatibility`；仅 Extension，只读                                          |
| 环境、数据、认证、基础 API 契约、事件流或日志 | 对应 `docs/RUNTIME_CONFIGURATION.md`、`DATA_ACCESS.md`、`LOGGING.md`；基础契约另读 `docs/API.md` | `$web-implement-change`                                                                            |
| API 契约核对或漂移审查                        | 当前操作的可信来源、API 实现/类型/消费者/测试；相关数据章节                                      | `$web-review-api-contract`，只读                                                                   |
| 职责、依赖或状态归属审查                      | 工程规则的模块边界与目标代码/消费者                                                              | `$web-review-module-boundaries`，只读                                                              |
| 权限入口、撤权或作用域变化                    | 当前权限契约、身份与受影响入口                                                                   | `$web-implement-access-control`                                                                    |
| 写入重复、冲突或未知恢复                      | 当前操作的幂等/版本/查询与允许状态契约                                                           | `$web-implement-write-recovery`                                                                    |
| 真实本地存储访问或迁移                        | 数据访问的存储与状态所有权章节、实际消费者                                                       | `$web-implement-browser-storage`                                                                   |
| 持续事件或多来源时序                          | 数据访问中实际命中的 SSE/Subscription/RxJS 与宿主章节                                            | `$web-implement-event-stream`                                                                      |
| 创建或检查左侧 user-owned Task                | `docs/AGENT_POLICY.md` 的“用户可见 Task 开关、粒度与创建门禁”                                    | `$web-manage-user-tasks`；`user_owned_tasks` 启用或用户明确要求时调用                              |
| 既有 Worktree 审计                            | 主工作区 Git 身份与既有并行登记                                                                  | `$web-audit-worktrees`，只读，不要求并行创建开关启用                                               |
| 当前 Task 内部并行或提交                      | `docs/AGENT_POLICY.md` 的相关章节；实际提交再读提交 Skill                                        | `$web-run-parallel-worktrees`、`$web-configure-git-commits`                                        |
| 恢复、阻断、交接或持久计划                    | 最新产品状态；用户要求或已有活动计划时读最新工作计划                                             | `$web-plan-change`，仅在独立触发器成立时                                                           |
| 显式候选、完整验收或 E2E                      | `docs/RELEASE.md`、`docs/VERIFICATION.md` 与当前宿主规则                                         | `$web-prepare-release`、`$web-verify-delivery`、`$web-test-final-artifact-e2e`                     |
| 长期决定、硬例外或源记忆整理                  | `docs/adr/README.md` 与最新架构决策记录（ADR）；只追溯其明确引用                                 | 对应记录流程；源历史整理用 `$web-curate-harness-memory`                                            |
| 回顾开发历程、决策沿革或未来方向              | 实际存在的记忆索引与 Git 历史；按问题限定范围                                                    | `$web-summarize-development-history`；默认只读、不改写记忆                                         |
| 理解 Harness 方法                             | `docs/HARNESS_ENGINEERING.md`，再按索引选择一个主题卷                                            | 不因阅读自动进入计划、构建或验收                                                                   |
| 升级已初始化下游                              | 下游事实、源版本和升级 Skill 指定资料                                                            | `$web-preview-harness-upgrade` 只读比较；`$web-upgrade-harness` 承接已批准应用                     |

## 始终生效的边界

- `superpowers: disabled` 时不得调用或遵循任何 `superpowers:*` Skill；其他能力开关只表示允许，不能替代当前任务的触发条件或授权。日常工作直接实施，只运行本次变化需要的相关非空测试或最小替代检查；不得因复杂、多模块、用户可见或 Agent 偏好自动增加持久计划、全仓检查、构建、浏览器或完整验收。
- 除非用户明确说当前 Task 内部步骤、plan 或 Subagent，Task 一律指 Codex 左侧 user-owned Task，标题使用 `Task {序号} | {当前进度} | {单一结果}`，进度只取 `已分配`、`运行中`、`检查中`、`已完成`；序号分配、转换更新与复读只按 `docs/AGENT_POLICY.md`。内部 plan、Subagent、Worktree 不使用该标题合同，也不得虚写 `已完成`。
- `user_owned_tasks: disabled` 时不得自动创建或拆分左侧 Task，但仍响应用户明确创建请求；`enabled` 时结果边界变化前自动创建。拆分条件与写入型 active Task 约束见 `docs/AGENT_POLICY.md`。
- 新下游只能经唯一公开实例化入口在源外空目录创建，成功结果不产生最终候选；创建规则只在创建任务中读取 `docs/TS_WEB_TEMPLATE.md` 与实例化 Skill。
- 下游始终平铺单包且只有一个 `projectType`；不得叠加或切换宿主、建立 monorepo/共享 core，或保留创建另一项目的入口。Web 与 Extension 的框架、路由、状态、国际化、权限和宿主边界只在相关任务中读取 `docs/TS_WEB_TEMPLATE.md` 与专题事实源。
- 安全、隐私、Extension 权限、不可逆数据、生产/付费/凭据副作用、公开兼容契约、最终候选和正式发布进入对应专用门禁；发布授权与 E2E 复用规则见 `docs/AGENT_POLICY.md` 与 `docs/RELEASE.md`。
- 对“完成”“可用”或“已验证”的声明必须来自真实可观察证据；Mock、stub、源码片段、中性脚手架或开发预览不能替代最终候选验收，人工批准也不能把失败或未执行改判为通过。
- Extension 的 Chrome MV3 / Firefox MV2 兼容由执行 Agent 负责，约束见 `docs/TS_WEB_TEMPLATE.md` 与 `docs/ENGINEERING_RULES.md`；产品文案使用既有 i18n。
- 本仓库只使用项目声明的 Node.js、pnpm 与 TypeScript 依赖，不依赖全局第三方包。工具链只在首次实例化主动检查，或真实命令失败且诊断指向环境时检查；安装或升级仍需授权。
- 按功能拆解模块，保持高内聚、单一职责和单向无环依赖；受管 TypeScript 稳定声明需要紧邻中文注释。结构、职责、提示与硬上限以 `docs/ENGINEERING_RULES.md` 为唯一详细来源，根入口不复制实现链。
- 产品规格、架构决策、变更记录、产品状态、工作计划与验收记录 只由各自独立事件触发。构建和候选事实按发布规则留在候选证据与当前回复；普通维护不写占位，范围外问题进入 `docs/TECH_DEBT.md`。
- 不覆盖或撤销用户或其他 Agent 的修改，不为假想未来增加抽象、接口或依赖；跨平台实现不得默认单一 Shell、路径分隔符、权限模型或浏览器能力。

## Skills 地图

项目 Skills 位于 `.agents/skills/`。先按任务路由选择最小集合；命中后必须完整读取对应 `SKILL.md`，引用按当前阶段、宿主和能力条件读取；组合规则见工程规则“Skill 职责、复用与渐进披露”，不得预先加载同类全部 Skills。

- 初始化与身份：`$web-instantiate-project`、`$web-check-development-environment`、`$web-prepare-brand-identity`。
- 开发与治理：`$web-define-product`、`$web-design-prototype`、`$web-implement-change`、`$web-implement-list-view`、`$web-implement-saas-auth`、`$web-implement-saas-commerce`、`$web-implement-saas-admin`（后四项仅 Web，购买仅用于选中的客户端，管理仅用于大后台）、`$web-refactor-code`、`$web-connect-http-service`、`$web-document-api`、`$web-review-extension-compatibility`（仅 Extension）、`$web-extract-i18n-strings`、`$web-plan-change`、`$web-configure-git-commits`、`$web-audit-worktrees`、`$web-run-parallel-worktrees`、`$web-preview-harness-upgrade`、`$web-upgrade-harness`、`$web-summarize-development-history`、`$web-curate-harness-memory`。
- 独立复用：`$web-review-api-contract`、`$web-review-module-boundaries`、`$web-implement-access-control`、`$web-implement-write-recovery`、`$web-implement-browser-storage`、`$web-implement-event-stream`、`$web-manage-user-tasks`。
- 候选与验收：`$web-prepare-release`、`$web-verify-delivery`、`$web-test-final-artifact-e2e`。

源 Harness 共保留 33 个 规范标识为 `web-*` 的 Skills；两类终端均删除实例化与源记忆整理能力。Web 另删除 Extension 专属 `$web-review-extension-compatibility`，保留 30 个维护 Skills；Extension 另删除 Web 专属 `$web-implement-list-view`、`$web-implement-saas-auth`、`$web-implement-saas-commerce` 与 `$web-implement-saas-admin`，保留 27 个维护 Skills（均不含设计支持）。初始化只分发能力，不生成业务记录。两类下游另在项目内默认补装缺失的 `design-taste-frontend`，有效已有版本保留，不额外问询、不全局安装；规则优先级见 `docs/MANTINE_UI_GUIDELINES.md` §1.1。Skill 目录、文件头元数据、发现元数据与实际文件必须一致。

## 约束地图

| 约束或事实                                          | 唯一来源                                                                                    | 何时读取                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 产品目标、范围与成功标准                            | `docs/product_spec/README.md` 与最新产品规格                                                | 下游定义产品或改变边界                   |
| 能力、用户可见 Task 开关/标题、计划、并行与候选偏好 | `docs/AGENT_POLICY.md`                                                                      | 启动时读策略头；相关任务再读对应章节     |
| 工程、注释、文件、测试、记忆触发与例外              | `docs/ENGINEERING_RULES.md`                                                                 | 修改代码、测试、文档、配置、规则或 Skill |
| 宿主技术与初始化基线                                | `docs/TS_WEB_TEMPLATE.md`                                                                   | 创建、宿主或技术基线任务                 |
| UI、运行时、数据与日志                              | `docs/MANTINE_UI_GUIDELINES.md`、`RUNTIME_CONFIGURATION.md`、`DATA_ACCESS.md`、`LOGGING.md` | 精确命中对应领域时                       |
| 当前状态、计划与长期决定                            | 最新产品状态、最新工作计划、最新架构决策记录（ADR）                                         | 恢复、交接、计划或决定事件               |
| 构建、版本、发布与候选证据                          | `Version.md`、`docs/RELEASE.md`、`docs/VERIFICATION.md`                                     | 显式候选、验收或发布                     |
| Harness 方法、升级与技术债                          | `docs/HARNESS_ENGINEERING.md`、升级锁与 Skill、`docs/TECH_DEBT.md`                          | 方法阅读、下游升级或范围外问题           |
| Git 身份、模板与提交消息                            | Git 配置 Skill 及其引用                                                                     | 下一步实际提交时                         |
| 商业许可                                            | `LICENSE.zh-CN.md`、`LICENSE.en.md`                                                         | 实例化、身份、分发或许可任务             |

## 每次任务的最小闭环

1. 判定源/下游边界和任务类型，只读取路由命中的最少事实与 Skills。
2. 在授权范围内实施并保护已有修改，只运行本次变化需要的测试或最小替代检查。
3. 只更新被独立事件触发的权威记录；失败在当前范围内修复并重跑，新增副作用或范围变化先请求授权。
4. 完成时报告实际变化、实际验证、未执行项和剩余风险，不把初始化或日常实现描述为发布就绪。

Harness 自身规则、Skill、脚本或验证器变化运行 `pnpm validate:harness`；该日常入口只执行硬门禁，不替代真实下游构建、E2E 或完整验收。
