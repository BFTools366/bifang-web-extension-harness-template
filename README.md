# Bifang Web Harness Template

这是一个面向 AI Agent 的纯 TypeScript 项目 Harness，只生成两种互斥的终端下游：**纯 React Web 页面**或 **Chrome MV3 Plasmo 扩展**。任务分级、最少读取、工程约束、验证与发布治理共同形成可验证的交付闭环。

每次初始化只生成一个平铺的 pnpm 单包项目。下游仓库不会同时包含 Web 与 Extension，不使用 pnpm workspace、`apps/`、`packages/` 或共享 core。若同一产品需要两种宿主，应分别初始化两个独立仓库，并独立维护版本、品牌、状态和测试。

## 当前状态

- 维护状态：Active
- 模板名称：Bifang Web Harness Template
- 当前版本：见 [`Version.md`](Version.md)
- 发布状态：见 [`Version.md`](Version.md)
- 许可证：企业专有商业许可，见 [`LICENSE.zh-CN.md`](LICENSE.zh-CN.md) 与 [`LICENSE.en.md`](LICENSE.en.md)

## 固定技术选型

| 项目类型    | 技术基线                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `web`       | React + TypeScript、Vite、Mantine、TanStack Router 文件路由、TanStack Query、Jotai、i18next                                       |
| `extension` | Plasmo、Chrome Manifest V3、React + TypeScript、Mantine、TanStack Query、Jotai、i18next                                           |
| 两者共同    | pnpm 单包、三环境 `APP_CONFIG`、统一分页/Fetch 请求边界、统一 logger、Vitest、Testing Library；里程碑按适用性增加真实 Chrome 验证 |

初始化器会生成不含业务 endpoint 的原生 Fetch client、语言偏好和分页基础层，统一 `X-Http-Request`、`X-Lang`、`X-AUTH-TOKEN`、401、错误日志与 sessionStorage 分页语义。Ky、OpenAPI、GraphQL、SSE 与 RxJS 等集成仍只随真实消费者按需加入；初始化不预装这些依赖、不生成占位请求/事件总线，也不预置 Extension 权限。完整协议见 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)。

两种下游还会携带按当前宿主裁剪的 Mantine UI 规范，统一 theme/语义令牌、排版、间距、组件层级、异步状态、响应式、无障碍和 i18n 实施边界；源规范见 [`docs/MANTINE_UI_GUIDELINES.md`](docs/MANTINE_UI_GUIDELINES.md)。

## 快速开始

准备 Node.js `>=22.22.2`、Corepack 与 pnpm `>=10.33.3` 后，在 Harness 根目录安装依赖。`engines` 是兼容性最低版本，实际工具可以更高；`packageManager` 仍使用精确 `pnpm@x.y.z` pin 供 Corepack 与复现使用，但这个 pin 也只需不低于最低版本：

```bash
pnpm install
```

项目只能从源 Harness 根创建。唯一公开创建入口是 `pnpm instantiate -- <absolute-target-outside-harness> ...`；目标必须位于源 Harness 目录之外、不存在或为空，并且目录 basename 与 `--id` 完全相同：

```bash
pnpm instantiate -- /absolute/path/example-web --type web --name "示例 Web" --id example-web \
  --description "示例 React Web 页面" \
  --development-base-url "http://localhost:3000" \
  --test-base-url "https://test-api.example.com" \
  --release-base-url "https://api.example.com"
```

创建纯 Chrome 扩展时仍从同一个源 Harness 根调用，并使用另一个源外绝对目标：

```bash
pnpm instantiate -- /absolute/path/example-extension --type extension \
  --name "示例扩展" --id example-extension \
  --description "示例 Chrome 扩展" \
  --development-base-url "http://localhost:3000" \
  --test-base-url "https://test-api.example.com" \
  --release-base-url "https://api.example.com"
```

不要复制模板后原地初始化。源 Harness 不再提供 `pnpm harness:init` script；`pnpm harness init` 会在解析项目输入或写入文件前明确拒绝，并指向源外的 `pnpm instantiate`。底层 initializer 只是 `instantiate` 在目标同级 sibling staging 中调用的内部步骤，不是受支持的用户或 Agent 入口。

