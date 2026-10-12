---
name: web-implement-saas-commerce
description: 在已初始化 React Web 的 SaaS 客户端中设计或实施明确选中的可选购买能力，覆盖树形分类、商品、服务端钱包支付选项、订单续付、钱包管理与支付后账户刷新；不自动应用于后台、普通站点或 Extension。
---

# Web Harness：设计与实施可选 SaaS 购买

维护可复用的商品选择、订单管理与钱包管理需求、用户 SOP 和中性设计。源 Harness 只分发本 Skill 及参考资产，不生成产品页面、不连接支付服务，创建时选 SaaS 客户端也不自动启用购买；创建后的范围确认见 [创建与开发 SOP](../web-design-prototype/references/prd-outline.md#创建与开发-sop)。

## 启用边界

- **默认关闭，只有明确选中后才应用**。Skill 被分发或被发现不等于功能已启用。仅已初始化且 `projectType=web`、已确认模式为 `saas-client` 的下游可应用；复用 README 创建交接中用户明确的购买选择并写入唯一 PRD；不从目录、页面名、缺失字段或默认建议推断启用，不新增身份 Schema 或公开环境键。
- 在下游唯一 Product Spec 的“可选能力”中记录 `saas-commerce` 的 `enabled|disabled`、选择来源和日期。复用用户本轮明确要求或已有决定；未选中时不生成三项菜单/业务路由，不发起目录、订单、钱包请求或轮询。关闭能力不删除服务器订单或钱包数据。
- **功能选择不授予权限**。菜单、直达路由与请求还须满足当前用户/组织权限和服务能力；权限码、个人或组织钱包归属按真实服务契约，不自创公共权限码。只启用购买不隐含充值、提现、转账、退款或后台商品管理。

业务类型与选择事实统一遵循 [Web 类型与可选能力](../web-design-prototype/references/prd-outline.md#web-类型与可选能力)，不建立第二份模式或开关记录。

## 按请求渐进执行

通用流程读取本 Skill 时，仅补充当前阶段的领域合同与检查项，随后返回调用方，不反向重复启动定义、原型、实施或接入流程。发现真实范围变化时，将差异交回当前编排入口处理。

缺项按工程规则“渐进式交互引导”逐项补问，每轮优先一个关键问题并给可靠建议与理由。尚未选择时可问“是否启用商品购买？建议/默认关闭，需要销售能力时再明确开启”；不把默认值或沉默当启用。接口核对委托 `$web-review-api-contract`，只覆盖本次操作及最小依赖链，不要求一次提供全套购买接口；金额、支付幂等和钱包归属必须有真实服务契约。

1. 先识别源/下游、模式、启用事实与本次范围。源中仅维护通用资源；下游需求/SOP 读取 [requirements-and-sop.md](references/requirements-and-sop.md)。首次采用、启停选择变化或购买范围变化时，经 `$web-define-product` 更新唯一 PRD，不复制第二份规格；日常修复与范围未变的 HTTP 迁移复用已有 PRD，不重新询问购买选择。
2. 设计读取 [neutral-ui-design.md](references/neutral-ui-design.md) 与当前 `docs/MANTINE_UI_GUIDELINES.md`；可打开 [离线中性设计参考](assets/commerce-reference.html)。参考含明确标记的示例交互，不是服务、产品路由或已选原型；真实下游按通用原型触发条件使用 `$web-design-prototype`。已有有效选择且范围未变时复用，由调用方检查有效性。
3. 实施前完整读取 [order-and-wallet-contract.md](references/order-and-wallet-contract.md)、现行数据规则和 SaaS 认证会话合同；查阅 [基础 API 的客户端关联与缺口](../../../docs/API.md#客户端契约缺口)，再核对真实分类、商品、报价、订单、支付与钱包契约。已收录 API 仅有认证/账号自服务，profile 不覆盖钱包、订单或购买权益刷新。不从参考字段猜 endpoint；尚无服务时只 Mock 远端边界，保持本地功能与认证隔离真实实现。
4. **支付方式由服务端提供，当前仅实现钱包支付**；空列表或不支持的方式不可伪造为可支付。确认购买先创建服务端订单，再对该订单发起支付；金额与支付结果以服务端为准，客户端不直接扣减余额。
5. **结果未知时先查询，不自动重放创建订单或支付**。未完成订单只有服务端判定可支付时才复用原订单继续支付；支付中、已支付、关闭或过期不可再次扣款。**服务端确认支付成功后刷新订单、钱包和当前账户数据**；读取刷新失败保留已支付结果，只重试读取。
6. 实施复用 `$web-implement-change`、既有 HTTP/Router/Query/Mantine/i18next。订单与流水列表按 `$web-implement-list-view`；真实接入按 `$web-connect-http-service`。按功能拆分 `catalog`、`checkout`、`orders`、`wallet`，域 API 留在 `src/data/api/`，不新增第二套 client 或共享 core。
7. 依据本次范围验证参考中的验收场景；文档用逐项对照，代码用相关非空测试。真实付费、生产账户和扣款没有因编写 Skill 或运行演示获得授权；不自动构建、发布或运行正式候选验收。

权限入口实现委托 `$web-implement-access-control`；重复提交、未知结果与并发恢复委托 `$web-implement-write-recovery`，具体订单允许状态、钱包资金及服务审计仍归本领域合同。仅在实施阶段命中对应变化时调用，需求或原型阶段不因此修改代码。

## 完成输出

报告启用依据、模式与作用域、页面/SOP、服务契约待定项、状态恢复和账户刷新行为、实际检查与未验证项。区分参考设计、Mock 与真实支付，不把离线演示或规范编写称为购买功能已上线。
