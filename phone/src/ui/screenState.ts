export const APP_IDS = ["call", "message", "radio", "camera"] as const

export type AppId = (typeof APP_IDS)[number]
export type ScreenPower = "on" | "off"

export type ScreenState = {
  readonly power: ScreenPower
  readonly activeApp: AppId | null
}

export type ScreenAction =
  | { readonly kind: "launch-app"; readonly app: AppId }
  | { readonly kind: "toggle-power" }
  | { readonly kind: "reset" }

export function initialScreenState(): ScreenState {
  return { power: "on", activeApp: null }
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled screen action: ${String(value)}`)
}

export function reduceScreenState(state: ScreenState, action: ScreenAction): ScreenState {
  switch (action.kind) {
    case "launch-app":
      return { power: "on", activeApp: action.app }
    case "toggle-power":
      return state.power === "on"
        ? { power: "off", activeApp: null }
        : { power: "on", activeApp: null }
    case "reset":
      return initialScreenState()
    default:
      return assertNever(action)
  }
}
