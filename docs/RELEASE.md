# 版本与发布

本文件定义 Harness 模板和两类独立下游的版本、候选与发布门禁。它不保存当前 Harness 版本；当前值只见根 [`Version.md`](../Version.md)。

## 1. 版本事实

- Harness 使用上海时区 `YYYYMMDDHHMM` 时间版本，Git 标签建议为 `vYYYYMMDDHHMM`。
- 生成下游使用其根 `package.json` 的版本作为软件版本事实；若采用语义化版本，标签使用 `vX.Y.Z`。
- `.harness/project.json.projectType` 是候选宿主类型事实，发布脚本不得从目录猜测或同时构建两个宿主。
- 版本、源码提交、锁文件、构建产物和验证证据必须指向同一候选。任何构建后修改都会产生新候选。
- `Unreleased` 表示尚未形成对外发布承诺，不能因本地构建成功改写为已发布。
- Node.js、pnpm 与受控依赖的兼容门禁按声明的稳定 SemVer（`x.y.z`）最低版本判断；合法更高版本需要继续运行完整门禁，而不是因不等于基线而失败，prerelease 或无法解析的声明失败。`packageManager` 仍为精确 `pnpm@x.y.z` pin 且不得低于 pnpm 最低版本。
- 最低版本规则不适用于身份或协议事实：Harness/软件当前版本、候选版本、源码提交、lockfile/hash、Schema/协议版本、`manifest_version`、`projectType` 与验收记录必须精确匹配。

## 2. 路径选择

普通局部开发可走快速或标准路径。以下工作必须进入里程碑路径：

- Harness 初始化命令、`projectType` 枚举或模板输出契约变化；
- Logo 生成、身份/manifest 同步或 Extension 权限变化；
- 新增或移除 Harness 支持的独立项目类型；
- 创建发布候选、对外上传、Chrome Web Store 提交或用户明确要求完整验收。

里程碑 Todo 未全部完成时不得进入候选验收。

## 3. Harness 模板发布门禁

Harness 候选至少满足：

