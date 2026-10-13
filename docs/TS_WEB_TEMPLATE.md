# TypeScript Web / Chrome Extension 单包模板

本文档定义 Bifang Web Harness Template 的初始化契约和固定技术基线。结论是：一次初始化只选择 `web` 或 `extension`，生成一个独立、平铺、可直接开发和发布的 pnpm 单包。

## SaaS 基础设计与创建选择

SaaS 客户端和大后台共用 [UI 基础设计](MANTINE_UI_GUIDELINES.md)：未登录默认登录、表单内紧凑偏好、完整工作区侧栏与账号菜单、底部身份/作用域、窄屏等价导航和可恢复状态。需求、可交互原型、实施复用同一 SOP；营销首页独立确认，客户端注册/组织切换与后台管理目标严格区分。

创建 `web + saas-client` 必须明确询问商品购买模块，包含商品选择、订单管理和钱包管理。交互建议关闭但等待实际回答；非交互必须传 `--saas-commerce enabled|disabled`。显式值复用，其他模式拒绝该参数。选择、来源与日期保留在 README 创建交接，首次 PRD 沿用；初始化仍不生成业务页面、PRD 或支付调用。

## 1. 不变量

- 唯一公开创建入口是源 Harness 根的 `pnpm instantiate -- <absolute-parent-outside-harness> ...`；在用户提供的源外父目录下，以项目标识创建子目录。
- 源 Harness 不提供 `pnpm harness:init` script；`pnpm harness init` 明确拒绝原地初始化。底层 initializer 只作为 `instantiate` 在目标同级 同级暂存目录 中调用的内部步骤。
- 非交互 CLI 必须传入 `--type web` 或 `--type extension`；交互式 TTY 必须提示用户选择且不得提供默认类型。
- 选择 Web 后必须显式选择 `webType`，不设默认值；工具站点、SaaS 客户端和大后台均可创建中性 Web 工程，并交接对应开发 SOP。该选择不增加宿主或改变 `.harness/project.json` 的 Schema。
- 生成项目的 `.harness/project.json.projectType` 恰好是 `web` 或 `extension`，不是数组。
- 不支持 `both`，不提供默认类型，也不提供下游 target add/remove。
- Web 与 Extension 是两个独立模板；它们不在同一仓库共存，不共享源码、状态、测试、品牌派生或构建产物。
- 输出是单个 pnpm package，不存在 `apps/`、`packages/` 或 workspace 内部依赖。根 `pnpm-workspace.yaml` 只配置 `allowBuilds`，不得声明 `packages` 或引入第二个包。
- 已生成项目不原地切换类型。需要另一宿主时，在另一个目录初始化新的独立仓库。
- 初始化同时建立 development、test、release 三个逻辑环境；逻辑 `release` 固定映射到 `.env.production`，不生成 `.env.release`。

## 2. 创建与内部初始化契约

从源 Harness 根创建独立 Web 目录：

```bash
pnpm instantiate -- /absolute/path --type web --web-type tool-site \
  --name "示例 Web" --english-name "Example Web" --policy-mode 预设
```

从同一个源 Harness 根创建独立 Extension 目录：

```bash
pnpm instantiate -- /absolute/path --type extension \
  --name "示例扩展" --english-name "Example Extension" --description "示例浏览器扩展。" --policy-mode 预设
```

位置参数是源 Harness 之外的绝对父目录；最终项目目录自动拼接为“父目录/项目标识”，该子目录必须不存在或为空。上述示例分别创建 `/absolute/path/example-web` 和 `/absolute/path/example-extension`。不要先复制模板并在副本内初始化，也不要直接调用底层 initializer。

- 项目类型显示 1.Web / 2.Extension；交互及 `--type` 均接受编号 `1` / `2` 或 `web` / `extension`，无默认值。
- `--name` 是用户可见名称。
- `--web-type` 仅用于 Web，必填且无默认值：`tool-site`（1.工具站点）、`saas-client`（2.SaaS客户端）和 `saas-admin`（3.SaaS大后台）均沿用中性 Web 工程初始化事务，不生成产品页面或业务 PRD。交互字段为 `webType`，接受编号、中文名称或稳定值；已提供的选择直接复用，明确 Web 后优先逐项补问。Extension 不接受该字段。明确选择保留在下游 README 创建交接，首次需求直接复用，不写入下游身份配置。
- 项目标识默认由项目名称的英文翻译自动生成小写 kebab-case，供包名、目录名和确定性品牌生成共用。Agent 负责翻译并传入 `--english-name`，不要求用户手填标识；英文显示名称可直接生成。纯终端无翻译能力时只补问英文译名，不使用拼音或父目录名推导；非交互中文名称需提供 `--english-name`。已有显式 `--id` 优先复用，仍须通过跨平台安全校验。英文译名仅作创建输入，不自动写入身份本地化。
- 非交互 `--policy-mode 预设|自定义` 必填，也接受 `recommended|custom`；自定义模式须显式提供五个 `enabled|disabled` 值。交互模式逐项问答，策略模式及自定义项展示建议默认值，题面明确“回车采用”后可接受；已有单项覆盖时建议自定义。预设模式不能混入单项覆盖。
- Web 的可选 `--description` 缺省或为空时使用显示名称。Extension 必须提供非空简短说明（最多 132 字符）；交互时询问缺失/非法项，非交互缺少说明在写入前拒绝。
- `--identity-i18n` 接受 §3.1 的 JSON 字符串；默认语言与名称/说明翻译保存在 `.harness/project.json`，UI 和 manifest 都消费同一事实。
- `--development-base-url` 可选，可后续配置。`--test-base-url` 与 `--release-base-url` 无需初始化时填写，也接受主动提供；未配值写为空字符串，禁止猜测地址。已填值必须是无凭据、query 或 fragment 的绝对 HTTP(S) URL，正式地址只接受 HTTPS；正式发布前及活动 Release 校验必须补齐正式地址。
- 确认来源不作为表单字段；`confirmed_by` 自动记录“当前用户”，可选 `--confirmed-by` 只用于复用已明确来源。`confirmed_at` 记录最终收齐时间。
- `--logo` 可选，指向用户授权读取的本地图像；缺省时根据项目身份和品牌色确定性生成。
- `--brand-color` 可选，使用 `#RRGGBB`；缺省为 `#4C6EF5`。例如追加 `--logo /absolute/path/logo.png --brand-color "#3B82F6"`。
- 初始化不接受 `--e2e`，也不在创建期构建 Release 产物；后续显式 `pnpm build` 解析或复用本次发布的 `--e2e=enabled|disabled` 选择。

