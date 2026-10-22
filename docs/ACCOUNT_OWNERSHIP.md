# 用户与团队数据归属基线

所有采用用户系统的下游复用本基线。账号是全局身份，团队是共享数据的租户边界，团队成员是授权主体。ToC 默认使用自有团队；ToB 加入团队协作，底层归属不变。纯公开或纯本地项目没有账号需求时不创建这些表。

## 八张核心表与不变量

| 实体 / 表                                         | 固定关系与约束                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Account / accounts                                | 全局登录身份与个人资料；current_organization_id 仅为账号级团队选择偏好，绝不是授权                                |
| Org / orgs                                        | owner_id 唯一；每个有效账号开户时恰好创建一个自有团队                                                             |
| OrganizationUser / organization_users             | 独立成员 ID；(organization_id, account_id) 唯一，(organization_id, id) 复合唯一；有 active/removed 状态与并发版本 |
| Permission / permissions                          | 服务声明的团队动作目录，code 唯一；没有浏览器增添权限码入口                                                       |
| OrganizationRole / organization_roles             | 团队内 RBAC 角色；(organization_id, code) 与 (organization_id, id) 唯一，带保护状态和版本                         |
| RolePermission / role_permissions                 | (role_id, permission_id) 唯一；角色拥有权限，成员没有直接权限表                                                   |
| OrganizationUserRole / organization_user_roles    | (organization_user_id, role_id) 唯一；两条复合外键保证成员和角色属于同一团队                                      |
| OrganizationInvitation / organization_invitations | 团队与受邀账号唯一槽位；绑定邀请人、有效期、状态和签发版本                                                        |

开户在同一事务内创建 Account、自有 Org、owner OrganizationUser、受保护 owner/member 角色、角色权限和 owner 成员角色绑定，失败全部回滚。owner 必须有真实成员和角色绑定。注册、导入和其他开户路径必须复用同一事务规则，不能直接插入孤立账号。本基线没有删除、转让自有团队或创建第二个自有团队的命令；不通过后台脚本绕过这些约束。

加入只增加另一条成员关系，保留自有团队和原有数据，不复制权限。A 与 B 可以互相加入；成员关系不传递。移除成员只撤销该关系及其权限，不删除、转移团队内容，不禁用全局账号。重新加入恢复同一成员身份行并增加版本，旧权限清空，旧授权/移除请求因版本不符而拒绝。

RBAC 固定为“团队成员 → 成员角色 → 团队角色 → 角色权限 → 权限 code”。有效权限取已绑定且有效角色的权限并集。owner 也必须沿这条链取得权限，没有 owner 名称旁路。owner 角色获得服务显式声明的全部团队权限，基础 member 角色只含 team.leave，不赋予业务数据权限。team.manage 等团队管理权限也可以通过自定义角色授予；平台级权限独立于本目录，不存在通配符或默认超级管理员。

有效成员凭真实 team.manage 权限管理本团队角色、角色权限与成员角色分配；创建、修改和分配角色都不得授出操作者自己没有的权限。系统 owner/member 角色不允许编辑、删除或由客户端分配，拥有者成员不能被移除或修改角色绑定；这些是对象保护，不代替 RBAC。自定义角色的代码在团队内唯一且不可改；删除后历史代码不复用。角色权限修改和删除立即影响全部绑定成员，版本防止并发覆盖；删除角色清理绑定并推进受影响成员版本。重新加入仅恢复基础 member 角色，不继承历史业务角色。每团队最多 100 个有效角色（含系统角色），查询和候选范围均有界。

前端页面、导航、按钮和提交前检查只依据服务返回的有效权限 code，禁止按角色名、role === owner 或 ownerAccountId 推导授权。角色名只用于展示及配置；受保护角色、不可移除的拥有者等对象状态来自服务投影。后端每次请求重新计算 RBAC 并校验团队和对象归属，不信任前端角色列表、权限快照或隐藏状态。

## 业务数据必须显式选择归属

