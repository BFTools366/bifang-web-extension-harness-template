---
name: web-plan-change
description: 为 Web Harness 或纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游创建可直接实施的精简 Todo。只在用户明确要求持久计划、跨会话交接，或发布与高风险工作确需协调时使用；普通日常任务直接实施。
---

# Web Harness：规划前端变更

只在计划能降低协调或交付风险时创建持久 Work Plan。

## 准入条件

1. 只在用户明确要求持久计划、任务需要跨会话交接，或发布/高风险工作确有依赖、交接或失败恢复需要时创建 Work Plan。
2. 多步骤、多模块、中等风险、可并行或 Agent 偏好本身都不构成准入；范围清楚的日常工作直接交给 `$web-implement-change`。Work Plan、Todo 和内部步骤不是左侧 user-owned Task，不占用 `Task {序号} | {当前进度} | {单一结果}` 序号，也不受 `user_owned_tasks` 开关控制。
3. 构建、完整验收、E2E、安全、权限、不可逆副作用和发布分别由自身事件与门禁触发，不能只因存在 Work Plan 自动加入。
4. 范围仍会改变产品目标、边界或成功标准时，先转 `$web-define-product`。

## 工作流程

1. 规划期间只读调查，不编码、不创建写入型 Worktree、不运行冒烟或 E2E。
2. 识别仓库：存在 `.harness/project.json` 时读取其唯一类型；否则仅在根 manifest 暴露源专用 `instantiate` 入口时按 Harness 源规划。读取 Agent Policy、工程规则、相关代码/测试、适用 Product Spec/ADR 和存在时活动 Work Plan；创建入口与终端化硬约束直接遵循根 `AGENTS.md`，不在计划中重写全文。只读取与当前任务相关的 Status、Verification 或 Release 证据。
3. 下游只规划当前唯一 `projectType` 且不得规划项目派生入口；源 Harness 模板契约只规划两个独立生成场景，不得规划同仓多宿主或公开第二创建路径：
   - Web：页面、路由、组件、查询/状态、样式、无障碍和浏览器行为。
   - Extension：popup/options/content/background、消息、storage、站点匹配、权限和 MV3 生命周期。
4. 梳理当前行为、Git 状态和用户修改。明确范围内/外、依赖、数据/权限风险和阻断项；计划不得把用户未提交修改当作可覆盖基线。
5. 按依赖顺序创建最少 Todo。每项必须包含稳定 ID、`pending|in_progress|blocked|done`、一个可观察结果、精确文件/模块所有权、依赖、风险、相关非空测试或相称替代验证，以及必要的格式/lint/类型/集成检查。
6. 按普通前端内聚边界安排职责：React 组件负责渲染和交互，feature hooks/services 负责该功能的数据与协调；Extension 的 background/content/popup/options 可以拥有各自宿主生命周期。只在存在真实复用时提取共享模块，不创建 monorepo 或强制共享业务层。
7. 每个公开行为记录“用户入口 → 实现模块 → 测试”的映射。涉及配置时加入三环境、宿主前缀、`APP_CONFIG`、隐式覆盖/未知键拒绝和构建前全量校验；涉及日志时加入稳定事件、Release 允许字段清单/脱敏、单测，以及 `build:release`/Extension `package` 自动运行 `pnpm release:inspect`。Extension Todo 额外记录权限、host permission、消息方向和最小授权依据。
8. 日常计划只包含受影响检查与相关非空测试，不自行追加全量测试、构建、smoke 或 E2E；行为保持重构追加全量测试。只有计划本身覆盖发布候选或完整验收时，才记录可绑定源码状态、唯一 Release `dist/` 或 Chrome MV3 候选、`pnpm build` 固定门禁、当次 E2E 用户选择、独立解析的 `acceptance_smoke`、批准场景和失败回流；浏览器步骤只在 E2E、smoke 或硬要求为 `required` 时运行。
9. 默认单 Agent。只有用户当前请求明确要求并行、`parallel_worktree_subagents: enabled`、至少两个写入范围互不重叠且 Git 基线干净已提交时才调用 `$web-run-parallel-worktrees`。
10. 按仓库命名规则创建或更新当天 Work Plan。只在重要阻断、交接或用户要求时同步 Status；计划本身不触发 Product Spec、ADR、Verification 或 Changelog。

## 质量规则

- 使用仓库真实文件、脚本和产物位置，不编造 API、权限、命令或依赖。
- 不把当前单 package 改成 workspace，不规划另一项目类型或类型切换。
- 优先最短完整场景，拒绝空批次、占位实现和只有截图没有行为证据的 Todo。
- 日常计划不能宣称发布就绪；真实候选不能是开发服务器、mock 或脚手架。
- 工具/依赖升级 Todo 按稳定 SemVer（`x.y.z`）最低版本验收，prerelease 不作为兼容基线；候选版本、提交、lock/hash、Schema/协议版本、manifest_version 与 projectType 等事实仍精确绑定。

## 完成输出

报告准入事件、范围、Todo、所有权、入口到测试映射、并行判断、适用专用门禁、阻断项和下一项可执行 Todo。