基础字段按依赖顺序逐项引导，直接回答普通文本；主动提供多个字段的 JSON 仍复用。项目标识按英文名称自动生成，父目录与服务地址不猜测。最终汇总同时展示原始父目录、完整项目目录与规范路径。全部解析后才展示完整汇总并询问一次最终确认，空回答取消。参数的精确必填性、错误格式与帮助文本以 `pnpm instantiate` 的真实实现为准。未知参数、非法类型、非法 BaseURL、不可读 Logo、无效颜色、非空目标冲突、源内目标或路径越界属于预检失败，必须在生成项目文件前终止并保持目标零写入。`pnpm instantiate` 在目标同级 同级暂存目录 完成复制，通过内部初始化器 生成项目、只格式化本次生成/改写文件、执行静态结构校验并安装一次依赖；成功后才原子发布目标，失败时原先不存在的目标仍不存在，预存空目录仍为空。内部初始化器 还会拒绝源 Harness 根及其任意子路径；`pnpm harness init` 稳定拒绝，`pnpm harness:init` 不存在。完整环境契约见 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)。

生成器在当前类型 manifest 写入后执行一次 `pnpm install --no-frozen-lockfile --prefer-offline`，首次解析并固定 `pnpm-lock.yaml`。公开 CLI 不接受跳过安装或 Git 的参数；单元测试只能通过直接调用内部 TypeScript 接口注入跳过状态。后续 CI、复现和发布候选使用 frozen lockfile，并在 manifest 与 lockfile 不一致时失败。初始化不运行格式 CLI、lint、typecheck、全量测试或生产构建；这些完整门禁只由后续唯一 Release 构建入口拥有。

## 3. 项目身份与品牌事实

### Web 业务类型与创建选项的区别

