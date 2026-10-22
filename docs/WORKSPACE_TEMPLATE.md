# Workspace 创建与全栈协作

显式纯本地模式使用 --server none：只生成所选前端，不创建 Go、健康检查或 Go 传输，不要求服务地址或接口文档。三环境地址保持空，正式环境仅在精确登记的 none 成员中允许空地址；远端项目仍执行 HTTPS 及非空门禁。原地升级保持 none，不更改服务归属。修改服务模式时旧地址和接口文档失效，避免预览与执行使用不同服务。

此文是工作区拓扑、服务归属和跨成员协作的唯一事实源，取代旧规则中“一个下游只能是平铺前端单包”的限制。成员内部仍独立保持 React Web、Plasmo 双浏览器扩展或 Go 服务的技术边界。

## 本次分析与补充决定

对照 [Go Harness 来源](https://github.com/BFTools366/bifang-golang-harness-template/tree/63617d62f76f3ddc6b27a6861b3fb5acf36a9dc2)，需要同时调整创建事务、表单、运行命令、真实数据接线、领域能力、分发与升级边界。只移动目录、复制 Go Skills 或填写 BaseURL 都不足以完成这次改造。

1. 旧模板把单包互斥与空地址 Mock 写入生成器、终端文档和校验器；新的根负责成员选择，前端叶子仍只有一个 projectType。
2. 已有服务必须提供合法开发 BaseURL，具体接口仍需要可信 API 文档/SDL。用户可以在初始化提供契约文件；缺失时只在命中的操作接线前补齐，不猜 endpoint。
3. 选择自建服务时同事务创建真实 Go HTTP 服务，前端开发地址连接该服务。测试和生产地址不推断，本地连通不代表部署完成。
4. 原始 Go 验证码 smtp/http 未实现发送，本地专用 overlay 已补 SMTP TLS。自建邮箱注册默认接线验证，未接邮件服务时 dev 默认模拟投递并在注册表单显示验证码；接通 SMTP 同时关闭 mock，真实回执移除回显，非开发拒绝 Mock，找回要求真实通道。
5. 上游账号只有默认组织，没有 owner 成员；完整用户方案必须补齐 Account、Organization、OrganizationUser 的原子创建与授权。
6. 前端 Ky 的 Token/continuation 头与 Go Bearer/request_id 不是同一协议，使用显式 adapter。GraphQL 基础只有 health/me，业务集合必须实现对应 SDL/resolver。
7. Go 自己的初始化问卷、独立 Git、Task、版本和发布状态不迁入；根拥有同一产品事实、策略与结果边界。

## 创建形态

```text
<parent>/<id>/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  .git/
  .harness/workspace.json
  .harness/runtime/workspace.mjs
  .agents/skills/
  docs/
  <id>_web/          # 选择 Web 时
  <id>_extension/    # 选择 Extension 时
  <id>_server/       # 没有已有服务时，与所选前端一起创建
```

根标识仍为小写 ASCII kebab-case；成员目录、前端 package name/成员身份和 Go module 使用对应标准后缀。`.harness/workspace.json` 保存精确成员目录和服务归属；前端 `.harness/project.json` 只保存本成员身份和唯一宿主，不改成多值类型。成员间不导入对方源码，不引入共享 core；前后端通过真实 HTTP/GraphQL 契约协作。

先复用或采集需求，再按目标、入口、流程及数据范围自动选择唯一适配的 Web / Extension 宿主、必要能力与本地方案；有真实争议或多个方案同样适用时才推荐。已有合法选择优先复用，自动选择单独记录依据。需要服务时仅补现成服务事实，不能凭缺地址推断没有服务。已有服务时只创建所选前端，不生成 `_server`；选择自建服务时默认创建所选前端和一个 `_server`，并连接本地 Go 服务，不再询问成员组合或服务端类型。未选前端不生成。需求确定完全本地且无需服务时自动使用 none，只创建所选前端。纯本地功能可以真实实现，不需要为它创建虚构业务 endpoint；当前创建流程仍按用户明确的服务来源决定是否有服务成员。

公开入口仍是源 `pnpm instantiate`，例如：

```sh
pnpm instantiate -- /absolute/parent --type web --server create --name "Example" --policy-mode recommended
pnpm instantiate -- /absolute/parent --type extension --server existing --development-base-url https://api.example.test --api-contract /absolute/api.md --description "Example application" --name "Example" --policy-mode recommended
```

Agent 与 CLI 共享题库、条件、汇总和确认。每轮只问一个缺项；Go 技术、用户 API、GraphQL、数据库等不另开初始化问卷，由已确认需求和领域 Skill 按实际操作实施。地址、服务来源、成员或契约变化必须使旧确认失效。

## 原子事务与命令

一个工作区只有一次 sibling staging 事务、一次根依赖安装和一个 Git 基线。各前端成员内部生成和校验时跳过安装/Git；Go 依赖由自身 go.mod/go.sum 声明。任一成员、安装或校验失败时不发布整个工作区，继续使用原有租约、inode 保护与精确回收。已存在用户内容不得覆盖。

根 package.json 不含产品运行时依赖，只包装成员：

| 根命令                                          | 行为                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                                      | 启动自建 Go 服务，真实健康成功后启动所选前端；已有服务不代管外部进程 |
| `pnpm dev:web` / `dev:extension` / `dev:server` | 仅在对应成员存在时生成，启动该成员                                   |
| `pnpm test` / `typecheck` / `lint`              | 聚合适用成员；Go 分别使用 test、编译检查、vet                        |
| `pnpm validate`                                 | 核对拓扑、身份、服务配置与成员约束                                   |
| `pnpm build -- --member web --e2e=disabled`     | 进入选中前端的既有候选构建；同一发布复用 E2E 选择                    |
| `pnpm build:server`                             | 形成本机 Go 开发二进制，不自动发布                                   |

编排器不经 Shell 拼接命令，始终设置成员 cwd，失败传播到根，并回收自己创建的进程树；不能清理其他进程。前端依赖依旧按成员 manifest 从根安装，不能使用全局 React/Vite/测试工具。Windows 从 pnpm 注入的实际入口调用 pnpm；Go 与独立 CLI 按全局工具策略处理。

## 服务配置与真实数据

自建服务默认仅监听 `127.0.0.1:8080`，SQLite 位于服务成员 `data/app.db`，不生成业务账号或演示数据。端口冲突必须报错，不自动接管已有端口或悄悄连接其他服务；需要改端口时同步服务监听、Workspace 开发 BaseURL 和前端配置。测试/正式地址和部署分别配置。

前端产品只用真实 typed adapter；未配置、未实现或不可达时显示真实错误，不返回 Mock。隔离测试可保留 fixtures、mock transport 或临时数据库；这些资源不属于产品运行装配。凭据、邮件/短信 provider、第三方支付和生产写入依旧按真实需求与现有授权边界处理。

根 docs/product_spec 是唯一 PRD，根 docs/api 记录接口与业务关联；成员的工程文档只说明技术差异，不另立产品范围或策略。真实 API 来源为当前 handler/SDL/实现和对应测试；旧参考文档或 BaseURL 不能成为实现证据。

## 独立能力与交接

统一入口 `$workspace-implement-feature` 以具体操作委托七个领域 Skill：

| 领域           | Skill                                |
| -------------- | ------------------------------------ |
| 用户生命周期   | `$workspace-implement-users`         |
| 组织/成员/邀请 | `$workspace-implement-organizations` |
| 角色与有效授权 | `$workspace-implement-permissions`   |
| 商品目录       | `$workspace-implement-catalog`       |
| 订单/恢复      | `$workspace-implement-orders`        |
| 钱包/支付      | `$workspace-implement-wallet`        |
| 真实审计       | `$workspace-implement-audit`         |

每个领域拥有本次前端、Go 服务、契约和真实联调；已有服务仅消费已有合同，无服务则实现两端并连接。底层复用现有会话、访问控制、写恢复、存储、事件能力，以及 Go 服务、持久化、GraphQL、真实投递、文件、子进程和本地编译 Skills。叶子接收范围、成员、服务归属、可信合同、写入所有权和验收场景，完成后返回调用方，不重新问产品或初始化表单。

## 升级边界

这是新创建拓扑。既有平铺下游继续按原宿主维护，不自动移动源码、包身份、Git 或业务数据。升级器支持旧独立单包及当前 Workspace 的原地工程同步；Workspace 只从 Git 根启动，统一根 lock 与本地所有权，根协作工具和前端成员分别按路径投影。Go 服务实现、配置、依赖、数据和全部产品资源受保护；不从成员独立升级。详见 [升级合同](../.agents/skills/web-upgrade-harness/references/workspace-upgrade.md)。整体 Workspace 布局迁移需要单独明确请求、逐路径预演和迁移合同。
