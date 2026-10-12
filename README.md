# Bifang Web Harness Template

让 AI Agent 为你创建独立的 **React Web 项目**或 **Chrome MV3 / Firefox MV2 扩展项目**。模板提供 TypeScript、UI、路由、状态管理、国际化和工程规范，创建后即可在新项目中继续开发。

## SaaS 基础设计与创建选择

SaaS 客户端和大后台共用 [UI 基础设计](docs/MANTINE_UI_GUIDELINES.md)：未登录默认登录、表单内紧凑偏好、完整工作区侧栏与账号菜单、底部身份/作用域、窄屏等价导航和可恢复状态。需求、可交互原型、实施复用同一 SOP；营销首页独立确认，客户端注册/组织切换与后台管理目标严格区分。

创建 `web + saas-client` 必须明确询问商品购买模块，包含商品选择、订单管理和钱包管理。交互建议关闭但等待实际回答；非交互必须传 `--saas-commerce enabled|disabled`。显式值复用，其他模式拒绝该参数。选择、来源与日期保留在 README 创建交接，首次 PRD 沿用；初始化仍不生成业务页面、PRD 或支付调用。

## 让 Agent 创建项目

把下面的提示词发给能够访问 Git 仓库、读写本地文件并执行终端命令的 AI Agent：

```text
使用 {GitHub 链接} 为我创建一个新的项目。
请先获取模板仓库，读取 AGENTS.md，按 web-instantiate-project Skill 收集缺少的初始化信息，
再从模板源目录调用 pnpm instantiate，在模板目录之外创建独立项目。
已经提供的信息无需重复询问。
```

