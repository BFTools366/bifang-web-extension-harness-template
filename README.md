# Bifang Web Harness Template

新创建以 [Workspace 合同](docs/WORKSPACE_TEMPLATE.md) 为准：根拥有 Git、锁与产品事实，成员内部单一宿主；已有服务必填开发 BaseURL，选择自建服务时创建 Go 成员；明确纯本地使用 none。下文旧平铺单包限定只适用于既有独立前端；发布与验收必须显式选定一个成员、根 Git 与精确候选。

Bifang Web Harness Template 是用于创建和维护 Web、Extension 与 Go 服务 Workspace 的 Harness。项目使用者通过 Agent 提供创建信息与开发需求，Agent 依据仓库规则完成工程创建和后续实施。

新创建以 Workspace 为根，用一个 package.json 包装按需成员：`<id>_web`、`<id>_extension`、`<id>_server`。已有服务必填开发 BaseURL；选择自建服务时创建 Go 服务并连接前端，不另填 Go 问卷，也不生成产品 Mock。用户、组织、权限、商品、订单、钱包与审计通过独立领域 Skill 完成两端实施和真实联调。具体结构与补充分析见 [Workspace 规范](docs/WORKSPACE_TEMPLATE.md)，后端基线见 [Go 服务知识](docs/GO_SERVICE.md)。

本 README 面向项目使用者和执行 Agent，介绍用途、创建方式、交付内容和常用入口。Agent 开始工作时先读取 [AGENTS.md](AGENTS.md)，按其中的任务路由与 Skills 地图选择需要的规范。

## 让 Agent 创建项目

### 通过 GitHub 地址快速创建

将本仓库的 GitHub 地址交给能够访问 Git 仓库、读写本地文件并执行终端命令的 AI Agent。Agent 负责获取模板、逐项询问初始化信息，并在创建汇总确认后生成独立下游项目。

以下提示词可直接复制使用：

```text
请根据 https://github.com/BFTools366/bifang-web-extension-harness-template 为我创建一个独立下游项目。
请先获取模板源码，读取 AGENTS.md，并按仓库内的 web-instantiate-project Skill 执行。
使用固定初始化表单，每轮只问一项，保持问题名称和题面固定，每个选项后用括号解释含义。
已经提供的合法信息直接复用，只补问缺失或非法项。
按共享只读表单工具逐项收集并校验输入，直接使用唯一 JSON 题库的题名、题面、选项与顺序；收齐信息后展示包含首版范围的创建汇总；已有覆盖当前汇总的明确授权直接复用，否则按 Agent 完整创建题目确认一次。随后从模板根目录调用 pnpm instantiate，
在模板目录之外创建独立工程，并在成功下游持续完成已确认的首版页面和功能。
完成相关检查与开发浏览器核心流程走查后，报告项目完整路径、运行方式、实现范围及验证结果。
```

使用自己的 Harness fork 时，替换提示词中的 GitHub 地址即可。已有合法信息可以一起提供，Agent 会复用这些信息并继续补齐缺项。

创建按已确认需求完成首版：

1. 明确宿主、真实首页、必要页面、核心流程、数据模式和验收标准；需求文档可选。
2. 选择固定设计与代码模板，自动补齐操作最小依赖、展示原因，汇总后一次确认完整范围。
3. 建立工程后在下游继续登记 PRD、组合一个原型、实施页面功能并完成相关检查和开发浏览器核心流程走查。
4. 交付运行方式、实现范围、验证结果与真实缺口；最终产物和发布按相应请求执行。

### 需要提供的信息

