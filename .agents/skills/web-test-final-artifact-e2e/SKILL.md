---
name: web-test-final-artifact-e2e
description: 按 $web-verify-delivery 已批准的执行契约，在隔离的真实浏览器中（Web 使用 Google Chrome，Extension 使用 Chrome 和 Firefox）对精确 React Web Vite dist 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端候选执行端到端场景并返回证据。不得自行决定策略、候选准入、Todo 回流或候选验收结论，也不得用于开发预览、规划、普通编码或单元测试替代。
---

# Web Harness：测试前端最终产物 E2E

沿最终用户实际入口验证生产候选。始终使用对应浏览器的独立临时 profile，不操作用户日常浏览器资料。

## 准入

1. 接收 `$web-verify-delivery` 的执行契约：精确候选路径与 SHA-256、`projectType`、Release profile、批准场景、预期、超时、外部授权边界和清理要求。不得重新解析 Agent Policy 或扩大场景。
2. 防御性确认调用来自已进入候选验收的 `$web-verify-delivery`，候选字节仍与输入 hash 一致；不重新检查全部 Todo，也不另行决定候选是否准入。
3. 任何登录、真实账号、生产数据、付费、商店上传、凭据或不可逆副作用必须已在执行契约中取得独立明确授权；没有授权就返回对应场景 `blocked`，不自行扩权。
4. 要求 Node.js、pnpm、真实 Google Chrome（Web）或 Chrome 与 Firefox（Extension）和逻辑 Release 候选已有 `pnpm env:validate`、自动通过的 `pnpm release:inspect` 与 `.env.production` 构建证据。拒绝 development/test 构建、开发服务器、源码调用、mock、未构建的初始化空壳、历史产物和推测路径。源 Harness 完整验收只能使用实际生成下游的精确 Release 候选；工程基础的验证不能代表业务产品已验收。

## 场景设计

1. 至少覆盖已批准的关键成功路径和最高风险失败路径。每个场景写明前置条件、隔离数据、步骤、预期可观察结果、超时与清理。
2. 不使用真实生产账号、支付、发布、敏感凭据或不可逆数据，除非用户另行明确授权。外部服务不可用时区分环境阻断与产品失败。
3. 使用仓库既有 Playwright 配置或可用浏览器控制能力；不得为了跑 E2E 永久增加未经批准的依赖或修改候选。

## Web

1. 从精确 `dist/` 启动仅绑定回环地址的静态服务，使用真实 Google Chrome 打开；不使用 Vite 开发服务器或热更新路径。
2. 验证首屏品牌、路由/深链、关键交互、加载/空/错误状态、刷新持久性、键盘导航、焦点和可访问名称。
3. 检查控制台错误、失败网络请求和资源加载；确认没有 debug/info 记录、开发/测试 BaseURL、敏感字段、URL query/fragment、Error stack/cause 或本机路径。不能把一次点击或截图单独视为通过。

## Chrome Extension

1. 将精确 MV3 zip 解压到新临时目录，或使用与 zip 字节对应的 production 构建目录；以临时 user-data-dir 启动真实 Chrome 并加载该唯一 unpacked extension。
2. 从运行时发现扩展 ID 和页面 URL，不硬编码开发期 ID。检查 manifest、安装错误和实际权限提示。
3. 按批准范围验证 popup、options、content script、background/service worker、消息、storage 和站点匹配；只覆盖项目真实存在的入口。
4. 验证浏览器重启或 service worker 重启语义时使用全新状态，不依赖残留进程或旧 profile。
5. 捕获 Popup、Options、content script 与 service worker 的适用 console；确认所有记录符合 Release 的 warn/error 下限、允许字段清单与脱敏规则。

## Firefox MV2 Extension

1. 将精确 Firefox MV2 zip 解压到新的临时目录，与 Chrome 目标分开保存路径/hash和证据；通过真实 Firefox 的独立临时 profile，在 `about:debugging` → This Firefox → Load Temporary Add-on 选择对应 production manifest，遵循 [官方临时加载流程](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)。使用现有浏览器控制能力，不为此全局安装 web-ext。
2. 从运行时发现扩展 ID 与 `moz-extension://` 页面 URL，不假定 Gecko ID 就是内部 UUID。检查 MV2 manifest、browser_action、options_ui、实际加载错误、权限、图标及两语言身份；临时加载不证明签名分发或安装权限弹窗。
3. 按同一批准业务场景独立验证 Popup、Options 及真实存在的 background scripts/page、content script、消息和 Storage；核对 callback/Promise、异步响应、API 不支持/拒绝、跨域与隔离差异，捕获各执行上下文的 Release console。
4. 后台恢复按 Firefox MV2 真实生命周期验证，不把 Chrome service worker 步骤照搬为 Firefox 证据；需验证重启时创建新状态。浏览器能力缺失、失败或未执行分别报告，Chrome 通过不能代表 Firefox。

## 证据与回流

1. 每步前后读取最新页面/扩展状态，记录候选哈希、提交、Release profile、目标/Chrome/Firefox/OS、步骤、预期/观察、截图或 trace、清理后的控制台摘要、关闭和清理。
2. 结束时停止静态服务，关闭本次临时浏览器，移除本次精确临时 profile/解压目录；不得删除用户目录或未知文件。
3. 任何场景失败、超时、取消、阻断或未执行时返回精确场景、证据和建议修复范围，由 `$web-verify-delivery` 统一决定候选结论与 Todo 回流；本 Skill 不直接拒绝候选或修改计划。
4. 未实际执行的浏览器、OS、入口和渠道标记 `Unverified`；不签署人工复核字段。

## 完成输出

报告精确候选与 hash、目标/Chrome/Firefox/OS、逐场景 `passed|failed|blocked|not-run`、证据、清理、未验证范围和剩余风险，不输出独立候选验收结论。
