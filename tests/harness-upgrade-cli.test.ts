import { readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { recordUpgradeBaseline } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import { runUpgradeCli } from "../.agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
import {
  execFileAsync,
  upgradeCliPath,
  upgradeFixture,
  persistPlan,
  planCliArguments
} from "./harness-upgrade-fixture.ts"

/** 验证 upgrade command-line contract 的完整回归场景。 */
describe("upgrade command-line contract", () => {
  /** 验证 plan 可只输出稳定 JSON，显式证据则在两棵树外独占创建。 */
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

    const candidateOutput = path.join(fixture.candidate, "candidate-plan.json")
    const targetOutput = path.join(fixture.target, "target-plan.json")
    await expect(runUpgradeCli(planCliArguments(fixture, candidateOutput))).rejects.toThrow(
      /outside candidate and target roots/
    )
    await expect(runUpgradeCli(planCliArguments(fixture, targetOutput))).rejects.toThrow(
      /outside candidate and target roots/
    )
    await expect(readFile(candidateOutput, "utf8")).rejects.toThrow()
    await expect(readFile(targetOutput, "utf8")).rejects.toThrow()
    await expect(runUpgradeCli(["plan", "--unknown", "value"])).rejects.toThrow(/Unexpected option/)

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
      error: "Unexpected option: --unknown",
      ok: false
    })
  }, 20_000)
})
