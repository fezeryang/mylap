import type { AssetInstanceId } from "../runtime/ids"
import type { KeyboardRouteTarget } from "../runtime/keyboard-router"
import type { DesktopNavigationController, DesktopNavigationState } from "./desktop-navigation"
import type { ShellDom } from "./dom-contract"

export type ShellControllerOptions = {
  readonly activateAsset: (assetId: AssetInstanceId) => void
  readonly clearScreenFocus: () => void
  readonly computerAssetId: AssetInstanceId
  readonly navigation: DesktopNavigationController
  readonly onDiagnostic: () => void
  readonly phoneAssetId: AssetInstanceId
  readonly radioAssetId?: AssetInstanceId
  readonly routeKeyboardTo: (assetId: AssetInstanceId) => void
}

export type ShellEscapeEvent = {
  readonly key: string
  readonly repeat: boolean
  preventDefault(): void
  stopPropagation(): void
}

export type ShellController = {
  dispose(): void
  enter(): void
  exit(): void
  focusDevice(assetId: AssetInstanceId): boolean
  handleEscape(event: ShellEscapeEvent): void
  pickDevice(assetId: AssetInstanceId): boolean
  readState(): DesktopNavigationState
}

const isDeviceFocus = (state: DesktopNavigationState): boolean =>
  state === "phone-focus" || state === "computer-focus" || state === "radio-focus"

