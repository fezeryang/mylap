import type { ScreenAppId } from "../runtime/ids"
import type { ScreenAppDefinition } from "../runtime/screen-app"
import type { WorkspaceDataSnapshot } from "../services/workspace-data-service"
import type { DeviceSoftwareDependencies } from "./device-applications"
import { element, listen, svgElement } from "./dom"
import { createMediaControls } from "./media-controls"

type CompanionContent = {
  sync(snapshot: WorkspaceDataSnapshot): void
  dispose(): void
}

const button = (text: string, className: string): HTMLButtonElement => {
  const control = element("button", className, text)
  control.type = "button"
  return control
}

const createHeader = (kind: "player" | "today"): HTMLElement => {
  const header = element("header", "companion-header")
  const brand = element("div", "companion-brand")
  const mark = element("span", `companion-mark companion-mark--${kind}`)
  mark.setAttribute("aria-hidden", "true")
  const icon = svgElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })
  icon.append(
    svgElement("path", {
      d:
        kind === "player"
          ? "M9 18V5l12-2v13M9 8l12-2M9 18c0 4-7 5-7 1s7-5 7-1M21 16c0 4-7 5-7 1s7-5 7-1"
          : "M5 5h14v16H5zM8 3v4M16 3v4M5 10h14m-9 5 2 2 4-4",
    }),
  )
  mark.append(icon)
  const heading = element("div", "companion-heading")
  heading.append(
    element(
      "span",
      "companion-eyebrow",
      kind === "player" ? "PLAYBACK STATION" : "YOUR DAILY SPACE",
    ),
    element("h1", "companion-title", kind === "player" ? "播放台" : "今日"),
  )
  brand.append(mark, heading)
  const expand = button("↗", "companion-expand")
  expand.dataset["expandScreen"] = "true"
  expand.setAttribute("aria-label", kind === "player" ? "展开播放台" : "展开今日")
  expand.title = kind === "player" ? "展开播放台" : "展开今日"
  header.append(brand, expand)
  return header
}

const deviceButton = (name: string, instanceId: string): HTMLButtonElement => {
  const control = button(`${name} ↗`, "companion-device-link")
  control.dataset["focusDevice"] = instanceId
  control.setAttribute("aria-label", `前往${name}`)
  return control
}

const mountPlayer = (root: HTMLElement, options: DeviceSoftwareDependencies): CompanionContent => {
  const header = createHeader("player")
  const panel = element("div", "companion-player-panel")
  const artwork = element("div", "companion-record")
  artwork.setAttribute("aria-hidden", "true")
  artwork.append(element("span", "companion-record-center", "♪"))
  const controls = createMediaControls(options)
  panel.append(artwork, controls.element)
  const footer = element("footer", "companion-player-footer")
  footer.append(
    element("span", "companion-caption", "音乐与电台，随手可及。"),
    deviceButton("收音机", "radio-main"),
  )
  root.append(header, panel, footer)
  return { sync: () => undefined, dispose: () => controls.dispose() }
}

