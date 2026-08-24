# Harness Engineering

本文档解释 Bifang Web Harness Template 的工程方法。它是方法论入口，不复制具体技术、配置、UI、日志、测试或发布细则；这些事实分别由 [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md)、[`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md)、[`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)、[`LOGGING.md`](LOGGING.md)、[`DATA_ACCESS.md`](DATA_ACCESS.md)、[`ENGINEERING_RULES.md`](ENGINEERING_RULES.md) 与 [`RELEASE.md`](RELEASE.md) 维护。

## 1. 目标

Harness 的价值不是生成最多文件，而是用少量稳定事实把 Agent、用户和工具约束到同一条可验证路径：

- 用户从源 Harness 通过唯一公开入口在源外目标创建项目，并显式选择一个项目类型；
- 生成器只创建该宿主所需的单包工程；
- 项目身份与品牌从单一事实源派生；
- 日常工作按风险选择快速、标准或里程碑闭环；
- 最终可用性由真实构建和适用浏览器验证证明，而不是由脚手架存在证明。

## 2. 单选优于组合

Web 与 Extension 虽然都使用 React/TypeScript 和相近 UI/状态技术，但宿主生命周期、权限、安全、入口、构建和发布渠道不同。把两者放进一个仓库会引入 workspace、共享边界、目标增减和跨宿主发布协调，而大多数单宿主项目不需要这些复杂度。

因此本 Harness 采用终端单选：

```text
源 Harness：pnpm instantiate -- <absolute-target-outside-harness> ...
├── --type web       → 独立 React + Vite 单包仓库
└── --type extension → 独立 Plasmo + Chrome MV3 单包仓库
```

需要两个宿主时创建两个仓库，让每个仓库拥有自己的事实、代码、品牌派生、状态、测试、候选和发布授权。相同技术选型不等于共享源码。

## 3. 生命周期

### 3.1 实例化

1. 在源 Harness 根确认源外绝对目标目录、项目名称、稳定标识与描述；不复制模板后原地初始化。
2. 非交互调用显式提供 `--type web` 或 `--type extension`；交互调用在第一步无默认值地提示用户二选一。
3. 接收用户 Logo/品牌色，或根据项目身份确定性生成。
4. 收集 development、test、release 三个 BaseURL，不为 Release endpoint 猜测默认值。
5. `pnpm instantiate` 在目标同级 sibling staging 中复制模板，并把底层 initializer 作为内部步骤调用；源 Harness 根、子路径与模板副本自身都不能成为初始化位置。
6. 只渲染一个模板，写入 `.harness/project.json.projectType`、Logo 母版、三份受管环境、类型化 `APP_CONFIG` 与统一 logger。
7. 同步当前宿主的 HTML/manifest、页面与品牌资产。
8. 执行结构与解析检查，询问当次 E2E 选择，再运行唯一 `pnpm build -- --e2e=enabled|disabled`；该 Release 入口自动完成三环境、Harness、格式、lint、类型、全量测试、`YYYYMMDDHHMM` 页面版本注入、宿主生产构建和 `pnpm release:inspect`，失败时不发布 staging 内容。development/test profile 不生成候选。
9. 原子发布目标，并删除只服务模板派生的 script、Skill 与内部 init/instantiate tooling，使输出成为不能继续派生项目的终端仓库。

源 Harness 不提供 `pnpm harness:init`；`pnpm harness init` 只负责明确拒绝原地初始化并引导到 `pnpm instantiate`，不是第二创建路径。

### 3.2 日常开发

- 快速路径保持小改动短闭环。
- 标准路径只在跨会话、需要交接/失败恢复、步骤依赖明显或用户要求时保留持久 Todo；其他可逆多步骤工作直接实施并运行受影响检查。
- 里程碑路径覆盖初始化器/项目创建契约、类型能力、品牌/身份、安全/权限、兼容性、不可逆或生产副作用和最终候选；新下游实例化使用 `$web-instantiate-project` 自带的完整门禁，不重复制造通用 Work Plan。
- 每轮只读取任务相关事实，不用所有文档和 Skills 填满上下文。

### 3.3 验收与发布

先完成必需 Todo，再取得当次 E2E 用户选择，按当前 `projectType` 使用逻辑 Release 配置运行最终构建，并保留版本注入与自动 `pnpm release:inspect` 证据。选择启用或存在产品/渠道硬要求时，真实浏览器验证必须针对刚生成的精确候选完成。开发预览、Mock、测试替身和占位页面可帮助实现，但不能替代发布结论。外部上传和发布始终需要独立授权。

## 4. 品牌收敛

品牌流程使用“事实 → 母版 → 当前宿主派生”的单向关系：

```text
.harness/project.json
          +
上传 Logo 或确定性生成
          ↓
.harness/brand/logo-1024.png
          ↓
Web: public/logo.png + public/favicon.png + index/Landing
或
Extension: assets/icon.png + manifest + Popup/Options
```

派生文件可以重新生成，所以不能成为第二身份源。生成必须具备确定性和失败原子性，避免页面名称、manifest 描述与图标分别漂移。

## 5. 扩展 Harness，而非叠加下游

未来增加项目类型时，应在 Harness 层新增互斥枚举、独立模板、品牌规则、测试和发布门禁。不能通过向既有下游加入 target add/remove、workspace 或共享 core 来实现。

未来移除类型时，应保留已生成项目的维护说明和升级边界，但不需要让现有仓库自动迁移成其他类型。长期重要且难逆的类型变更进入里程碑路径并记录取舍。

## 6. 阅读路由

- 要初始化或维护模板：读 [`TS_WEB_TEMPLATE.md`](TS_WEB_TEMPLATE.md)。
- 要设计或修改 Mantine 主题、页面、组件、布局与交互状态：读 [`MANTINE_UI_GUIDELINES.md`](MANTINE_UI_GUIDELINES.md)。
- 要初始化、读取或验证 BaseURL 与构建 profile：读 [`RUNTIME_CONFIGURATION.md`](RUNTIME_CONFIGURATION.md)。
- 要设计日志、Release 脱敏或产物扫描：读 [`LOGGING.md`](LOGGING.md)。
- 要选择 REST/OpenAPI、GraphQL、SSE 或可选 RxJS 事件流：读 [`DATA_ACCESS.md`](DATA_ACCESS.md)。
- 要修改代码、测试或文档：读 [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)。
- 要决定任务路径、持久计划、并行、冒烟或 E2E：读 [`AGENT_POLICY.md`](AGENT_POLICY.md)。
- 要准备候选或发布：读 [`RELEASE.md`](RELEASE.md)。
- 发现范围外问题：写 [`TECH_DEBT.md`](TECH_DEBT.md)。

方法论只有在帮助当前决策时才需要读取；日常任务继续遵循根 [`AGENTS.md`](../AGENTS.md) 的最小闭环。
