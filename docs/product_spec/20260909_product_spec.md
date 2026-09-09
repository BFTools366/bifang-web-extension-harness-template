# 2026-09-09 产品规格

状态：Approved

## 产品使命

本仓库是 Agent-first 的纯 TypeScript Web Harness。它从源根唯一公开入口生成两种互斥终端下游之一：

- 单 package 的 Vite + React/TypeScript Web 应用；
- 单 package 的 Plasmo + React/TypeScript Chrome MV3 Extension。

一个下游只有一个 `projectType`，不生成 monorepo、共享 core、多宿主或宿主切换入口。AI Agent 是工程规则的第一消费者，人类负责产品方向、外部副作用和最终发布授权。

## 用户与核心问题

- 主要用户是需要快速建立一致、可维护前端工程基线的产品负责人和工程 Agent。
- Harness 必须把身份、品牌、环境、数据访问、日志、测试、构建、Agent policy 与维护 Skills 变成可验证契约，而不是依赖会话记忆。
- 新项目创建必须原子、可审计且不污染源仓库；下游维护必须保护产品代码、身份、品牌、记忆、策略与本地修改。

## 固定范围

- Web 使用 Vite、Mantine、TanStack Router 文件路由、TanStack Query、Jotai 与 i18next。
- Extension 使用 Plasmo、Chrome MV3、Mantine、TanStack Query、Jotai 与 i18next，不引入 TanStack Router。
- 两类项目共享工程契约但不在同一仓库共享业务源码。
- `.harness/project.json` 是名称、标识、说明、唯一 `projectType` 和品牌事实源；Logo 母版固定为 `.harness/brand/logo-1024.png`。
- development、test、release 三环境完整存在；浏览器端只读取当前宿主四个已声明公开变量，逻辑 release 映射 production。
- 初始化器生成原生 Fetch、1-based 分页、语言/认证 header、超时、401 handler、安全 logger 与 Release 检查基线，不生成业务 endpoint 或占位事件总线。
- 用户可见文案进入 i18next；Query 管服务器状态，Jotai 只管必要的跨组件客户端状态。

## Agent-first 执行契约

- 源 Harness 只接收自身工程维护与当前表单固定初始化字段；下游产品目的、用户场景、业务、专属 UI/文案/数据、远程凭据、产品构建或发布需求必须在分析或记录前拒绝，并要求实例化或切换到既有下游后重新提出。
- 日常范围清楚的工作直接实施并运行相关非空测试，不先套用任务等级。
- Work Plan 仅在用户明确要求、跨会话交接，或发布/高风险工作确需协调时创建。
- 普通 Session、用户可见左侧 Task 与内部 Subagent 使用 `{序号}|{Task简述}|{当前进度} |{功能摘要}`；进度只取 `已分配`、`运行中`、`检查中`、`已完成`。
- 左侧 Task 必须绑定用户选择的保存项目；所有 Git Task 都从派发前解析并记录的精确已提交 OID 创建并在绑定时复核，不能携带未提交状态。内部写入型 Subagent 还同时要求当前用户明确提出并行、持久策略启用、至少两个互不重叠单元及 helper 门禁通过。
- 初始化先完成首轮项目字段收集，再按条件确认 Agent policy；非交互调用必须显式给出全部必需决议。所有写入前冻结 source 文件、模式、Version 与可用 Git 身份，发布 staging 前再次逐字节复核；脚手架验证和裁剪完成后在 staging 建立独立 Git 根、受管 repo-local 身份/模板与恰好一个 `chore: initialize project` 中性基线提交。
- Git 提交 helper 只补齐缺失的生效身份，复用合法 Unicode/global 配置；模板与配置只写仓库 local/common-dir，失败回滚，不自动提交。
- 下游升级使用受保护双基线、不可弱化所有权、只读三方 plan、路径级批准、每次写后重规划与收敛后 record。

## 质量与安全边界

- 受管 TypeScript/TSX 的稳定声明使用紧邻中文注释；不在运行时自动注入无意义注释。
- 人工维护前端代码 501–1000 行提示职责复核，1001 行起失败；其他受管文本 501–2000 行提示，2001 行起失败。
- 行为变化必须覆盖核心成功路径和最高风险失败路径；零相关测试不构成通过。
- 初始化目标必须位于源外空目录，并经同目标合作租约、身份绑定 sibling staging、单次安装、Git 初始化、唯一 local root commit 和原子 rename 发布；结果保持 clean 且无远端。父目录漂移时失败关闭且不清理替代树。Node 标准库不具备跨平台目录 no-replace flag，故意绕过租约的同机竞态不属于本协议保证。
- Extension 只申请真实功能所需最小权限，不使用远程托管可执行代码。
- 不在浏览器配置、日志、候选或提交中泄漏秘密；Release logger 仅保留批准字段并脱敏 URL、路径、Error stack/cause。
- 发布、推送、tag、部署、上传、商店提交、生产数据与不可逆副作用分别需要明确授权。

## 明确排除

- Rust、Tauri、桌面 GUI、桌面 CLI/TUI/MCP、安装器、签名、公证和桌面发布链。
- 同仓库 Web + Extension、workspace、`apps/`、`packages/` 或创建第二宿主的入口。
- 初始化期间选择 E2E 或生成最终候选；最终构建必须在下游另行取得当次选择。
- 全局依赖安装、自动升级 Node.js/pnpm/Chrome、自动创建 PR/tag/发布或静默改写 Git 全局配置。

## 成功标准

- 源 Harness 验证器可确定性证明 Skills、治理文档、模板、初始化、环境、注释、行数和安全边界一致。
- Web 与 Extension 均能从源外独立实例化，生成仓库只有其单一宿主所需文件、不保留派生入口，并各自拥有恰好一个中性本地基线提交且无远端。
- 两类下游通过各自格式、lint、类型、非空测试、Release 构建、敏感信息扫描和当次选择要求的真实 Chrome 验收。
- 源发布提交与 `Version.md`、远端默认分支可回读一致；未实际执行的外部渠道操作保持 `Unverified`。
