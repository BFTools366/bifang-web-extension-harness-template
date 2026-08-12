# 2026-08-12 Web Skill Naming Work Plan

## 目标与路径

- 路径：里程碑。重命名项目全部 Skills 会改变 Agent 触发入口、源 Harness 校验、终端下游传播和源专用创建 Skill 的删除契约。
- 目标：让 13 个项目 Skills 与 Rust/Server Harness 清晰隔离：canonical name/目录统一使用 `web-` 命名空间；UI 展示名统一以 `Web Harness：` 开头；`short_description` 与 `default_prompt` 统一使用中文并明确只服务纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension。
- 基线：当前工作树包含同一用户 Goal 下正在实施的严格中文注释门禁；本计划保护这些差异，不回滚、不覆盖。项目 Skills 正文没有 Rust 实现，但除 `$verify-delivery` 外的 UI 元数据仍使用通用英文描述，canonical name 也没有项目前缀，存在跨 Harness 身份冲突。

## 范围

- 范围内：`.agents/skills/` 13 个目录、SKILL frontmatter、H1 标题与 Skill 间引用；`agents/openai.yaml` 三个 UI 字段；根/下游 Agent Skill map；初始化复制/终端删除、Harness validator、测试和所有当前规范中的有效调用名。
- 命名规范：canonical name 使用小写字母和连字符、低于 64 字符，并在现有动词短语前增加 `web-` 命名空间；目录名与 frontmatter `name` 完全一致。旧名不得继续作为当前入口，避免与 Rust/Server Skills 冲突。
- 语言规范：`display_name` 为 `Web Harness：<中文动作>`；`short_description` 为 25–64 字符的中文说明；`default_prompt` 为单句中文并显式包含对应 `$web-*`；React、TypeScript、Web、Plasmo、Chrome、MV3、Git 等专名允许保留英文。UI 元数据禁止出现 `Rust` 或 `Server`。
- 范围外：改变各 Skill 的职责、任务路径、权限、安全、发布授权或技术栈；兼容旧 canonical name 的双入口；修改系统级或其他仓库的 Skills；提交、推送、上传或发布。
- 并行判断：只读引用映射、语言审计和重命名风险评审可并行；目录移动、全局引用与 validator/test 修改相互依赖，且当前工作树已有受保护差异，最终写入由主 Agent 串行完成，不创建 Worktree。

## Canonical name 映射

| 旧名称                          | 新名称                              |
| ------------------------------- | ----------------------------------- |
| `check-development-environment` | `web-check-development-environment` |
| `define-product`                | `web-define-product`                |
| `extract-i18n-strings`          | `web-extract-i18n-strings`          |
| `implement-change`              | `web-implement-change`              |
| `instantiate-project`           | `web-instantiate-project`           |
| `plan-change`                   | `web-plan-change`                   |
| `prepare-brand-identity`        | `web-prepare-brand-identity`        |
| `prepare-release`               | `web-prepare-release`               |
| `refactor-code`                 | `web-refactor-code`                 |
| `run-parallel-worktrees`        | `web-run-parallel-worktrees`        |
| `test-final-artifact-e2e`       | `web-test-final-artifact-e2e`       |
| `upgrade-harness`               | `web-upgrade-harness`               |
| `verify-delivery`               | `web-verify-delivery`               |

## Todo

