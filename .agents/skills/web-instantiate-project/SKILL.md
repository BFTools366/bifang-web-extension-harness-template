---
name: web-instantiate-project
description: 通过源 Web Harness 创建独立 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension，并在成功下游按已确认需求完成首版页面、功能和开发验证；工程事务只是内部阶段，需求、固定能力模板、设计与实施分别委托对应 Skill，不在源实现产品。
---

# Web Harness：实例化前端项目

完整创建任务交付按已确认需求实现、可运行且完成实际流程验证的首版。工程创建事务负责生成独立单包、安装依赖和建立 Git 基线，只是内部阶段；事务成功后继续在下游完成唯一 PRD、固定设计装配、页面与功能实施和开发浏览器走查。源 Harness 只维护规则与可复用资产，产品记录和业务代码只写入成功下游。

## 收集输入

创建前同时读取 [`references/initialization-form.md`](references/initialization-form.md) 的条件规则与 [`references/initialization-questions.json`](references/initialization-questions.json) 的固定文案。Agent 和 CLI 共用基础输入与策略题目的名称、题面、选项与顺序；CLI confirmation 确认工程事务，Agent 按本 Skill 的完整创建合同一次确认首版范围；每个选项逐字显示为 `label（description）`。每轮只问一项，收到实际回答并校验后才继续；重问与恢复不改名、不改写题面。默认值和错误信息另列，不合并问题或用整表要求用户填写。

1. 按 [`references/initialization-form.md`](references/initialization-form.md) 维护字段状态。按依赖顺序逐项引导尚未明确的基础字段，每轮只问一个：唯一项目类型、展示名称、源 Harness 之外的完整绝对父目录和中文策略模式“预设/自定义”；先复用已有合法答案，只重问缺失或非法项。普通回答直接输入文本，不要求 JSON；用户主动一次提供多个值仍复用。项目标识无需用户手填：Agent 根据显示名称生成语义准确的英文翻译，经 `--english-name` 自动转成小写 ASCII kebab-case，并在最终汇总展示；英文名称直接生成，已有显式合法标识优先复用，不转拼音、不从父目录名推导。纯 CLI 无 Agent 翻译能力时只补问英文译名。策略模式建议预设（已有单项覆盖则建议自定义），CLI 题面之外明确“回车采用”后可接受默认值；父目录不得猜测，最终目录固定为“用户提供的父目录/项目标识”。非交互命令仍必须把绝对父目录作为位置参数；交互式终端未给位置参数时逐项补问。Web 说明可省略并默认使用显示名称；Extension 必须收集非空简短说明，已提供则复用，类型明确后按需单独补问；开发 API 地址可选，可后续配置，测试/正式地址不在首轮询问，未配置地址留空。主动提供的地址仍须校验，正式地址只接受 HTTPS，正式发布前必须补齐。`confirmed_by` 自动记录“当前用户”，已明确提供来源时复用，不询问确认来源；不得为未知 endpoint 猜测值。
2. 要求用户明确选择唯一宿主：1.Web（`web`）或 2.Extension（`extension`），复用合法选择，不默认或从文档推断。随后复用已提供的文档、全文或口头需求；需求文档可选，首版实际需求不能省略。读取 [创建需求输入与事务交接](references/requirements-intake.md)，需求分析委托 `$web-define-product` 的创建前只读模式；本 Skill 不拥有需求或能力判据，再由其委托 `$web-compose-capabilities` 解析操作。至少明确目标用户、真实首页、必要页面、完整核心流程、数据模式和可观察验收标准。按 catalog 自动补齐操作最小依赖并展示原因；购买必须包含基础用户系统，不由此加入注册、找回、组织或权限。原文经 `--requirements-file` 交接；口头需求沿用当前对话。默认欢迎页与计数器演示已移除，首页由实际需求实施，不能以工程空壳交付。
3. 若项目 Agent Policy 尚无有效决定，让用户选择仓库提供的推荐策略或逐项自定义。推荐模式一次展开；自定义模式每轮只询问一个仍缺失或非法的策略字段，并展示预设中的该项作为建议默认值；CLI 明确提示后回车表示采用，聊天中仍以实际回答为准。用户主动提供的多个合法值全部复用。按用户登记记录“当前用户”和最终收齐日期，不把模板值当作用户决定。

