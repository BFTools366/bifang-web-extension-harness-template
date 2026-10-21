---
name: web-design-prototype
description: 在已初始化 React Web 或 Plasmo Extension 下游处理新页面、影响页面或流程的需求变更，以及明确的设计、视觉、布局、风格或交互修改；生成一个桌面交互原型，展示预览并等待用户反馈后交接开发。不生成 A/B 多方案或 Mobile 布局，不为纯逻辑修复或文案纠错强制重做原型。
---

# Web Harness：设计单一桌面原型

每次只生成一个桌面端原型，不生成 A/B/C 备选方案、不做 A/B 测试、不要求用户选择方案。交付可打开、可操作的 HTML，自查后展示预览并等待用户反馈；普通实施授权不能省略本轮设计预览。

## 准入与事实

1. 仅在已初始化下游运行：确认有效的 `.harness/project.json`、Git 根和工作区；没有下游身份时，停止原型工作，创建需求输入交给源实例化流程；成功后切换到下游并复用原文继续。Harness 自身维护本 Skill 不受此限制。
2. 正式 PRD、原型与登记只按各自事件创建，也不读写全局 Skills；创建需求语义与下游 PRD 归 `$web-define-product`，能力选择归 `$web-compose-capabilities`，本 Skill 只拥有实际桌面布局、交互原型与登记。所选能力优先组合 catalog 中的固定 design.md 与页面模板，保持登录、用户区、导航、权限和购买的既定交互；按需求补齐真实首页与正文，不重新随意设计能力页。完整创建只有匹配工程事务交接的一次性首版授权凭据时，才可在展示后复用该批准；后续设计修改重新走反馈门禁。
3. 读取最新 `docs/product_spec/` 索引与正文、`docs/MANTINE_UI_GUIDELINES.md` 的当前宿主章节和直接相关 UI。没有已确认 PRD、目标/边界有歧义时先用 `$web-define-product`；PRD 的结构和范围补齐归需求定义，记录合同见 [PRD 结构](../web-define-product/references/prd-outline.md)。只逐项澄清影响当前设计的关键缺口，复用已确认事实，不重启整套问卷。
4. Product Spec 是唯一 PRD，不另建 `docs/prd/`。需求须为 `Approved`；纯视觉变更复用有效 PRD，业务范围变化才回需求定义修订；原型摘要只登记在 `docs/prototypes/<scope>/review.json`，不复制为第二套需求或计划。登记不代表用户新增授权或交互质量已验证。
5. 按 [功能模块组合](../web-compose-capabilities/references/requirements-selection.md) 继承已选模块与具体操作，只读对应知识和设计参考；未选能力不进入原型。管理目标组织与操作者身份分开，Extension 按实际 surface 适配。

## 产出与自查

1. 为本轮范围分配稳定 kebab-case `scope`，如 `account-settings`；在 `docs/prototypes/<scope>/v1/prototype.html` 生成唯一原型。修订时递增版本并保留旧版本，它们是修订历史，不作为并行备选方案展示。
2. 原型是可离线打开的独立 HTML，内联 CSS/JS 与所需小型资源，不引用 CDN、远程脚本或真实接口，不新增依赖。覆盖本轮主线、按钮目的地及相关加载、空、成功、错误、禁用与恢复交互；在交付说明和 review.md 清楚标识示例数据和模拟结果，原型页面遵守 UI 规范的业务 placeholder 与精简文案约束，不加入 Mock 提示条或原始需求备注。不得交付只有截图或失效按钮的原型。
3. 仅面向桌面端，不规划、生成或验证 Mobile 支持：不增加手机/平板布局、移动断点、触控专用交互或移动端验收项。Web 遵循现有品牌、Mantine 令牌和桌面窗口尺寸；Extension 按桌面浏览器的 Popup、Options 等真实 surface 尺寸设计，紧凑 Popup 不等于 Mobile。通用 UI 规范中的移动优先建议不扩张本 Skill 的原型范围；产品实现的设备支持仍由产品范围及其工程规则决定。
   HTML 是设计媒介，开发仍使用既有 React/Mantine/TypeScript/i18n。`design-taste-frontend` 只在 UI 规范允许的范围内调用，不让其多方案或移动偏好覆盖本 Skill。
   Web 采用工作区时按 UI 规范“路由布局与插槽”展示父布局、叶页面与 URL 对应；慢加载保持外壳。只为已选操作展示认证页、安全返回与失败恢复，离线模拟不证明真实鉴权。
