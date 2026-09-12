import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import type { RadioMediaService } from "../services/radio-contracts"
import type { WorkspaceNotesService } from "../services/workspace-notes-service"
import { createWorkspaceNotesService } from "../services/workspace-notes-service"
import { MAIN_WORKSPACE_APP_ID } from "./app-ids"
import type { BrowserPolicy } from "./browser-url-policy"
import { createBrowserView } from "./browser-view"
import { element, listen } from "./dom"
import {
  createLauncherState,
  navigateLauncher,
  submitLauncherBrowser,
  updateLauncherBrowserInput,
  type LauncherRoute,
} from "./launcher-state"
import { createOhoControls } from "./oho-controls"
import {
  createDevicePanel,
  createExpandButton,
  createWorkspaceNotePanel,
} from "./workspace-panels"

export type MainWorkspaceAppOptions = {
  readonly browserPolicy: BrowserPolicy
  readonly notesService?: WorkspaceNotesService
  readonly radioService: RadioMediaService
}

const routeButton = (label: string, testId?: string): HTMLButtonElement => {
  const button = element("button", "launcher-route", label)
  button.type = "button"
  if (testId !== undefined) button.dataset["testid"] = testId
  return button
}

export const createMainWorkspaceApp = (options: MainWorkspaceAppOptions): ScreenAppDefinition => ({
  appId: MAIN_WORKSPACE_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const notesService = options.notesService ?? createWorkspaceNotesService()
    let state = createLauncherState()
    const root = element("section", "screen-app workspace-launcher")
    root.setAttribute("aria-label", "TODŌU computer workspace")
    root.dataset["assetInstance"] = context.assetInstanceId.value

    const topbar = element("nav", "launcher-topbar")
    topbar.setAttribute("aria-label", "Computer apps")
    const brand = element("strong", "launcher-brand", "TODŌU")
    const homeButton = routeButton("Home", "launcher-home")
    const radioButton = routeButton("Radio", "launcher-oho")
    const notesButton = routeButton("Notes")
    const browserButton = routeButton("Browser", "launcher-browser")
    const devicesButton = routeButton("Devices")
    topbar.append(
      brand,
      homeButton,
      radioButton,
      notesButton,
      browserButton,
      devicesButton,
      createExpandButton(),
    )

    const home = element("section", "launcher-panel launcher-home")
    home.append(
      element("span", "screen-overline", "Connected workspace"),
      element("h2", "", "Everything, in one place."),
      element("p", "", "Control the radio, save a thought, or move to another device."),
    )
    const homeActions = element("div", "home-actions")
    const homeRadio = element("button", "app-action", "Open Radio")
    const homeNotes = element("button", "app-action", "Write a note")
    homeRadio.type = "button"
    homeNotes.type = "button"
    homeActions.append(homeRadio, homeNotes)
    home.append(homeActions)

    const radioPanel = element("section", "launcher-panel")
    const radio = createOhoControls(options.radioService)
    radioPanel.append(radio.element)

    const notesPanel = element("section", "launcher-panel")
    const notes = createWorkspaceNotePanel(notesService)
    notesPanel.append(notes.element)

    const browserPanel = element("section", "launcher-panel")
    const browser = createBrowserView({
      browserPolicy: options.browserPolicy,
      onSubmit: () => {
        state = submitLauncherBrowser(state, options.browserPolicy)
        render()
      },
      onUpdateInput: (browserInput) => {
        state = updateLauncherBrowserInput(state, browserInput)
      },
    })
    browserPanel.append(browser.element)

    const devicesPanel = element("section", "launcher-panel")
    devicesPanel.append(createDevicePanel())
    root.append(topbar, home, radioPanel, notesPanel, browserPanel, devicesPanel)
    host.append(root)

    const routes = [
      ["home", homeButton, home],
      ["oho", radioButton, radioPanel],
      ["notes", notesButton, notesPanel],
      ["browser", browserButton, browserPanel],
      ["devices", devicesButton, devicesPanel],
    ] as const
    const render = (): void => {
      for (const [route, button, panel] of routes) {
        const active = state.route === route
        button.setAttribute("aria-pressed", String(active))
        panel.hidden = !active
      }
      browser.render(state)
      root.dataset["route"] = state.route
    }
    const selectRoute = (route: LauncherRoute): void => {
      state = navigateLauncher(state, route)
      render()
    }
    const cleanups = routes.map(([route, button]) =>
      listen(button, "click", () => selectRoute(route)),
    )
    cleanups.push(
      listen(homeRadio, "click", () => selectRoute("oho")),
      listen(homeNotes, "click", () => selectRoute("notes")),
    )
    let disposed = false
    render()

    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        cleanups.forEach((cleanup) => cleanup())
        browser.dispose()
        notes.dispose()
        radio.dispose()
      },
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: (snapshot) => {
        root.dataset["selectedPart"] = snapshot.selectedPart
      },
    }
  },
})
