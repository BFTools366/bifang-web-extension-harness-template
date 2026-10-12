# 运行配置与环境

本文档是 Bifang Web Harness Template 及其生成下游在运行配置、环境文件、字段校验和命令映射方面的唯一详细事实来源。每个项目固定维护 `development`、`test`、`release` 三个逻辑环境；缺少任何一份配置或必填字段时，验证、测试或构建必须失败。

## 1. 环境与文件

| 逻辑环境      | 受管文件           | 主要入口                                  | 默认日志级别 |
| ------------- | ------------------ | ----------------------------------------- | ------------ |
| `development` | `.env.development` | `pnpm dev` 本地运行                       | `debug`      |
| `test`        | `.env.test`        | Vitest 测试运行时                         | `info`       |
| `release`     | `.env.production`  | `pnpm build` / `build:release` 与打包候选 | `warn`       |

`release` 是 Harness 的逻辑环境名；它映射到 `.env.production`，以保持 Vite 与 Plasmo 的生产构建约定。不得再建立语义重复的 `.env.release`。构建 Release 配置不代表已经获得部署、商店上传或正式发布授权。

三份文件只保存会进入浏览器产物的公开配置，并纳入版本控制。为了阻止 Vite 或 Plasmo 静默改变受管 profile，项目根出现 `.env`、`.env.local`、`.env.development.local`、`.env.test.local` 或 `.env.production.local` 时校验直接失败；不要用 ignore 规则或本地文件绕过门禁。任何以 `VITE_` 或 `PLASMO_PUBLIC_` 暴露的值都可被最终用户读取，不能保存密钥、Token、Cookie、密码或其他服务端秘密。

## 2. 宿主映射

| 逻辑字段             | Web                                | Chrome Extension                   |
| -------------------- | ---------------------------------- | ---------------------------------- |
| `APP_ENV`            | `VITE_APP_ENV`                     | `PLASMO_PUBLIC_APP_ENV`            |
| `API_BASE_URL`       | `VITE_API_BASE_URL`                | `PLASMO_PUBLIC_API_BASE_URL`       |
| `LOG_LEVEL`          | `VITE_LOG_LEVEL`                   | `PLASMO_PUBLIC_LOG_LEVEL`          |
| `REQUEST_TIMEOUT_MS` | `VITE_REQUEST_TIMEOUT_MS`          | `PLASMO_PUBLIC_REQUEST_TIMEOUT_MS` |
| 运行时入口           | `src/config/environment.ts`        | `src/config/environment.ts`        |
| 类型与边界校验       | `src/config/environment.schema.ts` | `src/config/environment.schema.ts` |

业务代码只读取冻结的 `APP_CONFIG`，不得在组件、路由、服务模块 或扩展入口中散落 `import.meta.env`、`process.env` 或任意字符串 URL。Vite 内置的 `import.meta.env.BASE_URL` 表示页面部署基础路径，不是 API BaseURL；API 端点统一使用 `APP_CONFIG.apiBaseUrl`。

## 3. 字段与校验

- `APP_ENV` 必须与文件代表的逻辑环境完全一致，只接受 `development`、`test`、`release`。
- `API_BASE_URL` 初始化和日常文件校验允许留空，表示未配置；该服务的数据流向详见 [`DATA_ACCESS.md`](DATA_ACCESS.md) §3.1，不猜测地址。已填值必须是绝对 `http`/`https` URL，不得包含用户名、密码、查询参数或片段；末尾 `/` 在解析时规范化。已填 `release` 地址始终必须使用 `https`，正式发布前及活动 Release 校验必须非空。
- `LOG_LEVEL` 只接受 `debug`、`info`、`warn`、`error`；`release` 只接受 `warn` 或 `error`。
- `REQUEST_TIMEOUT_MS` 必须是 `1000`–`120000` 的正整数；初始化默认写入 `10000`。

BaseURL 只配置远端 API，不是本地能力的启用条件。本地计算和存储直接真实实现；地址留空时仅对应远端 API 使用 Mock，混合流程只隔离远端边界，详细分工见 [`DATA_ACCESS.md`](DATA_ACCESS.md) §3.1。

项目名称、标识、说明、`projectType` 与品牌继续来自 `.harness/project.json`，软件版本继续来自相应版本事实源，不复制进环境文件。Extension 配置某个远端 BaseURL 不会自动授予 `host_permissions`；只有真实网络消费者出现时，才按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 审批最小权限。

## 4. 初始化输入

非交互创建要求绝对父目录、名称、唯一项目类型和 Agent 策略模式；标识由名称的英文翻译自动生成，非英文名称传入 `--english-name`，已有显式 `--id` 可复用，以及当前宿主的条件必填字段；Web 类型选择与 Extension 说明规则见 [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md) §2。三份 API BaseURL 均可省略，开发地址可主动提供或后续配置，测试/正式地址无需初始化时填写。Web 说明默认使用显示名称，策略确认来源自动记为“当前用户”。初始化不生成 Release 候选，E2E 选择留给后续显式构建。唯一公开入口在源 Harness 根运行，绝对父目录必须位于源 Harness 之外，最终目录为“父目录/项目标识”：

```bash
pnpm instantiate -- /absolute/path --type web --web-type tool-site \
  --name "示例 Web" --english-name "Example Web" --policy-mode 预设
```

命令形态为 `pnpm instantiate -- <absolute-parent-outside-harness> ...`。交互式创建按依赖顺序逐项引导尚未明确的基础字段与策略模式，自定义策略每轮只询问一个缺失或非法字段，并给可靠建议默认值；不为 Release endpoint 猜测默认值，也不提前询问 E2E。URL、颜色、Logo、路径、源内目标或其他预检失败必须发生在目标或 sibling staging 写入前；已有任一受管环境文件也视为冲突，不得覆盖。源 Harness 不提供 `pnpm harness:init`，`pnpm harness init` 明确拒绝；底层 initializer 只由 `instantiate` 在目标同级 sibling staging 中内部调用。

