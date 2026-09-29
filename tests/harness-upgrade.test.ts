import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"
import { HARNESS_ONLY_PATHS } from "../.harness/tooling/config.ts"
import {
  applyUpgradePath,
  createUpgradePlan,
  recordUpgradeBaseline,
  writeUpgradePlan
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"
import {
  captureStablePath,
  runBoundAtomicMutation
} from "../.agents/skills/web-upgrade-harness/scripts/upgrade-mutation.ts"
import { MINIMUM_OWNERSHIP_RULES } from "../.agents/skills/web-upgrade-harness/scripts/upgrade-policy.ts"
import { runUpgradeCli } from "../.agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
import { createSymlinkOrSkip } from "./setup.ts"

/** 保存测试使用的异步无 Shell 进程入口。 */
const execFileAsync = promisify(execFile)
/** 保存需要回收的临时目录。 */
const temporaryRoots: string[] = []
/** 保存生产所有权清单的精确位置。 */
const ownershipPath = path.resolve(
  ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
)
/** 保存必须由真实进程验证 stdout 契约的升级 CLI。 */
const upgradeCliPath = path.resolve(".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts")

/** 计算测试载荷的稳定 SHA-256。 */
function digest(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex")
}

/** 描述一个可升级下游的隔离测试目录。 */
interface UpgradeFixture {
  /** 保存 clean 源 Harness Git 根。 */
  source: string
  /** 保存针对目标渲染的候选树。 */
  candidate: string
  /** 保存已初始化目标 Git 根。 */
  target: string
  /** 保存受保护上游基线路径。 */
  lock: string
  /** 保存目标仓库内唯一受信任的所有权清单。 */
  ownership: string
  /** 保存源 HEAD。 */
  sourceCommit: string
  /** 保存计划文件的源外父目录。 */
  evidence: string
}

/** 在指定仓库运行 Git。 */
async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

/** 写入测试候选与目标共享的最小工程文件。 */
async function writeProjectFiles(root: string, managed = "baseline\n"): Promise<void> {
  await mkdir(path.join(root, ".harness/tooling"), { recursive: true })
  await writeFile(path.join(root, "AGENTS.md"), "# Agent\n")
  await writeFile(path.join(root, "README.md"), "# Project\n")
  await writeFile(path.join(root, "package.json"), '{"name":"fixture"}\n')
  await writeFile(path.join(root, ".harness/tooling/comment-policy.ts"), managed)
}

/** 建立源、候选、目标与证据四个互不嵌套的根。 */
async function upgradeFixture(): Promise<UpgradeFixture> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "web-harness-upgrade-"))
  temporaryRoots.push(parent)
  const source = path.join(parent, "source")
  const candidate = path.join(parent, "candidate")
  const target = path.join(parent, "target")
  const evidence = path.join(parent, "evidence")
  await Promise.all([source, candidate, target, evidence].map((directory) => mkdir(directory)))
  await git(source, ["init", "-b", "main"])
  await git(source, ["config", "--local", "user.name", "Harness Source"])
  await git(source, ["config", "--local", "user.email", "source@example.com"])
  await writeFile(path.join(source, "Version.md"), "当前版本：`202609090101`\n")
  await git(source, ["add", "Version.md"])
  await git(source, ["commit", "-m", "test: source baseline"])
  await Promise.all([writeProjectFiles(candidate), writeProjectFiles(target)])
  const relativeOwnership = ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
  const targetOwnership = path.join(target, relativeOwnership)
  const candidateOwnership = path.join(candidate, relativeOwnership)
  await Promise.all([
    mkdir(path.dirname(targetOwnership), { recursive: true }),
    mkdir(path.dirname(candidateOwnership), { recursive: true })
  ])
  await Promise.all([
    copyFile(ownershipPath, targetOwnership),
    copyFile(ownershipPath, candidateOwnership)
  ])
  await writeFile(path.join(target, ".harness/project.json"), '{"projectType":"web"}\n')
  await git(target, ["init", "-b", "main"])
  await git(target, ["config", "--local", "user.name", "Target Owner"])
  await git(target, ["config", "--local", "user.email", "target@example.com"])
  await git(target, ["add", "."])
  await git(target, ["commit", "-m", "test: target baseline"])
  return {
    source,
    candidate,
    target,
    lock: path.join(target, ".harness/upstream-lock.json"),
    ownership: targetOwnership,
    sourceCommit: await git(source, ["rev-parse", "HEAD"]),
    evidence
  }
}

