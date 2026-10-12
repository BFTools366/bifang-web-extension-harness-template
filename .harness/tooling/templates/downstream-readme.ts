import type { ProjectConfig, WebCreationType } from "../types.ts"

/** 按当前宿主生成终端 README。 */
export function downstreamReadme(config: ProjectConfig, webType?: WebCreationType): string {
  const stack =
    config.projectType === "web"
      ? "React、Vite、Mantine、TanStack Router 文件路由、TanStack Query、Jotai 与 i18next"
      : "Plasmo（Chrome MV3 / Firefox MV2）、React、Mantine、TanStack Router 代码路由、TanStack Query、Jotai 与 i18next"
  const routeCommand =
    config.projectType === "web"
      ? "- `pnpm routes:generate`：重新生成 Git 忽略的 TanStack 路由树。\n"
      : ""
  const versionDescription =
    config.projectType === "web"
      ? "上海时区 `YYMMDDHHMMSS` 版本"
      : "来自 `package.json.version` 的稳定 SemVer（`X.Y.Z`）版本"
  // 保留明确的创建输入；业务范围与后续模式变更仍由唯一 PRD 管理。
  const webCapabilities =
    config.projectType === "web"
      ? `## 创建交接

${webType === undefined ? "未记录创建时的 Web 类型；首次涉及业务类型的需求工作再确认，不从已安装 Skill 推断。" : `创建时明确选择：\`${webType}\`。来源：本次创建输入；初始化时间：${config.initializedAt}。首次需求工作直接复用此选择，不重复询问业务类型。`}

