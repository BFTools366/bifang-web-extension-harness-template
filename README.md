# Bifang Web Harness Template

让 AI Agent 为你创建独立的 **React Web 项目**或 **Chrome MV3 扩展项目**。模板提供 TypeScript、UI、路由、状态管理、国际化和工程规范，创建后即可在新项目中继续开发。

## 让 Agent 创建项目

把下面的提示词发给能够访问 Git 仓库、读写本地文件并执行终端命令的 AI Agent：

```text
使用 {GitHub 链接} 为我创建一个新的项目。
请先获取模板仓库，读取 AGENTS.md，按 web-instantiate-project Skill 收集缺少的初始化信息，
再从模板源目录调用 pnpm instantiate，在模板目录之外创建独立项目。
已经提供的信息无需重复询问。
```

将 `{GitHub 链接}` 替换为[本仓库的 GitHub 地址](https://github.com/BFTools366/bifang-web-extension-harness-template)。也可以在第一句直接指定“React Web 项目”或“Chrome MV3 扩展项目”。

### 需要提供的信息

你可以随提示词一起提供以下信息；缺少的基础信息由 Agent 一次收集：

| 信息             | 如何填写                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| 项目类型         | `web`（React Web）或 `extension`（Chrome MV3 扩展），每个项目只选一种          |
| 项目名称         | 页面或扩展中显示的名称                                                         |
| 项目标识         | 以小写字母开头，使用小写字母与数字，单个连字符分隔非空片段，例如 `example-web` |
| 简短说明         | 用于项目元数据的介绍                                                           |
| 目标目录         | 模板目录之外的绝对路径；目录不存在或为空，目录名与项目标识一致                 |
| 三个 API BaseURL | 开发、测试、正式环境各一个；正式环境必须使用 HTTPS                             |
| Agent 策略       | 选择仓库的推荐策略，或逐项自定义；记录真实确认人或确认来源                     |

BaseURL 必须是无凭据、查询参数或片段的绝对 HTTP(S) URL。请提供真实地址，Agent 不会替你猜测。Logo 和品牌色可以同时提供，也可以使用模板生成的默认品牌资产。

Agent 会复用已提供的合法信息，按[初始化表单](.agents/skills/web-instantiate-project/references/initialization-form.md)汇总创建参数，并在确认后执行创建。本地需要 Git、Node.js `>=26.10.0` 和 pnpm `12.8.1`；Agent 会检查创建环境，工具缺失或需要升级时再指导你准备。

### 创建后会得到什么

- 一个独立的 pnpm 单包项目，包含所选类型的页面或扩展入口。
- 项目名称、说明、Logo、主题、亮暗模式和国际化基础。
- 开发、测试、正式三环境配置，以及请求、分页、日志和测试基础。
- 适用的 `AGENTS.md`、项目 Skills 和工程文档，供 Agent 继续开发。
- 独立的本地 Git 仓库和一个中性基线提交，尚未绑定远端。

创建完成后，在新项目目录中打开 Agent，再描述具体功能、页面和交互需求。模板源只负责创建工程基线；业务开发在生成的新项目中进行。

每个项目只包含 Web 或 Extension 中的一种。需要两种时分别创建两个独立项目。初始化成功仅表示工程基线创建完成；正式产物需要后续构建和验收。

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

| 项目类型        | 技术基线                                                      |
| --------------- | ------------------------------------------------------------- |
| React Web       | React + TypeScript、Vite、Mantine、TanStack Router 文件路由   |
| Chrome MV3 扩展 | React + TypeScript、Plasmo、Mantine、TanStack Router 代码路由 |
| 共同基础        | TanStack Query、Jotai、i18next、Vitest、Testing Library       |

生成项目中的主要入口：

| 路径                           | 用途                           |
| ------------------------------ | ------------------------------ |
| `src/`                         | 当前项目的页面、组件与功能代码 |
| `.harness/project.json`        | 项目身份、类型与品牌配置       |
| `AGENTS.md`、`.agents/skills/` | Agent 开发入口与项目 Skills    |
| `docs/`                        | 当前项目的工程与发布说明       |
| `package.json`                 | 依赖和可执行命令               |

## 更多说明

- [手动创建与技术基线](docs/TS_WEB_TEMPLATE.md)：公开创建入口为模板源根目录的 `pnpm instantiate -- <绝对目标目录> ...`，完整命令与参数见文档。
- [运行配置](docs/RUNTIME_CONFIGURATION.md)：三环境配置与 BaseURL。
- [Agent 创建项目 Skill](.agents/skills/web-instantiate-project/SKILL.md)：创建流程与输入规则。
- [Agent 入口](AGENTS.md)：让 Agent 按任务读取适用的规则。

维护状态：Active。当前版本与发布状态见 [Version.md](Version.md)。

许可证：企业专有商业许可，使用与分发前请阅读[中文许可](LICENSE.zh-CN.md)或[英文许可](LICENSE.en.md)。
