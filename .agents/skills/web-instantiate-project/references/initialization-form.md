# Web Harness 下游初始化表单

收到创建 React Web 或 Plasmo Chrome MV3 Extension 下游的请求后，先完成本表单，再执行 Harness 验证、环境检查、目录创建、复制、依赖安装或 Git 初始化。用户已经在当前请求或命令中明确给出的合法字段直接记为已解析，不得重复询问。

## 交互状态机

- 每个字段只处于 `待首轮询问`、`待条件询问`、`待校验`、`已解析` 或 `不适用` 之一。
- 非交互 CLI 始终要求第一个位置参数是用户原始输入的完整绝对目标目录。交互式终端可以复用该位置参数；未提供时必须把 `targetRoot` 与其他缺失基础字段放进同一首轮表单。无论来源如何，相对路径都必须在发生任何写入前拒绝，不能用当前目录静默补成绝对路径。
- 项目类型、显示名称、ASCII kebab-case `id`、说明、三个 BaseURL、Agent 策略模式与确认来源是基础字段。交互式 CLI 用一份清晰编号的表单一次列出全部尚未解析项；当前 CLI 以单行 JSON 接收这一轮回答，JSON key 必须与表单一致。
- 首轮回复后校验全部基础字段。若有缺失或非法值，下一轮只列出仍需修正的字段、约束和原值问题；已经合法的字段继续复用。基础字段全部解析前不得进入条件问询。
- 用户一次主动提供多个合法字段时全部解析。选择 `custom` 后，依次解析五项 Agent 策略，每轮只询问当前一个缺失或非法字段；选择 `recommended` 时五项直接由确定性预设解析，不制造多余问询。
- 所有字段解析后展示唯一完整汇总，包含源根与目标根的原始值、规范值、每个输入的来源、项目身份、三 BaseURL、品牌色及完整 Agent Policy。本轮只询问一次“按此创建？”。
- 用户确认完整汇总前只允许读取规则、解析参数和规范路径，不得创建目标或 sibling staging、复制文件、运行安装、初始化 Git 或修改源文件。拒绝或任何非确认回答都以零写入结束。
- 本表单不收集产品业务、页面、权限、endpoint、凭据、发布需求或 E2E 选择。初始化完成后，这些事实由终端下游的独立产品与候选事件处理。

## 基础字段与校验

| 顺序 | JSON key / CLI                                  | 字段                | 规则                                                                 |
| ---- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| 1    | `targetRoot` / 位置参数                         | 目标目录原始输入    | 必须已经是绝对路径，位于源 Harness 外；最终目录名必须精确等于 `id`。 |
| 2    | `projectType` / `--type`                        | 唯一宿主            | 只能是 `web` 或 `extension`，不提供默认值。                          |
| 3    | `name` / `--name`                               | 项目显示名称        | 非空文本。                                                           |
| 4    | `id` / `--id`                                   | 项目标识            | 必须匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`。                         |
| 5    | `description` / `--description`                 | 简短说明            | 非空文本。                                                           |
| 6    | `developmentBaseUrl` / `--development-base-url` | Development BaseURL | 无凭据、query、fragment 的绝对 HTTP/HTTPS URL。                      |
| 7    | `testBaseUrl` / `--test-base-url`               | Test BaseURL        | 无凭据、query、fragment 的绝对 HTTP/HTTPS URL。                      |
| 8    | `releaseBaseUrl` / `--release-base-url`         | Release BaseURL     | 无凭据、query、fragment 的绝对 HTTPS URL。                           |
| 9    | `policyMode` / `--policy-mode`                  | Agent 策略模式      | `recommended` 或 `custom`；推荐模式不能混入单项覆盖。                |
| 10   | `confirmedBy` / `--confirmed-by`                | 确认来源            | 真实确认人或明确责任主体；这是 policy 来源，不是另一个项目身份字段。 |
| 11   | `--brand-color`                                 | 可选品牌色          | 合法十六进制颜色；缺省为 `#4C6EF5`。                                 |
| 12   | `--logo`                                        | 可选 Logo           | 由正式 Logo 预检验证；不是基础交互必填字段。                         |

