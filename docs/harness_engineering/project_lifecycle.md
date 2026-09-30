# 项目生命周期

## 1. 解析与冻结

实例化首先确认源外绝对空目标、单一宿主、项目名称/标识和 Agent 策略。说明默认使用显示名称，三 BaseURL 和品牌输入可选，确认来源自动记录“当前用户”；正式地址在正式发布前必须补齐 HTTPS。交互式首轮批量收集五项基础字段，再按中文“预设/自定义”模式完成 Agent policy；非交互式显式提供所有必需参数。E2E 不属于初始化输入。

任何 staging 写入前，source snapshot 绑定受管文件列表、字节、普通权限、`Version.md` 摘要和可用 Git HEAD/状态。源根、文件与关键父路径拒绝符号链接；源事实在发布目标前再次逐项复核。

## 2. 原子实例化

`pnpm instantiate` 只在目标同级 sibling staging 内复制冻结字节并调用内部 initializer。它只渲染所选模板，写入身份、Logo 母版、三环境、冻结配置、logger 和当前宿主派生，然后删除 instantiate、source validator、模板、源记忆方法及全部派生入口。

staging 内只格式化受影响文件，执行结构/身份/三环境/终端化校验，一次 `pnpm install --no-frozen-lockfile --prefer-offline`，配置仓库本地提交约定并建立独立 Git 根。同目标 sibling 租约串行化受支持的 Harness 创建进程；父目录、staging、holding 与预存空目标按设备/inode/mode 绑定，漂移时拒绝发布或沿替代树清理。全部成功后才原子 rename 到目标；父目录稳定的普通失败回收 staging，不发布半成品。Node 标准库不提供跨平台目录 no-replace flag，因此故意绕过租约的同机竞态不被误述为内核级保护。初始化不构建 `dist`、`build` 或 zip。

## 3. 日常开发

Agent 只读取当前事件相关事实，直接实施范围并运行相关非空测试。行为保持重构运行全量测试。产品目标变化、持久计划、重要状态、长期决定和 Changelog 各自按目录索引触发；不会因为代码修改或计划存在而级联创建全部记忆。

需要提交时先检查有效 Git 身份和受管 local 模板；合法 global/Unicode 身份复用，缺失字段才用批准 fallback 补齐。内部并行只在双授权与所有权门禁成立时从独立 Task source Worktree 创建单元，postflight 覆盖 committed、staged、unstaged、untracked 和 rename 双路径，整合后保守清理 Worktree并保留分支。

## 4. 候选、验收与发布

同一发布流程复用已明确的 E2E 选择，尚无选择且无硬要求时才询问一次。Web 的唯一 `pnpm build -- --e2e=<selection>` 委托 `build:release`；Extension 在相同 Release profile 上另行 package。两者都先验证三环境、Harness、lint、类型、全量非空测试、版本注入和 `release:inspect`。

当次 E2E 选择与完整验收的 `acceptance_smoke` 独立解析；E2E 或 smoke 任一为 `required`，或存在用户/产品/安全/渠道硬要求时，才在隔离真实 Chrome 中验证刚生成的精确候选。Mock、开发 preview 与旧产物不能提供验收结论。明确发布请求覆盖既有目的地及范围内的必要提交、push 和发布步骤，不重复确认；新增目的地或范围外副作用才补充授权，并按 [`../RELEASE.md`](../RELEASE.md) 执行。

## 5. 下游升级

升级先固定 source clean HEAD/Version、目标 Git/`projectType`、针对目标渲染的候选投影和生产 ownership manifest。`.harness/upstream-lock.json` 对每个受管/混合路径保存旧 candidate 与旧 target 双快照。

`plan` 只读输出三方分类；`apply` 只处理用户批准的一个现有 managed update，并在写前重算全部事实；混合、新增、删除和 bootstrap 冲突人工收敛。每次写后使用新计划，普通 managed 完成后才更新升级器自身。目标验证通过且只剩允许分类时 `record` 原子更新双基线。

protected/tombstone、unknown、required source 未精确传播、符号链接/特殊文件、所有权弱化或任一事实漂移都阻断。升级不导入 source 产品身份、品牌、项目策略、记忆、许可证、Git 历史或另一宿主。
