# Workspace 工程升级合同

仅同步原有拓扑的工程基线，不迁移目录、不增加成员、不重新创建工程。唯一入口是 Workspace Git 根；成员自己的升级器副本不能独立升级或记录第二份基线。

## 身份、所有权与范围

- 绑定根 `.harness/workspace.json`、全部前端 `.harness/project.json`、Git 状态、目标本地所有权和根 `.harness/upstream-lock.json`。成员必须使用原有 `<id>_<type>` 目录，宿主、id、服务归属、普通目录与无嵌套 Git 均逐项核对。写前再复验完整身份内容，已脏文件再次变化也失败。
- 目标本地 `ownership-manifest.json` 增加且只允许以下 `workspaceRules`；首次迁移前展示该策略与 helper 精确路径，取得用户批准后补齐，不以源清单替代目标授权：

```json
"workspaceRules": [
  { "pattern": ".harness/runtime/workspace.mjs", "mode": "managed", "required": true }
]
```

- 根规则仍来自目标本地清单。只有 Workspace 根的这一个 runtime 文件获得精确例外；旧单包及前端成员继续保留 runtime 墓碑。前端成员把原所有权规则映射到精确成员前缀；根共用 Skills 可支持各成员宿主，成员拒绝另一宿主 Skill。
- Go 成员强制保护，不能由额外规则改为 managed。目标扫描在进入 Go、业务、品牌、项目记录目录前剪枝；秘密 `.env` 与 `.env*.local` 只登记存在、拒绝读内容并阻断规划。公开三环境文件保持 conditional，但本次渲染器不复制目标环境值。
- 产品源码、测试、实际业务、运行配置、Go 依赖与数据不进入工程候选。仅更新 Go Skill 和模板资源不改变已有服务功能；需要业务迁移时另按真实契约实施。

## 纯工程候选

已验证且 clean 的源在源根执行真实命令：

```sh
pnpm exec tsx .harness/tooling/upgrade-candidate.ts <absolute-target-git-root> <new-absolute-candidate-root>
```

旧目标尚无 Workspace 本地规则时，可以追加 `--bootstrap-proposal`，仅在源外生成追加最低规则的待批准提案与候选，保留目标原规则和顺序，不修改目标清单；该提案不是可应用计划，批准并补齐目标工具后必须由目标自身重新 plan。

候选目录必须预先不存在，且在源与目标之外；渲染器独占创建它。它复用终端文档、构建工具、宿主 manifest 和 Workspace 根模板，按目标本地所有权裁剪，只写工程文件。不调用初始化器、安装、Git 初始化、品牌生成、业务装配或服务请求。默认不读取目标环境、Go 配置、数据库、Logo 或源码。渲染候选不是验证通过。

`harness-upgrade.ts` 仍只有 plan/apply/record/migrate-ownership；CLI 没有 render 子命令，不能虚构。旧下游没有 Workspace helper 时先在外部完成精确差异审查，获批准后补齐新 helper、清单及必要消费者，再由目标自身 planner 重新生成计划。

## 应用、验证与基线

沿用原计划、路径批准、三方比较、逐次重规划、原子写与 fsync。保护本地偏离和原有依赖、产品脚本；mixed 只手工合并。新增依赖模块先补齐，提供新导出的 helper 先于消费者，runner 最后；每一步必须能启动目标 CLI。不能按字母顺序盲目替换有新增依赖的模块。

首次无 lock 不猜共同祖先：候选相同的 bootstrap_conflict 经逐项核验后允许记录；不同的受管字节需精确批准并收敛。所有权迁移也必须显示精确差异。根与成员的受管工程修改按影响运行相关非空测试；文档只做必要解析与差异检查。必要时运行根 `pnpm validate` 验证拓扑，不由升级自动触发产品构建、全量测试或 E2E。

最终 plan 仅保留原流程允许的收敛分类，人工合并精确列入 resolved-manual，再记录唯一根 lock。source commit 与版本必须真实匹配，源 clean 且通过 `pnpm validate:harness`。升级不自动提交当前产品已有修改，不推送、发布或部署。
