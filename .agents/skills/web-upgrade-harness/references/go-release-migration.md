# 已有 Go 服务的发布迁移

仅在 Workspace 已登记自建 `_server`、本次升级需要让旧服务接入根 `release:server` 时读取。仅比较或只升级前端时不读取服务配置。本流程是受保护 Go 文件的独立迁移，不把 Go 目录改为 managed，也不把这些候选放进前端工程候选。

本次用户已经授权配置迁移和发布工具补齐时，沿用授权完成下列工作，不再重复请求同一授权。先准备可审阅的精确路径与函数差异；遇到业务行为、数据库类型、生产值或凭据缺项时，只补当前确实缺失的信息。升级本身不授权部署、连接生产数据库或启动真实邮件投递。

## 1. 冻结旧服务，生成外部提案

复用本轮已经验证的 source commit、根 Git/脏状态与 `.harness/workspace.json`，确认服务归属、成员目录和真实 `go.mod`。服务源代码和 YAML 可以有产品修改，均须保留。当前根运行器要求 module 与登记的 `<id>_server` 一致；若目标已经改名，保持原文件并单独审查运行器兼容，不能自动改 module 或业务 import。

先补齐本 Skill 的 `scripts/prepare-go-release.ts` 及其依赖，再从目标根运行：

```sh
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/prepare-go-release.ts \
  --source-root <verified-source> --source-commit <exact-source-commit> \
  --target-root <workspace-git-root> --output <new-external-directory>
```

命令只生成 `plan.json`、`files/` 下的工具候选和 `reference/Load.go.txt`。它绑定 source/target Git、服务身份及相关文件摘要，拒绝 source 脏状态、提交不匹配、路径越界、链接及已存在输出目录；不修改目标、不安装依赖、不启动服务、不读取数据库或 `.env`。报告只含摘要，不打印现有 YAML、秘密或配置 diff。输出目录不是工程升级器可直接 apply 的候选。

候选从已绑定 source 的 `go-config.ts` 公开模板产生，沿用目标 module 的既有 Viper 依赖，独立命令不导入业务 config 包或触发其 init，不重新生成服务。已有 `configs/config-prod.yaml` 只登记 `preserve_existing`，不导出其内容或生成替换文件；缺失时只建议 `app.env: prod` 与 `server.mode: release`，其余业务值仍由已有基线配置拥有。该建议不是对真实生产参数的推断。

## 2. 补齐工具，按函数合并配置

在外部提案基础上复核精确路径，授权已覆盖时直接实施；发生目标漂移则重新生成新提案。已有同名工具须审查函数/符号冲突，不能以“工具文件”为由覆盖用户内容。

| 路径                                                              | 迁移方式                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根 `.harness/runtime/archive.mjs`、`release.mjs`、`workspace.mjs` | 沿用工程升级计划，按此依赖顺序补齐；根 `package.json` 按键合并已选成员的 release 脚本，保留产品脚本和依赖                                                                                                                                                                                          |
| `_server/internal/config/release.go`                              | 缺失时新增；已有时只合并导出职责。只用新 Viper 合并现有 `configs/config.yaml` 和 `configs/config-prod.yaml`，强制 `app.env=prod`；直接使用 SetConfigFile/MergeInConfig，不复用可能定制的 readInto，不调用业务 `Load`、`AutomaticEnv`、`Unmarshal(Config)` 或数据库 bootstrap，保留未知业务 YAML 键 |
| `_server/cmd/release-config/main.go`                              | 缺失时新增，沿用真实 module 依赖；命令内使用同一份纯 YAML 合并实现，不导入服务 config 包，避免触发其自定义 init；不监听或连接服务                                                                                                                                                                  |
| `_server/internal/config/environment.go`                          | 缺失时按现有 Config 类型核对后补齐；已有时合并绑定职责。自定义 map、指针、匿名字段或不同 tag 需按真实结构处理，不盲目套用反射规则                                                                                                                                                                  |
| `_server/configs/config-prod.yaml`                                | 已有则逐键保留；缺失才新增最小差异。数据库、地址、日志路径、CORS、邮件、业务键和有效秘密均不被通用生产模板重置                                                                                                                                                                                     |
| `_server/internal/config/config.go`                               | 只按下面的函数合同局部合并；保留 Config 及业务扩展类型、字段、校验和辅助函数                                                                                                                                                                                                                       |
| `_server/cmd/server/main.go`                                      | 核对是否已调用 DefaultPath/Load，旧模板通常已有 `-c/--config`、`-e/--env`，无需改动；自定义 CLI 只合并必需接线，保留业务 bootstrap                                                                                                                                                                 |
| 现有 `go.mod/go.sum`、其余业务文件和配置                          | 保持原字节；已有 Viper 足够，不为迁移自动 tidy、升级依赖、换数据库或改业务                                                                                                                                                                                                                         |

`adaptGoConfiguration` 只用于固定上游新建模板，**不得用于旧业务 config.go**：它会切换整个默认值尾段，可能删掉业务扩展。也不得调用 `generateGoServer`、覆盖整个 Config 文件或复制 source 的 configs 目录。

局部合并以下合同，`reference/Load.go.txt` 只是函数参考，仍须保留目标的业务预处理和校验：

