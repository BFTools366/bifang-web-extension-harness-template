import { readFile } from "node:fs/promises"
import path from "node:path"
import { validateOwnershipManifest } from "../../.agents/skills/web-upgrade-harness/scripts/upgrade-core.ts"

/** 在日常 Harness 门禁中复用生产升级器的所有权清单校验。 */
export async function validateUpgradeOwnership(root: string, errors: string[]): Promise<void> {
  const manifestPath = path.join(
    root,
    ".agents/skills/web-upgrade-harness/references/ownership-manifest.json"
  )
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"))
    validateOwnershipManifest(value)
  } catch (error) {
    errors.push(
      `upgrade ownership contract is invalid: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