## Logo 与身份本地化

1. 调用 `$web-prepare-brand-identity` 的首次实例化分支：只使用已收集的名称、id、说明、品牌色和用户提供源图。已有图像先查看；复用已选正式源图，否则按品牌 Skill 生成、查看并展示三个独立 Logo 候选，等待用户明确选一。生成授权不代替选图，候选编号与选择只由品牌 Skill 管理。创建需求分析不扩大品牌输入或授权。
2. 候选放在源/目标之外的临时目录，只把已选图作为 `--logo <absolute-path>` 导入；不向源、目标或 staging 提前写入。没有图像生成能力时复用品牌 Skill 的离线三候选 helper 和同一选择流程，不能把通用几何图形称为已完成定制设计。创建成功后查看规范母版并展示其路径，以及 Web Logo/Favicon 或 Extension icon；不以文件存在替代视觉检查。选图与最终“按此创建？”是两个不同事件，选图后仍按原有规则确认创建。
3. 名称和说明使用根字段作为默认语言，可通过 `--identity-i18n` JSON 提供 `defaultLocale` 和另一语言的完整 `translations`。当前与既有 UI 对齐支持 `en` 和 `zh_CN`；不猜测翻译。精确配置见 `docs/TS_WEB_TEMPLATE.md` §3.1。

## 安全复制

1. 用户提供的父目录原始输入本身必须是绝对路径；不得先用当前目录把相对输入静默转绝对。在父目录下拼接已校验项目标识得到最终目录，将源 Harness 根和最终目录解析为规范绝对路径，在最终汇总中同时展示原始父目录、最终目录、规范值与输入来源。最终目录名必须等于项目标识；拒绝源根及其任意子路径、符号链接歧义和任何路径越界。
2. 写入前清点目标。目标必须不存在或完全为空，包括隐藏条目；发现任何用户文件都停止，不覆盖、合并或清理。
3. 正式创建在目标父目录建立同目标唯一的 sibling 租约，并绑定父目录、staging、holding 与预存空目标的设备、inode 和模式；任何身份漂移都停止发布。父目录漂移时不得沿替代路径递归清理，而要报告无法安全回收的原 staging/租约。
4. 本次首次初始化调用 `$web-check-development-environment` 一次，只检查 Node.js/pnpm；同时运行 `git --version` 和源模板根的 `pnpm validate:harness`。源 Harness 没有 `.harness/project.json`，不得在这里误用只面向已初始化下游的 `pnpm harness validate`。Chrome/Firefox 不属于工程事务门禁，首版开发走查前按当前宿主检查实际可用浏览器；Git 缺失、模板验证失败或模板状态无法可信识别时停止。
5. 在复制前固定受维护种子文件清单，再按清单复制到目标同级 sibling staging。排除源 `.git`、`node_modules`、`dist`、`build`、`.plasmo`、缓存、覆盖率、发布产物、临时证据、下游项目、Harness 专用 `Version.md`、`docs/VERIFICATION.md`、`docs/verification/**` 及全部日期项目记忆；下游版本事实来自根 `package.json`。
6. 保留长期规范、许可证、`instantiate` 内部生成所需 tooling、适用 Skills 和锁文件。重置模板名称、示例标识、本机绝对路径、已完成声明和 Harness 历史；法律文本只允许按许可证规则替换精确项目名称。
7. 不预建 Product Spec、Work Plan、ADR、Status、Verification 或 Changelog。可选原文只保存为下游 `docs/requirements/source.txt` 与交接说明，且不从源复制任何既存 `docs/requirements/`。项目记忆只在负责它的后续事件触发时创建。

## 建立独立仓库

