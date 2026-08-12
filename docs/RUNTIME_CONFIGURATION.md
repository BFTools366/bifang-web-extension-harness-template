# 运行配置与环境

本文档是 Bifang Web Harness Template 及其生成下游在运行配置、环境文件、字段校验和命令映射方面的唯一详细事实来源。每个项目固定维护 `development`、`test`、`release` 三个逻辑环境；缺少任何一份配置或必填字段时，验证、测试或构建必须失败。

## 1. 环境与文件

| 逻辑环境      | 受管文件           | 主要入口                                     | 默认日志级别 |
| ------------- | ------------------ | -------------------------------------------- | ------------ |
| `development` | `.env.development` | `pnpm dev`、`pnpm build:development`         | `debug`      |
| `test`        | `.env.test`        | `pnpm test`、`pnpm build:test`               | `info`       |
| `release`     | `.env.production`  | `pnpm build`、`pnpm build:release`、打包候选 | `warn`       |

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

业务代码只读取冻结的 `APP_CONFIG`，不得在组件、route、service 或扩展入口中散落 `import.meta.env`、`process.env` 或任意字符串 URL。Vite 内置的 `import.meta.env.BASE_URL` 表示页面部署 base path，不是 API BaseURL；API 端点统一使用 `APP_CONFIG.apiBaseUrl`。

## 3. 必填字段

- `APP_ENV` 必须与文件代表的逻辑环境完全一致，只接受 `development`、`test`、`release`。
- `API_BASE_URL` 必须是绝对 `http`/`https` URL，不得包含用户名、密码、query 或 fragment；末尾 `/` 在解析时规范化。`release` 必须使用 `https`。
- `LOG_LEVEL` 只接受 `debug`、`info`、`warn`、`error`；`release` 只接受 `warn` 或 `error`。
- `REQUEST_TIMEOUT_MS` 必须是 `1000`–`120000` 的正整数；初始化默认写入 `10000`。

项目名称、标识、说明、`projectType` 与品牌继续来自 `.harness/project.json`，软件版本继续来自相应版本事实源，不复制进环境文件。Extension 配置某个远端 BaseURL 不会自动授予 `host_permissions`；只有真实网络消费者出现时，才按 [`DATA_ACCESS.md`](DATA_ACCESS.md) 审批最小权限。

## 4. 初始化输入

非交互创建除身份和唯一项目类型外，还必须显式提供三份 API BaseURL。唯一公开入口在源 Harness 根运行，绝对目标必须位于源 Harness 之外：

```bash
pnpm instantiate -- /absolute/path/example-web --type web \
  --name "示例 Web" --id example-web \
  --description "示例 React Web 页面" \
  --development-base-url http://localhost:3000/api \
  --test-base-url http://localhost:3100/api \
  --release-base-url https://api.example.com
```

命令形态为 `pnpm instantiate -- <absolute-target-outside-harness> ...`。交互式创建逐项询问，不为 Release endpoint 猜测默认值。URL、颜色、Logo、路径、源内目标或其他预检失败必须发生在目标或 sibling staging 写入前；已有任一受管环境文件也视为冲突，不得覆盖。源 Harness 不提供 `pnpm harness:init`，`pnpm harness init` 明确拒绝；底层 initializer 只由 `instantiate` 在目标同级 sibling staging 中内部调用。

初始化器为当前唯一宿主生成三份配置、类型化 schema、运行时 adapter、非空测试与统一 logger。它还生成只读取 `APP_CONFIG` 的原生 Fetch 基础 client，但不生成真实 endpoint 或请求调用，也不预装 Ky/Axios 等传输依赖。语言、分页、continuation 与认证 Token 是运行时状态，不得加入公开环境文件；其存储和安全边界见 [`DATA_ACCESS.md`](DATA_ACCESS.md)。

## 5. 验证与命令

```bash
pnpm env:validate
pnpm env:validate --profile development
pnpm env:validate --profile test
pnpm env:validate --profile release
```

不带 `--profile` 时只读取并校验全部三份受管文件，不读取进程环境作为覆盖。指定 profile 时仍先校验三份文件，然后只允许当前进程用该宿主的四个已声明公开键覆盖所选 profile；例如 Web 只接受 `VITE_APP_ENV`、`VITE_API_BASE_URL`、`VITE_LOG_LEVEL`、`VITE_REQUEST_TIMEOUT_MS`。Extension 对应接受四个 `PLASMO_PUBLIC_` 键。受管文件或当前进程中出现与当前宿主前缀匹配但未声明的公开键时直接失败；覆盖后仍执行相同 Schema 校验。

所有验证路径都拒绝上述五种隐式环境文件。`pnpm harness validate`、`typecheck`、`test` 与所有构建入口也必须执行适用环境校验。

- `pnpm dev` 固定使用 `development`。
- `pnpm test` 固定使用 `test`。
- `pnpm build` 是 `pnpm build:release` 的别名，固定使用逻辑 `release` 和 `.env.production`。
- `pnpm build:development`、`pnpm build:test` 只生成诊断候选，不能冒充发布产物。
- Web 使用 Vite mode 装载相应文件；Extension 显式把相应文件交给 Plasmo。
- `pnpm build:release` 在宿主构建后自动运行 `pnpm release:inspect`（Web 同一脚本还运行 `tsc --noEmit`）；Extension 会先运行 `pnpm harness validate` 检查 browser target 与运行时依赖自包含，`pnpm package` 也在 zip 构建后执行相同两道门禁。任一检查失败都会使整个命令失败。

修改任一配置后至少运行 `pnpm env:validate`、相关测试和受影响构建。Release 候选还必须证明开发/测试 BaseURL、低级别日志和敏感信息未进入最终产物，详细门禁见 [`LOGGING.md`](LOGGING.md) 与 [`RELEASE.md`](RELEASE.md)。