const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const mountToday = (root: HTMLElement, options: DeviceSoftwareDependencies): CompanionContent => {
  const header = createHeader("today")
  const dateBlock = element("div", "companion-clock-block")
  const time = element("time", "companion-clock")
  const date = element("time", "companion-date")
  dateBlock.append(time, date)
  header.insertBefore(dateBlock, header.lastElementChild)

  const content = element("div", "companion-today-content")
  const calendar = element("section", "companion-card companion-agenda")
  calendar.setAttribute("aria-label", "今天的日程")
  const calendarHeader = element("header", "companion-card-header")
  const eventCount = element("span", "companion-count")
  calendarHeader.append(element("h2", "", "日程"), eventCount)
  const events = element("ul", "companion-list companion-event-list")
  const calendarEmpty = element("div", "companion-empty")
  calendarEmpty.append(
    element("strong", "", "今天还没有安排"),
    element("p", "", "在日历中添加日程，\n给重要的事留一点时间。"),
  )
  calendar.append(calendarHeader, events, calendarEmpty)

  const reminders = element("section", "companion-card companion-reminders")
  reminders.setAttribute("aria-label", "提醒事项")
  const reminderHeader = element("header", "companion-card-header")
  const reminderCount = element("span", "companion-count")
  reminderHeader.append(element("h2", "", "待办"), reminderCount)
  const reminderList = element("ul", "companion-list companion-reminder-list")
  const remindersEmpty = element("div", "companion-empty")
  remindersEmpty.append(
    element("strong", "", "从一件小事开始"),
    element("p", "", "在下方记下要做的事，\n随时在手机或电脑上继续。"),
  )
  reminders.append(reminderHeader, reminderList, remindersEmpty)
  content.append(calendar, reminders)

  const footer = element("footer", "companion-today-footer")
  const form = element("form", "companion-quick-add")
  form.setAttribute("aria-label", "快速添加提醒事项")
  const input = element("input", "companion-reminder-input")
  input.type = "text"
  input.name = "reminder"
  input.autocomplete = "off"
  input.maxLength = 500
  input.placeholder = "添加一件想做的事…"
  input.setAttribute("aria-label", "新的提醒事项")
  input.dataset["testid"] = "companion-reminder-input"
  const add = element("button", "companion-add", "+")
  add.type = "submit"
  add.setAttribute("aria-label", "添加提醒事项")
  form.append(input, add)
  const footerMeta = element("div", "companion-footer-meta")
  const status = element("p", "companion-status")
  status.setAttribute("role", "status")
  const devices = element("nav", "companion-devices")
  devices.setAttribute("aria-label", "前往设备")
  devices.append(deviceButton("电脑", "computer-main"), deviceButton("手机", "phone-main"))
  footerMeta.append(status, devices)
  footer.append(form, footerMeta)
  root.append(header, content, footer)

  const reminderRows = new Map<
    string,
    { readonly row: HTMLLIElement; readonly checkbox: HTMLInputElement; readonly text: HTMLElement }
  >()
  let snapshot = options.dataService.read()
  let dayKey = ""
  let calendarSignature = ""
  let disposed = false
  const clockFormat = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const dateFormat = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  const renderEvents = (): void => {
    const todayEvents = snapshot.events
      .filter((event) => event.date === dayKey)
      .sort((first, second) => first.time.localeCompare(second.time))
    const signature = JSON.stringify(todayEvents)
    if (signature === calendarSignature) return
    calendarSignature = signature
    eventCount.textContent = `${todayEvents.length} 项`
    calendarEmpty.hidden = todayEvents.length > 0
    events.hidden = todayEvents.length === 0
    events.replaceChildren()
    for (const event of todayEvents) {
      const row = element("li", "companion-event")
      const eventTime = element("time", "companion-event-time", event.time || "全天")
      eventTime.dateTime = event.time === "" ? event.date : `${event.date}T${event.time}`
      row.append(eventTime, element("span", "companion-event-title", event.title))
      events.append(row)
    }
  }

  const renderReminders = (): void => {
    const remaining = snapshot.reminders.filter((reminder) => !reminder.completed).length
    reminderCount.textContent = `${remaining} 未完成`
    remindersEmpty.hidden = snapshot.reminders.length > 0
    reminderList.hidden = snapshot.reminders.length === 0
    const ids = new Set(snapshot.reminders.map((reminder) => reminder.id))
    for (const [id, item] of reminderRows) {
      if (ids.has(id)) continue
      item.row.remove()
      reminderRows.delete(id)
    }
    for (const reminder of snapshot.reminders) {
      let item = reminderRows.get(reminder.id)
      if (item === undefined) {
        const row = element("li", "companion-reminder")
        const label = element("label", "companion-reminder-label")
        const checkbox = element("input", "companion-checkbox")
        checkbox.type = "checkbox"
        checkbox.dataset["reminderId"] = reminder.id
        const text = element("span", "companion-reminder-text")
        label.append(checkbox, text)
        row.append(label)
        item = { row, checkbox, text }
        reminderRows.set(reminder.id, item)
        reminderList.append(row)
      }
      item.checkbox.checked = reminder.completed
      item.text.textContent = reminder.text
      item.row.dataset["completed"] = String(reminder.completed)
    }
  }

  const tick = (): void => {
    if (disposed) return
    const now = new Date()
    const clockText = clockFormat.format(now)
    if (time.textContent !== clockText) {
      time.textContent = clockText
      time.dateTime = `${localDateKey(now)}T${clockText}`
    }
    const nextDay = localDateKey(now)
    if (nextDay === dayKey) return
    dayKey = nextDay
    date.textContent = dateFormat.format(now)
    date.dateTime = dayKey
    renderEvents()
  }
  tick()
  const clock = window.setInterval(tick, 1000)
  const cleanups = [
    listen(form, "submit", (event) => {
      event.preventDefault()
      const text = input.value.trim()
      if (text === "") {
        input.focus()
        return
      }
      options.dataService.addReminder(text)
      input.value = ""
      status.textContent = snapshot.storageError ?? `已添加「${text}」`
      input.focus()
    }),
    listen(reminderList, "change", (event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      const id = target.dataset["reminderId"]
      if (id === undefined) return
      options.dataService.toggleReminder(id)
      status.textContent =
        snapshot.storageError ?? (target.checked ? "已完成一项待办" : "已恢复待办")
    }),
  ]

  return {
    sync(next) {
      if (disposed) return
      snapshot = next
      renderEvents()
      renderReminders()
      if (next.storageError !== null) status.textContent = next.storageError
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.clearInterval(clock)
      for (const cleanup of cleanups) cleanup()
      reminderRows.clear()
    },
  }
}

export const createCompanionApp = (
  appId: ScreenAppId,
  app: "music" | "reminders",
  options: DeviceSoftwareDependencies,
): ScreenAppDefinition => ({
  appId,
  mount(host) {
    const kind = app === "music" ? "player" : "today"
    const root = element("section", `screen-app device-os companion-os companion-os--${kind}`)
    root.setAttribute("aria-label", app === "music" ? "电脑播放台副屏" : "电脑今日副屏")
    root.dataset["testid"] = `companion-${kind}`
    const content = app === "music" ? mountPlayer(root, options) : mountToday(root, options)
    const sync = (): void => {
      const snapshot = options.dataService.read()
      const preferences = snapshot.preferences
      root.dataset["appearance"] = preferences.appearance
      root.dataset["wallpaper"] = preferences.wallpaper
      root.dataset["reducedMotion"] = String(preferences.reducedMotion)
      content.sync(snapshot)
    }
    const unsubscribe = options.dataService.subscribe(sync)
    sync()
    host.append(root)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        content.dispose()
        unsubscribe()
      },
      setActive: (active) => {
        if (disposed) return
        root.dataset["active"] = String(active)
      },
      update: () => undefined,
    }
  },
})
