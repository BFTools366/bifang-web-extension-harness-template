import path from "node:path"
import { createLogo, deriveLogoAssets, readLogo } from "./logo.ts"
import {
  MASTER_LOGO_PATH,
  PROJECT_CONFIG_PATH,
  loadProjectConfig,
  normalizeColor
} from "./config.ts"
import { readJson, writeAtomic, writeJsonAtomic } from "./files.ts"
import { updateManifestIdentity } from "./manifest.ts"
import { renderExtensionBrand } from "./templates/extension.ts"
import { renderWebBrand, renderWebIndex } from "./templates/web.ts"
import type { ProjectConfig } from "./types.ts"

export interface BrandRefreshOptions {
  logoPath?: string
  brandColor?: string
}

export function derivedLogoPaths(config: ProjectConfig): string[] {
  return config.projectType === "web"
    ? ["public/logo.png", "public/favicon.png"]
    : ["assets/icon.png"]
}

export async function writeInitialBrandAssets(
  root: string,
  config: ProjectConfig,
  logo: Buffer,
  writeNew: (filePath: string, contents: Uint8Array) => Promise<void>
): Promise<void> {
  await writeNew(path.join(root, MASTER_LOGO_PATH), logo)
  for (const [relativePath, contents] of await deriveLogoAssets(config.projectType, logo)) {
    await writeNew(path.join(root, relativePath), contents)
  }
}

async function synchronizeMetadata(root: string, config: ProjectConfig): Promise<void> {
  const packagePath = path.join(root, "package.json")
  const manifest = await readJson<Record<string, unknown>>(packagePath)
  await writeJsonAtomic(packagePath, updateManifestIdentity(manifest, config))

  if (config.projectType === "web") {
    await writeAtomic(path.join(root, "index.html"), renderWebIndex(config))
    await writeAtomic(path.join(root, "src/brand.ts"), renderWebBrand(config))
  } else {
    await writeAtomic(path.join(root, "src/brand.ts"), renderExtensionBrand(config))
  }
}

export async function refreshBrand(
  root: string,
  options: BrandRefreshOptions = {}
): Promise<ProjectConfig> {
  const current = await loadProjectConfig(root)
  const color =
    options.brandColor === undefined
      ? current.brand.primaryColor
      : normalizeColor(options.brandColor)
  const config: ProjectConfig = {
    ...current,
    brand: {
      ...current.brand,
      primaryColor: color,
      logoSource: options.logoPath === undefined ? current.brand.logoSource : "uploaded"
    }
  }

  const shouldRegenerate = options.logoPath !== undefined || config.brand.logoSource === "generated"
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  const logo = shouldRegenerate
    ? await createLogo({
        root,
        name: config.name,
        id: config.id,
        color,
        logoPath: options.logoPath
      })
    : await readLogo(masterPath)

  await writeAtomic(masterPath, logo)
  for (const [relativePath, contents] of await deriveLogoAssets(config.projectType, logo)) {
    await writeAtomic(path.join(root, relativePath), contents)
  }
  await writeJsonAtomic(path.join(root, PROJECT_CONFIG_PATH), config)
  await synchronizeMetadata(root, config)
  return config
}
