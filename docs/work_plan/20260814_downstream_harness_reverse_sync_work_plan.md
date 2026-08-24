# 下游 Harness 反向同步计划

## 目标与边界

本里程碑以终端项目 **毕方AI用量看板** 的已验证提交 `96e629c` 为经验来源，把可复用的 Harness 工作流契约反向合并到上游 **Bifang Web Harness Template**。本次只改变工程治理、生成脚本、维护 Skills、终端校验与相关测试，不改变支持的 `web|extension` 两种互斥类型、技术栈、品牌算法、权限、依赖版本或业务能力。

- 日常实现使用受影响检查与 `pnpm test:related <changed-source...>`；空相关批次不能作为通过证据。
- 行为保持重构运行全量测试；所有最终产物只从逻辑 Release 入口生成。
- 标准任务默认不创建持久计划、不启用并行 Worktree、smoke 或 E2E；用户或产品、安全、渠道硬要求仍可显式启用附加流程。
- 新生成终端项目对人工维护 TypeScript/TSX 采用 500 行复核、1000 行强制拆分门禁；源 Harness 暂保留既有 2000 行受管文本硬门禁，避免把三个既有超千行生成器/测试文件的结构重构混入本次反向同步。

范围外：不导入下游项目身份、Logo、API/CORS 事实、产品源码、验证记录或历史；不修改许可证、`Version.md`、旧 Work Plan，不提交、推送、打标签或发布。

## 所有权分类

| 分类        | 路径                                                                                                                                                                                                 | 处理                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `managed`   | `.agents/skills/web-{check-development-environment,extract-i18n-strings,implement-change,plan-change,prepare-release,refactor-code,run-parallel-worktrees,upgrade-harness,verify-delivery}/SKILL.md` | 合并可复用 SOP、测试、构建与体积规则                    |
| `managed`   | `.harness/tooling/{manifest,validate,init,source-size-policy}.ts`、`.harness/tooling/templates/downstream-docs.ts`                                                                                   | 让终端脚本、校验和生成文档与新契约一致                  |
| `managed`   | `scripts/validate-harness.ts`、相关 `tests/**`                                                                                                                                                       | 锁定策略字段、生成输出、Release-only 脚本与源码体积边界 |
| `mixed`     | `AGENTS.md`、`README.md`、`docs/{AGENT_POLICY,ENGINEERING_RULES,HARNESS_ENGINEERING,RELEASE,RUNTIME_CONFIGURATION,TS_WEB_TEMPLATE}.md`、`.harness/tooling/finalize.ts`                               | 保留上游身份与双模板职责，只合并通用规则                |
| `protected` | 下游产品源码、`.harness/project.json`、品牌、`docs/DATA_ACCESS.md` 产品段落、changelog/verification；上游 License、`Version.md` 与既有 Work Plan                                                     | 不复制、不覆盖、不重写历史                              |

## Todo

| ID  | 状态 | 可观察结果                                                                                            | 文件/模块所有权                                                              | 依赖    | 验证                                                                                                       |
| --- | ---- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| T01 | done | 上游长期文档与 9 个维护 Skills 统一采用精简 SOP、相关测试、唯一 Release 与显式浏览器硬要求            | `AGENTS.md`、`README.md`、上述 `docs/**`、上述 `.agents/skills/**`、文档模板 | 无      | Markdown 格式、链接与冲突文案静态搜索                                                                      |
| T02 | done | Web/Extension 新下游只生成 Release 产物入口，终端校验拒绝额外 `build:*`，并执行 500/1000 源码体积门禁 | `.harness/tooling/**`、`scripts/validate-harness.ts`                         | T01     | 相关 Vitest、lint、typecheck、`pnpm validate:harness`                                                      |
| T03 | done | 测试锁定 Web/Extension manifest、策略字段、文档派生、体积边界与初始化后单一构建链                     | `tests/**`                                                                   | T02     | 相关测试非空；完整根测试                                                                                   |
| T04 | done | 源 Harness 和两个源外隔离下游通过精确门禁；每个下游只生成自身 Release 候选                            | 本计划与里程碑证据                                                           | T01–T03 | `pnpm validate:harness`、根级门禁、非交互实例化 Web/Extension、下游 `pnpm build`，Extension `pnpm package` |

## 行为与验证映射

