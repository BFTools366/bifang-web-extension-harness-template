---
name: web-prepare-brand-identity
description: 为当前唯一的纯 TypeScript React Web 或 Plasmo Chrome MV3 Extension 前端项目创建或更新正式 Logo，并从 .harness/project.json 同步当前宿主的品牌元数据。用于首次实例化、品牌改名、Logo 或用户可见前端产品元数据变化。
---

# Web Harness：准备前端品牌身份

把 `.harness/project.json` 作为品牌文字和 `projectType` 的单一事实源，把 `.harness/brand/logo-1024.png` 作为规范图像母版。

## 收集与批准

1. 读取项目清单、当前 UI、现有品牌资产及相关产品决定。确认 `projectType` 只能是 `web` 或 `extension`。
2. 只向用户询问缺失的展示名称、简短说明、品牌色、视觉方向和源资产。不得推断商标权、版权或发布者身份。
3. Logo 采用下列一种明确路径：
   - 初始化默认使用 Harness 内置的确定性生成器，根据名称、标识和品牌色创建图形；
   - 使用可用图像生成能力制作候选，展示预览并把选中结果作为外部源导入；
   - 编辑用户提供的源图，保留来源并规范裁剪、留白、透明度和 sRGB。
4. 初始化必须得到正式 Logo，不能用模板徽标、空白文件、未展示草稿或低分辨率拉伸图结束。生成/导入工具失败时停止并说明阻断。

## 生成与同步

1. 先创建或更新 1024×1024 无损 PNG 母版 `.harness/brand/logo-1024.png`；使用图像检查能力确认尺寸、透明度、边缘、安全留白和小尺寸可辨识度。
2. 将已批准的名称、说明、品牌色和 Logo 来源写入 `.harness/project.json`。只更新已确认字段，保留用户的其他项目事实。
3. 运行唯一派生命令：

   ```text
   pnpm harness brand refresh
   ```

4. 若 `projectType=web`，只生成 `public/logo.png` 与 `public/favicon.png`，同步根 `index.html` 的 title、description、theme color 和图标引用，并同步可见落地页的名称、说明和 Logo。
5. 若 `projectType=extension`，只生成 `assets/icon.png`，同步 package manifest 的名称与说明，并同步实际存在的 popup/options 中的名称、说明和 Logo。Plasmo 从该资产自动派生 manifest icons，不要求手写图标声明；不得为了品牌同步虚构一个原本不需要的入口页。
6. 发现另一类型资产时，不把它纳入当前产物；若它形成可运行的另一类型入口，停止并交回初始化一致性修复。

## 验证

1. 运行 `pnpm harness validate` 及相关类型、测试和构建脚本。
2. `web` 在真实构建后的 `dist/` 检查 title、说明、favicon、Logo URL 和落地页渲染；`extension` 在真实 Chrome MV3 构建中检查 manifest、图标尺寸和 popup/options 渲染。
3. 视觉查看生成母版及至少一个实际 UI 使用位置；不能只凭文件存在声明完成。
4. 品牌文字或图像改变属于用户可见变化时，按仓库触发规则更新当日 Changelog；只有长期身份决定才创建 ADR。初始化不预建这些记忆。

## 完成输出

报告项目类型、批准字段、Logo 路径与来源、派生文件、Index/manifest/UI 同步、视觉检查、运行命令、未解决的权属或分发元数据及剩余风险。