三种创建期 `webType` 均可生成 Web 工程，选择保留在下游 README 的“创建交接”；不新增身份 Schema 字段或预建业务记录。首次需求复用明确选择，已有已确认 PRD 时以其当前模式为准。创建后的阶段与模式 SOP 统一见 [创建与开发 SOP](../.agents/skills/web-design-prototype/references/prd-outline.md#创建与开发-sop)。已初始化 Web 的业务模式另在下游唯一 PRD 中明确采用 `tool-site|saas-client|saas-admin`，客户端购买默认关闭，选择依据与日期一并记录。需求、原型、实施、服务接入和模块文档统一遵循 [Web 类型与可选能力](../.agents/skills/web-design-prototype/references/prd-outline.md#web-类型与可选能力)；通用能力分发不代表产品模式已采用或真实服务已接入。

### 3.1 单一事实源

`.harness/project.json` 保存项目名称、标识、描述、`projectType` 和品牌元数据。任何生成器、Skill 或维护脚本都应先读取并校验该文件；页面、manifest 与图标只消费它，不自行演化项目身份。

`projectType` 具有以下语义：

| 值          | 允许的宿主文件                                                                | 禁止出现的另一宿主                                |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `web`       | Vite、根 `index.html`、Web 页面与 `public/` 品牌资产                          | Plasmo manifest、Popup、Options、Extension icon   |
| `extension` | Plasmo/Chrome MV3 + Firefox MV2 manifest、Popup、Options 与 `assets/icon.png` | Vite Web Landing、Web favicon 与独立 Web 站内路由 |

手工编辑 `.harness/project.json` 可能造成派生内容漂移。身份或品牌变更应通过受管流程完成，并在同一事务中更新母版、当前宿主派生文件和验证结果。

名称与说明的默认语言及翻译使用如下初始化参数（Web 与 Extension 共用）：

```text
--identity-i18n '{"defaultLocale":"en","translations":{"zh_CN":{"name":"示例项目","description":"简短项目说明。"}}}'
```

根 `name` / `description` 表示默认语言，`translations` 只包含另一语言；当前支持英文 `en` 与简体中文 `zh_CN`，后者映射至现有 UI 的 `zh`。不提供该参数时默认 `en`，缺失翻译回退根身份。UI 通过 `projectName` / `projectDescription` 翻译键消费派生 `BRAND.identity`；不以浏览器语言覆盖用户的应用语言选择。品牌刷新保留 `identityI18n` 和消息文件中其他键；静态及现有产物校验拒绝消息缺失/漂移。

### 3.2 Logo 母版

`.harness/brand/logo-1024.png` 是 1024×1024 的规范母版：

- 上传模式：读取用户提供图像，校验格式与尺寸，按规范缩放/留白并输出 PNG 母版；不得覆盖用户原文件。
- Agent 创建路径显式调用 `$web-prepare-brand-identity`，先生成/导入并展示 Logo 候选，临时文件位于源和目标之外，选中图像通过 `--logo` 导入。CLI 无图像生成服务依赖；未给源图时使用离线生成器，并在汇总与完成输出列出母版、Web Logo/Favicon 或 Extension icon。
- 离线生成模式：以稳定项目标识、名称和品牌色为输入，确定性生成母版；同一输入和模板版本必须得到相同字节或等价的稳定像素结果。
- 所有派生资产从母版生成。派生失败必须使初始化报错，现有文件不能被宣称为完成项目。
- 母版与项目事实需要一并纳入版本控制；临时源文件和绝对上传路径不应成为运行时依赖。

### 3.3 Web 品牌同步

Web 初始化必须同步：

- `public/logo.png`：页面使用的 Logo；
- `public/favicon.png`：浏览器标签图标；
- 根 `index.html`：title、description、favicon 引用与挂载点；
- Landing 页面：Logo、项目名称、描述、当前主题色与当次构建版本。

这些文件不得包含 Extension 项目名、Popup/Options 文案或 Chrome manifest 配置。

### 3.4 Extension 品牌同步

Extension 初始化必须同步：

- `assets/icon.png`：Plasmo 用于生成 Chrome/Firefox 所需图标尺寸的来源；
- `package.json`：根包版本、manifest 的 `name: __MSG_projectName__`、`description: __MSG_projectDescription__` 与显式 `default_locale`，以及真实需要的权限；
- 根 `locales/en/messages.json` 与 `locales/zh_CN/messages.json`：由身份事实派生，Plasmo 输出为 `_locales/`；不要写入 `src/locales/`；
- `src/popup.tsx`：Popup 中的 Logo、名称、描述、当次构建版本和主交互入口；
- `src/options.tsx`：Options 中的 Logo、名称、描述、当次构建版本和设置入口。

Plasmo 稳定依赖固定 `0.90.5`。同一个 `projectType=extension` 单包默认维护 Chrome MV3 与 Firefox MV2；Firefox MV3 仍是框架实验能力，不属于当前交付目标。`pnpm dev` 使用 Chrome，`pnpm dev:firefox` 使用 Firefox；`pnpm build` 和 `pnpm package` 在公共门禁通过后分别以 `--target=chrome-mv3`、`--target=firefox-mv2` 构建两套 production 产物，固定 `--tag=prod --build-path=build --src-path=src --env=.env.production`，随后统一检查两个目录。

最终 `manifest.json` 由 Plasmo 按目标动态生成，不维护两份手写清单。共享 `package.json.manifest` 只保存身份、语言和真实功能覆盖项，不固定 `manifest_version`；[Plasmo MV2 工厂](https://github.com/PlasmoHQ/plasmo/blob/v0.90.5/cli/plasmo/src/features/manifest-factory/mv2.ts) 按目标生成默认 action/browser_action 与后台入口，并转换 host permissions、CSP 和可访问资源；浏览器专有的手写 override 使用当前固定版本支持的 `manifest.overrides.chrome` / `manifest.overrides.firefox` 分别适配，不能期待 Plasmo 转换任意手写后台/action 字段；[官方源码](https://github.com/PlasmoHQ/plasmo/blob/v0.90.5/cli/plasmo/src/features/manifest-factory/base.ts#L627-L631) 按浏览器名顶层浅合并，覆盖值使用各目标最终协议形态。Harness 对 `build/chrome-mv3-prod` 与 `build/firefox-mv2-prod` 分别检查版本、入口、协议、本地化、bundle 和 Release 泄漏，任何目标缺失或失败都不能接受整套候选。

不要维护一组与 `assets/icon.png` 重复且易漂移的手工图标声明。只有产品真实需要时才新增 background、content script、side panel 或其他入口。

### 3.5 运行时配置与日志基线

两种项目都必须生成 `.env.development`、`.env.test` 与 `.env.production`，以及 `src/config/environment.schema.ts`、`src/config/environment.ts` 和对应非空测试。逻辑 `release` 读取 `.env.production`；Web 使用 `VITE_`，Extension 使用 `PLASMO_PUBLIC_`。每份配置至少包含宿主前缀后的 `APP_ENV`、`API_BASE_URL`、`LOG_LEVEL` 与 `REQUEST_TIMEOUT_MS`，业务代码只读取冻结的 `APP_CONFIG`。

两种项目也都生成 `src/observability/logger.ts` 与非空测试。产品代码通过统一 logger 写结构化 `timestamp`、`level`、`scope`、`event`、`environment` 和可选 `context`；Release 只输出 `warn`/`error`，并按批准 allowlist 裁剪上下文。详细字段、校验、脱敏和产物扫描分别以 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) 与 [`LOGGING.md`](LOGGING.md) 为准。

### 3.6 分页、语言与 HTTP 基线

两种项目都生成 `src/pagination/`、`src/data/api/client/`、`src/i18n/language.ts` 和对应非空测试，但不生成真实 endpoint、登录页、refresh/replay 或占位网络调用：

- 分页以 1-based `page`、`10|20|50|100` 的受控 `pageSize`、`items` 与非负安全整数 `total` 为内部结构，默认 `{ page: 1, pageSize: 20 }`。sessionStorage 只保存按项目 ID、Schema 版本和稳定 scope 隔离的 `{ version: 1, page, pageSize }`；切换 `pageSize` 回第一页。
- 只有与当前 page/pageSize 对应、明确 success、非 fetching/loading/placeholder 且 `items` 为空的非第一页结果可以回退第一页；旧响应、错误和暂时空态保持当前位置。这是通用 session 分页状态机；Web 路由列表按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 的封闭 Router 恢复契约特化。生成的组件/hook 不自动挂进非分页 Landing、404、Popup 或 Options。
- Ky HTTP client 当前只接受冻结 `APP_CONFIG` 单一 BaseURL 边界内的相对路径，并拒绝绝对 URL、越界路径和 redirect；未来多 target 由真实域 adapter 与只读 registry 加入。每次 dispatch 动态发送有值的 `X-Http-Request`、`X-Lang` 与 `X-AUTH-TOKEN`；continuation 和 Token 自动更新只从同一受控 API 边界的 2xx 响应提取，真实登录成功另可经校验后调用 `applicationHttp.setAuthToken` 显式建立会话，并用 sequence/revision 防止乱序覆盖。
- `X-Http-Request` 是服务端签发、供后续请求传播的 opaque continuation/correlation 值，不是客户端 request-id。语言偏好按项目命名空间写入 localStorage，异常时回退浏览器语言与英文；基础 client 的 Token/continuation 只保存在当前执行上下文内存，禁止写入环境、localStorage、sessionStorage 或日志。明确采用 SaaS 认证的 Web 可由认证 feature 按 `DATA_ACCESS.md` §1.3 的限定例外持久化会话凭据；continuation 与 Extension 不适用。
- 401 只在当前请求使用的 Token 仍为当前 revision 时清理它与同一会话的 continuation，并通过 single-flight `UnauthorizedHandler` 调用真实宿主 adapter。同一失效周期只调用一次；Web 只有存在真实登录 route 后才注入 `router.navigate`，Extension 只有存在真实登录入口后才接入本入口 Router 或宿主 adapter，也不虚构 background、登录页或跨 Popup/Options 共享会话。
- `applicationHttp` 惰性创建当前上下文的唯一会话；`requestHttpQuery` 把中间尝试交给 Query，读取只对安全可重试错误最多重试两次，mutation 不自动重试。Providers 已挂载固定翻译的持续反馈，Web/Extension Router 接入统一错误页：401 提示认证，403 保留会话，无虚构登录动作；其他错误按恢复能力显示读取重试。详情以 [`DATA_ACCESS.md`](DATA_ACCESS.md) §3 为准。
- 基线声明 Ky 运行时依赖，关闭传输层重试、超时与 HTTP 抛错，复用既有 client 安全语义。真实 openapi-fetch adapter、CORS、Cookie、跨域 endpoint 与 Extension 跨上下文认证仍按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 单独落地；配置 BaseURL 不自动新增 `permissions` 或 `host_permissions`。

### 3.7 Mantine UI 规范基线

两种项目都必须生成 `docs/MANTINE_UI_GUIDELINES.md`，由源 Harness 的同名唯一事实源按当前 `projectType` 派生：共同 theme、令牌、组件语义、状态、响应式、无障碍与 i18n 规则保留，只携带 Web 或 Extension 当前宿主章节，不把另一宿主的布局约定写入终端项目。生成的 `AGENTS.md`、`docs/README.md` 与 `docs/ENGINEERING_RULES.md` 必须为 UI 任务提供读取入口，`pnpm harness validate` 必须拒绝规范缺失。

该规范不要求初始化器预装 `@mantine/form`、`@mantine/notifications` 等可选包，也不把最小 Landing、Popup 或 Options 宣称为完整业务设计系统。真实 UI 开始实施时以 Mantine theme 和当前包内受控样式落实规范，不建立第二套基础组件库或跨宿主源码共享层。

### 3.8 Web 专属 列表治理基线

- 源 Harness 保留 Extension 专属 `$web-review-extension-compatibility`，只分发到 Extension 下游；真实 HTTP 接入使用两宿主通用 `$web-connect-http-service`。两宿主均分发 `$web-audit-worktrees` 与 `$web-preview-harness-upgrade`，分别复用并行登记检查和升级 plan，不授予创建、清理或应用权限。初始化只分发能力，不执行产品接入或专项审查。
- 源 Harness 保留 `$web-implement-list-view` 的 Skill、references 与中性资产；`projectType=web` 终端保留该 Skill，`projectType=extension` 终端必须裁掉它。
- 该能力只在 Web 下游真实出现列表页、数据表格、后台列表或搜索结果时调用；不把 Extension Popup/Options 视为可共享宿主。
- 初始化不生成业务列表、列表 route、假 endpoint、选择或列偏好 UI，也不因保留 Skill 预装图标、DnD 或其他可选依赖。
- 列表页仍复用 `src/pagination/` 的 1-based page/pageSize 契约；Router search 的封闭启动恢复、Query 对 rows/`total` 的唯一所有权和稳定排序详见 [`DATA_ACCESS.md`](DATA_ACCESS.md)，Table/卡片/搜索形态与条件 DnD 详见 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md)。

