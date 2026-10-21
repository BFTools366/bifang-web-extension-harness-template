import type { WorkspaceConfig } from "./workspace.ts"

/** 统一创建与升级时的根命令及工具依赖，不携带产品依赖。 */
export function workspacePackage(config: WorkspaceConfig, source: Record<string, unknown>) {
  const scripts: Record<string, string> = {}
  if (config.members.some((member) => member.type !== "server"))
    scripts["prototype:check"] =
      "tsx .agents/skills/web-design-prototype/scripts/prototype-review.ts check"
  for (const action of ["dev", "test", "typecheck", "lint", "build", "validate"])
    scripts[action] = `node .harness/runtime/workspace.mjs ${action}`
  for (const member of config.members)
    for (const action of ["dev", "test", "build"])
      scripts[`${action}:${member.type}`] =
        `node .harness/runtime/workspace.mjs ${action} --member ${member.type}`
  const dependencies = source.devDependencies as Record<string, string>
  return {
    name: config.id,
    version: "0.1.0",
    private: true,
    type: "module",
    packageManager: source.packageManager,
    engines: source.engines,
    scripts,
    devDependencies: { tsx: dependencies.tsx, sharp: dependencies.sharp }
  }
}

/** 为终端工作区生成协作入口，成员技术文档不成为第二份产品规格。 */
export function workspaceDocuments(config: WorkspaceConfig): Map<string, string> {
  const members = config.members.map((item) => `- ${item.directory}：${item.type}`).join("\n")
  return new Map([
    [
      "docs/README.md",
      "# Workspace 文档\n\n工作区与服务归属见 [WORKSPACE_TEMPLATE.md](WORKSPACE_TEMPLATE.md)，Go 实施见 [GO_SERVICE.md](GO_SERVICE.md)。产品规格统一在根 docs/product_spec，接口与业务说明在根 docs/api；按对应真实事件创建记录。各前端技术规范在对应成员 docs，Go 不套用前端宿主规范。Git、依赖锁、策略与创建需求原文只归根。\n"
    ],
    [
      "AGENTS.md",
      `# Workspace Agent 入口\n\n先读取 .harness/workspace.json、docs/AGENT_POLICY.md 文件头与 docs/WORKSPACE_TEMPLATE.md。此处是唯一 Git 根、策略、产品规格和协作边界，成员 .harness/project.json 仅拥有自己的前端宿主身份。\n\n${members}\n\n按具体需求调用领域 Skill（workspace-implement-users、organizations、permissions、catalog、orders、wallet、audit）。已有服务先核对 docs/api/source-contract.txt 或可信契约；自建服务先实施 Go 契约与业务，再接前端真实 HTTP。产品运行路径不生成 Mock；未接通应明确报错。\n\n前端实现读取相应成员 AGENTS.md、工程规则与 web-implement-change；Go 实现读 docs/GO_SERVICE.md 与 go-implement-service。共用根 docs/product_spec，成员不创建独立 PRD、Git 或任务策略。设计、权限、资金及发布遵循对应现有门禁。此终端工作区不保留工程派生入口。\n`
    ],
    [
      "README.md",
      `# ${config.name}\n\n${members}\n\n从此 Workspace 根运行 \`pnpm dev\` 启动选中成员；\`pnpm dev:web\`、\`pnpm dev:extension\`、\`pnpm dev:server\` 只为存在成员生成。\`pnpm test\`、\`pnpm typecheck\`、\`pnpm lint\` 聚合适用成员；\`pnpm validate\` 校验工作区和成员。\`pnpm build -- --member <web|extension|server> --e2e=<enabled|disabled>\` 显式选择前端候选；Go build 为本地编译，发布仍走对应专用 Skill。\n\n服务来源：${config.service.mode}。开发 BaseURL：${config.service.developmentBaseUrl}。已有服务的 BaseURL 不证明接口可用，需核对真实契约。自建服务使用 Gin、SQLite 和统一 HTTP 协议。首次只生成工程基础，需求所选领域由对应 Skill 完成前端、后端与联调；不使用产品 Mock。\n\n根 package.json 包装成员命令；Go 依赖声明在服务端 go.mod/go.sum。仅根拥有 Git 和 pnpm lock。\n`
    ]
  ])
}
