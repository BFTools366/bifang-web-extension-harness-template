# 2026-08-12 SOP Simplification Work Plan

## 目标与路径

- 路径：里程碑。初始只读审计按治理文档标准路径开始；确认修改会进入新生成下游的 Agent/Release 契约后，按模板输出契约硬规则升级。
- 目标：消除 Agent SOP 中重复或互相冲突的强制流程，把不会改变交付可信度的规划、并行、浏览器验证和全量开发检查改成显式按需，同时保留安全、权限、单宿主、Release 与外部副作用硬门禁。
- 基线：当前工作区已有一组“只允许源外 `instantiate`”的未提交里程碑改动及其 2026-08-11 完成记录；这些内容属于受保护基线，本计划不重开、不覆盖也不追认其历史候选。

## 范围

- 范围内：任务读取与路径播报、标准路径持久 Todo、普通可逆 UI 变化的路径选择、相称开发检查、并行 Worktree 许可、Chrome 探测、里程碑 smoke/E2E 决策所有权，以及下游生成的 Agent 指令。
- 范围外：初始化器行为、项目类型、运行时配置、Extension 权限、业务代码、版本、候选发布、提交、推送、上传或部署。
- 不可选门禁：用户修改保护、单包/单宿主、唯一源外创建入口、安全与权限、行为变化的非空测试、Release 三环境/构建/`release:inspect`、必需检查失败回流，以及外部或不可逆操作的独立授权。
- 并行判断：审计可并行只读执行；治理文案与生成模板存在一致性依赖，最终写入由主 Agent 串行整合，不创建 Worktree。

## Todo

| ID     | 状态 | 可观察结果与所有权                                                                                                             | 依赖   | 验证                                                                                                              |
| ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| SOP-01 | done | 只读审计 `AGENTS.md`、`docs/AGENT_POLICY.md`、相关 Skills、生成的下游 Agent 指令与现有脏基线，列出可选项和硬门禁               | 无     | 三路独立审计结论交叉一致，未修改文件                                                                              |
| SOP-02 | done | `docs/AGENT_POLICY.md` 成为任务路径与可选增强的清晰事实源：标准 Work Plan 按需，smoke 显式 optional，E2E 默认 disabled         | SOP-01 | frontmatter 与正文一致；必需门禁不被 optional/disabled 覆盖                                                       |
| SOP-03 | done | `AGENTS.md`、相关 Skills、方法/发布摘要及生成的下游 Agent 指令只保留必要触发摘要，去除重复决策与无条件全门禁                   | SOP-02 | 路径、Chrome、Todo、Worktree 和验证语义跨文件一致；既有初始化硬约束不变                                           |
| SOP-04 | done | 格式、链接、类型、测试和 Harness 校验通过，差异只包含本计划与受保护基线                                                        | SOP-03 | `git diff --check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm validate:harness`      |
| SOP-05 | done | 从当前源码在源外分别实例化 Web/Extension 终端下游，验证策略字段、生成治理文档、完整门禁与 Release 产物；按策略记录浏览器跳过项 | SOP-04 | 两种真实非 skip 生成；Extension 包含 `pnpm package`；`milestone_smoke: optional` 因无运行时变化不选，E2E disabled |

## 预期精简结果

1. 快速任务不创建持久计划，也不机械播报路径；标准任务只有在交接、跨会话、失败恢复、显著依赖或用户要求时创建 Work Plan。
2. 普通可逆页面、路由或交互变化保持标准路径；只有已承诺对外契约、安全/权限、不可逆变化、生产副作用或候选发布强制里程碑。
3. `milestone_smoke: optional` 由 `web-verify-delivery` 根据风险和候选价值决定是否运行；`milestone_e2e: disabled` 默认跳过，硬要求仍可覆盖。只有选中真实浏览器步骤后才探测 Chrome。
4. 日常开发只运行受影响的最小充分检查；完整 package/Release 门禁仅在跨切面变化、里程碑、候选发布、用户要求或无法用窄检查建立可信度时执行。
5. `web-verify-delivery` 独占候选准入、策略解析、失败回流和最终结论；E2E Skill 只执行已批准的浏览器场景并返回证据。

## 验证结果

- 环境：Node.js `26.7.0`、pnpm `10.33.3` 满足仓库下界；本轮浏览器步骤未选择，Chrome 为 `not-required/not-probed`。
- 根 Harness：`git diff --check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、6 个测试文件/52 个测试与 `pnpm validate:harness`（13 Skills、122 条本地链接）通过；三轮独立只读复核最终均无阻断。
- 源绑定：基线提交 `edd916c9f88daab15bebd40391a74348a7556fdf`；生成时 tracked worktree diff SHA-256 为 `39c4dd4b05f7a22d97a5d6b9d1205cec6ba7c2941e5f1450f8ba9e2a0d17d810`。源码仍含未提交用户基线与本计划改动，本任务未获 commit 授权。
- Web 候选：`/tmp/bifang-sop-verify.BqTnq1/sop-policy-web`，独立 Git 根、`projectType=web`、无创建入口；43 个测试、development/test/release 构建、`release:inspect` 与 Harness 校验通过。`dist/` 6 个文件，聚合 SHA-256 `9ac0918d18af8e4441a7a8c09e5d4a0377d8f4719abe5ae9de905ee791b144a5`。
- Extension 候选：`/tmp/bifang-sop-verify.BqTnq1/sop-policy-extension`，独立 Git 根、`projectType=extension`、无创建入口；43 个测试、development/test/release 构建、`pnpm package`、两道自动 Harness/Release 扫描通过。MV3 目录 11 个文件，聚合 SHA-256 `e6cb387376ee0c1bd57a97f94b91f03dffee6fabaecb03b60bf53bfafef20d33`；zip SHA-256 `f31cc5ae589504fef256e8107cba71f03ce632980a3e9db490fee442e589103a`。
- 两种下游均实际包含 `schema_version: 2`、`standard_work_plan: optional`、`milestone_smoke: optional`、`milestone_e2e: disabled`，以及相称检查和浏览器条件启用文案；Extension 额外保留不可选的 `pnpm package` 门禁。
- 浏览器策略：本次只改变治理文案与 Agent 决策，不改变页面、扩展运行时、权限或候选字节逻辑，`milestone_smoke: optional` 判定为 `not-selected`；E2E 按 `disabled` 为 `Not run`。浏览器、其他操作系统与分发渠道标记 `Unverified`。
- 结论：治理目标与真实生成门禁已完成；由于源码不是新提交，发布候选绑定结论为 `Awaiting human review`，不影响本次 SOP 实施完成。未执行 commit、push、tag、上传或发布。
