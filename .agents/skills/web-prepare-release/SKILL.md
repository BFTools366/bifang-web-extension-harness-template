---
name: web-prepare-release
description: 为已验收的 Web Harness 或单 package 纯 TypeScript React Web、Plasmo Chrome MV3 Extension 前端下游准备可追溯发布：Harness 绑定精确源码候选，Web 只处理 Vite dist，Extension 只处理 Chrome MV3 zip。用于用户明确要求准备前端发布、检查发布就绪或整理候选元数据；不自动创建标签、推送、上传或发布。
---

# Web Harness：准备前端发布

只评估当前仓库的唯一候选种类；Harness 源不伪造应用产物，下游只处理 `.harness/project.json.projectType` 对应格式。

## 准入

1. 识别仓库：下游读取 `.harness/project.json`；源 Harness 读取 `Version.md` 且确认不存在该项目文件。再读取 `package.json`、锁文件、发布规则、最新相关 Product Spec、Changelog 和 Verification。
2. 确认用户要求准备发布，并要求 `$web-verify-delivery` 对精确候选给出 `Milestone accepted`。开发检查、构建成功、历史证据或等待人工复核均不充分。
3. 要求独立 Git 顶层目录，`HEAD` 等于已验收源码提交，候选可绑定到项目版本、提交、构建环境和 SHA-256。存在影响候选的脏修改时声明 `Not ready`。
4. Harness 当前版本与发布状态只来自 `Version.md`；下游软件版本来自根 `package.json` 的 SemVer，并同步锁文件及当前类型的可见元数据。版本决定必须由用户确认；不得根据提交或旧版本自行升级。Node/pnpm/依赖按稳定 SemVer 最低版本准入不改变候选版本、提交、lock/hash、Schema/协议或 manifest 的精确匹配。
5. 若版本变化会改变源码或产物，先更新版本、重新生产构建，再返回 `$web-verify-delivery` 验收新字节；旧结论不得复用。

## 唯一产物

### Harness 源

1. 候选是绑定到 `Version.md`、源码提交和 lockfile 的源树；根没有应用 `build` 门禁，也不自行发明 zip、npm 发布包或另一种归档。
2. 要求 `pnpm validate:harness` 及根级适用门禁通过，并复核 `$web-verify-delivery` 已在两个隔离目录验证带三 BaseURL 的 Web/Extension 输出、每个下游唯一 Release 构建，以及 `build:release`/Extension `package` 自动通过 `pnpm release:inspect`；development/test 不生成候选。
3. 记录精确提交、版本、锁文件状态和生成候选证据；外部归档、包注册表上传或 GitHub Release 都需要另行授权。

### Web

1. 只接受本次由逻辑 Release 与 `.env.production` 生成、且 `build:release` 自动通过 `pnpm release:inspect` 的已验收 Vite `dist/` 目录；不创建桌面包、浏览器扩展包或未声明的额外归档。
2. 检查 HTML 入口、静态资源、版本、Logo/favicon、source map 策略和部署所需路由 fallback 说明。
3. 记录目录内发布文件清单与 SHA-256；目录存在本身不代表当前或完整。

### Chrome Extension

1. 只接受本次 `pnpm package` 以逻辑 Release 与 `.env.production` 生成、并自动通过 `pnpm release:inspect` 的已验收 Chrome MV3 zip；拒绝 Firefox、MV2、unpacked 开发目录和其他商店格式作为发布产物。
2. 检查 zip 可安全列出/解压，根 manifest 为 MV3，名称、说明、版本、图标、permissions/host_permissions、入口和资源与批准范围一致。
3. 记录 zip 的 SHA-256、内容清单和真实 Chrome E2E/冒烟结果；重新打包即为新候选，必须重新验收。

## 发布元数据与门禁

1. 只在候选包含符合仓库规则的用户可见新增、变化、移除、安全事项或重要已知问题，且用户明确要求持久记录时更新当天 Changelog；构建命令、时间版本、E2E 选择和测试/扫描结果本身不触发 Changelog、ADR、Verification 或其他项目记忆。
2. 用面向用户的语言汇总变化和已知限制，不用原始提交列表代替说明。
3. 对精确候选复核：版本/提交、文件与哈希、三环境校验、由唯一构建入口完成的类型/全量测试与页面构建版本、Release profile、`pnpm release:inspect` 实际结果、`Milestone accepted`、当次选择启用或被硬要求的 smoke/E2E、真实 Chrome/OS、未验证范围、Changelog 和项目状态。
4. 本 Skill 不运行冒烟/E2E，不补签验证结论；证据缺失时回到 `$web-verify-delivery`。
5. 全部门禁通过才声明 `Ready`；否则声明 `Not ready` 并列出精确阻断项。不得用 `Partially ready` 隐藏必需失败。

## 安全边界

- 不覆盖已发布版本，不编造版本、日期、提交、哈希、产物、测试或人工批准。
- 不创建 tag、远端、push、托管 release、商店上传或部署；每项都需要用户另行明确授权。
- 不处理签名、公证、桌面安装包、移动包、服务器容器、Firefox 包或另一项目类型的产物。
- 不因 `release/`、`dist/` 或 zip 存在就推断其属于当前提交。

## 完成输出

报告 `Ready|Not ready`、仓库种类/项目类型、确认版本、源码提交、唯一候选/产物、SHA-256/清单、三环境与 Release 日志/扫描、验收和策略证据、未验证范围、阻断项与剩余风险；不因准备候选自动写入项目记忆。
