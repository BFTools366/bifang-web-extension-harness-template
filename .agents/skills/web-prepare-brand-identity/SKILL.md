---
name: web-prepare-brand-identity
description: 为当前唯一的纯 TypeScript React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 前端项目按需求优先自动选择唯一适配的 Logo 方向，等价或有争议时推荐候选，或沿用正式源图，并同步当前宿主品牌元数据。用于首次实例化、品牌改名、Logo 或用户可见前端产品元数据变化。
---

# Web Harness：准备前端品牌身份

把 `.harness/project.json` 作为品牌文字和 `projectType` 的单一事实源，把 `.harness/brand/logo-1024.png` 作为规范图像母版。

## 收集与批准

1. 首次实例化尚无项目清单时只读取已收集的固定身份/品牌输入，不要求不存在的 UI 或 Product Spec；Logo 候选只能放在源和目标之外的临时目录，交给唯一实例化入口通过 `--logo` 导入。已初始化下游读取项目清单、当前 UI、现有品牌资产及相关产品决定。确认 `projectType` 只能是 `web` 或 `extension`。
2. 复用需求、固定设计及已有品牌事实。展示名称、资产来源与权属缺失时只补真正需要的事实；品牌色、留白或视觉方向有充分依据时自行确定，多个方向同样适合或存在真实审美分歧时才推荐和补问，不机械收齐品牌问卷。不得推断商标权、版权或发布者身份。
3. 已有正式 Logo 直接沿用。没有正式图或要求重设计时，先按产品用途、用户、宿主与明确限制判断：唯一合适方向生成一个独立候选，实际查看并展示，自动选定并说明依据；多个方向同样适用或用户要求比较时，生成三个独立编号候选，展示区别、推荐及取舍。不得把工具预选或随机第一张当作需求判断，也不使用拼图或同图换色冒充独立方案。
4. 自动选择的方向与理由记录到创建 scope.design 或当前品牌变更汇总，并进入最终完整确认，不再单独索要选图批准。推荐分支仍需用户明确回答；沉默、超时和模糊回答不算取舍。用户明确选择优先；要求重做时更新受影响方向，不重复询问已有事实。
5. 图像生成不可用或用户选择离线方案时，运行下方 helper 得到三个通用几何候选。实际查看后，若需求可唯一区分则自动选择并说明依据，否则展示并推荐、等待取舍；明确其为通用离线图形。helper 只写系统临时目录，不写源、目标或 staging，输入失败不生成文件。

   ```text
   pnpm exec tsx .agents/skills/web-prepare-brand-identity/scripts/generate-candidates.ts \
     --name <name> --id <id> --brand-color <#RRGGBB>
   ```

   helper 使用已声明 sharp，返回独立 PNG 路径。选定图通过首次实例化的 --logo 或下游 pnpm harness brand refresh --logo 导入，未选候选和临时路径不进入项目运行时；导入成功或取消后只清理本次候选目录，不删除用户原图。纯 CLI 省略 --logo 的单图确定性生成保持兼容。

6. 初始化必须得到实际查看和展示过的正式 Logo，不能以模板徽标、空白文件、未查看草稿或低分辨率拉伸图结束。工具失败说明阻断；自动或人工选定前不覆盖正式母版、派生文件或品牌配置。自动选图不代替完整创建确认或已有设计反馈合同。

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

报告项目类型、批准字段、自动选择的理由或推荐取舍与用户选择（或正式源图）、Logo 路径与来源、派生文件、Index/manifest/UI 同步、视觉检查、临时文件清理、运行命令、未解决的权属或分发元数据及剩余风险。