/** 生成绑定 fixture 当前事实的计划。 */
async function planFor(fixture: UpgradeFixture) {
  return createUpgradePlan({
    sourceRoot: fixture.source,
    sourceVersion: "202609090101",
    sourceCommit: fixture.sourceCommit,
    candidateRoot: fixture.candidate,
    targetRoot: fixture.target,
    ownershipPath: fixture.ownership,
    lockPath: fixture.lock
  })
}

/** 写入一个全新计划证据文件并返回路径。 */
async function persistPlan(fixture: UpgradeFixture, name: string): Promise<string> {
  const filePath = path.join(fixture.evidence, `${name}.json`)
  await writeUpgradePlan(await planFor(fixture), filePath)
  return filePath
}

/** 生成 plan CLI 共享的严格参数，输出路径保持可选。 */
function planCliArguments(fixture: UpgradeFixture, output?: string): string[] {
  const argumentsList = [
    "plan",
    "--source-root",
    fixture.source,
    "--source-version",
    "202609090101",
    "--source-commit",
    fixture.sourceCommit,
    "--candidate-root",
    fixture.candidate,
    "--target-root",
    fixture.target,
    "--ownership",
    fixture.ownership,
    "--lock",
    fixture.lock
  ]
  if (output !== undefined) argumentsList.push("--output", output)
  return argumentsList
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("three-way Harness upgrade", () => {
  /** 验证 bootstrap、单路径 managed 更新、重规划和基线记录闭环。 */
  test("applies one reviewed managed update and records a converged baseline", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    const updatePlan = await persistPlan(fixture, "update")

    await expect(
      applyUpgradePath({
        planPath: updatePlan,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).resolves.toMatchObject({ classification: "update", ownership: "managed" })
    expect(
      await readFile(path.join(fixture.target, ".harness/tooling/comment-policy.ts"), "utf8")
    ).toBe("upstream update\n")

    const convergedPlan = await persistPlan(fixture, "converged")
    await expect(
      recordUpgradeBaseline({
        planPath: convergedPlan,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: []
      })
    ).resolves.toMatchObject({ sourceCommit: fixture.sourceCommit })
  })

  /** 验证 mixed 路径允许显式人工收敛，但不会自动覆盖目标内容。 */
  test("records an explicitly reviewed target-specific manual merge", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(path.join(fixture.candidate, "README.md"), "# Upstream contract\n")
    await writeFile(path.join(fixture.target, "README.md"), "# Product plus upstream contract\n")
    const manualPlan = await planFor(fixture)
    expect(manualPlan.entries.find((entry) => entry.path === "README.md")).toMatchObject({
      classification: "manual_merge",
      ownership: "merge-sections"
    })
    expect(manualPlan).toMatchObject({
      blocked: false,
      manualRequired: true,
      problems: []
    })
    const planPath = path.join(fixture.evidence, "manual.json")
    await writeUpgradePlan(manualPlan, planPath)

    await expect(
      recordUpgradeBaseline({
        planPath,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: ["README.md"]
      })
    ).resolves.toBeDefined()
    expect(await readFile(path.join(fixture.target, "README.md"), "utf8")).toBe(
      "# Product plus upstream contract\n"
    )
  })

  /** 验证 tombstone 或缺失 required 候选会阻断任何自动应用。 */
  test("blocks tombstones and missing required candidate files", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    await mkdir(path.join(fixture.target, "scripts"))
    await writeFile(path.join(fixture.target, "scripts/instantiate.ts"), "forbidden\n")
    await rm(path.join(fixture.candidate, "package.json"))
    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "package.json", classification: "blocked" }),
        expect.objectContaining({ path: "scripts/instantiate.ts", classification: "blocked" })
      ])
    )
    expect(plan).toMatchObject({
      blocked: true,
      manualRequired: false,
      problems: expect.arrayContaining([
        expect.stringMatching(/^package\.json: /),
        expect.stringMatching(/^scripts\/instantiate\.ts: /)
      ])
    })
    const planPath = path.join(fixture.evidence, "blocked.json")
    await writeUpgradePlan(plan, planPath)

    await expect(
      applyUpgradePath({
        planPath,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/blocked by/)
  })

  /** 验证计划 JSON 或候选事实漂移后不会发生路径写入。 */
  test("rejects stale or tampered plan evidence", async () => {
    const fixture = await upgradeFixture()
    const planPath = await persistPlan(fixture, "stale")
    await writeFile(path.join(fixture.candidate, "AGENTS.md"), "# Changed after plan\n")

    await expect(
      recordUpgradeBaseline({
        planPath,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: true,
        approval: "bootstrap-verified-baseline",
        resolvedManual: []
      })
    ).rejects.toThrow(/facts have drifted/)
  })

  /** 验证计划绑定 lock 原始字节，拒绝仅篡改其元数据后继续写入。 */
  test("rejects upstream lock metadata drift after planning", async () => {
    const fixture = await upgradeFixture()
    const bootstrapPlan = await persistPlan(fixture, "bootstrap-lock")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    await writeFile(
      path.join(fixture.candidate, ".harness/tooling/comment-policy.ts"),
      "upstream update\n"
    )
    const updatePlan = await persistPlan(fixture, "lock-bound-update")
    // 保存 lock 变量供只改 provenance、保留逐路径双基线使用。
    const lock = JSON.parse(await readFile(fixture.lock, "utf8")) as Record<string, unknown>
    lock.sourceCommit = "0".repeat(40)
    await writeFile(fixture.lock, `${JSON.stringify(lock, null, 2)}\n`)

    await expect(
      applyUpgradePath({
        planPath: updatePlan,
        path: ".harness/tooling/comment-policy.ts",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/facts have drifted/)
    await expect(
      recordUpgradeBaseline({
        planPath: updatePlan,
        sourceVersion: "202609090101",
        sourceCommit: fixture.sourceCommit,
        bootstrap: false,
        approval: "record-verified-baseline",
        resolvedManual: []
      })
    ).rejects.toThrow(/facts have drifted/)
  })

  /** 验证以符号链接伪装的 tombstone 目录根仍会阻断计划。 */
  test("blocks a tombstoned directory root represented by a symlink", async (context) => {
    const fixture = await upgradeFixture()
    const tombstoneRoot = path.join(fixture.target, ".agents/skills/web-instantiate-project")
    await mkdir(path.dirname(tombstoneRoot), { recursive: true })
    await createSymlinkOrSkip(context, fixture.evidence, tombstoneRoot, "dir")

    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".agents/skills/web-instantiate-project",
          ownership: "tombstone",
          classification: "blocked"
        })
      ])
    )
  })

  /** 验证关键 managed source helper 在候选中缺失或陈旧时均失败关闭。 */
  test("blocks missing or stale required managed source propagation", async () => {
    const fixture = await upgradeFixture()
    const requiredPath = ".harness/tooling/project-memory.ts"
    await mkdir(path.dirname(path.join(fixture.source, requiredPath)), { recursive: true })
    await writeFile(path.join(fixture.source, requiredPath), "source contract\n")
    await git(fixture.source, ["add", requiredPath])
    await git(fixture.source, ["commit", "-m", "test: add required managed source"])
    fixture.sourceCommit = await git(fixture.source, ["rev-parse", "HEAD"])

    const missingPlan = await planFor(fixture)
    expect(missingPlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: requiredPath,
          classification: "blocked",
          reason: "candidate does not exactly propagate required source file"
        })
      ])
    )

    await writeFile(path.join(fixture.candidate, requiredPath), "stale candidate\n")
    const stalePlan = await planFor(fixture)
    expect(stalePlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: requiredPath, classification: "blocked" })
      ])
    )
  })

  /** 验证未命中显式规则的候选路径按 defaultMode 失败关闭。 */
  test("treats unmatched candidate paths as protected blockers", async () => {
    const fixture = await upgradeFixture()
    await writeFile(path.join(fixture.candidate, "unowned.txt"), "must not propagate\n")

    const plan = await planFor(fixture)
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "unowned.txt",
          ownership: "protected",
          classification: "blocked",
          reason: "candidate path has no ownership rule"
        })
      ])
    )
    // 保存 manifest 变量供复核混合文档与默认保护契约。
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      defaultMode: string
      rules: Array<{ pattern: string; mode: string }>
    }
    expect(manifest.defaultMode).toBe("protected")
    expect(manifest.rules).toEqual(
      expect.arrayContaining([
        { pattern: "docs/DATA_ACCESS.md", mode: "merge-sections" },
        { pattern: "docs/ENGINEERING_RULES.md", mode: "merge-sections" },
        { pattern: "docs/MANTINE_UI_GUIDELINES.md", mode: "merge-sections" },
        { pattern: "docs/RELEASE.md", mode: "merge-sections" },
        { pattern: "docs/RUNTIME_CONFIGURATION.md", mode: "merge-sections" }
      ])
    )
  })

  /** 验证 source-only 清单、最低规则与生产所有权清单保持一致。 */
  test("keeps every source-only path tombstoned in both ownership policies", async () => {
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      rules: Array<{ pattern: string; mode: string }>
    }
    const manifestTombstones = new Set(
      manifest.rules.filter((rule) => rule.mode === "tombstone").map((rule) => rule.pattern)
    )
    const minimumTombstones = new Set(
      Object.entries(MINIMUM_OWNERSHIP_RULES)
        .filter(([, mode]) => mode === "tombstone")
        .map(([pattern]) => pattern)
    )

    expect(manifestTombstones).toEqual(minimumTombstones)
    for (const sourceOnlyPath of HARNESS_ONLY_PATHS) {
      const matchingPatterns = [sourceOnlyPath, `${sourceOnlyPath}/**`].filter((pattern) =>
        minimumTombstones.has(pattern)
      )
      expect(matchingPatterns, `${sourceOnlyPath} must have one tombstone rule`).toHaveLength(1)
    }
    for (const protectedConfiguration of [
      ".harness/project-memory-compatibility.json",
      ".harness/release-policy.json"
    ]) {
      expect(MINIMUM_OWNERSHIP_RULES[protectedConfiguration]).toBe("protected")
      expect(manifest.rules).toContainEqual({
        pattern: protectedConfiguration,
        mode: "protected"
      })
    }
    for (const productExtensibleDocument of [
      "docs/DATA_ACCESS.md",
      "docs/MANTINE_UI_GUIDELINES.md",
      "docs/RUNTIME_CONFIGURATION.md"
    ]) {
      expect(MINIMUM_OWNERSHIP_RULES[productExtensibleDocument]).toBe("merge-sections")
      expect(manifest.rules).toContainEqual({
        pattern: productExtensibleDocument,
        mode: "merge-sections"
      })
    }
  })

  /** 验证 Web-only 列表页 Skill 通过 conditional 规则参与升级而不弱化宿主边界。 */
  test("keeps the list-view skill conditional in both ownership policies", async () => {
    const conditionalPattern = ".agents/skills/web-implement-list-view/**"
    const manifest = JSON.parse(await readFile(ownershipPath, "utf8")) as {
      rules: Array<{ pattern: string; mode: string }>
    }

    expect(MINIMUM_OWNERSHIP_RULES[conditionalPattern]).toBe("conditional")
    expect(manifest.rules.filter((rule) => rule.pattern === conditionalPattern)).toEqual([
      { pattern: conditionalPattern, mode: "conditional" }
    ])
  })

  /** 验证新增 source-only 墓碑与可选兼容记忆保护规则都会代表性阻断。 */
  test("blocks representative source-only residue and compatibility-file injection", async () => {
    const tombstoneFixture = await upgradeFixture()
    const tombstonedPath = ".harness/tooling/finalize.ts"
    await writeFile(path.join(tombstoneFixture.target, tombstonedPath), "forbidden\n")
    await git(tombstoneFixture.target, ["add", tombstonedPath])
    await git(tombstoneFixture.target, ["commit", "-m", "test: add source-only residue"])

    const tombstonePlan = await planFor(tombstoneFixture)
    expect(tombstonePlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: tombstonedPath,
          ownership: "tombstone",
          classification: "blocked"
        })
      ])
    )

    const protectedFixture = await upgradeFixture()
    const compatibilityPath = ".harness/project-memory-compatibility.json"
    await writeFile(path.join(protectedFixture.target, compatibilityPath), '{"version":1}\n')
    await git(protectedFixture.target, ["add", compatibilityPath])
    await git(protectedFixture.target, ["commit", "-m", "test: add compatibility memory"])
    const preservedPlan = await planFor(protectedFixture)
    expect(preservedPlan.entries.find((entry) => entry.path === compatibilityPath)).toBeUndefined()
    expect(preservedPlan.problems).not.toEqual(
      expect.arrayContaining([expect.stringContaining(compatibilityPath)])
    )

    await writeFile(path.join(protectedFixture.candidate, compatibilityPath), '{"version":2}\n')
    const blockedPlan = await planFor(protectedFixture)
    expect(blockedPlan.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: compatibilityPath,
          ownership: "protected",
          classification: "blocked"
        })
      ])
    )
  })

  /** 验证一个仓库的 helper 或策略不能替另一终端仓库授权升级。 */
  test("binds ownership policy to the exact target repository", async () => {
    const first = await upgradeFixture()
    const second = await upgradeFixture()

    await expect(
      createUpgradePlan({
        sourceRoot: second.source,
        sourceVersion: "202609090101",
        sourceCommit: second.sourceCommit,
        candidateRoot: second.candidate,
        targetRoot: second.target,
        ownershipPath: first.ownership,
        lockPath: second.lock
      })
    ).rejects.toThrow(/Ownership manifest must equal/)
    await expect(
      createUpgradePlan({
        sourceRoot: second.source,
        sourceVersion: "202609090101",
        sourceCommit: second.sourceCommit,
        candidateRoot: second.candidate,
        targetRoot: second.target,
        ownershipPath: second.ownership,
        lockPath: first.lock
      })
    ).rejects.toThrow(/Upstream lock must equal/)
  })

  /** 验证前置宽规则或局部规则不能遮蔽 protected、tombstone 或 managed-self 下限。 */
  test("rejects broad and partial rules that shadow minimum ownership semantics", async () => {
    for (const shadowingRule of [
      { pattern: "**", mode: "managed" },
      { pattern: ".agents/skills/**", mode: "managed" },
      { pattern: "src/private/**", mode: "managed" },
      { pattern: ".agents/skills/web-instantiate-project/private/**", mode: "managed" },
      { pattern: ".agents/skills/web-upgrade-harness/private/**", mode: "protected" }
    ]) {
      const fixture = await upgradeFixture()
      const manifest = JSON.parse(await readFile(fixture.ownership, "utf8")) as {
        rules: Array<{ pattern: string; mode: string }>
      }
      manifest.rules.unshift(shadowingRule)
      await writeFile(fixture.ownership, `${JSON.stringify(manifest, null, 2)}\n`)

      await expect(planFor(fixture)).rejects.toThrow(/shadows required rule/)
    }
  })

  /** 验证关键合并文件不能通过删除 required 标记弱化候选完整性。 */
  test("rejects weakened required ownership rules", async () => {
    const fixture = await upgradeFixture()
    const manifest = JSON.parse(await readFile(fixture.ownership, "utf8")) as {
      rules: Array<{ pattern: string; mode: string; required?: boolean }>
    }
    const requiredRule = manifest.rules.find((rule) => rule.pattern === "AGENTS.md")
    expect(requiredRule).toBeDefined()
    delete requiredRule?.required
    await writeFile(fixture.ownership, `${JSON.stringify(manifest, null, 2)}\n`)

    await expect(planFor(fixture)).rejects.toThrow(/AGENTS\.md must set required=true/)
  })

  /** 验证父目录在捕获后被替换为符号链接时不会写入攻击者目录。 */
  test("binds atomic mutation to the captured parent inode", async (context) => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "web-upgrade-parent-"))
    temporaryRoots.push(parent)
    const stable = path.join(parent, "stable")
    const displaced = path.join(parent, "displaced")
    const attacker = path.join(parent, "attacker")
    await Promise.all([mkdir(stable), mkdir(attacker)])
    const target = path.join(stable, "managed.ts")
    const original = Buffer.from("original\n")
    await writeFile(target, original)
    const identity = await captureStablePath(parent, "stable/managed.ts")
    await rename(stable, displaced)
    await createSymlinkOrSkip(context, attacker, stable, "dir")

    const replacement = Buffer.from("replacement\n")
    expect(() =>
      runBoundAtomicMutation(
        identity,
        replacement,
        { sha256: digest(original), mode: 0o644 },
        0o644,
        digest(replacement)
      )
    ).toThrow(/bound path parent is not a real directory/)
    await expect(readFile(path.join(attacker, "managed.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
    expect(await readFile(path.join(displaced, "managed.ts"), "utf8")).toBe("original\n")
  })

  /** 验证多个 managed-self 按路径稳定更新，且 CLI runner 始终最后。 */
  test("applies managed-self files in stable order with the runner last", async () => {
    const fixture = await upgradeFixture()
    const selfFiles = [
      ".agents/skills/web-upgrade-harness/scripts/a-policy.ts",
      ".agents/skills/web-upgrade-harness/scripts/z-types.ts",
      ".agents/skills/web-upgrade-harness/scripts/harness-upgrade.ts"
    ]
    for (const root of [fixture.candidate, fixture.target]) {
      await mkdir(
        path.dirname(path.join(root, ".agents/skills/web-upgrade-harness/scripts/a-policy.ts")),
        { recursive: true }
      )
      for (const relativePath of selfFiles) {
        await writeFile(path.join(root, relativePath), "baseline\n")
      }
    }
    const bootstrapPlan = await persistPlan(fixture, "self-bootstrap")
    await recordUpgradeBaseline({
      planPath: bootstrapPlan,
      sourceVersion: "202609090101",
      sourceCommit: fixture.sourceCommit,
      bootstrap: true,
      approval: "bootstrap-verified-baseline",
      resolvedManual: []
    })
    for (const relativePath of selfFiles) {
      await writeFile(path.join(fixture.candidate, relativePath), `updated:${relativePath}\n`)
    }

    let currentPlan = await persistPlan(fixture, "self-order-one")
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[2] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/a-policy\.ts before/)
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[1] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/a-policy\.ts before/)
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[0] ?? "",
      approval: "apply-managed-changes"
    })

    currentPlan = await persistPlan(fixture, "self-order-two")
    await expect(
      applyUpgradePath({
        planPath: currentPlan,
        path: selfFiles[2] ?? "",
        approval: "apply-managed-changes"
      })
    ).rejects.toThrow(/z-types\.ts before/)
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[1] ?? "",
      approval: "apply-managed-changes"
    })

    currentPlan = await persistPlan(fixture, "self-order-three")
    await applyUpgradePath({
      planPath: currentPlan,
      path: selfFiles[2] ?? "",
      approval: "apply-managed-changes"
    })
    for (const relativePath of selfFiles) {
      expect(await readFile(path.join(fixture.target, relativePath), "utf8")).toBe(
        `updated:${relativePath}\n`
      )
    }
  })

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

  /** 验证 CLI 计划输出目录不能通过符号链接绕过真实目录检查。 */
  test("rejects a symlinked plan output ancestor", async (context) => {
    const fixture = await upgradeFixture()
    const linkedTarget = path.join(fixture.evidence, "linked-target")
    await createSymlinkOrSkip(context, fixture.target, linkedTarget, "dir")
    await expect(
      runUpgradeCli(planCliArguments(fixture, path.join(linkedTarget, "linked-plan.json")))
    ).rejects.toThrow(/real directory/)
  })
})
