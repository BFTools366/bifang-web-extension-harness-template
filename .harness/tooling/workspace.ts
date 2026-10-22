import { appendFile, cp, mkdir, readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { validateProjectId } from "./initialization-input.ts"
import { renderAgentPolicy } from "./agent-policy.ts"
import { createProjectConfig } from "./config.ts"
import { writeJsonNew, writeNew, writeAtomic } from "./files.ts"
import {
  initializeProject,
  formatInitializationFiles,
  runPostInitialization,
  assertDownstreamInitializationRoot
} from "./init.ts"
import { runCommand } from "./process.ts"
import type { InitOptions, ProjectConfig } from "./types.ts"
import { parseServerMode, type WorkspaceMemberType } from "./workspace-selection.ts"
import { generateGoServer } from "./workspace-server.ts"
import { GO_TRANSPORT_SOURCE, GO_HEALTH_SOURCE } from "./workspace-http.ts"
import { workspaceDocuments, workspacePackage } from "./workspace-documents.ts"
import { validateBaseUrls } from "./environment.ts"
import { httpUiTest } from "./templates/http-ui-test.ts"

/** 描述工作区唯一身份及精确成员，不把前端宿主改为数组。 */
export interface WorkspaceConfig {
  schemaVersion: 1
  kind: "workspace"
  id: string
  name: string
  initializedAt: string
  members: { type: WorkspaceMemberType; directory: string }[]
  service: {
    mode: "existing" | "create" | "none"
    developmentBaseUrl: string
    apiContract?: string
  }
}

/** 写入前解析整个工作区，已有服务不得静默退回本地数据。 */
export function createWorkspaceConfig(options: InitOptions): WorkspaceConfig {
  validateProjectId(options.id)
  const selected = options.workspaceMembers ?? [options.projectType]
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((item) => !["web", "extension", "server"].includes(item))
  ) {
    throw new Error("Workspace 成员必须非空、唯一且属于 web/extension/server")
  }
  const mode = parseServerMode(options.serverMode)
  if (mode !== "create" && selected.includes("server"))
    throw new Error("仅自建服务时可以创建 server 成员")
  if (mode !== "existing" && options.apiContract)
    throw new Error("当前不接入已有服务，请移除旧接口文档")
  if (
    mode === "none" &&
    [options.developmentBaseUrl, options.testBaseUrl, options.releaseBaseUrl].some((url) =>
      url.trim()
    )
  )
    throw new Error("纯本地项目不应配置服务地址")
  if (mode === "existing" && !options.developmentBaseUrl.trim())
    throw new Error("已有服务必须提供 BaseURL")
  if (
    mode === "create" &&
    options.developmentBaseUrl.trim() &&
    options.developmentBaseUrl.trim() !== "http://127.0.0.1:8080"
  )
    throw new Error("自建服务开发地址固定为 http://127.0.0.1:8080；不要同时提供其他服务地址")
  const members = [...selected]
  const urls = validateBaseUrls(options)
  if (mode === "create" && !members.includes("server")) members.push("server")
  return {
    schemaVersion: 1,
    kind: "workspace",
    id: options.id,
    name: options.name,
    initializedAt: new Date().toISOString(),
    members: members.map((type) => ({ type, directory: `${options.id}_${type}` })),
    service: {
      mode,
      developmentBaseUrl: mode === "create" ? "http://127.0.0.1:8080" : urls.developmentBaseUrl,
      ...(options.apiContract ? { apiContract: "docs/api/source-contract.txt" } : {})
    }
  }
}

