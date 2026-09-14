import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import { MAIN_WORKSPACE_APP_ID } from "./app-ids"
import { createControlCenter } from "./control-center"
import {
  createAppIcon,
  createDeviceApplication,
  DEVICE_APPS,
  type DeviceAppId,
  type DeviceApplication,
  type DeviceSoftwareDependencies,
} from "./device-applications"
import { element, listen } from "./dom"

type DesktopWindow = {
  readonly node: HTMLElement
  readonly app: DeviceApplication
  readonly cleanups: (() => void)[]
  minimized: boolean
}
const button = (label: string, className = "os-icon-button"): HTMLButtonElement => {
  const node = element("button", className, label)
  node.type = "button"
  return node
}

export const createDesktopOsApp = (options: DeviceSoftwareDependencies): ScreenAppDefinition => ({
  appId: MAIN_WORKSPACE_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const root = element("section", "screen-app workspace-launcher device-os desktop-os")
    root.setAttribute("aria-label", "TODŌU computer workspace")
    root.dataset["assetInstance"] = context.assetInstanceId.value
    const menu = element("header", "desktop-os-menubar")
    const system = button("◈", "desktop-os-system")
    system.setAttribute("aria-label", "系统设置")
    const currentTitle = element("strong", "desktop-os-app-title", "访达")
    const showDesktop = button("桌面")
    const search = button("搜索应用 ⌕")
    search.setAttribute("aria-label", "搜索应用")
    const expand = button("展开 ↗")
    expand.dataset["expandScreen"] = "true"
    expand.setAttribute("aria-label", "展开电脑窗口")
    const clock = element("time", "desktop-os-clock")
    const missionButton = button("窗口")
    missionButton.setAttribute("aria-label", "窗口总览")
    const controlButton = button("☷")
    controlButton.setAttribute("aria-label", "打开控制中心")
    const controlCenter = createControlCenter(options)
    menu.append(
      system,
      currentTitle,
      showDesktop,
      missionButton,
      search,
      expand,
      controlButton,
      clock,
    )
    const desk = element("div", "desktop-os-workarea")
    const widgets = element("div", "desktop-os-widgets")
    const calendarWidget = button("", "desktop-os-widget desktop-os-calendar")
    calendarWidget.setAttribute("aria-label", "打开日历")
    const dateLabel = element("span", "os-eyebrow")
    const day = element("strong", "desktop-os-date")
    const nextEvent = element("span", "os-secondary")
    calendarWidget.append(dateLabel, day, nextEvent)
    const notesWidget = button("", "desktop-os-widget desktop-os-notes")
    notesWidget.setAttribute("aria-label", "打开备忘录")
    const latestNote = element("strong", "")
    const latestPreview = element("span", "os-secondary")
    notesWidget.append(element("span", "os-eyebrow", "备忘录"), latestNote, latestPreview)
    widgets.append(calendarWidget, notesWidget)
    const shortcuts = element("nav", "desktop-os-shortcuts")
    shortcuts.setAttribute("aria-label", "桌面设备")
    const files = button("", "desktop-os-shortcut")
    files.append(createAppIcon("files"), element("span", "", "我的文件"))
    const phone = button("", "desktop-os-shortcut")
    phone.dataset["focusDevice"] = "phone-main"
    phone.append(element("span", "desktop-os-phone-glyph", "▯"), element("span", "", "我的手机"))
    shortcuts.append(files, phone)
    const website = button("", "desktop-os-shortcut")
    website.dataset["personalSite"] = "true"
    website.setAttribute("aria-label", "打开我的网站")
    website.append(
      element("span", "os-app-icon os-personal-site-icon", "F"),
      element("span", "", "我的网站"),
    )
    shortcuts.append(website)
    const windowsLayer = element("div", "desktop-os-windows")
    desk.append(widgets, shortcuts, windowsLayer)
    const dock = element("nav", "desktop-os-dock")
    dock.setAttribute("aria-label", "应用程序 Dock")
    const dockButtons = new Map<DeviceAppId, HTMLButtonElement>()
    const windows = new Map<DeviceAppId, DesktopWindow>()
    let topOrder = 1
    let activeId: DeviceAppId | null = null
    const searchSheet = element("section", "desktop-os-search")
    searchSheet.hidden = true
    searchSheet.setAttribute("aria-label", "应用搜索")
    const searchInput = element("input", "desktop-os-search-input")
    searchInput.type = "search"
    searchInput.placeholder = "搜索应用…"
    searchInput.setAttribute("aria-label", "搜索应用名称")
    const closeSearch = button("关闭")
    const searchHeader = element("div", "desktop-os-search-header")
    searchHeader.append(searchInput, closeSearch)
    const results = element("div", "desktop-os-search-results")
    searchSheet.append(searchHeader, results)
    const mission = element("section", "desktop-os-mission")
    mission.hidden = true
    mission.setAttribute("aria-label", "窗口总览")
    const missionHeader = element("header", "")
    const closeMission = button("完成")
    const missionList = element("div", "desktop-os-mission-list")
    missionHeader.append(element("h2", "", "所有窗口"), closeMission)
    mission.append(missionHeader, missionList)
    const dockMenu = element("div", "desktop-os-context")
    dockMenu.hidden = true
    const contextOpen = button("打开 / 显示")
    const contextMinimize = button("最小化")
    const contextClose = button("退出应用")
    dockMenu.append(contextOpen, contextMinimize, contextClose)
    let contextId: DeviceAppId | null = null
    root.append(menu, desk, dock, searchSheet, mission, dockMenu, controlCenter.element)
    host.append(root)
    const markWindows = (): void => {
      for (const [id, item] of dockButtons) {
        item.dataset["running"] = String(windows.has(id))
        item.setAttribute("aria-pressed", String(activeId === id && !windows.get(id)?.minimized))
      }
      for (const [id, entry] of windows) entry.node.dataset["front"] = String(activeId === id)
      currentTitle.textContent = DEVICE_APPS.find((app) => app.id === activeId)?.title ?? "访达"
      root.dataset["route"] = activeId ?? "home"
    }
    const bringForward = (id: DeviceAppId): void => {
      const entry = windows.get(id)
      if (entry === undefined) return
      entry.minimized = false
      entry.node.hidden = false
      entry.node.style.zIndex = String(++topOrder)
      activeId = id
      markWindows()
    }
    const remainingFront = (): void => {
      activeId = [...windows].reverse().find(([, item]) => !item.minimized)?.[0] ?? null
      if (activeId !== null) bringForward(activeId)
      else markWindows()
    }
    const openApp = (id: DeviceAppId): void => {
      mission.hidden = true
      dockMenu.hidden = true
      searchSheet.hidden = true
      context.requestAssetActivation()
      context.requestScreenFocus()
      if (windows.has(id)) {
        bringForward(id)
        return
      }
      const definition = DEVICE_APPS.find((app) => app.id === id)
      if (definition === undefined) return
      const node = element("section", "desktop-os-window")
      node.dataset["app"] = id
      node.setAttribute("aria-label", `${definition.title}窗口`)
      const cascade = windows.size % 4
      node.style.left = `${5 + cascade * 3}%`
      node.style.top = `${5 + cascade * 3}%`
      const titlebar = element("header", "desktop-os-titlebar")
      const controls = element("div", "desktop-os-traffic")
      const close = button("×", "desktop-os-light desktop-os-light--close")
      const minimize = button("−", "desktop-os-light desktop-os-light--minimize")
      const maximize = button("+", "desktop-os-light desktop-os-light--maximize")
      close.setAttribute("aria-label", `关闭${definition.title}`)
      minimize.setAttribute("aria-label", `最小化${definition.title}`)
      maximize.setAttribute("aria-label", `最大化${definition.title}`)
      controls.append(close, minimize, maximize)
      titlebar.append(
        controls,
        element("strong", "", definition.title),
        element("span", "desktop-os-title-hint", "TODŌU"),
      )
      const content = element("div", "desktop-os-window-body")
      const app = createDeviceApplication(id, options, context.assetInstanceId.value)
      content.append(app.element)
      node.append(titlebar, content)
      const cleanups: (() => void)[] = []
      const entry: DesktopWindow = { node, app, cleanups, minimized: false }
      windows.set(id, entry)
      windowsLayer.append(node)
      let drag: {
        pointerId: number
        x: number
        y: number
        left: number
        top: number
        scaleX: number
        scaleY: number
      } | null = null
      cleanups.push(
        listen(node, "pointerdown", () => bringForward(id)),
        listen(close, "click", () => {
          app.dispose()
          for (const cleanup of cleanups) cleanup()
          node.remove()
          windows.delete(id)
          remainingFront()
        }),
        listen(minimize, "click", () => {
          entry.minimized = true
          node.hidden = true
          remainingFront()
        }),
        listen(maximize, "click", () => {
          node.classList.toggle("desktop-os-window--maximized")
        }),
        listen(titlebar, "dblclick", (event) => {
          if (!(event.target instanceof Element) || !event.target.closest("button"))
            node.classList.toggle("desktop-os-window--maximized")
        }),
        listen(titlebar, "pointerdown", (event) => {
          if (
            event.button !== 0 ||
            (event.target instanceof Element && event.target.closest("button")) ||
            node.classList.contains("desktop-os-window--maximized")
          )
            return
          const rect = windowsLayer.getBoundingClientRect()
          drag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: node.offsetLeft,
            top: node.offsetTop,
            scaleX: windowsLayer.clientWidth / rect.width,
            scaleY: windowsLayer.clientHeight / rect.height,
          }
          titlebar.setPointerCapture(event.pointerId)
          event.preventDefault()
        }),
        listen(titlebar, "pointermove", (event) => {
          if (drag === null || drag.pointerId !== event.pointerId) return
          const x = drag.left + (event.clientX - drag.x) * drag.scaleX
          const y = drag.top + (event.clientY - drag.y) * drag.scaleY
          node.style.left = `${Math.max(0, Math.min(windowsLayer.clientWidth - node.offsetWidth, x))}px`
          node.style.top = `${Math.max(0, Math.min(windowsLayer.clientHeight - 60, y))}px`
        }),
        listen(titlebar, "pointerup", () => {
          drag = null
        }),
        listen(titlebar, "pointercancel", () => {
          drag = null
        }),
        listen(titlebar, "lostpointercapture", () => {
          drag = null
        }),
      )
      bringForward(id)
    }
    const showMission = (): void => {
      missionList.replaceChildren()
      for (const [id, entry] of windows) {
        const card = button("", "desktop-os-mission-card")
        card.dataset["windowId"] = id
        card.append(
          createAppIcon(id),
          element("strong", "", DEVICE_APPS.find((app) => app.id === id)?.title),
          element("span", "os-secondary", entry.minimized ? "已最小化 · 点击继续" : "点击继续"),
        )
        missionList.append(card)
      }
      if (!windows.size)
        missionList.append(element("p", "os-secondary", "从 Dock 打开应用，窗口会出现在这里。"))
      mission.hidden = false
      closeMission.focus()
    }
    const cleanups: (() => void)[] = []
    for (const definition of DEVICE_APPS) {
      const appButton = button("", "desktop-os-dock-item")
      appButton.setAttribute("aria-label", `打开${definition.title}`)
      appButton.title = definition.title
      appButton.dataset["appId"] = definition.id
      appButton.append(
        createAppIcon(definition.id),
        element("span", "desktop-os-dock-tooltip", definition.title),
      )
      dockButtons.set(definition.id, appButton)
      dock.append(appButton)
      cleanups.push(listen(appButton, "click", () => openApp(definition.id)))
      cleanups.push(
        listen(appButton, "contextmenu", (event) => {
          event.preventDefault()
          contextId = definition.id
          contextMinimize.disabled = !windows.has(contextId)
          contextClose.disabled = !windows.has(contextId)
          dockMenu.hidden = false
          contextOpen.focus()
        }),
      )
      const result = button("", "desktop-os-search-result")
      result.append(createAppIcon(definition.id), element("span", "", definition.title))
      result.dataset["searchText"] = `${definition.title} ${definition.id}`
      cleanups.push(listen(result, "click", () => openApp(definition.id)))
      results.append(result)
    }
    const renderData = (): void => {
      const data = options.dataService.read()
      root.dataset["appearance"] = data.preferences.appearance
      root.dataset["wallpaper"] = data.preferences.wallpaper
      root.dataset["reducedMotion"] = String(data.preferences.reducedMotion)
      const note = data.notes[0]
      latestNote.textContent = note?.title || "随手记下灵感"
      latestPreview.textContent = note?.text.slice(0, 90) || "点击开始一篇备忘录。"
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      const upcoming = data.events
        .filter((event) => event.date >= today)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]
      nextEvent.textContent = upcoming
        ? `${upcoming.time || "全天"} · ${upcoming.title}`
        : "今天，也留一点时间给自己。"
    }
    const updateClock = (): void => {
      const now = new Date()
      clock.textContent = now.toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
      clock.dateTime = now.toISOString()
      dateLabel.textContent = now.toLocaleDateString("zh-CN", { weekday: "long", month: "long" })
      day.textContent = String(now.getDate())
    }
    cleanups.push(
      listen(controlButton, "click", controlCenter.toggle),
      listen(missionButton, "click", showMission),
      listen(closeMission, "click", () => {
        mission.hidden = true
        missionButton.focus()
      }),
      listen(missionList, "click", (event) => {
        if (!(event.target instanceof Element)) return
        const id = event.target.closest<HTMLElement>("[data-window-id]")?.dataset["windowId"]
        const definition = DEVICE_APPS.find((app) => app.id === id)
        if (definition) openApp(definition.id)
      }),
      listen(contextOpen, "click", () => {
        if (contextId) openApp(contextId)
      }),
      listen(contextMinimize, "click", () => {
        if (contextId)
          windows
            .get(contextId)
            ?.node.querySelector<HTMLButtonElement>(".desktop-os-light--minimize")
            ?.click()
        dockMenu.hidden = true
      }),
      listen(contextClose, "click", () => {
        if (contextId)
          windows
            .get(contextId)
            ?.node.querySelector<HTMLButtonElement>(".desktop-os-light--close")
            ?.click()
        dockMenu.hidden = true
      }),
      listen(root, "pointerdown", (event) => {
        if (event.target instanceof Node && !dockMenu.contains(event.target)) dockMenu.hidden = true
      }),
      listen(root, "keydown", (event) => {
        if (event.isComposing) return
        if (
          event.key === "Escape" &&
          (!mission.hidden || !searchSheet.hidden || !dockMenu.hidden)
        ) {
          event.preventDefault()
          event.stopPropagation()
          mission.hidden = true
          searchSheet.hidden = true
          dockMenu.hidden = true
          search.focus()
        } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "Space") {
          event.preventDefault()
          searchSheet.hidden = false
          searchInput.focus()
        } else if (
          event.altKey &&
          activeId !== null &&
          ["w", "m"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault()
          windows
            .get(activeId)
            ?.node.querySelector<HTMLButtonElement>(
              event.key.toLowerCase() === "w"
                ? ".desktop-os-light--close"
                : ".desktop-os-light--minimize",
            )
            ?.click()
        } else if (event.altKey && event.key === "ArrowRight") {
          event.preventDefault()
          const ids = [...windows.keys()]
          const id = ids[(ids.findIndex((id) => id === activeId) + 1) % ids.length]
          if (id) bringForward(id)
        }
      }),
      listen(system, "click", () => openApp("settings")),
      listen(showDesktop, "click", () => {
        for (const entry of windows.values()) {
          entry.minimized = true
          entry.node.hidden = true
        }
        activeId = null
        markWindows()
      }),
      listen(search, "click", () => {
        searchSheet.hidden = !searchSheet.hidden
        if (!searchSheet.hidden) searchInput.focus()
      }),
      listen(closeSearch, "click", () => {
        searchSheet.hidden = true
      }),
      listen(searchInput, "input", () => {
        for (const item of results.children)
          if (item instanceof HTMLElement)
            item.hidden = !item.dataset["searchText"]
              ?.toLowerCase()
              .includes(searchInput.value.trim().toLowerCase())
      }),
      listen(searchInput, "keydown", (event) => {
        if (event.key === "Enter")
          results.querySelector<HTMLButtonElement>("button:not([hidden])")?.click()
      }),
      listen(calendarWidget, "click", () => openApp("calendar")),
      listen(notesWidget, "click", () => openApp("notes")),
      listen(files, "click", () => openApp("files")),
      listen(website, "click", () => {
        openApp("browser")
        try {
          options.browserService.openPersonalSite(context.assetInstanceId.value)
        } catch {
          options.browserService.navigate(
            context.assetInstanceId.value,
            options.browserService.personalSiteUrl,
          )
        }
      }),
      options.dataService.subscribe(renderData),
    )
    renderData()
    updateClock()
    const timer = setInterval(updateClock, 15000)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        clearInterval(timer)
        controlCenter.dispose()
        for (const cleanup of cleanups) cleanup()
        for (const entry of windows.values()) {
          entry.app.dispose()
          for (const cleanup of entry.cleanups) cleanup()
        }
        windows.clear()
      },
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: () => undefined,
    }
  },
})
