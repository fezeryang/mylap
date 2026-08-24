import type { PhoneModel } from "../model/modelTypes"
import type { ScreenController } from "../ui/screenTypes"
import { type PhoneViewer, VIEW_IDS, type ViewId } from "../viewer/createViewer"

type ControlConfig = {
  readonly viewer: PhoneViewer
  readonly model: PhoneModel
  readonly screen: ScreenController
  readonly status: HTMLElement
}

const VIEW_ID_SET: ReadonlySet<string> = new Set(VIEW_IDS)

function parseViewId(value: string | undefined): ViewId | null {
  if (value === undefined || !VIEW_ID_SET.has(value)) return null
  for (const viewId of VIEW_IDS) {
    if (viewId === value) return viewId
  }
  return null
}

export function bindControls(config: ControlConfig): void {
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")]
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      const viewId = parseViewId(button.dataset["view"])
      if (viewId === null) return
      config.viewer.setView(viewId)
      for (const candidate of viewButtons) {
        candidate.setAttribute("aria-pressed", String(candidate === button))
      }
      config.status.textContent = `${viewId} camera view`
    })
  }

  const explode = document.querySelector<HTMLButtonElement>("#explode-control")
  const autoRotate = document.querySelector<HTMLButtonElement>("#auto-rotate-control")
  const reset = document.querySelector<HTMLButtonElement>("#reset-control")
  if (explode === null || autoRotate === null || reset === null) {
    throw new TypeError("Viewer control contract is incomplete")
  }

  explode.addEventListener("click", () => {
    const expanded = explode.getAttribute("aria-pressed") !== "true"
    explode.setAttribute("aria-pressed", String(expanded))
    document.body.dataset["exploded"] = String(expanded)
    config.model.setExplosion(expanded ? 1.42 : 1)
    config.status.textContent = expanded ? "Phone assembly exploded" : "Phone assembly assembled"
  })

  autoRotate.addEventListener("click", () => {
    const enabled = autoRotate.getAttribute("aria-pressed") !== "true"
    autoRotate.setAttribute("aria-pressed", String(enabled))
    config.viewer.setAutoRotate(enabled)
    config.status.textContent = enabled ? "Auto rotation enabled" : "Auto rotation disabled"
  })

  reset.addEventListener("click", () => {
    config.viewer.setView("reference")
    config.viewer.setAutoRotate(false)
    config.model.setExplosion(1)
    config.model.selectPart(null)
    config.screen.reset()
    explode.setAttribute("aria-pressed", "false")
    document.body.dataset["exploded"] = "false"
    autoRotate.setAttribute("aria-pressed", "false")
    config.status.textContent = "Reference view restored"
  })
}
