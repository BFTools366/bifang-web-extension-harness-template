---
name: web-upgrade-harness
description: 在已实例化的 Workspace 或旧独立 React Web、Plasmo Chrome MV3 / Firefox MV2 Extension 下游中，以只读预演和文件所有权分类安全同步较新 Web Harness 工程层，同时保留产品代码、projectType、品牌、项目记忆、策略和本地修改。用于用户要求比较、升级、迁移或刷新前端 Harness；默认不写入。
---

# Web Harness：升级前端工程基线

支持旧独立前端及已登记 Workspace 的原地工程升级。Workspace 必须从唯一 Git 根执行，统一根所有权与基线，按原成员路径投影前端工程层；Go 服务、产品、身份、配置、品牌和数据保持保护。先读取 [Workspace 升级合同](references/workspace-upgrade.md)，不增加成员或迁移目录。

通过“冻结事实 → 渲染候选 → 三方计划 → 路径级批准 → 重规划 → 目标验证 → 记录基线”升级终端前端项目。生产所有权清单和 TypeScript helper 必须精确位于目标仓库内本 Skill 的 `references/ownership-manifest.json` 与 `scripts/harness-upgrade.ts`；另一个仓库的 helper 或清单不得替目标授权，不得用临时脚本或弱化清单代替。

## 预演委托与写入边界

只比较或审计时，目标已有预演 Skill 则调用 `$web-preview-harness-upgrade` 并到计划交接停止；旧目标缺失叶子时，沿用既有 `plan` 命令取得只读过渡证据并停止，不为比较先补写文件。仅真实升级才按下节完成只读核对和获批补齐后开始委托，不能调用尚不存在的 Skill。真实升级在任何写入前、每次写入后和恢复时，均先按其 [预演执行契约](../web-preview-harness-upgrade/references/preview-contract.md) 冻结 source、当前宿主候选、目标、所有权与基线；本 Skill 保留策略迁移、精确路径批准、应用、验证和记录责任。未变化的事实可复用，漂移必须重规划。候选缺失时，本流程按目标身份和当前宿主准备真实渲染候选并按所有权清单裁剪投影，再交给预演；不得虚构 CLI 渲染命令或复制 source 全树。

### 旧下游的工作流迁移

旧目标的本地清单可能尚未登记新增规则。渲染候选前，用 source 的 helper 只读计算增量并展示给用户：

```bash
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts migrate-ownership \
  --target-ownership <target>/.agents/skills/web-upgrade-harness/references/ownership-manifest.json
```

输出的 `missing` 是普通可追加规则；`workspaceMissing` 只列出合法旧 Workspace 尚缺的精确根 runtime 规则，缺字段或已登记的一项/两项受管前缀可以预演并在获批后追加；未知、乱序、重复和冲突规则拒绝自动迁移。`conflicts`（模式不同）与 `shadowed`（被目标前置规则遮蔽）必须人工处理，工具不会覆盖。取得本次用户对该策略迁移的明确授权后追加 `--approval <授权摘要>`：命令只在目标 rules 末尾追加 `missing`，并在 workspaceRules 末尾追加 `workspaceMissing`，保留 `defaultMode: protected`、已有规则及顺序，合并结果通过完整下限校验后才原子写入；有冲突或遮蔽时拒绝写入。不借用 source 清单替目标授权，清单变化后重新冻结目标状态并渲染候选。

在委托新 Skill 或更新任何父 Skill 前，先逐文件补齐本次新拆出的共用叶子 `web-implement-auth-session`、`web-manage-user-tasks`、`web-review-api-contract`、`web-review-module-boundaries`、`web-implement-access-control`、`web-implement-write-recovery`、`web-implement-browser-storage` 与 `web-implement-event-stream` 各自的 `SKILL.md` 和 `agents/openai.yaml`；继续沿用既有计划、精确路径授权与 source 字节一致门禁。缺失或陈旧不得先更新委托它们的父 Skill。随后先逐文件核对并按既有计划和精确路径授权补齐两宿主通用 `web-connect-http-service` 与 `web-document-api` 的 SKILL/元数据及 `references/export-contract.md`、`references/protocol-formats.md`、`scripts/check-export.ts`、`web-audit-worktrees` 的 SKILL/元数据/`references/inspection-contract.md`、`web-preview-harness-upgrade` 的 SKILL/元数据/`references/preview-contract.md`；Extension 另核对并补齐 `web-review-extension-compatibility` 的 SKILL/元数据，Web 不补入它。文件均位于 `.agents/skills/` 下对应目录，候选须与已验证 source 字节一致；目标已有本地内容按冲突复核，不覆盖。旧 helper 不具备这些必需传播门禁时由执行 Agent 手工核对；缺失或陈旧先停止父级委托与自更新，完成获批补齐后重规划。新版 helper 还会阻止普通 managed Skill 的新增未收敛时提前自更新。