本段只保留初始化输入，不是产品规格；已有已确认 PRD 时，以其当前业务类型与范围为准。切换到本项目后，按 [创建与开发 SOP](.agents/skills/web-design-prototype/references/prd-outline.md#创建与开发-sop) 完成需求确认 → 原型选择 → 实施。初始化未实现登录或管理页面、未接入业务服务。

## Web 业务类型

当前业务类型与可选能力由已确认 PRD 记录，遵循 [Web 类型与可选能力](.agents/skills/web-design-prototype/references/prd-outline.md#web-类型与可选能力)。三种 Web 类型均可创建；创建选择只保留在上面的交接段，不写入身份字段。安装 Skill 不启用功能，也不授予权限。

| 业务类型 | 适用流程 |
| --- | --- |
| \`tool-site\` 工具站点 | 通用产品流程，不自动启用 SaaS 认证或购买。 |
| \`saas-client\` SaaS 客户端 | [认证操作流程](.agents/skills/web-implement-saas-auth/SKILL.md)；[购买操作流程](.agents/skills/web-implement-saas-commerce/SKILL.md)默认关闭，明确选中后才应用。 |
| \`saas-admin\` SaaS 大后台 | [认证操作流程](.agents/skills/web-implement-saas-auth/SKILL.md)不含公开注册或组织切换；[管理操作流程](.agents/skills/web-implement-saas-admin/SKILL.md)仅应用于已授权范围。 |

接入真实服务前读取 [API 关联与契约缺口](docs/API.md#saas-能力与-api-关联)。原型、实施、HTTP 接入与模块文档复用同一 PRD 事实。

`
      : ""
  return `# ${config.name}

${config.description}

本仓库是已生成的平铺单包 **${config.projectType}** 项目。

## 技术基线

${stack}。

生成的 Ky HTTP 与分页基础统一请求头、已校验凭据写入、401/403 处理、本地化路由/UI 反馈、受限 Query 读取、语言持久化和独立列表会话，不虚构业务接口。默认使用 Ky 执行 Fetch 请求；OpenAPI、GraphQL、SSE 与 RxJS 按真实需要接入，详细规则见 \`docs/DATA_ACCESS.md\`。

Mantine 主题、令牌、布局、组件层级、交互状态、响应式、无障碍与当前宿主 UI 规范见 \`docs/MANTINE_UI_GUIDELINES.md\`。外观默认跟随系统，并支持用户明确选择亮色或暗色。

项目级 \`.agents/skills/design-taste-frontend/\` 提供落地页、作品集与视觉改版的可选风格建议；缺失时自动安装，已有有效文件保留。使用前读取 \`docs/MANTINE_UI_GUIDELINES.md\` 的适用边界。产品工作先由 \`$web-define-product\` 在 \`docs/product_spec/\` 澄清并记录 PRD，再由 \`$web-design-prototype\` 展示 2–3 个可交互 HTML 方案；选定具体版本后才由 \`$web-implement-change\` 开发。初始化只分发项目级 Skills，不运行这套流程或创建业务记录。

${webCapabilities}公开 API 操作或行为变化时，使用 [\`$web-document-api\`](.agents/skills/web-document-api/SKILL.md) 同步受影响模块与必要的 \`docs/api/\` 索引。REST 文档依次展示接口名称、接口说明、请求路径、请求方法、请求头、请求与响应数据，JSON 数据使用字段表；GraphQL 文档展示接口名称、接口说明和有来源的 Schema SDL。参考合同与模拟结果不能证明服务端已实现。

按当前事件可独立调用 API 契约/模块边界只读审查，以及访问控制、写入恢复、浏览器存储、持续事件流和用户可见 Task 管理。入口与触发条件见 \`AGENTS.md\` 的 Skills 地图；叶子完成后返回当前流程，不自动追加需求记录、构建或验收。

## 身份与品牌

- \`.harness/project.json\` 是身份与品牌的权威来源。
- \`.harness/brand/logo-1024.png\` 是 Logo 母版。
- 修改项目名称、标识、说明、identityI18n、颜色或 Logo 来源后，运行 \`pnpm harness brand refresh\`。
- 可选 identityI18n 指定 defaultLocale（en 或 zh_CN）及另一语言的翻译；根 name/description 保持默认身份，缺失翻译时回退到根值。
${config.projectType === "extension" ? "- 浏览器身份使用 manifest 的 __MSG_projectName__/__MSG_projectDescription__、显式 default_locale 和根 locales/{en,zh_CN}/messages.json；Plasmo 输出 _locales。Chrome MV3 与 Firefox MV2 都是必需构建/打包目标。manifest 由 Plasmo 动态生成，共享覆盖不固定 manifest_version。后续开发自行处理浏览器 API、权限、消息与后台生命周期差异，见 docs/ENGINEERING_RULES.md。\n" : ""}
- \`.env.development\`、\`.env.test\` 与 \`.env.production\` 是完整受管的公开运行配置，详见 \`docs/RUNTIME_CONFIGURATION.md\`。

## 常用命令

- \`pnpm dev\`：启动开发环境。
${config.projectType === "extension" ? "- `pnpm dev:firefox`：开发 Firefox MV2；构建/打包生成两个浏览器目标。\n" : ""}
${routeCommand}- \`pnpm env:validate\`：校验三份运行配置。
- \`pnpm build\` / \`pnpm build:release\`：唯一正式产物入口；复用本次发布已确认的 E2E 选择，运行环境、Harness、格式、lint、类型与全量测试门禁，将${versionDescription}注入页面并检查产物。非交互运行传入 \`--e2e=enabled|disabled\`。开发和测试环境不生成最终产物。
- \`pnpm release:inspect\`：复查现有正式产物的配置或源码泄漏。
- \`pnpm test\`：运行全量测试。
- \`pnpm test:related <changed-source...>\`：日常运行与改动源码相关的测试。
- \`pnpm lint\` 与 \`pnpm typecheck\`：运行静态检查。
- \`pnpm harness brand refresh\`：从 \`.harness/project.json\` 重新生成品牌资产。
- \`pnpm harness validate\`：校验项目身份、结构与资产。

## 验证范围

日常工作只运行本次所需的相关非空测试或最小替代检查，通常使用 \`pnpm test:related\`；零测试不是通过证据，须回退到所属测试文件。不自动追加格式、lint、类型、全仓检查或构建。行为保持重构运行全量 \`pnpm test\`。最终产物统一经 \`pnpm build\`，该入口已负责环境、Harness、格式、lint、类型、测试与产物检查，不在外层重复运行同一批门禁。
`
}
