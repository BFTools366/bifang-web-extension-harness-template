# 2026-09-09 变更记录

## Changed

- Web Harness 的 Agent-first 治理改为事件驱动：持久计划、并行、构建、E2E、完整验收和发布各自按真实触发器进入，普通 Session、左侧 Task 与内部 Subagent 统一使用四段进度标题。
- 初始化在任何写入前完成首轮基础字段批量收集、逐轮条件决议和唯一最终确认，完整解析 Agent policy，并冻结 source 路径、字节、普通权限、Version 与可用 Git 状态；复制冻结快照后在原子发布前再次复核。目标侧新增合作进程租约及 parent/staging/holding/空目标身份绑定，父目录漂移时拒绝发布和替代树清理，普通失败保留原空目录 inode；验证和裁剪完成后在 staging 配置受管 repo-local Git 身份/模板并创建恰好一个 `chore: initialize project` 中性基线提交。公开入口不再接受跳过安装或 Git 的参数。
- 中文注释门禁改为静态结构验证，不再运行时自动生成无意义注释；前端代码采用 500/1000、其他维护文本采用 500/2000 行软硬阈值。
- 新增仓库本地 Git 身份/提交模板 helper、独立 Task 内部并行 Worktree helper、源 Harness 记忆策展 Skill，以及具备不可弱化所有权、candidate/target 双基线、父目录 inode 绑定原子写入、自更新顺序保护、顶层计划状态与稳定失败退出码的下游升级 CLI。
- 源 Harness 建立按日 Product Spec、Product Status、Work Plan、ADR、Changelog 索引与渐进式方法文档；这些源记忆和创建方法不派生到终端项目。
- 源 Harness 新增下游产品需求拒绝门禁，`web-define-product` 只允许已初始化下游；所有 Git Task 统一从派发前记录的精确已提交 OID 创建并拒绝携带未提交状态。
- 根 `AGENTS.md` 新增 UTF-8、20000 bytes、120 行、渐进章节与详细配方去重门禁；活动 Work Plan 新增 Todo 四态解析，并在仍有非 `done` 项时拒绝候选已验收或发布就绪结论。

## Scope

- 保持当前 Vite React Web、Plasmo Chrome MV3 Extension、三环境、数据访问、日志、构建、E2E 和发布协议。
- 明确排除 Rust、Tauri、桌面 GUI/CLI/TUI/MCP、安装器、签名、公证、桌面制品和桌面发布链。
