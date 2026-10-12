// @vitest-environment jsdom
import { readFile } from "node:fs/promises"
import path from "node:path"
import { beforeEach, describe, expect, test, vi } from "vitest"

/** 取得离线参考中的真实控件，缺失时使交互测试立即失败。 */
function control<T extends HTMLElement>(selector: string): T {
  // 保存当前控件并明确拒绝不存在的测试目标。
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error("Missing reference control: " + selector)
  return result
}

/** 装入可信本地参考及其脚本，不加载网络资源或执行支付。 */
beforeEach(async () => {
  vi.restoreAllMocks()
  // 保存离线资源目录与 HTML 内容，使用项目已声明的 jsdom 环境。
  const assetRoot = path.resolve(".agents/skills/web-implement-saas-commerce/assets")
  const html = await readFile(path.join(assetRoot, "commerce-reference.html"), "utf8")
  history.replaceState(null, "", "/#purchase")
  document.open()
  document.write(html)
  document.close()
  // jsdom 不实现模态交互；只补 open 属性与 close 事件，不模拟业务结果。
  const dialog = control<HTMLDialogElement>("#confirmation")
  dialog.showModal = () => dialog.setAttribute("open", "")
  dialog.close = () => {
    dialog.removeAttribute("open")
    dialog.dispatchEvent(new Event("close"))
  }
  vi.stubGlobal("fetch", vi.fn())
  vi.spyOn(Storage.prototype, "setItem")
  // 执行受版本管理的本地脚本，从真实控件驱动示例行为。
  const script = await readFile(path.join(assetRoot, "commerce-reference.js"), "utf8")
  new Function(script)()
})

/** 验证可选启用、选择失效、原单恢复与账户视图更新。 */
describe("optional SaaS commerce reference", () => {
  /** 验证默认关闭和关闭进行中的演示都不会产生交易副作用。 */
  test("hides commerce until selected and blocks payment after disabling", () => {
    expect(control<HTMLInputElement>("#enabled").checked).toBe(false)
    expect(control("#navigation").hidden).toBe(true)
    expect(control("#workspace").hidden).toBe(true)
    control("#enable").click()
    expect(control("#purchase").hidden).toBe(false)
    control("input[value=basic]").click()
    control("#wallet-method").click()
    control("#checkout").click()
    expect(control<HTMLDialogElement>("#confirmation").open).toBe(true)
    control<HTMLInputElement>("#enabled").click()
    expect(control<HTMLDialogElement>("#confirmation").open).toBe(false)
    expect(control("#navigation").hidden).toBe(true)
    control("#pay").click()
    expect(control("#order-rows").textContent).toContain("演示待支付")
    expect(control("#balance").textContent).toBe("500.00")
    expect(fetch).not.toHaveBeenCalled()
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })

  /** 验证切换分类后旧商品、支付选择和金额不能继续用于下单。 */
  test("invalidates checkout selection when the category changes", () => {
    control("#enable").click()
    control("input[value=basic]").click()
    control("#wallet-method").click()
    expect(control<HTMLButtonElement>("#checkout").disabled).toBe(false)
    control("[data-category=resource]").click()
    expect(document.querySelector("input[value=basic]")).toBeNull()
    expect(control("#selected-product").textContent).toBe("请选择商品")
    expect(control("#total").textContent).toBe("—")
    expect(control<HTMLInputElement>("#wallet-method").checked).toBe(false)
    expect(control<HTMLButtonElement>("#checkout").disabled).toBe(true)
    control("input[value=resource]").click()
    expect(control("#selected-product").textContent).toBe("资源扩展包")
    expect(control<HTMLButtonElement>("#checkout").disabled).toBe(true)
  })

  /** 验证 Escape 后找回同一原单，支付一次后所有余额与账户反馈一起更新。 */
  test("resumes the same pending order and refreshes account views once", () => {
    control("#enable").click()
    control("input[value=basic]").click()
    control("#wallet-method").click()
    control("#checkout").click()
    control("#confirmation").dispatchEvent(new Event("cancel", { cancelable: true }))
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(location.hash).toBe("#orders")
    expect(control("#orders").hidden).toBe(false)
    expect(control<HTMLDialogElement>("#confirmation").open).toBe(false)
    expect(document.querySelectorAll("#order-rows tr")).toHaveLength(1)
    // 回购买页重开同一商品仍复用原订单，再从订单列表续付。
    location.hash = "purchase"
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    control("#checkout").click()
    expect(control("#confirm-detail").textContent).toContain("DEMO-001")
    expect(document.querySelectorAll("#order-rows tr")).toHaveLength(1)
    control("#close").click()
    control("#order-rows button").click()
    expect(control("#confirm-detail").textContent).toContain("DEMO-001")
    control("#pay").click()
    control("#pay").click()
    expect(control("#order-rows").textContent).toContain("演示已支付")
    expect(document.querySelector("#order-rows button")).toBeNull()
    expect(control("#balance").textContent).toBe("401.00")
    expect(control("#method-balance").textContent).toContain("401.00")
    expect(control("#account-status").textContent).toContain("（1）")
    expect(control("#ledger").textContent).toContain("DEMO-001")
    expect(fetch).not.toHaveBeenCalled()
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })
})
