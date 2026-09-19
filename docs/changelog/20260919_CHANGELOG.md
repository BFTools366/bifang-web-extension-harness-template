# 2026-09-19 变更记录

## Added

- 新增只读 `$web-summarize-development-history` Skill，依据当前记忆索引和 Git 事实汇总历史，并区分已决定、已实现、已验证、计划与推测；源 Harness 现在维护 16 个 canonical Skills，终端下游保留 14 个维护 Skills。
- `pnpm validate:harness` 新增 `Version.md` 自然日分钟、时区、格式和发布状态校验，并直接复用生产升级器校验 ownership manifest。
- 源 validator 新增 CRLF、Windows 风格相对路径、策略必需片段、终端 Skill 漂移和所有权/版本变异回归。

## Changed

- 推荐 Agent policy 默认关闭内部 Worktree Subagent 并行，但不影响用户明确创建的左侧 Git Task；任何初始化后的永久策略变更都必须由用户明确确认并写入当日 ADR，同值为幂等 no-op，临时 Task 限制不得持久化。
- 用户可见 Task 统一采用 `Task {序号} | {当前进度} | {单一结果}`；实现 Skill 和生成下游入口补齐真实 `threadId`、Git common dir、登记 Worktree、起始 OID、非 Git cwd、本地提交与 clean 闭环。
- 完整候选验收现在确定性消费 `acceptance_smoke`：硬要求优先，`enabled` 为 `required`，`disabled` 与无硬要求的源 `pending` 为 `not-required`；smoke 与每次构建单独取得的 E2E 选择保持独立。
- Web/Extension 中性模板移除展示性全局计数状态和 Extension 伪 Query，局部交互改用 React state；数据规范明确 Router search、`sessionStorage`、Query、Jotai 与组件局部状态的唯一所有者。
- 生成界面统一由 Mantine theme 管理默认 light、字体和语义令牌；语言切换同步 `<html lang>`，动态计数使用 live region，Extension 使用顶层 `h1`，并以行为测试锁定子控件与外围容器的交互边界。
- 品牌、运行时配置和数据访问文档不再把日常变化自动升级为构建；只有显式候选、完整验收或硬要求触发构建门禁。
- `web-refactor-code` 明确覆盖源 Harness 管理的前端模板；文件遍历和治理解析对 LF/CRLF、POSIX/Windows 路径使用稳定规范化。

## Scope

- 保持 Vite React Web、Plasmo Chrome MV3 Extension、三环境、原生 Fetch、构建与发布协议，不引入新第三方依赖。
- 本次是 Harness 源维护，不创建 Release 候选、不运行浏览器 E2E、不修改 `Version.md` 发布事实，也不创建 tag、PR、部署或上传。
