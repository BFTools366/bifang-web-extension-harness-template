/** 工作区与 Go 领域能力的唯一发现合同，前端成员同步分发以便回到根协作。 */
export const WORKSPACE_SKILL_CONTRACTS = {
  "workspace-implement-feature": {
    description:
      "在 Workspace 按已确认需求协调前端、Go 服务、接口契约与真实联调；已有服务只消费其可信契约，自建服务完成两端实现。",
    title: "# Web Harness：协作实施完整功能",
    displayName: "Web Harness：协作实施完整功能",
    shortDescription: "在统一工作区内协作实施完整功能，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-feature 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-service": {
    description:
      "在 Workspace 的 _server 成员中实施 Go HTTP 服务与业务，复用 Gin、GORM、真实持久化与既有 HTTP 边界，不运行独立初始化问卷。",
    title: "# Web Harness：实施 Go 服务",
    displayName: "Web Harness：实施 Go 服务",
    shortDescription: "在统一工作区内实施 Go 服务，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-implement-service 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-persistence": {
    description:
      "为 Workspace Go 服务的实际业务实现 GORM 仓储、SQLite 事务或已确认数据库迁移，处理唯一性、租户隔离、并发与失败恢复。",
    title: "# Web Harness：实施 Go 持久化",
    displayName: "Web Harness：实施 Go 持久化",
    shortDescription: "在统一工作区内实施 Go 持久化，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-implement-persistence 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-graphql": {
    description:
      "为带查询条件的远端读取、集合与复杂读取实现 Go GraphQL SDL、resolver 和前端 typed Query，复用领域 service，不以 JSON 列表冒充 GraphQL。",
    title: "# Web Harness：实施 Go 查询契约",
    displayName: "Web Harness：实施 Go 查询契约",
    shortDescription: "在统一工作区内实施 Go 查询契约，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-implement-graphql 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-verification": {
    description:
      "在已确认验证或找回需求中实施验证码生命周期与投递；真实 SMTP 为默认，仅用户明确授权时采用 dev 注册模拟，保留真实校验与单次消费。",
    title: "# Web Harness：实施验证码与投递",
    displayName: "Web Harness：实施验证码与投递",
    shortDescription: "实施验证码生命周期、真实投递及显式授权的开发注册模拟，保留真实校验",
    defaultPrompt:
      "使用 $go-implement-verification 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-file-operations": {
    description:
      "在 Go 服务真正需要读写本地文件或导入导出时实现路径、流式处理、原子写与资源归属，不创建假文件接口或扩张目录授权。",
    title: "# Web Harness：实施 Go 文件操作",
    displayName: "Web Harness：实施 Go 文件操作",
    shortDescription: "在统一工作区内实施 Go 文件操作，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-implement-file-operations 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-implement-external-command": {
    description:
      "在 Go 服务有真实外部工具需求时实现可取消的 exec.CommandContext 调用、参数校验、输出限额与进程回收，不使用字符串 Shell 拼接。",
    title: "# Web Harness：实施 Go 子进程",
    displayName: "Web Harness：实施 Go 子进程",
    shortDescription: "在统一工作区内实施 Go 子进程，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-implement-external-command 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-build-local": {
    description:
      "按当前请求在 Workspace _server 编译本机 Go 开发制品，报告真实二进制和启动方式，不自动形成正式发布、标签或部署。",
    title: "# Web Harness：编译 Go 本地制品",
    displayName: "Web Harness：编译 Go 本地制品",
    shortDescription: "在统一工作区内编译 Go 本地制品，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $go-build-local 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-users": {
    description:
      "在 Workspace 按具体操作完成用户生命周期、注册、登录、刷新、退出、资料与改密的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施用户与会话",
    displayName: "Web Harness：实施用户与会话",
    shortDescription: "在统一工作区内实施用户与会话，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-users 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-organizations": {
    description:
      "在 Workspace 按具体操作完成组织切换、成员管理、邀请、加入与退出的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施组织与成员",
    displayName: "Web Harness：实施组织与成员",
    shortDescription: "在统一工作区内实施组织与成员，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-organizations 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-permissions": {
    description:
      "在 Workspace 按具体操作完成角色维护、服务端授权、有效权限与撤权的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施权限与角色",
    displayName: "Web Harness：实施权限与角色",
    shortDescription: "在统一工作区内实施权限与角色，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-permissions 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-catalog": {
    description:
      "在 Workspace 按具体操作完成商品读取、分类、管理与可售状态的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施商品目录",
    displayName: "Web Harness：实施商品目录",
    shortDescription: "在统一工作区内实施商品目录，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-catalog 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-orders": {
    description:
      "在 Workspace 按具体操作完成订单查询、建单、取消与未知结果恢复的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施订单与恢复",
    displayName: "Web Harness：实施订单与恢复",
    shortDescription: "在统一工作区内实施订单与恢复，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-orders 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-wallet": {
    description:
      "在 Workspace 按具体操作完成余额流水、支付及结果恢复的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施钱包与支付",
    displayName: "Web Harness：实施钱包与支付",
    shortDescription: "在统一工作区内实施钱包与支付，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-wallet 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "workspace-implement-audit": {
    description:
      "在 Workspace 按具体操作完成敏感写入审计、授权查询与保留的前端、Go 后端、接口契约和真实联调；已有服务仅接入可信合同。",
    title: "# Web Harness：实施审计事实",
    displayName: "Web Harness：实施审计事实",
    shortDescription: "在统一工作区内实施审计事实，复用真实服务契约并完成相关实现与验证",
    defaultPrompt:
      "使用 $workspace-implement-audit 完成当前已确认范围，复用 Workspace 真实成员、契约与相关验证，完成后返回调用方。"
  },
  "go-test-service": {
    description:
      "针对 Workspace Go 成员的真实接口、持久化与恢复执行相关行为测试和前后端联调，不把测试替身或开发构建当作发布验收。",
    title: "# Web Harness：验证 Go 服务行为",
    displayName: "Web Harness：验证 Go 服务行为",
    shortDescription: "针对实际服务变化验证 HTTP、数据库、权限与恢复，返回可观察证据",
    defaultPrompt:
      "使用 $go-test-service 验证当前 Go 服务变化的真实成功和风险失败路径，隔离数据库并返回实际证据。"
  }
} as const
