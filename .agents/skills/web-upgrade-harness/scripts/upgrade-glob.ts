import type { OwnershipManifest, OwnershipRule } from "./upgrade-types.ts"

/** 描述所有权 glob 中的字面量、单层通配符与跨层通配符。 */
type OwnershipGlobToken =
  { kind: "literal"; value: string } | { kind: "segment-wildcard" | "tree-wildcard" }

/** 将所有权 glob 拆成与匹配正则相同语义的有限状态 token。 */
function ownershipGlobTokens(pattern: string): OwnershipGlobToken[] {
  const characters = [...pattern]
  const tokens: OwnershipGlobToken[] = []
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? ""
    if (character !== "*") {
      tokens.push({ kind: "literal", value: character })
      continue
    }
    if (characters[index + 1] === "*") {
      tokens.push({ kind: "tree-wildcard" })
      index += 1
    } else {
      tokens.push({ kind: "segment-wildcard" })
    }
  }
  return tokens
}

/** 判断 token 是否允许通过空串进入下一状态。 */
function isOwnershipWildcard(token: OwnershipGlobToken | undefined): boolean {
  return token?.kind === "segment-wildcard" || token?.kind === "tree-wildcard"
}

/** 判断两个 token 是否能够消费同一个路径字符。 */
function ownershipTokensOverlap(
  left: OwnershipGlobToken | undefined,
  right: OwnershipGlobToken | undefined
): boolean {
  if (left === undefined || right === undefined) return false
  if (left.kind === "literal" && right.kind === "literal") return left.value === right.value
  if (left.kind === "literal") {
    return right.kind === "tree-wildcard" || left.value !== "/"
  }
  if (right.kind === "literal") {
    return left.kind === "tree-wildcard" || right.value !== "/"
  }
  return true
}

/** 将受限 glob 模式编译为完整 POSIX 路径正则。 */
export function globPattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
  const withDouble = escaped.replaceAll("**", "\u0000")
  return new RegExp(`^${withDouble.replaceAll("*", "[^/]*").replaceAll("\u0000", ".*")}$`, "u")
}

/** 通过两个有限状态机的乘积判断受限 glob 是否存在共同匹配路径。 */
export function ownershipPatternsOverlap(leftPattern: string, rightPattern: string): boolean {
  const left = ownershipGlobTokens(leftPattern)
  const right = ownershipGlobTokens(rightPattern)
  const pending: Array<readonly [number, number]> = [[0, 0]]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const [leftIndex, rightIndex] = pending.pop() ?? [0, 0]
    const state = `${leftIndex}:${rightIndex}`
    if (visited.has(state)) continue
    visited.add(state)
    if (leftIndex === left.length && rightIndex === right.length) return true

    const leftToken = left[leftIndex]
    const rightToken = right[rightIndex]
    if (isOwnershipWildcard(leftToken)) pending.push([leftIndex + 1, rightIndex])
    if (isOwnershipWildcard(rightToken)) pending.push([leftIndex, rightIndex + 1])
    if (ownershipTokensOverlap(leftToken, rightToken)) {
      pending.push([
        leftToken?.kind === "literal" ? leftIndex + 1 : leftIndex,
        rightToken?.kind === "literal" ? rightIndex + 1 : rightIndex
      ])
    }
  }
  return false
}

/** 返回路径首个匹配的所有权规则。 */
export function ownershipRule(
  relativePath: string,
  manifest: OwnershipManifest
): OwnershipRule | undefined {
  return manifest.rules.find((rule) => globPattern(rule.pattern).test(relativePath))
}

/** 返回文件或目录节点首个命中的所有权规则。 */
export function ownershipRuleForNode(
  relativePath: string,
  manifest: OwnershipManifest,
  directory: boolean
): OwnershipRule | undefined {
  const direct = ownershipRule(relativePath, manifest)
  return (
    direct ?? (directory ? ownershipRule(`${relativePath}/__harness_node__`, manifest) : undefined)
  )
}
