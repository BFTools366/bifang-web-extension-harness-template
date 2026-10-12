/** 浏览器 Storage 所需的最小接口，便于隔离测试。 */
export interface ListStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
