---
name: extract-i18n-strings
description: 扫描当前 React Web 或 Plasmo Extension 的 TSX 用户可见文案，将硬编码字符串迁移到既有 i18next/react-i18next 资源，同时保持默认语言行为。用于已有 React i18n 基线的文案整理；不处理 manifest、本地化之外的品牌元数据或非 React 机制。
---

# 提取 React i18n 文案

只使用 `i18next` 与 `react-i18next`，不建立浏览器专用、运行时专用或第二套翻译系统。

## 工作流程

1. 读取 `.harness/project.json`，确认当前唯一类型和既有 i18next 初始化、语言探测、fallback language、namespace 与资源目录。基础能力缺失时先转 `$implement-change`，不要在抽取过程中临时发明配置。
2. 默认把不改变默认语言展示的迁移作为快速/标准重构。新增语言切换、改变探测或 fallback 行为属于用户可见变化，使用标准路径；影响公开范围时按规则升级。
3. 扫描当前 package 的 React TSX/JSX：文本节点、label、placeholder、title、aria-label、通知、空状态、错误展示及插值文案。
4. Web 只扫描实际页面和组件；Extension 扫描实际存在的 popup/options/content 等 React UI。background 无 React UI 时不为它创建另一套机制。
5. 排除标识符、CSS 类、URL、日志、错误码、测试夹具、注释、调试文本、协议字段和非用户可见常量。`package.json`/manifest 名称说明由 `$prepare-brand-identity` 管理，不在此转换为 Chrome `_locales`。
6. 为每处文案生成或复用稳定的功能域层级 key，例如 `settings.language.label`；key 不得等于整句源文案。组件通过 `useTranslation`/`t()` 获取，并保持插值、复数和富文本的安全边界。
7. 只为基准语言和已批准维护语言写真实翻译。不得臆造未批准译文；缺失译文按仓库规则记录原因、负责人和完成条件，不用机器翻译冒充确认结果。
8. 默认语言的文字、无障碍名称、格式化参数和交互含义必须与迁移前一致。资源按真实功能域内聚，超过 500 行复核拆分，超过 2000 行必须拆分。
9. 运行相关 Vitest/Testing Library 测试，验证默认语言渲染、切换（若既有）、fallback、插值和 aria 文案；再运行适用格式、lint、类型、构建及 `pnpm harness validate`。
10. 纯文案位置迁移不自动创建 Product Spec、ADR、Status、Changelog 或 Verification；真实文案含义变化按用户可见变化单独处理。

## 硬边界

- 不引入第二套 i18n 库、Chrome `_locales`、手写语言分支或其他并行机制。
- 不修改 manifest 权限、路由、消息协议、存储语义或项目类型。
- 不用空值、源文案 key 或无说明临时标记伪装完成。

## 完成输出

报告扫描范围、抽取数量、key 与资源文件、跳过项及原因、缺失译文、默认语言行为证据、测试和剩余风险。
