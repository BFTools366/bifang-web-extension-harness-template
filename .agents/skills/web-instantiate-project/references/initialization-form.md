# Web Harness 下游初始化表单

创建 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游首轮收集五项基础信息；Web 另需显式选择 Web 类型，Extension 另需非空简短说明。复用当前请求或命令已提供的合法值，只问缺失或非法项；Web 说明和确认来源不作为用户必填字段，API 地址可后续配置。

## 交互状态机

- 字段状态只取 `待首轮询问`、`待条件询问`、`待校验`、`已解析` 或 `不适用`。
- 首轮用一份编号表单收集缺失的项目类型、显示名称、项目标识、目标绝对路径和 Agent 策略。CLI 以单行 JSON 接收回答；项目类型不设默认值，策略提示使用中文“预设（推荐）/自定义”。
- 已知 Web 时把缺失的 `webType` 并入表单；首轮才选择 Web 时条件补问，也接受首轮主动附带。必须选择 1.工具站点（`tool-site`，沿用现有逻辑）、2.SaaS客户端（`saas-client`）或 3.SaaS大后台（`saas-admin`），不设默认、不从名称或描述推断。两个 SaaS 选项流程暂未开放，选中后明确说明并结束创建，在策略补问、最终确认和任何初始化写入前停止。Extension 不询问或接受该字段。
- 非交互 CLI 的第一个位置参数必须是用户原始输入的完整绝对目标目录；交互终端省略位置参数时，把 `targetRoot` 并入首轮。相对路径在任何写入前拒绝，不静默补成绝对路径。
- Web 说明默认使用显示名称；已知 Extension 时把缺失说明并入首轮，首轮才选择 Extension 时补问说明，空白值必须修正；三份 API 地址缺省为空字符串，表示未配置，不猜测 endpoint。开发地址可主动提供或后续配置，测试和正式地址不在首轮询问；正式发布前必须补齐 HTTPS 正式地址。
- 用户主动提供的可选字段全部复用并校验，包括首轮 JSON 中附带的地址。非法已填值进入后续修正轮；已经合法的字段不重问。
- 确认来源自动记录为“当前用户”，已有明确合法来源时复用；不单独询问姓名或确认来源。时间记录最终收齐日期。
- 选择“自定义”后每轮只询问一个缺失或非法的策略字段；已主动提供的合法策略值全部复用。选择“预设”后直接展开确定性选择。
- 完成解析后展示唯一完整汇总，包含源/目标原始路径与规范路径、身份、已配或未配的地址、品牌、完整 policy 和输入来源；只询问一次“按此创建？”。
- Web 汇总包含已选择的 Web 类型及来源；该分类仅供创建入口使用，不写入下游 `.harness/project.json`。
- 完整汇总确认前只允许读取规则、解析输入和规范路径，以及按品牌 Skill 在源/目标之外的临时目录生成或导入 Logo 候选，不创建目标/staging、复制、安装、初始化 Git 或修改源文件；拒绝确认以零写入结束。非交互命令通过完整必需参数表达创建意图。
- 不收集产品业务、页面、权限、endpoint、凭据、发布需求或 E2E 选择；这些事实留在成功下游处理。
- 项目内 `design-taste-frontend` 默认安装，已有有效版本原样保留，不作为表单或策略选择，不全局安装。

## 必填字段

