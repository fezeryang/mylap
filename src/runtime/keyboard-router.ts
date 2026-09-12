import type { AssetKeyboard } from "./asset-contracts"

export type KeyboardInputEvent = {
  readonly code: string
  readonly repeat: boolean
  readonly target: EventTarget | null
  preventDefault(): void
}

export type KeyboardRouteTarget =
  | { readonly kind: "shell" }
  | {
      readonly assetId: string
      readonly kind: "screen"
      readonly screenId: string
    }
  | { readonly assetId: string; readonly kind: "physical" }
  | { readonly kind: "locked" }

export type KeyboardRouteDiagnostic = {
  readonly assetId: string
  readonly code: string
  readonly screenId: string | null
}

export type KeyboardRouterConnectOptions = {
  readonly classifyTarget: (target: EventTarget | null) => KeyboardRouteTarget
  readonly onDiagnostic: (diagnostic: KeyboardRouteDiagnostic | null) => void
}

export type KeyboardEventSource = {
  addEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void
  removeEventListener(
    type: "blur" | "keydown" | "keyup",
    listener: (event: KeyboardInputEvent) => void,
  ): void
}

export type VisibilityEventSource = {
  readonly visibilityState: DocumentVisibilityState
  addEventListener(type: "visibilitychange", listener: () => void): void
  removeEventListener(type: "visibilitychange", listener: () => void): void
}

export class KeyboardRouter {
  private activeKeyboard: AssetKeyboard | null = null
  private readonly forwardedCodes = new Set<string>()

  setActive(keyboard: AssetKeyboard | null): void {
    if (this.activeKeyboard === keyboard) return
    this.releaseAll()
    this.activeKeyboard = keyboard
  }

  handleKeyDown(code: string, repeat: boolean): void {
    if (!repeat) this.activeKeyboard?.press(code)
  }

  handleKeyUp(code: string): void {
    this.activeKeyboard?.release(code)
  }

  handlePageVisibility(visible: boolean): void {
    if (!visible) this.releaseAll()
  }

  connect(
    browserWindow: KeyboardEventSource,
    pageDocument: VisibilityEventSource,
    options?: KeyboardRouterConnectOptions,
  ): () => void {
    const keyDown = (event: KeyboardInputEvent): void => {
      if (options === undefined) {
        this.handleKeyDown(event.code, event.repeat)
        return
      }
      const target = options.classifyTarget(event.target)
      switch (target.kind) {
        case "shell":
        case "locked":
          options.onDiagnostic(null)
          return
        case "screen":
          if (event.repeat) return
          options.onDiagnostic({
            assetId: target.assetId,
            code: event.code,
            screenId: target.screenId,
          })
          return
        case "physical":
          if (event.repeat) return
          event.preventDefault()
          if (this.activeKeyboard?.press(event.code) === true) {
            this.forwardedCodes.add(event.code)
          }
          options.onDiagnostic({ assetId: target.assetId, code: event.code, screenId: null })
          return
      }
    }
    const keyUp = (event: KeyboardInputEvent): void => {
      if (options === undefined) {
        this.handleKeyUp(event.code)
        return
      }
      if (!this.forwardedCodes.delete(event.code)) return
      event.preventDefault()
      this.activeKeyboard?.release(event.code)
    }
    const blur = (_event: KeyboardInputEvent): void => this.releaseAll()
    const visibility = (): void =>
      this.handlePageVisibility(pageDocument.visibilityState === "visible")
    browserWindow.addEventListener("keydown", keyDown)
    browserWindow.addEventListener("keyup", keyUp)
    browserWindow.addEventListener("blur", blur)
    pageDocument.addEventListener("visibilitychange", visibility)
    return () => {
      browserWindow.removeEventListener("keydown", keyDown)
      browserWindow.removeEventListener("keyup", keyUp)
      browserWindow.removeEventListener("blur", blur)
      pageDocument.removeEventListener("visibilitychange", visibility)
      this.releaseAll()
    }
  }

  releaseAll(): void {
    this.activeKeyboard?.releaseAll()
    this.forwardedCodes.clear()
  }
}
