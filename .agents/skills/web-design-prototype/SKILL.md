---
name: web-design-prototype
description: 在已初始化的 React Web 或 Plasmo Chrome MV3 / Firefox MV2 Extension 下游，将已澄清的 PRD 转为一个桌面端可交互 HTML 原型，自查并登记内容摘要后交接开发。用于新产品、新页面、显著交互改版或用户要求原型；不生成 A/B 多方案或 Mobile 布局，不参与上游创建下游，也不为日常小修复强制重做原型。
---

# Web Harness：设计单一桌面原型

每次只生成一个桌面端原型，不生成 A/B/C 备选方案、不做 A/B 测试、不要求用户选择方案。交付可打开、可操作的 HTML，自查并登记当前文件后按已有授权交接开发。

## 准入与事实

1. 仅在已初始化下游运行：确认有效的 `.harness/project.json`、Git 根和工作区；没有下游身份时，停止原型工作，创建需求输入交给源实例化流程；成功后切换到下游并复用原文继续。Harness 自身维护本 Skill 不受此限制。
2. 初始化仅分发 Skills、中性工程与可选需求原文，不执行正式 PRD、原型或登记，也不读写全局 Skills；创建需求语义与下游 PRD 归 `$web-define-product`，能力选择归 `$web-compose-capabilities`，本 Skill 只拥有实际桌面布局、交互原型与登记。
3. 读取最新 `docs/product_spec/` 索引与正文、`docs/MANTINE_UI_GUIDELINES.md` 的当前宿主章节和直接相关 UI。没有已确认 PRD、目标/边界有歧义时先用 `$web-define-product`；PRD 的结构和范围补齐归需求定义，记录合同见 [PRD 结构](../web-define-product/references/prd-outline.md)。只逐项澄清影响当前设计的关键缺口，复用已确认事实，不重启整套问卷。
4. Product Spec 是唯一 PRD，不另建 `docs/prd/`。需求须为 `Approved`；原型摘要只登记在 `docs/prototypes/<scope>/review.json`，不复制为第二套需求或计划。登记不代表用户新增授权或交互质量已验证。
5. 按 [功能模块组合](../web-compose-capabilities/references/requirements-selection.md) 继承已选模块与具体操作，只读对应知识和设计参考；未选能力不进入原型。管理目标组织与操作者身份分开，Extension 按实际 surface 适配。

## 产出与自查

1. 为本轮范围分配稳定 kebab-case `scope`，如 `account-settings`；在 `docs/prototypes/<scope>/v1/prototype.html` 生成唯一原型。修订时递增版本并保留旧版本，它们是修订历史，不作为并行备选方案展示。
2. 原型是可离线打开的独立 HTML，内联 CSS/JS 与所需小型资源，不引用 CDN、远程脚本或真实接口，不新增依赖。覆盖本轮主线、按钮目的地及相关加载、空、成功、错误、禁用与恢复交互；清楚标识示例数据和模拟结果。不得交付只有截图或失效按钮的原型。
3. 仅面向桌面端，不规划、生成或验证 Mobile 支持：不增加手机/平板布局、移动断点、触控专用交互或移动端验收项。Web 遵循现有品牌、Mantine 令牌和桌面窗口尺寸；Extension 按桌面浏览器的 Popup、Options 等真实 surface 尺寸设计，紧凑 Popup 不等于 Mobile。通用 UI 规范中的移动优先建议不扩张本 Skill 的原型范围；产品实现的设备支持仍由产品范围及其工程规则决定。
   HTML 是设计媒介，开发仍使用既有 React/Mantine/TypeScript/i18n。`design-taste-frontend` 只在 UI 规范允许的范围内调用，不让其多方案或移动偏好覆盖本 Skill。
   Web 采用工作区时按 UI 规范“路由布局与插槽”展示父布局、叶页面与 URL 对应；慢加载保持外壳。只为已选操作展示认证页、安全返回与失败恢复，离线模拟不证明真实鉴权。
4. 展示前自查主线、跳转、关键状态、键盘/焦点、标签及桌面窗口溢出；将实际证据、问题和未执行项写入版本目录 `review.md`。有浏览器能力时走查原型；没有时保留可打开文件并明确浏览器未检查，不伪造交互或桌面布局通过。此步骤不触发发布构建、候选验收或 E2E。
5. 将影响规则、数据、状态及验收的发现返回 `$web-define-product`，由需求定义修订唯一 PRD 并复用或取得范围确认，再返回当前原型；本 Skill 不直接决定或批准需求范围。自查完成、消除阻断后展示唯一原型链接和最短试用路径，不提出 A/B 选择题，也不把修改意见变成新增方案。
6. 在下游根运行以下命令，替换为真实路径：

   ```text
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts prepare <scope> docs/product_spec/YYYYMMDD_product_spec.md docs/prototypes/<scope>/v1/prototype.html
   pnpm prototype:check <scope>
   ```

   `prepare` 仅接受一个 HTML，写入 schemaVersion 2 的项目、范围、版本、`layout: desktop`、PRD 与原型 SHA-256。`check` 只读校验身份、最新已确认 PRD 和文件摘要，不等待用户选择。helper 不生成内容、不安装依赖、不联网，也不检查页面是否可交互或桌面布局是否合格。

## 开发交接与修订

1. 交接 PRD、scope、唯一原型链接及版本、review.json、成功标准、状态/数据契约、自查证据和未验证项。不自动创建左侧 Task、Work Plan、发布候选或外部副作用。
2. 原请求已授权实施且没有暂缓时，`check` 通过后直接交给 `$web-implement-change`，无需用户选择或再次批准原型；原请求仅限原型时完成设计交付，用户要求暂缓开发时保持暂缓。
3. PRD 或原型内容变化时，旧摘要失效：修订当前唯一设计、自查并展示变化，再显式 `prepare` 和 `check`。不得手改摘要或让 `check` 自动重算以掩盖漂移。范围未变且登记有效时直接复用，普通小修复不自动开启新流程。
4. 旧 schemaVersion 1 的多方案/选择记录不自动迁移或默认采用第一项。按当前范围整理一个桌面原型，自查、展示后重新登记；不要求重新进行方案选择，也不删除历史产物。

## 完成输出

报告 PRD、唯一原型链接、版本、桌面设计范围、自查结果、摘要核验及按已有授权确定的下一步。明确未执行的浏览器检查；不生成 Mobile 方案或要求用户比较选型。原型可交互不代表真实产品或最终产物已验证。

方法参考：[jg-product-design-skills](https://github.com/yideng-xl/pause_jg-product-design-skills) 的需求、原型与自查分阶段思路。本 Skill 为原创适配，不分发该项目的文本、资产、插件或禅道集成。
