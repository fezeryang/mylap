import type { AssetKeyboard } from "./asset-contracts"

export class KeyboardRouter {
  private activeKeyboard: AssetKeyboard | null = null

  setActive(keyboard: AssetKeyboard | null): void {
    if (this.activeKeyboard === keyboard) return
    this.activeKeyboard?.releaseAll()
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

  connect(browserWindow: Window, pageDocument: Document): () => void {
    const keyDown = (event: KeyboardEvent): void => this.handleKeyDown(event.code, event.repeat)
    const keyUp = (event: KeyboardEvent): void => this.handleKeyUp(event.code)
    const blur = (): void => this.releaseAll()
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
  }
}
