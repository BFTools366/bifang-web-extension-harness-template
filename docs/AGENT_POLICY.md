---
schema_version: 1
decision_mode: reuse_then_infer_then_ask
parallel_worktree_subagents: enabled
milestone_smoke: enabled
milestone_e2e: disabled
---

# Agent 运行策略

本文件是 Agent 并行协作、里程碑冒烟与 E2E 偏好的持久事实来源。字段表达“允许且适用时执行”，不替代安全规则、用户授权、产品要求或发布渠道硬门禁。

## 字段语义

- `decision_mode: reuse_then_infer_then_ask`：先复用本文件，再根据任务风险和真实产物判断；只有字段非法、规则冲突、无法建立可运行性或需要新增外部授权时才询问。
- `parallel_worktree_subagents: enabled`：任务能拆成至少两个写入边界清晰、互不重叠的单元时，允许并行 Agent/Worktree。它不要求为不可拆任务强行并行。
- `milestone_smoke: enabled`：里程碑 Todo 全部完成后，允许对当前类型的真实最终构建执行适用冒烟。
- `milestone_e2e: disabled`：默认不自动执行可选 E2E；用户、产品、安全或渠道明确要求时仍必须执行。关闭 E2E 不允许把 Mock 或源码检查冒充真实产物验收，也不跳过三环境校验、Release 构建、自动 `pnpm release:inspect` 或其他固定门禁。

## 任务路径

快速、标准和里程碑是逐任务选择，不是新的持久字段：

- 快速：局部、可逆、低风险；直接实施并运行受影响检查。
- 标准：多步骤、跨职责或需交接；维护精简 Todo，完成后运行相关检查。
- 里程碑：初始化契约、项目类型、品牌生成、安全/权限、最终候选或发布；Todo 全部完成后再验收真实产物。

用户可以要求更严格路径。安全、扩展权限、身份迁移、外部上传、商店发布、不可逆操作或对外契约变化不得为了缩短流程而降级。

## 并行协作边界

- 分派前明确每个 Agent 的文件所有权和责任，不允许两个写入者同时修改同一文件。
- 所有写入者共享工作区事实时，不得撤销其他 Agent 或用户的修改；遇到重叠先协调。
- 并行只优化独立工作，不改变一个下游只能有单一 `projectType` 的产品边界。
- 主 Agent 在交付前必须等待必需结果、整合冲突并执行整体检查；子任务局部通过不等于候选通过。

## 冒烟与 E2E

- Web 冒烟针对 `pnpm build` 的最终输出，不只检查 Vite 开发页；适用时验证页面可加载、品牌和关键路由可见。
- Extension 冒烟针对 `pnpm build` 的最终 Chrome MV3 输出，在真实 Chrome 中加载后验证 manifest、图标、Popup 与 Options；只验证项目真实需要的入口。
- 冒烟/E2E 只接受通过 `pnpm env:validate` 并由逻辑 Release（`.env.production`）生成的精确候选；捕获的 console 必须符合 [`LOGGING.md`](LOGGING.md)，不能带入开发/测试 BaseURL 或敏感数据。
- E2E 需要登录、真实账号、生产数据、付费、商店上传、凭据或不可逆副作用时，必须获得该操作的独立明确授权。
- 任一必需检查失败、超时、取消或未执行时，不得宣布里程碑或发布就绪；应修复后重跑受影响的完整闭环。

## 执行优先级

1. 系统安全规则、批准的产品范围与渠道硬要求。
2. 当前任务中用户明确给出的更严格约束。
3. 本文件持久策略。
4. Agent 根据风险、当前唯一 `projectType` 和真实候选作出的适用性判断。
5. 仍无法可靠判断时请求用户决定。

本文件不授权发布、push、商店提交、凭据操作、生产访问或数据删除；这些行为始终需要其自身的任务授权。
