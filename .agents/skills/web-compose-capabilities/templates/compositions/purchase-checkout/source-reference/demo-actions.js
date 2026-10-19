// 演示异步回调绑定组织与代次，切换后不能把旧交易结果写入新视图。
async function task(fn) {
  if (s.busy) return
  const org = s.org,
    gen = s.generation
  s.busy = true
  render()
  if ($("dialog").open) renderDialog()
  await sleep()
  if (gen !== s.generation || org !== s.org) return
  try {
    fn()
  } finally {
    s.busy = false
    render()
    if ($("dialog").open) renderDialog()
  }
}
function setProduct(id) {
  s.product = id
  s.wallet = false
  s.quoteFresh = false
  s.priceAccepted = false
  s.notice = null
  render()
  if (dialogKind === "purchase") renderDialog()
  document.querySelector(`input[name=product][value="${id}"]`)?.focus({ preventScroll: true })
}
function switchOrg(org, triggerId = "org") {
  s.generation++
  s.org = org
  s.product = null
  s.wallet = false
  s.category = "all"
  const unconfirmed = db(org).requests.keys().next().value
  s.request = unconfirmed ? { id: unconfirmed, org } : null
  s.active = null
  s.busy = false
  s.step = 1
  s.search = ""
  s.filter = "all"
  s.orderPage = s.ledgerPage = 1
  s.refreshCount = 0
  s.notice = { key: "switched" }
  closeDialog()
  render()
  $(triggerId).focus({ preventScroll: true })
  announce(t("switched"))
}
function newOrder() {
  const data = db(),
    id = `DEMO-${s.org === "workspace" ? "W" : "S"}-${String(data.orders.length + 1).padStart(3, "0")}`
  const o = {
    id,
    product: product(),
    amount: quoteAmount(),
    status: "pending",
    org: s.org,
    created: "2000-01-01 18:00",
    refreshFailed: false
  }
  data.orders.unshift(o)
  return o
}
function confirmPaid(o) {
  if (o.status !== "paid") {
    o.status = "paid"
    db(o.org).balance -= o.amount
    db(o.org).ledger.unshift({
      id: o.id,
      amount: -o.amount,
      type: "expense",
      time: "2000-01-01 18:00"
    })
  }
  o.refreshFailed = s.scenario === "refreshFailed"
  if (!o.refreshFailed) s.refreshCount++
  s.notice = {
    key: o.refreshFailed ? "readFailure" : "successHint",
    kind: o.refreshFailed ? "error" : "success"
  }
  announce(t("success"))
}
async function createOrder() {
  if (!canCreate()) return
  if (s.scenario === "priceChanged" && !s.priceAccepted) {
    openDialog("price")
    return
  }
  const o = newOrder()
  const id = `REQUEST-${s.org}-${db().orders.length}`
  db().requests.set(id, o.id)
  s.request = { id, org: s.org }
  await task(() => {
    if (s.scenario === "createUnknown") {
      openDialog("create")
    } else {
      db().requests.delete(id)
      s.request = null
      s.active = o
      openDialog("order")
    }
    announce(t(s.request ? "createWait" : "createdNotice"))
  })
}
function goto(page) {
  if (s.page === page) {
    render(true)
    return
  }
  location.hash = page
}
// 所有动作由语义按钮或原生表单拥有，父级面板不代理业务点击。
document.addEventListener("click", async (event) => {
  if (event.target.closest(".skip")) {
    event.preventDefault()
    $("main").focus()
    return
  }
  const category = event.target.closest("[data-category]")
  if (category) {
    s.category = category.dataset.category
    s.product = null
    s.wallet = false
    s.priceAccepted = false
    s.quoteFresh = false
    render()
    if (dialogKind === "purchase") renderDialog()
    document.querySelector(`[data-category="${s.category}"]`)?.focus({ preventScroll: true })
    return
  }
  const b = event.target.closest("[data-action]")
  if (!b || b.disabled) return
  const action = b.dataset.action
  if (!$("dialog").contains(b)) {
    returnFocus = b
    returnAction = action
    returnId = b.dataset.id ?? null
  }
  if (action === "launch") {
    if (s.busy) return
    if (s.request) openDialog("create")
    else {
      s.step = 1
      s.active = null
      openDialog("purchase")
    }
    return
  }
  if (action === "filter-orders") {
    s.filter = b.dataset.filter ?? "all"
    s.search = ""
    s.orderPage = 1
    render()
    announce(t("orders"))
    return
  }
  if (action === "wallet-ledger") {
    goto("wallet")
    return
  }
  if (action === "close") {
    closeDialog()
    return
  }
  if (action === "account") {
    goto("account")
    return
  }
  if (action === "reset") {
    s.generation++
    records.clear()
    s.product = null
    s.wallet = false
    s.category = "all"
    s.quoteFresh = false
    s.priceAccepted = false
    s.refreshCount = 0
    s.scenario = "normal"
    s.busy = false
    s.loading = false
    s.request = null
    s.active = null
    s.step = 1
    s.search = ""
    s.filter = "all"
    s.ledgerType = "all"
    s.orderPage = s.ledgerPage = 1
    s.notice = null
    closeDialog()
    render()
    return
  }
  if (action === "clear") {
    s.scenario = "normal"
    s.category = "all"
    s.search = ""
    s.filter = "all"
    s.product = null
    s.wallet = false
    s.orderPage = 1
    render()
    return
  }
  if (action === "next") {
    if ((s.step === 1 && !product()) || (s.step === 2 && (!s.wallet || walletProblem()))) return
    s.step++
    render()
    renderDialog()
    $("checkout-step")?.focus({ preventScroll: true })
    return
  }
  if (action === "back") {
    s.step = Math.max(1, s.step - 1)
    render()
    renderDialog()
    $("checkout-step")?.focus({ preventScroll: true })
    return
  }
  if (action === "quote") {
    s.quoteFresh = true
    render()
    if (dialogKind === "purchase") renderDialog()
    announce(t("quote"))
    return
  }
  if (action === "accept-price") {
    s.priceAccepted = true
    openDialog("purchase")
    render()
    await createOrder()
    return
  }
  if (action === "create") {
    await createOrder()
    return
  }
  if (action === "order") {
    await task(() => {
      s.active = db().orders.find((o) => o.id === b.dataset.id)
      if (s.request && db().requests.get(s.request.id) === s.active?.id) {
        db().requests.delete(s.request.id)
        s.request = null
        announce(t("restored"))
      }
      s.wallet = false
      openDialog("order")
    })
    return
  }
  if (action === "pay") {
    const o = s.active
    if (
      !o ||
      o.status !== "pending" ||
      !s.wallet ||
      walletProblem(o.amount) ||
      s.scenario === "forbidden"
    )
      return
    o.status = "processing"
    await task(() => {
      if (s.scenario === "payUnknown") {
        o.status = "unknown"
        s.notice = { key: "unknownNotice" }
        announce(t("unknownNotice"))
      } else confirmPaid(o)
    })
    return
  }
  if (action === "restore-create") {
    if (!s.request) return
    await task(() => {
      const id = db().requests.get(s.request.id)
      s.active = db().orders.find((o) => o.id === id)
      db().requests.delete(s.request.id)
      s.request = null
      s.wallet = false
      openDialog("order")
      announce(t("restored"))
    })
    return
  }
  if (action === "query-pay") {
    const o = s.active
    if (!o || !["unknown", "processing"].includes(o.status)) return
    await task(() => confirmPaid(o))
    return
  }
  if (action === "refresh-read") {
    await task(() => {
      if (s.active) {
        s.active.refreshFailed = false
        s.refreshCount++
        s.notice = { key: "successHint", kind: "success" }
        announce(t("successHint"))
      }
    })
    return
  }
  if (action === "done") {
    closeDialog()
    goto("orders")
    return
  }
  if (action.startsWith("prev-") || action.startsWith("next-")) {
    const key = action.endsWith("orders") ? "orderPage" : "ledgerPage"
    s[key] += action.startsWith("prev") ? -1 : 1
    render()
    announce(t("page") + " " + s[key])
    return
  }
  if (["refresh", "retry"].includes(action)) {
    await task(() => {
      if (action === "retry") s.scenario = "normal"
      s.refreshCount++
      s.notice = { key: "refreshDone" }
      announce(t("refreshDone"))
    })
    return
  }
})
document.addEventListener("change", (event) => {
  const el = event.target
  if (el.name === "product") {
    setProduct(el.value)
    return
  }
  if (["wallet", "modal-wallet"].includes(el.name)) {
    s.wallet = true
    if ($("dialog").open) renderDialog()
    else render()
    document.querySelector(`input[name="${el.name}"]`)?.focus({ preventScroll: true })
    return
  }
  if (el.id === "org" || el.id === "org-side") {
    switchOrg(el.value, el.id)
    return
  }
  if (el.id === "scenario") {
    s.generation++
    s.scenario = el.value
    s.product = null
    s.wallet = false
    s.busy = false
    s.loading = false
    s.step = 1
    s.quoteFresh = false
    s.priceAccepted = false
    s.notice = null
    s.active = null
    closeDialog()
    render()
    $("demo-controls").open = true
    $("scenario").focus()
    announce(t(el.value))
    return
  }
  if (el.id === "ledger-type") {
    s.ledgerType = el.value
    s.ledgerPage = 1
    render()
    $("ledger-type").focus()
    announce(t("ledger"))
    return
  }
})
document.addEventListener("submit", (event) => {
  if (event.target.id !== "order-filter") return
  event.preventDefault()
  s.search = $("search").value.trim()
  s.filter = $("order-state").value
  s.orderPage = 1
  render()
  announce(t("orders"))
  $("search").focus()
})
$("language").addEventListener("click", () => {
  s.lang = s.lang === "zh" ? "en" : "zh"
  render()
  if ($("dialog").open) renderDialog()
})
$("theme").addEventListener("click", () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark"
})
$("dialog").addEventListener("cancel", (event) => {
  event.preventDefault()
  closeDialog()
})
window.addEventListener("hashchange", () => {
  s.page = ["catalog", "orders", "wallet", "account"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "catalog"
  s.notice = null
  closeDialog()
  render(true)
})
render()
s.loading = true
render()
sleep().then(() => {
  s.loading = false
  render()
  announce(t("catalog"))
})
