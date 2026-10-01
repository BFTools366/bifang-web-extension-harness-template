---
name: web-upgrade-harness
description: 在已实例化的单一类型纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游中，以只读预演和文件所有权分类安全同步较新 Web Harness 工程层，同时保留产品代码、projectType、品牌、项目记忆、策略和本地修改。用于用户要求比较、升级、迁移或刷新前端 Harness；默认不写入。
---

# Web Harness：升级前端工程基线

通过“冻结事实 → 渲染候选 → 三方计划 → 路径级批准 → 重规划 → 目标验证 → 记录基线”升级终端前端项目。生产所有权清单和 TypeScript helper 必须精确位于目标仓库内本 Skill 的 `references/ownership-manifest.json` 与 `scripts/harness-upgrade.ts`；另一个仓库的 helper 或清单不得替目标授权，不得用临时脚本或弱化清单代替。

## 冻结边界

1. 读取目标 `.harness/project.json`、可选 `.harness/upstream-lock.json`、AGENTS、Agent Policy、工程规则、相关 ADR/技术债和 Git 状态。只读取与升级冲突或验证相关的项目记忆。
2. 用户必须明确提供 source Harness 根。source、渲染候选和目标必须是三个互不嵌套、拒绝符号链接的真实绝对目录；source 和目标的 Git 顶层分别等于声明根，source 工作树必须 clean 且有确定 HEAD。
3. 在 source 根运行 `pnpm validate:harness`，从 `Version.md` 读取 12 位版本并记录 source HEAD。验证失败时不信任候选。
4. 固定目标 `.harness/project.json.projectType`。候选只渲染该单一宿主的工程层，不增加另一类型、workspace、初始化入口或类型切换能力。
5. 渲染候选必须保留目标名称、标识、说明、三环境公开配置结构及已决策略，但传给 plan 的候选投影只包含生产清单允许的 `managed`、`managed-self`、`merge-sections` 与 `conditional` 路径。`.agents/skills/web-implement-list-view/**` 只在目标 `projectType=web` 时进入候选；Extension 不增加该 Skill，它的缺席也不构成 required 缺失。产品源码、品牌、项目身份、记忆、策略值、许可证和 tombstone 不进入候选投影。项目级 `.agents/skills/design-taste-frontend/**` 是 `protected` 设计支持，也不进入候选投影，保留目标已有版本；创建时默认补装不授权升级时覆盖或更新它。

## 所有权

- `managed`：Harness 独占文件；只有目标仍匹配已记录基线时才允许 helper 原子更新一个现有文件。
- `managed-self`：升级器自身；规则同 `managed`，但必须在普通 managed 后按路径稳定顺序更新，CLI runner 始终最后。
- `merge-sections`：AGENTS、README、DATA_ACCESS、ENGINEERING_RULES、MANTINE_UI_GUIDELINES、RELEASE、RUNTIME_CONFIGURATION、package 等混合文件；只人工合并已复核章节或键。
- `conditional`：三环境或宿主专用能力等依赖目标真实值的文件；只人工处理，不复制源值，Web-only 列表 Skill 只能在 `projectType=web` 目标中收敛。
- `protected`：产品源码/测试、`.harness/project.json`、品牌、项目记忆、Agent Policy、许可证和未登记本地文件；候选包含即阻断。
- `tombstone`：终端下游不得恢复的一次性实例化、源验证、源记忆治理、另一宿主模板和 Harness 方法论入口；候选或目标包含即阻断。

未知候选路径按显式 `defaultMode: protected` 失败关闭；所有权漂移、符号链接、特殊文件/权限、required 缺失或路径越界同样阻断。所有权是最低保护策略，不是复制 source 树的许可。

## 只读计划

每轮默认使用一个位于候选和目标之外、父目录已存在的全新证据文件；省略 `--output` 时只向 stdout 输出单个稳定 JSON，且不写入文件：

```bash
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts plan \
  --source-root <absolute-source> \
  --source-version <YYYYMMDDHHMM> \
  --source-commit <40-or-64-hex-head> \
  --candidate-root <absolute-rendered-projection> \
  --target-root <absolute-target> \
  --ownership <absolute-target>/.agents/skills/web-upgrade-harness/references/ownership-manifest.json \
  --lock <absolute-target>/.harness/upstream-lock.json \
  --output <absolute-external-evidence>/plan-001.json
```

显式提供 `--output` 时，该路径必须预先不存在并位于候选、目标两棵树之外；helper 只独占创建，不覆盖既有文件。无论是否提供输出文件，stdout 都只包含同一个可机器解析的稳定 JSON，不混入日志。计划顶层同时汇总 `blocked`、`manualRequired` 与结构性 `problems`；阻断计划仍完整输出 JSON，但进程返回 2。参数、schema 或 I/O 失败只向 stderr 输出 `{ "ok": false, "error": "..." }` 稳定 JSON 并返回 2。

