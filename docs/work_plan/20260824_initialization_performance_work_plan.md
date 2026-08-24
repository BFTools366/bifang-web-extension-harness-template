# 2026-08-24 初始化性能精简 Work Plan

## 目标与路径

- 路径：里程碑。初始化命令、成功语义与生成下游契约会变化，必须同时验证 Web 与 Extension 两种互斥输出。
- 目标：让 `pnpm instantiate` 只承担安全生成、一次依赖安装与独立 Git 根建立，不再在创建期重复格式化并执行完整 Release 构建；把最终候选门禁留给后续显式 `pnpm build`。Node.js、pnpm 与 Chrome 工具链探测只在项目初始化或已经观察到疑似环境错误时触发，不因普通开发、新会话或最终构建而预探测。
- 基线：分支 `master`，提交 `bc9673cf9c0c8b45496b2ff77cc640a77d7b926f`，计划创建前工作区干净。当前创建期固定执行 `pnpm install --no-frozen-lockfile`、全仓 `pnpm format` 与 `pnpm build`；后者再次执行环境配置、Harness、格式、lint、类型、全量测试、宿主生产构建和 `release:inspect`，并把 E2E 选择提前耦合到初始化命令。
- 当前环境证据：Node.js `26.7.0`、pnpm `10.33.3` 满足根 manifest 下界，Git `2.50.1` 可用；Chrome 不属于本次初始化实现门禁，保持 `not-required/not-probed`。

## 范围

- 范围内：初始化后置命令编排、`instantiate` 参数与帮助、Logo 单次预处理、失败原子性、初始化/Release 职责分离、环境检查 Skill 触发条件、生成下游治理文档和相关回归测试。
- 范围外：依赖版本、Web/Extension 技术栈、三份 `.env*` 的运行时校验、安全/权限边界、业务源码、最终 `pnpm build` 的完整 Release 门禁、自动安装未授权工具、提交、push、tag、上传或发布。
- 性能原则：删除重复工作优先于新增缓存或并行复杂度；依赖仍安装一次，运行时环境配置仍在初始化结构校验和后续 Release 构建中验证。`--skip-install`/`--skip-git` 继续只服务受控测试。
- 并行判断：用户未要求并行；初始化实现、参数、测试和文档高度耦合，由单 Agent 顺序完成。

## Todo

| ID      | 状态        | 可观察结果与所有权                                                                                                                                                                                                                               | 依赖        | 风险与验证                                                                                                                          |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| INIT-01 | done        | `.harness/tooling/init.ts`、`instantiate.ts`、`types.ts`、`cli.ts` 与 `scripts/instantiate.ts` 明确新的创建期命令链；隔离样本确认 22 个格式差异均来自本次生成/改写文件，改为发布 staging 前按路径格式化，不再安装后扫描整仓                      | 无          | 优化后隔离输出通过全项目 Prettier 检查；无安装样本从基线约 `1.34s` 变为含内置定向格式化约 `1.73s`，替代的整仓格式进程单独约 `0.96s` |
| INIT-02 | done        | 默认创建期只执行一次依赖安装并建立 Git 根，不执行 `pnpm format`、`pnpm build` 或 E2E 决策；上传/生成 Logo 只压缩一次；安装或 Git 失败仍清理 staging 且不发布半成品目标                                                                           | INIT-01     | 65 个定向测试已覆盖 Web/Extension 命令计划、旧 `--e2e` 拒绝、安装失败短路、目标/空目标原子恢复、Logo 预处理与输出格式稳定性         |
| INIT-03 | done        | `.agents/skills/web-{check-development-environment,implement-change,verify-delivery,instantiate-project}/`、`AGENTS.md` 与生成下游 Agent 文档统一为“初始化或已观察到疑似环境错误才检查”；缺失/不兼容时仍须取得授权后安装，Release 构建不做预探测 | INIT-02     | 静态契约和生成下游测试已区分工具链探测与 `.env*` 运行配置校验；未弱化 E2E Chrome、SemVer 或外部安装授权                             |
| INIT-04 | done        | `README.md`、`docs/{ENGINEERING_RULES,TS_WEB_TEMPLATE,RUNTIME_CONFIGURATION,RELEASE,HARNESS_ENGINEERING}.md` 与生成下游文档说明初始化成功只代表工程基线可用，Release 候选由后续显式构建产生；测试锁定源/下游契约                                 | INIT-02..03 | 格式、lint/中文注释、typecheck、98 个全量测试与 `pnpm validate:harness` 已通过                                                      |
| INIT-05 | in_progress | 从最终源码在源外隔离目录分别真实实例化 Web 与 Extension，记录创建耗时与命令输出；两者保持独立 Git 根、唯一 `projectType`、无创建入口且初始化期无 Release 产物；随后按当次用户 E2E 选择显式构建精确 Release 候选完成里程碑验收                    | INIT-01..04 | 双类型真实创建已通过；热 pnpm store 下非交互 Web `4.60s`、Extension `7.29s`。正等待当次 `enabled`/`disabled` E2E 选择后显式构建候选 |

## 入口到实现与测试映射

| 用户入口或事件                                    | 实现模块                                                                                        | 计划证据                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm instantiate -- <target> ...`                | `scripts/instantiate.ts` → `.harness/tooling/instantiate.ts` → `init.ts`                        | CLI 参数、后置命令计划、Web/Extension 隔离真实创建与原子性测试                                |
| 初始化中的依赖安装                                | `.harness/tooling/init.ts` 与 `.harness/tooling/process.ts`                                     | 只出现一次 install；没有 format/build/E2E；失败后目标和 staging 状态精确断言                  |
| 上传或确定性生成 Logo                             | `.harness/tooling/instantiate.ts`、`init.ts`、`logo.ts`                                         | 预处理结果复用，母版及当前宿主派生资产字节/尺寸回归                                           |
| 初始化或实际命令报出疑似 Node.js/pnpm/Chrome 错误 | `$web-check-development-environment` 及 `$web-implement-change`/`$web-verify-delivery` 调用边界 | Skill/下游治理静态断言；普通测试、lint、typecheck、构建不再把预探测列为前置                   |
| `pnpm build -- --e2e=<selection>`                 | 生成下游 `.harness/tooling/build.ts` 与 `package.json`                                          | 现有构建工具测试及两类真实候选证明三环境、Harness、格式、lint、类型、全量测试和扫描门禁仍完整 |

## 里程碑准入

1. INIT-01..05 全部 `done`，工作区差异只包含本计划范围，源 Harness 的定向与全量门禁通过。
2. 默认 `instantiate` 不接受或请求 E2E，不运行 Release 构建，不生成 `dist/`、`build/` 或 zip；安装、Git 和原子发布仍成功，任何失败不留下半成品目标或 sibling staging。
3. Web 与 Extension 隔离下游各自只有一个 `projectType`、三份合法运行配置、独立 unborn `main` Git 根与终端维护 Skills，且没有 `instantiate`、内部 init tooling 或第二宿主入口。
4. 工具链环境探测只由初始化或实际环境故障触发；Chrome 只在真实浏览器动作因缺失/不兼容需要诊断时探测。Node/pnpm/Chrome 安装或升级仍需独立授权。
5. 后续显式 Release 构建仍运行完整固定门禁；当次 E2E 选择、候选版本/hash、已运行与未验证范围只在本任务交付中报告，不执行提交、push、tag、上传或发布。
