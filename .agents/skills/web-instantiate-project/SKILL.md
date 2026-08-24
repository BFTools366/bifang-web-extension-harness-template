---
name: web-instantiate-project
description: 通过源 Web Harness 唯一公开入口向源外空目录创建全新的纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端下游，安全重置模板身份并建立独立 Git 根。用于创建单一类型前端项目；不得用于原地初始化或修改已初始化项目。
---

# Web Harness：实例化前端项目

创建继承长期工程规则但不继承模板身份、项目记忆、验证结论或 Git 历史的终端项目。

## 收集输入

1. 确认展示名称、跨平台安全的 ASCII kebab-case 项目标识、简短说明、development/test/release 三个 BaseURL、负责人和源 Harness 之外的完整绝对目标目录。Release URL 必须使用 HTTPS；不得为未知 endpoint 猜测值。
2. 要求用户明确选择且只能选择一种项目类型：`web` 或 `extension`。不得默认、推断、同时选择或保留稍后转换类型的入口。
3. 若项目 Agent Policy 尚无有效决定，让用户选择仓库提供的推荐策略或逐项自定义。只询问尚未给出的决定，记录真实确认人和日期，不把模板值当作用户决定。

## 安全复制

1. 将源 Harness 根和目标目录解析为规范绝对路径。目标目录名必须等于项目标识；拒绝源根及其任意子路径、符号链接歧义和任何路径越界。
2. 写入前清点目标。目标必须不存在或完全为空，包括隐藏条目；发现任何用户文件都停止，不覆盖、合并或清理。
3. 运行 `git --version` 和源模板根的 `pnpm validate:harness`。源 Harness 没有 `.harness/project.json`，不得在这里误用只面向已初始化下游的 `pnpm harness validate`。Git 缺失、模板验证失败或模板状态无法可信识别时停止。
4. 在复制前固定受维护种子文件清单，再按清单复制到目标同级 sibling staging。排除源 `.git`、`node_modules`、`dist`、`build`、`.plasmo`、缓存、覆盖率、发布产物、临时证据、下游项目、Harness 专用 `Version.md` 及全部日期项目记忆；下游版本事实来自根 `package.json`。
5. 保留长期规范、许可证、`instantiate` 内部生成所需 tooling、适用 Skills 和锁文件。重置模板名称、示例标识、本机绝对路径、已完成声明和 Harness 历史；法律文本只允许按许可证规则替换精确项目名称。
6. 不预建 Product Spec、Work Plan、ADR、Status、Verification 或 Changelog。项目记忆只在负责它的后续事件触发时创建。

## 建立独立仓库

1. 调用 `pnpm instantiate` 前保持目标完全为空，不要先在目标运行 `git init`；否则 `.git` 会触发非空目标保护。初始化器在生成、安装和门禁通过后默认运行 `git init -b main`。
2. 命令成功后验证 `git rev-parse --show-toplevel` 的规范路径等于目标根、当前分支为 `main`、`git remote` 为空且 `HEAD` 尚不存在。`--skip-git` 只用于受控测试，不是本 Skill 的终端交付路径。
3. 不复制源历史，不创建远端、标签、托管仓库，不推送，也不修改全局 Git 配置。

## 执行唯一创建入口

1. 从源 Harness 根调用唯一公开的 `pnpm instantiate` 入口，并传入已确认的源外绝对目标、身份、三个 BaseURL 与唯一类型；调用前询问用户是否为内部 Release 构建启用 E2E，非交互命令显式传入当次选择。不要在目标根预先运行 frozen install，也不要直接调用底层 initializer；`instantiate` 会在目标同级 sibling staging 内部重写 manifest，再用普通 `pnpm install --no-frozen-lockfile` 建立首份与目标清单一致的 lockfile：

   ```text
   pnpm instantiate -- <absolute-target-outside-harness> --type <web|extension> \
     --name "<display-name>" --id <project-id> --description "<description>" \
     --development-base-url <url> --test-base-url <url> \
     --release-base-url <https-url> --e2e <enabled|disabled>
   ```

2. 底层 initializer 只作为上述 sibling staging 事务的内部步骤，生成正式 Logo、同步当前类型品牌、生成三份环境、类型化 `APP_CONFIG`、统一 logger、分页 session 状态与无 endpoint 的原生 Fetch 请求基础；源 Harness 的 `pnpm harness init` 明确拒绝，`pnpm harness:init` 不存在。不得在成功后无理由重复运行品牌刷新。
3. 初始化验证和一次性裁剪全部通过后，确认源专用 `$web-instantiate-project`、`instantiate` script 和内部 init/instantiate tooling 已从下游删除，且不存在可派生另一个项目的活动入口。
4. 复核 `.harness/project.json`、三份环境、单 package 结构、类型互斥、身份残留、排除项、许可证、`pnpm env:validate`、`pnpm harness validate`、非空全量测试、`YYYYMMDDHHMM` 页面构建版本和真实 Release 构建；`build:release` 必须自动通过 `pnpm release:inspect`。当次选择启用 E2E 时，再对精确候选执行批准场景。
5. 默认只建立独立 Git 根，不创建 commit。只有用户另外明确授权提交时，才在完整脚手架验证后创建本地基线提交；初始化始终不授权远端、推送、标签或发布。

## 不变量

- 下游仓库必须是纯 `web` 或纯 `extension`，不能是两者组合、可增减目标的工作区或 monorepo。
- 源 Harness 的 `pnpm instantiate -- <absolute-target-outside-harness> ...` 是唯一公开创建入口；模板副本、源根和源内目录不得原地初始化。
- 目标目录与独立 Git 顶层目录必须相同。
- 保留用户文件优先于完成实例化；任何冲突都必须停止。
- 不迁移模板的批准结论、日期记忆、验证证据、版本发布记录或人工签署。
- 下游是终端项目，不保留本 Skill、创建 script、内部 initializer 或类型切换能力。

## 完成输出

报告模板根、目标根、唯一项目类型、三环境/BaseURL（只报告安全摘要，不泄露不必要信息）、复制与排除摘要、身份和历史重置、Agent Policy 决定、Git 边界、是否获得提交授权、实际提交（若有）、验证结果、未确定产品事实及下一项产品工作。
