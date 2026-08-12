# 2026-08-12 Chinese Comment Gate Work Plan

## 目标与路径

- 路径：里程碑。变更同时修改源 Harness 静态门禁、初始化生成契约、Web/Extension 两类终端下游和 Release 候选准入。
- 目标：建立 AST 级严格中文注释门禁，使人工维护及 Harness 生成的 TypeScript/TSX 中，interface 与成员、class 与字段/方法、所有函数形态、所有变量声明（含函数内局部变量）都有紧邻的中文注释；生成后继续由下游门禁阻止无注释代码进入完整交付链。
- 基线：任务开始时 Git 工作树干净，分支为 `master`；既有 Work Plan 均已完成，本计划不重开或改写其历史结论。

## 范围

- 范围内：源 Harness 与终端下游的 `.ts`/`.tsx`；维护型 `.d.ts`；interface declaration 及其 property/method/call/index/construct signature；class declaration/expression 及其 property/method/accessor/constructor；function declaration/expression、arrow function、对象方法与匿名回调；所有作用域的 `const`/`let`/`var` 声明及 `for` 初始化绑定。
- 注释判定：目标节点必须拥有紧邻的行注释、块注释或 JSDoc，且注释至少包含一个汉字；文件头、隔空注释、字符串中的中文和关联到其他节点的注释均不能代替当前声明。一个变量声明拥有的函数初始化器允许由同一条注释同时说明变量与函数职责。
- 精确排除：`src/routeTree.gen.ts`、`.plasmo/**`、`build/**`、`dist/**`、`coverage/**`、`node_modules/**` 等第三方或构建生成且禁止手工维护的文件；不按宽泛 `*.gen.ts` 排除。import 绑定、函数参数、catch 绑定、type alias 与 enum member 不在本次用户列举的声明类别内。
- 范围外：改变业务行为、UI、运行时配置、Extension 权限、项目类型、品牌事实、依赖技术栈、版本、提交、推送、上传或发布。
- 并行判断：只读映射已并行完成；扫描器、初始化接线、模板输出、脚本契约与测试存在直接依赖，且机械注释迁移会触及同一批文件，写入由主 Agent 串行完成，不创建 Worktree。

## Todo

| ID         | 状态 | 可观察结果与所有权                                                                                                                                                | 依赖       | 风险与验证                                                                                                 |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| COMMENT-01 | done | 完成现有 lint/validator、Web/Extension 生成链、终端化清理、长期文档和真实候选命令的只读映射，并固定 AST 类别、注释关联与精确排除范围                              | 无         | 三路独立审计交叉核对；确认 `src/routeTree.gen.ts` 不能纳入人工门禁；未修改运行时或权限                     |
| COMMENT-02 | done | 新增可复用 TypeScript AST 注释策略模块；接入根 `pnpm lint`/`pnpm validate:harness` 与下游 `pnpm lint`/`pnpm harness validate`，并锁定脚本、策略模块和精确排除契约 | COMMENT-01 | AST 正负矩阵、根/下游接线漂移回归和真实根扫描通过；未新增第三方依赖                                        |
| COMMENT-03 | done | 机械迁移当前 Harness TS/TSX，并在初始化及品牌刷新生成链中确定性补齐模板产出的中文声明注释；同步工程规则、根 Agent 摘要、模板契约和下游治理摘要                    | COMMENT-02 | 注释迁移后格式、lint、类型、测试与 Harness validator 通过；未改变运行时、权限或项目类型                    |
| COMMENT-04 | done | 补齐声明矩阵、注释关联、精确排除、根门禁漂移、两宿主生成、删除注释失败及 staging 原子性回归                                                                       | COMMENT-03 | 根 7 个测试文件共 84 项通过；两宿主删注释失败、尾注释借用、接线文本伪装及 staging 失败零落盘均有非空回归   |
| COMMENT-05 | done | 完成根全量门禁，并从当前源码在源外真实实例化 Web/Extension，分别验证三环境、Harness、格式、lint、类型、非空测试、三 profile/Release 构建与产物检查                | COMMENT-04 | Extension 另通过 `pnpm package`；已绑定源码脏状态、lockfile 与候选哈希；浏览器步骤按策略未选，不用预览替代 |

## 入口到实现与测试映射

| 用户或 Agent 入口                          | 实现模块                                                                                         | 证据                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 根 `pnpm lint`                             | `package.json` 链接 `.harness/tooling/comment-policy.ts` 的 AST 扫描                             | 专用规则测试覆盖所有声明类别、中文识别、英文/隔空失败与精确排除；根源码实际扫描                  |
| 根 `pnpm validate:harness`                 | `scripts/validate-harness.ts` 锁定策略文件、脚本契约并执行扫描                                   | `tests/harness-validator.test.ts` 删除注释、策略接线或脚本后失败                                 |
| `pnpm instantiate -- ... --type web`       | `.harness/tooling/init.ts` 对生成及终端化后的维护源码补齐确定性注释，再由 `validateProject` 检查 | `tests/harness-tooling.test.ts` 扫描全部 Web 输出；删注释后 `pnpm harness validate` 对应实现拒绝 |
| `pnpm instantiate -- ... --type extension` | 同一生成/校验链覆盖 Extension 输出                                                               | Extension 输出全量扫描；精确排除 `.plasmo/**`，维护型 `src/plasmo.d.ts` 仍纳入                   |
| 下游 `pnpm lint` / `pnpm harness validate` | 终端保留的策略模块、manifest 脚本与 validator                                                    | 双宿主真实实例化后两道门禁均通过；新增无中文声明的负例失败                                       |
| `pnpm harness brand refresh`               | 终端品牌写入链通过同一注释生成逻辑刷新 `src/brand.ts`                                            | 品牌刷新回归后再次执行中文注释扫描与项目校验                                                     |

