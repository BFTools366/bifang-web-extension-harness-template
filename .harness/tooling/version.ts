// 定义 SemanticVersion 接口的结构契约。
export interface SemanticVersion {
  // 描述 major 接口成员的结构契约。
  major: number
  // 描述 minor 接口成员的结构契约。
  minor: number
  // 描述 patch 接口成员的结构契约。
  patch: number
}

// 保存 WEB_BUILD_VERSION_PATTERN 常量，校验上海时间的 YYMMDDHHMMSS 字段顺序。
export const WEB_BUILD_VERSION_PATTERN =
  /^\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[01]\d|2[0-3])[0-5]\d[0-5]\d$/

// 保存 EXTENSION_VERSION_PATTERN 常量，约束 Extension 的稳定 SemVer 字段结构。
const EXTENSION_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

// 校验 Extension SemVer 同时满足 Chrome manifest 的非全零与分段上限。
export function isValidExtensionVersion(value: unknown): value is string {
  if (typeof value !== "string" || !EXTENSION_VERSION_PATTERN.test(value)) return false
  const parts = value.split(".").map(Number)
  return parts.some((part) => part > 0) && parts.every((part) => part <= 65535)
}

// 保存 EXACT_VERSION 变量供当前逻辑使用。
const EXACT_VERSION =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

// 执行 parseExactVersion 函数的处理逻辑。
export function parseExactVersion(value: unknown): SemanticVersion | undefined {
  if (typeof value !== "string") return undefined
  // 保存 match 变量供当前逻辑使用。
  const match = EXACT_VERSION.exec(value.trim())
  if (match === null) return undefined
  // 保存 version 变量供当前逻辑使用。
  const version = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
  return Object.values(version).every(Number.isSafeInteger) ? version : undefined
}

// 执行 compareVersions 函数的处理逻辑。
export function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  // 保存 key 变量供当前逻辑使用。
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  return 0
}

// 执行 isVersionAtLeast 函数的处理逻辑。
export function isVersionAtLeast(candidate: unknown, minimum: string): boolean {
  // 保存 parsedCandidate 变量供当前逻辑使用。
  const parsedCandidate = parseExactVersion(candidate)
  // 保存 parsedMinimum 变量供当前逻辑使用。
  const parsedMinimum = parseExactVersion(minimum)
  return (
    parsedCandidate !== undefined &&
    parsedMinimum !== undefined &&
    compareVersions(parsedCandidate, parsedMinimum) >= 0
  )
}

// 执行 minimumVersionFromRange 函数的处理逻辑。
export function minimumVersionFromRange(value: unknown): SemanticVersion | undefined {
  if (typeof value !== "string") return undefined
  // 保存 match 变量供当前逻辑使用。
  const match = /^>=\s*(.+)$/.exec(value.trim())
  return match?.[1] === undefined ? undefined : parseExactVersion(match[1])
}

// 执行 declaresMinimumVersion 函数的处理逻辑。
export function declaresMinimumVersion(value: unknown, minimum: string): boolean {
  // 保存 declared 变量供当前逻辑使用。
  const declared = minimumVersionFromRange(value)
  // 保存 required 变量供当前逻辑使用。
  const required = parseExactVersion(minimum)
  return (
    declared !== undefined && required !== undefined && compareVersions(declared, required) >= 0
  )
}

// 执行 declaredVersionAtLeast 函数的处理逻辑。
export function declaredVersionAtLeast(value: unknown, minimum: string): boolean {
  if (typeof value !== "string") return false
  // 保存 declaration 变量供当前逻辑使用。
  const declaration = /^(?:\^|~|>=\s*)?(.+)$/.exec(value.trim())
  if (declaration?.[1] === undefined) return false
  return isVersionAtLeast(declaration[1], minimum)
}

// 执行 packageManagerVersion 函数的处理逻辑。
export function packageManagerVersion(value: unknown, manager: string): string | undefined {
  if (typeof value !== "string") return undefined
  // 保存 escapedManager 变量供当前逻辑使用。
  const escapedManager = manager.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // 保存 match 变量供当前逻辑使用。
  const match = new RegExp(`^${escapedManager}@(\\d+\\.\\d+\\.\\d+)$`).exec(value.trim())
  return match?.[1]
}

// 执行 assertPackageManagerPins 函数的处理逻辑。
export function assertPackageManagerPins(
  manifest: Record<string, unknown>,
  errors: string[]
): void {
  // 保存 engines 变量供当前逻辑使用。
  const engines = manifest.engines as Record<string, unknown> | undefined
  if (!declaresMinimumVersion(engines?.node, "26.10.0")) {
    errors.push("Node engine minimum must not be lower than 26.10.0")
  }
  if (!declaresMinimumVersion(engines?.pnpm, "12.8.1")) {
    errors.push("pnpm engine minimum must not be lower than 12.8.1")
  }
  // 保存 pinnedPnpm 变量供当前逻辑使用。
  const pinnedPnpm = packageManagerVersion(manifest.packageManager, "pnpm")
  if (!isVersionAtLeast(pinnedPnpm, "12.8.1")) {
    errors.push("packageManager must be an exact pnpm pin not lower than 12.8.1")
  }
  // 保存 declaredPnpm 变量供当前逻辑使用。
  const declaredPnpm = minimumVersionFromRange(engines?.pnpm)
  // 保存 parsedPinnedPnpm 变量供当前逻辑使用。
  const parsedPinnedPnpm = parseExactVersion(pinnedPnpm)
  if (
    declaredPnpm !== undefined &&
    parsedPinnedPnpm !== undefined &&
    compareVersions(parsedPinnedPnpm, declaredPnpm) < 0
  ) {
    errors.push("packageManager pnpm pin must satisfy engines.pnpm")
  }
}