/** 在同一个受保护 staging 事务内生成成员，统一安装并建立唯一 Git 基线。 */
export async function initializeWorkspace(
  options: InitOptions,
  logo?: Uint8Array,
  commandRunner = runCommand
): Promise<ProjectConfig> {
  const root = options.root
  await assertDownstreamInitializationRoot(root)
  const originalEntries = await readdir(root)
  if (originalEntries.includes(".git"))
    throw new Error("Workspace 内部初始化器只接受未发布 staging，不能覆盖已有仓库")
  for (const identity of [".harness/workspace.json", ".harness/project.json"]) {
    try {
      await readFile(path.join(root, identity))
      throw new Error("不能重复初始化已有工程")
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error
    }
  }
  const workspace = createWorkspaceConfig(options)
  const seedEntries = await readdir(root)
  const rootTooling = new Map<string, string>()
  for (const file of [
    "files.ts",
    "args.ts",
    "logo.ts",
    "types.ts",
    "identity.ts",
    "workspace-context.ts"
  ])
    rootTooling.set(file, await readFile(path.join(root, ".harness/tooling", file), "utf8"))
  const existing = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >
  // 保留源中已审阅的允许与拒绝决定，未知原生脚本不能由工作区重新授权。
  const buildPolicy = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")
  const contract =
    options.apiContractSnapshot?.content ??
    (options.apiContract ? await readFile(options.apiContract, "utf8") : undefined)
  // 所有成员使用同一个已冻结源快照；成员生成不会创建嵌套 Git 或重复安装。
  for (const member of workspace.members.filter((item) => item.type !== "server")) {
    const memberRoot = path.join(root, member.directory)
    await mkdir(memberRoot)
    for (const entry of seedEntries) {
      await cp(path.join(root, entry), path.join(memberRoot, entry), {
        recursive: true,
        errorOnExist: true,
        force: false
      })
    }
    await initializeProject(
      {
        ...options,
        root: memberRoot,
        id: member.directory,
        projectType: member.type as "web" | "extension",
        developmentBaseUrl: workspace.service.developmentBaseUrl,
        skipInstall: true,
        skipGit: true
      },
      logo,
      commandRunner
    )
    if (workspace.service.mode === "create") {
      const runtimePath = path.join(memberRoot, "src/data/api/client/httpRuntime.ts")
      const httpRuntime = await readFile(runtimePath, "utf8")
      await writeAtomic(
        runtimePath,
        'import { requestGoTransport } from "./goTransport"\n' +
          httpRuntime.replace(
            "client ??= createHttpClient({",
            "client ??= createHttpClient({\n    fetch: requestGoTransport,"
          )
      )
      await writeNew(
        path.join(memberRoot, "src/data/api/client/goTransport.ts"),
        GO_TRANSPORT_SOURCE
      )
      await writeNew(path.join(memberRoot, "src/data/api/system.ts"), GO_HEALTH_SOURCE)
      const httpUiPath = "src/data/api/client/httpUi.test.tsx"
      await writeAtomic(
        path.join(memberRoot, httpUiPath),
        httpUiTest(member.type as "web" | "extension", true)
      )
      await formatInitializationFiles(memberRoot, [httpUiPath])
    }
    if (!rootTooling.has("config.ts"))
      rootTooling.set(
        "config.ts",
        await readFile(path.join(memberRoot, ".harness/tooling/config.ts"), "utf8")
      )
    await rm(path.join(memberRoot, ".harness/initial-creation.json"), { force: true })
    await rm(path.join(memberRoot, "docs/requirements"), { recursive: true, force: true })
    // pnpm 只在根管理依赖图；成员不保留第二份锁文件或 workspace 配置。
    await rm(path.join(memberRoot, "pnpm-lock.yaml"), { force: true })
    await rm(path.join(memberRoot, "pnpm-workspace.yaml"), { force: true })
  }
  const server = workspace.members.find((item) => item.type === "server")
  if (server) await generateGoServer(root, server.directory, server.directory)
  const runtime = await readFile(new URL("../runtime/workspace.mjs", import.meta.url), "utf8")
  // 根仅保留协作所需规则和 Skills，创建器及源测试不进入终端工作区。
  const retained = new Set([
    ".agents",
    "docs",
    "LICENSE.en.md",
    "LICENSE.zh-CN.md",
    ".gitignore",
    ".gitattributes"
  ])
  for (const entry of seedEntries)
    if (!retained.has(entry)) await rm(path.join(root, entry), { recursive: true, force: true })
  for (const relative of [
    ".agents/skills/web-instantiate-project",
    ".agents/skills/web-curate-harness-memory",
    "docs/adr",
    "docs/product_spec",
    "docs/project_status",
    "docs/changelog",
    "docs/work_plan",
    "docs/verification"
  ]) {
    await rm(path.join(root, relative), { recursive: true, force: true })
  }
  for (const [file, source] of rootTooling)
    await writeNew(path.join(root, ".harness/tooling", file), source)
  await writeNew(path.join(root, ".harness/runtime/workspace.mjs"), runtime)
  for (const [file, before, after] of [
    [
      "LICENSE.en.md",
      "Applicable Project Name: Bifang Web Harness Template.",
      `Applicable Project Name: ${options.name}.`
    ],
    [
      "LICENSE.zh-CN.md",
      "适用项目名称：Bifang Web Harness Template。",
      `适用项目名称：${options.name}。`
    ]
  ] as const) {
    const license = await readFile(path.join(root, file), "utf8")
    if (license.split(before).length !== 2) throw new Error("无法安全同步 Workspace 许可名称")
    await writeAtomic(path.join(root, file), license.replace(before, after))
  }
  const policyPath = path.join(root, "docs/AGENT_POLICY.md")
  const policy = await readFile(policyPath, "utf8")
  const { writeFile } = await import("node:fs/promises")
  await writeFile(policyPath, renderAgentPolicy(policy, options.agentPolicy))
  await appendFile(
    path.join(root, ".gitignore"),
    server
      ? `\n${server.directory}/data/\n${server.directory}/logs/\n${server.directory}/bin/\n${server.directory}/.harness-server-dev*\n`
      : "\n"
  )
  await writeJsonNew(path.join(root, ".harness/workspace.json"), workspace)
  if (options.initialCreationAuthorization)
    await writeJsonNew(path.join(root, ".harness/initial-creation.json"), {
      schemaVersion: 1,
      projectId: options.id,
      projectType: options.projectType,
      initializedAt: workspace.initializedAt,
      authorization: options.initialCreationAuthorization
    })
  await writeJsonNew(path.join(root, "package.json"), workspacePackage(workspace, existing))
  const jsMembers = workspace.members
    .filter((item) => item.type !== "server")
    .map((item) => `  - ${JSON.stringify(item.directory)}`)
  await writeNew(
    path.join(root, "pnpm-workspace.yaml"),
    `${jsMembers.length ? `packages:\n${jsMembers.join("\n")}\n` : "packages: []\n"}${buildPolicy}`
  )
  for (const [file, source] of workspaceDocuments(workspace)) {
    if (file === "docs/README.md") await writeAtomic(path.join(root, file), source)
    else await writeNew(path.join(root, file), source)
  }
  if (contract !== undefined)
    await writeNew(path.join(root, "docs/api/source-contract.txt"), contract)
  if (server && options.skipInstall !== true)
    await commandRunner("go", ["mod", "download"], path.join(root, server.directory))
  await commandRunner(
    "node",
    [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
    root
  )
  await runPostInitialization(options, commandRunner)
  return { ...createProjectConfig(options), initializedAt: workspace.initializedAt }
}