## 里程碑验收门禁

1. COMMENT-01..05 全部 `done`，差异只包含本计划范围且不覆盖其他 Agent 或用户修改。
2. 根 Harness 的 `git diff --check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、非空 `pnpm test` 与 `pnpm validate:harness` 全部通过。
3. 从本次源码在源外分别真实实例化 Web 与 Extension；两者保留策略模块与脚本门禁、不含另一宿主或源专用创建入口，且项目源码零注释违规。
4. 两种下游分别通过 `pnpm env:validate`、`pnpm harness validate`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、development/test/release 构建、`pnpm build` 与 `pnpm release:inspect`；Extension 另通过 `pnpm package`。
5. 记录源码提交/脏状态、Harness 版本、lockfile、Web `dist/`、Extension MV3 目录与 zip 的哈希。`milestone_smoke: optional` 依据运行时增量风险选择；`milestone_e2e: disabled` 默认 `Not run`，未选择时 Chrome 为 `not-required/not-probed`。
6. 本任务不授权 commit、push、tag、部署、商店上传或发布；未提交源码的候选绑定结论最多为 `Awaiting human review`。

## 当前状态

- COMMENT-01..05 全部完成；两类候选均从最终修复后的源码重新创建，没有复用首次失败的 target 或 sibling staging。
- Node.js `26.7.0`、pnpm `10.33.3` 已通过 `$web-check-development-environment`；根 `git diff --check`、`format:check`、`lint`、`typecheck`、7 个测试文件 84 项测试与 `validate:harness`（13 Skills、142 个本地链接）全部通过。
- 策略解析：本次只改变静态治理、初始化注释生成和 Skill 发现契约，没有新增浏览器运行时行为；`milestone_smoke: optional` 记为 `not-selected`，`milestone_e2e: disabled` 记为 `not-selected`，Chrome 为 `not-required/not-probed`。
- 最终结论：`Awaiting human review`。固定门禁均通过；结论仅受源 Harness 未提交脏状态与两个下游 unborn Git 仓库约束，本任务没有 commit、tag、push 或发布授权。

## 验证结果

- 源绑定：HEAD `7c3ef338ed4dff75348a14411cad0541052769d5`，版本 `202608121047`（Unreleased），工作区为本任务未提交脏状态；候选输入 seed tree 85 个文件的 SHA-256 为 `8ef2d44669366810cfde70f029665474b23018de923f96b941e9775645acfdef`，根 `package.json` 为 `60e401ad9f7d901d71c5d1329400709339d544d25f17e467fe8febd02199d5ba`，根 lockfile 为 `247dc05d3f84b1b324e0f91951551d1a5c62b35a26f74837bfa3e91eb51c4707`。本节所在 `docs/work_plan/` 不属于实例化 seed。
- Web 候选：`/tmp/bifang-comment-gate-web-YVczV3/comment-gate-web`。完整 instantiate 与目标内环境、Harness、格式、lint/独立注释、类型、59 项测试、development/test/release/默认构建及 Release 扫描全部通过；6 个 `dist` 文件的稳定树哈希为 `95941230a8094489e898761569e0ba543d0b2e0b236855c30066f8dd39b4e2e2`，102 个可跟踪源码文件为 `1c3272f3e14c3bccc50c1fe7a8deae57be31b0ae5d6f935f9ec5505885ed6021`。
- Extension 候选：`/tmp/bifang-comment-gate-extension-MDkYpo/comment-gate-extension`。同套门禁、59 项测试与 `pnpm package` 全部通过；11 个 MV3 构建文件的稳定树哈希为 `0926dac11ce30d0dad47fb4197cf2aaf72102da85d4627dc7db6c2af907d3764`，zip `build/chrome-mv3-prod.zip` 为 435577 bytes、SHA-256 `89f9ef78b3a4b4d7a15b53a017dff9d3cc61a0bacfd6fb30c44f56caeea20fb2`，zip 与目录逐文件 11/11 一致；候选源码树为 `846828d81fcac6d3efed7fd6758bb0fc9de90e9da6763a460552bfdcdd2dbb50`。
- 两个终端仓库都只有一个 scalar `projectType`，恰好保留 12 个 `web-*` 维护 Skills，不含创建 Skill、旧 canonical 目录或内部 init/instantiate tooling；注释门禁均通过。Web 仅精确排除 `src/routeTree.gen.ts`，Extension 排除 `.plasmo/**` 但继续扫描 `src/plasmo.d.ts`。
- Chrome smoke 与 E2E 均为 `Not run`；依据策略未选择，不构成静态候选失败。真实浏览器运行时、其他浏览器兼容性与商店渠道状态保持 `Unverified`。
