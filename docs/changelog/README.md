# 变更记录索引

本目录记录已发生且对 Web Harness 用户或维护者可感知的新增、变化、移除、安全事项和重要已知问题。Harness 版本使用 `Version.md` 的上海时区 `YYYYMMDDHHMM`。

## 写入规则

- 文件名固定为 `YYYYMMDD_CHANGELOG.md`；同一天的实际变化持续更新同一文件。
- 普通缺陷修复、行为保持重构、格式整理、测试补强和内部清理不单独进入 Changelog；存在独立合格的契约、安全或发布事件时只记录该事件。
- 不记录未实现需求或中间态；同一未发布周期内被后续实现替代的描述直接合并。
- 只保留日期最新的 Changelog；被完整取代的旧日期文件删除，历史由 Git 保存。
- 当前文件超过 500 行或负责人明确要求时，源 Harness 可用 `$web-curate-harness-memory` 把已被完整取代且无当前引用的原文追加到 `CHANGELOG_history.md`；该 Skill 与历史卷不派生到下游。

## 日期文件

- [2026-10-19](20261019_CHANGELOG.md)
