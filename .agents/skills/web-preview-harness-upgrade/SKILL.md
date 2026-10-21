---
name: web-preview-harness-upgrade
description: 在已初始化 React Web 或 Plasmo Extension 下游中，只读比较已验证 source Harness、当前宿主候选投影和目标基线，冻结所有权与 Git 状态并输出逐路径升级计划。不修改目标工程，可选创建外部计划报告；不应用、记录基线或迁移所有权授权。
---

# Web Harness：预演工程基线升级

支持旧独立前端及已登记 Workspace 的只读比较。Workspace 从唯一 Git 根执行，读取 [Workspace 升级合同](../web-upgrade-harness/references/workspace-upgrade.md)，绑定根和全部前端身份，禁止选择成员绕过根所有权。

## 适用与边界

1. 仅用于已初始化且 `projectType=web|extension` 的终端下游。用户要求比较工程层、查看升级影响或原升级流程需要重新规划时使用；源 Harness 维护和实际产品改动不在本 Skill 中实施。
2. 读取目标 AGENTS、Agent Policy、工程规则、项目标记、可选 upstream lock 与 Git 状态，只扩展到本次冲突相关的记忆。完整读取 [预演执行契约](references/preview-contract.md) 及其引用的目标本地所有权规范。
3. 不修改目标工程，可选创建外部计划报告；默认只输出 stdout JSON。不调用 `apply`、`record` 或带批准的 `migrate-ownership`，不修改清单、lock、策略、配置或 Git 状态，不自动创建候选或复制 source 树。

## 冻结与规划

1. source 根必须由用户明确提供；source、候选、目标是三个互不嵌套、拒绝符号链接的真实绝对根。source 必须 clean 且 HEAD 确定，在 source 验证 `pnpm validate:harness` 并冻结 `Version.md` 的版本和精确 OID。相同来源未变化时复用已有验证证据。
2. 固定目标 `projectType`。目标允许已有本地修改，按真实 Git 状态冻结并保留；不要求 clean、不自动 stash。既有候选必须按目标身份和宿主渲染后，仅保留目标清单允许的工程路径。
3. 使用目标仓库内原升级器的 `scripts/harness-upgrade.ts plan` 与 `references/ownership-manifest.json`。CLI 没有 render 子命令；缺少真实渲染候选时报告前置条件，不虚构命令、用 source 全树代替投影或借 source 清单授权目标。
4. 按执行契约核对三方逐路径快照、权限、所有权、分类、`blocked`、`manualRequired` 和 `problems`。阻断计划仍输出完整 JSON，退出 2 不等于没有计划；参数/schema/I/O 错误则是 stderr 错误 JSON。
5. 缺少 lock 时作为 bootstrap 审计，不猜共同祖先；按 helper 的真实分类报告冲突。旧目标缺少必需规则或 helper 时交回 `$web-upgrade-harness`，由其展示策略迁移与逐路径批准，不在预演中写入。

## 完成输出

报告 source/目标身份与提交、候选来源、baseline、三方分类、冲突、需人工处理路径、保留修改、验证影响及可选外部报告位置。默认到此停止；只读计划成功不等于升级完成，也不构成应用、迁移或记录基线授权。实际升级由 `$web-upgrade-harness` 接收精确计划并负责后续授权、实施与验证。
