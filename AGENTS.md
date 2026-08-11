# AGENTS.md

## 项目使命

本仓库是纯 TypeScript 的 Agent-first Harness。它只生成两类互斥的终端下游之一：纯 React Web 单包，或纯 Plasmo Chrome MV3 Extension 单包。每个下游仓库只有一个 `projectType`，不使用 monorepo、共享 core、`apps/`、`packages/` 或同仓库多宿主结构。

AI Agent 是工程规则的第一消费者；人类负责产品方向、关键取舍、外部副作用与最终发布授权。

## 按任务最少读取

1. 始终先读 [`README.md`](README.md) 与 [`docs/AGENT_POLICY.md`](docs/AGENT_POLICY.md)，检查工作区并保护已有修改。
2. 用一句话说明采用快速、标准或里程碑路径。用户可要求更严格路径；安全、权限、发布、不可逆操作或对外契约变化不得降级。
3. 修改代码、测试、文档或配置时读 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)。
4. 涉及初始化、项目类型、技术栈、Logo 或派生品牌资产时读 [`docs/TS_WEB_TEMPLATE.md`](docs/TS_WEB_TEMPLATE.md)；若当前工作区是已生成下游，再读取其 `.harness/project.json`。
5. 涉及环境文件、BaseURL、公开变量、构建 profile 或运行时配置时读 [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)；涉及日志、错误观测、脱敏或产物敏感信息扫描时读 [`docs/LOGGING.md`](docs/LOGGING.md)。
6. 涉及 REST/OpenAPI、GraphQL、SSE、认证重放、远端多基地址、多来源事件流或 RxJS 时读 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)。
7. 涉及版本、候选或发布时读 [`Version.md`](Version.md) 与 [`docs/RELEASE.md`](docs/RELEASE.md)；范围外已知问题写入 [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md)。
8. 只有需要理解治理方法时才读 [`docs/HARNESS_ENGINEERING.md`](docs/HARNESS_ENGINEERING.md)。

不要一次性加载所有文档或 Skills。只有任务触发某个 Skill 时，才完整读取对应 `SKILL.md`。

## 事实来源

| 事实                                            | 唯一来源                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| 项目名称、标识、描述、唯一 `projectType` 与品牌 | `.harness/project.json`                                                    |
| Logo 母版                                       | `.harness/brand/logo-1024.png`                                             |
| Web 派生品牌                                    | `public/logo.png`、`public/favicon.png`、根 `index.html` 与 Landing 页面   |
| Extension 派生品牌                              | `assets/icon.png`、`package.json` manifest、Popup 与 Options 页面          |
| TypeScript 项目类型与技术基线                   | [`docs/TS_WEB_TEMPLATE.md`](docs/TS_WEB_TEMPLATE.md)                       |
| development/test/release 运行时配置             | [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)           |
| 结构化日志、Release 裁剪与脱敏                  | [`docs/LOGGING.md`](docs/LOGGING.md)                                       |
| 数据访问、SSE 与可选 RxJS 事件流编排            | [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)                               |
| 文件、注释、文档、测试与例外                    | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)                   |
| Agent 执行偏好                                  | [`docs/AGENT_POLICY.md`](docs/AGENT_POLICY.md)                             |
| Harness 当前版本与发布状态                      | [`Version.md`](Version.md)                                                 |
| 发布门禁                                        | [`docs/RELEASE.md`](docs/RELEASE.md)                                       |
| 已知但未进入当前范围的问题                      | [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md)                                   |
| 商业许可                                        | [`LICENSE.zh-CN.md`](LICENSE.zh-CN.md) 与 [`LICENSE.en.md`](LICENSE.en.md) |

## 任务路径

### 快速路径

适用于范围清楚、局部、可逆、无安全/权限/发布风险的变更。直接实施，运行受影响的最小充分检查，不创建形式化持久计划。

### 标准路径

适用于多步骤、跨多个职责文件、需要交接或失败后需要恢复上下文的变更。先维护精简 Todo，再逐项实施和验证；不因“标准”自动运行真实浏览器 E2E。

### 里程碑路径

适用于初始化器契约变化、新增/移除 Harness 支持类型、权限或安全边界变化、发布候选、不可逆迁移，或用户明确要求完整验收的工作。当前 Todo 全部完成后，才对真实生成项目或最终构建执行适用的冒烟、E2E 与人工复核。

## 硬约束