| ID       | 状态 | 可观察结果与所有权                                                                                                    | 依赖     | 风险与验证                                                                                 |
| -------- | ---- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| SKILL-01 | done | 完成 13 个 Skill 的引用、UI 语言和下游传播/删除风险只读审计，固定名称与中文元数据规范                                 | 无       | 三路独立审计；已核对 `$skill-creator` 的命名、frontmatter 与 `openai.yaml` 约束            |
| SKILL-02 | done | 原子移动 13 个目录，更新 frontmatter、H1、内部引用与全部 `agents/openai.yaml`；每个目录名等于 canonical name          | SKILL-01 | 不保留双入口；13 项 `quick_validate.py` 全部通过；默认提示均显式包含新 `$web-*`            |
| SKILL-03 | done | 同步 `AGENTS.md`、README/规范、终端 Agent 模板、`HARNESS_ONLY_PATHS`、实例化排除与 Harness validator 的 13 项精确清单 | SKILL-02 | 新旧创建 Skill tombstone 同时保留；终端 validator 精确要求 12 个维护 Skill                 |
| SKILL-04 | done | 增加 metadata 精确值、中文/禁词、目录/frontmatter、一致引用、Web/Extension 生成后 Skill 集合和终端删除回归            | SKILL-03 | 旧目录、英文/漂移元数据、错误调用、多句提示、Rust/Server 身份及源创建 Skill 残留负例均通过 |
| SKILL-05 | done | 完成根全量门禁并与严格注释里程碑一起生成两个源外真实下游，确认 UI 元数据、12 个终端 Skills、Release 构建与产物检查    | SKILL-04 | Web/Extension 均无旧 Skill 或 Rust/Server 身份元数据；Extension 已通过 `pnpm package`      |

## 入口到实现与测试映射

| 入口                       | 实现模块                                                                             | 证据                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Codex 项目 Skill 列表      | `.agents/skills/web-*/SKILL.md` 与 `agents/openai.yaml`                              | 13 个目录逐项 quick validate；Harness validator 锁定 exact metadata             |
| 根 `AGENTS.md` Skill map   | 新 `$web-*` 调用名和 Web Harness 中文语言规范                                        | Markdown/本地路径检查；旧 canonical name 零入口命中                             |
| `pnpm instantiate -- ...`  | `.harness/tooling/instantiate.ts` 复制新目录；`finalize.ts` 生成终端 Agent map       | Web/Extension 真实输出都保留 12 个维护 Skill                                    |
| 成功下游禁止再次派生项目   | `.harness/tooling/config.ts` 的 `HARNESS_ONLY_PATHS` 删除 `$web-instantiate-project` | 终端化测试与 `pnpm harness validate` 拒绝源创建 Skill 残留                      |
| 根 `pnpm validate:harness` | `scripts/validate-harness.ts` 精确校验 13 个名称、frontmatter 与 UI 中文元数据       | `tests/harness-validator.test.ts` 覆盖旧目录、名称错配、英文及 Rust/Server 负例 |

## 里程碑验收门禁

1. SKILL-01..05 与中文注释门禁的全部 Todo 完成；差异不撤销当前 Goal 的既有实现。
2. 13 个 Skill 目录逐项通过 `$skill-creator` 的 `quick_validate.py`；目录名、frontmatter、默认提示引用严格一致。
3. 当前 `.agents/skills/`、根 Agent/规范和生成模板不再暴露旧 canonical name；历史说明若需提及迁移必须明确标记为旧名，不得成为可调用入口。
4. 根 `git diff --check`、格式、lint、typecheck、非空测试和 `pnpm validate:harness` 通过。
5. Web/Extension 源外真实下游各自只有 12 个 `web-*` 维护 Skills，且均不含 `$web-instantiate-project`、旧名、Rust 或 Server UI 元数据；完成各自里程碑 Release 门禁。
6. 本任务不授权 commit、push、tag、部署、上传或发布。

## 当前状态

- SKILL-01..05 全部完成；13 个源 Skill 均通过 `$skill-creator` 的 `quick_validate.py`，根 `git diff --check`、`format:check`、`lint`、`typecheck`、84 项测试与 `validate:harness` 全部通过。
- Web 与 Extension 真实下游均恰好保留 12 个 `web-*` 维护 Skills；目录名、frontmatter、H1 和中文 `openai.yaml` 元数据通过终端 validator，不含 `$web-instantiate-project`、旧 canonical 入口、Rust/Server 身份语言或内部派生 tooling。
- Node.js `26.7.0`、pnpm `10.33.3` 满足仓库声明；本轮静态 Skill 治理没有浏览器运行时增量，Chrome 为 `not-required/not-probed`。
- 最终结论随同一里程碑记录为 `Awaiting human review`：实现与固定门禁已完成，仅因源工作区未提交且候选仓库为 unborn Git 状态，未获得 commit、push 或发布授权。
