/* exported renderDialog */
// 已提交阶段始终读取原订单快照，并按状态提供支付、查询或只读恢复。
function orderDialogContent(o) {
  let message, action
  if (s.busy) {
    message = notice(t("paying"))
    action = ""
  } else if (o.status === "pending") {
    message = notice(t("createdNotice")) + walletSelection(o.amount, true)
    action = button("pay", t("pay"), true, !s.wallet || !!walletProblem(o.amount))
  } else if (["unknown", "processing"].includes(o.status)) {
    message = notice(t("unknownNotice"))
    action = button("query-pay", t("queryPay"), true)
  } else if (o.status === "paid") {
    message =
      notice(t("success"), "success") +
      notice(
        t(o.refreshFailed ? "readFailure" : "successHint"),
        o.refreshFailed ? "error" : "success"
      )
    action = o.refreshFailed
      ? button("refresh-read", t("refreshRead"), true)
      : button("done", t("done"), true)
  } else {
    message = notice(t("readOnly"))
    action = ""
  }
  return `<div class="checkout-grid order-checkout"><section class="checkout-options"><h3>${t("orderId")}</h3><p class="order-reference">${o.id}</p><div class="order-state">${badge(o.status)}<small>${t("created")}: ${o.created}</small></div>${message}</section><aside class="summary checkout-summary"><h3>${t("summary")}</h3>${facts(
    [
      [t("product"), esc(name(o.product))],
      [t("quantity"), "1"],
      [t("scope"), esc(orgs[o.org])],
      [t("state"), badge(o.status)]
    ]
  )}<div class="divider"></div><div class="total"><span>${t("total")}</span><strong>${money(o.amount)}</strong></div><div class="summary-action">${action}</div><small class="summary-help">${t("demoOnly")}</small></aside></div>`
}

// 选购、报价变化、请求恢复和原单支付连续使用同一个原生弹窗。
function renderDialog() {
  const previous = $("dialog").contains(document.activeElement) ? document.activeElement : null
  const o = s.active
  let title,
    body,
    actions = ""
  if (dialogKind === "purchase") {
    title = t("buy")
    body = checkoutPage()
  } else if (dialogKind === "price") {
    title = t("priceTitle")
    body =
      notice(t("priceHint")) +
      facts([
        [t("oldPrice"), money(product().amount)],
        [t("newPrice"), money(product().amount + 1000)]
      ])
    actions = button("accept-price", t("acceptPrice"), true)
  } else if (dialogKind === "create") {
    title = t("createWait")
    body =
      notice(t("createWaitHint")) +
      facts([
        [t("request"), esc(s.request?.id ?? "—")],
        [t("scope"), esc(orgs[s.org])]
      ])
    actions = button("restore-create", s.busy ? t("querying") : t("queryCreate"), true, s.busy)
  } else if (o) {
    title = t(o.status === "pending" ? "payConfirm" : "orderDetail")
    body = orderDialogContent(o)
  } else return
  $("dialog").dataset.stage = dialogKind
  $("dialog").innerHTML =
    `<div class="dialog-header"><h2 id="dialog-title" tabindex="-1">${title}</h2>${button("close", "×", false, false, `aria-label="${t("close")}"`)}</div><div class="dialog-content">${body}${actions ? `<div class="actions">${actions}${button("close", t("close"))}</div>` : ""}</div>`
  if ($("dialog").open && previous) {
    const replacement = [...$("dialog").querySelectorAll("button,input,select,h2,h3")].find(
      (item) => {
        if (previous.id) return item.id === previous.id
        if (previous.dataset.category) return item.dataset.category === previous.dataset.category
        if (previous.dataset.action) return item.dataset.action === previous.dataset.action
        if (previous.name) return item.name === previous.name && item.value === previous.value
        return false
      }
    )
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true })
    else $("dialog-title").focus({ preventScroll: true })
  }
}