- 非交互初始化必须显式提供 `--type web` 或 `--type extension`；交互式初始化必须在开始时提示二选一且不得提供默认类型。任何路径都不得接受 `both`、列表或两个类型。
- 每个下游是平铺 pnpm 单包，只拥有当前宿主所需组件、状态、品牌资产和测试。不得引入 workspace、`apps/`、`packages/`、共享 core 或另一宿主入口。
- 已生成仓库不得叠加或切换宿主。需要另一类型时创建独立仓库；Harness 未来新增支持类型也不回写成现有仓库的多目标能力。
- `.harness/project.json` 是身份、`projectType` 和品牌的事实源；禁止把派生页面、manifest 或图标反向当作权威配置。
- Logo 必须存在于 `.harness/brand/logo-1024.png`。初始化使用用户上传源或基于项目身份确定性生成，并且只同步当前类型的派生资产。
- Web 固定使用 Vite + React/TypeScript、Mantine、TanStack Router 文件路由与 route 级自动拆包、TanStack Query、Jotai 与 i18next；动态 `src/routeTree.gen.ts` 被 Git 忽略且不得手工固化。Extension 固定使用 Plasmo + Chrome MV3 + React/TypeScript、Mantine、TanStack Query、Jotai 与 i18next，不引入 TanStack Router。两种单包的代码不跨仓库共享。
- 浏览器扩展只申请真实功能所需的最小权限，不因脚手架方便预置高权限；不得使用远程托管可执行代码绕过 MV3/CSP。
- 用户可见文案进入 i18next；TanStack Query 管理远端/异步服务器状态，Jotai 管理局部跨组件客户端状态，不为简单组件状态制造全局 atom。
- RxJS 只在真实的多来源持续事件编排、复杂时序、取消或共享底层订阅需求出现时按需加入；它不替代 Query/Jotai 状态、持久事件日志或 Chrome 跨上下文消息，不为统一风格建立全局可写 Subject。
- 初始化器为两种宿主生成同一分页与原生 Fetch 基础契约，但不生成业务 endpoint：分页按项目与集合 scope 将 1-based `page`/受控 `pageSize` 写入 sessionStorage，只有当前请求成功且空页时从非第一页回退；请求动态处理 `X-Http-Request`、持久化语言的 `X-Lang`、响应提取的 `X-AUTH-TOKEN`、安全错误日志和 401 登录 handler。详细边界以 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md) 为准。
- Ky/OpenAPI、GraphQL、SSE 与 RxJS 等数据访问依赖只随真实功能加入；初始化器不生成占位请求或事件总线，也不为未来 endpoint 预置权限。Extension 跨执行上下文认证或远端访问必须另行设计消息/状态所有者并审批最小权限。
- 初始化必须收集 development、test、release 三个 BaseURL，并生成 `.env.development`、`.env.test` 与 `.env.production`；逻辑 `release` 只映射到 `.env.production`。Web 只公开 `VITE_` 变量，Extension 只公开 `PLASMO_PUBLIC_` 变量，浏览器端配置不得承载秘密。
- 三份环境至少包含 `APP_ENV`、`API_BASE_URL`、`LOG_LEVEL` 与 `REQUEST_TIMEOUT_MS`，业务代码只通过冻结的 `APP_CONFIG` 读取。禁止 `.env` 与四种 `.env*.local` 隐式覆盖；进程只可用当前宿主的四个已声明键覆盖选定 profile，未知公开键失败。`pnpm env:validate`、测试和所有构建入口必须先验证三份配置齐全且类型有效。
- 应用日志统一经过 logger，不在产品代码散落 `console.*`。Release 强制 `warn`/`error` 下限，只保留批准的诊断字段，并对敏感键、URL query/fragment、Error stack/cause 与本机路径脱敏或裁剪；`build:release` 与 Extension `package` 必须自动通过 `pnpm release:inspect`。
- Node.js、pnpm 与受控依赖的工具链门禁按稳定 SemVer（`x.y.z`）最低版本判断，更高合法版本不得仅因不等于初始基线而失败；prerelease 或无法解析的声明不进入兼容门禁。`packageManager` 保持精确 `pnpm@x.y.z` 格式；Harness/软件当前版本、候选版本、源码提交、lock/hash、Schema/协议版本、`manifest_version`、`projectType` 等身份与协议事实仍精确匹配。
- 行为变化必须有相关非空测试，至少覆盖核心成功路径与最高风险失败路径。Mock 可隔离外部依赖，但不能作为最终产物已可用的证据。
- 文档中的命令、路径、配置和验证结论必须来自真实仓库或明确规范；未运行写“未执行”，未验证写 `Unverified`。
- 不覆盖或撤销用户和其他 Agent 的既有修改；并行写入必须先划分互不重叠的文件所有权。
- 发布、外部上传、凭据、商店提交、生产数据和不可逆副作用需要独立明确授权。

