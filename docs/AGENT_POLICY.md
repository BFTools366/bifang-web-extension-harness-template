---
schema_version: 2
decision_mode: reuse_then_infer_then_ask
standard_work_plan: disabled
parallel_worktree_subagents: disabled
milestone_smoke: disabled
milestone_e2e: ask
---

# Agent 运行策略

本文件是任务路径与额外交付门禁的唯一持久事实来源。默认流程遵循最短反馈环：日常变更只保留必要记录、相关检查与本次非空测试，行为保持重构运行全量测试，最终候选运行唯一 Release 构建。额外计划、并行或浏览器流程不自动加入；每次产物构建只额外取得一次当次 E2E 选择。

## 字段语义

- `decision_mode: reuse_then_infer_then_ask`：先复用本文件，再根据任务风险和真实产物判断；只有字段非法、规则冲突、无法建立可运行性或需要新增外部授权时才询问。
- `standard_work_plan: disabled`：标准任务直接实施并在当前任务维护进度；只有用户明确要求持久计划，或任务属于必须计划的里程碑时才写 Work Plan。
- `parallel_worktree_subagents: disabled`：默认单 Agent 串行实施；只有用户明确要求并行，且职责、Git 基线和整合门禁全部满足时才创建 Worktree。
- `milestone_smoke: disabled`：默认不运行浏览器冒烟；只有用户、产品、安全或发布渠道明确要求时才成为硬门禁。
- `milestone_e2e: ask`：每次执行 `pnpm build`、`build:release` 或 Extension `package` 前都询问用户是否为该次精确候选启用 E2E。选择只对当前构建有效，不从历史任务推断或复用；关闭 E2E 不跳过唯一 Release 构建、全量测试或 `release:inspect`。

## 任务路径

快速、标准和里程碑是逐任务选择，不是新的持久字段：

- 快速：局部、可逆、低风险；直接实施并运行受影响检查。
- 标准：可逆的多步骤或跨职责工作；直接实施并运行受影响的最小充分检查与相关非空测试，不自动持久化 Todo。普通页面、路由或交互变化不因“用户可见”自动升级。
- 里程碑：初始化器/项目创建契约、项目类型能力、品牌或身份派生、安全/权限、已承诺的兼容性或对外契约、不可逆数据、生产副作用、最终候选或发布；必须维护 Todo，全部完成后再验收精确 Release 产物。需要创建新下游时，回到源 Harness 使用项目创建入口并遵循其完整创建门禁，不为相同事务另造通用 Work Plan。

用户可以要求更严格路径。安全、扩展权限、身份迁移、外部上传、商店发布、不可逆操作或已承诺的兼容性/对外契约变化不得为了缩短流程而降级。

日常开发只运行受影响的格式、lint、类型与 `test:related`，零测试结果必须回退到所属测试文件或相称替代验证；不自动增加 Work Plan、并行、全量测试、构建、浏览器或其他记录。行为保持重构运行全量测试。需要真实候选时先询问当次 E2E 选择，再运行唯一 `pnpm build -- --e2e=enabled|disabled`，由它一次性完成环境、Harness、格式、lint、类型、全量测试、Release 构建、版本注入与产物检查。纯文档/元数据任务只做相称静态检查。

构建命令、构建时间版本、E2E 选择及其测试、扫描或浏览器结果只在命令输出与当前任务交付说明中报告；这些构建操作本身不创建或更新 Work Plan、ADR、Status、Changelog、Verification 或其他持久项目记忆。只有独立的产品、长期决策或发布事件真实触发且用户明确要求持久记录时，才进入对应记忆流程。

## 显式附加流程

- 用户明确要求并行时，先确认至少两个互不重叠的写入范围、干净已提交基线和整合顺序；否则保持单 Agent，不为追求并行创建额外结构。
- 每次产物构建必须先取得当次 E2E `enabled|disabled` 选择；交互式脚本直接询问，非交互式 Agent/CI 必须显式传参。Agent 不得替用户静默选择。选择 `enabled` 后，构建成功仅代表候选已生成，仍必须对该精确候选调用 `$web-test-final-artifact-e2e`；选择 `disabled` 时记录 `Not run` 与 `Unverified` 范围。
- 用户、产品、安全或渠道硬要求浏览器步骤时，E2E 只能选择 `enabled` 并探测 Chrome；否则 Chrome 是否探测取决于当次选择，不把 Chrome 缺失当作静态或单测任务的阻断项。
- Web 冒烟只验证 `pnpm build` 的最终输出，不用 Vite 开发页代替；Extension 冒烟从精确 Chrome MV3 候选加载，只覆盖明确要求的入口。
- 冒烟/E2E 只接受通过 `pnpm env:validate` 并由逻辑 Release（`.env.production`）生成的精确候选；捕获的 console 必须符合 [`LOGGING.md`](LOGGING.md)，不能带入开发/测试 BaseURL 或敏感数据。
- E2E 需要登录、真实账号、生产数据、付费、商店上传、凭据或不可逆副作用时，必须获得该操作的独立明确授权。
- 任一必需检查失败、超时、取消或未执行时，不得宣布里程碑或发布就绪；应修复后重跑受影响的完整闭环。

## 执行优先级

1. 系统安全规则、批准的产品范围与渠道硬要求。
2. 当前任务中用户明确给出的要求。
3. 本文件持久策略。
4. Agent 根据风险、存在时的当前唯一 `projectType` 和真实候选作出的适用性判断。
5. 仍无法可靠判断时请求用户决定。

本文件不授权发布、push、商店提交、凭据操作、生产访问或数据删除；这些行为始终需要其自身的任务授权。