非交互调用还必须提供 `--development-base-url`、`--test-base-url` 与 `--release-base-url`。三者都必须是无凭据、query 或 fragment 的绝对 HTTP(S) URL，Release 必须使用 HTTPS。`pnpm instantiate` 可追加 `--logo /absolute/path/logo.png` 或 `--brand-color "#4C6EF5"`；没有上传 Logo 时生成器会创建确定性母版。

`pnpm instantiate` 会先完成输入与源模板预检，再在目标同级的临时目录中复制模板，通过内部 initializer 生成并终端化当前宿主、执行静态下游校验，然后安装依赖并运行完整门禁；全部成功后才以原子 rename 发布到目标。中途失败只清理该临时目录：原先不存在的目标仍不存在，原先为空的目标仍为空。源 Harness 根、其任意子路径以及模板副本自身都不能作为初始化位置。

非交互初始化必须显式传入 `--type web` 或 `--type extension`。交互式 TTY 可以在开始时提示用户二选一，但提示不得提供默认类型，也不得接受 `both`、逗号列表或重复类型。生成后的 `projectType` 是仓库边界；不得通过在同一仓库补入另一套宿主来改变它。

初始化命令的完整参数和三环境配置契约见 [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)；其他可用参数以根 [`package.json`](package.json) 中的真实脚本和命令帮助为准。不要根据文档示例推测尚不存在的参数。

首次生成会先写入当前类型的 `package.json`，再执行普通 `pnpm install` 解析依赖并产出 `pnpm-lock.yaml`。`--skip-install` 只用于受控自动化；跳过时必须在交付前补做安装与验证。锁文件形成后，CI 和可复现检查使用 frozen lockfile，不在复现阶段静默重算依赖。

## 初始化会写入什么

每个下游项目都以 `.harness/project.json` 作为项目名称、标识、描述、唯一 `projectType` 和品牌信息的单一事实来源。Logo 使用以下流程：

1. 用户提供 Logo 时，将其标准化为 `.harness/brand/logo-1024.png` 母版。
2. 用户未提供 Logo 时，根据项目身份确定性生成母版；同一输入应得到同一结果。
3. 只从母版生成当前项目类型需要的派生资产，不维护另一宿主的资产。

Web 初始化同步：

- 根 `index.html` 的标题、描述和图标引用；
- `public/logo.png` 与 `public/favicon.png`；
- Landing 页面中的 Logo、项目名称与描述。

Extension 初始化同步：

- `assets/icon.png`；
- `package.json` 中的 Plasmo/Chrome manifest 项目身份；Plasmo 从 `assets/icon.png` 生成所需图标尺寸；
- Popup 与 Options 页面中的 Logo、项目名称与描述。

派生文件不是身份事实源。修改身份或品牌时应先更新 `.harness/project.json` 和 Logo 母版，再通过项目提供的品牌流程重新生成并验证派生资产。

初始化还会生成 `.env.development`、`.env.test` 与 `.env.production` 三份基础配置、类型化 `APP_CONFIG`、统一 logger、分页状态层及原生 Fetch 请求层。逻辑 `release` 映射到 `.env.production`；Web 暴露 `VITE_` 前缀，Extension 暴露 `PLASMO_PUBLIC_` 前缀。每份至少包含 `APP_ENV`、`API_BASE_URL`、`LOG_LEVEL` 和 `REQUEST_TIMEOUT_MS`。`.env` 及四种 `.env*.local` 隐式覆盖被明确禁止；只有当前进程可用当前宿主的四个已声明键覆盖选定 profile，未知公开键会失败。分页位置写入 sessionStorage，语言偏好写入 localStorage，认证 Token 默认只在当前运行上下文内存中保存；它们都不是环境变量。详细事实见 [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)、[`docs/LOGGING.md`](docs/LOGGING.md) 与 [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)。浏览器端配置可被用户观察，不能存放秘密。

## 生成项目的日常命令

Web 与 Extension 模板都必须提供同一组单包开发入口：

```bash
pnpm dev
pnpm build
pnpm build:development
pnpm build:test
pnpm build:release
pnpm test
pnpm typecheck
pnpm lint
pnpm env:validate
pnpm release:inspect
```

