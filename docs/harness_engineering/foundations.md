# 工程基础

## 单宿主单包

Web 与 Extension 都使用 React/TypeScript，但宿主生命周期、权限、入口、构建和渠道不同。源 Harness 因此提供终端单选：

```text
pnpm instantiate -- <absolute-target-outside-harness> ...
├── --type web       → 独立 Vite React 单包
└── --type extension → 独立 Plasmo Chrome MV3 单包
```

需要两个宿主时建立两个仓库。相同技术选型不等于共享业务源码；下游不保留添加/删除宿主、workspace、`apps/`、`packages/` 或共享 core。

## 身份与品牌

`.harness/project.json` 是下游名称、标识、说明、唯一 `projectType` 与品牌事实源。用户 Logo 或基于身份确定性生成的图像先形成 `.harness/brand/logo-1024.png`，再只派生当前宿主资产：Web 的 `public/logo.png`、favicon、HTML/Landing，或 Extension 的图标、manifest、Popup/Options。派生文件可重建，不能反向成为身份源。

## 技术职责

- Web：Vite、React/TypeScript、Mantine、TanStack Router 文件路由、Query、Jotai、i18next。
- Extension：Plasmo、Chrome MV3、React/TypeScript、Mantine、Query、Jotai、i18next；不引入 Router。
- Query 管远端/异步服务器状态；Jotai 只管必要跨组件客户端状态；简单局部状态留在组件。
- UI 只使用 Mantine theme、语义令牌与受控样式；Extension 权限保持真实最小集合。

## 环境、数据与日志

development、test、release 三环境始终齐全；release 只映射 `.env.production`。当前宿主仅公开四个已声明键，业务只读冻结 `APP_CONFIG`；`.env`、`.env*.local`、未知公开键与浏览器秘密失败关闭。

初始化器只生成通用原生 Fetch、1-based 分页、语言/认证 header、超时、401 handler 与安全 logger，不生成业务 endpoint。Ky/OpenAPI、GraphQL、SSE、RxJS 只随真实需求加入；RxJS 不替代 Query/Jotai、持久事件日志或 Chrome 跨上下文消息。

产品代码不散落 `console.*`。Release logger 强制最低级别、字段白名单以及敏感键、URL query/fragment、Error stack/cause、本机路径脱敏；构建和 Extension package 自动运行敏感信息检查。

## 依赖与可维护性

优先标准库和已声明依赖，不假定全局第三方包。新增依赖要有真实能力理由、兼容与安全证据，并保持项目本地声明。Node.js/pnpm 使用稳定 SemVer 下界；新下游首次初始化检查一次，普通开发或构建不预探测，真实失败指向环境后才诊断。

稳定 TypeScript 声明使用紧邻中文注释；前端源码 501–1000 行提示、1001 行起失败，其他受管文本 501–2000 行提示、2001 行起失败。阈值推动职责拆分，不鼓励自动注释或机械压行。
