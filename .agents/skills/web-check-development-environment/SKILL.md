---
name: web-check-development-environment
description: 检查 Web Harness、纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目所需的 Node.js、pnpm 和 Google Chrome 环境。只用于初始化、最终构建、故障诊断，以及当次启用的 E2E 或被硬要求的真实浏览器验证；普通开发任务不重复检查。
---

# Web Harness：检查前端开发环境

只检查 Node.js、pnpm 和 Google Chrome；不得探测或安装非 Web/Chrome MV3 工具链。

## 工作流程

1. 读取 package 的 `engines`/`packageManager`、锁文件及存在时与当前宿主和版本约束匹配的最新环境证据。`.harness/project.json` 已存在时读取其 `projectType`；初始化前使用调用方明确选择的类型，不要求该文件预先存在。`engines.node` 与 `engines.pnpm` 是稳定 SemVer 兼容最低版本；`packageManager` 必须保持 `pnpm@x.y.z` 精确 pin 格式以供 Corepack 与复现使用，但更高 pin 不因数值不等于初始基线而失败。
2. 首次初始化必须检查 Node.js/pnpm；最终 Release 构建前仅在没有与宿主、项目类型和版本约束匹配的可复用证据时重新检查；执行失败且症状可能来自工具链时进入故障诊断。普通编码、相关测试、lint、typecheck、新会话或 Agent 切换都不得触发探测。宿主、项目类型或版本约束变化只使旧证据失效，并在下一次初始化、构建或相关故障诊断时检查。Chrome 只在用户、产品、安全或渠道硬要求真实浏览器步骤且既有匹配证据不可复用时检查。
3. 运行只读 `node --version` 与 `pnpm --version`。只有调用方把 Chrome 标记为 required 时，才通过当前操作系统的标准应用位置或 PATH 查找 Google Chrome 并读取版本；否则不探测并记录 `not-required/not-probed`。记录实际可执行文件来源，但对外证据隐藏不必要的个人目录。
4. Node.js 和 pnpm 对初始化与最终构建是阻断项；普通开发命令实际失败时按错误诊断处理，不预先探测。实际版本分别按 `engines.node`、`engines.pnpm` 的稳定 SemVer（`x.y.z`）下界校验：低于最低值、prerelease 或无法解析时阻断，高于最低值时继续运行构建门禁以证明兼容。另行校验 `packageManager` 的工具名、精确 pin 格式及其不低于 `engines.pnpm`；不用 npm、yarn、bun 或全局临时工具替代 pnpm。
5. Chrome 只对当次构建选择启用的 E2E、用户/产品/安全/渠道硬要求的真实浏览器冒烟/E2E 或浏览器渲染证据是阻断项。Web 与 Extension 的 install、格式、lint、类型、单元测试和生产构建均只要求 Node.js/pnpm；选择关闭 E2E 时的 `not-required/not-probed` 不能据此宣称浏览器行为已验证。
6. 不静默安装或升级。缺失或不兼容时，报告观察结果和仓库声明的要求，取得用户授权后才使用官方来源安装；安装后重新探测全部受影响门禁。
7. 门禁成功只授权继续，不代表源码、测试、构建、浏览器场景或发布产物通过。
8. 初始化调用只把结构化结果返回初始化输出；其他任务仅在仓库环境证据规则独立触发时写入项目记忆，不为每次检查创建占位文件。

## 完成输出

报告项目类型、宿主、Node/pnpm/Chrome 的 `required|not-required` 与 `observed|reused|not-probed` 状态、观察版本、约束、安装变更、阻断失败、可复用证据和未验证浏览器/平台。
