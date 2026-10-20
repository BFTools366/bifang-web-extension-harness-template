---
name: workspace-implement-feature
description: 在 Workspace 按已确认需求协调前端、Go 服务、接口契约与真实联调；已有服务只消费其可信契约，自建服务完成两端实现。
---

# Web Harness：协作实施完整功能

读取 .harness/workspace.json 与唯一 PRD，只展开本次具体操作。已有服务要求 BaseURL 和对应 endpoint/SDL/认证契约；缺合同先补真实资料，不能猜接口。自建服务按领域委托以下 Skill：users、organizations、permissions、catalog、orders、wallet、audit（完整名称均为 workspace-implement-前缀）。

固定交接内容：当前操作、根目录、前端成员、服务归属、可信契约、写入所有权、最小依赖、未决项、真实验证。领域叶子完成后返回此处，不重启初始化、产品定义或设计问卷。前端设计仍由 web-design-prototype 拥有，创建授权按既有合同复用。

协作顺序：明确业务与验收 → 后端实体/事务/服务 → HTTP/GraphQL 合同 → 前端 typed adapter/UI/Query → 真实本地联调。独立只读分析可并行；写入并行仍服从根策略。每个阶段必须返回实际路径、契约及测试；有失败继续原范围修复。

应用装配器只接收 dataMode=adapter 和真实 adapters；未选能力不生成页面、表或路由，不使用 fixtures 作为产品数据。对自建服务不得让用户另外提供后端问卷或手工把两端连起来。测试替身仅留在测试中。服务不可达显示真实失败，不回落 Mock。

成员范围严格来自 Workspace：纯 Server 只完成后端、接口及实际 HTTP/持久化验证，不生成前端或索要 UI 表单；存在所选前端成员时完成这些成员的真实消费端与联调。
