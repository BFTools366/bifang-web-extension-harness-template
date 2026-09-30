# 日志设计与发布脱敏

本文档是 Bifang Web Harness Template 及其生成下游在日志结构、级别、上下文、脱敏和 Release 产物检查方面的唯一详细事实来源。日志用于定位真实边界和失败，不是状态仓库、遥测授权或倾倒任意对象的出口。

## 1. 统一入口

生成项目使用 `src/observability/logger.ts`，业务模块按稳定 scope 创建 logger。产品代码不得直接调用 `console.debug/info/warn/error`；只有统一 sink 和 Harness CLI 的受控终端输出可以使用 console。CLI 只输出必要进度与安全错误摘要，不打印完整环境、凭据、请求体或不必要的个人绝对路径。

默认 logger 只写浏览器 console，不持久化，也不上传到远端。新增文件、网络或第三方遥测 sink 会改变隐私与数据边界，必须先获得产品批准并执行隐私、安全及适用候选门禁。

## 2. 日志记录

每条记录包含：

- `timestamp`：ISO 8601 时间；
- `level`：`debug|info|warn|error`；
- `scope`：稳定的小写模块或业务域标识；
- `event`：稳定的小写事件名，不使用面向用户的翻译文案；
- `environment`：`development|test|release`；
- 可选 `context`：仅保存诊断所需、安全且有界的结构化字段。

scope 与 event 使用小写字母开头，只包含小写字母、数字、点、短横线或下划线。推荐 context 使用 `correlationId`、`requestId`、`status`、`code`、`durationMs`、`reason`、`retryable`、`surface`、`component`、经过清理的 `url` 和归一化 `error`。不要记录用户可见消息作为事件名，也不要把整个 props、Storage、响应、环境对象或 Error 任意展开。

## 3. 环境行为

| 环境          | 最低默认级别 | 规则                                                                    |
| ------------- | ------------ | ----------------------------------------------------------------------- |
| `development` | `debug`      | 可保留安全调试上下文和 Error stack/cause；仍始终脱敏敏感键              |
| `test`        | `info`       | 使用可注入内存 sink 做确定性断言；测试不得依赖真实 console 顺序         |
| `release`     | `warn`       | 抑制 debug/info，只保留 allowlist 上下文，并删除 stack/cause 与本机路径 |

Release 配置即使被错误设置成更低级别，logger 也必须把有效最低级别提升到 `warn`；环境校验同时拒绝 Release 的 `debug` 或 `info` 配置。日志 sink 自身失败不得中断被观察的业务路径。

## 4. 敏感信息与裁剪

所有环境都按键名脱敏 `authorization`、Token、Cookie、password、secret、API key 等值。Release 再执行严格裁剪：

- context 只保留批准的诊断字段；非敏感未知字段直接省略。显式传入的敏感键只保留键名与固定 `[REDACTED]` 标记，绝不保留原值；
- URL 只保留 origin 与 pathname，删除 query、fragment 和 credentials；
- Error 只保留名称与清理后的 message，不保留 stack 或 cause；
- macOS、Linux 与 Windows 用户目录替换为 `[LOCAL_PATH]`；
- 循环引用、过深对象、超长数组和字符串使用有界表示；
- function、symbol、undefined 和无法安全表达的值不输出。

禁止记录 Authorization/Cookie header、refresh token、请求/响应 body、GraphQL variables、SSE 原始载荷、完整标签页 URL、页面内容、Storage 全量数据、个人目录或完整环境对象。需要诊断请求时记录 endpoint 模板或清理后的路径、状态、耗时、request ID 和稳定错误码。

## 5. 使用边界