export const createShellController = (options: ShellControllerOptions): ShellController => {
  let disposed = false
  const radioAssetId = options.radioAssetId ?? {
    kind: "asset-instance-id",
    value: "radio-main",
  }

  const activate = (assetId: AssetInstanceId): void => {
    options.activateAsset(assetId)
    options.clearScreenFocus()
    options.routeKeyboardTo(assetId)
  }

  const returnToOverview = (): void => {
    if (!isDeviceFocus(options.navigation.read().state)) return
    options.onDiagnostic()
    options.clearScreenFocus()
    options.activateAsset(options.computerAssetId)
    options.routeKeyboardTo(options.computerAssetId)
    options.navigation.request("return-overview")
  }

  const focusDevice = (assetId: AssetInstanceId): boolean => {
    if (disposed) return false
    const isPhone = assetId.value === options.phoneAssetId.value
    const isComputer = assetId.value === options.computerAssetId.value
    const isRadio = assetId.value === radioAssetId.value
    if (!isPhone && !isComputer && !isRadio) return false
    const currentState = options.navigation.read().state
    if (
      (isPhone && currentState === "phone-focus") ||
      (isComputer && currentState === "computer-focus") ||
      (isRadio && currentState === "radio-focus")
    ) {
      return true
    }
    if (currentState !== "overview" && !isDeviceFocus(currentState)) return false
    options.onDiagnostic()
    activate(assetId)
    options.navigation.request(isPhone ? "focus-phone" : isRadio ? "focus-radio" : "focus-computer")
    return true
  }

  return {
    dispose: () => {
      disposed = true
    },
    enter: () => {
      if (disposed || options.navigation.read().state !== "landing") return
      options.onDiagnostic()
      activate(options.computerAssetId)
      options.navigation.request("enter")
    },
    exit: () => {
      if (!disposed) returnToOverview()
    },
    focusDevice,
    handleEscape: (event) => {
      if (disposed || event.key !== "Escape" || event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      options.onDiagnostic()
      returnToOverview()
    },
    pickDevice: focusDevice,
    readState: () => options.navigation.read().state,
  }
}

type ShellDomBindingOptions = ShellControllerOptions & {
  readonly document: Document
  readonly dom: ShellDom
}

const statusFor = (state: DesktopNavigationState): string => {
  switch (state) {
    case "landing":
      return "LANDING · ENTER DESKTOP TO BEGIN"
    case "entering":
      return "ENTERING DESKTOP · INPUT LOCKED"
    case "overview":
      return "OVERVIEW · CHOOSE A DEVICE"
    case "focusing-phone":
      return "FOCUSING PHONE · INPUT LOCKED"
    case "focusing-computer":
      return "FOCUSING COMPUTER · INPUT LOCKED"
    case "focusing-radio":
      return "FOCUSING RADIO · INPUT LOCKED"
    case "phone-focus":
      return "PHONE FOCUS · ESCAPE TO OVERVIEW"
    case "computer-focus":
      return "COMPUTER FOCUS · ESCAPE TO OVERVIEW"
    case "radio-focus":
      return "RADIO FOCUS · ESCAPE TO OVERVIEW"
    case "returning":
      return "RETURNING TO OVERVIEW · INPUT LOCKED"
  }
}

export type ShellDomBinding = ShellController & { sync(): void }

export const bindShellDom = (options: ShellDomBindingOptions): ShellDomBinding => {
  const controller = createShellController(options)
  const cleanups: (() => void)[] = []
  const listenClick = (target: HTMLElement, listener: () => void): void => {
    target.addEventListener("click", listener, false)
    cleanups.push(() => target.removeEventListener("click", listener, false))
  }
  const listenKey = (
    target: HTMLElement | Document,
    listener: (event: KeyboardEvent) => void,
  ): void => {
    if (target instanceof HTMLElement) {
      target.addEventListener("keydown", listener, false)
      cleanups.push(() => target.removeEventListener("keydown", listener, false))
      return
    }
    target.addEventListener("keydown", listener, false)
    cleanups.push(() => target.removeEventListener("keydown", listener, false))
  }
  const stopNativeActivationPropagation = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation()
  }
  let renderedState: DesktopNavigationState | null = null
  const sync = (): void => {
    const state = controller.readState()
    if (renderedState === state) return
    renderedState = state
    const overview = state === "overview"
    const deviceFocus = isDeviceFocus(state)
    options.dom.app.dataset["navigationState"] = state
    options.dom.landingPanel.hidden = state !== "landing"
    options.dom.deviceControls.hidden = !overview
    options.dom.exitDevice.hidden = !deviceFocus
    options.dom.enterDesktop.disabled = state !== "landing"
    options.dom.focusPhone.disabled = !overview
    options.dom.focusComputer.disabled = !overview
    options.dom.focusRadio.disabled = !overview
    options.dom.exitDevice.disabled = !deviceFocus
    options.dom.navigationStatus.textContent = statusFor(state)
  }
  const action =
    (callback: () => void): (() => void) =>
    () => {
      callback()
      sync()
    }

  listenClick(options.dom.enterDesktop, action(controller.enter))
  listenClick(
    options.dom.focusPhone,
    action(() => controller.focusDevice(options.phoneAssetId)),
  )
  listenClick(
    options.dom.focusComputer,
    action(() => controller.focusDevice(options.computerAssetId)),
  )
  listenClick(
    options.dom.focusRadio,
    action(() =>
      controller.focusDevice(
        options.radioAssetId ?? { kind: "asset-instance-id", value: "radio-main" },
      ),
    ),
  )
  listenClick(options.dom.exitDevice, action(controller.exit))
  for (const button of [
    options.dom.enterDesktop,
    options.dom.focusPhone,
    options.dom.focusComputer,
    options.dom.focusRadio,
    options.dom.exitDevice,
  ]) {
    listenKey(button, stopNativeActivationPropagation)
  }
  listenKey(options.document, (event) => {
    controller.handleEscape(event)
    sync()
  })
  sync()

  return {
    ...controller,
    dispose: () => {
      cleanups.forEach((cleanup) => {
        cleanup()
      })
      controller.dispose()
    },
    sync,
  }
}

export const createKeyboardTargetClassifier =
  (
    readState: () => DesktopNavigationState,
  ): ((target: EventTarget | null) => KeyboardRouteTarget) =>
  (target) => {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null
    if (element === null) return { kind: "locked" }
    const screen = element.closest<HTMLElement>(".model-screen[data-focused='true']")
    if (screen !== null) {
      const assetId = screen.dataset["assetInstance"]
      const screenId = screen.dataset["screenId"]
      if (assetId === undefined || screenId === undefined) return { kind: "locked" }
      return { assetId, kind: "screen", screenId }
    }
    if (element.closest("button, input, select, textarea, a[href], [contenteditable='true']")) {
      return { kind: "shell" }
    }
    switch (readState()) {
      case "overview":
      case "computer-focus":
        return { assetId: "computer-main", kind: "physical" }
      case "phone-focus":
        return { assetId: "phone-main", kind: "physical" }
      case "radio-focus":
        return { kind: "locked" }
      case "landing":
      case "entering":
      case "focusing-phone":
      case "focusing-computer":
      case "focusing-radio":
      case "returning":
        return { kind: "locked" }
    }
  }
