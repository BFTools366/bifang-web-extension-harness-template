---
name: web-configure-git-commits
description: 仅在用户明确要求配置 Git，或下一步将实际创建提交时，为 Web Harness、React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 独立仓库即时检查并补齐仓库本地身份、安装并检查受管提交模板；不得因打开、检查或编辑仓库而提前配置，不修改全局配置，也不自动提交。
---

# Web Harness：配置 Git 提交

让每个提交表达一个完整、独立、可解释的变化，并为长期排查保留修改原因、行为影响和真实验证结果。使用确定性 TypeScript helper 管理仓库本地身份和提交模板。执行任何写入模式前，先读取 [提交约定](references/commit-convention.md)。

## 触发时机

- 只有用户明确要求配置 Git，或已授权流程的下一步将实际执行 `git commit`，才安装、检查或修复受管模板。
- 进入仓库、读取状态、诊断、编辑、运行测试、仅起草提交消息或“以后可能会提交”都不触发 Git 写入。
- 安装请求或本次提交授权只覆盖当前仓库的 local 配置与 Git 元数据，不授权全局配置、推送、标签或历史改写。

## 模式

- `identity-report`：只读报告 local/global/effective 身份与来源。
- `identity-check`：只读验证有效身份，不补写配置。
- `identity-bootstrap`：只为缺失的最终生效 `user.name`/`user.email` 补写 repo-local 值；确有缺失时才需要显式 `--fallback-username`，不会覆盖已有合法 Unicode 身份。
- `check`：只读验证 common-dir 中模板字节和五项 local 配置。
- `install`：安装模板与 local 配置；存在不同值时失败关闭，只有用户明确批准替换后才传 `--replace`。

```text
pnpm exec tsx .agents/skills/web-configure-git-commits/scripts/configure-git-commit.ts <mode> \
  --project-root <absolute-git-top-level> [--fallback-username <ascii-name>] [--replace]
```

## 边界

没有即将发生的实际提交，也没有用户明确配置请求时，不得运行写模式或改写 Git 配置。

1. 项目根必须是非符号链接 Git 顶层；linked Worktree 通过精确 Git common-dir 支持。
2. helper 只使用参数数组调用 Git，禁止 Shell 拼接；只写 repo-local 配置，不写 global/system。
3. fallback 名称只接受安全 ASCII；邮箱确定性写为 `<fallback>@gmail.com`。已有合法 effective 字段逐项保留，完整 global 身份不会触发 local 写入。
4. 模板安装到 `<git-common-dir>/harness/meaningful-commit-template.txt`；模板所有非空行必须以 `#` 开头，并同时把 `core.commentChar` 与优先级更高的 `core.commentString` 固定为 `#`，避免模板文本意外进入提交消息。
5. 冲突在首个写入前全部预检。任一写入失败时恢复模板、身份与 local 配置；失败不授权提交、推送或历史修改。
6. 实际提交前运行 `identity-check` 与 `check`，再根据真实 diff 写有意义的提交正文。不得把注释模板原样当消息，也不得伪造验证结果。
7. 简单且意图明确的维护变化可以只使用一行 Conventional Commit 主题。非简单变化必须填写 `Why`、`Changes`、`Impact`、`Test`；未运行时写 `Not run: <原因>`。`!` 或 `BREAKING CHANGE:` 只用于已批准的破坏性契约，不自行扩大授权。
8. CLI 无论成功或失败都只向 stdout 输出一个 JSON；成功包含 `ok`、`operation`、`status` 及适用的 `changed`、`replacedConflicts`、`settings`，失败包含稳定 `error.code` 与 `error.message`。

## 完成输出

报告 Git 顶层/common-dir、身份字段及来源、模板路径、五项受管 local 设置、是否变更或替换冲突、建议或实际提交消息，以及未执行的推送、标签和历史操作。安装成功不等于已经提交。