这些命令在各自项目内运行；`dev`、`test`、`typecheck`、全部 `build:*`、`build` 和 `release:inspect` 会在其适用阶段校验三份受管环境，`lint` 执行 ESLint 和严格中文声明注释门禁，格式命令只检查格式，它们都不重复读取运行配置。注释门禁的声明矩阵、邻接语义与精确排除只见 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) §3.1。`pnpm dev` 使用 development，`pnpm test` 使用 test；`pnpm build` 固定等于 `pnpm build:release`，使用逻辑 release 与 `.env.production`。`build:release` 在对应宿主构建后自动运行 `pnpm release:inspect`（Web 同一脚本还运行 `tsc --noEmit`）；Extension 会先运行 `pnpm harness validate`，确认显式 Parcel browser target 已把运行时依赖打进 Chrome bundle，再执行产物扫描，`pnpm package` 也执行相同两道门禁。检查在文件名层拒绝 `.env*` 与 `.map`；仅对受支持的可读文本扩展扫描非 Release BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、本机绝对路径与 `sourceMappingURL`。Extension 检查 `build/chrome-mv3-prod`，不会直接解包扫描 zip；它也不是通用秘密扫描器。`build:development` 和 `build:test` 是诊断构建，不能冒充发布候选。完整范围见 [`docs/LOGGING.md`](docs/LOGGING.md)。只有真实生成项目包含相应脚本且命令实际成功时，才能报告通过。

Web 额外提供 `pnpm routes:generate`。`dev` 与 `build` 通过 Vite Router plugin 生成路由树，`test` 与 `typecheck` 会先执行同一生成命令；`src/routeTree.gen.ts` 是被 Git、格式化器和 lint 忽略的临时生成文件，不进入模板或人工维护范围。路由组件默认按 route 自动拆包，只有真实 bundle 证据证明需要时才增加手工 `manualChunks`。

品牌变更后，重新派生当前宿主资产并校验项目：

```bash
pnpm harness brand refresh --logo /absolute/path/logo.png --brand-color "#4C6EF5"
pnpm harness validate
```

`brand refresh` 的两个选项都可省略；它不会添加、删除或切换宿主。

成功生成的下游是终端项目，不再保留 `pnpm instantiate`、`pnpm harness:init`、源专用 `$web-instantiate-project`、内部 init/instantiate tooling 或任何其他项目派生入口；只保留品牌刷新、校验、日常开发和 Harness 安全升级所需入口。源 Harness 的实例化/方法论文档也会被删除，剩余 `docs/` 按已选项目类型重写。

