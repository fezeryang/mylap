import "../../src/style.css"

import type { AssetKeyboard, KeyboardBinding } from "../../src/runtime/asset-contracts"
import { assetInstanceId } from "../../src/runtime/ids"
import {
  KeyboardRouter,
  type KeyboardRouteDiagnostic,
} from "../../src/runtime/keyboard-router"
import { connectScreenEscapeRelease } from "../../src/runtime/screen-runtime"
import { createDesktopNavigationController } from "../../src/shell/desktop-navigation"
import { queryShellDom } from "../../src/shell/dom-contract"
import { bindShellDom, createKeyboardTargetClassifier } from "../../src/shell/shell-dom"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

class QaKeyboard implements AssetKeyboard {
  readonly bindings: readonly KeyboardBinding[] = []
  readonly pressedCodes: readonly never[] = []
  readonly events: string[] = []

  press(code: string): boolean {
    this.events.push(`down:${code}`)
    return true
  }

  release(code: string): boolean {
    this.events.push(`up:${code}`)
    return true
  }

  releaseAll(): void {
    this.events.push("release-all")
  }

  update(): void {}
}

const styles = `
  #qa-root { min-height: 100dvh; }
  #app { min-height: 100dvh; }
  #scene { background: radial-gradient(circle at 55% 45%, #18234a, #03040a 70%); }
  .qa-device { position: absolute; z-index: 1; top: 42%; border: 1px solid #7657ff; background: #101633; color: #ddd9ee; cursor: pointer; }
  .qa-device--phone { left: 19%; width: 14%; height: 30%; transform: perspective(400px) rotateY(-12deg); }
  .qa-device--computer { right: 18%; width: 38%; height: 28%; transform: perspective(500px) rotateX(12deg); }
  .qa-device span { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); font: 700 .75rem/1.4 monospace; }
  .model-screen { position: absolute; z-index: 2; bottom: 18%; width: 180px; padding: 12px; border: 1px solid #34d9ff; background: #07102b; }
  .model-screen[data-focused='true'] { filter: drop-shadow(0 0 12px #34d9ff); }
  .model-screen--phone { left: 16%; }
  .model-screen--computer { right: 25%; }
  .model-screen input { width: 100%; border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px; }
  .qa-tools { position: absolute; z-index: 5; right: 12px; bottom: 12px; display: flex; gap: 6px; }
  .qa-tools button { border: 1px solid #34346a; background: #07102b; color: #9799de; padding: 6px 8px; }
  @media (max-width: 520px) {
    .hud--identity, .hud--status, .hud--inspector, .control-dock { display: none; }
    .qa-device--phone { left: 10%; width: 24%; }
    .qa-device--computer { right: 6%; width: 52%; }
    .model-screen { bottom: 12%; width: 140px; }
    .model-screen--phone { left: 4%; }
    .model-screen--computer { right: 4%; }
    .qa-tools { display: none; }
  }
`