两宿主均分发 API 契约核对、模块边界审查、访问控制、写入恢复、浏览器存储、持续事件流及用户可见 Task 的独立 Skill；只按事件调用，叶子返回当前流程，不反向重启编排。源 33 个、Web 30 个、Extension 27 个维护 Skills，设计支持另计；职责地图见 [Skill 职责与组合](harness_engineering/skill_composition.md)。

### 3.9 项目级设计支持基线

- 两种终端同时携带 `$web-define-product`、`$web-design-prototype` 与 `$web-implement-change` 的完整项目级 Skill、发现元数据、PRD 结构参考和选择 helper。初始化只复制能力，不执行需求澄清/PRD/原型选择、不增加业务表单、不生成 `docs/product_spec/` 或 `docs/prototypes/`，不读取或写入全局 Skills。
- 下游实际开发才运行“澄清 → 唯一 Product Spec（PRD）→ 默认 2–3 个交互 HTML 方案 → 用户选择具体版本 → 开发”；详细合同在 [`web-design-prototype`](../.agents/skills/web-design-prototype/SKILL.md)。选择记录绑定 PRD 和候选 SHA-256，漂移需重新选择；日常小修复不自动重走流程。

- Web 与 Extension 初始化默认检查项目内 `.agents/skills/design-taste-frontend/SKILL.md`；有效已有版本连同辅助文件原样保留，缺失时自动安装，无额外用户问询，不读取或写入全局 Skills。
- 安装使用 `.harness/vendor/design-taste-frontend/` 中固定的 [Taste Skill](https://github.com/leonxlnx/taste-skill) 快照；原文、MIT 许可证及 `UPSTREAM.json` 记录的 commit/SHA-256 一并复制。源门禁和补装计划独立验证原文及许可证哈希；不执行上游安装器、`npx`、网络请求或依赖安装。
- 检查与补装属于既有 同级暂存目录 事务；非法已有目录、损坏快照或来源不匹配使创建失败，目标保持零写入。源快照和安装器在终端化时移除，仅保留项目级支持 Skill 与必要验证模块。
- 设计支持独立于 `AGENTS.md` Skills 地图中的 canonical `web-*` Skills 计数；新下游在该计数上各多一个。升级将设计 Skill 视为 `protected`，不覆盖用户版本，也不向旧下游补写；终端维护门禁允许旧下游缺失该支持 Skill，存在时必须有效，新下游创建门禁仍保证默认安装。
- 适用页面、工程规范优先级和外部动作边界以 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) §1.1 为准。

## 4. Web 技术基线

