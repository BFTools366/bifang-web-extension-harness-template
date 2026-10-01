/** 同一 Extension 单包固定维护两个浏览器目标，版本和入口由 Plasmo 派生。 */
export const EXTENSION_TARGETS = [
  { target: "chrome-mv3", manifestVersion: 3, action: "action" },
  { target: "firefox-mv2", manifestVersion: 2, action: "browser_action" }
] as const

/** 描述受支持浏览器目标及其 manifest 差异。 */
export type ExtensionTarget = (typeof EXTENSION_TARGETS)[number]

/** 判断 manifest 字段是否是普通记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** 检查真实产物的入口、后台、权限、CSP 与资源声明是否符合目标协议。 */
export function validateBuiltExtensionManifest(
  metadata: unknown,
  target: ExtensionTarget,
  errors: string[]
): void {
  const prefix = `Extension ${target.target} build`
  if (!isRecord(metadata)) {
    errors.push(`${prefix} manifest is invalid`)
    return
  }
  if (metadata.manifest_version !== target.manifestVersion)
    errors.push(`${prefix} manifest_version must equal ${target.manifestVersion}`)
  const action = metadata[target.action]
  if (!isRecord(action) || action.default_popup !== "popup.html")
    errors.push(`${prefix} is missing popup entry (${target.action})`)
  const options = metadata.options_ui
  if (!isRecord(options) || options.page !== "options.html")
    errors.push(`${prefix} is missing options entry`)
  const background = metadata.background
  if (background !== undefined) {
    if (!isRecord(background)) errors.push(`${prefix} background is invalid`)
    else if (target.manifestVersion === 2) {
      if (
        "service_worker" in background ||
        "type" in background ||
        (!Array.isArray(background.scripts) && typeof background.page !== "string")
      )
        errors.push(`${prefix} must use MV2 background scripts or page`)
    } else if (
      "scripts" in background ||
      "page" in background ||
      typeof background.service_worker !== "string"
    )
      errors.push(`${prefix} must use MV3 background.service_worker`)
  }
  if (target.manifestVersion === 2) {
    if ("action" in metadata || "host_permissions" in metadata)
      errors.push(`${prefix} must use browser_action and permissions for host access`)
    if (
      metadata.content_security_policy !== undefined &&
      typeof metadata.content_security_policy !== "string"
    )
      errors.push(`${prefix} content_security_policy must use the MV2 string form`)
    if (
      metadata.web_accessible_resources !== undefined &&
      (!Array.isArray(metadata.web_accessible_resources) ||
        metadata.web_accessible_resources.some((resource) => typeof resource !== "string"))
    )
      errors.push(`${prefix} web_accessible_resources must use MV2 string entries`)
  } else if ("browser_action" in metadata) {
    errors.push(`${prefix} must use action instead of browser_action`)
  }
}

// 执行 packageNameOf 函数的处理逻辑。
function packageNameOf(specifier: string): string | undefined {
  // 保存 segments 变量供当前逻辑使用。
  const segments = specifier.split("/")
  if (specifier.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined
  }
  return segments[0]
}

// 执行 findExternalizedRuntimeDependencies 函数的处理逻辑。
export function findExternalizedRuntimeDependencies(
  source: string,
  runtimeDependencies: readonly string[]
): string[] {
  // 保存 dependencies 变量供当前逻辑使用。
  const dependencies = new Set(runtimeDependencies)
  // 保存 externalized 变量供当前逻辑使用。
  const externalized = new Set<string>()
  // 保存 selfMapping 变量供当前逻辑使用。
  const selfMapping = /"((?:@[a-zA-Z0-9._~-]+\/)?[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~+-]+)*)":"\1"/g

  // 保存 match 变量供当前逻辑使用。
  for (const match of source.matchAll(selfMapping)) {
    // 保存 specifier 变量供当前逻辑使用。
    const specifier = match[1]
    if (specifier === undefined) continue
    // 保存 packageName 变量供当前逻辑使用。
    const packageName = packageNameOf(specifier)
    if (packageName !== undefined && dependencies.has(packageName)) {
      externalized.add(specifier)
    }
  }

  return [...externalized].sort()
}