| 顺序 | JSON key / CLI                 | 字段         | 规则                                                                                   |
| ---- | ------------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| 1    | `projectType` / `--type`       | 项目类型     | `web`（React 网页）或 `extension`（Chrome MV3 / Firefox MV2 扩展），二选一，无默认值。 |
| 2    | `name` / `--name`              | 显示名称     | 非空文本。                                                                             |
| 3    | `id` / `--id`                  | 项目标识     | 匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`，例如 `my-project`。                            |
| 4    | `targetRoot` / 位置参数        | 目标绝对路径 | 模板之外，不存在或为空，末级目录名与 `id` 一致。                                       |
| 5    | `policyMode` / `--policy-mode` | Agent 策略   | “预设”（推荐）或“自定义”；也接受 `recommended` / `custom`，预设不接受单项覆盖。        |

Web 条件必填字段为 `webType` / `--web-type`：`tool-site`、`saas-client` 或 `saas-admin`，也接受编号 `1`、`2`、`3` 或对应中文名称；仅 `tool-site` 当前可创建。缺失或非法值必须修正，不能默认工具站点；合法 SaaS 选择直接报告流程暂未开放，不作为非法输入反复询问。

## 可选输入与后续配置

- `developmentBaseUrl` / `--development-base-url`：开发 API 地址，可留空或后续配置。
- `testBaseUrl` / `--test-base-url`：测试 API 地址，初始化无需提供，可后续配置。
- `releaseBaseUrl` / `--release-base-url`：正式 API 地址，初始化无需提供，正式发布前必须补齐 HTTPS 地址。
- 已填地址必须是无凭据、query、fragment 的绝对 HTTP(S) URL；正式地址始终只接受 HTTPS。三份环境文件仍生成；普通文件校验允许空地址，活动 Release 校验要求正式地址非空。
- `description` / `--description`：Extension 必填，非空且最多 132 字符，已提供则复用；Web 缺省或空白时使用显示名称。扩展所有语言的名称最多 75 字符。
- `identityI18n` / `--identity-i18n`：可选 JSON 字符串，包含 `defaultLocale: en|zh_CN` 与 `translations` 对象；每份翻译必须同时包含非空 `name` 和 `description`。默认语言使用根字段，不重复记录在 translations。缺失翻译回退默认身份，未知语言/字段或不完整翻译在写入前拒绝。
- `confirmedBy` / `--confirmed-by`：仅复用已明确来源，缺省或空白时自动记为“当前用户”，不主动询问。
- `brandColor` / `--brand-color`：合法十六进制颜色，缺省 `#4C6EF5`。
- `--logo`：可选本地图像，由 Logo 预检验证；缺省确定性生成。Agent 路径先按 `$web-prepare-brand-identity` 生成/导入并预览，候选临时目录位于源和目标之外；汇总列出母版及当前宿主派生文件。

## 条件策略字段

“自定义”模式按下列顺序逐项询问，每项只能是 `enabled` 或 `disabled`：

1. `user_owned_tasks`
2. `superpowers`
3. `parallel_worktree_subagents`
4. `acceptance_smoke`
5. `e2e_hint`

`user_owned_tasks` 推荐/default 都为 `disabled`。`e2e_hint` 仅建议本次发布首次 E2E 选择，同一发布复用已明确的选择。“预设”确定性物化为：

```yaml
user_owned_tasks: disabled
superpowers: disabled
parallel_worktree_subagents: disabled
acceptance_smoke: enabled
e2e_hint: disabled
```

## 路径与来源汇总

最终汇总逐字展示源 Harness 根的脚本输入与 `realpath` 规范值、目标原始绝对值与解析既存祖先后的规范值。来源标记固定入口、命令行位置参数、交互表单、显示名称默认值、未配置地址、自动确认来源、品牌默认值或确定性预设。没有实际配置的地址明确显示“未配置”，正式地址提示发布前必须补齐。

路径汇总只是写入前确认事实，initializer 仍独立执行空目录、符号链接、源外位置、目录名和 source freeze 门禁。目标不存在时只读解析最近已存在祖先，不为规范路径提前创建目录。

## 原子写入边界

- 最终确认后、首个目标或 staging 写入前，冻结纳入复制的源文件路径、完整字节与权限模式，以及 `Version.md`（存在时）和可用 Git HEAD/完整 porcelain 状态。
- staging 初始化完成、原子发布前复核同一事实；纳入文件的新增、删除、字节或模式变化，Version、Git HEAD 或状态变化都失败关闭。
- 首次父目录写入前使用规范目标路径；创建唯一 `.<id>.harness-init.lock` 租约，冻结父目录、staging、holding 与既存空目标的设备/inode/模式。身份漂移停止发布；holding 回收失败只报告已发布但有残留，不改写成功结果或沿替代树清理。
- Node 标准库不提供跨平台目录 `rename-if-absent`，同机进程故意绕过租约的竞态不属于内核级保证；检测到目标竞争仍须失败关闭。
