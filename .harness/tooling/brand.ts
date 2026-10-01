import path from "node:path"
import { synchronizeIdentityLocales } from "./identity.ts"
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

// 定义 BrandRefreshOptions 接口的结构契约。
export interface BrandRefreshOptions {
  // 描述 logoPath 接口成员的结构契约。
  logoPath?: string
  // 描述 brandColor 接口成员的结构契约。
  brandColor?: string
}

// 执行 derivedLogoPaths 函数的处理逻辑。
export function derivedLogoPaths(config: Pick<ProjectConfig, "projectType">): string[] {
  return config.projectType === "web"
    ? ["public/logo.png", "public/favicon.png"]
    : ["assets/icon.png"]
}

// 执行 synchronizeMetadata 函数的处理逻辑。
async function synchronizeMetadata(root: string, config: ProjectConfig): Promise<void> {
  // 保存 packagePath 变量供当前逻辑使用。
  const packagePath = path.join(root, "package.json")
  // 保存 manifest 变量供当前逻辑使用。
  const manifest = await readJson<Record<string, unknown>>(packagePath)
  await writeJsonAtomic(packagePath, updateManifestIdentity(manifest, config))

  if (config.projectType === "web") {
    await writeAtomic(path.join(root, "index.html"), renderWebIndex(config))
    await writeAtomic(path.join(root, "src/brand.ts"), renderWebBrand(config))
  } else {
    await writeAtomic(path.join(root, "src/brand.ts"), renderExtensionBrand(config))
    await synchronizeIdentityLocales(root, config)
  }
}

// 执行 refreshBrand 函数的处理逻辑。
export async function refreshBrand(
  root: string,
  options: BrandRefreshOptions = {}
): Promise<ProjectConfig> {
  // 保存 current 变量供当前逻辑使用。
  const current = await loadProjectConfig(root)
  // 保存 color 变量供当前逻辑使用。
  const color =
    options.brandColor === undefined
      ? current.brand.primaryColor
      : normalizeColor(options.brandColor)
  // 保存 config 变量供当前逻辑使用。
  const config: ProjectConfig = {
    ...current,
    brand: {
      ...current.brand,
      primaryColor: color,
      logoSource: options.logoPath === undefined ? current.brand.logoSource : "uploaded"
    }
  }

  // 保存 shouldRegenerate 变量供当前逻辑使用。
  const shouldRegenerate = options.logoPath !== undefined || config.brand.logoSource === "generated"
  // 保存 masterPath 变量供当前逻辑使用。
  const masterPath = path.join(root, MASTER_LOGO_PATH)
  // 保存 logo 变量供当前逻辑使用。
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
  // 保存 [relativePath, contents] 变量供当前逻辑使用。
  for (const [relativePath, contents] of await deriveLogoAssets(config.projectType, logo)) {
    await writeAtomic(path.join(root, relativePath), contents)
  }
  await writeJsonAtomic(path.join(root, PROJECT_CONFIG_PATH), config)
  await synchronizeMetadata(root, config)
  return config
}
