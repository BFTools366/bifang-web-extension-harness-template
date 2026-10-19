// @vitest-environment jsdom
import { readFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, expect, test, vi } from "vitest"

/** 要求离线参考中实际存在当前交互所需元素。 */
function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`离线参考缺少元素：${selector}`)
  return found
}

/** 清理离线演示的虚拟时钟与全局替身，不执行任何真实网络请求。 */
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 提取后的真实 DOM 参考可离线完成购买，并保留切分类、订单恢复和组织隔离。 */
test("extracted commerce design stays neutral, interactive and offline", async () => {
  const root = path.resolve(
    ".agents/skills/web-compose-capabilities/templates/compositions/purchase-checkout/source-reference"
  )
  const html = await readFile(path.join(root, "index.html"), "utf8")
  expect(html).not.toMatch(/毕方小CB|data:image|方案 [AB]|https?:\/\//u)
  const scripts = [...html.matchAll(/<script src="([^"]+)"/gu)].map((match) => {
    const name = match[1]
    if (!name) throw new Error("离线参考缺少脚本路径")
    return name
  })
  const code = (
    await Promise.all(scripts.map((name) => readFile(path.join(root, name), "utf8")))
  ).join("\n")
  expect(code).not.toMatch(/毕方小CB|Bifang|2026-10-12|fetch\(|XMLHttpRequest|localStorage/u)
  history.replaceState(null, "", "/#catalog")
  document.open()
  document.write(html)
  document.close()
  const dialog = element<HTMLDialogElement>("#dialog")
  dialog.showModal = () => dialog.setAttribute("open", "")
  dialog.close = () => {
    dialog.removeAttribute("open")
    dialog.dispatchEvent(new Event("close"))
  }
  vi.useFakeTimers()
  vi.stubGlobal("fetch", vi.fn())
  const storage = vi.spyOn(Storage.prototype, "setItem")
  new Function(code)()
  await vi.advanceTimersByTimeAsync(500)
  expect(document.querySelector(".overview")).not.toBeNull()
  element<HTMLButtonElement>('[data-action="launch"]').click()
  expect(dialog.open).toBe(true)
  element<HTMLInputElement>('input[name="product"][value="basic"]').click()
  element<HTMLInputElement>('input[name="wallet"]').click()
  expect(element<HTMLButtonElement>("#create").disabled).toBe(false)
  element<HTMLButtonElement>('[data-category="resource"]').click()
  expect(element<HTMLButtonElement>("#create").disabled).toBe(true)
  element<HTMLInputElement>('input[name="product"][value="resource"]').click()
  element<HTMLInputElement>('input[name="wallet"]').click()
  element<HTMLButtonElement>("#create").click()
  await vi.advanceTimersByTimeAsync(500)
  const order = element(".order-reference").textContent
  element<HTMLButtonElement>('[data-action="pay"]').click()
  await vi.advanceTimersByTimeAsync(500)
  expect(dialog.textContent).toContain(order)
  expect(document.querySelector('[data-action="done"]')).not.toBeNull()
  element<HTMLButtonElement>('[data-action="done"]').click()
  const organization = element<HTMLSelectElement>("#org")
  organization.value = "studio"
  organization.dispatchEvent(new Event("change", { bubbles: true }))
  expect(element("main").textContent).not.toContain(order)
  expect(fetch).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
})