- UI、route、Query、API client、Chrome message/Port、Storage 和生命周期边界使用各自稳定 scope/event；不要用日志代替用户错误反馈。
- React Web 的 `createRoot` 明确接入 `src/observability/reactRoot.ts` 的已捕获、未捕获和可恢复错误回调，替代 React 默认的原始异常 console 输出；回调只交给统一 logger，不传递 `componentStack`。
- 异步请求通过 correlation/request ID 串联；不要以 Token、用户标识或完整 URL 充当关联键。
- 基础 HTTP client 使用稳定的 `http.request_failed`、`http.unauthorized` 与 `http.unauthorized_handler_failed` 事件；只记录状态、耗时、稳定 code/reason/retryable。非法响应 header 或 extractor 通过 `http.request_failed` 与稳定 code 表达；基线不记录 URL、Error、header 或 body。真实域层只有提供不含标识符的静态 endpoint 模板后才可把它作为批准字段加入。`X-Http-Request` 是服务端允许传播的 opaque continuation，不自动等同于可记录的 request ID。
- transport 层只记录协议、网络与认证边界；TanStack Query 的全局错误日志负责最终 query/mutation 失败。接入真实 feature 时应明确单一所有者，避免同一失败在两层重复记录。
- Extension 的 popup、options、content script 与 service worker 分属不同执行上下文，日志不能提供跨上下文状态或可靠传输。
- 测试可注入 sink 和时钟，断言级别、结构与脱敏；不得通过屏蔽 console 错误掩盖产品失败。
- `web-extract-i18n-strings` 继续排除日志事件名和错误码；它们是工程契约，不是用户文案。

## 6. 测试与 Release 门禁

日志测试至少覆盖：级别过滤、敏感键、URL query/fragment、本机路径、Error stack/cause、循环对象、深度/长度限制、sink 失败，以及 Release 未知字段丢弃。

Release 候选除单元测试外必须运行真实脚本：

```bash
pnpm release:inspect
```

Web `pnpm build:release` 在 Vite 生产构建前自动完成环境、Harness、格式、lint、类型与全量测试门禁，注入当次上海时间 `YYMMDDHHMMSS` 页面构建版本后运行该命令；Extension `pnpm build:release` 与 `pnpm package` 对同一 Release profile 执行相同门禁，读取 `package.json.version` 的稳定 SemVer 注入页面，并分别在 Plasmo 生产构建或 zip 后运行该命令。`release:inspect` 先按 release profile 验证全部环境，再检查 Web `dist/` 或 Extension `build/chrome-mv3-prod`，并确认构建编排器注入的 `HARNESS_BUILD_VERSION` 与当前宿主的页面版本一致；Extension 还确认 MV3 manifest 与包版本一致。Extension `package` 虽先生成 zip，该检查仍针对构建目录，不会直接解包扫描 zip。任一命中都会使上层构建/打包失败。

自动检查包括：

1. 候选目录必须存在且非空；文件名层对所有候选文件拒绝 `.env*` 与 `.map`。
2. 内容扫描只读取 `.css`、`.html`、`.js`、`.json`、`.mjs`、`.txt` 与 `.xml`。这些文本不得包含与 Release URL 不同的 development/test BaseURL、固定哨兵 `debug_sentinel`、`info_sentinel`、`application_started`、`surface_started`、`do-not-ship`、原始 `console.debug`/`console.info`、macOS/Linux/Windows 用户目录绝对路径或 `sourceMappingURL`。
3. 该固定规则集不是通用秘密扫描器，也不扫描其他扩展名或直接解包 Extension zip；敏感键、URL、Error 与上下文裁剪仍由 logger 测试验证。
4. `acceptance_smoke: enabled` 解析出的 Chrome smoke、当次启用的 E2E，或用户、产品、安全、渠道硬要求浏览器证据时仍需捕获 console；观察到的记录符合 Release 级别和脱敏规则，且没有未处理异常。
5. `release:inspect` 是确定性静态门禁，不能代替 logger 行为测试或被硬要求的真实浏览器验证；任何必需项失败都产生新修复 Todo，不能声明 `Ready`。

具体候选顺序、授权和证据字段见 [`RELEASE.md`](RELEASE.md)。
