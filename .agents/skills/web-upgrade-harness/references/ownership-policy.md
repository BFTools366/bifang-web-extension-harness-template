# Web Harness 升级所有权策略

- `managed`：Harness 独占的工程文件。只有目标仍匹配 lock 基线时可路径级自动更新。
- `managed-self`：升级器自身；规则同 `managed`，但必须在其他 managed 更新全部完成且新增 managed Skill 已手工收敛后按路径稳定顺序更新，`scripts/harness-upgrade.ts` 始终最后。
- `merge-sections`：同时包含 Harness 约束和产品决定，包括 `AGENTS.md`、`README.md`、`docs/API.md`（基础契约及下游实际适配决定）、`docs/DATA_ACCESS.md`、`docs/ENGINEERING_RULES.md`、`docs/MANTINE_UI_GUIDELINES.md`、`docs/RELEASE.md`、`docs/RUNTIME_CONFIGURATION.md` 与工程配置。只输出 `manual_merge`，不自动整文件覆盖。
- `conditional`：需要目标真实配置或宿主事实。只人工处理，不自动添加或覆盖；`.agents/skills/web-implement-list-view/**`、`.agents/skills/web-implement-saas-auth/**`、`.agents/skills/web-implement-saas-commerce/**` 与 `.agents/skills/web-implement-saas-admin/**` 仅适用于 `projectType=web`，Extension 不得补入；分发购买 Skill 不启用其业务能力。`.agents/skills/web-review-extension-compatibility/**` 仅适用于 Extension，Web 不得补入。预演同时拒绝候选和目标中的错宿主目录、文件或特殊节点，残留须经批准处理后重新规划。
- `protected`：身份、品牌、产品源码/测试、项目记忆、策略、许可证、环境值、`docs/prototypes/**` 的业务原型与登记记录、`docs/api/**` 的产品模块接口文档，以及项目级 `.agents/skills/design-taste-frontend/**`。设计支持由目标项目维护，创建期默认补装不授权升级覆盖；候选包含这些路径即失败关闭。
- `tombstone`：终端下游永久不得恢复的一次性创建、源验证和 Harness 方法论入口。候选包含即失败关闭。

`.harness/upstream-lock.json` 为每个受管或混合路径分别保存上一轮候选快照和下游目标快照；不得用单一摘要混淆 上游变化与产品本地偏离。`preserve_local` 继续保留上一轮双基线，直到 上游变化需要显式合并。

清单是不可弱化的最低保护策略，不是复制整个源树的许可；它必须精确位于当前目标仓库的本 Skill 内，另一个仓库的清单不得参与授权，`defaultMode` 必须精确为 `protected`。关键 managed 路径必须从源工程精确传播到候选；未知候选路径、符号链接、特殊文件、特殊权限位、路径越界、源/候选/目标/计划漂移都阻断 apply/record。自动读写必须从已绑定根目录逐级拒绝符号链接并绑定真实目录身份，在替换前复验目标快照，并对新文件和父目录执行 fsync。
