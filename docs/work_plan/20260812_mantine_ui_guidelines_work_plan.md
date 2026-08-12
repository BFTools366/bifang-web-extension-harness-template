# 2026-08-12 Mantine UI Guidelines Work Plan

## 目标与路径

- 路径：里程碑。用户请求本身是设计规范；确认规范必须进入未来 Web/Extension 下游后，变更触及初始化输出契约，因此升级为里程碑。
- 目标：建立一份 Mantine UI 设计规范作为长期事实源，并让新生成的单类型下游自动获得仅适用于当前宿主的规范、Agent 读取入口和缺失文件门禁，使颜色、排版、间距、布局、状态、响应式、无障碍与国际化决策尽量一致。
- 基线：当前工作区包含两组已完成但未提交的 Harness 里程碑修改。本计划只增量整合，不重置、覆盖或追认其历史候选。

## 范围

- 范围内：源 Harness 的 Mantine UI 规范、文档索引与 Agent 路由；下游规范派生、终端 Agent 读取入口、项目校验；Web/Extension 生成回归和源 Harness 静态门禁。
- 范围外：直接改版 Landing/Popup/Options、引入第二套样式系统、安装 `@mantine/form`/`@mantine/notifications`、正式启用暗色主题、改变品牌事实源、Extension 权限、提交、推送、上传或发布。
- 兼容边界：规范以当前模板声明的 Mantine `9.5.1` 和既有 `createTheme`/`MantineProvider` 基线为依据；未来升级 Mantine 时必须重新核对 API。Web 与 Extension 共享规则但不共享运行时代码。
- 并行判断：只读的接入点审计、Mantine API 核实和设计规范评审可并行；源文档、生成模板、校验器和测试存在直接依赖且工作区已脏，最终写入由主 Agent 串行整合，不创建 Worktree。

## Todo

| ID    | 状态 | 可观察结果与所有权                                                                                                                                                            | 依赖  | 风险与验证                                                                                     |
| ----- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| UI-01 | done | 只读审计当前 Mantine 版本、theme 模板、下游文档生成/终端化链路、校验器、测试和受保护工作区差异；并核实 Mantine 官方主题机制                                                   | 无    | 三路独立审计；Node.js/pnpm 环境满足声明下界；未修改运行时或权限                                |
| UI-02 | done | 新增 `docs/MANTINE_UI_GUIDELINES.md` 唯一详细规范，并在 `AGENTS.md`、`docs/README.md`、`docs/ENGINEERING_RULES.md`、`docs/TS_WEB_TEMPLATE.md` 和公开索引接入读取路由          | UI-01 | 规范区分硬规则/默认规则；不臆造未安装依赖；Markdown 链接、格式和 Harness 内容校验通过          |
| UI-03 | done | `.harness/tooling/templates/downstream-docs.ts` 与 `finalize.ts` 从规范事实源派生当前宿主文档；终端 `AGENTS.md` 要求 UI 任务读取；`.harness/tooling/validate.ts` 拒绝缺失规范 | UI-02 | 共同段落已改为宿主中立，theme 路径、Popup/Options、MV3 与站点路由规则只位于对应宿主章节        |
| UI-04 | done | `scripts/validate-harness.ts`、`tests/harness-tooling.test.ts` 与 `tests/harness-validator.test.ts` 锁定源规范、下游传播、宿主裁剪和缺失文件失败路径                          | UI-03 | 已补另一宿主术语/路径不得泄漏的回归；格式、lint、typecheck、54 项测试和 Harness validator 通过 |
| UI-05 | done | 建立 `$verify-delivery` 准入：实现 Todo 全部完成，根门禁通过，源状态可绑定，并明确要求生成 Web/Extension 两个独立 Release 候选                                                | UI-04 | 首轮候选已拒绝；修订后从当前源码重新生成、构建、打包和审计两个候选                             |

## 入口到实现与测试映射

| 用户或 Agent 入口                          | 实现模块                                                                                | 证据                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 在源 Harness 设计或修改 Mantine UI         | `docs/MANTINE_UI_GUIDELINES.md` + 根 `AGENTS.md`/文档索引                               | Harness validator 要求规范存在且本地链接有效                            |
| `pnpm instantiate -- ... --type web`       | `prepareDownstreamFinalization` 读取规范，生成 Web 专属 `docs/MANTINE_UI_GUIDELINES.md` | Web 生成回归断言共同规则与 Web 章节存在、Extension 专属章节不存在       |
| `pnpm instantiate -- ... --type extension` | 同一生成器生成 Extension 专属规范                                                       | Extension 生成回归断言共同规则与 Extension 章节存在、Web 专属章节不存在 |
| 下游 Agent 实施页面、组件或交互变化        | 终端 `AGENTS.md` 最小读取路由 + `docs/ENGINEERING_RULES.md` 摘要指向详细规范            | 生成回归断言 Agent 指令、工程规则和 `docs/README.md` 均能定位规范       |
| `pnpm harness validate`                    | `.harness/tooling/validate.ts` 将规范列为终端项目必备长期事实                           | 生成项目删除规范文件后校验失败；正常 Web/Extension 项目校验通过         |

