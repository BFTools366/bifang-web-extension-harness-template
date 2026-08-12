# 2026-08-12 Release Work Plan

## 目标与路径

- 路径：里程碑。
- 目标：把当前工作区中用户已明确批准的全部 Harness 变更固化为版本 `202608121047`，对精确源码候选重新完成根门禁及 Web/Extension 两种源外下游验收，然后提交并推送当前 `master` 到 `origin/master`。
- 仓库：Harness 源；不存在 `.harness/project.json`，版本唯一事实来自根 `Version.md`。根 `package.json` 的私有包版本不作为 Harness 时间版本同步目标。
- 授权边界：用户已明确批准整个工作区并授权 commit/push；不创建 tag、PR、托管 Release、部署、商店上传或其他发布副作用。

## 范围与并行判断

- 范围内：现有全部 tracked/untracked 改动、Harness 时间版本、根级格式/lint/typecheck/非空测试/validator、源外 Web/Extension 真实实例化与 Release 构建/扫描、提交与推送。
- 范围外：新增功能、依赖升级、另一项目类型、标签、PR、上传、部署和渠道发布。
- 并行判断：工作区已包含相互关联的未提交里程碑变更，不满足写入型 Worktree 的干净基线门禁；只并行执行版本事实与差异风险的只读审计，所有写入、提交和推送由主 Agent 串行完成。
- 浏览器策略：本批次改变创建/终端化和治理文档，但不改变生成应用的 UI 运行时、权限或业务行为；`milestone_smoke: optional` 先按 `not-selected` 处理，`milestone_e2e: disabled` 为 `Not run`。若静态、生成或 Release 证据暴露运行时风险，则重新选择并执行真实候选浏览器检查。

## Todo

| ID     | 状态 | 可观察结果与所有权                                                                           | 依赖   | 风险与验证                                                                          |
| ------ | ---- | -------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| REL-01 | done | 只读确认 Git 顶层/分支/远端、完整工作区范围、版本事实源、环境约束和已有三个已完成里程碑计划  | 无     | 用户已批准整个工作区；Node/pnpm 兼容；Chrome 当前 `not-required/not-probed`         |
| REL-02 | done | `Version.md` 更新为上海时间版本 `202608121047`，本计划记录授权、范围、候选门禁和外部操作边界 | REL-01 | `git diff --check`、格式与链接/validator 必须通过；不改写历史计划中的旧候选证据     |
| REL-03 | done | 当前完整源码通过根 `format:check`、`lint`、`typecheck`、非空 `test` 与 `validate:harness`    | REL-02 | 任一失败回到 `$web-implement-change` 修复并重跑；根 Harness 不虚构应用 `build` 门禁 |

## 入口、实现与测试映射

| 入口                                                     | 实现/事实源                                      | 验证                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Harness 版本查询                                         | `Version.md`                                     | 时间格式静态复核、根 formatter 与 validator                                                                  |
| `pnpm harness init` / `pnpm harness:init`                | 已批准的 CLI、initializer、manifest 与终端化改动 | 根回归测试与 `pnpm validate:harness`；源内目标零写入                                                         |
| `pnpm instantiate -- <external-target> --type web`       | Harness 生成/终端化工具与 Web 模板               | 源外真实生成；下游三环境、Harness、格式、lint、typecheck、非空测试及三 profile/Release 构建                  |
| `pnpm instantiate -- <external-target> --type extension` | Harness 生成/终端化工具与 Extension 模板         | 源外真实生成；下游三环境、Harness、格式、lint、typecheck、非空测试、三 profile/Release 构建及 `pnpm package` |
| `git push origin master`                                 | 本次用户明确授权的精确提交                       | 推送前工作区清洁、提交后完整候选验收、远端引用核对                                                           |

## 里程碑门禁与执行顺序

1. REL-01..03 全部 `done`，整棵工作区差异已审阅且无敏感信息或未批准范围。
2. 将版本与所有批准改动提交为精确源码候选；不在提交后修改候选字节。
3. `$web-verify-delivery` 从该提交在源仓库之外重新生成 Web/Extension 两个独立下游，运行三环境、下游全门禁、三 profile Release 构建/扫描及 Extension 打包，并记录候选哈希。
4. `$web-prepare-release` 仅在验收结论为 `Milestone accepted` 且 HEAD/版本/lock/hash 一致时声明 `Ready`。
5. 仅在上述门禁通过后推送 `master` 到 `origin/master`；不创建 tag、PR、托管 Release 或部署。

## 当前状态

- 环境：Node.js `26.7.0` 满足 `>=22.22.2`；pnpm `10.33.3` 满足 `>=10.33.3` 且等于 `packageManager` pin；`pnpm-lock.yaml` SHA-256 为 `247dc05d3f84b1b324e0f91951551d1a5c62b35a26f74837bfa3e91eb51c4707`。
- Git：顶层等于项目根，分支 `master`，基线 `edd916c9f88daab15bebd40391a74348a7556fdf`，远端 `origin/master`；工作区全部变更已由用户明确批准。
- 外部工具：远端为自托管 HTTP Git 服务且本任务不创建 PR；GitHub 专用 `gh`/draft PR 流程不适用。
- 根门禁：首次 `format:check` 只发现本计划需要 Prettier；定向格式化后，`git diff --check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（6 个文件、54 项）与 `pnpm validate:harness`（13 Skills、136 条本地链接）全部通过。
- 候选：用户补充确认前端 Skill 的可见名称应与同级 Rust Harness 清晰区分；已将 `$web-verify-delivery` 的显示名、标题和默认提示明确为“验证前端项目交付”。该候选版本重新确定为 `202608121047`，需重新提交、完整验收并推送。
