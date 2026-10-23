# 账户协议与高级操作参考

本目录保留账户服务协议、内存 Mock、精确存储示例和对应行为回归，不再提供第二套应用、会话、设置页或路由装配。当前唯一应用装配使用 [applicationFiles](../../application/files.ts) 和 [接线合同](../../application/wiring.md)。

| 资源                                                                                                        | 内容与适配边界                                                                                         | 执行职责                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [服务合同](data/api/auth/serviceContract.ts.txt)、[域合同](data/api/auth/contracts.ts.txt)                  | 已采用参考协议的字段、TokenPair 与领域结果；真实服务仍逐操作核对                                       | web-review-api-contract 核对，web-connect-http-service 实施真实接入                     |
| [协议适配](data/api/auth/mockProtocol.ts.txt)、[内存服务](data/api/auth/mockAuthService.ts.txt)             | 校验请求/响应、Header、验证码与原始服务状态，地址已配置但未接入时失败关闭                              | web-implement-change 按需适配数据边界                                                   |
| [精确存储](data/storage/authSessionStorage.ts.txt)                                                          | 只适用该 Mock 引用协议；原生 Web Locks、随机 revision、精确 raw 和写后核实，不直接替代字符串凭据适配器 | web-implement-browser-storage 消费既有持久化授权；状态转换归 web-implement-auth-session |
| [协议回归](data/api/auth/mockBoundary.test.ts.txt)、[存储回归](data/storage/authSessionStorage.test.ts.txt) | 保留报文拒绝、用途/期限、重置、迟到结果及存储冲突测试，不证明应用 UI 或真实跨标签页可用                | 当前适配入口运行相关回归                                                                |
| [历史 API 差异包](api-example/README.md)                                                                    | 13 个历史模拟操作；无条件 GraphQL 读取属于协议不符合项，仅供格式及差异评审                             | web-document-api 只参考格式，逐次核对当前真实消费者                                     |

独立会话协调器位于 [身份模板](../../identity/session.ts.txt)，不依赖组织或权限；实际会话状态机实施由 web-implement-auth-session 负责。组织与权限分别消费当前应用的真实作用域和授权；模板资产拥有者与执行入口不混用。

旧注册/找回表单、整套工作区与跨标签页会话协调示例已退役。当前 application 已提供可选邮箱注册及条件验证码，采用共享 AuthLayout 和唯一 session；本目录不恢复旧整应用。找回、刷新及改密的页面仍按已确认服务合同增量适配，不能凭协议参考宣称已接线。

演示账号、密码、验证码、组织及引用均为虚构测试数据。服务状态只能由明确共享的同一 Mock 实例恢复，刷新或重置后旧引用失效；原始 TokenPair 不写 Storage 或日志。协议回归通过不证明真实服务、双浏览器或最终候选验收通过。

数据结构与接口来源对照 [Go 客户端合同](../../../../../../docs/GO_CLIENT_CONTRACT.md)。原始 profile 的 org 允许 null；Workspace 成员扩展必须单独校验。Mock 的演示成员/权限、刷新引用与可控时钟不代表 Go 已实现 RBAC、客户管理或单次刷新轮换。