| 能力            | 选型                                           | 边界                                                                                    |
| --------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| 构建与开发      | Vite                                           | 只服务当前 Web 单包                                                                     |
| UI              | React + TypeScript + Mantine                   | theme 与 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) 承载统一视觉语言        |
| 路由            | TanStack Router 文件路由                       | Vite plugin 生成路由树并自动 route 拆包                                                 |
| 异步数据        | TanStack Query                                 | 负责远端数据、缓存、重试和失效                                                          |
| HTTP 与分页     | Ky HTTP + 统一分页基础                         | 生成 client/测试但不生成业务 endpoint                                                   |
| SaaS 认证       | `$web-implement-saas-auth`                     | 仅已初始化 Web 明确选择客户端/大后台时触发；初始化只分发，成功下游复用创建选择进入 SOP  |
| 可选 SaaS 购买  | `$web-implement-saas-commerce`                 | 默认关闭，仅已初始化 Web SaaS 客户端明确选中后应用；提供购买、订单与钱包 SOP 和中性参考 |
| SaaS 大后台管理 | `$web-implement-saas-admin`                    | 仅已初始化 Web 明确采用大后台时应用；提供商品分类、组织成员、订单与权限审计 SOP         |
| 列表页          | `$web-implement-list-view`                     | 仅真实重复记录页触发；不强制 Table/DnD，不在初始化中生成业务 UI                         |
| 实时数据        | 按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 按需选择 | 初始化不预装 SSE 客户端                                                                 |
| 事件流编排      | RxJS（按需）                                   | 只有真实多来源或复杂时序需求时安装                                                      |
| 客户端状态      | Jotai                                          | 只保存需要跨组件共享的客户端状态                                                        |
| 国际化          | i18next                                        | 用户可见文案使用翻译键                                                                  |
| 运行时配置      | 类型化 `APP_CONFIG`                            | `VITE_` 三环境公开配置，不承载秘密                                                      |
| 日志            | 统一结构化 logger                              | Release 裁剪、脱敏并扫描最终产物                                                        |
| 测试            | Vitest + Testing Library                       | 测用户可观察行为；E2E、完整验收 smoke 或硬要求需要时加真实浏览器验证                    |

Web 输出是普通浏览器页面，不携带 Chrome Extension 权限、manifest、Popup 或 Options。需要浏览器特有能力时，应先判断产品是否应该作为新的独立 Extension 项目初始化。生成的分页/Ky HTTP 基础与未来 REST/OpenAPI、GraphQL、SSE、可选 RxJS 的认证、CORS、缓存和状态所有权边界以 [`DATA_ACCESS.md`](DATA_ACCESS.md) 为准；模板没有真实登录 route 时不得宣称 401 已能跳转。

### 4.1 Web 目录与路由职责

```text
src/
├── data/
│   ├── README.md
│   ├── api/
│   │   ├── README.md
│   │   └── client/             # Ky、会话、错误与对应测试
│   └── storage/
│       ├── README.md
│       ├── webStorage.ts
│       ├── webStorage.test.ts
│       └── colorScheme.ts
├── app/
│   ├── AppProviders.tsx
│   ├── queryClient.ts
│   ├── router.tsx
│   └── theme.ts
├── config/
│   ├── environment.schema.ts
│   ├── environment.test.ts
│   └── environment.ts
├── features/
│   ├── not-found/NotFoundPage.tsx
│   ├── route-state/RouteState.tsx
│   └── welcome/
├── i18n/
│   ├── index.ts
│   ├── language.test.ts
│   ├── language.ts
│   └── locales/
├── observability/
│   ├── logger.test.ts
│   └── logger.ts
├── pagination/
│   ├── PaginationControls.tsx
│   ├── pagination.test.tsx
│   └── useSessionPagination.ts
├── routes/
│   ├── __root.tsx
│   └── index.tsx
└── main.tsx
```

- `app/` 只装配全局 Provider、主题、QueryClient 与 Router；`routes/` 使用 TanStack 文件命名约定声明 URL、loader/search/context 等路由契约；具体业务 UI、hooks、Jotai atom 和测试留在 `features/`。
- 初始化的 `__root.tsx` 与 `index.tsx` 只是中性起点，产品可用布局和子路由替换首页，不要求永久保留 `index.tsx`。持续 shell、pathless 认证布局、叶页面与正文插槽按 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) §8.5 实施，不在初始化中生成 SaaS 页面。
- `src/routes/` 只放路由模块，不使用 `.test.tsx`、`.spec.tsx` 等测试后缀命名生产路由。业务页面需要 `test` URL 段时可用嵌套的 `app/test.tsx`，测试留在对应 feature；中性 Vite 配置也明确忽略测试后缀，防止误收路由。
- Vite 配置必须把 TanStack Router plugin 放在 React plugin 之前，并显式启用 `autoCodeSplitting`。route 组件按路由边界形成异步 chunk；共享依赖由 Vite/Rollup 根据真实引用处理，不在模板中预设手工 vendor 分组。
- `src/routeTree.gen.ts` 由 dev/build 的 Vite plugin 或 `pnpm routes:generate` 动态生成，被 `.gitignore`、Prettier 和 ESLint 排除，不由生成模板写入，也不得手工编辑。`typecheck` script 先生成它；导入完整应用 Router 的测试先运行 `pnpm routes:generate`，中性页面和路由状态测试不依赖该临时文件。
- `data/api/client/` 是初始化生成的 Ky HTTP 基础，统一受控 BaseURL、三个 header、timeout/取消、并发 revision、`ApiError`、Token setter 与 401/403 反馈；它不包含真实 endpoint、refresh/replay 或登录地址。真实业务出现后才在 `data/api/` 下增加按域划分的 service；Ky 传输与 OpenAPI adapter 不得复制第二套请求上下文。
- `data/storage/` 集中 Cookie、LocalStorage、SessionStorage、Memory 与 IndexedDB 的访问；Dexie 只用于 IndexedDB，REST/GraphQL 分工与按需目录见 [`DATA_ACCESS.md`](DATA_ACCESS.md) §1.1–1.3。
- `pagination/` 提供所有真实集合页复用的分页状态机、hook、受控组件与成功空页 reconciliation。TanStack Query 的 key、缓存、mutation、失效、`items` 与 `total` 属于消费端 feature，服务器状态不得复制进 Jotai 或分页 Storage。
- 真实 Web 列表页使用 `$web-implement-list-view`：复用 `pagination/` 的页码/pageSize 基础，但由类型化 Router adapter 拥有已应用状态；sessionStorage 仅在原始 URL 无 owned key 时做一次启动恢复，不挂载第二份 session 状态。业务行、`total`、错误和请求结果继续只属于 Query/feature。
- 文件结构与依赖遵循 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §3.2：`main/app → routes → features → pagination/data` 表达责任方向，入口可直接装配所需下层，route 可消费必要数据/Query 契约，不要求逐层转发。API 与分页基础不反向依赖具体 route 或 feature，401 client 只接受宿主注入的窄 handler；跨 feature 只消费明确公共契约并保持无环，共享只随真实复用提取。

