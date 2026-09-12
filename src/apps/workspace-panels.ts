import type { WorkspaceNotesService } from "../services/workspace-notes-service"
import { element, listen } from "./dom"

export type WorkspacePanelHandle = {
  readonly element: HTMLElement
  dispose(): void
}

export const createWorkspaceNotePanel = (
  notesService: WorkspaceNotesService,
): WorkspacePanelHandle => {
  const root = element("section", "workspace-note")
  const heading = element("h2", "app-panel-title", "Notes")
  const textarea = document.createElement("textarea")
  textarea.setAttribute("aria-label", "Shared note")
  textarea.placeholder = "Write something for this workspace…"
  const footer = element("div", "workspace-note__footer")
  const status = element("p", "workspace-note__status", "Saved locally on this device")
  status.setAttribute("aria-live", "polite")
  const save = element("button", "launcher-button", "Save")
  save.type = "button"
  footer.append(status, save)
  root.append(heading, textarea, footer)

  const render = (): void => {
    const snapshot = notesService.read()
    if (textarea !== document.activeElement) textarea.value = snapshot.text
    status.textContent = snapshot.savedAt === null ? "Saved locally on this device" : "Saved"
  }
  render()
  const unsubscribe = notesService.subscribe(render)
  const disconnectSave = listen(save, "click", () => notesService.save(textarea.value))

  return {
    element: root,
    dispose: () => {
      disconnectSave()
      unsubscribe()
    },
  }
}

export const createDevicePanel = (): HTMLElement => {
  const root = element("section", "device-panel")
  root.append(
    element("h2", "app-panel-title", "Connected devices"),
    element("p", "workspace-note__status", "Open another device without leaving the workspace."),
  )
  const actions = element("div", "device-grid")
  for (const [label, assetId] of [
    ["Computer", "computer-main"],
    ["Phone", "phone-main"],
    ["Radio", "radio-main"],
  ] as const) {
    const button = element("button", "app-action", label)
    button.type = "button"
    button.dataset["focusDevice"] = assetId
    actions.append(button)
  }
  root.append(actions)
  return root
}

export const createExpandButton = (): HTMLButtonElement => {
  const button = element("button", "app-action", "Open window")
  button.type = "button"
  button.dataset["expandScreen"] = "true"
  return button
}