4. 展示前自查主线、跳转、关键状态、键盘/焦点、标签、所有适用字段的业务占位提示、页面文案必要性及桌面窗口溢出；将实际证据、问题和未执行项写入版本目录 `review.md`。有浏览器能力时走查原型；没有时保留可打开文件并明确浏览器未检查，不伪造交互或桌面布局通过。此步骤不触发发布构建、候选验收或 E2E。
5. 将影响规则、数据、状态及验收的发现返回 `$web-define-product`，由需求定义修订唯一 PRD 并复用或取得范围确认，再返回当前原型；本 Skill 不直接决定或批准需求范围。自查完成、消除阻断后展示唯一原型链接和最短试用路径，不提出 A/B 选择题，也不把修改意见变成新增方案。
6. 在下游根按实际事件执行，参数均使用真实来源；`<request>` 是本轮设计要求的用户消息标识或可追溯引用，不用时间、预选项或 Agent 自拟结论冒充。先登记当前原型，再向用户展示可打开链接及变更说明，实际展示后才记录 `present`；随后结束当前设计交付并等待反馈，不在同一回合修改产品代码：

   ```text
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts prepare <scope> <request> docs/product_spec/YYYYMMDD_product_spec.md docs/prototypes/<scope>/vN/prototype.html
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts present <scope> <reviewHash> <真实展示消息来源>
   ```

   `prepare` 返回 schemaVersion 3 的 `reviewHash` 和 `awaiting-preview`；`present` 后为 `awaiting-feedback`。用户针对当前预览明确确认后，记录展示之后的新用户回复，不能复用原始需求或展示消息作为反馈来源；记录答复及真实消息来源，再检查开发准入：

   ```text
   pnpm exec tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts approve <scope> <reviewHash> <明确确认> <用户消息来源及原话>
   pnpm prototype:check <scope> <request>
   ```

   明确确认接受 `yes`、`y`、`确认`、`通过`、`同意`、`按此实现`；含修改要求时先修订原型。用户等义自然回答可提取成规范值，source 保留其真实原话及消息引用，不要求复述固定句。不得伪造来源、把沉默/超时当同意，或先写产品代码再补登记。工具只核对结构与文件绑定，不能证明消息确由用户发出、预览确已显示或交互合格，Agent 对这些事实负责。重新 `prepare` 产生新代次并清空展示/批准，旧 `reviewHash` 失效；`check` 只读且不能自动登记或批准。

## 开发交接与修订

1. 交接 PRD、scope、唯一原型链接及版本、review.json、成功标准、状态/数据契约、自查证据和未验证项。不自动创建左侧 Task、Work Plan、发布候选或外部副作用。
2. 当前设计取得明确反馈且 `check` 通过后，才交给 `$web-implement-change`。原请求仅限原型时只交付设计；用户要求暂缓时保持暂缓。无需 A/B 选型不等于省略预览反馈。
3. 仅当用户明确要求跳过本次预览并直接实施，才可执行 `waive <scope> <reviewHash> <明确跳过> <用户消息来源及原话>`。明确跳过接受“跳过本次预览并直接实施”“跳过预览直接实施”“不用预览直接改”或 `skip preview and implement`；等义自然回答可提取成规范值，source 保留真实原话及消息引用，不能把普通“改一下”或需求确认解释为跳过。仍生成并自查本轮原型，留下当前版本和豁免依据，不把豁免扩大到后续改版。
4. 完整创建一次确认仅用于首版：工程事务经已授权表单写入 `.harness/initial-creation.json`，绑定项目实例、完整创建修订、七项范围与真实确认来源。首版固定使用 `initial-create` scope 的 `v1`；下游 Approved PRD 保留精确的 `创建确认：<revision>` 与 `创建范围：<七项 scope 的 JSON>` 两行，结构化范围须与凭据完全一致，设计必须符合该范围。`prepare` 的 request 使用凭据中的 source；展示当前原型后执行 `initial-create <scope> <reviewHash>` 再 `check`，不新增阶段确认。凭据只能绑定一次评审；重新登记、设计内容或需求变化后不得重复消费，缺凭据或范围不符时回到普通预览反馈。任一普通设计批准或显式跳过会关闭尚未消费的首版凭据，不能留给后续改版。初始 CLI 工程确认不产生这份完整首版授权。
5. PRD、原型或本轮设计要求变化时，旧摘要失效：修订当前唯一设计、自查、重新登记、展示并取得新反馈。即使旧文件哈希仍匹配，新设计请求也不能复用旧批准；无设计变化且批准覆盖当前范围时才复用。旧 schemaVersion 1/2 记录不自动转成批准，不删除历史产物。

## 完成输出

报告 PRD、唯一原型链接、版本、桌面设计范围、自查结果、评审状态、reviewHash、真实展示/反馈或豁免来源及下一步。明确未执行的浏览器检查；不生成 Mobile 方案或要求用户比较选型。原型可交互不代表真实产品或最终产物已验证。

方法参考：[jg-product-design-skills](https://github.com/yideng-xl/pause_jg-product-design-skills) 的需求、原型与自查分阶段思路。本 Skill 为原创适配，不分发该项目的文本、资产、插件或禅道集成。
