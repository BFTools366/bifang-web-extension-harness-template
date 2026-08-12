---
name: web-plan-change
description: 为 Web Harness 或纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游创建可直接实施的精简 Todo。用于需要跨会话、交接、失败恢复或显著依赖的标准任务，以及所有前端里程碑、发布候选或用户明确要求持久计划的任务；快速路径和无需持久上下文的普通标准任务不调用。
---

# Web Harness：规划前端变更

只在计划能降低协调或交付风险时创建持久 Work Plan。

## 路径判定

1. `快速`：清楚、局部、可逆、不改变公开契约、权限或数据边界。不要创建 Work Plan，直接调用 `$web-implement-change`。
2. `标准`：可逆的多步骤或跨职责工作。只有跨会话、需要交接/失败恢复、步骤依赖明显，或用户明确要求时才调用本 Skill 创建精简 Todo；普通页面、路由或交互变化不因“用户可见”自动升级。
3. `里程碑`：初始化/项目类型、品牌或身份派生、已承诺的兼容性/对外契约、Extension 权限/站点匹配/后台安全边界、破坏性数据变化、生产副作用、发布候选，或用户要求完整验收。始终创建 Todo 和真实产物验收里程碑。
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
8. 标准路径到开发检查即可，不自动追加 smoke/E2E。里程碑路径追加准入条件：全部 Todo `done`、可绑定源码状态、真实 Release `dist/` 或 Chrome MV3 候选、三环境/构建/测试/`release:inspect` 证据、批准场景、smoke 与 E2E 策略解析和失败回流；浏览器步骤只有被策略选择或硬要求启用时才运行。
9. `parallel_worktree_subagents: enabled` 只表示至少两个无重叠写入范围且基线干净时可调用 `$web-run-parallel-worktrees`；否则单 Agent，不重复询问。
10. 按仓库命名规则创建或更新当天 Work Plan。只在重要阻断、交接或用户要求时同步 Status；计划本身不触发 Product Spec、ADR、Verification 或 Changelog。

## 质量规则

- 使用仓库真实文件、脚本和产物位置，不编造 API、权限、命令或依赖。
- 不把当前单 package 改成 workspace，不规划另一项目类型或类型切换。
- 优先最短完整场景，拒绝空批次、占位实现和只有截图没有行为证据的 Todo。
- 标准路径不能宣称里程碑或发布就绪；里程碑候选不能是开发服务器、mock 或脚手架。
- 工具/依赖升级 Todo 按稳定 SemVer（`x.y.z`）最低版本验收，prerelease 不作为兼容基线；候选版本、提交、lock/hash、Schema/协议版本、manifest_version 与 projectType 等事实仍精确绑定。

## 完成输出

报告路径、范围、Todo、所有权、入口到测试映射、并行判断、里程碑门禁、阻断项和下一项可执行 Todo。
