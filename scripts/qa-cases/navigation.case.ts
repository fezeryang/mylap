import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three"

import type { DesktopNavigationRequest } from "../../src/shell/desktop-navigation"
import { createViewerRendering } from "../../src/viewer/viewer-rendering"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .navigation-shell { min-height: 100dvh; display: grid; grid-template-rows: auto minmax(360px, 1fr) auto; color: #ddd9ee; }
  .navigation-header { padding: 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; background: rgba(3, 4, 10, .82); border-bottom: 1px solid #34346a; }
  .navigation-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .navigation-copy, .navigation-status { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.5; }
  .navigation-stage { position: relative; min-height: 360px; overflow: hidden; background: radial-gradient(circle at 50% 40%, #111936, #03040a 72%); }
  .navigation-stage canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .navigation-badge { position: absolute; inset: 12px auto auto 12px; padding: 8px 10px; background: rgba(7, 10, 26, .84); border: 1px solid #34346a; }
  .navigation-controls { padding: 12px 16px 16px; display: flex; flex-wrap: wrap; gap: 8px; background: #050713; border-top: 1px solid #34346a; }
  .navigation-controls button, .navigation-controls input { border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px 12px; }
  .navigation-controls input { inline-size: 112px; }
  @media (max-width: 767px) { .navigation-header { padding: 12px; } .navigation-controls { padding: 10px 12px 14px; } }
`

const makeBox = (
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: string,
): Mesh => {
  const box = new Mesh(
    new BoxGeometry(...size),
    new MeshStandardMaterial({ color: new Color(color), metalness: 0.34, roughness: 0.42 }),
  )
  box.name = name
  box.position.set(...position)
  box.castShadow = true
  box.receiveShadow = true
  return box
}

export const caseId = "navigation"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stage = document.createElement("div")
  const canvas = document.createElement("canvas")
  const status = document.createElement("p")
  const controls = document.createElement("div")
  const timestamp = document.createElement("input")
  const inputGate = { enabled: true }
  const settlements: string[] = []
  let lockCount = 0
  let restoreCount = 0
  let disposed = false

  style.textContent = styles
  shell.className = "navigation-shell"
  stage.className = "navigation-stage"
  canvas.setAttribute("aria-label", "Deterministic desktop camera navigation preview")
  status.className = "navigation-status navigation-badge"
  status.dataset["testid"] = "navigation-status"
  controls.className = "navigation-controls"
  timestamp.dataset["testid"] = "timestamp"
  timestamp.inputMode = "numeric"
  timestamp.value = "0"

  const rendering = createViewerRendering({
    canvas,
    multipleAssets: true,
    navigation: {
      input: inputGate,
      onInteractionLockChange: (locked) => {
        if (locked) lockCount += 1
        else restoreCount += 1
      },
      onSettled: (state) => settlements.push(state),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    requestedView: null,
  })
  const navigation = rendering.navigation
  if (navigation === null) throw new Error("Navigation binding was not created")

  const composition = new Group()
  composition.name = "future-desk-composition-guide"
  composition.add(
    makeBox("desk", [9.2, 0.28, 5.2], [0, -0.18, 0], "#10152c"),
    makeBox("computer", [4.2, 0.65, 2.2], [0, 0.34, 0], "#34346a"),
    makeBox("phone", [0.9, 0.12, 2.2], [-3, 0.12, 0], "#7657ff"),
    makeBox("radio", [1.7, 0.82, 1.2], [3, 0.43, 0], "#167f9f"),
  )
  rendering.scene.add(composition)

  const updateStatus = (): void => {
    const snapshot = navigation.read()
    status.dataset["snapshot"] = JSON.stringify({
      camera: rendering.camera.position.toArray(),
      controlsEnabled: rendering.controls.enabled,
      inputEnabled: inputGate.enabled,
      interactionLocked: snapshot.interactionLocked,
      lockCount,
      pose: snapshot.pose,
      progress: snapshot.progress,
      restoreCount,
      settlements,
      state: snapshot.state,
      target: rendering.controls.target.toArray(),
    })
    status.dataset["disposed"] = String(disposed)
    status.textContent = `${snapshot.state.toUpperCase()} · ${snapshot.interactionLocked ? "INPUT LOCKED" : "INPUT READY"}`
  }

  const request = (value: DesktopNavigationRequest): void => {
    navigation.request(value)
    rendering.render()
    updateStatus()
  }
  const makeButton = (label: string, testId: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = label
    button.dataset["testid"] = testId
    button.addEventListener("click", action)
    return button
  }
  const advance = makeButton("Advance frame", "advance", () => {
    if (disposed) {
      navigation.advance(Number(timestamp.value))
      updateStatus()
      return
    }
    rendering.render(Number(timestamp.value))
    updateStatus()
  })
  const dispose = makeButton("Dispose", "dispose", () => {
    if (disposed) return
    disposed = true
    window.removeEventListener("resize", resize)
    rendering.dispose()
    updateStatus()
  })
  const resize = (): void => {
    rendering.resize(window.innerWidth, Math.max(360, stage.clientHeight))
    rendering.render()
    updateStatus()
  }

  shell.innerHTML = `
    <header class="navigation-header">
      <div><h1 class="navigation-heading">DESKTOP CAMERA NAVIGATION</h1><p class="navigation-copy">Render-loop-driven fixed composition framing</p></div>
    </header>
  `
  controls.append(
    makeButton("Enter desktop", "enter", () => request("enter")),
    makeButton("Focus phone", "focus-phone", () => request("focus-phone")),
    makeButton("Focus computer", "focus-computer", () => request("focus-computer")),
    makeButton("Return overview", "return-overview", () => request("return-overview")),
    timestamp,
    advance,
    dispose,
  )
  stage.append(canvas, status)
  shell.append(style, stage, controls)
  root.append(shell)
  window.addEventListener("resize", resize)
  resize()
  rendering.render(0)
  updateStatus()
}