1. 调用 `pnpm instantiate` 前保持目标完全为空，不要先在目标运行 `git init`；否则 `.git` 会触发非空目标保护。初始化器只在 staging 中完成生成、安装、结构验证和一次性裁剪后建立 `main` 独立 Git 根；紧邻唯一提交按 `$web-configure-git-commits` 契约执行 `identity-report`、必要时 `identity-bootstrap`、`identity-check`、模板 `install` 与 `check`，随后创建恰好一个 `chore: 初始化项目` 中性基线提交，全部成功后才允许原子发布。
2. 命令成功后验证 `git rev-parse --show-toplevel` 的规范路径等于目标根、当前分支为 `main`、`git remote` 为空、`HEAD` 存在且仓库恰好只有一个 root commit，提交主题为 `chore: 初始化项目`，工作区与暂存区为空。测试可通过直接调用内部 TypeScript 接口注入跳过 Git 或安装；公开 `pnpm instantiate` 不接受 `--skip-git` 或 `--skip-install`。
3. 不复制源历史，不创建远端、标签、托管仓库，不推送，也不修改全局 Git 配置。

## 执行唯一创建入口

1. 从源 Harness 根调用唯一公开的 `pnpm instantiate` 入口，并传入已确认的源外绝对父目录、身份、策略模式与唯一类型；BaseURL 仅在用户主动提供时传入。CLI 在父目录下以生成的项目标识创建子目录；英文显示名称可省略 `--english-name`，显式 `--id` 仅用于复用用户已给标识。初始化不创建 Release 候选，因此不询问或接受 E2E 选择。不要在目标根预先运行 frozen install，也不要直接调用底层 initializer；`instantiate` 会在目标同级 sibling staging 内部重写 manifest，再用一次 `pnpm install --no-frozen-lockfile --prefer-offline` 建立首份与目标清单一致的 lockfile：

   ```text
   pnpm instantiate -- <absolute-parent-outside-harness> --type <web|extension> \
     --name "<display-name>" --english-name "<English translation>" --policy-mode <预设|自定义>
   ```

   有需求文档时追加 `--requirements-file <absolute-md-or-txt>`；Agent 处理附件/全文时使用源与目标之外临时目录中的完整文本。CLI 只交接原文，需求分析与建议由对应 Skill 返回，不能把 CLI 成功声明为业务已实现。

   自定义策略模式必须显式传入 `--user-owned-tasks enabled|disabled`、`--superpowers enabled|disabled`、`--parallel-worktree-subagents enabled|disabled`、`--acceptance-smoke enabled|disabled` 与 `--e2e-hint enabled|disabled`；推荐模式不得混入逐项覆盖。

   交互模式按依赖顺序逐项解析基础字段，再每轮只补一个自定义策略字段；全部字段有效后展示唯一包含 Logo 来源、母版/派生资产与本地化字段的完整汇总及首版首页、页面、操作与依赖原因、固定设计、数据模式和验收场景，并仅询问一次“按此创建并完成首版？”。该完整确认授权工程事务及范围内下游 PRD 记录、原型自查登记、代码接线、相关检查和开发浏览器走查；已有明确完整创建授权直接复用，不在工程成功或阶段交接处重复询问。CLI 自身只能确认和完成工程事务，不能宣称业务完成。该确认前不得创建目标、staging、安装依赖、初始化 Git 或修改任何源文件。非交互模式通过完整必需参数表达本次已确认输入，确认来源自动记录为“当前用户”；Web 说明、三地址、品牌和已明确来源的覆盖参数可省略；Extension 必须传 `--description`。本地化参数可省略，此时按默认身份回退。