### 4.2 Web 功能覆盖与设计触发

固定栈不等于完整产品。下表区分当前生成代码与已有设计规则，避免把“未预装业务功能”误判为模板缺陷；详细 UI、数据与交付契约仍由各自唯一事实源维护。

| 能力                         | 当前覆盖                                                                      | 下一次真实设计触发                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 品牌、亮暗主题、语言和无障碍 | 已生成主题、外观偏好、i18n/lang、基础语义与测试                               | 新 surface、品牌或真实交互出现时按 UI 规范验证对比度、键盘与回流                                                                             |
| 页面与路由状态               | 已生成 Landing、404、统一 pending/error、显式重试和真实 Router 测试           | 首次多页面定义标题、焦点、导航、滚动与离开阻断，见 UI 规范 §8                                                                                |
| 表单与设置                   | Mantine 输入及基础提交/错误/草稿规则；不生成业务表单                          | 真实字段与校验协议明确后实现；复杂表单才评估 `@mantine/form`，见 UI 规范 §5.2                                                                |
| 远端读写与缓存               | 已生成 Ky HTTP、ApiError、Query 有界读取重试、mutation 不重试、统一反馈和分页 | 首次 endpoint 确定 Schema、运行时校验、Query key、mutation 与缓存策略，见数据规范 §2.6/§3                                                    |
| 登录、授权与私有会话         | 已生成 Token setter/revision、401/403 handler 与本地化状态                    | 真实认证协议、登录入口、权限模型与 scope 明确后设计会话及缓存清理；不预置登录页                                                              |
| 文件、富交互与实时数据       | 只保留现有组件与按需选型规则                                                  | 真实消费者明确后设计大小/格式/取消、渲染边界或连接生命周期；不预装上传、编辑器、图表或事件流包                                               |
| 导航与应用布局               | 单页中性布局，AppShell 按需                                                   | 持续导航出现后设计移动导航、主内容入口、弹层与滚动容器；不生成空菜单                                                                         |
| 部署、SEO 与运行性能         | 根路径 Vite SPA、路由自动拆包、Release 扫描                                   | 首次真实渠道确定深链接回退、CSP、缓存、资源地址；需要搜索索引或分享预览时先评估静态 SPA 能否满足，再决定预渲染/SSR，不把框架切换当初始化步骤 |

### 4.3 站点路径边界

当前 Vite、Router、`/logo.png` 与 `/favicon.png` 默认从站点根路径提供；三环境 API BaseURL 不是站点部署路径。子路径渠道出现时必须同步 Vite `base`、Router `basepath`、公共资源引用及 fallback，不能只改其中一项。部署契约、缓存、CSP 与深链接刷新验证以 [`RELEASE.md`](RELEASE.md) 为准；初始化成功不证明任何线上渠道可达。

## 5. Extension 技术基线

| 能力        | 选型                                           | 边界                                                                                |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| 构建与开发  | Plasmo + Chrome MV3 + Firefox MV2              | 只服务当前 Extension 单包                                                           |
| UI          | React + TypeScript + Mantine                   | Popup/Options 各自挂载并遵循 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md) |
| 路由        | TanStack Router 代码路由                       | Popup memory history；Options hash history；各自持有 Router 实例                    |
| 异步数据    | TanStack Query                                 | 负责异步数据与缓存，不包装全部浏览器 API                                            |
| HTTP 与分页 | Ky HTTP + 统一分页基础                         | 无业务 endpoint 或预置 host permissions                                             |
| 实时数据    | 按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 按需选择 | 初始化不预装 SSE 客户端                                                             |
| 事件流编排  | RxJS（按需）                                   | 仅限当前执行上下文，不替代浏览器消息                                                |
| 客户端状态  | Jotai                                          | 当前扩展包内的跨组件 UI 状态                                                        |
| 国际化      | i18next                                        | Popup/Options 等用户可见文案使用翻译键                                              |
| 运行时配置  | 类型化 `APP_CONFIG`                            | `PLASMO_PUBLIC_` 三环境公开配置，不承载秘密                                         |
| 日志        | 统一结构化 logger                              | Release 裁剪、脱敏并扫描最终产物                                                    |
| 测试        | Vitest + Testing Library                       | 浏览器 API 按目标受控替换；适用 E2E/smoke/硬要求时逐个使用真实 Chrome/Firefox       |

Extension 基线在 Popup 与 Options 分别挂载 TanStack Router，使用共享的代码路由工厂而非 Web 文件路由生成器。中性基线各只有一个根页面；真实页内导航随产品需求加入，不让两个入口共享内存路由状态。

Extension 不保留或调用 `$web-implement-list-view`，也不复用其 Web 列表 URL/session 恢复、图标或 DnD 路径。

Extension 与 Web 生成相同的 `src/pagination/` 和 `src/data/api/client/` 本地工程契约，但每个 Popup、Options、content script 或 service worker 都有独立的 JavaScript 执行上下文。sessionStorage、内存 Token/continuation 与 401 single-flight 不跨上下文；初始化不为了共享它们增加 background、`storage`、消息入口或权限。产品确需跨上下文认证时必须先定义唯一所有者、类型化消息、生命周期和拒绝路径，再取得权限/隐私批准并进入真实 Chrome/Firefox 验证门禁。

