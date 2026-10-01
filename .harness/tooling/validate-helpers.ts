import path from "node:path"
import { pathExists } from "./files.ts"

// 执行 requirePaths 函数的处理逻辑。
export async function requirePaths(
  root: string,
  paths: readonly string[],
  errors: string[]
): Promise<void> {
  // 保存 exists 变量供当前逻辑使用。
  const exists = await Promise.all(
    paths.map(
      /* 执行 当前声明 函数的处理逻辑。 */ (relativePath) =>
        pathExists(path.join(root, relativePath))
    )
  )
  paths.forEach(
    /* 执行 当前声明 函数的处理逻辑。 */ (relativePath, index) => {
      if (!exists[index]) errors.push(`Missing ${relativePath}`)
    }
  )
}

// 执行 recordField 函数的处理逻辑。
export function recordField(
  manifest: Record<string, unknown>,
  key: string
): Record<string, string> {
  // 保存 value 变量供当前逻辑使用。
  const value = manifest[key]
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, string>
}

// 执行 dependenciesOf 函数的处理逻辑。
export function dependenciesOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "dependencies")
}

// 执行 scriptsOf 函数的处理逻辑。
export function scriptsOf(manifest: Record<string, unknown>): Record<string, string> {
  return recordField(manifest, "scripts")
}

// 执行 assertScripts 函数的处理逻辑。
export function assertScripts(
  scripts: Record<string, string>,
  expected: Record<string, string>,
  errors: string[],
  label = "package.json script"
): void {
  // 保存 [name, expectedValue] 变量供当前逻辑使用。
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (scripts[name] !== expectedValue) errors.push(`${label} ${name} is invalid`)
  }
}

/** 拒绝任何可能生成 development 或 test 最终产物的构建脚本。 */
export function assertReleaseOnlyBuildScripts(
  scripts: Record<string, string>,
  errors: string[]
): void {
  // 保存 allowedBuildScripts 变量供当前逻辑使用。
  const allowedBuildScripts = new Set(["build", "build:release"])
  // 保存 unexpectedBuildScripts 变量供当前逻辑使用。
  const unexpectedBuildScripts = Object.keys(scripts).filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (name) =>
      name.startsWith("build:") && !allowedBuildScripts.has(name)
  )
  if (unexpectedBuildScripts.length > 0) {
    errors.push(
      `Final artifacts must be Release-only; remove ${unexpectedBuildScripts.sort().join(", ")}`
    )
  }
}
