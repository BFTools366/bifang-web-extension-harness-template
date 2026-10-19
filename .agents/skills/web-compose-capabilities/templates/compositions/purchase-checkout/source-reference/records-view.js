/* exported ordersPage, walletPage */
function filterForm() {
  return `<form id="order-filter" class="filters"><label>${t("search")}<input type="search" id="search" name="search" placeholder="${t("searchExample")}" value="${esc(s.search)}"></label><label>${t("state")}<select id="order-state"><option value="all">${t("any")}</option>${["pending", "processing", "unknown", "paid", "closed", "expired"].map((v) => `<option value="${v}" ${s.filter === v ? "selected" : ""}>${t(v)}</option>`).join("")}</select></label><button type="submit" class="primary">${t("filter")}</button>${button("clear", t("resetFilter"))}</form>`
}
function pagination(current, total, kind) {
  const max = Math.max(1, Math.ceil(total / 4))
  return `<nav class="pagination" aria-label="${t(kind === "orders" ? "orders" : "ledger")} ${t("page")}"><small>${total} ${t(kind === "orders" ? "orderCount" : "rows")} · ${current} / ${max} ${t("page")}</small><div class="actions">${button("prev-" + kind, t("prev"), false, current === 1)}${button("next-" + kind, t("next"), false, current === max)}</div></nav>`
}
function ordersPage() {
  const list =
    s.scenario === "empty"
      ? []
      : db().orders.filter(
          (o) =>
            (!s.search || o.id.toLowerCase().includes(s.search.toLowerCase())) &&
            (s.filter === "all" || o.status === s.filter)
        )
  s.orderPage = Math.min(s.orderPage, Math.max(1, Math.ceil(list.length / 4)))
  const rows = list.slice((s.orderPage - 1) * 4, s.orderPage * 4)
  return `${s.request ? notice(t("createWaitHint")) + button("restore-create", t("queryCreate"), true, s.busy) : ""}${filterForm()}${rows.length ? `<div class="table-wrap" role="region" aria-label="${t("orders")}" tabindex="0"><table><caption>${t("orders")} · ${esc(orgs[s.org])}</caption><thead><tr>${["orderId", "snapshot", "amount", "state", "created", "actions"].map((k) => `<th scope="col">${t(k)}</th>`).join("")}</tr></thead><tbody>${rows.map((o) => `<tr><th scope="row">${o.id}</th><td>${esc(name(o.product))}</td><td>${money(o.amount)}</td><td>${badge(o.status)}</td><td>${o.created}</td><td>${button("order", t(o.status === "pending" ? "continue" : o.status === "unknown" || o.status === "processing" ? "queryPay" : "details"), false, false, `data-id="${o.id}"`)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="panel empty"><h2>${t("emptyTitle")}</h2><p>${t("emptyHint")}</p></div>`}${pagination(s.orderPage, list.length, "orders")}`
}
function walletPage() {
  if (s.scenario === "noWallet") return notice(t("noWalletHint"), "error")
  if (s.scenario === "mismatch")
    return `<section class="panel"><h2>${t("orgWallet")}</h2><strong>${esc(orgs[s.org])} · USD</strong><p>${t("balance")}: ${money(db().balance, "USD")}</p>${notice(t("currencyHint"), "error")}</section>`
  const rows =
    s.scenario === "empty"
      ? []
      : db().ledger.filter((row) => s.ledgerType === "all" || row.type === s.ledgerType)
  s.ledgerPage = Math.min(s.ledgerPage, Math.max(1, Math.ceil(rows.length / 4)))
  return `<div class="wallet-hero"><section class="panel"><h2>${t("balance")}</h2><div class="balance">${money(s.scenario === "insufficient" ? 0 : db().balance)}</div><small>${t("demoOnly")}</small></section><section class="panel"><h2>${t("orgWallet")}</h2><strong>${esc(orgs[s.org])}</strong><small>${t("walletOwner")}</small><small>CNY · ${t(s.scenario === "frozen" ? "frozenLabel" : "available")}</small></section><section class="panel"><h2>${t("frozenBalance")}</h2><strong>${money(0)}</strong><small>${t("updated")}: 2000-01-01 18:00</small></section></div><div class="filters"><label>${t("type")}<select id="ledger-type">${["all", "expense", "income"].map((v) => `<option value="${v}" ${s.ledgerType === v ? "selected" : ""}>${t(v === "all" ? "any" : v)}</option>`).join("")}</select></label></div>${
    rows.length
      ? `<div class="table-wrap" role="region" aria-label="${t("ledger")}" tabindex="0"><table><caption>${t("ledger")}</caption><thead><tr>${["time", "type", "amount", "related"].map((k) => `<th scope="col">${t(k)}</th>`).join("")}</tr></thead><tbody>${rows
          .slice((s.ledgerPage - 1) * 4, s.ledgerPage * 4)
          .map(
            (row) =>
              `<tr><th scope="row">${row.time}</th><td>${t(row.type === "expense" ? "purchase" : "exampleCredit")}</td><td>${row.amount < 0 ? "−" : "+"}${money(Math.abs(row.amount))}</td><td>${row.id === "—" ? "—" : button("order", row.id, false, false, `data-id="${row.id}"`)}</td></tr>`
          )
          .join("")}</tbody></table></div>`
      : `<div class="panel empty"><h2>${t("noLedger")}</h2></div>`
  }${pagination(s.ledgerPage, rows.length, "ledger")}`
}