将 `{GitHub 链接}` 替换为[本仓库的 GitHub 地址](https://github.com/BFTools366/bifang-web-extension-harness-template)。也可以在第一句直接指定“React Web 项目”或“Chrome MV3 / Firefox MV2 扩展项目”。

### 需要提供的信息

你可以随提示词一起提供以下信息，也可以让 Agent 逐项引导。每次优先问一个关键问题，有可靠默认值时给出建议；已有答案直接复用，无需一次填写整份表格：

| 信息       | 如何填写                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 项目类型   | 1.Web（`web`，React Web）或 2.Extension（`extension`，Chrome MV3 / Firefox MV2 扩展），可直接选编号 |
| Web 类型   | 选择 Web 后必选：1.工具站点；2.SaaS客户端；3.SaaS大后台，三种均可创建                               |
| 项目名称   | 页面或扩展中显示的名称                                                                              |
| 项目标识   | Agent 根据项目名称的英文翻译自动生成小写 kebab-case 标识，例如“示例网页”→ `example-web`；无需手填   |
| 目标目录   | 提供模板目录之外的绝对父路径；最终目录自动使用“父路径/项目标识”，该子目录须不存在或为空             |
| Agent 策略 | 选择“预设”（推荐）或“自定义”                                                                        |

开发 API 地址可选，可在创建时提供或后续配置；测试和正式 API 地址无需在初始化时填写。三份配置仍会生成，未提供的地址留空，正式发布前必须补齐 HTTPS 正式地址。已提供的地址必须是无凭据、查询参数或片段的绝对 HTTP(S) URL。Web 说明可默认使用显示名称；Extension 必须提供非空简短说明（`--description`），交互时只询问缺失值。不询问确认来源。Logo 和品牌色可以同时提供；Agent 创建流程先完成 Logo 生成/导入与预览，CLI 未提供 `--logo` 时使用离线确定性生成器。创建汇总和结果均列出母版及当前宿主的派生图标。名称与说明的本地化输入见 [初始化契约](docs/TS_WEB_TEMPLATE.md#34-extension-品牌同步)。

Agent 会复用已提供的合法信息，按[初始化表单](.agents/skills/web-instantiate-project/references/initialization-form.md)汇总创建参数，并在确认后执行创建。Web 类型不设默认值；工具站点、SaaS 客户端和大后台均沿用安全的中性工程初始化事务。非交互 Web 命令必须显式传入 `--web-type tool-site|saas-client|saas-admin`。创建选择保留在下游 README 的“创建交接”，成功后切换到下游按 [创建与开发 SOP](.agents/skills/web-design-prototype/references/prd-outline.md#创建与开发-sop) 继续。本地需要 Git、Node.js `>=26.10.0` 和 pnpm `12.8.1`；Agent 会检查创建环境，工具缺失或需要升级时再指导你准备。

### 创建后会得到什么

- 一个独立的 pnpm 单包项目，包含所选类型的页面或扩展入口。
- 项目名称、说明、Logo、主题、亮暗模式和国际化基础。
- 开发、测试、正式三环境配置，以及请求、分页、日志和测试基础。
- 适用的 `AGENTS.md`、项目 Skills 和工程文档，供 Agent 继续开发。
- 项目内的 `design-taste-frontend` 设计支持 Skill：缺失时默认安装，无额外问询，已有有效版本保留；[使用边界](docs/MANTINE_UI_GUIDELINES.md#11-设计风格支持)遵循 Mantine 与当前宿主规范。
- 独立的本地 Git 仓库和一个中性基线提交，尚未绑定远端。

创建完成后，在新项目目录中打开 Agent，再描述具体功能、页面和交互需求。模板源只负责创建工程基线；业务开发在生成的新项目中进行。

下游的新产品、新页面或显著交互改版遵循“需求澄清 → 产品规格（PRD）记录并确认 → 2–3 个可交互 HTML 原型 → 用户选定具体版本 → 开发”。对应 `$web-define-product`、[`$web-design-prototype`](.agents/skills/web-design-prototype/SKILL.md) 和 `$web-implement-change` 随初始化安装到下游 `.agents/skills/`，不污染全局。初始化不执行这套业务流程；日常小修复不强制重走。原型选择绑定 PRD 与候选内容，内容变化后需重新选择。

每个项目只包含 Web 或 Extension 中的一种。需要两种时分别创建两个独立项目。初始化成功仅表示工程基线创建完成；正式产物需要后续构建和验收。

API 与 Cookie、LocalStorage、SessionStorage、Memory、IndexedDB 统一归入 `src/data/`；REST/Ky 负责主要交互，GraphQL 负责复杂查询与订阅，Dexie 仅用于 IndexedDB。目录、选型与生命周期以 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md) §1.1–1.3 为准。

已初始化 Web 需要 SaaS 认证时，使用独立 [`$web-implement-saas-auth`](.agents/skills/web-implement-saas-auth/SKILL.md) 完善登录、退出、注册/找回、组织切换、路由与权限 SOP；大后台不含注册和组织切换。初始化分发通用能力，具体需求、原型及认证页面在下游按所选模式完成。

SaaS 客户端可明确选中独立 [`$web-implement-saas-commerce`](.agents/skills/web-implement-saas-commerce/SKILL.md)；默认关闭，选中后才应用商品购买、订单查询与钱包管理。它包含树形分类、服务端钱包支付选项、原订单续付及支付后账户刷新 SOP，并附[离线中性界面参考](.agents/skills/web-implement-saas-commerce/assets/commerce-reference.html)。源只分发能力与示例，不创建产品订单或开通真实支付。

SaaS 大后台管理使用 [`$web-implement-saas-admin`](.agents/skills/web-implement-saas-admin/SKILL.md)：提供商品与树形分类、组织与成员、订单管理，补齐钱包/支付查询、平台访问控制和操作审计的页面与 SOP。管理目标组织不切换登录身份，改价保留历史订单快照，钱包默认只读；具体服务能力在已初始化下游采用。

工具站点、SaaS 客户端与 SaaS 大后台统一遵循 [Web 类型与可选能力](.agents/skills/web-design-prototype/references/prd-outline.md#web-类型与可选能力)：创建选择仅作为 README 交接输入，首次需求直接复用；下游当前业务模式与购买选择由唯一 PRD 记录，需求、原型、实现和真实接入复用同一事实。安装 Skill 不自动实现产品功能。

三项 SaaS 能力共用 [API 关联表](docs/API.md#saas-能力与-api-关联)：映射已有认证操作、协议与字段，列明组织切换/权限、购买及后台管理的服务契约缺口。需要整理接口文档或公开 API 实际变化时，在下游调用 [`$web-document-api`](.agents/skills/web-document-api/SKILL.md)，依据当前 API 实现、类型与相关测试写入 `docs/api/`：每个模块一份文档，并生成索引；实现/接入流程仅同步受影响模块。REST 展示接口名称、接口说明、请求路径、请求方法、请求头、请求与响应数据，JSON 数据使用字段表；GraphQL 展示接口名称、接口说明与有来源的 Schema。初始化只分发 Skill，不生成业务接口文档。

Extension 默认同时构建 Chrome MV3 与 Firefox MV2；`pnpm dev` 开发 Chrome，`pnpm dev:firefox` 开发 Firefox。最终 manifest 由 Plasmo 动态生成，后续开发按 [工程基础](docs/harness_engineering/foundations.md) 自行处理两浏览器差异与兼容。

独立复用能力覆盖 API 契约核对、模块边界审查、访问控制、写操作恢复、浏览器存储、持续事件流与用户可见 Task。现有流程按实际事件委托，参考资料按阶段/宿主/协议读取；完整地图见 [Skill 职责与组合](docs/harness_engineering/skill_composition.md)。源共 33 个 `web-*` Skills，Web 与 Extension 分别分发 30 与 27 个维护 Skills，设计支持另计。

## 在新项目中使用

以下命令在生成的新项目目录中运行：

| 命令                                    | 用途                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                              | 启动开发环境                                         |
| `pnpm test:related <changed-source...>` | 运行与改动相关的测试                                 |
| `pnpm test`                             | 运行全部测试                                         |
| `pnpm build -- --e2e=enabled`           | 构建正式产物并要求 E2E 验证                          |
| `pnpm build -- --e2e=disabled`          | 构建正式产物，不执行 E2E；仍需满足适用的浏览器硬要求 |

Web 使用 Vite；Extension 使用 Plasmo。扩展的本地加载和开发方式见生成项目的 README。正式构建与发布流程见 [发布说明](docs/RELEASE.md)。

日常也可以直接让 Agent 修改功能、修复问题或更新品牌。请在新项目中操作，Agent 会读取该项目的规则并执行与改动相称的检查。

## 技术与目录

| 项目类型                      | 技术基线                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| React Web                     | React + TypeScript、Vite、Mantine、TanStack Router 文件路由   |
| Chrome MV3 / Firefox MV2 扩展 | React + TypeScript、Plasmo、Mantine、TanStack Router 代码路由 |
| 共同基础                      | TanStack Query、Jotai、i18next、Vitest、Testing Library       |

Harness 源工程按职责组织：

| 路径                | 职责                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------- |
| `.harness/tooling/` | 项目生成、身份与品牌、运行配置、结构校验和交付工具；`templates/` 保存两种宿主的生成模板 |
| `scripts/`          | 公开实例化入口与 Harness 源校验；`harness-validation/` 按检查职责拆分                   |
| `.agents/skills/`   | 可复用工作流程、操作规范、参考契约与辅助脚本                                            |
| `.harness/vendor/`  | 随工程分发的第三方设计支持，保留上游原文与来源                                          |
| `docs/`             | 工程规范、专题说明、产品规格、架构决策和变更记录                                        |
| `tests/`            | 生成、治理、升级和工具边界的回归测试                                                    |

源工程只维护通用能力；产品源码在生成的独立项目内。

生成项目中的主要入口：

| 路径                           | 用途                           |
| ------------------------------ | ------------------------------ |
| `src/`                         | 当前项目的页面、组件与功能代码 |
| `.harness/project.json`        | 项目身份、类型与品牌配置       |
| `AGENTS.md`、`.agents/skills/` | Agent 开发入口与项目 Skills    |
| `docs/`                        | 当前项目的工程与发布说明       |
| `package.json`                 | 依赖和可执行命令               |

## 更多说明

- [手动创建与技术基线](docs/TS_WEB_TEMPLATE.md)：公开创建入口为模板源根目录的 `pnpm instantiate -- <绝对父目录> ...`，完整命令与参数见文档。
- [基础 API 与数据模型](docs/API.md)：完整收录的可选参考契约，后续按实际需求拆解与接入。
- [运行配置](docs/RUNTIME_CONFIGURATION.md)：三环境配置与 BaseURL。
- [Agent 创建项目 Skill](.agents/skills/web-instantiate-project/SKILL.md)：创建流程与输入规则。
- [Agent 入口](AGENTS.md)：让 Agent 按任务读取适用的规则。

维护状态：维护中。当前版本与发布状态见 [Version.md](Version.md)。

许可证：企业专有商业许可，使用与分发前请阅读[中文许可](LICENSE.zh-CN.md)或[英文许可](LICENSE.en.md)。
