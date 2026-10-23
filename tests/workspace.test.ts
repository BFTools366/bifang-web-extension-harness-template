import { execFileSync, spawn } from "node:child_process"
import { validatePnpmBuildPolicy } from "../.harness/tooling/pnpm-policy.ts"
import {
  prepareUsers,
  installUsers
} from "../.agents/skills/go-implement-service/scripts/install-users.ts"
import { runPrototypeReview } from "../.agents/skills/web-design-prototype/scripts/prototype-review.ts"
import { describe, expect, test } from "vitest"
import { mkdtemp, mkdir, readFile, readdir, rm, realpath, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { instantiateProject } from "../.harness/tooling/instantiate.ts"
import { initializeWorkspace, createWorkspaceConfig } from "../.harness/tooling/workspace.ts"
import { resolveInitOptions } from "../.harness/tooling/cli.ts"
import { parseArgs } from "../.harness/tooling/args.ts"
import { recommendedAgentPolicy } from "../.harness/tooling/agent-policy.ts"
import type { InitOptions } from "../.harness/tooling/types.ts"

/** 在临时目录验证创建结果及内部拓扑，不安装依赖或写入用户项目。 */
describe("workspace creation", () => {
  /** 所有选中组合都在同一事务形成精确成员，并接真实服务配置。 */
  test.each([
    { selected: ["web"] as const, mode: "create" as const, expected: ["web", "server"] },
    {
      selected: ["extension"] as const,
      mode: "create" as const,
      expected: ["extension", "server"]
    },
    { selected: ["web"] as const, mode: "existing" as const, expected: ["web"] },
    { selected: ["extension"] as const, mode: "existing" as const, expected: ["extension"] },
    {
      selected: ["web", "extension"] as const,
      mode: "create" as const,
      expected: ["web", "extension", "server"]
    },
    { selected: ["server"] as const, mode: "create" as const, expected: ["server"] }
  ])(
    "creates $selected with $mode service",
    async ({ selected, mode, expected }) => {
      const parent = await mkdtemp(path.join(os.tmpdir(), "harness-workspace-"))
      const target = path.join(parent, "example")
      const options: Omit<InitOptions, "root"> = {
        projectType: selected[0] === "extension" ? "extension" : "web",
        workspaceMembers: selected,
        serverMode: mode,
        id: "example",
        name: "Example",
        description: "Example application",
        brandColor: "#4C6EF5",
        developmentBaseUrl: mode === "existing" ? " https://API.example.test:443/ " : "",
        testBaseUrl: "",
        releaseBaseUrl: "",
        agentPolicy: recommendedAgentPolicy("test"),
        skipInstall: true,
        skipGit: true
      }
      try {
        await instantiateProject(
          {
            sourceRoot: path.resolve(import.meta.dirname, ".."),
            targetRoot: target,
            init: options
          },
          initializeWorkspace
        )
        const config = JSON.parse(
          await readFile(path.join(target, ".harness/workspace.json"), "utf8")
        )
        expect(config.members.map((item: { type: string }) => item.type)).toEqual(expected)
        expect(config.service.developmentBaseUrl).toBe(
          mode === "existing" ? "https://api.example.test" : "http://127.0.0.1:8080"
        )
        const manifest = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"))
        expect(manifest.scripts["dev:server"] !== undefined).toBe(expected.includes("server"))
        expect(manifest.dependencies).toBeUndefined()
        expect(manifest.scripts.release).toBe("node .harness/runtime/workspace.mjs release")
        for (const member of expected)
          expect(manifest.scripts[`release:${member}`]).toBe(
            `node .harness/runtime/workspace.mjs release --member ${member}`
          )
        expect(await readdir(path.join(target, ".harness/runtime"))).toEqual(
          expect.arrayContaining(["workspace.mjs", "release.mjs", "archive.mjs"])
        )
        const inheritedPolicy = await readFile(path.join(target, "pnpm-workspace.yaml"), "utf8")
        const sourcePolicy = await readFile(
          path.resolve(import.meta.dirname, "../pnpm-workspace.yaml"),
          "utf8"
        )
        expect(inheritedPolicy.endsWith(sourcePolicy)).toBe(true)
        expect(await readdir(path.join(target, ".harness"))).not.toContain("project.json")
        for (const member of expected) {
          const directory = path.join(target, `example_${member}`)
          expect(await readdir(directory)).not.toContain(".git")
          if (member === "server") {
            expect(await readFile(path.join(directory, "go.mod"), "utf8")).toMatch(
              /^module example_server\n/u
            )
            expect(
              await readFile(path.join(directory, "configs/config-dev.yaml"), "utf8")
            ).not.toContain("mock: true")
          } else {
            const identity = JSON.parse(
              await readFile(path.join(directory, ".harness/project.json"), "utf8")
            )
            expect(identity).toMatchObject({ id: `example_${member}`, projectType: member })
            const env = await readFile(path.join(directory, ".env.development"), "utf8")
            expect(env).toContain(config.service.developmentBaseUrl)
            const httpTest = await readFile(
              path.join(directory, "src/data/api/client/httpUi.test.tsx"),
              "utf8"
            )
            if (mode === "create") {
              expect(httpTest).toContain('headers.get("Authorization")).toBe("Bearer new-token")')
              expect(httpTest).toContain("headers.get(HTTP_HEADERS.authToken)).toBeNull()")
            } else {
              expect(httpTest).toContain('headers.get(HTTP_HEADERS.authToken)).toBe("new-token")')
            }
            const errors: string[] = []
            await validatePnpmBuildPolicy(directory, errors)
            expect(errors).toEqual([])
            expect(await readdir(directory)).not.toContain("pnpm-workspace.yaml")
            expect(await readdir(path.join(directory, "tests"))).not.toContain(
              "workspace-release.test.ts"
            )
          }
        }
        expect(await readFile(path.join(target, ".gitattributes"), "utf8")).toContain("eol=lf")
        if (expected.includes("server")) {
          const goMod = path.join(target, "example_server/go.mod")
          await writeFile(goMod, (await readFile(goMod, "utf8")).replaceAll("\n", "\r\n"))
          execFileSync(
            process.execPath,
            [".harness/runtime/workspace.mjs", "validate", "--structure-only"],
            { cwd: target }
          )
          if (selected.length === 1 && selected[0] === "web") {
            const file = path.join(target, "example_server/internal/model/organization_user.go")
            await writeFile(file, "existing product file")
            await expect(prepareUsers(target)).rejects.toThrow("保留已有产品文件")
            expect(await readFile(file, "utf8")).toBe("existing product file")
            await rm(file)
            const verificationConfig = path.join(target, "example_server/configs/config.yaml")
            const originalConfig = await readFile(verificationConfig, "utf8")
            await writeFile(verificationConfig, originalConfig.replaceAll("\n", "\r\n"))
            const verifiedPlan = await prepareUsers(target, [
              "register",
              "login",
              "profile",
              "logout",
              "verification"
            ])
            expect(verifiedPlan.files.get("configs/config.yaml")).toContain("enabled: true")
            expect(verifiedPlan.files.get("configs/config.yaml")).toContain("mock: false")
            expect(verifiedPlan.files.get("configs/config-dev.yaml")).toContain("mock: true")
            expect(verifiedPlan.files.get("internal/model/models.go")).toContain(
              "VerificationDeliveryState"
            )
            expect(verifiedPlan.files.get("internal/service/auth.go")).toContain(
              "apperr.ErrVerificationDisabled"
            )
            expect(await readFile(verificationConfig, "utf8")).toContain("\r\n")
            await writeFile(verificationConfig, originalConfig)
            await installUsers(target)
            await expect(installUsers(target)).rejects.toThrow("保留已有产品文件")
            const routes = await readFile(
              path.join(target, "example_server/internal/api/v1/account.go"),
              "utf8"
            )
            expect(routes).not.toContain('auth.POST("/refresh"')
            expect(routes).toContain('auth.POST("/verification-code"')
            expect(
              await readFile(path.join(target, "example_server/configs/config-dev.yaml"), "utf8")
            ).toContain("mock: true")
            const canonical = await realpath(target)
            const prd = "docs/product_spec/20261020_product_spec.md"
            const prototype = "docs/prototypes/users/v1/prototype.html"
            await mkdir(path.dirname(path.join(target, prototype)), { recursive: true })
            await mkdir(path.dirname(path.join(target, prd)), { recursive: true })
            await writeFile(path.join(target, prd), "# Users\n\n状态：Approved\n\n创建用户。\n")
            await writeFile(
              path.join(target, prototype),
              "<!doctype html><html><title>Users</title><button>Register</button></html>"
            )
            const review = await runPrototypeReview(
              ["prepare", "users", "用户消息：注册", prd, prototype],
              path.join(canonical, "example_web")
            )
            expect(review.projectId).toBe("example")
            expect(
              await readFile(path.join(target, "docs/prototypes/users/review.json"), "utf8")
            ).toContain(review.reviewHash)
            const policy = path.join(target, "pnpm-workspace.yaml")
            await writeFile(
              policy,
              (await readFile(policy, "utf8")).replace(
                '  - "example_web"',
                '  - "unregistered_web"'
              )
            )
            const drift: string[] = []
            await validatePnpmBuildPolicy(path.join(target, "example_web"), drift)
            expect(drift).not.toEqual([])
          }
        }
        if (mode === "existing") {
          const fake = path.join(parent, "fake-pnpm.mjs")
          const ready = path.join(parent, "ready.txt")
          await writeFile(
            fake,
            'import {writeFileSync} from "node:fs"; process.on("SIGTERM",()=>{}); process.on("SIGINT",()=>{}); writeFileSync(process.env.RUNNER_READY,String(process.pid)); setInterval(()=>{},1000)'
          )
          const child = spawn(process.execPath, [".harness/runtime/workspace.mjs", "dev"], {
            cwd: target,
            stdio: "ignore",
            env: { ...process.env, npm_execpath: fake, RUNNER_READY: ready }
          })
          const exited = new Promise<number | null>((resolve) => child.once("exit", resolve))
          let worker: number | undefined
          try {
            for (let attempt = 0; attempt < 100; attempt++) {
              const pid = await readFile(ready, "utf8").catch(() => undefined)
              if (pid) {
                worker = Number(pid)
                break
              }
              await new Promise((resolve) => setTimeout(resolve, 20))
            }
            expect(worker).toBeDefined()
            if (!worker) throw new Error("开发子进程没有启动")
            const workerPid = worker
            child.kill("SIGTERM")
            let deadline: ReturnType<typeof setTimeout> | undefined
            try {
              const code = await Promise.race([
                exited,
                new Promise<never>((_, reject) => {
                  deadline = setTimeout(() => reject(new Error("取消后未回收开发进程")), 6000)
                })
              ])
              expect(code).toBe(143)
            } finally {
              clearTimeout(deadline)
            }
            expect(() => process.kill(workerPid, 0)).toThrow()
          } finally {
            if (child.exitCode === null) child.kill("SIGKILL")
            if (worker) {
              try {
                process.kill(worker, "SIGKILL")
              } catch {
                /* 已由运行器回收。 */
              }
            }
          }
        }
        expect(await readdir(path.join(target, ".agents/skills"))).not.toContain(
          "web-instantiate-project"
        )
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    },
    60000
  )

  /** 已有服务的缺失地址与非法组合在 staging 写入前被拒绝。 */
  test("requires an explicit service source and a BaseURL for an existing service", async () => {
    const argv = ["--type", "web", "--name", "Example", "--policy-mode", "recommended"]
    await expect(
      resolveInitOptions(parseArgs(argv), "/tmp/example", { interactive: false })
    ).rejects.toThrow("服务端")
    await expect(
      resolveInitOptions(parseArgs([...argv, "--server", "existing"]), "/tmp/example", {
        interactive: false
      })
    ).rejects.toThrow("BaseURL")
    const init = await resolveInitOptions(
      parseArgs([...argv, "--server", "create"]),
      "/tmp/example",
      { interactive: false }
    )
    expect(createWorkspaceConfig(init).members.map((member) => member.directory)).toEqual([
      "example_web",
      "example_server"
    ])
  })
})