2. 底层 initializer 只作为上述 sibling staging 事务的内部步骤，生成正式 Logo、同步当前类型品牌、生成三份环境、类型化 `APP_CONFIG`、统一 logger、分页 session 状态与无 endpoint 的 Ky HTTP 请求基础；源 Harness 的 `pnpm harness init` 明确拒绝，`pnpm harness:init` 不存在。不得在成功后无理由重复运行品牌刷新。默认在项目内检查 `design-taste-frontend`，有效已有版本原样保留，缺失时由 initializer 使用固定快照自动补装至 `.agents/skills/design-taste-frontend/`，不追加用户选择、不依赖全局版本、不执行远程安装器；快照及事务边界见 `docs/TS_WEB_TEMPLATE.md` §3.9，设计适用规则见 `docs/MANTINE_UI_GUIDELINES.md` §1.1。
3. 初始化验证和一次性裁剪全部通过后，确认源专用 `$web-instantiate-project`、`instantiate` script 和内部 init/instantiate tooling 已从下游删除，且不存在可派生另一个项目的活动入口。
4. 复核 `.harness/project.json`、三份环境、单 package 结构、类型互斥、身份残留、排除项、许可证、安装完成、独立 Git 根及初始化期不存在 `dist/`、`build/` 或 zip。初始化器已经在 staging 内直接执行结构、环境文件与终端化校验，不在外层重复运行格式、lint、类型、全量测试或构建。只有用户另外要求 Release 候选时，才在成功下游中解析或复用本次发布的 E2E 选择并显式运行唯一 `pnpm build`；Extension 打包同理。
5. 工程事务内的 Git 授权只覆盖在完整脚手架验证和一次性裁剪后创建上述唯一 local 基线提交，以及其紧邻的 repo-local 身份/模板配置；不需要另行询问提交授权，不因工程事务自动授权产品阶段额外提交、远端、推送、标签、托管仓库或发布。

## 在下游完成首版

1. 工程事务成功后复核目标 `.harness/project.json`、Git 根和宿主，读取目标 `AGENTS.md`，在同一任务内转到目标根继续，不在源实施产品。
2. `$web-define-product` 复用完整创建确认登记 Approved PRD，注明实际确认来源；`$web-compose-capabilities` 提供固定设计和操作依赖，`$web-design-prototype` 组合一个真实交互原型、自查并登记，不重复批准同一范围。
3. `$web-implement-change` 使用 [固定应用装配合同](../web-compose-capabilities/templates/application/wiring.md)，接入所选页面、路由、导航、用户区、HTTP、Query 与状态 owner，并按需求实现真实 HomePage。固定模板不是产品正文。基础身份必须包含登录、用户信息、匿名守卫、安全返回、Token、退出及当前 401 清理；权限同时用于路由、页面、导航、元素和提交前复核。
4. 运行首版变化需要的类型检查、相关非空行为测试和实际开发浏览器核心流程走查；Extension 走查 Chrome 与 Firefox 的受影响流程。开发走查不调用最终产物 E2E Skill，不产生 Release 候选。Mock 模式明确标识、测试数据支撑实际流程；要求真实接入时必须接通可信 adapter，不能用 Mock 宣告完成。
5. 产品阶段失败保留已发布下游及修改，修复后复验；不能删除工程回滚现场，也不能以工程事务成功结束完整创建。只有要求最终 dist/zip 或发布时才进入相应门禁；凭据、真实扣款、生产或外部写入按原授权与专用门禁执行。

## 不变量

- 下游仓库必须是纯 `web` 或纯 `extension`，不能是两者组合、可增减目标的工作区或 monorepo。
- 源 Harness 的 `pnpm instantiate -- <absolute-parent-outside-harness> ...` 是唯一公开创建入口；模板副本、源根和源内目录不得原地初始化。
- 目标目录与独立 Git 顶层目录必须相同。
- 保留用户文件优先于完成实例化；任何冲突都必须停止。
- 不迁移模板的批准结论、日期记忆、验证证据、版本发布记录或人工签署。
- 下游是终端项目，不保留本 Skill、创建 script、内部 initializer 或类型切换能力。

## 完成输出

报告目标完整路径、宿主、实际页面和功能、操作依赖及原因、数据模式、运行方式、Git 基线、相关测试和开发浏览器走查结果、未执行项与真实缺口。已确认首版范围全部满足才报告完整创建完成。独立运行 `pnpm instantiate` 只报告工程事务完成、身份/环境/品牌/安装与 Git 技术结果，明确首版功能仍待实施，不声明发布就绪。