两种宿主的候选必须逐文件包含与 source 字节一致的需求定义、功能组合与原型工作流：`web-define-product` 的 SKILL/元数据、`references/requirements-analysis.md` 和 `references/prd-outline.md`；`web-compose-capabilities` 的 SKILL/元数据及 `references/requirements-selection.md`；`web-design-prototype` 的 SKILL/元数据及 `scripts/prototype-review.ts`。文件均位于 `.agents/skills/` 下各自拥有者目录。旧原型目录的 `references/prd-outline.md` 保持 managed 所有权，作为已移除受管路径按既有三方计划处理；有基线时核对 delete 分类，无基线或本地修改时人工复核并取得精确删除授权，不保留重复需求合同，也不为单一路径迁移弱化目录保护。旧 helper 没有必需路径门禁时，由执行 Agent 在普通 managed 更新前逐文件核对；缺失或陈旧先停止，按既有精确路径授权补齐或处理冲突后重规划。业务 PRD、原型和登记记录不得进入候选或被覆盖。普通 managed 及所需资源先收敛，升级器自身在后；不提前替换旧 CLI 或弱化保护规则。新 helper 对上述 source 文件执行精确传播校验，遗漏或陈旧阻断 apply/record。

## 计划审查与批准

所有权模式与投影边界以 [所有权规范](references/ownership-policy.md) 和目标本地生产清单为准，预演由 `$web-preview-harness-upgrade` 执行。使用计划的真实分类与完整证据，不把非零退出码等同于没有计划。没有 lock 时按实际 bootstrap 分类审查，不猜共同祖先。

默认到预演停止；实际应用前展示逐路径分类、目标 diff 和验证影响，取得用户对精确路径的批准。调用 Skill 或 CLI 固定 approval 词不替代用户授权。需要应用/记录时，先由预演保存全新的外部 plan 文件；stdout-only 结果不能当作现有 `--plan` 路径。

## 路径级应用

仅对用户已批准、分类为 `update` 的单个现有 `managed`/`managed-self` 文件运行：

```bash
pnpm exec tsx .agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts apply \
  --plan <absolute-external-evidence>/plan-001.json \
  --path <one-repo-relative-path> \
  --approval apply-managed-changes
```

helper 会重新绑定 source、候选、目标、Git 状态、目标仓库内的清单和 lock；任何漂移或任一 `blocked` 项都会在写入前停止。它从已绑定的候选或目标根开始，逐级拒绝符号链接并绑定真实目录身份，只在最终稳定目录中原子替换这个已存在普通文件；替换前复验目标，并 fsync 新文件与父目录。不新增、不删除、不合并 mixed，也不提交。

每次写入后必须委托 `$web-preview-harness-upgrade` 创建新的 plan 文件。`managed-self` 只有普通 managed 更新全部完成后才应用，新增的 `managed-self add` helper 必须先经逐路径批准手工补齐并重规划，否则自更新被阻断，保证下一轮目标 CLI 可启动；不能提前删除仍被旧入口引用的 helper。多个自更新按路径稳定顺序逐个执行，`scripts/harness-upgrade.ts` 最后。经用户逐路径批准的 `add`、`manual_add`、`delete`、`manual_merge`、`collision` 和 bootstrap 冲突收敛使用 `apply_patch` 手工完成；保留产品值与本地决定，随后重规划。不得整文件覆盖 mixed/protected 内容。

## 验证与记录

1. 代码行为变化只运行本次升级实际影响的相关非空测试；纯文档或元数据升级只运行必要的最小替代检查。不得因 Harness 升级自动追加格式、lint、类型、全仓检查、独立构建、冒烟或 E2E；行为保持重构运行全量测试，只有发布、用户明确完整验收、当次 E2E 启用或浏览器硬要求触发完整候选验收。
2. 需要最终候选时，构建前解析或复用本次发布的 E2E 选择，只使用当前 Web Harness 的 `pnpm build -- --e2e=enabled|disabled`；Extension `package` 同样沿用当前 Release profile。不得导入桌面客户端或桌面发布链。
3. 委托 `$web-preview-harness-upgrade` 再次创建全新 plan，要求只剩 `unchanged`、`converged`、`preserve_local` 或已逐项复核的 `manual_merge`。记录已有基线：

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
6. 升级器自身变化后，委托 `$web-preview-harness-upgrade` 用新规则再审计一次。项目记忆只按当前升级的独立触发事件更新，不导入 source 记忆。

## 安全边界

- 不自动暂存、提交、建分支/Worktree、推送、建标签、发布或删除分支。
- 不覆盖秘密、产品源码、品牌、projectType、许可证、Agent Policy、项目记忆或未登记本地修改。
- 不恢复一次性创建、多宿主、组合项目、另一类型或 monorepo 能力。
- `.env` 与四种 `.env*.local` 不读取；其存在或未知公开键触发目标既有门禁，由用户明确迁移/移除或修正。
- 身份渲染、所有权、基线或批准范围不确定时停止并向用户报告。

## 完成输出

报告 source/目标身份与提交、baseline 状态、每轮计划证据、批准和实际应用路径、人工合并、保留修改、冲突、测试/构建、适用的完整候选验收结论、lock 更新、未验证范围和剩余风险。只读计划成功不等于升级完成。
