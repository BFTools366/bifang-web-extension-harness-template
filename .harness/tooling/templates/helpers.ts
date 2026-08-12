// 执行 escapeHtml 函数的处理逻辑。
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

// 执行 tsString 函数的处理逻辑。
export function tsString(value: string): string {
  return JSON.stringify(value)
}