- **默认路径**：未指定 `-c` 时先读运行 cwd 的 `config.yaml`，仅 ENOENT 才回退 `configs/config.yaml`；显式路径不回退，基线缺失、损坏或不可读失败。
- **环境**：显式 `-e/--env` > `APP_ENV` > 基线 YAML `app.env` > 原服务兼容默认值；先读 YAML 再决定 profile。仅合并同目录可选 `config-<env>.yaml`，最终环境必须是 dev/test/prod。保留既有其他环境别名时先核对真实部署合同，不自行改名。
- **读取错误**：`isConfigMissing` 只把 ENOENT 或 Viper 明确的配置不存在当缺失；不得把所有 `*fs.PathError` 都吞掉。必需导出输入还需显式存在检查，权限错误不能生成缺字段的发布配置。
- **环境覆盖**：绑定现有 mapstructure 键，保留既有 `APP_*` 命名和定制绑定；`app.env` 绑定 `APP_ENV`，不要误用 `APP_APP_ENV` 取代旧合同。必要时补现有 `rate_limit` tag；不重命名产品字段。
- **原有默认值**：先对照真实 YAML 与代码，只有原业务确实依赖且 YAML 缺失的参数才按缺失键追加到原配置；已有值、未知嵌套键、列表、false/0/空值和注释保留。之后才逐项移除代码中的数据库地址等业务默认值，保留兼容且安全的退级。不要把当前 source 的默认集整段替换进去。
- **生产校验**：保留业务 Validate，并在资源启动前拒绝无效配置、开发 Mock 与公开默认密钥。有效的既有生产秘密不改写、不输出；仍用公开默认值时，使用部署时填写的空值或显式注入方式，不能把通用默认密钥当真实生产配置。生产值不明确时停在该缺项，不用模板值覆盖来制造通过。

函数合并后添加独立回归测试文件，不覆盖旧测试。对无关业务文件和原 YAML 做前后摘要核对；需要追加缺省键的 YAML 单独核对精确 diff，敏感值留在本地审阅，不写入报告。若 formatter 会改变整个文件，只格式化本次新增工具，已有文件保持最小差异。

### 首次发布的本机 BaseURL 兼容

需要根 release 的首次空地址功能时，已有 `cmd/release-config` 也必须局部合并 `--local-base-url-output` 接口；不能只检查文件存在。保留 `--output`，从刚导出的生产配置读取真实 host/port，只输出公开回环 URL，不读取 APP_*、调用业务初始化或猜测 8080。旧工具缺参数应明确阻断并迁移，不回退开发地址。定制监听/TLS 无法推导时保留原配置，让用户填写正式地址。

同时检查每个目标前端的 `.harness/tooling/environment.ts` 与受保护 `src/config/environment.schema.ts`。工程工具随升级同步；浏览器 schema 只局部合并 URL 校验：Release 远端仍 HTTPS，仅 hostname 精确为 `127.0.0.1`、`localhost`、`[::1]` 时允许 HTTP，继续拒绝空值、凭据、query、fragment。保留自定义字段、校验和业务代码，不整体覆盖 schema 或 src 目录；none 的空地址合同不变。添加相关运行时回归，证明本机 HTTP 真正可解析且远端 HTTP 仍失败。普通 planner 保护 src，不能因工程升级通过就省略这一条件迁移。

首次写入由根 release 提示具体生产地址及受影响文件，取得用户明确确认后才补选中空地址，已配置值保持不变。非交互确认参数必须来自该地址的用户确认，不由升级 Agent 自动代答；完整合同见 [运行配置](../../../../docs/RUNTIME_CONFIGURATION.md#42-自建服务首次发布的本机地址)。

## 3. 验证旧下游能打包与独立启动

本分支已经明确要求“迁移后能正常打包”，因此必须执行实际 Server 打包验证。仅生成提案或执行 `go build` 不能完成迁移。平台先复用本轮已确认值；未确认则询问具体 os/arch，不默认采用开发机。验证用本机平台需要明确记录其仅为隔离测试平台。

1. 在成员 cwd 执行相关非空 Go 测试，覆盖现有配置/业务扩展保留、代码默认值迁入后行为、缺文件与读取错误、默认/显式路径及环境优先级。对 exporter 设置宿主 `APP_ENV=dev`、数据库/密钥及业务 `APP_*` 哨兵，确认输出只来自基线+prod，不含 dev 覆盖或进程秘密，未知嵌套映射、列表、false 与 0 不丢失。测试失败先在当前范围修复。
2. 在根执行 `pnpm release:server -- --platform=<confirmed-os/arch>`，确认调用本机 exporter、为所选平台编译且只生成 `release/server.zip`。不因 Server 验证自动运行 Web/Extension 构建或浏览器 E2E。
3. 用独立 ZIP 读取器检查 CRC、文件名、执行权限与内容，恰好为目标二进制（Windows 带 `.exe`）和一份 `config.yaml`；没有开发覆盖、源码、数据库或额外目录。构建/导出失败必须保留旧包。
4. 在全新临时目录解压本机候选，保留原项目数据库和生产配置不动，用临时数据库、测试秘密及只绑定回环地址的测试配置启动真实二进制。验证无参数默认配置、prod 环境、健康检查及目标已有的配置消费者/业务扩展；结束后关闭所属进程、清理测试资源。外部生产服务不能用于这个验证；跨平台仅编译时明确标记目标运行 Unverified。
5. 回到工程升级流程，用目标本地 helper 重新 plan，仍保护 Go 目录；单独列出本分支实际修改、保留摘要和 Server ZIP/平台验证证据，再记录工程基线。不可因 Go 被工程 planner 剪枝就省略本分支验收，也不可把服务配置迁移混入 upstream-lock 的受管文件授权。

完成时报告实际新增工具、函数级合并、保留配置和业务代码、平台、ZIP 哈希、Go 测试与隔离启动结果。只迁移打包能力不等于正式发布、部署或迁移生产数据库。
