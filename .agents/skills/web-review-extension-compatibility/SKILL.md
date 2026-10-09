---
name: web-review-extension-compatibility
description: 只读审查已初始化 Plasmo Extension 下游中受影响功能的 Chrome MV3 / Firefox MV2 兼容性，检查真实消费者、执行上下文、API、消息、权限和生命周期证据；用于专项审查或实施、重构中的宿主边界审查，不自动修改权限、构建或启动浏览器。
---

# Web Harness：审查 Extension 双目标兼容

## 触发与输入

- 仅用于已初始化且 `projectType=extension` 的下游。先读取 `.harness/project.json`；Web、Harness 源或身份缺失时停止本 Skill，源模板维护交回调用方。
- 用户明确要求兼容审查，或当前变更触及浏览器 API、消息/Port、Storage、后台、content script、权限、CSP、资源或扩展 URL 时使用。纯文案、纯展示样式不自动触发。
- 输入为授权范围、代码或 diff、真实入口/执行上下文、声明版本和已有测试/浏览器证据。缺少事实时报告缺口，不虚构消费者。

## 工作流程

1. 读取当前下游 `docs/ENGINEERING_RULES.md` 的 Extension、生命周期与测试规则；涉及跨域、认证或跨上下文状态时再读 `docs/DATA_ACCESS.md` 的相关章节。源专用文档不作为下游前置项。
2. 从入口追踪实际消费者，区分 Popup、Options、content script、Chrome service worker 与 Firefox 后台；只针对受影响调用查询 Chrome/Mozilla 官方文档，记录适用版本。
3. 按消费者分别核对两目标的 API 支持和参数、callback/Promise、异步消息响应、sender/输入校验、权限及拒绝、后台恢复、监听清理、重复注入、CSP/资源和 URL。规则以工程事实源为准，不另建第二份兼容标准。
4. 检查已有测试是否分别表达目标差异、成功及最高风险拒绝/不支持路径。一个 Chrome mock、单目标构建或静态文件不能证明双目标浏览器行为。
5. 只报告问题、最小修复建议和适用门禁；不修改代码、测试、manifest、权限或依赖，不自行构建、加载浏览器或创建候选。
6. 调用方负责修复和必要测试，本 Skill 复用其已有结果，不重复执行。真实浏览器硬要求返回调用方，经既有 `$web-verify-delivery` / `$web-test-final-artifact-e2e` 链处理。

## 输出与判定

按“消费者 × Chrome MV3 / Firefox MV2”报告符合、问题、未验证或有证据的不适用，附源码位置、官方依据和已有测试证据；分别标注静态审查、受控测试与真实浏览器证据。

完成条件是每个受影响消费者均有双目标结论或有理由的不适用，并列明必要适配、权限批准、候选门禁和剩余风险。没有双目标真实浏览器证据时，不声明功能已在两浏览器可用。
