/* exported catalogPage, ordersSurface */
// 费用概览只从当前组织的演示服务结果计算，不复制参考图的套餐或配额。
function catalogPage() {
  const orders = s.scenario === "empty" ? [] : db().orders
  const balance =
    s.scenario === "noWallet"
      ? "—"
      : money(
          s.scenario === "insufficient" ? 0 : db().balance,
          s.scenario === "mismatch" ? "USD" : "CNY"
        )
  const cards = [
    ["wallet", "balance", balance, "wallet-ledger", "walletBill", ""],
    [
      "orders",
      "pending",
      orders.filter((o) => o.status === "pending").length,
      "filter-orders",
      "seeOrders",
      "pending"
    ],
    [
      "orders",
      "paid",
      orders.filter((o) => o.status === "paid").length,
      "filter-orders",
      "seeOrders",
      "paid"
    ],
    ["catalog", "totalOrders", orders.length, "filter-orders", "seeOrders", "all"]
  ]
  return `<section class="overview" aria-label="${t("overview")}">${cards.map(([kind, title, value, action, label, filter]) => `<article class="overview-card">${icon(kind)}<div class="metric"><h2>${t(title)}</h2><strong>${value}</strong><small>${title === "balance" ? (s.scenario === "mismatch" ? "USD" : "CNY") + " · " + esc(orgs[s.org]) : t("statusCount")}</small>${button(action, t(label), false, s.busy, `data-filter="${filter}"`)}</div></article>`).join("")}</section>${ordersSurface()}`
}

// 概览和订单页共用同一列表状态与表单，避免重复的筛选、分页和交易入口。
function ordersSurface() {
  return `<section class="records-panel"><div class="records-heading"><h2>${t("orderRecords")}</h2><small>${esc(orgs[s.org])} · CNY</small></div>${ordersPage()}</section>`
}
