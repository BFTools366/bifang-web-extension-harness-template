/* exported checkoutPage */
// 尚未提交的草稿只使用当前商品报价；不从这里读取或改写历史订单快照。
function checkoutSummary() {
  const p = product()
  const ready = variant === "A" || s.step === 3
  return `<aside class="summary checkout-summary"><h3>${t("summary")}</h3>${facts([
    [t("product"), p ? esc(name(p)) : t("noProduct")],
    [t("quantity"), "1"],
    [t("scope"), esc(orgs[s.org])],
    [t("payment"), s.wallet ? t("orgWallet") : t("notSelected")]
  ])}<div class="divider"></div><div class="total"><span>${t("total")}</span><strong>${p ? money(quoteAmount()) : "—"}</strong></div><small>${p ? t("quote") : t("selectHint")}</small>${!validQuote() ? notice(t("quoteExpired"), "error") + button("quote", t("refreshQuote")) : ""}${s.request ? notice(t("createWaitHint")) + button("restore-create", t("queryCreate"), true, s.busy) : button("create", s.busy ? t("wait") : t("confirm"), true, !ready || !canCreate(), 'id="create"')}<small class="summary-help">${!ready ? t("noSubmitYet") : t("buyHint")}</small></aside>`
}

// 两个候选只改变选购组织方式，分类和钱包校验复用相同的演示边界。
function purchaseSelection() {
  return `<div class="purchase-products"><div class="checkout-row"><h3>${t("categories")}</h3>${categories()}</div><div class="checkout-row"><h3>${t("choose")}</h3>${catalogProducts()}</div><div class="checkout-row quantity-row"><h3>${t("quantity")}</h3><div><span class="quantity-value">1</span><small>${t("choiceHint")}</small></div></div></div>`
}

function checkoutPage() {
  let selection
  if (variant === "A")
    selection =
      purchaseSelection() +
      `<div class="checkout-row"><h3>${t("payment")}</h3>${walletSelection()}</div>`
  else {
    const steps = `<nav class="steps" aria-label="${t("buy")}">${["step1", "step2", "step3"].map((key, i) => `<div class="step ${s.step === i + 1 ? "active" : ""}" ${s.step === i + 1 ? 'aria-current="step"' : ""}><span>${i + 1}</span>${t(key)}</div>`).join("")}</nav>`
    const content =
      s.step === 1
        ? purchaseSelection()
        : s.step === 2
          ? walletSelection()
          : `<section class="step-review"><h3>${t("selectedProduct")}</h3><strong>${esc(name(product()))}</strong><p>${t("choiceHint")}</p>${facts(
              [
                [t("payment"), t("orgWallet")],
                [t("scope"), esc(orgs[s.org])]
              ]
            )}<p>${t("stepHint")}</p></section>`
    selection =
      steps +
      `<h3 id="checkout-step" tabindex="-1">${t("step" + s.step)}</h3>` +
      content +
      `<div class="step-actions">${s.step > 1 ? button("back", t("back"), false, s.busy) : ""}${s.step < 3 ? button("next", t(s.step === 1 ? "toPay" : "toSummary"), true, s.step === 1 ? !product() : !s.wallet || !!walletProblem()) : ""}</div>`
  }
  return `<div class="checkout-grid"><div class="checkout-options">${selection}<small class="draft-hint">${t("draftHint")}</small></div>${checkoutSummary()}</div>`
}