1. 输出逐路径三方快照、普通权限模式、所有权、原因和稳定分类。`update` 仅表示现有 managed 目标仍匹配 baseline；`manual_merge`、`add`、`delete`、`conflict`、`bootstrap_conflict` 与 `blocked` 都不会自动写入。
2. 没有 lock 时是 bootstrap 审计：相同路径为 `converged`，不同 managed 路径为 `bootstrap_conflict`，混合路径为 `manual_merge`。不得猜共同祖先。
3. 默认到此停止，展示分类、目标 diff 与验证影响，并取得用户对精确路径的批准。调用本 Skill 或 CLI 固定 approval 词都不替代用户授权。

## 路径级应用

仅对用户已批准、分类为 `update` 的单个现有 `managed`/`managed-self` 文件运行：

```bash
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts apply \
  --plan <absolute-external-evidence>/plan-001.json \
  --path <one-repo-relative-path> \
  --approval apply-managed-changes
```

helper 会重新绑定 source、候选、目标、Git 状态、目标仓库内的清单和 lock；任何漂移或任一 `blocked` 项都会在写入前停止。它从已绑定的候选或目标根开始，逐级拒绝符号链接并绑定真实目录身份，只在最终稳定目录中原子替换这个已存在普通文件；替换前复验目标，并 fsync 新文件与父目录。不新增、不删除、不合并 mixed，也不提交。

每次写入后必须创建新的 plan 文件。`managed-self` 只有普通 managed 更新全部完成后才应用，新增的 `managed-self add` helper 必须先经逐路径批准手工补齐并重规划，否则自更新被阻断，保证下一轮目标 CLI 可启动；不能提前删除仍被旧入口引用的 helper。多个自更新按路径稳定顺序逐个执行，`scripts/harness-upgrade.ts` 最后。经用户逐路径批准的 `add`、`delete`、`manual_merge` 和 bootstrap 收敛使用 `apply_patch` 手工完成；保留产品值与本地决定，随后重规划。不得整文件覆盖 mixed/protected 内容。

## 验证与记录

1. 代码行为变化只运行本次升级实际影响的相关非空测试；纯文档或元数据升级只运行必要的最小替代检查。不得因 Harness 升级自动追加格式、lint、类型、全仓检查、独立构建、冒烟或 E2E；行为保持重构运行全量测试，只有发布、用户明确完整验收、当次 E2E 启用或浏览器硬要求触发完整候选验收。
2. 需要最终候选时，构建前解析或复用本次发布的 E2E 选择，只使用当前 Web Harness 的 `pnpm build -- --e2e=enabled|disabled`；Extension `package` 同样沿用当前 Release profile。不得导入桌面客户端或桌面发布链。
3. 再次创建全新 plan，要求只剩 `unchanged`、`converged`、`preserve_local` 或已逐项复核的 `manual_merge`。记录已有基线：

```bash
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts record \
  --plan <absolute-external-evidence>/plan-final.json \
  --source-version <YYYYMMDDHHMM> \
  --source-commit <40-or-64-hex-head> \
  --approval record-verified-baseline \
  --resolved-manual <one-reviewed-manual-path>
```

4. 首份人工核验基线改用 `--bootstrap --approval bootstrap-verified-baseline`。`--resolved-manual` 必须重复列出 plan 中全部且仅有的 `manual_merge`；没有则省略。
5. `.harness/upstream-lock.json` 只在事实未漂移且计划完全收敛时原子记录；生成锁内容后、真正写入前还必须再次复验完整 plan。`preserve_local` 保留旧 upstream baseline，使后续升级仍能区分本地偏离与上游变化。
6. 升级器自身变化后，用新规则再审计一次。项目记忆只按当前升级的独立触发事件更新，不导入 source 记忆。

## 安全边界

- 不自动暂存、提交、建分支/Worktree、推送、建标签、发布或删除分支。
- 不覆盖秘密、产品源码、品牌、projectType、许可证、Agent Policy、项目记忆或未登记本地修改。
- 不恢复一次性创建、多宿主、组合项目、另一类型或 monorepo 能力。
- `.env` 与四种 `.env*.local` 不读取；其存在或未知公开键触发目标既有门禁，由用户明确迁移/移除或修正。
- 身份渲染、所有权、基线或批准范围不确定时停止并向用户报告。

## 完成输出

报告 source/目标身份与提交、baseline 状态、每轮计划证据、批准和实际应用路径、人工合并、保留修改、冲突、测试/构建、适用的完整候选验收结论、lock 更新、未验证范围和剩余风险。只读计划成功不等于升级完成。
