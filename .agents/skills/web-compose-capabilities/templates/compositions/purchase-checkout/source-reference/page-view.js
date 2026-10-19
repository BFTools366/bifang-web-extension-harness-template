/* exported render, dialogKind, returnFocus, returnAction, returnId, openDialog, closeDialog */
function render(focus = false) {
  const previousFocus = document.activeElement
  document.documentElement.lang = s.lang === "zh" ? "zh-CN" : "en"
  document.title = `${t(s.page)} · 示例应用`
  $("brand-sub").textContent = t("client")
  $("breadcrumb").textContent = t("bread") + t(s.page)
  $("org-label").textContent = t("org")
  $("context-user").textContent = t("user")
  $("language").textContent = s.lang === "zh" ? "English" : "中文"
  $("theme").textContent = t("theme")
  $("account").setAttribute("aria-label", t("account"))
  for (const id of ["org", "org-side"]) {
    $(id).innerHTML = Object.entries(orgs)
      .map(
        ([key, value]) =>
          `<option value="${key}" ${s.org === key ? "selected" : ""}>${value}</option>`
      )
      .join("")
    $(id).setAttribute("aria-label", t("org"))
  }
  $("nav").setAttribute("aria-label", t("entry"))
  $("nav").innerHTML = (
    s.scenario === "forbidden" ? ["account"] : ["catalog", "orders", "wallet", "account"]
  )
    .map(
      (page) =>
        `<a href="#${page}" ${s.page === page ? 'aria-current="page"' : ""}>${icon(page)}${t(page)}</a>`
    )
    .join("")
  let content
  if (s.page !== "account" && s.scenario === "forbidden")
    content = `<section class="panel empty"><h2>${t("gate")}</h2><p>${t("gateHint")}</p></section>`
  else if (s.loading) content = `<div class="panel empty" aria-busy="true">${t("loading")}</div>`
  else if (s.scenario === "error" && s.page !== "account")
    content = notice(t("loadError"), "error") + button("retry", t("retry"), true)
  else
    content =
      s.page === "catalog"
        ? catalogPage()
        : s.page === "orders"
          ? ordersSurface()
          : s.page === "wallet"
            ? walletPage()
            : `<section class="panel">${facts([
                [t("account"), "demo"],
                [t("org"), esc(orgs[s.org])],
                [t("accountRefresh"), String(s.refreshCount)]
              ])}<p class="muted" style="margin-top:22px">${t("accountHint")}</p></section>`
  const expanded = $("demo-controls")?.open
  $("main").innerHTML =
    pageHeading() +
    controls() +
    (s.notice ? notice(t(s.notice.key), s.notice.kind) : "") +
    content +
    `<footer>${t("footer")}</footer>`
  if (expanded) $("demo-controls").open = true
  if (focus) $("main").querySelector("h1").focus({ preventScroll: true })
  else if (previousFocus && previousFocus !== document.body && !previousFocus.isConnected) {
    const replacement = [...document.querySelectorAll("button,input,select,a,h1")].find((item) => {
      if (previousFocus.id) return item.id === previousFocus.id
      if (previousFocus.dataset.action)
        return (
          item.dataset.action === previousFocus.dataset.action &&
          (item.dataset.id ?? null) === (previousFocus.dataset.id ?? null) &&
          (item.dataset.filter ?? null) === (previousFocus.dataset.filter ?? null)
        )
      if (previousFocus.name)
        return item.name === previousFocus.name && item.value === previousFocus.value
      if (previousFocus.tagName === "A")
        return item.getAttribute("href") === previousFocus.getAttribute("href")
      return previousFocus.tagName === "H1" && item.tagName === "H1"
    })
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true })
    else if (replacement?.closest("nav")) {
      const region = replacement.closest("nav")
      region.tabIndex = -1
      region.focus({ preventScroll: true })
    }
  }
}
let dialogKind = null,
  returnFocus = null,
  returnAction = null,
  returnId = null
function openDialog(kind) {
  dialogKind = kind
  if (document.activeElement !== document.body && !$("dialog").contains(document.activeElement)) {
    returnFocus = document.activeElement
  }
  renderDialog()
  if (!$("dialog").open) $("dialog").showModal()
}
function closeDialog() {
  if ($("dialog").open) $("dialog").close()
  dialogKind = null
  const replacement = returnAction
    ? [...document.querySelectorAll("[data-action]")].find(
        (item) => item.dataset.action === returnAction && (item.dataset.id ?? null) === returnId
      )
    : null
  const target =
    returnFocus?.isConnected && returnFocus !== document.body
      ? returnFocus
      : (replacement ?? $("main").querySelector("h1"))
  target?.focus({ preventScroll: true })
}
