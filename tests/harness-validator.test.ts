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
    expect(report.skills).toHaveLength(14)
  })

  test("rejects a template missing the canonical data-access knowledge", async () => {
    const targetRoot = await copyRepository()
    await rm(path.join(targetRoot, "docs/DATA_ACCESS.md"))

    await expect(validateHarness(targetRoot)).rejects.toThrow(
      /Missing required file: docs\/DATA_ACCESS\.md/
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
