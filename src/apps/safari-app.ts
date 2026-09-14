import type { BrowserTab, WorkspaceBrowserService } from "../services/workspace-browser-service"
import type { WorkspaceFilesService } from "../services/workspace-files-service"
import { connectBrowserSite } from "./browser-site-bridge"
import type { BrowserPolicy } from "./browser-url-policy"
import { element, listen } from "./dom"

const button = (label: string, text = label, css = "os-icon-button"): HTMLButtonElement => {
  const node = element("button", css, text)
  node.type = "button"
  node.setAttribute("aria-label", label)
  return node
}
export const createSafariApp = (
  policy: BrowserPolicy,
  service: WorkspaceBrowserService,
  files: WorkspaceFilesService,
  instance: string,
): { readonly element: HTMLElement; dispose(): void } => {
  const root = element("section", "safari-app")
  root.setAttribute("aria-label", "浏览器")
  const tabbar = element("nav", "safari-tabs")
  tabbar.setAttribute("aria-label", "浏览器标签页")
  const tablist = element("div", "safari-tab-list")
  const add = button("新建标签页", "+")
  tabbar.append(tablist, add)
  const toolbar = element("form", "safari-toolbar")
  const back = button("后退", "‹")
  const forward = button("前进", "›")
  const home = button("浏览器起始页", "⌂")
  const reload = button("刷新", "↻")
  const input = element("input", "safari-address")
  input.type = "search"
  input.placeholder = "搜索或输入网站地址"
  input.setAttribute("aria-label", input.placeholder)
  input.dataset["testid"] = "launcher-browser-input"
  const go = button("前往网站", "↵")
  go.type = "submit"
  const star = button("收藏当前网页", "☆")
  const overview = button("标签页总览", "▢")
  toolbar.append(back, forward, home, reload, input, go, star, overview)
  const start = element("div", "safari-start")
  const favorites = element("div", "safari-favorites")
  const history = element("div", "safari-history")
  start.append(
    element("span", "os-eyebrow", "在你的设备中探索"),
    element("h2", "", "你的下一站。"),
    favorites,
    element("h3", "", "最近浏览"),
    history,
  )
  const feedback = element("p", "safari-feedback")
  feedback.setAttribute("role", "status")
  const frame = element("iframe", "safari-frame")
  frame.title = "网站内容"
  frame.referrerPolicy = policy.referrerPolicy
  frame.dataset["testid"] = "launcher-browser-frame"
  const sheet = element("section", "safari-tab-overview")
  sheet.hidden = true
  const sheetHeader = element("header", "safari-overview-header")
  const sheetDone = button("完成标签管理", "完成")
  sheetHeader.append(element("h2", "", "标签页"), sheetDone)
  const cards = element("div", "safari-tab-cards")
  sheet.append(sheetHeader, cards)
  root.append(tabbar, toolbar, start, feedback, frame, sheet)
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  let handshakeTimer: ReturnType<typeof setInterval> | undefined
  let loadedKey = ""
  let frameTabId = ""
  let loading = false
  let disposed = false
  const setLoading = (value: boolean): void => {
    loading = value
    reload.textContent = value ? "×" : "↻"
    reload.setAttribute("aria-label", value ? "停止载入" : "刷新")
    root.dataset["loading"] = String(value)
  }
  const report = (text: string): void => {
    feedback.textContent = text
    feedback.hidden = !text
  }
  const attempt = (action: () => void): void => {
    try {
      action()
    } catch (error) {
      report(error instanceof Error ? error.message : "无法完成操作")
    }
  }
  const navigate = (raw: string, newTab = false): void => {
    if (!raw) {
      service.navigate(instance, "")
      return
    }
    const decision = policy.evaluate(raw)
    if (decision.kind === "reject") {
      report("请输入有效的 HTTPS 地址，不支持脚本或含登录凭据的地址。")
      return
    }
    attempt(() => {
      if (newTab) service.newTab(instance, decision.url)
      else service.navigate(instance, decision.url)
    })
  }
  const bridge = connectBrowserSite({
    frame,
    policy,
    files,
    onPage: (page) => {
      clearTimeout(loadTimer)
      clearInterval(handshakeTimer)
      setLoading(false)
      report("")
      service.recordPage(instance, frameTabId, page)
    },
    onOpen: navigate,
    onDownload: () => report("已加入下载，可在「文件」中查看进度。"),
    onWorkspace: () => {
      const control = element("button", "")
      control.dataset["focusDevice"] = "computer-main"
      control.hidden = true
      root.append(control)
      control.click()
      control.remove()
    },
  })
  const openFrame = (tab: BrowserTab): void => {
    const key = tab.id + ":" + tab.revision
    if (loadedKey === key) return
    loadedKey = key
    frameTabId = tab.id
    clearTimeout(loadTimer)
    clearInterval(handshakeTimer)
    const address = tab.history[tab.index] ?? ""
    const decision = address ? policy.evaluate(address) : null
    start.hidden = !!decision
    frame.hidden = decision?.kind !== "embed"
    bridge.navigate(decision?.kind === "embed" ? decision.url : "")
    if (decision?.kind !== "embed") {
      frame.removeAttribute("src")
      setLoading(false)
      report(decision ? "此网站未开放设备内嵌入。地址保留在当前标签，不会打开真实浏览器窗口。" : "")
      return
    }
    frame.setAttribute("sandbox", policy.sandboxFor(decision.url))
    frame.src = decision.url
    // Do not wait for every font/image to finish before connecting an already interactive page.
    let attempts = 0
    const hello = (): void => {
      bridge.tell({
        type: "hello",
        scrollY: tab.scrollY,
        visible: !root.hidden && !document.hidden,
      })
      if (++attempts >= 30) clearInterval(handshakeTimer)
    }
    if (policy.isPersonalSite(decision.url)) handshakeTimer = setInterval(hello, 500)
    setLoading(true)
    report("正在载入…")
    loadTimer = setTimeout(() => {
      setLoading(false)
      report("网站尚未确认响应；可点刷新重试。网络或网站的嵌入限制可能阻止显示。")
    }, 15000)
  }
  const tabNodes = new Map<string, { row: HTMLElement; select: HTMLButtonElement }>()
  const renderCards = (): void => {
    cards.replaceChildren()
    for (const tab of service.read(instance).tabs) {
      const card = element("article", "safari-tab-card")
      const select = button(tab.title, tab.title, "safari-card-select")
      select.dataset["selectTab"] = tab.id
      select.append(element("small", "", tab.history[tab.index] || "起始页"))
      const close = button("关闭 " + tab.title, "×")
      close.dataset["closeTab"] = tab.id
      card.append(select, close)
      cards.append(card)
    }
  }
  let lastPresentation = ""
  const render = (): void => {
    const session = service.read(instance)
    const active = session.tabs.find((tab) => tab.id === session.activeId)
    if (!active) return
    // Scroll reports retain state without rebuilding app chrome.
    const signature = JSON.stringify([
      session.activeId,
      session.tabs.map(({ scrollY: _scroll, ...tab }) => tab),
      service.favorites(),
    ])
    if (signature === lastPresentation) return
    lastPresentation = signature
    for (const [id, node] of tabNodes)
      if (!session.tabs.some((tab) => tab.id === id)) {
        node.row.remove()
        tabNodes.delete(id)
      }
    for (const tab of session.tabs) {
      let node = tabNodes.get(tab.id)
      if (!node) {
        const row = element("div", "safari-tab")
        const select = button("", "", "safari-tab-select")
        select.dataset["selectTab"] = tab.id
        const close = button("关闭标签", "×", "safari-tab-close")
        close.dataset["closeTab"] = tab.id
        row.append(select, close)
        node = { row, select }
        tabNodes.set(tab.id, node)
        tablist.append(row)
      }
      node.select.textContent = tab.title
      node.select.setAttribute("aria-label", "切换标签：" + tab.title)
      node.select.setAttribute("aria-pressed", String(tab.id === active.id))
    }
    if (document.activeElement !== input) input.value = active.history[active.index] ?? ""
    back.disabled = active.index === 0
    forward.disabled = active.index === active.history.length - 1
    const address = active.history[active.index] ?? ""
    star.disabled = !address
    star.textContent = service.favorites().some((item) => item.url === address) ? "★" : "☆"
    favorites.replaceChildren()
    for (const item of service.favorites()) {
      const favorite = button(item.title, "", "safari-favorite")
      favorite.dataset["address"] = item.url
      favorite.append(
        element("span", "", policy.isPersonalSite(item.url) ? "F" : "↗"),
        element("strong", "", item.title),
      )
      favorites.append(favorite)
    }
    history.replaceChildren()
    for (const url of [...new Set(session.tabs.flatMap((tab) => tab.history))]
      .filter(Boolean)
      .slice(-6)
      .reverse()) {
      const link = button(url, url, "safari-history-link")
      link.dataset["address"] = url
      history.append(link)
    }
    if (!sheet.hidden) renderCards()
    openFrame(active)
  }
  const selectTab = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return
    const node = event.target.closest<HTMLElement>("button")
    if (node?.dataset["selectTab"]) {
      service.activate(instance, node.dataset["selectTab"])
      sheet.hidden = true
    }
    if (node?.dataset["closeTab"]) service.close(instance, node.dataset["closeTab"])
  }
  const cleanups = [
    service.subscribe(render),
    listen(toolbar, "submit", (event) => {
      event.preventDefault()
      const value = input.value.trim()
      if (!value) {
        navigate("")
        return
      }
      navigate(
        /\s/.test(value) || !/[.:/]/.test(value)
          ? "https://duckduckgo.com/?q=" + encodeURIComponent(value)
          : value,
      )
      input.blur()
    }),
    listen(back, "click", () => service.travel(instance, -1)),
    listen(forward, "click", () => service.travel(instance, 1)),
    listen(home, "click", () => navigate("")),
    listen(add, "click", () =>
      attempt(() => {
        service.newTab(instance)
        input.focus()
      }),
    ),
    listen(star, "click", () => {
      const session = service.read(instance)
      const tab = session.tabs.find((item) => item.id === session.activeId)
      if (tab) service.toggleFavorite(tab.history[tab.index] ?? "", tab.title)
    }),
    listen(overview, "click", () => {
      sheet.hidden = !sheet.hidden
      if (!sheet.hidden) renderCards()
    }),
    listen(sheetDone, "click", () => {
      sheet.hidden = true
    }),
    listen(tablist, "click", selectTab),
    listen(cards, "click", selectTab),
    listen(start, "click", (event) => {
      if (event.target instanceof Element) {
        const url = event.target.closest<HTMLElement>("[data-address]")?.dataset["address"]
        if (url) navigate(url)
      }
    }),
    listen(reload, "click", () => {
      if (!loading) {
        service.reload(instance)
        return
      }
      clearTimeout(loadTimer)
      bridge.navigate("")
      clearInterval(handshakeTimer)
      frame.removeAttribute("src")
      setLoading(false)
      report("已停止载入，点击刷新可重试。")
    }),
    listen(frame, "load", () => {
      if (!frame.hasAttribute("src") || disposed) return
      clearTimeout(loadTimer)
      setLoading(false)
      report("")
      const tab = service.read(instance).tabs.find((item) => item.id === frameTabId)
      bridge.tell({
        type: "hello",
        scrollY: tab?.scrollY ?? 0,
        visible: !root.hidden && !document.hidden,
      })
    }),
    listen(root, "keydown", (event) => {
      if (event.key === "Escape" && !sheet.hidden) {
        event.preventDefault()
        sheet.hidden = true
        overview.focus()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault()
        event.stopPropagation()
        input.focus()
        input.select()
      }
    }),
  ]
  render()
  return {
    element: root,
    dispose: () => {
      disposed = true
      clearTimeout(loadTimer)
      bridge.dispose()
      clearInterval(handshakeTimer)
      for (const cleanup of cleanups) cleanup()
      frame.removeAttribute("src")
    },
  }
}
