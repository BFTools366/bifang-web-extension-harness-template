---
name: web-upgrade-harness
description: 在已实例化的单一类型纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端下游中，以只读预演和文件所有权分类安全同步较新 Web Harness 工程层，同时保留产品代码、projectType、品牌、项目记忆、策略和本地修改。用于用户要求比较、升级、迁移或刷新前端 Harness；默认不写入。
---

# Web Harness：升级前端工程基线

通过“发现事实 → 所有权分类 → 只读预演 → 用户批准 → 路径级应用 → 验证 → 基线记录”升级终端前端项目。不要依赖仓库中尚不存在的升级脚本；使用现有 Git、差异和校验能力完成同一审计闭环。

## 建立边界

1. 读取目标的 `.harness/project.json`、`.harness/upstream-lock.json`（若存在）、AGENTS、Agent Policy、工程规则、相关 ADR/技术债和 Git 状态。项目记忆只读取与当前升级冲突或验证相关的部分。
2. 要求用户明确提供源 Harness 根；将源与目标解析为不同的规范绝对路径。每个 Git 顶层必须等于声明根，拒绝符号链接根、嵌套歧义、路径越界和源目标相同。
3. 要求源工作树干净、有可识别提交，并先在源 Harness 根运行 `pnpm validate:harness`。源没有 `.harness/project.json`，不得误用下游的 `pnpm harness validate`。记录源版本/提交、目标提交/分支/脏状态；验证失败时不信任候选。
4. 固定目标 `.harness/project.json.projectType`。候选只能渲染该类型的单 package 工程层，绝不增加另一类型、workspace、目标管理或类型切换入口。

## 所有权模型

优先使用仓库已有且已记录的所有权清单；没有清单时按下列保守类别创建本次只读计划，未知项一律视为 `protected`：

- `managed`：明确由 Harness 独占、且本地内容/普通权限模式仍匹配已记录基线的长期 Skills、规范、配置 Schema、分页/HTTP 基线、logger 基线或维护工具。
- `mixed`：同时包含 Harness 约束与项目决定的文件，如 AGENTS、package scripts/config 片段及三份受管环境文件；字段名、前缀和 profile 结构可合并，实际 BaseURL 与批准的公开值必须保留。
- `protected`：产品源码和测试、`.harness/project.json`、`.harness/brand/**`、`public/`/`assets/` 品牌、项目记忆、许可证、Git 配置/历史、环境秘密及未登记本地文件。禁止的 `.env`/`.env*.local` 不得读取或覆盖；其存在会阻断新门禁，直到用户明确迁移或移除。
- `tombstone`：终端项目不应恢复的一次性实例化/初始化 Skill、目标增减入口、另一项目类型模板和任何可派生或切换类型的入口。

所有权是最低保护策略，不是复制每个源匹配文件的许可。

## 只读预演

1. 从源受维护文件生成任务局部候选，并把目标名称、标识、说明、`projectType`、策略和已批准例外渲染进去；不能直接把源目录当候选。
2. 逐路径比较候选、目标和存在时的上游基线，输出不写入的分类表：`add`、`update`、`unchanged`、`manual_merge`、`preserve_local`、`delete_proposed`、`conflict`、`blocked`。
3. 计划必须列出所有权、旧/新摘要、权限模式、理由、目标 diff、依赖和验证。符号链接、特殊文件、路径越界、所有权漂移、protected/tombstone 候选、未知共同祖先或本地修改冲突均为阻断。
4. `.harness/upstream-lock.json` 不存在时执行初始基线审计：把每个重叠 managed/mixed 文件当作冲突，不能猜共同祖先。只有人工收敛并验证后才能建立首份基线；信息不足则保持锁文件不存在。
5. 新基线要求 development/test/release 配置而目标缺失时，将缺失项标为 `blocked`，收集三个真实 BaseURL 后才生成 `.env.development`、`.env.test`、`.env.production`；Release 必须使用 HTTPS，Extension 不因此自动增加 host permission。发现 `.env`、四种 `.env*.local` 或未知公开键时保持阻断，要求用户明确迁移/移除或修正；本 Skill 不自行读取秘密或删除用户文件。
6. 默认到此停止，向用户展示只读预演并取得明确的路径级批准。调用本 Skill 本身不授权写入。

## 应用与验证

1. Harness 升级至少使用标准路径；若改变公开运行时行为、Extension 权限/安全边界、发布流程或用户要求完整验收，升级为里程碑路径。
2. 只对批准的 `managed` 路径使用 `apply_patch` 逐项应用。`mixed` 按已复核章节/键串行合并；`add`/`delete_proposed` 需要单独批准。绝不整文件覆盖 mixed/protected 内容。
3. 每次应用后重新生成并复核只读预演；源、目标、候选、计划或所有权发生漂移时在写入下一路径前停止。
4. 保留目标技术基线和唯一类型。不得导入源的项目身份、Logo、产品代码、日期记忆、批准结论、验证历史、版本发布记录或 Git 历史。
5. 运行目标的 `pnpm env:validate`、`pnpm harness validate`，以及受影响的格式、lint、类型、非空测试和 development/test/release 构建。涉及 logger 或 Release 行为时确认 `build:release`（以及 Extension `package`）自动通过 `pnpm release:inspect`；代码行为变化按路径要求验证，里程碑全部 Todo 完成后交给 `$web-verify-delivery`。
6. 重新执行只读预演，要求没有未解决的更新、新增/删除、人工合并、冲突或阻断。只有收敛且验证通过后，才按仓库已有格式更新 `.harness/upstream-lock.json` 的源版本/提交与受管理摘要；格式未定义时不自行发明锁结构。
7. 更新过升级规则自身后，再用更新后的规则重新审计一次。只按独立触发事件更新目标记忆，不导入源记忆。
8. 遇到 Skill 目录名与源 `SKILL.md` frontmatter `name` 不一致（canonical name 已迁移，如历史上的 `web-` 前缀引入）时，把该迁移视为显式的 `add` + `delete_proposed`：逐项展示旧目录删除、新目录增加、调用名变化和终端创建 Skill 墓碑，不把路径重命名伪装成普通内容更新；只有用户批准后才应用。

## 安全边界

- 绝不自动暂存、提交、建分支/Worktree、推送、建标签或发布。
- 绝不覆盖用户修改、秘密、产品源码、品牌、projectType、许可证、项目策略或项目记忆。
- 绝不恢复一次性初始化、多宿主界面管理、组合项目、另一类型或 monorepo 能力。
- 无法确定所有权、基线、身份渲染或批准范围时停止并询问用户。

## 完成输出

报告源/目标身份、路径、提交、基线状态、只读预演分类、批准与应用路径、保留修改、冲突、测试/构建、适用时里程碑结论、锁更新、未验证范围和剩余风险。仅只读预演成功不等于升级完成。