Extension 的 `package.json.targets.default` 必须显式声明 `context: "browser"` 与 `includeNodeModules: true`，`@parcel/resolver-default.packageExports` 必须为 `true`。这不是 Chrome manifest 权限，而是 Parcel 打包边界：React、Mantine、TanStack Router、TanStack Query、Jotai、i18next 等运行时依赖必须进入最终浏览器 bundle，TanStack Router 的 `isServer` 子路径必须选择浏览器条件入口，不得留下浏览器无法解析的裸包 self-map。

Chrome MV3 与 Firefox MV2 兼容约束：

- 权限、host permissions、content script 匹配范围和 Web accessible resources 按真实功能最小化；
- 不使用远程托管可执行代码、`eval` 或宽泛 CSP；
- 消息、Storage 和外部响应进入业务逻辑前校验；
- Chrome MV3 service worker 可能随时回收；Firefox MV2 使用后台 scripts/page，不能把后台页持久运行作为共同前提。监听器及时注册，状态由批准的持久化或消息所有者恢复；
- 真实跨域 endpoint 按执行上下文满足门禁：Chrome MV3 特权上下文使用精确最小 `host_permissions`，Firefox MV2 使用 Plasmo 转换后的 `permissions` host patterns。Chrome content script 受页面同源/CORS 限制，Firefox MV2 的 Fetch 可拥有额外跨域特权；公共实现通过类型化消息请求受控跨域操作，不能依赖 Firefox 的特权作为两浏览器共同能力。生成 client 和公开 BaseURL 不自动授予 origin 访问能力；
- Popup、Options、content script 与 service worker 之间使用类型化浏览器消息或 Port；RxJS 只能在各自上下文内编排，不能提供跨上下文或持久状态；
- 只有 manifest 与最终构建真实包含的入口才能写入文档和验收结论。

生成的 Ky HTTP client、三个 header、Token/401、统一分页，以及未来 REST/OpenAPI、GraphQL、SSE 与可选 RxJS 的认证、多基地址、长连接生命周期和状态投影都以 [`DATA_ACCESS.md`](DATA_ACCESS.md) 为准；增加跨域 endpoint 时必须按真实消费者单独评审 CORS、最小 `host_permissions` 与真实 Chrome/Firefox 失败路径。

Agent 在未来每次 Extension 开发中自行核对 [Mozilla 跨浏览器指南](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension) 与对应 Chrome API 文档，负责两目标兼容。API 支持/参数、callback 与 Promise、异步消息响应、权限、content script 隔离、后台生命周期及 `chrome-extension://` / `moz-extension://` URL 不能视为一致；只为真实消费者建立类型化 adapter、能力检测或 Plasmo 目标入口，不预装 polyfill。日常变更覆盖受影响目标的成功与拒绝/不支持路径；候选浏览器门禁逐个执行，一个目标通过不能代表另一个。

Firefox production 目录可按 [官方临时加载流程](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) 在隔离浏览器配置 的 `about:debugging` 选择 `manifest.json`。真实 AMO 发布时再确认稳定 Gecko ID、当前签名和按产品实际行为填写的数据收集声明；构建不伪造商店身份或隐私事实。

## 6. 单包目录基线

Web：

```text
.env.development
.env.test
.env.production
.harness/project.json
.harness/brand/logo-1024.png
public/logo.png
public/favicon.png
src/data/README.md
src/data/storage/README.md
src/data/storage/webStorage.ts
src/data/storage/webStorage.test.ts
src/data/storage/colorScheme.ts
src/data/api/README.md
src/data/api/client/httpClient.ts
src/data/api/client/httpClient.test.ts
src/data/api/client/httpErrors.ts
src/data/api/client/httpFeedback.ts
src/data/api/client/httpRuntime.ts
src/data/api/client/HttpErrorView.tsx
src/data/api/client/httpInterception.test.ts
src/data/api/client/httpUi.test.tsx
src/app/
src/config/environment.schema.ts
src/config/environment.ts
src/config/environment.test.ts
src/features/
src/i18n/locales/
src/i18n/language.ts
src/i18n/language.test.ts
src/observability/logger.ts
src/observability/logger.test.ts
src/pagination/PaginationControls.tsx
src/pagination/useSessionPagination.ts
src/pagination/pagination.test.tsx
src/routes/
src/theme/brandScale.ts
src/theme/brandScale.test.ts
src/theme/ColorSchemeControl.tsx
src/main.tsx
index.html
package.json
tsconfig.json
```

Extension：

```text
.env.development
.env.test
.env.production
.harness/project.json
.harness/brand/logo-1024.png
assets/icon.png
src/
  data/README.md
  data/api/README.md
  data/storage/README.md
  data/storage/webStorage.ts
  data/storage/webStorage.test.ts
  data/storage/colorScheme.ts
  data/api/client/httpClient.ts
  data/api/client/httpClient.test.ts
  data/api/client/httpErrors.ts
  data/api/client/httpFeedback.ts
  data/api/client/httpRuntime.ts
  data/api/client/HttpErrorView.tsx
  data/api/client/ExtensionRouteErrorPage.tsx
  data/api/client/httpInterception.test.ts
  data/api/client/httpUi.test.tsx
  config/environment.schema.ts
  config/environment.ts
  config/environment.test.ts
  i18n/language.ts
  i18n/language.test.ts
  observability/logger.ts
  observability/logger.test.ts
  pagination/PaginationControls.tsx
  pagination/useSessionPagination.ts
  pagination/pagination.test.tsx
  theme/brandScale.ts
  theme/brandScale.test.ts
  theme/ColorSchemeControl.tsx
  extension-router.tsx
  popup.tsx
  options.tsx
  style.css
  ...
package.json
tsconfig.json
```

模板可以因真实职责增加当前宿主需要的文件，但不得为了目录对称生成空入口，也不得加入另一宿主的结构。

## 7. 生成项目命令契约

两种项目都提供以下单包脚本：

```bash
pnpm dev
pnpm build
pnpm build -- --e2e=disabled
pnpm test
pnpm test:related <changed-source...>
pnpm typecheck
pnpm lint
pnpm source-size:check
pnpm env:validate
pnpm release:inspect
```

