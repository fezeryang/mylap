import {
  APP_IDS,
  type AppId,
  initialScreenState,
  reduceScreenState,
  type ScreenState,
} from "./screenState"
import type { ScreenController } from "./screenTypes"

const APP_ID_SET: ReadonlySet<string> = new Set(APP_IDS)
const APP_CONTENT: Readonly<Record<AppId, readonly [string, string]>> = {
  call: ["Secure Call", "Encrypted line ready. Select a contact to begin."],
  message: ["Messages", "Three priority transmissions are waiting."],
  radio: ["Neon Radio", "Synthwave channel 09 is broadcasting live."],
  camera: ["Optical Camera", "Cyber-optic capture array is armed."],
}

function parseAppId(value: string | undefined): AppId | null {
  return value !== undefined && APP_ID_SET.has(value) ? findAppId(value) : null
}

function findAppId(value: string): AppId | null {
  for (const appId of APP_IDS) {
    if (appId === value) return appId
  }
  return null
}

export function bindScreen(
  screen: HTMLElement,
  powerButton: HTMLButtonElement,
  status: HTMLElement,
): ScreenController {
  let state = initialScreenState()
  const appButtons = [...screen.querySelectorAll<HTMLButtonElement>("[data-app-id]")]
  const appSurface = screen.querySelector<HTMLElement>("[data-app-surface]")
  const appTitle = screen.querySelector<HTMLElement>("[data-app-title]")
  const appCopy = screen.querySelector<HTMLElement>("[data-app-copy]")
  if (appSurface === null || appTitle === null || appCopy === null) {
    throw new TypeError("Interactive app surface contract is incomplete")
  }

  const render = (next: ScreenState, announcement: string): void => {
    state = next
    screen.dataset["power"] = state.power
    screen.dataset["activeApp"] = state.activeApp ?? "none"
    powerButton.setAttribute("aria-pressed", String(state.power === "on"))
    const activeContent = state.activeApp === null ? null : APP_CONTENT[state.activeApp]
    appSurface.hidden = activeContent === null || state.power === "off"
    appSurface.dataset["app"] = state.activeApp ?? "none"
    appTitle.textContent = activeContent?.[0] ?? ""
    appCopy.textContent = activeContent?.[1] ?? ""
    for (const button of appButtons) {
      const appId = parseAppId(button.dataset["appId"])
      button.setAttribute("aria-pressed", String(appId !== null && state.activeApp === appId))
      button.disabled = state.power === "off"
    }
    status.textContent = announcement
  }

  for (const button of appButtons) {
    button.addEventListener("click", () => {
      const appId = parseAppId(button.dataset["appId"])
      if (appId === null) return
      render(reduceScreenState(state, { kind: "launch-app", app: appId }), `${appId} app active`)
    })
  }

  const togglePower = (): void => {
    const next = reduceScreenState(state, { kind: "toggle-power" })
    render(next, next.power === "on" ? "Screen powered on" : "Screen powered off")
  }
  powerButton.addEventListener("click", togglePower)

  return {
    togglePower,
    reset: () => render(reduceScreenState(state, { kind: "reset" }), "Screen reset"),
  }
}
