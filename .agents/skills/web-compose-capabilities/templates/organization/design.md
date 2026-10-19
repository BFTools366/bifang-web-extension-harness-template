# 组织切换与拥有者管理固定设计

组织对象、Account 与 OrganizationUser 分开。当前组织来自可信成员上下文；组织用户 ID 用于权限、数据归属与审计，不用组织资源或全局账号代替。注册与邀请的生命周期见[组织知识库](../../knowledge/organization.md)，基础切换不自动创建组织。

- organization.switch：账号菜单在不同成员组织数大于 1 时显示切换入口，打开 Modal；当前项禁用，相同目标服务层 no-op。/organization 保留为账号级恢复页，即使业务权限已撤销也能返回有效组织。
- organization.manage：独立选择才有账号菜单和 /organization/manage 页面，检查当前组织用户 owner、拥有者账号、管理页面/动作权限与非阻断状态；member 菜单隐藏，直达与 API 均拒绝。不附带邀请、角色、转移或删除。
- 名称编辑：trim 后 1–60 字、防重复提交、失败保留草稿、成功精确刷新共享上下文；账号或 revision 变化后迟到结果不提示、不导航、不刷新新 scope。

OrganizationContext 为侧栏、菜单、弹窗、恢复和管理页提供同一 Query；scope 与语言进入 key，名称不进入另一份存储。切换期间保留外壳和账号触发器，撤下私有正文与旧弹窗；服务端写入无论成功或响应未知都权威重读并刷新目标权限，无法确认时失败关闭。只读本地资源选择的回滚不能套到服务端转换。

Web 管理页采用 organization_.manage.tsx，独立于没有 Outlet 的 /organization 叶页；Extension 在应用父路由下直接接线。设置从侧栏底部或宿主独立入口进入可返回的全屏页，语言/主题不进入账号菜单。

代码由[应用装配器](../application/files.ts)按已选操作返回，输入及接口见[接线合同](../application/wiring.md)。验证多组织/单组织、同目标零副作用、owner 成功、member 直达与 API 拒绝、撤权恢复、未知结果及迟到隔离；Mock 不证明真实服务授权。