export const caseId = "shell"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  root.innerHTML = `
    <main id="app" aria-label="TODŌU personal device desktop shell">
      <canvas id="scene" aria-label="Personal device desktop overview"></canvas>
      <section id="desktop-shell" class="desktop-shell" aria-labelledby="desktop-shell-title">
        <div id="landing-panel" class="desktop-shell__panel desktop-shell__panel--landing">
          <p class="overline">PERSONAL DEVICE FIELD</p>
          <h2 id="desktop-shell-title">TODŌU DESKTOP</h2>
          <p class="desktop-shell__copy">Enter the shared space, then choose a device to focus.</p>
          <button id="enter-desktop" class="control control--cyan" type="button">ENTER DESKTOP</button>
        </div>
        <nav id="device-focus-controls" class="desktop-shell__panel desktop-shell__devices" aria-label="Choose a device" hidden>
          <button id="focus-phone" class="control" type="button">FOCUS PHONE</button>
          <button id="focus-computer" class="control" type="button">FOCUS COMPUTER</button>
          <button id="focus-radio" class="control" type="button">FOCUS RADIO</button>
        </nav>
        <button id="exit-device" class="control desktop-shell__exit" type="button" hidden>EXIT DEVICE</button>
        <p id="navigation-status" class="desktop-shell__status" aria-live="polite">LANDING</p>
      </section>
      <button class="qa-device qa-device--phone" data-testid="pick-phone" type="button"><span>PHONE</span></button>
      <button class="qa-device qa-device--computer" data-testid="pick-computer" type="button"><span>COMPUTER</span></button>
      <section class="model-screen model-screen--phone" data-asset-instance="phone-main" data-screen-id="phone-primary" data-focused="false" role="region" aria-label="Phone primary screen">
        <input data-testid="screen-phone" aria-label="Phone screen input" />
      </section>
      <section class="model-screen model-screen--computer" data-asset-instance="computer-main" data-screen-id="main" data-focused="false" role="region" aria-label="Computer main screen">
        <input data-testid="screen-computer" aria-label="Computer screen input" />
      </section>
      <div class="qa-tools" aria-label="QA scenario controls">
        <button data-testid="settle" type="button">SETTLE</button>
        <button data-testid="focus-screen-phone" type="button">PHONE SCREEN</button>
        <button data-testid="focus-screen-computer" type="button">COMPUTER SCREEN</button>
        <button data-testid="remove-phone" type="button">REMOVE PHONE</button>
        <button data-testid="other-control" type="button">OTHER</button>
      </div>
    </main>
  `
  const style = document.createElement("style")
  style.textContent = styles
  root.prepend(style)

  const phoneId = assetInstanceId("phone-main")
  const computerId = assetInstanceId("computer-main")
  const phoneKeyboard = new QaKeyboard()
  const computerKeyboard = new QaKeyboard()
  const keyboardRouter = new KeyboardRouter()
  const navigation = createDesktopNavigationController({
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  })
  let frameTime = 0
  navigation.advance(frameTime)
  const dom = queryShellDom(document)
  const phoneScreen = document.querySelector<HTMLElement>(".model-screen--phone")
  const computerScreen = document.querySelector<HTMLElement>(".model-screen--computer")
  const phoneInput = document.querySelector<HTMLInputElement>("[data-testid='screen-phone']")
  const computerInput = document.querySelector<HTMLInputElement>("[data-testid='screen-computer']")
  if (phoneScreen === null || computerScreen === null || phoneInput === null || computerInput === null) {
    throw new Error("Shell QA screen fixture is incomplete")
  }

  let activeAsset = "computer-main"
  let focusedScreen: { readonly assetId: string; readonly screenId: string } | null = null
  let lastKeyboardRoute: KeyboardRouteDiagnostic | null = null
  let shellBinding: ReturnType<typeof bindShellDom> | null = null
  keyboardRouter.setActive(computerKeyboard)

  const renderSnapshot = (): void => {
    shellBinding?.sync()
    dom.navigationStatus.dataset["snapshot"] = JSON.stringify({
      activeAsset,
      computerEvents: computerKeyboard.events,
      controlsEnabled: focusedScreen === null && !navigation.read().interactionLocked,
      focusedScreen,
      lastKeyboardRoute,
      navigationState: navigation.read().state,
      phoneEvents: phoneKeyboard.events,
    })
  }
  const clearScreenFocus = (): void => {
    focusedScreen = null
    phoneScreen.dataset["focused"] = "false"
    computerScreen.dataset["focused"] = "false"
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement.closest(".model-screen") !== null) {
      activeElement.blur()
    }
    lastKeyboardRoute = null
    renderSnapshot()
  }
  const disconnectScreenEscape = connectScreenEscapeRelease(
    document,
    () => focusedScreen !== null,
    clearScreenFocus,
  )
  shellBinding = bindShellDom({
    activateAsset: (assetId) => {
      activeAsset = assetId.value
    },
    clearScreenFocus,
    computerAssetId: computerId,
    document,
    dom,
    navigation,
    onDiagnostic: () => {
      lastKeyboardRoute = null
    },
    phoneAssetId: phoneId,
    routeKeyboardTo: (assetId) => {
      keyboardRouter.setActive(assetId.value === phoneId.value ? phoneKeyboard : computerKeyboard)
    },
  })
  const disconnectKeyboard = keyboardRouter.connect(window, document, {
    classifyTarget: createKeyboardTargetClassifier(() => navigation.read().state),
    onDiagnostic: (diagnostic) => {
      lastKeyboardRoute = diagnostic
      renderSnapshot()
    },
  })

  const settle = (): void => {
    const snapshot = navigation.read()
    const duration = snapshot.state === "entering" ? 1600 : 650
    frameTime += duration
    navigation.advance(frameTime)
    renderSnapshot()
  }
  const focusScreen = (
    assetId: "phone-main" | "computer-main",
    screenId: "phone-primary" | "main",
    screen: HTMLElement,
    input: HTMLInputElement,
  ): void => {
    activeAsset = assetId
    keyboardRouter.setActive(assetId === "phone-main" ? phoneKeyboard : computerKeyboard)
    clearScreenFocus()
    focusedScreen = { assetId, screenId }
    screen.dataset["focused"] = "true"
    input.focus()
    renderSnapshot()
  }

  document.querySelector("[data-testid='settle']")?.addEventListener("click", settle)
  document.querySelector("[data-testid='pick-phone']")?.addEventListener("click", () => {
    shellBinding?.pickDevice(phoneId)
    renderSnapshot()
  })
  document.querySelector("[data-testid='pick-computer']")?.addEventListener("click", () => {
    shellBinding?.pickDevice(computerId)
    renderSnapshot()
  })
  document.querySelector("[data-testid='focus-screen-phone']")?.addEventListener("click", () => {
    focusScreen("phone-main", "phone-primary", phoneScreen, phoneInput)
  })
  document.querySelector("[data-testid='focus-screen-computer']")?.addEventListener("click", () => {
    focusScreen("computer-main", "main", computerScreen, computerInput)
  })
  document.querySelector("[data-testid='remove-phone']")?.addEventListener("click", () => {
    clearScreenFocus()
    activeAsset = "computer-main"
    keyboardRouter.setActive(computerKeyboard)
    navigation.request("return-overview")
    settle()
  })
  document.addEventListener("click", renderSnapshot)
  document.addEventListener("keydown", renderSnapshot)
  window.addEventListener("keyup", renderSnapshot)
  window.addEventListener("pagehide", () => {
    disconnectScreenEscape()
    shellBinding?.dispose()
    disconnectKeyboard()
  }, { once: true })
  renderSnapshot()
}
