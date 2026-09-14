import "../clock-app.css"

import {
  MAX_STOPWATCH_DURATION_MS,
  MAX_STOPWATCH_LAPS,
  type WorkspaceClockService,
  type WorkspaceClockSnapshot,
} from "../services/workspace-clock-service"
import { element, listen } from "./dom"

type ClockTab = "world" | "stopwatch" | "timer"
type ClockApp = { readonly element: HTMLElement; dispose(): void }

const pad = (value: number): string => String(value).padStart(2, "0")

const stopwatchLabel = (milliseconds: number): string => {
  const centiseconds = Math.floor(milliseconds / 10)
  const seconds = Math.floor(centiseconds / 100)
  const hours = Math.floor(seconds / 3600)
  return `${hours ? `${pad(hours)}:` : ""}${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}.${pad(centiseconds % 100)}`
}

const timerLabel = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  return `${hours ? `${pad(hours)}:` : ""}${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

const control = (label: string, primary = false): HTMLButtonElement => {
  const node = element("button", `clock-button${primary ? " clock-button--primary" : ""}`, label)
  node.type = "button"
  return node
}

const setText = (node: HTMLElement, value: string): void => {
  if (node.textContent !== value) node.textContent = value
}

const cities = [
  { name: "北京", region: "中国", zone: "Asia/Shanghai" },
  { name: "东京", region: "日本", zone: "Asia/Tokyo" },
  { name: "伦敦", region: "英国", zone: "Europe/London" },
  { name: "纽约", region: "美国", zone: "America/New_York" },
  { name: "悉尼", region: "澳大利亚", zone: "Australia/Sydney" },
] as const

const createWorldView = (): { element: HTMLElement; update(now: number): void } => {
  const root = element("div", "clock-world")
  const local = element("div", "clock-local")
  local.append(element("p", "clock-eyebrow", "此时此刻"))
  const localTime = element("time", "clock-local-time")
  const localDate = element("p", "clock-subtitle")
  const localTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const localDateFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZoneName: "shortOffset",
  })
  local.append(localTime, localDate)
  const grid = element("div", "clock-city-grid")
  const rows = cities.map(({ name, region, zone }) => {
    const row = element("article", "clock-city")
    const heading = element("div", "clock-city-heading")
    heading.append(element("h3", "clock-city-name", name), element("span", "clock-muted", region))
    const time = element("time", "clock-city-time")
    time.setAttribute("aria-label", `${name}时间`)
    const details = element("p", "clock-city-details")
    row.append(heading, time, details)
    grid.append(row)
    const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      weekday: "short",
      timeZoneName: "shortOffset",
    })
    return { time, details, timeFormatter, dateFormatter }
  })
  root.append(local, grid)
  let previousSecond = -1
  return {
    element: root,
    update(now) {
      const second = Math.floor(now / 1000)
      if (second === previousSecond) return
      previousSecond = second
      const date = new Date(now)
      localTime.textContent = localTimeFormatter.format(date)
      localTime.dateTime = date.toISOString()
      setText(localDate, `本地时间 · ${localDateFormatter.format(date)}`)
      for (const row of rows) {
        setText(row.time, row.timeFormatter.format(date))
        row.time.dateTime = date.toISOString()
        setText(row.details, row.dateFormatter.format(date))
      }
    },
  }
}

let nextClockId = 0

export const createClockApp = (service: WorkspaceClockService): ClockApp => {
  const root = element("section", "clock-app")
  root.dataset["appId"] = "clock"
  root.setAttribute("aria-label", "时钟")
  const prefix = `workspace-clock-${++nextClockId}`
  const cleanup: Array<() => void> = []
  let disposed = false
  let selectedTab: ClockTab = "world"
  let snapshot = service.read()
  let previousTimerStatus = snapshot.timer.status
  let syncedDuration = snapshot.timer.durationMs

  const header = element("header", "clock-header")
  const heading = element("div", "clock-heading")
  heading.append(
    element("h1", "clock-title", "时钟"),
    element("p", "clock-subtitle", "与此刻同步。"),
  )
  const nav = element("div", "clock-tabs")
  nav.setAttribute("role", "tablist")
  nav.setAttribute("aria-label", "时钟功能")
  header.append(heading, nav)
  const content = element("div", "clock-content")
  const tabEntries = (
    [
      ["world", "世界时钟"],
      ["stopwatch", "秒表"],
      ["timer", "倒计时"],
    ] as const
  ).map(([id, label]) => {
    const tab = control(label)
    tab.className = "clock-tab"
    tab.id = `${prefix}-tab-${id}`
    tab.setAttribute("role", "tab")
    tab.setAttribute("aria-controls", `${prefix}-panel-${id}`)
    const panel = element("section", "clock-panel")
    panel.id = `${prefix}-panel-${id}`
    panel.setAttribute("role", "tabpanel")
    panel.setAttribute("aria-labelledby", tab.id)
    panel.tabIndex = 0
    nav.append(tab)
    content.append(panel)
    return { id, tab, panel }
  })

  const panelFor = (id: ClockTab): HTMLElement => {
    const entry = tabEntries.find((entry) => entry.id === id)
    if (!entry) throw new Error(`Unknown clock tab: ${id}`)
    return entry.panel
  }
  const world = createWorldView()
  panelFor("world").append(world.element)

  const stopwatchView = element("div", "clock-stopwatch")
  const stopwatchHero = element("div", "clock-timing-hero")
  const stopwatchStatus = element("p", "clock-eyebrow", "准备计时")
  const stopwatchTime = element("div", "clock-digits", "00:00.00")
  stopwatchTime.setAttribute("role", "timer")
  stopwatchTime.setAttribute("aria-label", "秒表时间")
  const stopwatchControls = element("div", "clock-actions")
  const lapReset = control("复位")
  const stopwatchStart = control("开始", true)
  stopwatchControls.append(lapReset, stopwatchStart)
  stopwatchHero.append(stopwatchStatus, stopwatchTime, stopwatchControls)
  const lapSection = element("div", "clock-laps-section")
  const lapHeading = element("div", "clock-laps-heading")
  const lapCount = element("span", "clock-muted", "0 圈")
  lapHeading.append(element("h2", "clock-section-title", "计圈记录"), lapCount)
  const lapEmpty = element("p", "clock-empty", "开始秒表后，点按「计圈」记录每一段用时。")
  const lapTable = element("table", "clock-laps")
  const lapTableHead = element("thead", "")
  const lapHeader = element("tr", "")
  for (const label of ["圈数", "本圈", "累计"]) {
    const cell = element("th", "", label)
    cell.scope = "col"
    lapHeader.append(cell)
  }
  lapTableHead.append(lapHeader)
  const lapBody = element("tbody", "")
  lapTable.append(lapTableHead, lapBody)
  lapSection.append(lapHeading, lapEmpty, lapTable)
  stopwatchView.append(stopwatchHero, lapSection)
  panelFor("stopwatch").append(stopwatchView)

  const timerView = element("div", "clock-timer")
  const timerStatus = element("p", "clock-eyebrow", "留一段时间给自己")
  const timerTime = element("div", "clock-digits clock-timer-digits")
  timerTime.setAttribute("role", "timer")
  timerTime.setAttribute("aria-label", "倒计时剩余时间")
  const timerProgress = element("progress", "clock-timer-progress")
  timerProgress.max = 1
  timerProgress.setAttribute("aria-label", "倒计时剩余比例")
  const timerFinish = element("p", "clock-subtitle")
  const timerForm = element("form", "clock-duration-form")
  timerForm.noValidate = true
  const durationFields = element("div", "clock-duration-fields")
  const inputs = (
    [
      ["小时", "时", 99],
      ["分钟", "分", 59],
      ["秒数", "秒", 59],
    ] as const
  ).map(([label, unit, max]) => {
    const field = element("label", "clock-duration-field")
    const input = element("input", "clock-duration-input")
    input.type = "number"
    input.inputMode = "numeric"
    input.min = "0"
    input.max = String(max)
    input.step = "1"
    input.required = true
    input.setAttribute("aria-label", `倒计时${label}`)
    input.setAttribute("aria-describedby", `${prefix}-duration-hint`)
    field.append(input, element("span", "clock-muted", unit))
    durationFields.append(field)
    return input
  })
  const fillDuration = (durationMs: number): void => {
    const seconds = Math.floor(durationMs / 1000)
    const values = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    inputs.forEach((input, index) => {
      input.value = pad(values[index] ?? 0)
      input.removeAttribute("aria-invalid")
    })
  }
  fillDuration(syncedDuration)
  const enteredDuration = (): number | null => {
    const values = inputs.map((input) => {
      const value = input.valueAsNumber
      return Number.isInteger(value) && value >= 0 && value <= Number(input.max) ? value : null
    })
    const [hours, minutes, seconds] = values
    if (hours == null || minutes == null || seconds == null) return null
    const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000
    return durationMs >= 1000 ? durationMs : null
  }
  const durationHint = element("p", "clock-duration-hint", "最长 99 小时 59 分 59 秒")
  durationHint.id = `${prefix}-duration-hint`
  const presets = element("div", "clock-presets")
  for (const minutes of [1, 5, 15, 30]) {
    const preset = control(`${minutes} 分钟`)
    preset.className = "clock-preset"
    cleanup.push(
      listen(preset, "click", () => {
        fillDuration(minutes * 60 * 1000)
        setText(timerTime, timerLabel(minutes * 60 * 1000))
        setText(durationHint, "最长 99 小时 59 分 59 秒")
        durationHint.classList.remove("clock-input-error")
      }),
    )
    presets.append(preset)
  }
  const timerBegin = control("开始计时", true)
  timerBegin.type = "submit"
  timerForm.append(durationFields, durationHint, presets, timerBegin)
  const timerActions = element("div", "clock-actions")
  const timerCancel = control("取消")
  const timerToggle = control("暂停", true)
  timerActions.append(timerCancel, timerToggle)
  timerView.append(timerStatus, timerTime, timerProgress, timerFinish, timerForm, timerActions)
  panelFor("timer").append(timerView)

  const status = element("p", "clock-notice")
  status.setAttribute("role", "status")
  status.setAttribute("aria-live", "polite")
  status.hidden = true
  const storageNotice = element("p", "clock-storage-notice")
  storageNotice.setAttribute("role", "status")
  root.append(header, content, status, storageNotice)

  const announce = (message: string): void => {
    status.hidden = !message
    setText(status, message)
  }

  let lapKey = ""
  const render = (next: WorkspaceClockSnapshot): void => {
    snapshot = next
    world.update(next.now)
    const { stopwatch, timer } = next
    root.dataset["timerStatus"] = timer.status
    root.dataset["stopwatchStatus"] = stopwatch.status
    setText(stopwatchTime, stopwatchLabel(stopwatch.elapsedMs))
    setText(
      stopwatchStatus,
      stopwatch.elapsedMs >= MAX_STOPWATCH_DURATION_MS
        ? "已到达上限，请复位"
        : stopwatch.status === "running"
          ? "正在计时"
          : stopwatch.status === "paused"
            ? "已暂停"
            : "准备计时",
    )
    setText(
      stopwatchStart,
      stopwatch.status === "running" ? "暂停" : stopwatch.status === "paused" ? "继续" : "开始",
    )
    stopwatchStart.disabled = stopwatch.elapsedMs >= MAX_STOPWATCH_DURATION_MS
    setText(lapReset, stopwatch.status === "running" ? "计圈" : "复位")
    lapReset.disabled =
      stopwatch.status === "idle" ||
      (stopwatch.status === "running" && stopwatch.laps.length >= MAX_STOPWATCH_LAPS)
    setText(lapCount, `${stopwatch.laps.length} / ${MAX_STOPWATCH_LAPS} 圈`)
    const nextLapKey = `${stopwatch.laps.length}:${stopwatch.laps.at(-1)?.elapsedMs ?? 0}`
    if (nextLapKey !== lapKey) {
      lapKey = nextLapKey
      const fastest = Math.min(...stopwatch.laps.map((lap) => lap.durationMs))
      const slowest = Math.max(...stopwatch.laps.map((lap) => lap.durationMs))
      lapBody.replaceChildren(
        ...[...stopwatch.laps].reverse().map((lap) => {
          const row = element("tr", "")
          const mark =
            stopwatch.laps.length < 2 || fastest === slowest
              ? ""
              : lap.durationMs === fastest
                ? " · 最快"
                : lap.durationMs === slowest
                  ? " · 最慢"
                  : ""
          const label = element("th", "", `第 ${pad(lap.number)} 圈${mark}`)
          label.scope = "row"
          row.append(
            label,
            element("td", "", stopwatchLabel(lap.durationMs)),
            element("td", "", stopwatchLabel(lap.elapsedMs)),
          )
          return row
        }),
      )
      lapEmpty.hidden = stopwatch.laps.length > 0
      lapTable.hidden = stopwatch.laps.length === 0
    }

    if (
      timer.durationMs !== syncedDuration ||
      (timer.status === "idle" && previousTimerStatus !== "idle")
    ) {
      syncedDuration = timer.durationMs
      fillDuration(syncedDuration)
      setText(durationHint, "最长 99 小时 59 分 59 秒")
      durationHint.classList.remove("clock-input-error")
    }
    timerForm.hidden = timer.status !== "idle"
    timerActions.hidden = timer.status === "idle"
    timerProgress.hidden = timer.status === "idle"
    timerProgress.value = timer.remainingMs / timer.durationMs
    setText(
      timerTime,
      timerLabel(timer.status === "idle" ? (enteredDuration() ?? 0) : timer.remainingMs),
    )
    setText(
      timerStatus,
      timer.status === "finished"
        ? "时间到"
        : timer.status === "running"
          ? "正在倒计时"
          : timer.status === "paused"
            ? "倒计时已暂停"
            : "留一段时间给自己",
    )
    const finishLabel =
      timer.status === "running" && timer.deadline !== null
        ? `将于 ${new Date(timer.deadline).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
          })} 结束`
        : timer.status === "paused"
          ? "准备好时，继续这一段计时。"
          : timer.status === "finished"
            ? "这一段时间已经完成。"
            : "在电脑或手机上继续，计时始终同步。"
    setText(timerFinish, finishLabel)
    setText(
      timerToggle,
      timer.status === "finished" ? "再次开始" : timer.status === "paused" ? "继续" : "暂停",
    )
    setText(timerCancel, timer.status === "finished" ? "完成" : "取消")
    if (timer.status === "finished" && previousTimerStatus !== "finished") {
      announce("倒计时已结束。")
    } else if (previousTimerStatus === "finished" && timer.status !== "finished") {
      announce("")
    }
    previousTimerStatus = timer.status
    storageNotice.hidden = !next.storageError
    setText(storageNotice, next.storageError ?? "")
  }

  const selectTab = (id: ClockTab, focus = false): void => {
    selectedTab = id
    for (const entry of tabEntries) {
      const selected = entry.id === id
      entry.tab.setAttribute("aria-selected", String(selected))
      entry.tab.tabIndex = selected ? 0 : -1
      entry.panel.hidden = !selected
      if (selected && focus) entry.tab.focus()
    }
    render(service.read())
  }
  for (const entry of tabEntries) {
    cleanup.push(listen(entry.tab, "click", () => selectTab(entry.id)))
  }
  cleanup.push(
    listen(nav, "keydown", (event) => {
      const index = tabEntries.findIndex((entry) => entry.id === selectedTab)
      let nextIndex: number
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabEntries.length
      else if (event.key === "ArrowLeft")
        nextIndex = (index + tabEntries.length - 1) % tabEntries.length
      else if (event.key === "Home") nextIndex = 0
      else if (event.key === "End") nextIndex = tabEntries.length - 1
      else return
      event.preventDefault()
      const entry = tabEntries[nextIndex]
      if (entry) selectTab(entry.id, true)
    }),
    listen(stopwatchStart, "click", () => {
      if (service.read().stopwatch.status === "running") {
        service.pauseStopwatch()
        announce("秒表已暂停。")
      } else {
        service.startStopwatch()
        announce("秒表已开始。")
      }
    }),
    listen(lapReset, "click", () => {
      if (service.read().stopwatch.status === "running") {
        service.lapStopwatch()
        announce(`已记录第 ${service.read().stopwatch.laps.length} 圈。`)
      } else {
        service.resetStopwatch()
        announce("秒表已复位。")
      }
    }),
    listen(timerForm, "input", () => {
      const duration = enteredDuration()
      setText(timerTime, timerLabel(duration ?? 0))
      setText(
        durationHint,
        duration === null ? "请输入有效时长，至少 1 秒。" : "最长 99 小时 59 分 59 秒",
      )
      durationHint.classList.toggle("clock-input-error", duration === null)
      for (const input of inputs) input.removeAttribute("aria-invalid")
    }),
    listen(timerForm, "submit", (event) => {
      event.preventDefault()
      const duration = enteredDuration()
      if (duration === null || !service.startTimer(duration)) {
        setText(durationHint, "请输入有效时长，至少 1 秒，最长 99 小时 59 分 59 秒。")
        durationHint.classList.add("clock-input-error")
        for (const input of inputs) input.setAttribute("aria-invalid", "true")
        inputs[0]?.focus()
        announce("无法开始：请检查倒计时时长。")
        return
      }
      announce("倒计时已开始。")
      timerToggle.focus()
    }),
    listen(timerToggle, "click", () => {
      const timer = service.read().timer
      if (timer.status === "running") {
        service.pauseTimer()
        announce("倒计时已暂停。")
      } else if (timer.status === "paused") {
        service.resumeTimer()
        announce("倒计时已继续。")
      } else if (timer.status === "finished") {
        service.startTimer(timer.durationMs)
        announce("倒计时已重新开始。")
      }
    }),
    listen(timerCancel, "click", () => {
      service.resetTimer()
      announce("倒计时已复位。")
      timerBegin.focus()
    }),
    service.subscribe(render),
  )
  selectTab(selectedTab)
  if (snapshot.timer.status === "finished") announce("倒计时已结束。")
  return {
    element: root,
    dispose() {
      if (disposed) return
      disposed = true
      for (const release of cleanup.splice(0)) release()
    },
  }
}