## Skills 地图

本节与“约束地图”是永久结构。只删除不再存在的 Skill 条目，不得删除整个章节，也不得保留失效入口。

- 从 Harness 建立独立终端下游、重置身份与历史：`$instantiate-project`。
- 在下游显式选择 `web` 或 `extension` 并生成单包：`$initialize-web-project`。
- 初始化或更新 Logo 母版及当前类型的品牌派生：`$prepare-brand-identity`。
- 新产品、需求模糊或产品目标/边界/成功标准变化：`$define-product`。
- 标准/里程碑路径或用户要求持久计划：`$plan-change`。
- 实施范围清楚的请求或活动计划：`$implement-change`。
- 行为保持的 TypeScript 文件与模块整理：`$refactor-code`。
- 抽取 Web 或 Extension 当前单包中的用户可见文案：`$extract-i18n-strings`。
- 任务可安全拆分且文件所有权不重叠：`$run-parallel-worktrees`。
- 首次代码开发或 Node.js/pnpm/Chrome 工具条件变化：`$check-development-environment`。
- 里程碑、发布候选或用户明确要求完整验收：`$verify-delivery`。
- 验证里程碑中对真实 Web 或已加载 Extension 执行 E2E：`$test-final-artifact-e2e`。
- 定版本、更新发布元数据或准备发布：`$prepare-release`。
- 已初始化下游需要同步新版 Harness 工程规则：`$upgrade-harness`。

项目 Skills 位于 `.agents/skills/`。不存在“为已有下游增加第二宿主”的 Skill；不得调用或恢复此类能力。

Harness 源保留 `$instantiate-project` 与 `$initialize-web-project`。成功初始化的终端下游必须删除这两个 Skill 及其 `instantiate`/`harness:init` 命令入口，并从本地图中移除对应条目；品牌、实现、验证、发布和 `$upgrade-harness` 等维护能力继续按需保留。

## 约束地图

| 约束领域                                 | 唯一来源或入口                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 单类型初始化、技术栈、目录和品牌派生     | [`docs/TS_WEB_TEMPLATE.md`](docs/TS_WEB_TEMPLATE.md)、`$initialize-web-project`、`$prepare-brand-identity` |
| 分页、HTTP header/认证、数据访问与事件流 | [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)                                                               |
| 三环境、BaseURL 与构建 profile           | [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)                                           |
| 日志、Release 裁剪与敏感信息扫描         | [`docs/LOGGING.md`](docs/LOGGING.md)                                                                       |
| 文件、注释、状态职责、测试与规则例外     | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)                                                   |
| 任务分级、并行与里程碑验收偏好           | [`docs/AGENT_POLICY.md`](docs/AGENT_POLICY.md)                                                             |
| 开发环境                                 | `$check-development-environment`                                                                           |
| 版本与候选发布                           | [`Version.md`](Version.md)、[`docs/RELEASE.md`](docs/RELEASE.md)、`$prepare-release`                       |
| 下游 Harness 来源与升级                  | `$upgrade-harness` 与下游 `.harness/` 元数据                                                               |
| 商业许可与知识产权                       | [`LICENSE.zh-CN.md`](LICENSE.zh-CN.md)、[`LICENSE.en.md`](LICENSE.en.md)                                   |

## 每次任务的最小闭环

1. 读取最少事实，检查工作区和当前唯一 `projectType`。
2. 选择快速、标准或里程碑路径；必要时维护精简 Todo。
3. 实施当前范围，保持单包和单宿主边界。
4. 运行相称的环境校验、格式、lint、类型、非空测试、构建或真实浏览器检查；Release 候选同时执行日志/敏感信息产物扫描，立即处理失败。
5. 只更新被触发的长期文档；最终报告变更、实际验证、未执行项与剩余风险。

## 当前限制

本 Harness 自身不实现具体业务，也不生成同时覆盖 Web 与 Extension 的产品。脚手架生成成功只证明工程基线可创建，不等于业务产品完成、Chrome Web Store 可发布或跨浏览器兼容已验证。
