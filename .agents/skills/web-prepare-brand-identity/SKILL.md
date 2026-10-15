---
name: web-prepare-brand-identity
description: 为当前唯一的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目生成三个 Logo 候选供用户选一，或沿用已选正式源图，并同步当前宿主品牌元数据。用于首次实例化、品牌改名、Logo 或用户可见前端产品元数据变化。
---

# Web Harness：准备前端品牌身份

把 `.harness/project.json` 作为品牌文字和 `projectType` 的单一事实源，把 `.harness/brand/logo-1024.png` 作为规范图像母版。

## 收集与批准

1. 首次实例化尚无项目清单时只读取已收集的固定身份/品牌输入，不要求不存在的 UI 或 Product Spec；Logo 候选只能放在源和目标之外的临时目录，交给唯一实例化入口通过 `--logo` 导入。已初始化下游读取项目清单、当前 UI、现有品牌资产及相关产品决定。确认 `projectType` 只能是 `web` 或 `extension`。
2. 只向用户询问缺失的展示名称、简短说明、品牌色、视觉方向和源资产。不得推断商标权、版权或发布者身份。
3. 用户已经明确选定正式 Logo 时直接沿用，不要求重新三选一。只提供参考图、要求重新设计或没有正式源图时，优先使用可用图像生成能力制作恰好三个方向不同的候选，每个候选保存为独立图像，固定编号 1/2/3；不得用一张拼图、同图换色或重复文件冒充三个方案。编辑参考图时保留来源并规范裁剪、留白、透明度和 sRGB。
4. 逐个查看并展示三个候选，附简短区别；统一尺寸、品牌色与展示比例。只提出一个选择问题“请选择一个图标方案。”，选项为“1.方案一”“2.方案二”“3.方案三”。必须得到明确编号或能唯一对应候选的回答才可导入；空回答、超时、工具预选、取消或模糊回答不算选择。已明确的选择直接复用；用户要求重做时更新候选再选，不擅自选第一张。
5. 图像生成能力不可用或用户选择离线方案时，运行下方 helper 得到三个通用几何候选，按同一展示/选择流程处理，并明确它们不是定制设计。它只写系统临时目录，不写源、目标或 staging；输入失败不生成文件。只在用户实际选定后，通过首次实例化的 `--logo <selected-path>` 或下游的 `pnpm harness brand refresh --logo <selected-path>` 导入选中图。未选候选和候选绝对路径不得写进项目配置或运行时。

   ```text
   pnpm exec tsx .agents/skills/web-prepare-brand-identity/scripts/generate-candidates.ts \
     --name <name> --id <id> --brand-color <#RRGGBB>
   ```

   helper 使用当前项目已声明的 `sharp`，输出包含 1/2/3 编号、标签及独立 PNG 路径的 JSON。选定图导入并验证成功或用户取消后，只清理本次候选目录；不得删除用户原图。纯 CLI 直接省略 `--logo` 的原有单图生成保持兼容；需要三选一时先运行 helper 并显式导入选中路径。

6. 初始化必须得到正式 Logo，不能用模板徽标、空白文件、未展示草稿或低分辨率拉伸图结束。生成/导入工具失败时停止并说明阻断；选择阶段不得提前覆盖正式母版、派生文件或品牌配置。

## 生成与同步

1. 先创建或更新 1024×1024 无损 PNG 母版 `.harness/brand/logo-1024.png`；使用图像检查能力确认尺寸、透明度、边缘、安全留白和小尺寸可辨识度。
2. 首次实例化由 初始化器 写入品牌事实并派生资产，不在源中写项目配置或提前写目标。已初始化下游将已确认的名称、说明、`identityI18n` 默认语言/翻译、品牌色和 Logo 来源写入 `.harness/project.json`。只更新已确认字段，保留用户的其他项目事实。
3. 首次实例化复用 初始化器 的一次派生；已初始化下游运行唯一派生命令：

   ```text
   pnpm harness brand refresh
   ```

4. 若 `projectType=web`，只生成 `public/logo.png` 与 `public/favicon.png`，同步根 `index.html` 的 title、description、theme color 和图标引用，并同步可见落地页的名称、说明和 Logo。
5. 若 `projectType=extension`，只生成 `assets/icon.png`，从身份事实生成根 `locales/en/messages.json`、`locales/zh_CN/messages.json`，同步 package manifest 的 `__MSG_projectName__`、`__MSG_projectDescription__` 与显式 `default_locale`，并通过既有 i18next 同步实际存在的 popup/options 名称、说明和 Logo；刷新保留消息文件中其他产品键。Plasmo 从该资产自动派生 manifest icons，不要求手写图标声明；不得为了品牌同步虚构一个原本不需要的入口页。
6. 发现另一类型资产时，不把它纳入当前产物；若它形成可运行的另一类型入口，停止并交回初始化一致性修复。

## 验证

1. 首次实例化路径只运行初始化器拥有的静态结构/品牌检查与 `pnpm harness validate`；检查母版、派生尺寸、HTML/manifest/源码引用和当前宿主身份一致。初始化不生成 Release 候选，也不以源码预览冒充候选证据。
2. 已初始化下游的品牌变化运行 `pnpm harness validate`、本次受影响的相关非空测试或最小替代检查。只有用户明确要求最终候选/完整验收，或产品、安全、权限、渠道存在真实候选硬要求时，才在解析或复用本次发布的 E2E 选择后运行唯一 `pnpm build -- --e2e=enabled|disabled` 并交给 `$web-verify-delivery`；不得为普通品牌同步无条件构建。
3. 候选门禁触发时，`web` 在真实 `dist/` 检查 title、说明、favicon、Logo URL 和落地页渲染；`extension` 分别在真实 Chrome MV3 / Firefox MV2 候选检查 manifest、图标尺寸和 popup/options 渲染。未触发候选时明确把这些范围写为 `Unverified`。
4. 视觉查看生成母版及至少一个实际 UI 使用位置；不能只凭文件存在声明完成。
5. 品牌文字或图像改变属于用户可见变化时，按仓库触发规则更新当日 Changelog；只有长期身份决定才创建 ADR。初始化不预建这些记忆。

## 完成输出

报告项目类型、批准字段、候选编号与用户选择（或已选正式源图）、Logo 路径与来源、派生文件、Index/manifest/UI 同步、视觉检查、临时文件清理、运行命令、未解决的权属或分发元数据及剩余风险。
