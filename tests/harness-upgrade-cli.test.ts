import { cp, mkdir, readFile, readdir, realpath, rm, utimes, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  applyUpgradePath,
  recordUpgradeBaseline
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { runUpgradeCli } from "../.agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
import {
  execFileAsync,
  upgradeCliPath,
  upgradeFixture,
  persistPlan,
  planCliArguments,
  planFor
} from "./harness-upgrade-fixture.ts"

/** 验证 upgrade command-line contract 的完整回归场景。 */
describe("upgrade command-line contract", () => {
  /** 验证真实规模的计划与基线超过管道缓冲区后仍能完整读取并继续规划。 */
  test("replans a baseline larger than the child stdout buffer", async () => {
    const fixture = await upgradeFixture()
    const relativeRoot = ".agents/skills/web-define-product/references"
    await Promise.all(
      [fixture.target, fixture.candidate].map(async (root) => {
        const directory = path.join(root, relativeRoot)
        await mkdir(directory, { recursive: true })
        await Promise.all(
          Array.from({ length: 220 }, (_, index) =>
            writeFile(path.join(directory, `contract-${index}.md`), "# Shared contract\n")
          )
        )
      })
    )
    const planPath = await persistPlan(fixture, "large-bootstrap")
    await recordUpgradeBaseline({
      planPath,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    expect((await readFile(fixture.lock)).length).toBeGreaterThan(64 * 1024)
    expect(await planFor(fixture)).toMatchObject({
      bootstrap: false,
      blocked: false,
      manualRequired: false,
      problems: []
    })
  })

  /** 验证 stdout-only 预演不刷新 source/target 索引且保留目标已有修改。 */
  test("previews dirty targets without refreshing either Git index", async () => {
    const fixture = await upgradeFixture()
    await utimes(path.join(fixture.source, "Version.md"), 1, 1)
    await utimes(path.join(fixture.target, "README.md"), 1, 1)
    await writeFile(path.join(fixture.target, "local.txt"), "keep local work\n")
    const indexes = [fixture.source, fixture.target].map((root) => path.join(root, ".git/index"))
    const before = await Promise.all(indexes.map((file) => readFile(file)))
    const planned = await runUpgradeCli(planCliArguments(fixture))
    expect(planned).toMatchObject({
      sourceGit: { status: "" },
      targetGit: { status: "?? local.txt\n" }
    })
    expect(await Promise.all(indexes.map((file) => readFile(file)))).toEqual(before)
    expect(await readFile(path.join(fixture.target, "local.txt"), "utf8")).toBe("keep local work\n")
    expect(await readdir(fixture.evidence)).toEqual([])
  })

  /** 验证新叶子 Skill 到位前不会更新已依赖它的父升级流程。 */
  test("converges new managed skills before updating the parent workflow", async () => {
    const fixture = await upgradeFixture()
    const parentSkill = ".agents/skills/web-upgrade-harness/SKILL.md"
    const previewSkill = ".agents/skills/web-preview-harness-upgrade/SKILL.md"
    for (const root of [fixture.candidate, fixture.target]) {
      await writeFile(path.join(root, parentSkill), "old workflow\n")
    }
    await recordUpgradeBaseline({
      planPath: await persistPlan(fixture, "leaf-bootstrap"),
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(path.join(fixture.candidate, parentSkill), "delegates to preview\n")
    await cp(
      path.resolve(".agents/skills/web-preview-harness-upgrade"),
      path.join(fixture.candidate, ".agents/skills/web-preview-harness-upgrade"),
      { recursive: true }
    )
    await expect(
      applyUpgradePath({
        planPath: await persistPlan(fixture, "leaf-missing"),
        path: parentSkill,
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/managed Skill additions must converge/)
    expect(await readFile(path.join(fixture.target, parentSkill), "utf8")).toBe("old workflow\n")
    await cp(
      path.dirname(path.join(fixture.candidate, previewSkill)),
      path.dirname(path.join(fixture.target, previewSkill)),
      { recursive: true }
    )
    await applyUpgradePath({
      planPath: await persistPlan(fixture, "leaf-present"),
      path: parentSkill,
      approval: "apply-managed-changes"
    })
    expect(await readFile(path.join(fixture.target, parentSkill), "utf8")).toBe(
      "delegates to preview\n"
    )
  })

  /** 验证先升级 planner 后，目标 CLI 仍能与只暴露旧接口的 policy 重规划。 */
  test("restarts the upgraded planner against the legacy policy export surface", async () => {
    const fixture = await upgradeFixture()
    await writeFile(
      path.join(fixture.target, "package.json"),
      '{"name":"fixture","type":"module"}\n'
    )
    const scriptRoot = ".agents/skills/web-upgrade-harness/scripts"
    await cp(path.resolve(scriptRoot), path.join(fixture.target, scriptRoot), { recursive: true })
    await cp(
      path.resolve(".harness/tooling/files.ts"),
      path.join(fixture.target, ".harness/tooling/files.ts")
    )
    const legacyExports = [
      "EXCLUDED_DIRECTORIES",
      "OWNERSHIP_MODES",
      "BLOCKING_UPGRADE_CLASSIFICATIONS",
      "MANUAL_UPGRADE_CLASSIFICATIONS",
      "OWNERSHIP_RELATIVE_PATH",
      "UPSTREAM_LOCK_RELATIVE_PATH",
      "MINIMUM_OWNERSHIP_RULES",
      "MINIMUM_REQUIRED_OWNERSHIP_PATTERNS",
      "REQUIRED_MANAGED_SOURCE_PATHS"
    ]
    const policyUrl = pathToFileURL(path.resolve(scriptRoot, "upgrade-policy.ts")).href
    await writeFile(
      path.join(fixture.target, scriptRoot, "upgrade-policy.ts"),
      `export { ${legacyExports.join(", ")} } from ${JSON.stringify(policyUrl)}\n`
    )
    const executed = spawnSync(
      "pnpm",
      [
        "exec",
        "tsx",
        path.join(fixture.target, scriptRoot, "harness-upgrade.ts"),
        ...planCliArguments(fixture)
      ],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--no-deprecation" }
      }
    )
    expect(executed.status, executed.stderr).toBe(2)
    expect(executed.stderr).toBe("")
    expect(JSON.parse(executed.stdout)).toMatchObject({
      schemaVersion: 2,
      targetRoot: await realpath(fixture.target),
      bootstrap: true
    })
  })
  /** 验证 plan 可只输出稳定 JSON，显式证据则在三棵冻结树外独占创建。 */
  test("exposes an optional-output machine-readable plan CLI", async () => {
    const fixture = await upgradeFixture()
    const cliArguments = planCliArguments(fixture)
    // 保存真实 blocked CLI 失败，验证它仍只把完整计划写入 stdout。
    const blockedExecution = await execFileAsync(
      "pnpm",
      ["exec", "tsx", upgradeCliPath, ...cliArguments],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
        }
      }
    ).then(
      () => {
        throw new Error("blocked plan CLI unexpectedly exited successfully")
      },
      (error: unknown) => error as Error & { code: number; stdout: string; stderr: string }
    )
    expect(blockedExecution.code).toBe(2)
    expect(blockedExecution.stderr).toBe("")
    expect(JSON.parse(blockedExecution.stdout)).toMatchObject({
      schemaVersion: 2,
      bootstrap: true,
      blocked: true,
      manualRequired: false,
      problems: []
    })

    const bootstrapPlan = await persistPlan(fixture, "cli-bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await rm(bootstrapPlan)
    const firstStdout = await execFileAsync(
      "pnpm",
      ["exec", "tsx", upgradeCliPath, ...cliArguments],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
        }
      }
    )
    const secondStdout = await execFileAsync(
      "pnpm",
      ["exec", "tsx", upgradeCliPath, ...cliArguments],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
        }
      }
    )
    expect(firstStdout.stderr).toBe("")
    expect(secondStdout.stderr).toBe("")
    expect(firstStdout.stdout).toBe(secondStdout.stdout)
    expect(firstStdout.stdout.endsWith("\n")).toBe(true)
    expect(firstStdout.stdout.trim()).not.toContain("\n")
    expect(JSON.parse(firstStdout.stdout)).toMatchObject({
      schemaVersion: 2,
      bootstrap: false,
      blocked: false,
      manualRequired: false,
      problems: [],
      lockSnapshot: expect.objectContaining({ sha256: expect.any(String) })
    })
    expect(await readdir(fixture.evidence)).toEqual([])

    const output = path.join(fixture.evidence, "cli-plan.json")
    const withOutput = await execFileAsync(
      "pnpm",
      ["exec", "tsx", upgradeCliPath, ...planCliArguments(fixture, output)],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
        }
      }
    )
    expect(withOutput.stderr).toBe("")
    const stdoutPlan = JSON.parse(withOutput.stdout) as Record<string, unknown>
    expect(stdoutPlan).toMatchObject({
      schemaVersion: 2,
      bootstrap: false,
      blocked: false,
      manualRequired: false,
      problems: [],
      lockSnapshot: expect.objectContaining({ sha256: expect.any(String) }),
      ownershipSnapshot: expect.objectContaining({
        sha256: expect.any(String),
        mode: expect.any(Number)
      })
    })
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(stdoutPlan)
    await expect(runUpgradeCli(planCliArguments(fixture, output))).rejects.toThrow(/already exists/)
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(stdoutPlan)

    for (const root of [fixture.source, fixture.candidate, fixture.target]) {
      const forbiddenOutput = path.join(root, "plan.json")
      await expect(runUpgradeCli(planCliArguments(fixture, forbiddenOutput))).rejects.toThrow(
        /outside source, candidate and target roots/
      )
      await expect(readFile(forbiddenOutput)).rejects.toMatchObject({ code: "ENOENT" })
    }
    await expect(runUpgradeCli(["plan", "--unknown", "value"])).rejects.toThrow(
      /未知或不适用的选项/
    )

    // 保存真实参数失败，验证 stderr 是单个稳定 JSON 且使用同一安全失败码。
    const invalidExecution = await execFileAsync(
      "pnpm",
      ["exec", "tsx", upgradeCliPath, "plan", "--unknown", "value"],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" ")
        }
      }
    ).then(
      () => {
        throw new Error("invalid CLI unexpectedly exited successfully")
      },
      (error: unknown) => error as Error & { code: number; stdout: string; stderr: string }
    )
    expect(invalidExecution.code).toBe(2)
    expect(invalidExecution.stdout).toBe("")
    expect(JSON.parse(invalidExecution.stderr)).toEqual({
      error: "未知或不适用的选项： --unknown",
      ok: false
    })
    // 本场景多次启动真实 CLI，并执行冻结树与 Git 核对，使用有界集成测试预算。
  }, 60_000)
})