Harness 根目录当前提供以下维护门禁；根项目没有应用 `dev` 或 `build` 脚本：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm validate:harness
```

## 两种输出的目录大纲

Web 下游是一个平铺 Vite 单包：

```text
<web-project>/
├── .env.development
├── .env.test
├── .env.production
├── .harness/
│   ├── project.json
│   └── brand/logo-1024.png
├── public/
│   ├── logo.png
│   └── favicon.png
├── src/
│   ├── api/             # 原生 Fetch client 契约与真实业务域边界
│   ├── app/             # Providers、主题、QueryClient 与 Router 装配
│   ├── config/          # 环境 Schema 与冻结的 APP_CONFIG
│   ├── features/        # 按业务能力内聚组件、hooks、客户端状态与测试
│   ├── i18n/            # i18next 初始化、语言持久化与资源
│   ├── observability/   # 统一结构化 logger 与测试
│   ├── pagination/      # 规范化分页、sessionStorage 与受控交互
│   ├── routes/          # TanStack Router 文件路由
│   └── main.tsx
├── index.html
├── package.json
└── tsconfig.json
```

Extension 下游是一个平铺 Plasmo 单包：

```text
<extension-project>/
├── .env.development
├── .env.test
├── .env.production
├── .harness/
│   ├── project.json
│   └── brand/logo-1024.png
├── assets/icon.png
├── src/
│   ├── api/             # 原生 Fetch client 契约与真实业务域边界
│   ├── config/          # 环境 Schema 与冻结的 APP_CONFIG
│   ├── i18n/            # 语言偏好持久化
│   ├── observability/   # 统一结构化 logger 与测试
│   ├── pagination/      # 规范化分页、sessionStorage 与受控交互
│   ├── popup.tsx
│   ├── options.tsx
│   ├── style.css
│   └── ...              # 组件、状态、查询、i18n 与测试
├── package.json         # 同时承载 Plasmo/Chrome manifest 配置
└── tsconfig.json
```

具体文件以生成器当前输出为准；只有当前类型真实需要的入口才应存在。

Web 的依赖方向保持为 `main/app → routes → features → api`；跨 feature 的真实共享 UI 或纯逻辑出现后才增加有明确职责的模块。分页与请求层是明确受管的工程基础，不包含假列表或占位 API 请求；真实 endpoint 和登录入口仍由产品功能提供。

## “后续增减”的边界

后续增减指 **Harness 维护者**可以在未来增加或移除一种独立项目类型、模板能力或受支持技术，而不是让已生成的下游在同一仓库叠加另一宿主。

新增 Harness 类型时，必须同时提供独立模板、类型校验、品牌派生规则、测试与文档；移除类型时不得破坏已生成项目的维护与升级边界。已有下游若需要另一类型，应新建独立仓库，不能执行 target add/remove，也不能把 `projectType` 改成列表。

## Harness 目录入口

| 路径                                                                      | 作用                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                                  | Agent 的最少读取、任务路径、Skills 与约束地图       |
| [`.agents/skills/`](.agents/skills/)                                      | 13 个按触发条件读取的 `web-*` 项目 Skills           |
| [`.harness/tooling/`](.harness/tooling/)                                  | 初始化、品牌刷新和下游校验的 TypeScript 工具        |
| 生成项目中的 `.harness/project.json`                                      | 下游项目身份、唯一 `projectType` 与品牌的单一事实源 |
| [`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)                              | 数据访问、SSE 与可选 RxJS 事件流编排                |
| [`docs/MANTINE_UI_GUIDELINES.md`](docs/MANTINE_UI_GUIDELINES.md)          | Mantine UI 令牌、布局、组件、状态与无障碍规范       |
| [`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)          | 三环境、BaseURL、公开变量与构建模式                 |
| [`docs/LOGGING.md`](docs/LOGGING.md)                                      | 结构化日志、Release 脱敏与产物扫描                  |
| [`docs/`](docs/)                                                          | 工程、技术基线、发布、技术债与方法论                |
| [`Version.md`](Version.md)                                                | Harness 时间版本唯一事实来源                        |
| [`LICENSE.zh-CN.md`](LICENSE.zh-CN.md) / [`LICENSE.en.md`](LICENSE.en.md) | 中英文企业专有商业许可                              |

## 验证原则

- 涉及初始化器、类型生成/终端化或 Harness 发布候选时，必须分别在隔离目录验证 `web` 与 `extension`，并确认每个输出只有一个 `projectType`；无关文档、局部实现或单一宿主下游任务不重复执行双类型生成。
- Node.js、pnpm 与受控依赖按声明的稳定 SemVer（`x.y.z`）最低版本验收；`Version.md` 当前值、候选版本、源码提交、lockfile、Schema/协议版本、`manifest_version` 与 `projectType` 等身份或协议事实继续精确匹配。
- 三份环境必须同时齐全并通过 Schema 校验；`pnpm release:inspect` 必须按 [`docs/LOGGING.md`](docs/LOGGING.md) 在文件名层拒绝 `.env*`/`.map`，并只在受支持的可读文本扩展中扫描非 Release BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、本机路径与 `sourceMappingURL`，作为 `build:release`/Extension `package` 的自动失败门禁；它不提供通用秘密扫描。
- 行为变化至少运行相关非空单元/组件测试；文档与元数据变化运行链接、解析或差异检查。
- Web/Extension 的真实浏览器检查在 Agent Policy 选择或产品/安全/渠道硬要求时执行；选中后必须针对最终构建验证当前项目真实需要的页面、入口与权限行为。
- Mock、占位页面、开发预览或仅检查源码不能替代最终产物验收。
- 未实际运行的平台和浏览器范围必须标记为 `Unverified`。

详细规则见 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)、[`docs/MANTINE_UI_GUIDELINES.md`](docs/MANTINE_UI_GUIDELINES.md)、[`docs/TS_WEB_TEMPLATE.md`](docs/TS_WEB_TEMPLATE.md)、[`docs/DATA_ACCESS.md`](docs/DATA_ACCESS.md)、[`docs/RUNTIME_CONFIGURATION.md`](docs/RUNTIME_CONFIGURATION.md)、[`docs/LOGGING.md`](docs/LOGGING.md) 与 [`docs/RELEASE.md`](docs/RELEASE.md)。
