import path from "node:path"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { expect, test } from "vitest"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { initializeWorkspace, createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { recommendedAgentPolicy } from "../.harness/tooling/agent-policy.ts"
import { validateEnvironmentFiles } from "../.harness/tooling/environment.ts"
import {
  readFile,
  readdir,
  repositoryRoot,
  temporaryDirectory,
  writeFile
} from "./harness-tooling-support.ts"

/** 纯本地需求真实生成两宿主工程，验证运行和正式环境合同，不产生发布候选。 */
test.each(["web", "extension"] as const)(
  "%s 本地模式不创建服务或要求远端地址",
  async (projectType) => {
    const root = await temporaryDirectory("local-workspace-")
    const target = path.join(root, "local-tool")
    const init = {
      projectType,
      serverMode: "none" as const,
      id: "local-tool",
      name: "Local tool",
      description: "本地文本比较",
      brandColor: "#4C6EF5",
      developmentBaseUrl: "",
      testBaseUrl: "",
      releaseBaseUrl: "",
      agentPolicy: recommendedAgentPolicy("test"),
      skipInstall: true,
      skipGit: true
    }
    await instantiateProject(
      { sourceRoot: repositoryRoot, targetRoot: target, init },
      initializeWorkspace
    )
    const member = path.join(target, `local-tool_${projectType}`)
    const configFile = path.join(target, ".harness/workspace.json")
    const config = JSON.parse(await readFile(configFile, "utf8"))
    const originalConfig = structuredClone(config)
    expect(config.service).toEqual({ mode: "none", developmentBaseUrl: "" })
    expect(config.members).toEqual([{ type: projectType, directory: `local-tool_${projectType}` }])
    expect(await readdir(target)).not.toContain("local-tool_server")
    const manifest = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"))
    expect(manifest.scripts["dev:server"]).toBeUndefined()
    expect(await readdir(path.join(member, "src/data/api/client"))).not.toContain("goTransport.ts")
    expect(await readdir(path.join(member, "src/data/api"))).not.toContain("system.ts")
    const profiles = await validateEnvironmentFiles(member, "release")
    expect(Object.values(profiles).map((profile) => profile.apiBaseUrl)).toEqual(["", "", ""])
    const schema = pathToFileURL(path.join(member, "src/config/environment.schema.ts")).href
    execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict'; const {createAppConfig}=await import(${JSON.stringify(schema)}); const input={appEnv:'release',apiBaseUrl:'',logLevel:'warn',requestTimeoutMs:'10000'}; assert.equal(createAppConfig(input).apiBaseUrl,''); assert.throws(()=>createAppConfig({...input,apiBaseUrl:'https://remote.example.invalid'})); assert.throws(()=>createAppConfig({...input,logLevel:'debug'}));`
    ])
    execFileSync(
      process.execPath,
      [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
      { cwd: target }
    )
    config.service.developmentBaseUrl = "https://unwanted.example.invalid"
    await writeFile(configFile, JSON.stringify(config))
    await expect(validateEnvironmentFiles(member, "release")).rejects.toThrow()
    expect(() =>
      execFileSync(
        process.execPath,
        [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
        { cwd: target, stdio: "pipe" }
      )
    ).toThrow()
    config.service = originalConfig.service
    config.members.push(config.members[0])
    await writeFile(configFile, JSON.stringify(config))
    await expect(validateEnvironmentFiles(member, "release")).rejects.toThrow(/重复/)
    config.members = [
      ...originalConfig.members,
      {
        type: projectType === "web" ? "extension" : "web",
        directory: `local-tool_${projectType === "web" ? "extension" : "web"}`
      }
    ]
    await writeFile(configFile, JSON.stringify(config))
    await expect(validateEnvironmentFiles(member, "release")).rejects.toThrow()
  }
)

/** 纯本地不能携带服务地址、接口契约或服务成员，已有/自建规则继续严格。 */
test("本地服务矛盾在写入前拒绝", () => {
  const options = {
    root: "/unused",
    projectType: "web" as const,
    serverMode: "none" as const,
    name: "Local",
    id: "local",
    description: "Local",
    brandColor: "#4C6EF5",
    developmentBaseUrl: "",
    testBaseUrl: "",
    releaseBaseUrl: "",
    agentPolicy: recommendedAgentPolicy("test")
  }
  for (const patch of [
    { developmentBaseUrl: "https://api.example.invalid" },
    { testBaseUrl: "https://test.example.invalid" },
    { releaseBaseUrl: "https://api.example.invalid" },
    { apiContract: "/old-api.md" },
    { workspaceMembers: ["web", "server"] as const }
  ])
    expect(() => createWorkspaceConfig({ ...options, ...patch })).toThrow()
  expect(() => createWorkspaceConfig({ ...options, serverMode: "existing" })).toThrow()
})
