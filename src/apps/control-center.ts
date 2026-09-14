import type { DeviceSoftwareDependencies } from "./device-applications"
import { element, listen } from "./dom"
import { createMediaControls } from "./media-controls"

export const createControlCenter = (options: DeviceSoftwareDependencies) => {
  const root = element("section", "os-control-center")
  root.hidden = true
  root.setAttribute("role", "dialog")
  root.setAttribute("aria-label", "控制中心")
  const header = element("header", "os-control-header")
  const closeButton = element("button", "os-icon-button", "完成")
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", "关闭控制中心")
  header.append(element("h2", "", "控制中心"), closeButton)
  const player = createMediaControls(options)
  const settings = element("div", "os-control-settings")
  const appearance = element("button", "os-control-tile")
  appearance.type = "button"
  appearance.setAttribute("aria-label", "深色外观")
  const motion = element("button", "os-control-tile")
  motion.type = "button"
  motion.setAttribute("aria-label", "减少动画")
  settings.append(appearance, motion)
  const devices = element("nav", "os-control-devices")
  devices.setAttribute("aria-label", "切换设备")
  for (const [label, id] of [
    ["电脑", "computer-main"],
    ["手机", "phone-main"],
    ["收音机", "radio-main"],
  ]) {
    if (label === undefined || id === undefined) continue
    const button = element("button", "os-icon-button", label)
    button.type = "button"
    button.dataset["focusDevice"] = id
    devices.append(button)
  }
  root.append(header, player.element, settings, devices)
  let previousFocus: HTMLElement | null = null
  const close = (): void => {
    if (root.hidden) return
    root.hidden = true
    previousFocus?.focus()
  }
  const sync = (): void => {
    const preferences = options.dataService.read().preferences
    const dark = preferences.appearance === "dark"
    appearance.textContent = dark ? "◐ 深色外观 · 开" : "◐ 深色外观 · 关"
    appearance.setAttribute("aria-pressed", String(dark))
    motion.textContent = preferences.reducedMotion ? "≈ 减少动画 · 开" : "≈ 减少动画 · 关"
    motion.setAttribute("aria-pressed", String(preferences.reducedMotion))
  }
  const cleanups = [
    listen(closeButton, "click", close),
    listen(appearance, "click", () =>
      options.dataService.setPreferences({
        appearance: options.dataService.read().preferences.appearance === "dark" ? "light" : "dark",
      }),
    ),
    listen(motion, "click", () =>
      options.dataService.setPreferences({
        reducedMotion: !options.dataService.read().preferences.reducedMotion,
      }),
    ),
    listen(root, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }),
    listen(devices, "click", close),
    options.dataService.subscribe(sync),
  ]
  sync()
  return {
    element: root,
    close,
    toggle: (): void => {
      if (!root.hidden) {
        close()
        return
      }
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      root.hidden = false
      closeButton.focus()
    },
    dispose: (): void => {
      player.dispose()
      for (const cleanup of cleanups) cleanup()
    },
  }
}
