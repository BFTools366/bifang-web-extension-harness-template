/* exported icon, button, announce, badge, facts, notice, product, quoteAmount, walletProblem, validQuote, canCreate, pageHeading, controls, categories, catalogProducts, walletSelection */
function icon(kind) {
  const paths = {
    catalog: "M3 7h18v14H3z M3 7l3-4h12l3 4 M9 11h6",
    orders: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
    wallet: "M3 6h17v15H3z M3 6V3h15v3 M15 11h6v5h-6z",
    account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3"
  }
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${paths[kind]}"/></svg>`
}
function button(action, label, primary = false, disabled = false, extra = "") {
  return `<button type="button" data-action="${action}" ${extra} class="${primary ? "primary" : ""}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`
}
function announce(message) {
  $("live").textContent = message
}
function badge(status) {
  return `<span class="badge ${status}">${t(status)}</span>`
}
function facts(items) {
  return `<dl class="facts">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`
}
function notice(message, kind = "") {
  return `<div class="notice ${kind}">${message}</div>`
}
function product() {
  return products.find((p) => p.id === s.product)
}
function quoteAmount() {
  return product() ? product().amount + (s.priceAccepted ? 1000 : 0) : 0
}
function walletProblem(amount = quoteAmount()) {
  const reasons = {
    noWallet: "noWalletHint",
    insufficient: "lowHint",
    frozen: "frozenHint",
    mismatch: "currencyHint"
  }
  return reasons[s.scenario] ?? (amount > db().balance ? "lowHint" : null)
}
function validQuote() {
  return s.scenario !== "expiredQuote" || s.quoteFresh
}
function canCreate() {
  return !!product() && s.wallet && validQuote() && !walletProblem() && !s.busy && !s.request
}
function pageHeading() {
  const sub =
    s.page === "catalog"
      ? "intro"
      : s.page === "orders"
        ? "orderIntro"
        : s.page === "wallet"
          ? "walletIntro"
          : "accountHint"
  const allowed = s.scenario !== "forbidden"
  const actions =
    s.page === "catalog" && allowed
      ? button("launch", "+ " + t("buy"), true, s.busy, 'id="launch"') +
        button("refresh", t("refresh"), false, s.busy)
      : s.page !== "account" && allowed
        ? button("refresh", t("refresh"), false, s.busy)
        : ""
  return `<div class="heading"><div><h1 tabindex="-1">${t(s.page)}</h1><p>${t(sub)}</p></div><div class="heading-actions">${actions}</div></div>`
}
function controls() {
  const choices = [
    "normal",
    "empty",
    "error",
    "forbidden",
    "noWallet",
    "insufficient",
    "frozen",
    "mismatch",
    "expiredQuote",
    "priceChanged",
    "createUnknown",
    "payUnknown",
    "refreshFailed"
  ]
  return `<details class="demo" id="demo-controls"><summary>${t("demo")}<br><small>${t("try")}</small></summary><div class="demo-controls"><label>${t("scenario")}<select id="scenario">${choices.map((v) => `<option value="${v}" ${s.scenario === v ? "selected" : ""}>${t(v)}</option>`).join("")}</select></label>${button("reset", t("reset"))}</div><small>${t("navHint")}</small></details>`
}
function categories() {
  const choice = (key) =>
    `<button type="button" data-category="${key}" aria-pressed="${s.category === key}">${t(key)}</button>`
  return `<aside class="panel categories" aria-label="${t("categories")}"><h2>${t("categories")}</h2>${choice("all")}<details open><summary>${t("expand")}</summary>${choice("services")}<div class="nested">${choice("basic", true)}${choice("team", true)}</div></details>${choice("resource")}</aside>`
}
function catalogProducts() {
  const list =
    s.scenario === "empty"
      ? []
      : products.filter(
          (p) =>
            s.category === "all" ||
            p.cat === s.category ||
            (s.category === "services" && ["basic", "team"].includes(p.cat))
        )
  return `<div class="catalog"><div class="section-top"><div><small>${t("path")}: ${t(s.category)}</small><h2>${t("choose")}</h2></div><small>${list.length} ${t("count")}</small></div>${list.length ? `<div class="products" role="group" aria-label="${t("choose")}">${list.map((p) => `<label class="product"><input type="radio" name="product" value="${p.id}" ${s.product === p.id ? "checked" : ""}><span><strong>${esc(name(p))}</strong><span class="price">${money(p.amount)}</span><small>${esc(p.desc[s.lang === "zh" ? 0 : 1])}</small><small>${t("unit")}</small></span></label>`).join("")}</div>` : `<div class="panel empty"><h2>${t("emptyTitle")}</h2><p>${t("emptyHint")}</p>${button("clear", t("resetFilter"))}</div>`}</div>`
}
function walletSelection(amount = quoteAmount(), modal = false) {
  const reason = walletProblem(amount)
  return `<section class="${modal ? "" : "panel payment"}"><h3>${t("payment")}</h3><p class="muted">${t("payHint")}</p>${s.scenario === "noWallet" ? notice(t("noWalletHint"), "error") : `<label class="wallet-choice"><input type="radio" name="${modal ? "modal-wallet" : "wallet"}" ${s.wallet ? "checked" : ""} ${reason || (!product() && !modal) ? "disabled" : ""}><span><strong>${t("orgWallet")}</strong><small>${esc(orgs[s.org])} · ${s.scenario === "mismatch" ? "USD" : "CNY"}</small><small>${t("balance")}: ${money(s.scenario === "insufficient" ? 0 : db().balance, s.scenario === "mismatch" ? "USD" : "CNY")}</small><small>${t("status")}: ${t(s.scenario === "frozen" ? "frozenLabel" : "available")}</small></span></label>`}${reason && s.scenario !== "noWallet" ? notice(t(reason), "error") : ""}<small style="margin-top:12px">${t("scopeHint")}</small></section>`
}
