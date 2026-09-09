---
name: web-refactor-code
description: 对单 package 纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端的 TypeScript/TSX 做行为保持重构，处理文件职责、功能目录、命名、重复、状态归属、渲染性能和浏览器生命周期风险。仅在存在真实前端结构问题时使用，不改变公开行为、权限或项目类型。
---

# Web Harness：重构前端代码

改善既有代码的可读性和内聚性，保持用户可观察行为不变，不为假想未来预建抽象。

## 工作流程

1. 行为保持时直接重构。若发现真实缺陷、安全/隐私问题、Extension 权限变化或公开契约必须改变，停止重构范围蔓延，转 `$web-implement-change` 并进入适用的专项批准与验证门禁。
2. 读取 `.harness/project.json`、工程规则、受影响代码/测试和 Git diff；保护用户修改，只处理声明范围。
3. 复核文件体积：501–1000 行逐项判断业务高内聚、单一职责和职责相近性，任一不满足就按职责拆分；1001 行起必须拆分。拆分文件留在原功能或工具模块目录，不得用跨模块兜底目录、压缩格式、转发壳或空文件规避。
4. 按 feature 内聚组织组件、hooks、services、state、样式和测试。调用方优先从具体文件导入；只有真实稳定公共 API 才保留 `index.ts`，必须具名导出，不使用 `export *` 隐藏来源。
5. 不建立 `utils`、`common`、`helpers`、`misc` 等兜底目录，不因文件数量或想象中的共享需要创建 workspace/package 层。
6. 把泛化的 manager/processor/handler、占位缩写和模糊状态名改为真实功能概念；同步引用和测试名称。
7. 只对重复或语义不直观的字面量提取命名常量；不把单次简单值包装成抽象。
8. 复核状态归属：TanStack Query 不与 Jotai 重复保存服务数据；派生值不落成可漂移状态；React effect 依赖和清理完整；memoization 必须有真实渲染或计算收益。
9. Web 检查重复请求、路由生命周期、事件/定时器清理和 bundle 边界。Extension 额外检查 runtime/storage 消息监听清理、content script 重复注入、MV3 service worker 唤醒假设和 popup/options 卸载行为。
10. 保持 i18next key、无障碍名称、DOM/路由契约、manifest 权限、存储格式、`APP_CONFIG` 字段/三环境映射、logger scope/event 与 Release 脱敏语义不变；需要改变时退出本 Skill。
11. 先运行本次重构直接影响的非空测试，再运行全量 `pnpm test` 证明行为保持；只对本次触及文件执行确有必要的格式、lint、类型、中文注释或体积门禁，不自动扩大为全仓静态检查。只有本次还要求最终候选时才询问当次 E2E 选择并运行唯一 Release `pnpm build -- --e2e=enabled|disabled`，确认其自动完成环境、Harness、版本注入与 `release:inspect` 门禁。文件移动后确认测试发现、环境加载、logger 入口和生产入口没有失效。
12. 纯重构本身不触发 Product Spec、ADR、Status、Changelog 或 Verification；范围外问题只在现有技术债机制被真实触发时登记。

## 硬边界

- 不改变可观察行为、公开页面/路由、扩展消息、权限、站点匹配、存储语义或品牌元数据。
- 不把项目转换为 monorepo，不创建另一项目类型，不用“共享”作为空抽象理由。
- 不做没有证据的性能优化；证据可以是 profiler、基准、真实调用路径或可复现重复行为。

## 完成输出

报告范围、文件拆分、目录与命名调整、状态归属修正、真实性能/生命周期问题、测试与检查、行为保持证据、未处理项和剩余风险。
