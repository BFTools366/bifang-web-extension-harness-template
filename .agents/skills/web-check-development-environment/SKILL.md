---
name: web-check-development-environment
description: 检查 Web Harness、纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目所需的 Node.js、pnpm 和 Google Chrome 环境。只用于新下游首次初始化，或命令已经失败且错误指向工具链/浏览器环境时的诊断；普通开发与构建前不预探测。
---

# Web Harness：检查前端开发环境

只检查 Node.js、pnpm 和 Google Chrome；不得探测或安装非 Web/Chrome MV3 工具链。

## 工作流程

1. 读取 package 的 `engines`/`packageManager`、锁文件及存在时同一初始化事务内已经取得的环境结果。`.harness/project.json` 已存在时读取其 `projectType`；初始化前使用调用方明确选择的类型，不要求该文件预先存在。`engines.node` 与 `engines.pnpm` 是稳定 SemVer 兼容最低版本；`packageManager` 必须保持 `pnpm@x.y.z` 精确 pin 格式以供 Corepack 与复现使用，但更高 pin 不因数值不等于初始基线而失败。
2. 新下游首次初始化只检查一次 Node.js/pnpm；Chrome 不属于生成、依赖安装或 Git 初始化前置项。普通编码、相关测试、lint、typecheck、最终 Release 构建、新会话、Agent 切换、宿主或版本约束变化都不触发预探测，直接运行用户请求的命令。
3. 命令已经失败且错误明确指向可执行文件缺失、版本不兼容、原生依赖/宿主加载或 Chrome 启动环境时，才进入故障诊断；网络、Registry、源码、类型、测试、配置或产物错误不得泛化为工具链探测。只检查与症状相关的组件，不机械重跑无关环境项。
4. 初始化时运行只读 `node --version` 与 `pnpm --version`；故障诊断时只运行定位错误所需的最小版本/路径命令。实际版本分别按 `engines.node`、`engines.pnpm` 的稳定 SemVer（`x.y.z`）下界校验：低于最低值、prerelease 或无法解析时阻断，高于最低值时继续真实命令以证明兼容。另行校验 `packageManager` 的工具名、精确 pin 格式及其不低于 `engines.pnpm`；不用 npm、yarn、bun 或全局临时工具替代 pnpm。
5. 已批准的真实浏览器步骤直接交给浏览器执行 Skill；只有 Chrome 无法发现、启动或版本/宿主错误已经发生时，才通过当前操作系统的标准应用位置或 PATH 诊断 Google Chrome。Web 与 Extension 的 install、格式、lint、类型、单元测试和生产构建不探测 Chrome；未运行浏览器时保持 `not-required/not-probed`，不能据此宣称浏览器行为已验证。
6. 不静默安装或升级。缺失或不兼容时，报告观察结果和仓库声明的要求，取得用户授权后才使用官方来源安装；安装后只重新探测受影响组件并重试原失败命令。
7. 环境检查成功只授权初始化或错误重试，不代表源码、测试、构建、浏览器场景或发布产物通过。初始化调用只把结构化结果返回初始化输出；故障诊断不为每次检查创建占位项目记忆。

## 完成输出

报告触发原因（`initialization|observed-environment-failure`）、项目类型、宿主、Node/pnpm/Chrome 的 `required|not-required` 与 `observed|reused|not-probed` 状态、观察版本、约束、安装变更、原失败命令的重试结果和未验证浏览器/平台。
