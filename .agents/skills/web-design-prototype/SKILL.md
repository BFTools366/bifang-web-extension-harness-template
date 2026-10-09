---
name: web-design-prototype
description: 在已初始化的 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游，将已澄清的 PRD 转为可交互 HTML 原型方案，记录用户选定的具体版本后交接开发。用于新产品、新页面、显著交互改版或用户要求原型；不参与上游创建下游，也不为日常小修复强制重做原型。
---

# Web Harness：设计并选择产品原型

把已确认需求变成用户能打开、比较和选择的原型，再进入开发。默认提供 2–3 个在布局、信息层级或交互组织上有明显差异的方案；用户明确要求单方案时复用该选择。

## 准入与事实

1. 仅在已初始化下游运行：先确认有效的 `.harness/project.json`、Git 根和工作区；没有下游身份时，在分析或记录业务需求前停止，要求切换到下游后重提。Harness 自身维护本 Skill 不受此限制。
2. 初始化仅分发 Skills，不执行需求澄清、PRD、原型或选择，不增加初始化问题，也不读写全局 Skills。
3. 读取最新 `docs/product_spec/` 索引与正文、`docs/MANTINE_UI_GUIDELINES.md` 的当前宿主章节和直接相关 UI。没有已确认 PRD、目标/边界有歧义时先用 `$web-define-product`；按 [PRD 结构](references/prd-outline.md) 补齐当前范围。
4. Product Spec 就是唯一 PRD 正文，不另建重复的 `docs/prd/`。需求状态 `Approved` 只证明需求已确认，不能代替用户选择原型。选择证据只在对应 `docs/prototypes/<scope>/review.json`，不复制为第二套需求或计划。

## 产出与自查

1. 为本轮范围分配稳定 kebab-case `scope`，如 `account-settings`；新增版本目录 `docs/prototypes/<scope>/v1/`，后续修订递增且保留旧版本。每个候选使用独立 `a.html`、`b.html`、可选 `c.html`，并保持同一份需求范围，不能让某个方案偷偷增加功能。
2. 每个候选是可离线打开的独立 HTML，内联 CSS/JS 与所需小型资源，不引用 CDN、远程脚本或真实接口，不新增依赖。涵盖本轮主线、明确的按钮目的地，以及相关的加载、空、成功、错误、禁用与恢复交互；示例数据和模拟结果有清楚标识。不要做只有截图或失效按钮的原型。
3. 遵循现有品牌、Mantine 令牌与宿主尺寸。HTML 是评审媒介，实际开发仍用现有 React/Mantine/TypeScript/i18n。Web 覆盖所需桌面/移动布局；Extension 明确 Popup/Options 等 surface，不把 HTML 模拟当成浏览器权限/API 或 Chrome/Firefox 兼容证据。`design-taste-frontend` 仅按现有 UI 规范的适用边界调用。
4. 展示前检查主线、跳转、关键状态、键盘/焦点、标签、溢出和响应式；按当前范围记录证据、问题与未执行项到版本目录的 `review.md`。有浏览器能力时打开原型走查；没有时保留可打开文件并明确浏览器未检查。此检查不触发发布构建、候选验收或 E2E。
5. 将影响规则、数据、状态和验收的原型发现回写 PRD，与用户确认实质需求变化，消除阻断未决项后再登记候选。仅有视觉组织差异不改业务范围。
6. 在下游根运行项目本地命令，参数用实际路径替换：

   ```text
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts prepare <scope> docs/product_spec/YYYYMMDD_product_spec.md docs/prototypes/<scope>/v1/a.html docs/prototypes/<scope>/v1/b.html
   ```

   helper 只登记本项目 PRD 和候选的 SHA-256，写 `review.json` 的 `awaiting_selection` 状态，不生成产品内容或自动选方案。它不安装依赖、不调用网络。

## 用户选择与开发交接

1. 给用户可打开的所有候选链接、具体版本、方案差异、推荐理由、已检查及未检查项，再明确请用户选择“scope 的 vN 方案 A/B/C”。在可用时用 Codex 文件预览打开 HTML；工具不可用时提供本地链接。选项可以是建议，不能预先提交或自动选中。
2. 必须等待用户明确选定，不能把推荐、沉默、超时、自查通过、`Approved` PRD 或“继续”这种无法唯一识别方案的回复视为选择。已在当前会话明确选择同一版本时直接复用，不重复问；用户只批准设计并要求暂缓开发时遵守暂缓。
3. 用户明确选定后，记录真实原话（含方案/版本）、时间与候选 ID：

   ```text
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts select <scope> <candidate-id> <用户明确选择的原话>
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts check <scope>
   ```

   `candidate-id` 必须与用户选定的方案一致，不能照抄示例或默认第一项。参数经工具结构化传递或安全引用，不能把用户原话当 Shell 代码。只有真实用户选择后才可调用 `select`；helper 验证文件绑定，不能证明授权原话真实性，Agent 必须核对会话。`check` 通过后才可交给 `$web-implement-change`。

4. 开发交接包含 PRD、scope、选定版本/候选、review.json、成功标准、状态/数据契约与未验证项。不自动创建左侧 Task、Work Plan、发布候选或对外副作用；各自仍按独立触发器运行。
5. 选定后 PRD 或原型内容变化，旧选择失效：先展示差异、修订版本并重新 `prepare`，等待用户选定。不得为让 `check` 通过而静默重算或手改摘要。需求未变且有效选择存在时复用；普通小修复不自动开启新流程。

## 完成输出

报告 PRD 和原型链接、版本、比较、自查范围、选择状态及下一步。等待选择时完成本轮原型产出并把问题留给用户，业务代码保持未实施；原实施请求已授权且未暂停时，选定后携带有效证据直接进入开发，不增加第三次确认。若原请求仅限原型，则不扩大到开发。原型可交互不代表真实产品或最终产物已验证。

方法参考：[jg-product-design-skills](https://github.com/yideng-xl/pause_jg-product-design-skills) 的需求、原型与自查分阶段思路。本 Skill 为原创适配，不分发该项目的文本、资产、插件或禅道集成。
