import type { BrowserPolicy } from "./browser-url-policy"

export type LauncherRoute = "home" | "oho" | "notes" | "browser" | "devices"

export type LauncherState = {
  readonly browserDecision: ReturnType<BrowserPolicy["evaluate"]> | null
  readonly browserInput: string
  readonly route: LauncherRoute
}

export const createLauncherState = (): LauncherState => ({
  browserDecision: null,
  browserInput: "",
  route: "home",
})

export const navigateLauncher = (state: LauncherState, route: LauncherRoute): LauncherState => ({
  ...state,
  route,
})

export const updateLauncherBrowserInput = (
  state: LauncherState,
  browserInput: string,
): LauncherState => ({
  ...state,
  browserInput,
})

export const submitLauncherBrowser = (
  state: LauncherState,
  policy: BrowserPolicy,
): LauncherState => ({
  ...state,
  browserDecision: policy.evaluate(state.browserInput),
})
