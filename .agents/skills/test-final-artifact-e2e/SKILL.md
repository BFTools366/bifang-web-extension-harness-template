---
name: test-final-artifact-e2e
description: 在隔离的真实 Google Chrome 中对已构建的 Web dist 或 Plasmo Chrome MV3 候选执行端到端验收。仅由 $verify-delivery 在全部 Todo 完成且 Agent Policy 或产品/渠道硬要求启用 E2E 时调用；不得用于开发预览、规划、普通编码或单元测试替代。
---

# 测试最终产物 E2E

沿最终用户实际入口验证生产候选。始终使用临时 Chrome profile，不操作用户日常浏览器资料。

## 准入

1. 读取 `.harness/project.json.projectType`、已批准成功标准、活动 Work Plan、Agent Policy 和相关 Verification。
2. 要求所有 Todo `done`，且 `$verify-delivery` 已进入里程碑验收；否则停止并报告 `Not run`。
3. 要求 `milestone_e2e: enabled` 或存在明确 `required` 硬规则。`disabled` 时除非硬规则覆盖，只记录 `Not run`；缺失/非法时要求用户解决。
4. 要求 Node.js、pnpm、真实 Google Chrome 和逻辑 Release 候选已由 `pnpm env:validate`、自动通过的 `pnpm release:inspect`、`.env.production` 构建证据及 SHA-256 精确定位。拒绝 development/test 构建、dev server、源码调用、mock、脚手架、历史产物和推测路径。

## 场景设计

1. 至少覆盖已批准的关键成功路径和最高风险失败路径。每个场景写明前置条件、隔离数据、步骤、预期可观察结果、超时与清理。
2. 不使用真实生产账号、支付、发布、敏感凭据或不可逆数据，除非用户另行明确授权。外部服务不可用时区分环境阻断与产品失败。
3. 使用仓库既有 Playwright 配置或可用浏览器控制能力；不得为了跑 E2E 永久增加未经批准的依赖或修改候选。

## Web

1. 从精确 `dist/` 启动仅绑定 loopback 的静态服务，使用真实 Google Chrome 打开；不使用 Vite dev server 或热更新路径。
2. 验证首屏品牌、路由/深链、关键交互、加载/空/错误状态、刷新持久性、键盘导航、焦点和可访问名称。
3. 检查控制台错误、失败网络请求和资源加载；确认没有 debug/info 记录、开发/测试 BaseURL、敏感字段、URL query/fragment、Error stack/cause 或本机路径。不能把一次点击或截图单独视为通过。

## Chrome Extension

1. 将精确 MV3 zip 解压到新临时目录，或使用与 zip 字节对应的 production 构建目录；以临时 user-data-dir 启动真实 Chrome 并加载该唯一 unpacked extension。
2. 从运行时发现扩展 ID 和页面 URL，不硬编码开发期 ID。检查 manifest、安装错误和实际权限提示。
3. 按批准范围验证 popup、options、content script、background/service worker、消息、storage 和站点匹配；只覆盖项目真实存在的入口。
4. 验证浏览器重启或 service worker 重启语义时使用全新状态，不依赖残留进程或旧 profile。
5. 捕获 popup、options、content script 与 service worker 的适用 console；确认所有记录符合 Release 的 warn/error 下限、字段 allowlist 与脱敏规则。

## 证据与回流

1. 每步前后读取最新页面/扩展状态，记录候选哈希、提交、Release profile、Chrome/OS、步骤、预期/观察、截图或 trace、清理后的控制台摘要、关闭和清理。
2. 结束时停止静态服务，关闭临时 Chrome，移除本次精确临时 profile/解压目录；不得删除用户目录或未知文件。
3. 任何必需场景失败、超时、取消或未执行时，记录证据、拒绝里程碑、重开具体修复 Todo 并返回 `$implement-change`。修复后重跑完整场景集。
4. 未实际执行的浏览器、OS、入口和渠道标记 `Unverified`；不签署人工复核字段。

## 完成输出

报告精确候选、策略来源、Chrome/OS、场景、证据、清理、通过/失败、重开的 Todo、未验证范围和剩余风险。
