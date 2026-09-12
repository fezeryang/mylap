import type { BrowserDecision, BrowserPolicy } from "./browser-url-policy"
import { element, listen } from "./dom"
import type { LauncherState } from "./launcher-state"

export type BrowserViewHandle = {
  readonly element: HTMLElement
  dispose(): void
  render(state: LauncherState): void
}

export type BrowserViewOptions = {
  readonly browserPolicy: BrowserPolicy
  readonly onSubmit: () => void
  readonly onUpdateInput: (input: string) => void
}

const describeDecision = (decision: BrowserDecision | null): string => {
  if (decision === null) return "Enter a destination to open the bounded browser."
  switch (decision.kind) {
    case "embed":
      return "Embedded under the locked sandbox policy."
    case "new-tab-only":
      return "This origin opens in a new tab only."
    case "reject":
      return `Blocked: ${decision.code}`
  }
}

export const createBrowserView = (options: BrowserViewOptions): BrowserViewHandle => {
  const root = element("section", "launcher-browser")
  root.setAttribute("aria-label", "Bounded browser")
  const heading = element("h2", "launcher-section-heading", "Browser")
  const form = element("form", "launcher-browser-form")
  const label = element("label", "launcher-browser-label", "URL")
  const input = document.createElement("input")
  input.type = "text"
  input.setAttribute("autocomplete", "url")
  input.dataset["testid"] = "launcher-browser-input"
  input.placeholder = "example.com or /qa/iframe-fixture.html"
  input.setAttribute("aria-label", "Browser URL")
  const submit = element("button", "launcher-button", "Open")
  submit.type = "submit"
  label.append(input)
  form.append(label, submit)
  const feedback = element("p", "launcher-browser-status", "")
  feedback.setAttribute("aria-live", "polite")
  const frame = document.createElement("iframe")
  frame.dataset["testid"] = "launcher-browser-frame"
  frame.title = "Bounded browser content"
  frame.setAttribute("sandbox", options.browserPolicy.iframeSandbox)
  frame.referrerPolicy = options.browserPolicy.referrerPolicy
  const newTab = element("button", "launcher-button", "Open in new tab")
  newTab.type = "button"
  newTab.dataset["testid"] = "launcher-new-tab"
  newTab.disabled = true
  root.append(heading, form, feedback, newTab, frame)

  let decision: BrowserDecision | null = null
  let disposed = false
  const render = (state: LauncherState): void => {
    if (input.value !== state.browserInput) input.value = state.browserInput
    decision = state.browserDecision
    feedback.textContent = describeDecision(decision)
    newTab.disabled = decision === null || decision.kind === "reject"
    if (decision?.kind === "embed") {
      if (frame.getAttribute("src") !== decision.url) frame.src = decision.url
      return
    }
    frame.removeAttribute("src")
  }

  const cleanups = [
    listen(input, "input", () => options.onUpdateInput(input.value)),
    listen(form, "submit", (event) => {
      event.preventDefault()
      options.onSubmit()
    }),
    listen(newTab, "click", () => {
      if (decision === null || decision.kind === "reject") return
      const popup = window.open(decision.url, "_blank", "noopener,noreferrer")
      if (popup === null) {
        feedback.textContent = "Open requested; your browser may block it."
        return
      }
      if (popup.opener !== null) {
        popup.close()
        feedback.textContent = "Unsafe window closed"
        return
      }
      feedback.textContent = "Open requested; your browser may block it."
    }),
  ]

  return {
    element: root,
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups) cleanup()
    },
    render,
  }
}
