/** 浏览器 Storage 所需的最小接口，便于隔离测试。 */
export interface ListStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 返回 SSR/安全异常下可选的浏览器列表存储。 */
export function getBrowserListStorage(kind: "session" | "local"): ListStorage | undefined {
  try {
    if (typeof window === "undefined") return undefined
    return kind === "session" ? window.sessionStorage : window.localStorage
  } catch {
    return undefined
  }
}
