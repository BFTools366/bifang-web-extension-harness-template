import type { ParsedArgs } from "./types.ts"

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const options = new Map<string, string | boolean>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) continue
    if (token === "--") continue
    if (!token.startsWith("--")) {
      positionals.push(token)
      continue
    }

    const equalsAt = token.indexOf("=")
    if (equalsAt > 2) {
      const key = token.slice(2, equalsAt)
      if (options.has(key)) throw new Error(`Option --${key} may only be provided once`)
      options.set(key, token.slice(equalsAt + 1))
      continue
    }

    const key = token.slice(2)
    if (options.has(key)) throw new Error(`Option --${key} may only be provided once`)
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

export function assertKnownOptions(args: ParsedArgs, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  const unknown = [...args.options.keys()].filter((key) => !allowedSet.has(key))
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((key) => `--${key}`).join(", ")}`)
  }
}

export function readStringOption(args: ParsedArgs, key: string): string | undefined {
  const value = args.options.get(key)
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${key} requires a value`)
  }
  return value.trim()
}

export function readBooleanOption(args: ParsedArgs, key: string): boolean {
  const value = args.options.get(key)
  if (value === undefined) return false
  if (value === true || value === "true") return true
  if (value === "false") return false
  throw new Error(`--${key} must be a boolean flag`)
}
