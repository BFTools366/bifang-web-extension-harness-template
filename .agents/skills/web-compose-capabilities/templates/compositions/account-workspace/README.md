# 账户工作区代码模板

这是显式选择身份 + 组织 + 权限的 Web 组合，不是默认初始化页面或真实服务接入。只有已确认这些操作与持久化方案时才适配；Extension 只能复用独立纯能力代码，不复制 Web Locks、LocalStorage、Router 或页面。

[资产清单](assets.json) 将目标文件映射到唯一模板。`accountWorkspaceFiles(base)` 返回完整文件 Map，替换路由声明；只供隔离新工程和回归使用。已有产品按下面能力边界逐项合并，不直接覆盖其路由。生成路由树必须使用下游 `pnpm routes:generate`。

| 能力/Skill                                              | 唯一实现入口                                                                                                                                  | 回归与适配责任                                                                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份 / web-compose-capabilities                         | [独立协调器](../../identity/session.ts.txt)、[组合协调器](session.ts.txt)                                                                     | 独立协调器不依赖组织/Query；组合协调器拥有 generation、原子保存、迟到隔离及清理，不能充当通用认证默认值                                                                |
| API / web-connect-http-service、web-review-api-contract | [域合同](data/api/auth/contracts.ts.txt)、[原始服务合同](data/api/auth/serviceContract.ts.txt)、[协议适配](data/api/auth/mockProtocol.ts.txt) | [边界回归](data/api/auth/mockBoundary.test.ts.txt)；原始 Header/JSON/DTO 校验先于领域投影，真实接入逐操作替换                                                          |
| Mock / web-implement-change                             | [服务](data/api/auth/mockAuthService.ts.txt)、[后端](data/api/auth/mockAuthBackend.ts.txt)、[客户端](data/api/auth/mockAuthClient.ts.txt)     | [服务回归](data/api/auth/mockFoundation.test.ts.txt)；一个内存所有者、显式共享客户端、时钟/传输注入与 reset，配置地址后失败关闭                                        |
| 存储 / web-implement-browser-storage                    | [Web 适配](data/storage/authSessionStorage.ts.txt)                                                                                            | [存储回归](data/storage/authSessionStorage.test.ts.txt)；随机 revision + 精确 raw + 原生 Web Locks，损坏记录由协调器精确清理                                           |
| 权限 / web-implement-access-control                     | [独立精确判定](../../permissions/capability.ts.txt)、[页面注册](features/auth/access.ts.txt)、[守卫](features/auth/guards.ts.txt)             | [权限回归](features/client/ClientAccess.test.tsx.txt)；菜单、返回目标、标题与深链接共用声明，正文仍需阶段门禁                                                          |
| 组织 / web-compose-capabilities                         | [候选纯计算](../../organization/organizationChoices.ts.txt)、[选择器](features/client/OrganizationSwitcher.tsx.txt)                           | 成员范围属于服务；切换完成前隐藏旧权限，未知结果恢复权威 scope；新注册账号没有演示成员资格                                                                             |
| 写入恢复 / web-implement-write-recovery                 | [协调器](session.ts.txt)、[操作回归](features/auth/sessionOperations.test.ts.txt)                                                             | 未公布签发仅窄处置；退出先本地阻断再有界吊销；找回迟到不可清理新登录；无订单/资金写入实现                                                                              |
| UI / web-implement-change                               | [稳定布局](features/client/ClientLayout.tsx.txt)、[根装配](features/client/ApplicationRoot.tsx.txt)、[表单](features/auth/AuthPage.tsx.txt)   | [导航回归](features/client/ClientNavigation.test.tsx.txt)、[表单回归](features/client/ClientFlows.test.tsx.txt)；私有插槽按阶段/权限挂载，手机导航、焦点和卸载后效受控 |
| i18n / web-extract-i18n-strings                         | [功能资源](i18n/locales/accountWorkspace.ts.txt)、[公开设置](features/client/SettingsPage.tsx.txt)                                            | 使用基线 language/主题存储；语言改变更新标题与无障碍文案，认证页底部导航并保留安全目标，离开清空输入，项目身份来自 BRAND                                               |
| 文档 / web-document-api                                 | [完整中性导出包](api-example/README.md)                                                                                                       | 13个已模拟公开操作；说明未实现HTTP和本地组织扩展，不把模板当作某产品或联调证据                                                                                         |
| 职责 / web-review-module-boundaries                     | [app装配](app/authSession.ts.txt)、[Query观察](features/auth/AuthProvider.tsx.txt)、[Query错误归属](app/queryClient.ts.txt)                   | 一个协调器/QueryClient；Provider纯观察，数据层不依赖Router，局部弹窗状态不复制远端身份                                                                                 |

## 示例合同与生命周期

当前协议来自随 Harness 收录的可选基础服务参考。八个认证 REST、两个系统 REST、GraphQL health/me 与复用这两个根字段的 AccountContext 组合查询，外加独立的本地成员/能力扩展是完整内存 Mock；GraphQL 执行器只支持声明的固定查询面，不是通用 GraphQL server。基础服务 profile 的默认组织与本地成员列表独立，组织切换没有伪造远端 endpoint。新注册账号可认证但没有示例成员资格，显示恢复入口。

固定 demo/test 账号、虚构密码、验证码、workspace/studio 和 test-menu 只属于此示例；实际采用时按可信合同替换。Mock引用是随机 opaque 值，不能由浏览器记录重建授权。新服务、reset或真正页面刷新使旧引用失效；多个客户端只有显式共享服务时可恢复。服务账号、验证码、TokenPair和权限不写入Storage。真实地址已配置但adapter未接入时保持 serviceNotConnected，不回落Mock。

会话协调器保留单一事务所有权，超过500行的部分仍内聚于 generation/Storage/Query 提交边界；拆开会引入跨模块可变状态访问。UI、协议、后端、存储、纯权限与候选计算分别独立，不因该协调器例外将其他职责塞入其中。

## 不适用的能力

商品、订单、钱包、审计保留各自知识和设计模板；当前实现没有这些可执行服务，也没有 SSE/Subscription、IndexedDB、列表分页或发布渠道实现。不要用认证用例冒充资金幂等、事件恢复或双浏览器验证。

模板通过 TypeScript 与非空回归，不等于真实HTTP、跨标签页浏览器或最终产物验收；发布门禁仍由对应 Skill 执行。
