# Harness 升级预演执行契约

## 生产所有权与候选投影

完整读取目标仓库内 [所有权规范](../../web-upgrade-harness/references/ownership-policy.md) 与 [生产清单](../../web-upgrade-harness/references/ownership-manifest.json)。另一个仓库的清单或 helper 不能替目标授权，未知候选路径按 `defaultMode: protected` 失败关闭。

候选只包含 `managed`、`managed-self`、`merge-sections`、`conditional` 允许的路径；混合文件仍需人工合并，不授权覆盖目标产品值。产品源码、测试、品牌、项目身份、Agent Policy、项目记忆、许可证、未登记本地文件及 `design-taste-frontend` 设计支持不进入投影。源实例化、源验证、源记忆治理、另一宿主模板等 tombstone 不能进入候选或目标。

固定目标 `.harness/project.json.projectType`；Web 的宿主专用 Skills 只有 `$web-implement-list-view`，Extension 只包含 `$web-review-extension-compatibility`。两类宿主均分发功能组合知识与模板，资源存在不代表功能启用。错宿主 Skill、required 缺失/陈旧、所有权漂移、符号链接、特殊文件/权限或越界会阻断。候选必须由真实渲染流程提供；本 CLI 没有 render 子命令，本 Skill 不创建或修正候选。

## 冻结与命令

源工程、候选和目标必须是互不嵌套、无符号链接的真实绝对目录。源工程和目标分别等于自己的 Git 顶层；源工作区必须干净，且精确匹配已冻结的源提交。记录源验证结果与 `Version.md` 的 12 位版本；目标可存在未提交修改，计划绑定其真实状态。

复用目标内既有 helper。无报告文件的默认命令为：

```text
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts plan \
  --source-root <absolute-source> \
  --source-version <YYYYMMDDHHMM> \
  --source-commit <40-or-64-hex-head> \
  --candidate-root <absolute-rendered-projection> \
  --target-root <absolute-target> \
  --ownership <absolute-target>/.agents/skills/web-upgrade-harness/references/ownership-manifest.json \
  --lock <absolute-target>/.harness/upstream-lock.json
```

`--lock` 参数必传，文件可以不存在。计划冻结源版本/HEAD、源与目标的 Git 状态、候选散列、目标项目标记、所有权清单、lock 快照、三方文件散列与权限；必需源文件同时检查候选传播。Git 查询关闭 optional locks，避免状态查询刷新索引。事实变化后必须重新规划；候选、所有权、已批准路径及副作用范围未变时，可复用本次已有精确路径批准。意外漂移或批准范围变化才重新审查或补充授权，旧 plan 不能继续使用。

需要保存可审查证据时才追加 `--output <absolute-external-evidence>/plan-001.json`。输出必须位于源工程、候选、目标三棵树之外，父目录已存在且文件预先不存在；helper 以 `wx`、0600 独占创建，不覆盖旧文件。该选项是显式外部报告写入，不是完全零写入。每轮用全新路径，不创建父目录。

## 分类与交接

成功预演的 stdout 是单个稳定计划 JSON；有 `blocked` 时仍完整输出，退出 2；无阻断退出 0。参数、schema 或 I/O 失败只向 stderr 输出 `{ "ok": false, "error": "..." }` 并退出 2。

逐路径报告 baseline/current/candidate、ownership、classification 与 reason；顶层报告 `blocked`、`manualRequired` 和结构性 `problems`。

- `update`：现有 managed/managed-self 目标仍匹配 baseline，只表示可提交后续路径级审查。
- `unchanged`、`converged`、`preserve_local`：分别按 helper 的三方事实报告，不丢弃本地偏离。
- `manual_merge`、`manual_add`、`add`、`delete`、`collision`、`conflict`、`bootstrap_conflict`、`blocked`：不得自动写入；没有 lock 时不猜共同祖先，即使字节相同也按实际 bootstrap 分类处理。

只比较或审计到此停止。真正升级交给 `$web-upgrade-harness`：它负责旧所有权清单迁移的单独授权、精确路径批准、普通 managed 与 managed-self 的顺序、每次写后重规划、目标验证和最终 lock 记录。预演不把固定 CLI approval 词解释为用户授权，不自动应用或记录。
