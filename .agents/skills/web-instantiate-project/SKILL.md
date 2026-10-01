---
name: web-instantiate-project
description: 通过源 Web Harness 唯一公开入口向源外空目录创建全新的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端下游，安全重置模板身份并建立独立 Git 根。用于创建单一类型前端项目；不得用于原地初始化或修改已初始化项目。
---

# Web Harness：实例化前端项目

创建继承长期工程规则但不继承模板身份、项目记忆、验证结论或 Git 历史的终端项目。

## 收集输入

1. 按 [`references/initialization-form.md`](references/initialization-form.md) 维护字段状态。首轮用一份编号表单批量收集全部尚未明确的基础字段：唯一项目类型、展示名称、跨平台安全的 ASCII kebab-case 项目标识、源 Harness 之外的完整绝对目标目录和中文策略模式“预设/自定义”；只重问缺失或非法项。非交互命令必须把绝对目标作为位置参数；交互式终端未给位置参数时，把目标与其他缺失字段并入同一首轮。Web 说明可省略并默认使用显示名称；Extension 必须收集非空简短说明，已提供则复用，类型在首轮才明确时进入条件补问；开发 API 地址可选，可后续配置，测试/正式地址不在首轮询问，未配置地址留空。主动提供的地址仍须校验，正式地址只接受 HTTPS，正式发布前必须补齐。`confirmed_by` 自动记录“当前用户”，已明确提供来源时复用，不询问确认来源；不得为未知 endpoint 猜测值。
2. 要求用户明确选择且只能选择一种项目类型：`web` 或 `extension`。不得默认、推断、同时选择或保留稍后转换类型的入口。
3. 若项目 Agent Policy 尚无有效决定，让用户选择仓库提供的推荐策略或逐项自定义。推荐模式一次展开；自定义模式此后每轮只询问一个仍缺失的策略字段，用户在一次回答中主动提供的多个合法值全部复用。按用户选择记录“当前用户”和最终收齐日期，不把模板值当作用户决定。

## Logo 与身份本地化

1. 调用 `$web-prepare-brand-identity` 的首次实例化分支：只使用已收集的名称、id、说明、品牌色和用户提供源图。已有图像先查看；没有源图时优先使用可用图像生成能力生成项目 Logo 候选并展示，复用用户选择或当前明确生成授权。源 Harness 只处理固定品牌输入，不收集或推导产品业务。
2. 候选放在源/目标之外的临时目录，作为 `--logo <absolute-path>` 导入；不向源、目标或 staging 提前写入。没有图像生成能力时明确使用离线确定性生成器，不能把通用几何图形称为已完成定制设计。创建成功后查看规范母版并展示其路径，以及 Web Logo/Favicon 或 Extension icon；不以文件存在替代视觉检查。
3. 名称和说明使用根字段作为默认语言，可通过 `--identity-i18n` JSON 提供 `defaultLocale` 和另一语言的完整 `translations`。当前与既有 UI 对齐支持 `en` 和 `zh_CN`；不猜测翻译。精确配置见 `docs/TS_WEB_TEMPLATE.md` §3.4。

## 安全复制

1. 目标目录的原始输入本身必须是绝对路径；不得先用当前目录把相对输入静默转绝对。将源 Harness 根和目标目录继续解析为规范绝对路径，在最终汇总中同时展示原始值、规范值与输入来源。目标目录名必须等于项目标识；拒绝源根及其任意子路径、符号链接歧义和任何路径越界。
2. 写入前清点目标。目标必须不存在或完全为空，包括隐藏条目；发现任何用户文件都停止，不覆盖、合并或清理。
3. 正式创建在目标父目录建立同目标唯一的 sibling 租约，并绑定父目录、staging、holding 与预存空目标的设备、inode 和模式；任何身份漂移都停止发布。父目录漂移时不得沿替代路径递归清理，而要报告无法安全回收的原 staging/租约。
4. 本次首次初始化调用 `$web-check-development-environment` 一次，只检查 Node.js/pnpm；同时运行 `git --version` 和源模板根的 `pnpm validate:harness`。源 Harness 没有 `.harness/project.json`，不得在这里误用只面向已初始化下游的 `pnpm harness validate`。Chrome/Firefox 不属于初始化门禁；Git 缺失、模板验证失败或模板状态无法可信识别时停止。
5. 在复制前固定受维护种子文件清单，再按清单复制到目标同级 sibling staging。排除源 `.git`、`node_modules`、`dist`、`build`、`.plasmo`、缓存、覆盖率、发布产物、临时证据、下游项目、Harness 专用 `Version.md`、`docs/VERIFICATION.md`、`docs/verification/**` 及全部日期项目记忆；下游版本事实来自根 `package.json`。
6. 保留长期规范、许可证、`instantiate` 内部生成所需 tooling、适用 Skills 和锁文件。重置模板名称、示例标识、本机绝对路径、已完成声明和 Harness 历史；法律文本只允许按许可证规则替换精确项目名称。
7. 不预建 Product Spec、Work Plan、ADR、Status、Verification 或 Changelog。项目记忆只在负责它的后续事件触发时创建。

## 建立独立仓库