命令名相同但宿主行为不同。Web 由 Vite 驱动，Extension 由 Plasmo 驱动；`dev` 使用 development，Vitest 使用 test，`build` 固定委派 `build:release` 并读取 `.env.production`。development/test 不提供产物脚本。日常实现只运行本次变化需要的相关非空测试或最小替代检查，通常使用 `test:related`，空相关批次必须回退到所属非空测试文件；不自动追加格式、lint、类型、全仓检查或构建，行为保持重构才运行全量 `test`。`lint` 执行 ESLint、中文声明注释与 500/600 行源码体积门禁，格式命令只检查格式。详细声明矩阵、精确排除与体积边界以 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §3.1、§4 为准。

`build:release` 是唯一最终产物入口。同一发布流程复用已明确的 E2E 选择，尚无选择且无硬要求时才询问一次；非交互入口必须传 `--e2e=enabled|disabled`。随后在宿主生产构建前后自动执行完整环境、Harness、格式、lint、类型、测试与版本注入门禁，详见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2 与 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) §5；Extension `package` 对同一 Release profile 执行相同门禁后生成 zip。`env:validate` 的 profile 覆盖规则见 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md) §5，产物扫描规则见 [`LOGGING.md`](LOGGING.md)。

Web 还提供 `pnpm routes:generate`。`dev`/`build` 通过 Vite plugin 再生路由树，`typecheck` 在自身命令中先生成；该生成文件不进入 Git，也不进入注释或源码体积门禁。Extension 不包含 Router plugin、CLI 或路由生成脚本。

当前类型的品牌刷新与结构校验使用：

```bash
pnpm harness brand refresh [--logo <path>] [--brand-color <#RRGGBB>]
pnpm harness validate
```

方括号表示可选参数，不应原样输入。品牌刷新只更新母版、当前宿主派生与事实源，不提供项目类型切换。

## 8. 初始化完成条件

初始化只有同时满足以下条件才算完成：

1. 非交互 `--type` 或无默认值的交互提示已解析为一个合法值，`.harness/project.json.projectType` 与之相同；Web 已显式选择三种合法类型之一，README 创建交接保留准确选择，首次 PRD 不重复询问模式。
2. 目标中只有当前宿主文件，不含另一宿主或 monorepo 痕迹。
3. `.harness/brand/logo-1024.png` 存在，当前宿主品牌派生齐全且身份一致。
4. JSON 与 TypeScript 配置可解析，依赖和脚本与当前宿主匹配。
5. 三份环境文件齐全且宿主前缀正确，`APP_CONFIG` 和 logger 测试非空；初始化器直接验证全部环境，Release 配置使用 HTTPS 且日志最低级别为 `warn`。后续 `pnpm env:validate` 与最终构建仍独立复核该契约。
6. `src/pagination/`、`src/data/api/client/`、语言持久化和对应非空测试齐全；validator 锁定文件、接线与关键安全结构锚点，非空行为测试锁定 page/pageSize 状态机、三个 header、内存 Token/continuation、revision、`ApiError` 与 single-flight 401 语义。package manifest 声明 Ky 运行时依赖而不预装 Axios，Extension manifest 仍无预置权限。
7. 基线没有业务 endpoint、虚构登录 route、refresh/replay、Cookie 策略或对静态页面的假分页接线；真实 CORS、登录导航和 Extension 跨上下文/远端访问明确保持 `Unverified`，直到产品实现并完成相应门禁。
8. 普通首次安装已通过一次 `pnpm install --no-frozen-lockfile --prefer-offline` 生成与 manifest 一致的 `pnpm-lock.yaml`；公开 CLI 不提供跳过安装入口，内部单元测试注入跳过状态时必须明确断言安装未执行。
9. 初始化期没有运行 `pnpm build`，目标内不存在 `dist/`、`build/` 或 zip，E2E 尚未选择。生成项目仍只提供唯一 Release 产物入口；需要候选时，该入口自动完成 Harness、格式、`lint`（含中文声明注释与源码体积门禁）、`typecheck`、非空全量 `test`、版本注入、宿主生产构建与 `release:inspect`。development/test profile 没有产物入口。
10. 初始化成功不宣称 Release 产物、日志/敏感信息扫描或浏览器行为通过，这些范围保持 `Unverified`，直到后续显式构建和适用验收实际完成。初始化只检查一次 Node.js/pnpm；后续普通命令不预探测工具链，已经报出疑似环境错误后才诊断相关组件。
11. 非空目标、源内目标、路径、参数和输入资产等预检失败保持目标零写入；`instantiate` 的依赖安装、静态校验或 Git 初始化失败也不得发布 同级暂存目录 内容到目标，且必须保持原目标不存在或为空。
12. `docs/MANTINE_UI_GUIDELINES.md`、终端 Agent 读取入口与校验门禁存在；规范保留共同规则和当前宿主章节，不包含另一宿主专属布局约定。各终端 canonical Skills 数量以 `AGENTS.md` Skills 地图为准，Web 含 `$web-implement-list-view`、`$web-implement-saas-auth`、`$web-implement-saas-commerce` 与 `$web-implement-saas-admin` 且不含 `$web-review-extension-compatibility`，Extension 裁掉前四项并保留后者；两类下游另含项目级 `design-taste-frontend`，检查 §3.9 的默认补装与已有版本保留合同。
13. 成功下游已删除 `instantiate`、`harness:init`、源专用 `$web-instantiate-project`、内部 init/instantiate tooling 及其他只服务模板派生的入口；源 Harness 方法论文档被删除，剩余工程/发布文档只描述已选类型。

## 9. Harness 未来增减能力

Harness 维护者未来可以增加新的**独立项目类型**或更新某一模板技术能力。每次新增类型至少需要：

- 一个新的显式 `projectType` 枚举值与 CLI 校验；
- 独立单包模板，不依赖现有 Web/Extension 仓库；
- 自己的品牌派生、开发脚本、测试与完整候选验收；
- 初始化器回归，证明所有已有类型仍然互斥且可生成；
- README、AGENTS、本文档、发布规则和适用 Skills 同步更新。

移除支持类型时，要说明对既有下游的维护与升级策略。无论增减，已生成仓库都不会变成多宿主项目。