- [`README.md`](../README.md)、[`AGENTS.md`](../AGENTS.md)、[`Version.md`](../Version.md)、[`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)、[`LOGGING.md`](LOGGING.md)、本目录其他长期文档与现存 Skills 链接一致；
- 中英文 License 存在，且除适用项目名外与批准的成熟模板法律文本一致；
- 根 `package.json` 与首次普通安装产出的锁文件可解析；后续以 frozen lockfile 复现成功，根级 `lint`、`typecheck`、非空 `test`、`format:check` 与 `validate:harness` 通过；Harness 根没有应用 `build` 门禁；
- 在两个全新隔离目录分别以三份显式 BaseURL 执行 `--type web` 和 `--type extension` 非交互初始化，并验证交互式选择没有默认类型且会逐项询问三个 BaseURL；两种输出均为单 package，且只包含一个 `projectType`；
- 成功下游不再包含 `instantiate`、`harness:init` 或对应模板派生 Skills，不能继续从自身生成项目；
- `both`、类型/BaseURL 缺失、类型列表、非法或非 HTTPS Release BaseURL、非法 Logo、非法颜色、受管环境冲突、非空目标和路径越界等预检失败保持目标零写入；独立 `instantiate` 只在 sibling staging 全部成功后原子发布，安装、检查或构建失败保持目标不存在或为空；原地 `harness:init` 写入后失败会明确报错但不承诺自动回滚；
- Web 结果的 `public/logo.png`、`public/favicon.png`、根 `index.html` 与 Landing 身份一致；
- Extension 结果的 `assets/icon.png`、manifest 身份、Popup 与 Options 一致，Plasmo 能从来源图标生成构建所需尺寸；`targets.default` 明确使用 browser context 与 `includeNodeModules: true`；
- 两种生成项目都包含 development/test/release 三份配置、类型化 `APP_CONFIG`、统一 logger 与非空测试；Web 只使用 `VITE_`，Extension 只使用 `PLASMO_PUBLIC_`，且不因配置 BaseURL 自动新增权限；
- 两种生成项目各自实际运行 `pnpm env:validate`、`pnpm lint`、`pnpm typecheck`、非空 `pnpm test`、三种 profile 构建与默认 `pnpm build`；默认构建与 `build:release` 的逻辑 Release 产物一致；
- 两种 Release 构建均自动执行 `pnpm release:inspect`：文件名层拒绝 `.env*`/`.map`，仅在受支持的可读文本扩展中扫描非 Release BaseURL、固定日志哨兵、原始 `console.debug`/`console.info`、源码绝对路径与 `sourceMappingURL`；Extension 在 inspector 前还用 `pnpm harness validate` 拒绝错误 Parcel target 或 production JS 运行时依赖 self-map，`pnpm package` 也执行同样门禁。检查对象是 `build/chrome-mv3-prod`，不会直接解包 zip；固定规则集不提供通用秘密扫描，完整边界见 [`LOGGING.md`](LOGGING.md)。命中时上层命令失败，不得发布；
- 未实际执行的操作系统、Chrome 版本和分发渠道明确标记 `Unverified`；
- 当前已知重要限制已记录在 [`TECH_DEBT.md`](TECH_DEBT.md)。

模板本身没有业务产品。初始化器和中性 Landing/Popup 构建成功只能证明脚手架基线，不代表下游业务已经验收。

## 4. Web 下游候选

Web 候选至少要求：

1. `.harness/project.json.projectType` 为 `web`，没有 Plasmo/Extension 入口或权限配置。
2. `pnpm env:validate`、`pnpm lint`、`pnpm typecheck`、非空 `pnpm test` 和 `pnpm build` 针对同一源码提交通过；`build` 使用逻辑 release 与 `.env.production`，并在构建后自动通过 `pnpm release:inspect`。
3. 最终 Vite 构建存在，title、description、favicon、Logo 和 Landing 身份一致。
4. 核心成功路径与最高风险失败路径有非空测试；里程碑按策略/硬要求用 Playwright 或真实浏览器验证最终构建。
5. 部署目标的 base path、环境变量、CSP、缓存和回退路由已按真实渠道验证；Release 产物和浏览器日志通过 [`LOGGING.md`](LOGGING.md) 的裁剪/敏感信息检查；未验证项公开。

部署到具体托管平台、配置域名、生产密钥或上传产物需要对应外部操作授权。本 Harness 不因生成 `dist` 自动授权发布。

## 5. Extension 下游候选

Extension 候选至少要求：

1. `.harness/project.json.projectType` 为 `extension`，没有 Vite Web Landing 或独立 Web 站内路由。
2. `pnpm env:validate`、`pnpm lint`、`pnpm typecheck`、非空 `pnpm test` 和 `pnpm build` 针对同一源码提交通过；`build` 使用逻辑 release 与 `.env.production`，并在构建后自动通过 `pnpm release:inspect`。
3. 最终 Chrome MV3 构建存在，manifest 名称/描述/版本、Plasmo 生成图标、Popup 与 Options 身份一致；Parcel target 是显式 browser context，production JS 不含任何运行时依赖 self-map。
4. 权限、host permissions、content scripts 和 Web accessible resources 与产品真实用途精确匹配，没有模板遗留高权限。
5. `pnpm package` 从同一 Release 配置生成 Chrome MV3 zip，并在打包后自动运行 `pnpm harness validate` 与 `pnpm release:inspect`；目录或 zip 重新生成后必须重新记录哈希和验收。
6. 里程碑按策略/硬要求在真实 Chrome 中加载最终构建，验证 Popup、Options、必要消息/Storage/权限行为和 Release 日志脱敏；未实际加载时标记 `Unverified`。

Chrome Web Store 上传、开发者账号、签名、审核资料、隐私披露和正式发布属于外部渠道操作，需要独立明确授权。构建成功不等于商店审核通过或可公开分发。

## 6. 验收与发布顺序

1. 完成并关闭当前里程碑 Todo。
2. 固定源码提交与依赖锁，执行三环境校验、当前项目类型的 lint、类型、非空测试和逻辑 Release 构建。
3. 检查身份、Logo 母版、当前宿主品牌派生、manifest/HTML、配置与权限边界。
4. 确认生成候选的 `build:release` 或 Extension `package` 已自动通过 `pnpm release:inspect`；需要独立复核既有目录时直接重跑该命令。任何命中先修复并生成新候选。
5. 根据 [`AGENT_POLICY.md`](AGENT_POLICY.md)、产品与渠道硬要求，对最终构建执行适用冒烟/E2E；`milestone_e2e: disabled` 只关闭默认可选 E2E，不能跳过环境、测试、构建、扫描或渠道硬门禁。
6. 记录实际环境、命令、结果、未执行项和剩余风险；需要人工复核时由真实复核人签署，Agent 不得代签。
7. 只有全部必需门禁通过后才能准备标签或发布元数据；push、上传或正式发布仍需独立授权。

任何签名、重打包、manifest 修改、品牌替换或渠道处理若改变最终字节或运行行为，都产生新候选并重新执行受影响验收。

## 7. 明确删除的发布范围

本模板不定义或支持 Rust/Cargo 制品、Tauri 应用、DMG、NSIS、MSI、xwin、Windows/macOS 桌面签名、Apple notarization/stapling 或桌面跨平台安装包矩阵。未来若出现这些需求，应作为新的独立 Harness 类型重新评估，不能恢复旧模板文档来绕过当前单包边界。

## 8. 发布记录最小字段

- 版本与日期；
- `projectType`；
- 源码提交与锁文件状态；
- 最终产物及 SHA-256（渠道要求时）；
- 实际执行的 lint、类型、测试、构建、冒烟与 E2E；
- 三环境校验、实际 Release profile 与 `pnpm release:inspect` 结果；
- 浏览器、操作系统和渠道验证范围；
- 人工复核人与结论（适用时）；
- 未执行项、`Unverified` 范围和已知问题。
