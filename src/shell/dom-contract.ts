export class ShellDomContractError extends Error {
  constructor(
    readonly selector: string,
    readonly expected: string,
  ) {
    super(`Expected ${selector} to resolve to ${expected}`)
    this.name = "ShellDomContractError"
  }
}

export type ShellDom = {
  readonly app: HTMLElement
  readonly deviceControls: HTMLElement
  readonly enterDesktop: HTMLButtonElement
  readonly exitDevice: HTMLButtonElement
  readonly focusComputer: HTMLButtonElement
  readonly focusPhone: HTMLButtonElement
  readonly focusRadio: HTMLButtonElement
  readonly landingPanel: HTMLElement
  readonly navigationStatus: HTMLElement
  readonly shell: HTMLElement
}

const requireElement = (root: ParentNode, selector: string): HTMLElement => {
  const element = root.querySelector(selector)
  if (!(element instanceof HTMLElement)) throw new ShellDomContractError(selector, "element")
  return element
}

const requireButton = (root: ParentNode, selector: string): HTMLButtonElement => {
  const element = root.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) {
    throw new ShellDomContractError(selector, "button")
  }
  return element
}

export const queryShellDom = (root: ParentNode): ShellDom => ({
  app: requireElement(root, "#app"),
  deviceControls: requireElement(root, "#device-focus-controls"),
  enterDesktop: requireButton(root, "#enter-desktop"),
  exitDevice: requireButton(root, "#exit-device"),
  focusComputer: requireButton(root, "#focus-computer"),
  focusPhone: requireButton(root, "#focus-phone"),
  focusRadio: requireButton(root, "#focus-radio"),
  landingPanel: requireElement(root, "#landing-panel"),
  navigationStatus: requireElement(root, "#navigation-status"),
  shell: requireElement(root, "#desktop-shell"),
})
