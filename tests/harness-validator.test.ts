import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { validateHarness } from "../scripts/validate-harness.ts"

const temporaryRoots: string[] = []
const repositoryRoot = path.resolve(import.meta.dirname, "..")

async function copyRepository(): Promise<string> {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "web-harness-validator-"))
  temporaryRoots.push(targetRoot)
  await cp(repositoryRoot, targetRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(repositoryRoot, source)
      const topLevel = relative.split(path.sep)[0]
      return topLevel !== ".git" && topLevel !== "node_modules"
    }
  })
  return targetRoot
}

async function updateManifest(
  root: string,
  update: (manifest: Record<string, unknown>) => void
): Promise<void> {
  const manifestPath = path.join(root, "package.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>
  update(manifest)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("Harness template validator", () => {
  test("accepts the complete clean template contract", async () => {
    const report = await validateHarness(repositoryRoot)
    expect(report.skills).toHaveLength(13)
    const verifyDelivery = await readFile(
      path.join(repositoryRoot, ".agents/skills/verify-delivery/SKILL.md"),
      "utf8"
    )
    const verifyDeliveryMetadata = await readFile(
      path.join(repositoryRoot, ".agents/skills/verify-delivery/agents/openai.yaml"),
      "utf8"
    )
    expect(verifyDelivery).toContain("# 验证前端项目交付")
    expect(verifyDelivery).toContain("Extension 候选无论运行时验收使用构建目录还是 zip")
    expect(verifyDelivery).toContain("都必须另运行 `pnpm package`")
    expect(verifyDeliveryMetadata).toContain('display_name: "验证前端项目交付"')
  })

  test("rejects missing, unknown, or invalid Agent Policy fields", async () => {
    const missingRoot = await copyRepository()
    const missingPath = path.join(missingRoot, "docs/AGENT_POLICY.md")
    const missingPolicy = await readFile(missingPath, "utf8")
    await writeFile(missingPath, missingPolicy.replace("standard_work_plan: optional\n", ""))
    await expect(validateHarness(missingRoot)).rejects.toThrow(/is missing standard_work_plan/)

    const invalidRoot = await copyRepository()
    const invalidPath = path.join(invalidRoot, "docs/AGENT_POLICY.md")
    const invalidPolicy = await readFile(invalidPath, "utf8")
    await writeFile(
      invalidPath,
      invalidPolicy.replace("milestone_smoke: optional", "milestone_smoke: automatic")
    )
    await expect(validateHarness(invalidRoot)).rejects.toThrow(/invalid milestone_smoke/)

    const unknownRoot = await copyRepository()
    const unknownPath = path.join(unknownRoot, "docs/AGENT_POLICY.md")
    const unknownPolicy = await readFile(unknownPath, "utf8")
    await writeFile(
      unknownPath,
      unknownPolicy.replace("decision_mode:", "extra_switch: enabled\ndecision_mode:")
    )
    await expect(validateHarness(unknownRoot)).rejects.toThrow(/unknown field: extra_switch/)
  })

  test("rejects restored in-place creation entry points and removed deep gates", async () => {
    const scriptRoot = await copyRepository()
    await updateManifest(scriptRoot, (manifest) => {
      const scripts = manifest.scripts as Record<string, string>
      scripts["harness:init"] = "tsx .harness/tooling/cli.ts init"
    })
    await expect(validateHarness(scriptRoot)).rejects.toThrow(
      /must not expose the in-place harness:init script/
    )

    const cliRoot = await copyRepository()
    const cliPath = path.join(cliRoot, ".harness/tooling/cli.ts")
    const cli = await readFile(cliPath, "utf8")
    await writeFile(
      cliPath,
      cli.replace(
        'if (command === "init") return rejectInPlaceInitialization()',
        'if (command === "init") return'
      )
    )
    await expect(validateHarness(cliRoot)).rejects.toThrow(/Harness CLI is missing/)

    const initializerRoot = await copyRepository()
    const initializerPath = path.join(initializerRoot, ".harness/tooling/init.ts")
    const initializer = await readFile(initializerPath, "utf8")
    await writeFile(
      initializerPath,
      initializer.replace("await assertDownstreamInitializationRoot(root)", "void root")
    )
    await expect(validateHarness(initializerRoot)).rejects.toThrow(
      /Harness initializer is missing await assertDownstreamInitializationRoot\(root\)/
    )
  })

  test("rejects a template missing the canonical data-access knowledge", async () => {
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/DATA_ACCESS.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/DATA_ACCESS\.md/
    )
  })

  test("rejects a template missing the canonical Mantine UI guidelines", async () => {
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/MANTINE_UI_GUIDELINES.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/MANTINE_UI_GUIDELINES\.md/
    )
  })

  test("rejects a template missing a generated data foundation", async () => {
    for (const relativePath of [
      ".harness/tooling/templates/http.ts",
      ".harness/tooling/templates/pagination.ts"
    ]) {
      const targetRoot = await copyRepository()
      await rm(path.join(targetRoot, relativePath))

      await expect(validateHarness(targetRoot)).rejects.toThrow(
        new RegExp(`Missing required file: ${relativePath.replaceAll(".", "\\.")}`)
      )
    }
  })

  test("accepts compatible version declarations above every minimum", async () => {
    const targetRoot = await copyRepository()
    await updateManifest(targetRoot, (manifest) => {
      manifest.packageManager = "pnpm@10.34.0"
      manifest.engines = { node: ">=23.0.0", pnpm: ">=10.34.0" }
      const devDependencies = manifest.devDependencies as Record<string, string>
      devDependencies.typescript = "^6.1.0"
      devDependencies.vitest = "~4.2.0"
      devDependencies.eslint = "11.0.0"
    })

    await expect(validateHarness(targetRoot)).resolves.toMatchObject({ skills: expect.any(Array) })
  })

  test("rejects versions below a minimum and non-exact packageManager ranges", async () => {
    const lowNodeRoot = await copyRepository()
    await updateManifest(lowNodeRoot, (manifest) => {
      manifest.engines = { node: ">=22.22.1", pnpm: ">=10.33.3" }
    })
    await expect(validateHarness(lowNodeRoot)).rejects.toThrow(
      /Node engine minimum must not be lower than 22\.22\.2/
    )

    const rangedPnpmRoot = await copyRepository()
    await updateManifest(rangedPnpmRoot, (manifest) => {
      manifest.packageManager = "pnpm@>=10.33.3"
    })
    await expect(validateHarness(rangedPnpmRoot)).rejects.toThrow(
      /packageManager must be an exact pnpm pin/
    )
  })

  test("requires engines to express an open minimum rather than equality or capped ranges", async () => {
    for (const node of ["22.22.2", "=22.22.2", "^22.22.2", "~22.22.2", ">=22.22.2 <23.0.0"]) {
      const targetRoot = await copyRepository()
      await updateManifest(targetRoot, (manifest) => {
        manifest.engines = { node, pnpm: ">=10.33.3" }
      })
      await expect(validateHarness(targetRoot)).rejects.toThrow(
        /Node engine minimum must not be lower than 22\.22\.2/
      )
    }
  })

  test("rejects prerelease or non-canonical versions and a pin below the declared minimum", async () => {
    const prereleaseRoot = await copyRepository()
    await updateManifest(prereleaseRoot, (manifest) => {
      manifest.engines = { node: ">=23.0.0-beta.1", pnpm: ">=10.33.3" }
    })
    await expect(validateHarness(prereleaseRoot)).rejects.toThrow(/Node engine minimum/)

    const inconsistentPnpmRoot = await copyRepository()
    await updateManifest(inconsistentPnpmRoot, (manifest) => {
      manifest.packageManager = "pnpm@10.33.3"
      manifest.engines = { node: ">=22.22.2", pnpm: ">=10.34.0" }
    })
    await expect(validateHarness(inconsistentPnpmRoot)).rejects.toThrow(
      /packageManager pnpm pin must satisfy engines\.pnpm/
    )
  })
})
