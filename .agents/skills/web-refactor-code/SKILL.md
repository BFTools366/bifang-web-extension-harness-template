---
name: web-refactor-code
description: 对 Web Harness 受管前端模板或其单 package 纯 TypeScript React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游的 TypeScript/TSX 做行为保持重构，处理职责、命名、重复、状态归属、性能和浏览器生命周期风险；不改变公开行为、权限或项目类型。
---

# Web Harness：重构前端代码

改善既有代码的可读性和内聚性，保持用户可观察行为不变，不为假想未来预建抽象。

## 工作流程

1. 行为保持时直接重构。若发现真实缺陷、安全/隐私问题、Extension 权限变化或公开契约必须改变，停止重构范围蔓延，转 `$web-implement-change` 并进入适用的专项批准与验证门禁。
2. 读取工程规则、受影响代码/测试；已有 Git 时读取 diff，无 Git 按当前文件和明确范围继续；保护用户修改，只处理声明范围。存在 `.harness/project.json` 时读取并核对唯一 `projectType`；不存在但根 manifest 暴露源专用 `instantiate` 入口时，只重构 Harness 自身受管模板与工具链，不分析或加入具体产品业务。`projectType=web` 的列表页、数据表格、后台列表或搜索结果还要读取并遵守 `$web-implement-list-view`；Extension 不调用该 Skill。
3. 实际职责、依赖或状态归属不清时委托 `$web-review-module-boundaries`，复用其证据和建议后继续本次重构；只读审查本身不启动修改或测试。复核文件体积：501–600 行逐项判断业务高内聚、单一职责和职责相近性，任一不满足就按职责拆分；601 行起必须拆分。拆分文件留在原功能或工具模块目录，不得用跨模块兜底目录、压缩格式、转发壳或空文件规避。
4. 按 `docs/ENGINEERING_RULES.md` 的“文件结构与模块依赖”（源 §3.2）复核功能内聚、单一职责、单向无环依赖及公共边界；组件、hooks、局部状态、样式和测试就近组织，API/存储保持既有数据层归属。调用方优先从具体文件具名导入；只有真实稳定公共 API 才保留 `index.ts`，不使用 `export *` 隐藏来源，不访问另一功能的私有实现。
5. 不建立 `utils`、`common`、`helpers`、`misc` 等兜底目录，不因文件数量或想象中的共享需要创建 workspace/package 层。
6. 把泛化的 manager/processor/handler、占位缩写和模糊状态名改为真实功能概念；同步引用和测试名称。
7. 只对重复或语义不直观的字面量提取命名常量；不把单次简单值包装成抽象。
8. 复核状态归属：TanStack Query 不与 Jotai 重复保存服务数据；派生值不落成可漂移状态；React effect 依赖和清理完整；memoization 必须有真实渲染或计算收益。Web 路由列表中 Router search 继续是已应用搜索/筛选/排序/页码的唯一运行时 owner，sessionStorage 不得被重构为第二个可写状态，rows/`total` 仍只属于 Query。
9. Web 检查重复请求、路由生命周期、事件/定时器清理和 bundle 边界。已初始化 Extension 的重构触及宿主边界时委托 `$web-review-extension-compatibility`；修复、行为保持证明及必要测试仍由本 Skill 负责。Harness 源扩展模板维护按工程事实源核对生命周期与双目标合同。
10. 保持 i18next key、无障碍名称、DOM/路由契约、manifest 权限、存储格式、`APP_CONFIG` 字段/三环境映射、logger scope/event 与 Release 脱敏语义不变；需要改变时退出本 Skill。
11. 先运行本次重构直接影响的非空测试，Web 列表还要运行 `$web-implement-list-view` 指定的适配后纯函数契约；再运行全量 `pnpm test` 证明行为保持。只对本次触及文件执行确有必要的格式、lint、类型、中文注释或体积门禁，不自动扩大为全仓静态检查。只有本次还要求最终候选时才解析或复用本次发布的 E2E 选择并运行唯一 Release `pnpm build -- --e2e=enabled|disabled`，确认其自动完成环境、Harness、版本注入与 `release:inspect` 门禁。文件移动后确认测试发现、环境加载、logger 入口和生产入口没有失效。
12. 纯重构本身不触发 Product Spec、ADR、Status、Changelog 或 Verification；范围外问题只在现有技术债机制被真实触发时登记。

## 硬边界

- 不改变可观察行为、公开页面/路由、扩展消息、权限、站点匹配、存储语义或品牌元数据。
- 不把项目转换为 monorepo，不创建另一项目类型，不用“共享”作为空抽象理由。
- 不做没有证据的性能优化；证据可以是 profiler、基准、真实调用路径或可复现重复行为。

## 完成输出

报告范围、文件拆分、目录与命名调整、状态归属修正、真实性能/生命周期问题、测试与检查、行为保持证据、未处理项和剩余风险。
