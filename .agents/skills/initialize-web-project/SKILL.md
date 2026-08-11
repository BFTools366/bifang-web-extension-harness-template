---
name: initialize-web-project
description: 一次性初始化一个平铺单 package 的纯 React Web 或 Plasmo Chrome Extension TypeScript 项目，写入项目身份、生成品牌资产、验证真实脚手架并删除初始化入口。用于新下游项目首次初始化；不得用于已初始化项目或类型转换。
---

# 初始化 Web 项目

只创建用户明确选择的一个项目类型。`web` 与 `extension` 互斥，没有默认值、组合模式或后续类型切换。

## 前置门禁

1. 将当前目录解析为项目根，确认它不是 Harness 模板源目录，并确认 Git 顶层目录精确等于当前根。缺少独立仓库时先运行 `git init --initial-branch=main .`，再复核分支、远端和边界。
2. 要求展示名称、ASCII kebab-case 标识、说明、`web|extension` 和 development/test/release 三个 BaseURL 均已明确。直接调用时缺少任一值必须询问用户；不得采用历史 URL 或为 Release endpoint 猜测默认值，Release 必须使用 HTTPS。
3. 读取现有 `docs/AGENT_POLICY.md`。策略缺失或非法时只收集未确定字段；已由 `$instantiate-project` 记录时验证并复用。
4. 调用 `$check-development-environment`。Node.js 与 pnpm 是初始化阻断项；普通 install/typecheck/test/build 不要求 Chrome。只有本次另行批准并实际运行真实浏览器 smoke/E2E 时，Chrome 才成为阻断项。
5. 保留所有现有用户修改。若初始化将覆盖非脚手架空壳、类型已记录、或 `.harness/project.json` 表明项目已初始化，立即停止。

## 执行初始化

运行唯一受支持的命令：

```text
pnpm harness:init -- --type <web|extension> --name "<display-name>" \
  --id <project-id> --description "<description>" \
  --development-base-url <url> --test-base-url <url> \
  --release-base-url <https-url>
```

命令必须在首次写入前完成可确定的输入、碰撞、配置、Logo、文档和许可证预检，再写入 `.harness/project.json`、建立平铺单 package 并裁掉另一类型的模板文件。单个受管文件使用安全写入，但原地初始化不是覆盖全部文件、安装和构建的事务；写入后失败必须明确报错且不得宣称完成，不会自动回滚。不得手工拼装第二套初始化路径。

### 三环境、分页、请求与日志基线

- 一次初始化生成 `.env.development`、`.env.test`、`.env.production`，已有任一受管文件时在首次写入前失败且不得覆盖；逻辑 `release` 固定映射到 `.env.production`。Web 只使用 `VITE_`，Extension 只使用 `PLASMO_PUBLIC_`。
- 每份至少包含 `APP_ENV`、`API_BASE_URL`、`LOG_LEVEL` 与 `REQUEST_TIMEOUT_MS`，生成类型化 Schema、冻结的 `APP_CONFIG` 和非空测试。业务代码不得直接散落 env 读取或 URL。
- 禁止 `.env`、`.env.local`、`.env.development.local`、`.env.test.local` 与 `.env.production.local`；进程只允许用当前宿主的四个已声明公开键覆盖选定 profile，未知公开键必须失败。
- 生成统一 logger 和非空测试；Release 强制 `warn`/`error` 下限，并裁剪敏感键、URL query/fragment、Error stack/cause、请求明细与本机路径。
- 生成统一分页状态、sessionStorage hook/受控组件与非空测试；page/pageSize 按稳定 scope 隔离，只有当前成功空页可从非第一页回退。
- 生成不含业务 endpoint 的原生 Fetch client 与非空测试，动态处理 `X-Http-Request`、`X-Lang`、`X-AUTH-TOKEN`、统一错误与 401 登录 handler；语言偏好持久化，Token 默认只在当前执行上下文内存中保存。
- 配置 BaseURL 不为 Extension 自动增加 `host_permissions`；没有真实网络消费者时不生成请求调用，Extension 跨上下文会话或远端访问仍需另行设计并审批。

### `web` 基线

- 使用 Vite、React 和 TypeScript。
- 使用 Mantine、TanStack Router、TanStack Query、Jotai、i18next/react-i18next。
- 使用 Vitest 与 Testing Library；浏览器里程碑可使用 Playwright 和真实 Chrome。
- 页面、组件、状态、资源和测试直接属于当前 package，不创建共享 workspace package。

### `extension` 基线

- 使用 Plasmo、React、TypeScript 和 Chrome Manifest V3。
- 使用 Mantine、TanStack Query、Jotai、i18next/react-i18next；Extension 基线不引入 TanStack Router，popup 与 options 是独立 Plasmo 入口。
- popup、options、content script、background 等入口只按已批准需求创建；中性脚手架不得虚构权限或业务能力。
- 使用 Vitest 与 Testing Library；浏览器里程碑可使用 Playwright 和真实 Chrome。

## 品牌与首页

1. 初始化命令自身必须完成 `$prepare-brand-identity` 的首次品牌契约；初始化不得以占位图标收尾，也不得在成功后无理由再次运行 `pnpm harness brand refresh`。
2. 要求规范母版位于 `.harness/brand/logo-1024.png`，并验证由同一次初始化生成的派生资产。
3. `web` 必须同步 `public/logo.png`、`public/favicon.png`、根 `index.html` 及可见落地页名称、说明和 Logo。
4. `extension` 必须同步 `assets/icon.png`、package manifest 的名称/说明，以及实际存在的 popup/options 品牌信息；manifest icons 由 Plasmo 从规范 icon 资产派生，不要求手写图标声明。
5. 只生成当前类型的资产；出现另一类型的可运行入口或产物时验证失败。

## 验证与收尾

1. 生成当前宿主后先执行终端化：删除 `.agents/skills/instantiate-project/`、`.agents/skills/initialize-web-project/` 和仅服务模板派生的活动说明，重写 Skills/约束地图；保留开发、品牌、升级、验证、发布和并行 Skills，并确认项目记忆仍按触发创建而非预建。
2. 对终端化结果运行 `pnpm env:validate` 与 `pnpm harness validate`，再运行 package 中真实存在的格式、lint、类型、非空测试和 development/test/release 三种构建脚本；确认任一环境文件缺失或字段非法都会在宿主构建前失败。原地初始化若在终端化后的检查中失败，不得宣称完成，也不会自动恢复已删除或改写的模板文件。
3. 对 `web` 检查逻辑 Release 产生的真实 Vite `dist/`；对 `extension` 检查逻辑 Release 产生的真实 Plasmo Chrome MV3 构建目录及 manifest。`build:release` 必须在构建后自动通过 `pnpm release:inspect`；Extension `package` 同理。初始化阶段不宣称里程碑验收或发布就绪。
4. 搜索旧模板身份、另一类型入口、占位文案、绝对本机路径和未解释的跳过项；逐项解决或报告阻断。
5. 由实例化流程调用时返回创建基线提交所需证据；直接初始化时除非用户明确授权，不自行提交。

## 完成输出

报告唯一类型、身份、三环境与宿主前缀、技术基线、品牌和页面/manifest 同步、环境/日志门禁、运行命令、真实 Release 构建位置、Git 边界、裁剪结果、未验证范围与下一步。公开输出只报告 BaseURL 的安全摘要。