## 里程碑验收门禁

1. UI-01..05 全部 `done`，差异只新增本计划范围并保留既有用户修改。
2. 根 Harness 的 `git diff --check`、格式、lint、typecheck、非空测试和 `pnpm validate:harness` 通过。
3. Web 与 Extension 都从本次源码在源外独立生成，终端文档只保留当前宿主规范，且 `pnpm harness validate` 把该规范作为必备文件。
4. 两种下游完成三环境校验、格式、lint、typecheck、非空测试、Release 构建与 `release:inspect`；Extension 另完成 `pnpm package`。
5. `milestone_smoke: optional` 由 `$verify-delivery` 根据本次是否改变运行时与候选价值决定；`milestone_e2e: disabled` 默认 `Not run`，硬要求仍可覆盖。未选择浏览器步骤时记录 `not-required/not-probed` 和 `Unverified`。
6. 本任务不授权 commit、push、tag、部署、商店上传或发布。

## 当前状态

- 环境：Node.js `26.7.0` 满足 `>=22.22.2`；pnpm `10.33.3` 满足 `>=10.33.3` 且等于精确 `packageManager` pin；Chrome 当前 `not-required/not-probed`。
- Git：顶层目录等于项目根，分支 `master`，基线提交 `edd916c9f88daab15bebd40391a74348a7556fdf`；任务开始时存在受保护的未提交 Harness 修改。
- Mantine：模板声明 `@mantine/core`/`@mantine/hooks` `9.5.1`；Web 与 Extension 均使用根级 `MantineProvider` 与 `createTheme`，但当前请求不直接改变运行时主题或页面视觉。
- 首轮验收回流：`/tmp/bifang-mantine-ui-final.3EDgZV` 的两个候选虽通过静态门禁与构建，但共同段落仍包含另一宿主措辞，结论为 `Milestone rejected`；该批次不得作为最终候选，UI-03..05 已重新打开。
- 修复与回归：共同段落已改为宿主中立；Web 对 `Popup`、`Options`、`src/providers.tsx`、`MV3/CSP` 零命中，Extension 对 `Landing`、`404`、`src/app/theme.ts`、`AppShell`、`TanStack Router` 零命中。两个独立只读复审均确认先前阻断已解除。
- 源 Harness 门禁：`git diff --check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（6 个文件、54 项）与 `pnpm validate:harness`（13 Skills、136 条本地链接）通过。生成时源码绑定为基线提交 `edd916c9f88daab15bebd40391a74348a7556fdf`、tracked diff SHA-256 `d4c58d1fe96e70d18f3a143e5605bd5dce68ea9bd36ccbdfaf36c42696fd505e` 和 untracked input SHA-256 `0f2df11ea8bae6eefd117503bdc7c8410c114637ff562d58d086f22b62e50adc`；Harness 版本 `202608101512`，状态 `Unreleased`。
- Web 最终候选：`/tmp/bifang-mantine-ui-accepted.b63wGB/mantine-guidelines-web`；独立 Git 根、`projectType=web`、无创建入口或 Extension 专属规范；三环境校验、Harness 校验、格式、lint、typecheck、43 项测试及 development/test/release 构建通过，`release:inspect` 通过。`pnpm-lock.yaml` SHA-256 `e38f3e573884c1a8bd4d9be4e79cce8ce61dc6b128428467e22b3db064135e3f`；最终 `dist/` 6 个文件，聚合 SHA-256 `bfdb271a21c490c1c9470e16276468476eb014df2ccfc3fe93f9068c1b5ae4ff`。
- Extension 最终候选：`/tmp/bifang-mantine-ui-accepted.b63wGB/mantine-guidelines-extension`；独立 Git 根、`projectType=extension`、无创建入口、Web Router 或预置权限；三环境校验、Harness 校验、格式、lint、typecheck、43 项测试、development/test/release 构建及 `pnpm package` 通过，两次 `release:inspect` 通过。`pnpm-lock.yaml` SHA-256 `58705e79746d5ae92d5da89a4a6b01da6528012a4e13ed18502dd7a991347f58`；MV3 目录 11 个文件，聚合 SHA-256 `ce42488341c00c6c5965cbaf734a55a0c76f22b8205760c1c367e9cfa27f2631`；zip SHA-256 `9f560d9669d7ea836c7dc4dffda6f337bf510e9580c6c9ea3e6c36f2e0e9abf9`。
- 浏览器策略：本次只新增规范、生成/校验契约与测试，不改变页面、扩展运行时或权限；`milestone_smoke: optional` 判定为 `not-selected`，`milestone_e2e: disabled` 为 `Not run`。Chrome 为 `not-required/not-probed`；真实读屏、浏览器视觉、其他操作系统与分发渠道均为 `Unverified`。
- Verification：`Awaiting human review`。实现与真实生成门禁完成，但源码仍是基线提交加受保护的未提交差异，本任务未授权 commit，不能绑定为新的精确提交。未执行 commit、push、tag、部署、上传或发布。
