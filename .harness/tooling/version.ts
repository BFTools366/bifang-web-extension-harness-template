export interface SemanticVersion {
  major: number
  minor: number
  patch: number
}

const EXACT_VERSION =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function parseExactVersion(value: unknown): SemanticVersion | undefined {
  if (typeof value !== "string") return undefined
  const match = EXACT_VERSION.exec(value.trim())
  if (match === null) return undefined
  const version = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
  return Object.values(version).every(Number.isSafeInteger) ? version : undefined
}

export function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  return 0
}

export function isVersionAtLeast(candidate: unknown, minimum: string): boolean {
  const parsedCandidate = parseExactVersion(candidate)
  const parsedMinimum = parseExactVersion(minimum)
  return (
    parsedCandidate !== undefined &&
    parsedMinimum !== undefined &&
    compareVersions(parsedCandidate, parsedMinimum) >= 0
  )
}

export function minimumVersionFromRange(value: unknown): SemanticVersion | undefined {
  if (typeof value !== "string") return undefined
  const match = /^>=\s*(.+)$/.exec(value.trim())
  return match?.[1] === undefined ? undefined : parseExactVersion(match[1])
}

export function declaresMinimumVersion(value: unknown, minimum: string): boolean {
  const declared = minimumVersionFromRange(value)
  const required = parseExactVersion(minimum)
  return (
    declared !== undefined && required !== undefined && compareVersions(declared, required) >= 0
  )
}

export function declaredVersionAtLeast(value: unknown, minimum: string): boolean {
  if (typeof value !== "string") return false
  const declaration = /^(?:\^|~|>=\s*)?(.+)$/.exec(value.trim())
  if (declaration?.[1] === undefined) return false
  return isVersionAtLeast(declaration[1], minimum)
}

export function packageManagerVersion(value: unknown, manager: string): string | undefined {
  if (typeof value !== "string") return undefined
  const escapedManager = manager.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`^${escapedManager}@(\\d+\\.\\d+\\.\\d+)$`).exec(value.trim())
  return match?.[1]
}

export function assertPackageManagerPins(
  manifest: Record<string, unknown>,
  errors: string[]
): void {
  const engines = manifest.engines as Record<string, unknown> | undefined
  if (!declaresMinimumVersion(engines?.node, "22.22.2")) {
    errors.push("Node engine minimum must not be lower than 22.22.2")
  }
  if (!declaresMinimumVersion(engines?.pnpm, "10.33.3")) {
    errors.push("pnpm engine minimum must not be lower than 10.33.3")
  }
  const pinnedPnpm = packageManagerVersion(manifest.packageManager, "pnpm")
  if (!isVersionAtLeast(pinnedPnpm, "10.33.3")) {
    errors.push("packageManager must be an exact pnpm pin not lower than 10.33.3")
  }
  const declaredPnpm = minimumVersionFromRange(engines?.pnpm)
  const parsedPinnedPnpm = parseExactVersion(pinnedPnpm)
  if (
    declaredPnpm !== undefined &&
    parsedPinnedPnpm !== undefined &&
    compareVersions(parsedPinnedPnpm, declaredPnpm) < 0
  ) {
    errors.push("packageManager pnpm pin must satisfy engines.pnpm")
  }
}