| 数据                   | 持久化归属                                                  | 查询与授权                                                                 |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 全局个人资料与登录凭据 | account_id                                                  | 校验认证账号；切换团队不改变个人资料                                       |
| 团队共享资源           | organization_id，Go 嵌入 TeamOwned                          | 先校验当前有效成员与动作权限，再按目标资源的 organization_id 约束查询      |
| 团队内成员私有资源     | organization_id + organization_user_id，Go 嵌入 MemberOwned | 同时校验团队及成员主体；复合外键禁止团队与成员错配，owner 也不绕过私有归属 |
| 操作追溯               | 团队归属 + created_by_organization_user_id 等操作者字段     | 创建者只是审计字段，不能作为共享资源分区键                                 |

订单、钱包等领域必须在其合同中明确采用账号所有、团队共享还是成员私有，不按模块名称推断。已存在的成员 actor 分区测试仅能证明成员隔离，不能当作团队共享证据，也不能静默重解释已有数据。

后端领域仓储必须在实际读写的同一事务内调用 RequireTeamResource，传入认证 account、请求团队、数据库实体真实 organization_id、私有主体（共享为 0）和服务定义的动作码；随后 SQL 继续带团队过滤。不能把请求中的团队 ID 同时当作对象的真实归属，也不能先在独立事务 Require 再无条件写入。集合和 total 均须经过同样的租户过滤。TeamStore.Write 在读取授权前取得 SQLite 写锁，撤权与业务写入串行；使用其他数据库前必须另行落实等效事务锁和迁移，不将当前 SQLite 验证外推。

## 邀请与当前团队

有 team.manage 权限的有效成员按已注册账号邮箱定向邀请，七天有效；同一待接受邀请重复提交返回原邀请。只有绑定账号可接受或拒绝，撤销要求该团队有效成员及 team.manage 权限。接受在同一事务改变邀请状态并建立成员；重复同版接受幂等。过期、已撤销、旧版本和他人接受均不能创建成员。续发增加版本，旧请求不能消费新邀请。为保证恢复上下文有界，每个账号最多 100 个有效团队（含自有团队）。

接受后保持原工作团队，由用户显式切换。当前选择保存在账号，多个设备消费同一偏好；每次读取仍重新验证成员。若当前成员已被移除，权威上下文回落自有团队；缺少自有团队或 owner 成员是数据错误，前端不静默补造。自有 profile 与当前 teamContext 各有明确语义，不能混用。

前端唯一上下文包含 accountId、organizationId、organizationUserId 和代次；完整账号装配提供 currentDataOwnership。Query key 包含实际归属、作用域、语言与条件。切换前取消旧私有查询、阻断写入，恢复新成员与权限后再放行。迟到响应和回调不能写入新作用域。权限快照不持久化，也不是后端授权依据。普通业务 403 不注销全局账号。

## 实际装配入口

1. 工程初始化仍只生成中性服务。首次用户实施执行 go-implement-service/scripts/install-users.ts，自建服务同时装配账号与团队 overlay、八表 RBAC、REST 命令和真实 gqlgen 查询。--check 只生成冻结计划；不写目标或运行生成。真实代码生成在隔离副本完成，通过后复核并写回目标；失败保留原服务。
2. 前端完整用户能力使用 identity.workspace；identity 模块默认选择该操作。identity.session 是明确按操作选择的底层会话 helper，不能单独作为完整用户系统交付。
3. 自建 Go 服务使用 workspace-implement-users/scripts/assemble-account.ts 的 goAccountApplicationFiles(base, options)。调用方提供真实 HomePage、宿主与业务页面/动作权限，helper 固定接通 identity、organization、permissions adapters、协议桥、团队恢复/邀请、角色管理和成员角色分配。注册与验证码仍按真实需求独立启用。
4. 已有服务需提供等效可信合同；不能因为选中 identity.workspace 就推断外部服务已有这些表或接口。已有产品、存量账号与业务数据不自动重装或迁移。

前后端接口字段与操作见 [Go 客户端合同](GO_CLIENT_CONTRACT.md)，生成能力不代表任何具体产品或最终候选已经验收。
