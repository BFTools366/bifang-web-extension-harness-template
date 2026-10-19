# 商品目录固定设计与接线

- 路由/槽位：/catalog。
- 固定设计：从来源商品原型提取分类与商品卡片，展示 API 提供的名称、说明与价格；没有分类数据时只展示商品。提供加载、空、错误和重试；只有购买已完整接线才显示购买动作，确认弹窗按商品说明与订单摘要分区。
- 代码接线：CatalogPage 只读 CatalogApi；远端集合 adapter 必须消费真实 GraphQL 契约，商品价格不由页面提交覆盖。
- 操作边界：公开浏览不要求用户；购买通过 orders.purchase 操作明确加入最基础用户、订单和钱包支付。

具体品牌、文字、数据契约和可信权限码消费下游唯一 PRD；内容与 fixtures 按[提取与定制合同](../application/extraction.md)替换，保留路由、会话与 API owner。更丰富的费用中心结构见[来源离线参考](../compositions/purchase-checkout/source-reference/index.html)，不能当作当前代码已实现全部报价或钱包状态。代码资产由[应用装配器](../application/files.ts)按已选操作返回，设计与接线清单见[应用接线合同](../application/wiring.md)。只复制页面或函数不算接入完成，须验证入口、主流程、最高风险失败及依赖未选时的缺席。