以下表格用于了解创建输入。实际问答按[固定初始化表单](.agents/skills/web-instantiate-project/references/initialization-form.md#固定问题清单)逐项进行；题名、题面与选项说明以[固定问题清单](.agents/skills/web-instantiate-project/references/initialization-questions.json)为准，已提供的合法答案直接复用。

| 信息                  | 提供方式与适用条件                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 详细需求文档          | 可选，支持 Markdown（.md）、TXT（.txt）、Word（.doc/.docx）附件或直接输入，也可暂不提供；用于明确用户、页面、流程与功能范围，减少重复沟通。CLI 支持 `--requirements-file`（.md/.txt）或 `--requirements-text`；Word 由 Agent 读取完整正文后交接。 |
| 项目类型              | 先采集需求；Agent 唯一适配时自动选择 Web 或 Extension，等价或有争议时才推荐；CLI 无默认值。                                                                                                                                                       |
| 服务来源              | 先澄清需求并自动判断服务需求；纯本地自动 none，需要服务时只补现成服务事实；已有服务则必填开发 BaseURL，可附接口文档；无现成服务默认创建 Go；明确纯本地则 none，不创建服务端。                                                                     |
| 项目显示名称          | 页面或扩展中显示的非空名称。                                                                                                                                                                                                                      |
| 源 Harness 外的父目录 | 提供模板之外的相对或绝对父路径；相对路径解析、校验后展示绝对保存位置，确认后继续，无需重复输入；最终目录为“父目录/项目标识”，该子目录须不存在或为空。                                                                                             |
| 项目说明              | Extension 必填非空简短说明；Web 缺省使用显示名称。                                                                                                                                                                                                |
| Agent 策略模式        | 默认采用预设，不再询问；仅主动自定义时补齐缺失能力设置，汇总展示实际配置。                                                                                                                                                                        |
| 项目标识              | 通常由 Agent 根据名称的英文翻译生成小写 kebab-case，例如“示例网页”→ `example-web`；已有合法标识直接复用。                                                                                                                                         |

Logo、品牌色和身份本地化可一并提供。Agent 优先生成并展示需求唯一适配的品牌方向并自动选定；等价方向或审美分歧才展示候选并推荐；已有选定正式 Logo 则直接沿用。离线候选入口见[品牌 Skill](.agents/skills/web-prepare-brand-identity/SKILL.md)，纯 CLI 直接省略 Logo 时保留单图确定性生成。名称、说明与品牌同步规则见[初始化契约](docs/TS_WEB_TEMPLATE.md#3-项目身份与品牌事实)。

创建时的服务配置遵循[源范围门禁](AGENTS.md#启动门禁)与[初始化表单](.agents/skills/web-instantiate-project/references/initialization-form.md#可选输入与后续配置)。已有服务须提供开发 BaseURL；选择自建服务时创建并连接本地 Go，测试和正式地址可后续配置；正式发布前按[运行配置](docs/RUNTIME_CONFIGURATION.md#42-自建服务首次发布的本机地址)补齐地址：自建服务首次空地址从生产配置推导本机地址并提示确认，其他远端使用 HTTPS。创建需求可先只读分析，原文随事务保存到新项目 `docs/requirements/source.txt`；完整范围确认在下游 PRD 中复用，endpoint 与凭据按对应门禁处理，不要求重贴需求。

### 创建后会得到什么

- 一个根 package.json 包装所选 _web、_extension、_server 成员的 Workspace。
- 名称、说明、Logo、主题、亮暗模式与国际化基础。
- 开发、测试、正式三环境配置，以及请求、分页、日志和测试基础。
- 当前项目适用的 `AGENTS.md`、Skills 和工程文档。
- 项目内的 `design-taste-frontend` 设计支持 Skill；已有有效版本保留，缺失时默认补装，使用时遵循 [Mantine 与宿主规范](docs/MANTINE_UI_GUIDELINES.md#11-设计风格支持)。
- 一个独立的本地 Git 仓库和通用基线提交，尚未绑定远端。

创建完成表示已确认首版页面与功能实现并完成实际流程验证，工程生成只是内部阶段。各项能力采用固定设计模板和代码接线；当前购买图补齐基础身份资源，完整用户方案还需满足账号与组织基线。开发走查不代表最终产物或发布就绪。

### 使用命令行创建

唯一公开创建入口是模板源根目录中的 `pnpm instantiate`。完整命令、必需参数和预检规则见[创建与内部初始化契约](docs/TS_WEB_TEMPLATE.md#2-创建与内部初始化契约)；执行流程由[实例化 Skill](.agents/skills/web-instantiate-project/SKILL.md)负责。

开发工具最低声明为 Node.js `>=24.0.0`、pnpm `>=12.8.1`，`packageManager` 固定为 `pnpm@12.8.1`；同时需要 Git；自建服务需要 Go >=1.26.0。版本事实以 [package.json](package.json) 为准。当前测试依赖 `jsdom 30.1.1` 在 Node 24 系列要求 `24.15.0+`。

Node.js、pnpm 与独立 CLI 工具全局安装或升级；React、Vite 等项目运行时/开发依赖按 manifest 与锁文件安装在项目内，项目脚本使用声明版本。实际工具变更后核对版本与可执行文件路径；安装或升级范围沿用已有授权。

## 在新项目中使用

打开创建成功的新项目目录后，项目使用者可以直接提出需求、功能修改、问题修复或品牌更新。Agent 先读取该项目的 `AGENTS.md`，复用已经确认的决定，并执行与改动相称的检查。

新页面、影响页面或流程的需求变更，以及明确的设计、视觉、布局或风格修改，先生成或修订一个桌面交互原型，自查后展示预览并等待用户反馈，再实施。产品范围变化时先更新 PRD，纯视觉变更复用有效 PRD；纯逻辑修复、文案纠错或恢复已确认设计的缺陷可直接处理。完整创建仅凭一次性首版授权复用阶段批准，后续改版不能沿用。需求原文按[输入与交接合同](.agents/skills/web-instantiate-project/references/requirements-intake.md)保留，已有分析和建议直接沿用。首页由实际需求实现；基础主界面始终接入宿主路由，所选能力必须完成固定页面及代码接线。

以下命令在生成的 Workspace 根目录运行，`<member>` 为已选成员 `web`、`extension` 或 `server`：

| 命令                                             | 用途                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:<member>`                 | 启动全部或指定成员的开发环境；选中自建服务时先启动并等待 Go 服务健康。 |
| `pnpm test` / `pnpm test:<member>`               | 运行全部或指定成员的测试。                                             |
| `pnpm build -- --member <member> --e2e=enabled`  | 构建指定成员的正式产物并要求 E2E 验证；根 `build` 必须指定成员。       |
| `pnpm build -- --member <member> --e2e=disabled` | 同上，不执行可选 E2E；适用的浏览器硬要求仍须满足。                     |

Workspace 根还提供 `pnpm release` 与 `pnpm release:<member>`，将已选成员统一打包到 `release/web.zip`、`extension.zip`、`server.zip`。Server 打包前必须选择平台，例如 `pnpm release:server -- --platform=linux/amd64`；Web 解压为 `<id>_web/`，扩展包含 chrome/ 与 firefox/，Server 仅二进制和 config.yaml。详见 [归档合同](docs/WORKSPACE_TEMPLATE.md#本地发布归档)。

以下命令在前端成员目录（如 `<id>_web/`、`<id>_extension/`）运行：

| 命令                                    | 用途                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `pnpm test:related <changed-source...>` | 运行与当前改动相关的测试。                                  |
| `pnpm dev:firefox`                      | 仅 Extension，用 Firefox 目标开发；默认 `dev` 使用 Chrome。 |

构建与发布的授权、候选及验证规则见[发布说明](docs/RELEASE.md)。Extension 的 Chrome MV3 / Firefox MV2 兼容约束见[技术基线](docs/TS_WEB_TEMPLATE.md#5-extension-技术基线)。

### 按需组合功能

创建输入与原文事务归 `web-instantiate-project`，需求语义和唯一 PRD 归 `web-define-product`，模块与操作选择归 `web-compose-capabilities`；实际桌面布局和原型登记归 `web-design-prototype`，真实代码归 `web-implement-change`。完整归属见 [Skill 职责地图](docs/harness_engineering/skill_composition.md#创建需求与能力的归属)。

Harness 提供独立的知识库和模板库：[身份认证、组织、权限、商品目录、订单、钱包支付、审计](.agents/skills/web-compose-capabilities/SKILL.md)。模块按具体操作及其最小依赖组合；不再提供 Web 产品分类。可根据需求推荐布局与独立能力，正式模块选择在下游唯一 PRD 中记录，未选功能不生成；购买自动依赖基础身份；当前低层依赖图不自动生成组织/权限，不代表完整用户系统可以省略组织。完整用户方案遵循[账号与组织基线](.agents/skills/web-compose-capabilities/knowledge/identity.md#完整用户信息)，已确认目标与当前装配器差异见[接线合同](.agents/skills/web-compose-capabilities/templates/application/wiring.md#当前装配器与目标规范的差异)。

模板明确区分代码、操作设计表单和离线演示。身份认证支持基础登录和可选邮箱注册：无需用户名，验证码按已选操作接线；认证页复用布局和低强调设置链接，组织切换归用户菜单。Go 校准通过独立 overlay 保留真实校验与事务；开发注册 Mock 只在用户明确要求时启用。历史账户 Mock 仅作协议测试参考，购买保留显式设计组合，均不能冒充真实服务。两类宿主共用业务知识，按模板索引适配宿主。接口按 [功能模块与 API 关联](docs/API.md#功能模块与-api-关联) 核对，所有远端列表查询走 GraphQL。API 导出继续按实际业务聚合并核对代码差异。

## 技术与目录

| 项目类型                      | 技术基线                                                        |
| ----------------------------- | --------------------------------------------------------------- |
| React Web                     | React + TypeScript、Vite、Mantine、TanStack Router 文件路由。   |
| Chrome MV3 / Firefox MV2 扩展 | React + TypeScript、Plasmo、Mantine、TanStack Router 代码路由。 |
| 共同基础                      | TanStack Query、Jotai、i18next、Ky、Vitest、Testing Library。   |

API 与本地存储统一归入 `src/data/`。REST/Ky、GraphQL、IndexedDB 的选择，以及 Query 与客户端状态的职责见[数据访问规范](docs/DATA_ACCESS.md)；按真实功能消费对应能力。

| 模板源路径          | 职责                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `.harness/tooling/` | 工程生成、身份品牌、配置、校验与交付工具；`templates/` 保存宿主生成模板。 |
| `scripts/`          | 公开实例化入口和 Harness 源校验。                                         |
| `.agents/skills/`   | 工作流程、操作规范、参考合同和辅助脚本。                                  |
| `.harness/vendor/`  | 第三方设计支持快照及其来源与许可。                                        |
| `docs/`             | 工程规范、专题说明和项目记忆。                                            |
| `tests/`            | 生成、治理、升级和工具边界的回归测试。                                    |

| 下游 Workspace 路径                   | 职责                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `.harness/workspace.json`             | Workspace 成员、服务归属与拓扑事实。                                              |
| `<id>_web/`、`<id>_extension/`        | 前端成员单包：`src/` 页面与功能代码，`.harness/project.json` 唯一宿主类型与品牌。 |
| `<id>_server/`                        | 按需创建的 Go 服务成员。                                                          |
| `AGENTS.md`、`.agents/skills/`        | Workspace 与各成员的 Agent 执行入口和可用 Skills。                                |
| `docs/`                               | 统一 PRD、工程规范及后续事件产生的产品与发布记录。                                |
| `package.json`、`pnpm-workspace.yaml` | 根命令、成员声明与工具依赖；成员依赖在各自 `package.json`。                       |

## 更多说明

| 阅读目的                       | 入口                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Agent 执行、能力选择与渐进读取 | [AGENTS.md](AGENTS.md)，其中包含完整 Skills 地图与约束来源。                                 |
| 初始化、宿主技术与终端工程边界 | [TypeScript Web / Extension 模板](docs/TS_WEB_TEMPLATE.md)                                   |
| 文件职责、依赖、测试与文档规则 | [工程规则](docs/ENGINEERING_RULES.md)                                                        |
| Agent 能力、Task 与验收偏好    | [Agent Policy](docs/AGENT_POLICY.md)                                                         |
| 三环境与 BaseURL               | [运行配置](docs/RUNTIME_CONFIGURATION.md)                                                    |
| 可选基础 API 契约              | [API 与数据模型](docs/API.md)                                                                |
| Harness 方法与生命周期         | [Harness 工程说明](docs/HARNESS_ENGINEERING.md)                                              |
| 源维护检查                     | 在模板根目录运行 `pnpm validate:harness`，规则见 [AGENTS.md](AGENTS.md#每次任务的最小闭环)。 |

维护状态：维护中。当前 Harness 版本与发布状态见 [Version.md](Version.md)。

许可证：企业专有商业许可，使用与分发前阅读[中文许可](LICENSE.zh-CN.md)或[英文许可](LICENSE.en.md)。
