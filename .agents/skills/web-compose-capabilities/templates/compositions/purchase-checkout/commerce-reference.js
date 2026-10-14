// 示例状态只留在本页内存，不代表真实服务或扣款。
const { document, location, window } = globalThis
const products = [
  {
    id: "basic",
    name: "基础服务包",
    description: "用于展示订阅类商品的选择与摘要。",
    amount: 99
  },
  { id: "team", name: "团队服务包", description: "用于展示同分类下不同商品。", amount: 199 },
  { id: "resource", name: "资源扩展包", description: "用于展示独立资源分类。", amount: 49 }
]
const categoryNames = {
  all: "全部商品",
  basic: "基础服务",
  team: "团队服务",
  resource: "资源扩展"
}
const state = {
  category: "all",
  product: null,
  orders: [],
  activeOrder: null,
  balance: 500,
  refreshes: 0
}
const element = (id) => document.getElementById(id)
const money = (value) => value.toFixed(2) + " 演示单位"
// 切页保留订单；能力关闭时隐藏所有业务入口。
function showPage(focus = false) {
  const enabled = element("enabled").checked
  element("gate").hidden = enabled
  element("navigation").hidden = !enabled
  element("workspace").hidden = !enabled
  const page = ["purchase", "orders", "wallet"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "purchase"
  for (const id of ["purchase", "orders", "wallet"]) element(id).hidden = !enabled || id !== page
  for (const link of document.querySelectorAll("nav a")) {
    if (link.hash === "#" + page) link.setAttribute("aria-current", "page")
    else link.removeAttribute("aria-current")
  }
  if (focus && enabled) element(page).querySelector("h1").focus()
}
// 目录切换清空旧选择，金额仅用于离线排版演示。
function renderProducts() {
  element("category-title").textContent = categoryNames[state.category]
  element("products").replaceChildren()
  for (const product of products.filter(
    (item) => state.category === "all" || item.id === state.category
  )) {
    const label = document.createElement("label")
    label.className = "choice"
    const input = document.createElement("input")
    input.type = "radio"
    input.name = "product"
    input.value = product.id
    input.addEventListener("change", () => {
      state.product = product
      element("wallet-method").checked = false
      element("wallet-method").disabled = false
      updateSummary()
    })
    const content = document.createElement("span")
    const title = document.createElement("strong")
    title.textContent = product.name
    const description = document.createElement("small")
    description.textContent = product.description + " " + money(product.amount)
    content.append(title, description)
    label.append(input, content)
    element("products").append(label)
  }
  updateSummary()
}
// 摘要与提交按钮只消费当前选择。
function updateSummary() {
  element("selected-product").textContent = state.product?.name ?? "请选择商品"
  element("selected-method").textContent = element("wallet-method").checked ? "账户钱包" : "请选择"
  element("total").textContent = state.product ? money(state.product.amount) : "—"
  element("checkout").disabled = !state.product || !element("wallet-method").checked
}
// 演示详情可关闭后续付，原订单身份不变。
function openOrder(order) {
  state.activeOrder = order
  element("confirm-detail").textContent =
    order.id + " · " + order.product.name + " · " + money(order.product.amount)
  element("confirmation").showModal()
}
// 支付成功与账户刷新分开呈现；实际产品需服务端确认。
function renderOrders() {
  element("order-rows").replaceChildren()
  element("empty-orders").hidden = state.orders.length > 0
  for (const order of state.orders) {
    const row = document.createElement("tr")
    for (const value of [
      order.id,
      order.product.name,
      money(order.product.amount),
      order.paid ? "演示已支付" : "演示待支付"
    ]) {
      const cell = document.createElement("td")
      cell.textContent = value
      row.append(cell)
    }
    const action = document.createElement("td")
    if (!order.paid) {
      const button = document.createElement("button")
      button.textContent = "继续演示支付"
      button.type = "button"
      button.addEventListener("click", () => openOrder(order))
      action.append(button)
    } else action.textContent = "已完成"
    row.append(action)
    element("order-rows").append(row)
  }
}
// 所有账户数字只模拟视图更新，禁止作为真实账本逻辑复用。
function refreshAccount() {
  state.refreshes += 1
  element("balance").textContent = state.balance.toFixed(2)
  element("method-balance").textContent = "演示可用余额：" + money(state.balance)
  element("account-status").textContent = "演示账户数据已刷新（" + state.refreshes + "）"
  element("ledger").textContent =
    state.orders
      .filter((order) => order.paid)
      .map((order) => order.id + " · 商品购买 · −" + money(order.product.amount))
      .join("；") || "暂无演示交易。"
}
element("enable").addEventListener("click", () => {
  element("enabled").checked = true
  showPage(true)
})
element("enabled").addEventListener("change", () => {
  if (element("confirmation").open) element("confirmation").close()
  showPage()
})
window.addEventListener("hashchange", () => showPage(true))
for (const button of document.querySelectorAll("[data-category]"))
  button.addEventListener("click", () => {
    state.category = button.dataset.category
    state.product = null
    element("wallet-method").checked = false
    element("wallet-method").disabled = true
    for (const item of document.querySelectorAll("[data-category]"))
      item.setAttribute("aria-pressed", String(item === button))
    renderProducts()
  })
element("wallet-method").addEventListener("change", updateSummary)
element("checkout").addEventListener("click", () => {
  if (!element("enabled").checked || !state.product || !element("wallet-method").checked) return
  const pending = state.orders.find((order) => !order.paid && order.product.id === state.product.id)
  if (pending) {
    openOrder(pending)
    return
  }
  const order = {
    id: "DEMO-" + String(state.orders.length + 1).padStart(3, "0"),
    product: state.product,
    paid: false
  }
  state.orders.unshift(order)
  renderOrders()
  openOrder(order)
})
// 包括 Escape 在内的关闭都回到原订单，之后仍可续付。
element("confirmation").addEventListener("cancel", (event) => {
  event.preventDefault()
  element("confirmation").close()
  location.hash = "orders"
})
element("close").addEventListener("click", () => {
  element("confirmation").close()
  location.hash = "orders"
})
element("pay").addEventListener("click", () => {
  const order = state.activeOrder
  if (!element("enabled").checked || !order || order.paid) return
  if (state.balance < order.product.amount) {
    element("confirm-detail").textContent = "演示余额不足，保留原订单，可稍后继续。"
    return
  }
  order.paid = true
  state.balance -= order.product.amount
  renderOrders()
  refreshAccount()
  element("order-notice").textContent = "演示支付完成，订单、钱包与当前账户视图已刷新。"
  element("order-notice").hidden = false
  element("confirmation").close()
  location.hash = "orders"
})
element("refresh").addEventListener("click", refreshAccount)
renderProducts()
renderOrders()
showPage()