非交互模式必须显式给出第 1–10 项，且第 1 项必须是位置参数。交互模式未给位置参数时，第 1 项与其余尚未给出的基础项进入同一首轮批量表单。

## 条件策略字段

`custom` 模式按下列顺序逐项询问，每项只能是 `enabled` 或 `disabled`：

1. `user_owned_tasks`
2. `superpowers`
3. `parallel_worktree_subagents`
4. `acceptance_smoke`
5. `e2e_hint`

`user_owned_tasks` 的推荐/default 值都是 `disabled`。`e2e_hint` 只保存以后每次候选构建询问时展示的建议值，不替代任何一次真实构建前的用户选择。`recommended` 模式一次确定性物化为：

```yaml
user_owned_tasks: disabled
superpowers: disabled
parallel_worktree_subagents: disabled
acceptance_smoke: enabled
e2e_hint: disabled
```

## 路径与来源汇总

最终汇总必须逐字展示：

- 源 Harness 根的脚本输入值与 `realpath` 规范值，来源标记为固定 Harness 创建入口；
- 目标原始绝对值与解析已存在符号链接祖先后的规范值，来源标记为命令行绝对位置参数或交互表单；
- 每个基础字段来自命令行、交互表单还是 Harness 默认值；
- 五项策略来自命令行、自定义条件问询还是推荐预设；
- 完整身份、环境与 policy 结果。

路径汇总只是写入前确认事实；正式 initializer 仍必须独立执行空目录、符号链接、源外位置、目录名与 source freeze 门禁。目标不存在时只读解析最近已存在祖先，不得为了得到规范路径而提前创建目录。

## 原子写入边界

- 最终确认后、首个目标或 staging 写入前，冻结所有纳入复制的源文件路径、完整字节与权限模式，并冻结 `Version.md`（存在时）以及可用的 Git HEAD/完整 porcelain 状态。
- staging 初始化完成、原子发布前重新捕获同一事实；任一纳入文件新增、删除、内容变化或模式变化，Version 变化，Git HEAD 变化或工作区状态变化都必须失败关闭。
- 首次父目录写入前使用规范目标路径；随后创建同目标唯一的 `.<id>.harness-init.lock` 合作租约，并冻结父目录、staging、holding 与既有空目标的设备、inode 和模式。身份漂移时停止发布；提交成功后 holding 回收失败只报告“已发布但有残留”，不得改写成未发布失败。
- 目标父目录保持绑定时，失败、取消或 source/target 漂移不得留下目标内容、租约或匹配 `.<id>.harness-stage-*` 的 sibling staging。父目录本身漂移时，优先拒绝沿替代路径递归删除并报告原路径残留，不能为满足清理表象而删除未绑定对象。
- Node.js 标准库没有跨平台目录 `rename-if-absent` flags；租约保证所有受支持 Harness 入口彼此互斥，发布前也会再次复核目标。故意绕过租约且恰在最终复核与 rename 之间写入的同机进程不属于此原子协议保证，文档和报告不得把合作租约宣称为内核级 no-replace。
- 公开 CLI 不接受 `--skip-install` 或 `--skip-git`。单元测试只可通过直接调用内部 TypeScript 接口注入这两个布尔选项。

## 完成条件

只有以下事实同时成立，表单才完成：

- 所有基础字段均为 `已解析`，条件策略字段均为 `已解析` 或 `不适用`；
- 目标原始输入本身是绝对路径，原始与规范 source/target 已进入汇总；
- 推荐预设或五项自定义策略已完全解析，无 `pending`；
- 每个输入来源已明确；
- 用户已对唯一完整汇总作出最终确认，或非交互命令已显式提供全部字段与 `--confirmed-by`；
- 确认前没有发生任何写入，取消或失败没有留下目标与 staging。
