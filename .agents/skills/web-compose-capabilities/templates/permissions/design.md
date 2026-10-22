# 权限控制固定设计与接线

- 路由/槽位：已选业务路由、导航与元素。
- 固定设计：已识别且无权限的页面使用独立拒绝页；元素缺权限时移除，加载与撤权均不得闪现正文。
- 代码接线：实际 pagePermissions 和 actionPermissions 共用同一个 permissionSession；菜单、路由、页面边界与执行前复核消费同一份权限码；权限来自 API，缺码默认拒绝。
- 主体：启用组织时 PermissionContext.subjectId 为 OrganizationUser.id，组织与账号错配即拒绝；未启用组织时仍可独立按 Account.id 授权。同一 owner 刷新 single-flight，导航取消不影响共享读取，owner 变化取消旧读取。
- 操作边界：当前权限代码依赖基础身份资源，不自动生成组织、角色管理或服务端授权；完整用户信息仍遵循[账号与组织基线](../../knowledge/identity.md#完整用户信息)，不能以代码最小依赖缩减需求。

具体品牌、文字、数据契约和可信权限码消费下游唯一 PRD；不改变固定布局、路由、会话或 API owner。代码资产由[应用装配器](../application/files.ts)按已选操作返回，设计与接线清单见[应用接线合同](../application/wiring.md)。只复制页面或函数不算接入完成，须验证入口、主流程、最高风险失败及依赖未选时的缺席。

完整组织管理采用 [Auth 标准](../../../../../docs/ACCOUNT_OWNERSHIP.md#前后端标准交互与权限表)的三页与 11 码；按钮同时要求所属读取码，role.canManage 仅补充对象保护，不能替代有效权限。本人角色不经客户端重配，候选不泄露完整角色目录。