| 用户入口                    | 实现                                                                                                              | 测试/验收                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 日常终端项目变更            | `test:related` 与维护 Skills                                                                                      | manifest/文档派生断言、空批次规则静态核对       |
| `pnpm build`                | `build` 固定委托 `build:release`，后者拥有环境、Harness、格式、lint、类型、全量测试、生产构建与 `release:inspect` | Web/Extension 初始化测试与真实源外 Release 构建 |
| `pnpm package`（Extension） | 同一 Release profile 的完整门禁与 zip                                                                             | 真实 Extension 目录、zip 和 `release:inspect`   |
| `pnpm lint`（终端项目）     | ESLint、中文注释和 `source-size:check`                                                                            | 500/501/999/1000 行边界及生成目录排除测试       |
| Agent 执行                  | Agent Policy 与 9 个 Skills                                                                                       | Harness validator、生成下游治理文档断言         |

## 并行与浏览器

- 上游基线 `8fc77f8` 与下游来源 `96e629c` 均已验证为干净 Git 根。当前任务未要求并行，且文档、生成器与测试存在串行依赖，因此单 Agent 实施。
- 本次不改变生成 UI、权限或浏览器业务行为；smoke/E2E 没有用户、产品、安全或渠道硬要求，计划为 `not-required/not-probed`。真实 Web/Extension Release 构建仍是固定门禁。

## 完成条件

全部 Todo 为 `done`；上游差异只包含批准路径；根 Harness 校验、格式、lint、typecheck、全量测试通过；两个源外新下游均无创建入口和 development/test 构建脚本，且精确 Release 候选通过各自自动门禁。任何失败都回到 T01–T03 修复后重跑受影响闭环。

## 验证证据

验证绑定上游基线 `8fc77f8` 与当前未提交工作树差异；本里程碑没有提交、推送、打标签或发布。

### 源 Harness

- `pnpm format:check`：通过。
- `pnpm lint`：通过，含 ESLint 与中文注释策略。
- `pnpm typecheck`：通过。
- `pnpm validate:harness`：通过，识别 13 个 Skills 与 140 个本地链接。
- `pnpm test`：8 个测试文件、90 项测试全部通过。
- `git diff --check`：通过。

### Web 终端候选

- 隔离路径：`/tmp/bifang-harness-reverse-sync.pSUW2n/reverse-sync-web`（验收后已清理）。
- 非交互实例化自动执行唯一 `pnpm build -> build:release`；环境、Harness、格式、lint、类型、11 个测试文件共 62 项测试、Vite production build 与 `release:inspect` 全部通过。
- `dist` 包含 6 个文件；按文件哈希排序后的聚合 SHA-256 为 `8bd2b4ba4007ccd12199949d8608d7315da5cb2fca83626d235b2057f97ff50b`。
- `projectType=web`；无 `build:development`、`build:test`、`validate:harness`、`harness:init` 或 `pnpm instantiate` 残留。

### Extension 终端候选

- 隔离路径：`/tmp/bifang-harness-reverse-sync.pSUW2n/reverse-sync-extension`（验收后已清理）。npm 官方 registry 两次长时间无进展后，仅对候选安装改用镜像 registry；未修改仓库配置，pnpm 完整性校验仍生效。
- 非交互实例化自动执行唯一 `pnpm build -> build:release`；环境、Harness、格式、lint、类型、11 个测试文件共 62 项测试、Plasmo production build 与 `release:inspect` 全部通过。
- `pnpm package` 再次通过同一完整 Release 门禁并生成 `build/chrome-mv3-prod.zip`；zip 大小 427 KiB，SHA-256 为 `9c7ede3a0c7e476fecb2e2cc655737c8d3dec6ff484da9494c75be7c49601bf6`。解包目录 11 个文件，按文件哈希排序后的聚合 SHA-256 为 `52548c7e47665cff9fb53d0a95eae9a0dcd3613a66acae1f2a23225cabc825df`。
- `projectType=extension`；无 `build:development`、`build:test`、`validate:harness`、`harness:init` 或 `pnpm instantiate` 残留。

### 结论与非阻断项

- 里程碑验收通过；上游变更已准备好由负责人复核，但尚未形成提交或发布候选。
- 浏览器 smoke/E2E 为 `not-required/not-probed`：本次没有 UI、权限或浏览器行为变化，也没有用户、产品、安全或渠道硬要求。
- 生成终端的源码体积门禁按预期对 4 个 500–821 行既有文件给出复核提示，但没有文件达到 1000 行阻断阈值。
- Node `module.register()`、jsdom `localStorage`、Router 循环依赖提示以及 Plasmo 依赖 peer warning 均未影响门禁或产物检查；本次不升级依赖。
