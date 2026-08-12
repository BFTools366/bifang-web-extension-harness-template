import type { ParsedArgs } from "./types.ts"

// 执行 parseArgs 函数的处理逻辑。
export function parseArgs(argv: string[]): ParsedArgs {
  // 保存 positionals 变量供当前逻辑使用。
  const positionals: string[] = []
  // 保存 options 变量供当前逻辑使用。
  const options = new Map<string, string | boolean>()

  // 保存 index 变量供当前逻辑使用。
  for (let index = 0; index < argv.length; index += 1) {
    // 保存 token 变量供当前逻辑使用。
    const token = argv[index]
    if (token === undefined) continue
    if (token === "--") continue
    if (!token.startsWith("--")) {
      positionals.push(token)
      continue
    }

    // 保存 equalsAt 变量供当前逻辑使用。
    const equalsAt = token.indexOf("=")
    if (equalsAt > 2) {
      // 保存 key 变量供当前逻辑使用。
      const key = token.slice(2, equalsAt)
      if (options.has(key)) throw new Error(`Option --${key} may only be provided once`)
      options.set(key, token.slice(equalsAt + 1))
      continue
    }

    // 保存 key 变量供当前逻辑使用。
    const key = token.slice(2)
    if (options.has(key)) throw new Error(`Option --${key} may only be provided once`)
    // 保存 next 变量供当前逻辑使用。
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith("--")) {
      options.set(key, next)
      index += 1
    } else {
      options.set(key, true)
    }
  }

  return { positionals, options }
}

// 执行 assertKnownOptions 函数的处理逻辑。
export function assertKnownOptions(args: ParsedArgs, allowed: readonly string[]): void {
  // 保存 allowedSet 变量供当前逻辑使用。
  const allowedSet = new Set(allowed)
  // 保存 unknown 变量供当前逻辑使用。
  const unknown = [...args.options.keys()].filter(
    /* 执行 当前声明 函数的处理逻辑。 */ (key) => !allowedSet.has(key)
  )
  if (unknown.length > 0) {
    throw new Error(
      `Unknown option(s): ${unknown.map(/* 执行 当前声明 函数的处理逻辑。 */ (key) => `--${key}`).join(", ")}`
    )
  }
}

// 执行 readStringOption 函数的处理逻辑。
export function readStringOption(args: ParsedArgs, key: string): string | undefined {
  // 保存 value 变量供当前逻辑使用。
  const value = args.options.get(key)
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${key} requires a value`)
  }
  return value.trim()
}

// 执行 readBooleanOption 函数的处理逻辑。
export function readBooleanOption(args: ParsedArgs, key: string): boolean {
  // 保存 value 变量供当前逻辑使用。
  const value = args.options.get(key)
  if (value === undefined) return false
  if (value === true || value === "true") return true
  if (value === "false") return false
  throw new Error(`--${key} must be a boolean flag`)
}