初始化器为当前唯一宿主生成并直接校验三份配置、类型化 schema、运行时 adapter、非空测试与统一 logger。它还生成只读取 `APP_CONFIG` 的Ky HTTP 基础 client，但不生成真实 endpoint 或请求调用，Ky 声明为运行时依赖，其他传输或协议依赖按需加入。语言、分页、continuation 与认证 Token 是运行时状态，不得加入公开环境文件；其存储和安全边界见 [`DATA_ACCESS.md`](DATA_ACCESS.md)。创建期不执行最终构建；后续 `pnpm build` 仍在其他门禁之前重新验证三份文件与活动 Release profile。

### 4.1 用户要求真实联网时的 BaseURL 收集

只有用户明确提出需要真实联网时，才在已初始化下游收集相关地址：先读取三份受管配置并复用有效值，再按工程规则“渐进式交互引导”逐项补问本次操作依赖的环境与服务 BaseURL/target。每轮优先一个阻断问题，不要求一次提供 development、test、release 的全部地址。用户已明确提供的值不重复询问；暂不使用的环境或服务可继续留空或待定，不编造默认地址，正式发布仍须补齐 HTTPS 正式地址。

按当前唯一宿主前缀写入对应 `.env.development`、`.env.test`、`.env.production` 并校验。多个服务只在确有消费者时扩展类型化只读 target registry、对应 schema 与环境键白名单，不临时绕过未知公开键门禁。业务代码继续只读 `APP_CONFIG`。地址配置通过后，按 [`DATA_ACCESS.md`](DATA_ACCESS.md) §3.1 迁移对应 API；仅填写地址不代表已经迁移或验证服务可达。Web CORS、认证以及 Extension 最小网络权限继续按实际集成处理。

## 5. 验证与命令

```bash
pnpm env:validate
pnpm env:validate --profile development
pnpm env:validate --profile test
pnpm env:validate --profile release
```

不带 `--profile` 时只读取并校验全部三份受管文件，允许地址留空，不读取进程环境作为覆盖。指定 profile 时仍先校验三份文件，然后只允许当前进程用该宿主的四个可配置公开键覆盖所选 profile；例如 Web 只接受 `VITE_APP_ENV`、`VITE_API_BASE_URL`、`VITE_LOG_LEVEL`、`VITE_REQUEST_TIMEOUT_MS`。Extension 对应接受四个 `PLASMO_PUBLIC_` 键。受管文件或环境校验进程中出现与当前宿主前缀匹配但未声明的公开键时直接失败；覆盖后仍执行相同 Schema 校验。构建编排器随后只向宿主生产构建子进程注入只读的 `VITE_BUILD_VERSION` 或 `PLASMO_PUBLIC_BUILD_VERSION`，该值不属于可配置 profile、不得写入 `.env*`；页面通过 `src/buildVersion.ts` 读取并展示该值，`release:inspect` 使用同一 `HARNESS_BUILD_VERSION` 验证候选命中。

`--profile release` 在应用合法进程覆盖后要求正式地址非空且 HTTPS；最终构建和 `release:inspect` 均消费此门禁。生成的运行时 schema 允许 development/test 地址为空，Release 运行时拒绝空地址。真实 HTTP client 在地址未配置时于 Fetch 前报错，禁止相对请求或猜测地址。所有验证路径都拒绝上述五种隐式环境文件。`pnpm harness validate` 校验三份配置与脚本契约；Vitest 从 `.env.test` 提供测试运行时公开值；最终构建在任何静态、类型或全量测试门禁之前显式执行 `pnpm env:validate --profile release`。

- `pnpm dev` 固定使用 `.env.development`，但普通开发不为预探测重复执行独立环境命令；出现配置错误时按故障诊断处理。
- `pnpm test` 与 `pnpm test:related` 固定使用 `.env.test` 提供的测试运行时值。
- `pnpm build` 是 `pnpm build:release` 的别名，固定使用逻辑 `release` 和 `.env.production`；同一发布流程复用已明确的 E2E 选择，非交互调用显式传 `--e2e=enabled|disabled`。
- development/test profile 只服务运行和测试，不提供产物构建脚本；所有本机、CI 或其他平台的候选都固定使用 Release。
- Web 生产构建使用 Vite `production` mode；Extension 显式把 `.env.production` 交给 Plasmo。
- `pnpm build:release` 在宿主生产构建前后自动运行完整门禁（清单见 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) §6.2），任一检查失败都会使整个命令失败。Extension `pnpm package` 对同一 Release profile 执行相同门禁后生成 zip。
- 上述 `.env*`/profile 校验属于应用运行配置门禁，不是 Node.js、pnpm 或 Chrome 工具链探测。工具链只在新下游首次初始化检查一次；其余命令直接运行，已经报出疑似环境错误后才诊断相关组件。

修改任一配置后至少运行 `pnpm env:validate` 与相关非空测试；普通日常变更不自动构建。只有用户明确要求最终候选/完整验收，或产品、安全、权限、渠道存在真实候选硬要求时，才解析或复用本次发布的 E2E 选择并运行唯一 `pnpm build -- --e2e=enabled|disabled`。Release 候选还必须证明开发/测试 BaseURL、低级别日志和敏感信息未进入最终产物，详细门禁见 [`LOGGING.md`](LOGGING.md) 与 [`RELEASE.md`](RELEASE.md)。
