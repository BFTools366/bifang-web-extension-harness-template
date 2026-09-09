# Web Harness 升级所有权策略

- `managed`：Harness 独占的工程文件。只有目标仍匹配 lock 基线时可路径级自动更新。
- `managed-self`：升级器自身；规则同 `managed`，但必须在其他 managed 更新全部完成后按路径稳定顺序更新，`scripts/harness-upgrade.ts` 始终最后。
- `merge-sections`：同时包含 Harness 约束和产品决定，包括 `AGENTS.md`、`README.md`、`docs/ENGINEERING_RULES.md`、`docs/RELEASE.md` 与工程配置。只输出 `manual_merge`，不自动整文件覆盖。
- `conditional`：需要目标真实配置或宿主事实。只人工处理，不自动添加或覆盖。
- `protected`：身份、品牌、产品源码/测试、项目记忆、策略、许可证和环境值。候选包含这些路径即失败关闭。
- `tombstone`：终端下游永久不得恢复的一次性创建、源验证和 Harness 方法论入口。候选包含即失败关闭。

`.harness/upstream-lock.json` 为每个受管或混合路径分别保存上一轮候选快照和下游目标快照；不得用单一摘要混淆 upstream 变化与产品本地偏离。`preserve_local` 继续保留上一轮双基线，直到 upstream 变化需要显式合并。

清单是不可弱化的最低保护策略，不是复制整个源树的许可；它必须精确位于当前目标仓库的本 Skill 内，另一个仓库的清单不得参与授权，`defaultMode` 必须精确为 `protected`。关键 managed 路径必须从 source 精确传播到候选；未知候选路径、符号链接、特殊文件、特殊权限位、路径越界、源/候选/目标/计划漂移都阻断 apply/record。自动读写必须从已绑定根目录逐级拒绝符号链接并绑定真实目录身份，在替换前复验目标快照，并对新文件和父目录执行 fsync。
