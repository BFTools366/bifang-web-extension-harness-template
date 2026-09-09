---
name: web-curate-harness-memory
description: 仅在 Web Harness 源根中整理自身 ADR 与 Changelog 历史：把已被后续决定完整取代且不再被当前规范引用的条目原文迁移到同目录只追加历史卷。用于文件超过建议阈值或负责人明确要求整理时；不得随 React Web 或 Plasmo MV3 下游派生。
---

# Web Harness：治理 Harness 自身记忆历史

本 Skill 只治理源 Harness 的 `docs/adr/` 与 `docs/changelog/`。它不是日常写入步骤，也不适用于 `product_spec`、`project_status`、`work_plan` 或候选/Verification 证据。

## 准入

1. 只有当前最新日期文件超过人工维护文本 500 行建议阈值，或项目负责人明确要求整理时触发。
2. 先完整读取目标目录的 `README.md`、当前最新日期文件、根 `AGENTS.md` 和 `docs/ENGINEERING_RULES.md` 的记忆规则。
3. 本 Skill、源 Harness 的 ADR/Changelog 历史和批准记录都不得由实例化或升级传播到下游。

## 判定与迁移

1. ADR 按 `## ADR-YYYYMMDD-NNN` 拆分；Changelog 按能独立归档的最小条目拆分。
2. 只有更晚条目明确完整取代旧条目，且全仓（排除当前文件与历史卷）不再把旧稳定 ID 作为有效依据时，才允许整条迁移。
3. 部分取代、无明确取代声明、仍被直接或间接引用，或结论不确定的条目全部保留；存疑项只报告为人工候选。
4. 将可迁移条目的原文字节不改写地追加到 `ADR_history.md` 或 `CHANGELOG_history.md`，再从当前文件删除。历史卷只追加、不重写、不删除；误判通过 Git 历史把条目恢复到当前文件，不能反向编辑历史原文。
5. 更新目录索引以链接历史卷并说明“仅 Harness 源使用”。历史卷超过 2000 行时建立编号续卷并更新双向索引，不压缩原文规避阈值。

## 验证与输出

运行 `pnpm validate:harness` 和 Markdown 链接/行数相关测试，确认 `product_spec`、`project_status`、`work_plan` 与发布证据未被触碰。报告迁移 ID、完整取代依据、迁移前后行数、历史卷路径和保留的人工候选；没有可证明条目时保持零写入。