1. 调用 `pnpm instantiate` 前保持目标完全为空，不要先在目标运行 `git init`；否则 `.git` 会触发非空目标保护。初始化器只在 staging 中完成生成、安装、结构验证和一次性裁剪后建立 `main` 独立 Git 根；紧邻唯一提交按 `$web-configure-git-commits` 契约执行 `identity-report`、必要时 `identity-bootstrap`、`identity-check`、模板 `install` 与 `check`，随后创建恰好一个 `chore: initialize project` 中性基线提交，全部成功后才允许原子发布。
2. 命令成功后验证 `git rev-parse --show-toplevel` 的规范路径等于目标根、当前分支为 `main`、`git remote` 为空、`HEAD` 存在且仓库恰好只有一个 root commit，提交主题为 `chore: initialize project`，工作区与暂存区为空。测试可通过直接调用内部 TypeScript 接口注入跳过 Git 或安装；公开 `pnpm instantiate` 不接受 `--skip-git` 或 `--skip-install`。
3. 不复制源历史，不创建远端、标签、托管仓库，不推送，也不修改全局 Git 配置。

## 执行唯一创建入口

1. 从源 Harness 根调用唯一公开的 `pnpm instantiate` 入口，并传入已确认的源外绝对目标、身份、策略模式与唯一类型；BaseURL 仅在用户主动提供时传入。初始化不创建 Release 候选，因此不询问或接受 E2E 选择。不要在目标根预先运行 frozen install，也不要直接调用底层 initializer；`instantiate` 会在目标同级 sibling staging 内部重写 manifest，再用一次 `pnpm install --no-frozen-lockfile --prefer-offline` 建立首份与目标清单一致的 lockfile：

   ```text
   pnpm instantiate -- <absolute-target-outside-harness> --type <web|extension> \
     --name "<display-name>" --id <project-id> --policy-mode <预设|自定义>
   ```

   自定义策略模式还必须显式传入 `--user-owned-tasks enabled|disabled`、`--superpowers enabled|disabled`、`--parallel-worktree-subagents enabled|disabled`、`--acceptance-smoke enabled|disabled` 与 `--e2e-hint enabled|disabled`；推荐模式不得混入逐项覆盖。

   交互模式先批量解析基础字段，再每轮只补一个自定义策略字段；全部字段有效后展示唯一包含 Logo 来源、母版/派生资产与本地化字段的完整汇总并仅询问一次“按此创建？”。该确认前不得创建目标、staging、安装依赖、初始化 Git 或修改任何源文件。非交互模式通过完整必需参数表达本次已确认输入，确认来源自动记录为“当前用户”；Web 说明、三地址、品牌和已明确来源的覆盖参数可省略；Extension 必须传 `--description`。本地化参数可省略，此时按默认身份回退。

2. 底层 initializer 只作为上述 sibling staging 事务的内部步骤，生成正式 Logo、同步当前类型品牌、生成三份环境、类型化 `APP_CONFIG`、统一 logger、分页 session 状态与无 endpoint 的 Ky HTTP 请求基础；源 Harness 的 `pnpm harness init` 明确拒绝，`pnpm harness:init` 不存在。不得在成功后无理由重复运行品牌刷新。默认在项目内检查 `design-taste-frontend`，有效已有版本原样保留，缺失时由 initializer 使用固定快照自动补装至 `.agents/skills/design-taste-frontend/`，不追加用户选择、不依赖全局版本、不执行远程安装器；快照及事务边界见 `docs/TS_WEB_TEMPLATE.md` §3.9，设计适用规则见 `docs/MANTINE_UI_GUIDELINES.md` §1.1。
3. 初始化验证和一次性裁剪全部通过后，确认源专用 `$web-instantiate-project`、`instantiate` script 和内部 init/instantiate tooling 已从下游删除，且不存在可派生另一个项目的活动入口。
4. 复核 `.harness/project.json`、三份环境、单 package 结构、类型互斥、身份残留、排除项、许可证、安装完成、独立 Git 根及初始化期不存在 `dist/`、`build/` 或 zip。初始化器已经在 staging 内直接执行结构、环境文件与终端化校验，不在外层重复运行格式、lint、类型、全量测试或构建。只有用户另外要求 Release 候选时，才在成功下游中解析或复用本次发布的 E2E 选择并显式运行唯一 `pnpm build`；Extension 打包同理。
5. 本次初始化授权只覆盖在完整脚手架验证和一次性裁剪后创建上述唯一 local 基线提交，以及其紧邻的 repo-local 身份/模板配置；不需要另行询问提交授权，也不授权第二个提交、远端、推送、标签、托管仓库或发布。

## 不变量

- 下游仓库必须是纯 `web` 或纯 `extension`，不能是两者组合、可增减目标的工作区或 monorepo。
- 源 Harness 的 `pnpm instantiate -- <absolute-target-outside-harness> ...` 是唯一公开创建入口；模板副本、源根和源内目录不得原地初始化。
- 目标目录与独立 Git 顶层目录必须相同。
- 保留用户文件优先于完成实例化；任何冲突都必须停止。
- 不迁移模板的批准结论、日期记忆、验证证据、版本发布记录或人工签署。
- 下游是终端项目，不保留本 Skill、创建 script、内部 initializer 或类型切换能力。

## 完成输出

报告模板根、目标根、唯一项目类型、三环境/BaseURL（只报告安全摘要，不泄露不必要信息）、初始化耗时、复制与排除摘要、身份和历史重置、一次依赖安装、Agent Policy 决定、Git 顶层/分支、有效身份及其来源、受管提交模板检查、唯一基线 commit、无远端与 clean 状态、Logo 来源、母版与派生路径及视觉检查、身份本地化及回退、初始化期未生成 Release 产物、验证结果及下一步；不得复述源根已拒绝的产品需求。
