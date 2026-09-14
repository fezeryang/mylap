import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import { PHONE_SHELL_APP_ID } from "./app-ids"
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
import { createMediaControls } from "./media-controls"

const button = (label: string, css: string): HTMLButtonElement => {
  const node = element("button", css, label)
  node.type = "button"
  return node
}

export const createPhoneOsApp = (options: DeviceSoftwareDependencies): ScreenAppDefinition => ({
  appId: PHONE_SHELL_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const root = element("section", "screen-app phone-shell device-os")
    root.setAttribute("aria-label", "TODŌU phone workspace")
    root.dataset["assetInstance"] = context.assetInstanceId.value
    const status = element("header", "phone-os-status")
    const time = element("time", "phone-os-time")

    const island = element("div", "phone-os-island")
    island.dataset["expanded"] = "false"
    const islandTrigger = button("♪ 音乐", "phone-os-island-trigger")
    islandTrigger.setAttribute("aria-label", "展开正在播放")
    islandTrigger.setAttribute("aria-expanded", "false")
    const expandedContent = element("div", "phone-os-island-expanded")
    const islandPlayer = createMediaControls(options)
    const islandActions = element("div", "phone-os-island-footer")
    const dismissButton = button("收起", "os-icon-button")
    const viewButton = button("打开音乐 ↗", "os-icon-button")
    islandActions.append(dismissButton, viewButton)
    expandedContent.append(islandPlayer.element, islandActions)
    island.append(islandTrigger, expandedContent)
    const islandBackdrop = element("div", "phone-os-island-backdrop")
    islandBackdrop.dataset["visible"] = "false"
    const controlCenter = createControlCenter(options)
    const controlTrigger = button("☷", "phone-os-control-trigger")
    controlTrigger.setAttribute("aria-label", "打开控制中心")
    const expand = button("↗", "phone-os-expand")
    expand.dataset["expandScreen"] = "true"
    expand.setAttribute("aria-label", "展开手机窗口")
    const statusActions = element("div", "phone-os-status-actions")
    statusActions.append(controlTrigger, expand)
    status.append(time, island, statusActions)
    const home = element("section", "phone-os-home")
    const date = element("p", "phone-os-date")
    const clock = element("div", "phone-os-big-clock")
    const widgets = element("div", "phone-os-widgets")
    const calendar = button("", "phone-os-widget phone-os-calendar")
    calendar.setAttribute("aria-label", "打开日历")
    const day = element("strong", "phone-os-widget-day")
    const eventLabel = element("span", "")
    calendar.append(element("span", "os-eyebrow", "今天"), day, eventLabel)
    const reminder = button("", "phone-os-widget phone-os-reminders")
    reminder.setAttribute("aria-label", "打开提醒事项")
    const reminderCount = element("strong", "phone-os-widget-day")
    const reminderText = element("span", "")
    reminder.append(element("span", "os-eyebrow", "提醒事项"), reminderCount, reminderText)
    widgets.append(calendar, reminder)
    const grid = element("nav", "phone-os-grid")
    grid.setAttribute("aria-label", "主屏幕应用")
    const search = button("⌕ 搜索", "phone-os-search-button")
    const dock = element("nav", "phone-os-dock")
    dock.setAttribute("aria-label", "手机 Dock")
    home.append(date, clock, widgets, grid, search, dock)
    const apps = element("div", "phone-os-apps")
    apps.hidden = true
    const appHeader = element("header", "phone-os-app-header")
    const back = button("‹ 主屏幕", "os-icon-button")
    const title = element("strong", "")
    const switcherButton = button("▢", "os-icon-button")
    switcherButton.setAttribute("aria-label", "切换应用")
    appHeader.append(back, title, switcherButton)
    const appContent = element("div", "phone-os-app-content")
    apps.append(appHeader, appContent)
    const library = element("section", "phone-os-library")
    library.hidden = true
    const searchHeader = element("header", "phone-os-library-header")
    const input = element("input", "phone-os-search-input")
    input.type = "search"
    input.placeholder = "搜索应用"
    input.setAttribute("aria-label", "搜索手机应用")
    const cancel = button("取消", "os-icon-button")
    searchHeader.append(input, cancel)
    const libraryItems = element("div", "phone-os-library-items")
    library.append(searchHeader, libraryItems)
    const switcher = element("section", "phone-os-switcher")
    switcher.hidden = true
    const switcherHeader = element("header", "phone-os-library-header")
    const done = button("完成", "os-icon-button")
    switcherHeader.append(element("h2", "", "最近使用"), done)
    const recentList = element("div", "phone-os-recent-list")
    switcher.append(switcherHeader, recentList)
    const indicator = button("", "phone-os-home-indicator")
    indicator.setAttribute("aria-label", "返回手机主屏幕")
    root.append(
      islandBackdrop,
      status,
      home,
      apps,
      library,
      switcher,
      indicator,
      controlCenter.element,
    )
    host.append(root)
    const mounted = new Map<DeviceAppId, DeviceApplication>()
    const recent: DeviceAppId[] = []
    let active: DeviceAppId | null = null
    const returnHome = (): void => {
      active = null
      home.hidden = false
      apps.hidden = true
      switcher.hidden = true
      library.hidden = true
      root.dataset["route"] = "home"
    }
    const open = (id: DeviceAppId): void => {
      context.requestAssetActivation()
      context.requestScreenFocus()
      if (!mounted.has(id)) {
        const app = createDeviceApplication(id, options, context.assetInstanceId.value)
        mounted.set(id, app)
        appContent.append(app.element)
      }
      for (const [key, app] of mounted) app.element.hidden = key !== id
      active = id
      const old = recent.indexOf(id)
      if (old !== -1) recent.splice(old, 1)
      recent.unshift(id)
      title.textContent = DEVICE_APPS.find((item) => item.id === id)?.title ?? ""
      home.hidden = true
      apps.hidden = false
      switcher.hidden = true
      library.hidden = true
      root.dataset["route"] = id
    }
    const cleanups: (() => void)[] = []
    const website = button("", "phone-os-app-icon")
    website.dataset["personalSite"] = "true"
    website.setAttribute("aria-label", "打开我的网站")
    website.append(
      element("span", "os-app-icon os-personal-site-icon", "F"),
      element("span", "phone-os-app-label", "我的网站"),
    )
    grid.append(website)
    cleanups.push(
      listen(website, "click", () => {
        open("browser")
        try {
          options.browserService.openPersonalSite(context.assetInstanceId.value)
        } catch {
          options.browserService.navigate(
            context.assetInstanceId.value,
            options.browserService.personalSiteUrl,
          )
        }
      }),
    )
    for (const definition of DEVICE_APPS) {
      const makeIconButton = (css: string): HTMLButtonElement => {
        const node = button("", css)
        node.dataset["appId"] = definition.id
        node.setAttribute("aria-label", `打开${definition.title}`)
        node.append(
          createAppIcon(definition.id),
          element("span", "phone-os-app-label", definition.title),
        )
        cleanups.push(listen(node, "click", () => open(definition.id)))
        return node
      }
      grid.append(makeIconButton("phone-os-app-icon"))
      const searchItem = makeIconButton("phone-os-library-item")
      searchItem.dataset["searchText"] = `${definition.title} ${definition.id}`
      libraryItems.append(searchItem)
      if (["browser", "notes", "music", "settings"].includes(definition.id))
        dock.append(makeIconButton("phone-os-dock-item"))
    }
    const renderRecent = (): void => {
      recentList.replaceChildren()
      if (!recent.length)
        recentList.append(element("p", "os-secondary", "打开一个应用，即可在这里继续。"))
      for (const id of recent) {
        const item = element("div", "phone-os-recent-card")
        const reopen = button("", "phone-os-reopen")
        reopen.dataset["openApp"] = id
        reopen.append(
          createAppIcon(id),
          element("strong", "", DEVICE_APPS.find((app) => app.id === id)?.title),
          element("span", "os-secondary", "点击继续"),
        )
        const close = button("关闭应用", "phone-os-close-app")
        close.dataset["closeApp"] = id
        close.setAttribute("aria-label", `关闭${DEVICE_APPS.find((app) => app.id === id)?.title}`)
        item.append(reopen, close)
        recentList.append(item)
      }
    }
    const renderData = (): void => {
      const snapshot = options.dataService.read()
      root.dataset["appearance"] = snapshot.preferences.appearance
      root.dataset["wallpaper"] = snapshot.preferences.wallpaper
      root.dataset["reducedMotion"] = String(snapshot.preferences.reducedMotion)
      const incomplete = snapshot.reminders.filter((item) => !item.completed)
      reminderCount.textContent = String(incomplete.length)
      reminderText.textContent = incomplete[0]?.text ?? "一切井然有序"
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      eventLabel.textContent =
        snapshot.events.find((item) => item.date === today)?.title ?? "今日暂无日程"
    }
    const tick = (): void => {
      const now = new Date()
      const displayTime = now.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      time.textContent = displayTime
      time.dateTime = now.toISOString()
      clock.textContent = displayTime
      date.textContent = now.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
      })
      day.textContent = String(now.getDate())
    }

    const expandIsland = (): void => {
      controlCenter.close()
      island.dataset["expanded"] = "true"
      islandBackdrop.dataset["visible"] = "true"
      islandTrigger.setAttribute("aria-expanded", "true")
      dismissButton.focus()
    }

    const collapseIsland = (): void => {
      island.dataset["expanded"] = "false"
      islandBackdrop.dataset["visible"] = "false"
      islandTrigger.setAttribute("aria-expanded", "false")
      islandTrigger.focus()
    }
    const syncMedia = (): void => {
      const music = options.musicService.read()
      const radio = options.radioService.read()
      const name =
        music.source === "radio"
          ? radio.selectedStation?.name
          : music.tracks.find((track) => track.id === music.activeTrackId)?.title
      const playing = (music.source === "radio" ? radio.status : music.status) === "playing"
      islandTrigger.textContent = `${playing ? "♫" : "♪"} ${name ?? "音乐"}`
      islandTrigger.title = name ?? "正在播放"
    }
    let gesture: { x: number; y: number } | null = null
    cleanups.push(
      listen(islandTrigger, "click", expandIsland),
      listen(controlTrigger, "click", () => {
        if (island.dataset["expanded"] === "true") collapseIsland()
        controlCenter.toggle()
      }),
      listen(island, "keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          collapseIsland()
        }
      }),
      listen(indicator, "pointerdown", (event) => {
        gesture = { x: event.clientX, y: event.clientY }
        indicator.setPointerCapture(event.pointerId)
      }),
      listen(indicator, "pointerup", (event) => {
        if (
          gesture !== null &&
          gesture.y - event.clientY > 35 &&
          Math.abs(gesture.x - event.clientX) < 80
        ) {
          renderRecent()
          switcher.hidden = false
          event.preventDefault()
        }
        gesture = null
      }),
      listen(indicator, "pointercancel", () => {
        gesture = null
      }),
      listen(islandBackdrop, "click", collapseIsland),
      listen(dismissButton, "click", collapseIsland),
      listen(viewButton, "click", () => {
        collapseIsland()
        open("music")
      }),
      listen(back, "click", returnHome),
      listen(indicator, "click", () => {
        if (switcher.hidden) returnHome()
      }),
      listen(calendar, "click", () => open("calendar")),
      listen(reminder, "click", () => open("reminders")),
      listen(search, "click", () => {
        library.hidden = false
        input.focus()
      }),
      listen(cancel, "click", () => {
        library.hidden = true
      }),
      listen(input, "input", () => {
        for (const node of libraryItems.children)
          if (node instanceof HTMLElement)
            node.hidden = !node.dataset["searchText"]
              ?.toLowerCase()
              .includes(input.value.trim().toLowerCase())
      }),
      listen(switcherButton, "click", () => {
        renderRecent()
        switcher.hidden = false
      }),
      listen(done, "click", () => {
        switcher.hidden = true
        if (active === null) returnHome()
      }),
      listen(indicator, "dblclick", () => {
        renderRecent()
        switcher.hidden = false
      }),
      listen(recentList, "click", (event) => {
        if (!(event.target instanceof Element)) return
        const node = event.target.closest<HTMLElement>("button")
        const openId = node?.dataset["openApp"]
        const closeId = node?.dataset["closeApp"]
        const definition = DEVICE_APPS.find((item) => item.id === (openId ?? closeId))
        if (definition === undefined) return
        if (openId) {
          open(definition.id)
          return
        }
        const app = mounted.get(definition.id)
        app?.dispose()
        app?.element.remove()
        mounted.delete(definition.id)
        recent.splice(recent.indexOf(definition.id), 1)
        if (active === definition.id) {
          active = null
          apps.hidden = true
          home.hidden = false
          root.dataset["route"] = "home"
        }
        renderRecent()
      }),
      options.dataService.subscribe(renderData),
      options.musicService.subscribe(syncMedia),
      options.radioService.subscribe(syncMedia),
    )
    tick()
    renderData()
    returnHome()
    const timer = setInterval(tick, 15000)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        clearInterval(timer)
        islandPlayer.dispose()
        controlCenter.dispose()
        for (const cleanup of cleanups) cleanup()
        for (const app of mounted.values()) app.dispose()
        mounted.clear()
      },
      setActive: (enabled) => {
        root.dataset["active"] = String(enabled)
      },
      update: () => undefined,
    }
  },
})
