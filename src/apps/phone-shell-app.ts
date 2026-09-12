import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import type { RadioMediaService } from "../services/radio-contracts"
import type { WorkspaceNotesService } from "../services/workspace-notes-service"
import { createWorkspaceNotesService } from "../services/workspace-notes-service"
import { PHONE_SHELL_APP_ID } from "./app-ids"
import { element, listen } from "./dom"
import { createOhoControls } from "./oho-controls"
import {
  createDevicePanel,
  createExpandButton,
  createWorkspaceNotePanel,
} from "./workspace-panels"

export type PhoneShellAppOptions = {
  readonly notesService?: WorkspaceNotesService
  readonly radioService: RadioMediaService
}

type PhoneShellRoute = "home" | "oho" | "notes" | "devices"

const routeButton = (label: string): HTMLButtonElement => {
  const button = element("button", "phone-shell-route", label)
  button.type = "button"
  return button
}

export const createPhoneShellApp = (options: PhoneShellAppOptions): ScreenAppDefinition => ({
  appId: PHONE_SHELL_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const notesService = options.notesService ?? createWorkspaceNotesService()
    let route: PhoneShellRoute = "home"
    const root = element("section", "screen-app phone-shell")
    root.setAttribute("aria-label", "TODŌU phone workspace")
    root.dataset["assetInstance"] = context.assetInstanceId.value

    const header = element("nav", "phone-shell-header")
    header.setAttribute("aria-label", "Phone apps")
    const brand = element("strong", "phone-shell-brand", "TODŌU")
    const homeButton = routeButton("Home")
    const radioButton = routeButton("Radio")
    radioButton.dataset["testid"] = "phone-oho"
    const notesButton = routeButton("Notes")
    const devicesButton = routeButton("Devices")
    header.append(brand, homeButton, radioButton, notesButton, devicesButton, createExpandButton())

    const home = element("section", "phone-shell-panel phone-shell-home")
    home.append(
      element("span", "phone-shell-overline", "Connected"),
      element("h2", "", "Your workspace, nearby."),
      element("p", "", "The same radio and note are available on every screen."),
    )
    const homeActions = element("div", "home-actions")
    const homeRadio = element("button", "app-action", "Open Radio")
    const homeNotes = element("button", "app-action", "Write a note")
    homeRadio.type = "button"
    homeNotes.type = "button"
    homeActions.append(homeRadio, homeNotes)
    home.append(homeActions)

    const radioPanel = element("section", "phone-shell-panel")
    const radio = createOhoControls(options.radioService)
    radioPanel.append(radio.element)
    const notesPanel = element("section", "phone-shell-panel")
    const notes = createWorkspaceNotePanel(notesService)
    notesPanel.append(notes.element)
    const devicesPanel = element("section", "phone-shell-panel")
    devicesPanel.append(createDevicePanel())
    root.append(header, home, radioPanel, notesPanel, devicesPanel)
    host.append(root)

    const routes = [
      ["home", homeButton, home],
      ["oho", radioButton, radioPanel],
      ["notes", notesButton, notesPanel],
      ["devices", devicesButton, devicesPanel],
    ] as const
    const render = (): void => {
      for (const [currentRoute, button, panel] of routes) {
        const active = route === currentRoute
        button.setAttribute("aria-pressed", String(active))
        panel.hidden = !active
      }
      root.dataset["route"] = route
    }
    const selectRoute = (nextRoute: PhoneShellRoute): void => {
      route = nextRoute
      render()
    }
    const cleanups = routes.map(([currentRoute, button]) =>
      listen(button, "click", () => selectRoute(currentRoute)),
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
