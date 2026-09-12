import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import {
  RATIO_CASSETTE_DISPLAY_APP_ID,
  RATIO_TUNER_DISPLAY_APP_ID,
} from "../../src/apps/app-ids"
import { createRatioAssetDefinition } from "../../src/assets/ratio-asset"
import { AssetRegistry } from "../../src/runtime/asset-registry"
import { AssetStage } from "../../src/runtime/asset-stage"
import { assetInstanceId } from "../../src/runtime/ids"
import type { ScreenAppDefinition } from "../../src/runtime/screen-app"
import { ScreenAppRegistry } from "../../src/runtime/screen-app-registry"
import { ScreenRuntime } from "../../src/runtime/screen-runtime"
import type { RadioSnapshot } from "../../src/services/radio-contracts"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .ratio-adapter-shell { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; background: #03040a; font-family: "IBM Plex Mono", monospace; }
  .ratio-adapter-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .ratio-adapter-copy, .ratio-adapter-status { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.45; }
  .ratio-adapter-stage { position: relative; min-height: 430px; overflow: hidden; border: 1px solid #34346a; background: radial-gradient(circle at 50% 46%, #10194a, #03040a 74%); }
  .ratio-adapter-stage canvas, .ratio-adapter-stage .css3d-layer { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .ratio-adapter-stage .css3d-layer { pointer-events: none; }
  .ratio-adapter-stage .model-screen { overflow: hidden; pointer-events: auto; background: #02041c; color: #e6e1f6; border: 1px solid #1d285b; box-shadow: inset 0 0 28px #071247; }
  .ratio-tuner-screen { min-height: 100%; padding: 14px 22px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; background: linear-gradient(90deg, #06113c, #02041c 52%, #110629); }
  .ratio-tuner-screen strong { color: #37e7ff; font-size: 28px; letter-spacing: .08em; }
  .ratio-tuner-screen output { color: #aaa7ca; font-size: 18px; text-align: center; }
  .ratio-tuner-screen em { color: #ff4fd8; font-size: 18px; font-style: normal; }
  .ratio-cassette-screen { min-height: 100%; padding: 24px; display: grid; place-content: center; gap: 12px; text-align: center; background: radial-gradient(circle, #1a1152, #030317 70%); }
  .ratio-cassette-screen strong { color: #8d5cff; font-size: 30px; letter-spacing: .09em; }
  .ratio-cassette-screen output { color: #aaa7ca; font-size: 18px; }
  .ratio-adapter-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .ratio-adapter-controls button, .ratio-adapter-controls input { min-height: 42px; border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px 12px; font: inherit; }
  @media (max-width: 767px) { .ratio-adapter-shell { padding: 12px; } .ratio-adapter-stage { min-height: 360px; } }
`

type BoundsTuple = readonly [number, number, number, number, number, number]
type ScreenView = { readonly label: string; readonly state: string; readonly testId: string }

const boundsTuple = (bounds: Box3): BoundsTuple => [
  bounds.min.x,
  bounds.min.y,
  bounds.min.z,
  bounds.max.x,
  bounds.max.y,
  bounds.max.z,
]

const snapshot = (overrides: Partial<RadioSnapshot> = {}): RadioSnapshot => ({
  error: null,
  liveElapsedSeconds: 12,
  powered: true,
  selectedStation: null,
  stations: [],
  status: "paused",
  visualization: [0.15, 0.45, 0.8, 0.3],
  volume: 0.7,
  ...overrides,
})

const initialSnapshot = (): RadioSnapshot => {
  switch (new URL(window.location.href).searchParams.get("radio-state")) {
    case "playing":
      return snapshot({ liveElapsedSeconds: 13, status: "playing" })
    case "paused":
      return snapshot({ status: "paused" })
    case "error":
      return snapshot({
        error: { code: "stream-failed", message: "Fixture stream failed" },
        status: "error",
      })
    default:
      return snapshot()
  }
}

const screenView = (current: RadioSnapshot): ScreenView => ({
  label: current.error === null ? current.status.toUpperCase() : current.error.code.toUpperCase(),
  state: current.status,
  testId: current.error === null ? "ratio-live-state" : "ratio-error-state",
})

const ratioTunerApp = (readSnapshot: () => RadioSnapshot): ScreenAppDefinition => ({
  appId: RATIO_TUNER_DISPLAY_APP_ID,
  mount: (host) => {
    const app = document.createElement("section")
    const frequency = document.createElement("strong")
    const state = document.createElement("output")
    const signal = document.createElement("em")
    const render = (): void => {
      const current = readSnapshot()
      const view = screenView(current)
      app.dataset["radioState"] = view.state
      frequency.textContent = "99.7 FM"
      signal.dataset["testid"] = view.testId
      signal.textContent = view.label
      state.textContent = `SPECTRUM ${current.visualization.map((value) => Math.round(value * 9)).join(" ")}`
    }
    app.className = "ratio-tuner-screen"
    app.dataset["testid"] = "ratio-tuner-app"
    app.append(frequency, state, signal)
    host.append(app)
    render()
    return { dispose: () => undefined, setActive: () => undefined, update: render }
  },
})

const ratioCassetteApp = (readSnapshot: () => RadioSnapshot): ScreenAppDefinition => ({
  appId: RATIO_CASSETTE_DISPLAY_APP_ID,
  mount: (host) => {
    const app = document.createElement("section")
    const title = document.createElement("strong")
    const state = document.createElement("output")
    const render = (): void => {
      const current = readSnapshot()
      const view = screenView(current)
      app.dataset["radioState"] = view.state
      title.textContent = "RATIO TAPE"
      state.dataset["testid"] = view.testId
      state.textContent = `${view.label} · ${current.liveElapsedSeconds.toFixed(1)} SEC`
    }
    app.className = "ratio-cassette-screen"
    app.dataset["testid"] = "ratio-cassette-app"
    app.append(title, state)
    host.append(app)
    render()
    return { dispose: () => undefined, setActive: () => undefined, update: render }
  },
})

export const caseId = "ratio-adapter"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const scene = new Scene()
  const assetRegistry = new AssetRegistry()
  const appRegistry = new ScreenAppRegistry()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stageElement = document.createElement("div")
  const status = document.createElement("p")
  const controls = document.createElement("div")
  const play = document.createElement("button")
  const pause = document.createElement("button")
  const fail = document.createElement("button")
  const explode = document.createElement("input")
  const reset = document.createElement("button")
  const remove = document.createElement("button")
  const orbit = new OrbitControls(camera, renderer.domElement)
  const ratioInstanceId = assetInstanceId("radio-main")
  let current = initialSnapshot()
  let disposalCount = 0
  let removed = false

  const ratioDefinition = createRatioAssetDefinition({ readRadioSnapshot: () => current })
  assetRegistry.register(ratioDefinition)
  appRegistry.register(ratioTunerApp(() => current))
  appRegistry.register(ratioCassetteApp(() => current))
  const stage = new AssetStage(scene, assetRegistry)
  const asset = stage.mount({
    instanceId: ratioInstanceId,
    position: [0, 0, 0],
    rotation: [0, Math.PI, 0],
    scale: 1,
    typeId: ratioDefinition.typeId,
  })
  const originalDispose = asset.dispose
  Object.defineProperty(asset, "dispose", {
    value: (): void => {
      disposalCount += 1
      originalDispose()
    },
  })
  stageElement.append(renderer.domElement)
  const screens = new ScreenRuntime({
    camera,
    container: stageElement,
    controls: orbit,
    readSnapshot: () => ({
      activeAsset: stage.active?.instanceId.value ?? "none",
      drawCalls: renderer.info.render.calls,
      fps: 60,
      selectedPart: "none",
      triangles: renderer.info.render.triangles,
    }),
    registry: appRegistry,
    scene,
    stage,
  })

  style.textContent = styles
  shell.className = "ratio-adapter-shell"
  stageElement.className = "ratio-adapter-stage"
  stageElement.dataset["testid"] = "ratio-adapter-stage"
  status.className = "ratio-adapter-status"
  status.dataset["testid"] = "ratio-adapter-status"
  controls.className = "ratio-adapter-controls"
  play.type = "button"
  play.textContent = "PLAY SNAPSHOT"
  pause.type = "button"
  pause.textContent = "PAUSE SNAPSHOT"
  fail.type = "button"
  fail.textContent = "ERROR SNAPSHOT"
  explode.type = "range"
  explode.dataset["testid"] = "ratio-explosion"
  explode.min = "0"
  explode.max = "1"
  explode.step = "1"
  explode.value = "0"
  reset.type = "button"
  reset.textContent = "RESET EXPLOSION"
  remove.type = "button"
  remove.textContent = "REMOVE RATIO"
  shell.innerHTML = `
    <h1 class="ratio-adapter-heading">RATIO ROOT ADAPTER</h1>
    <p class="ratio-adapter-copy">Real radio model, injected immutable snapshots, two physical CSS3D displays, and lifecycle cleanup.</p>
  `
  controls.append(play, pause, fail, explode, reset, remove)
  shell.append(style, stageElement, status, controls)
  root.append(shell)

  scene.background = new Color("#03040a")
  scene.add(new AmbientLight("#8d91bf", 2.3))
  const keyLight = new DirectionalLight("#e6e1f6", 4.5)
  keyLight.position.set(-3.5, 5, -6)
  scene.add(keyLight)
  const fillLight = new DirectionalLight("#37e7ff", 2.8)
  fillLight.position.set(3, 2, -4)
  scene.add(fillLight)
  camera.position.set(2.7, 2.25, -4.2)
  camera.lookAt(0, 0.55, 0)
  orbit.target.set(0, 0.55, 0)
  orbit.enableDamping = false
  orbit.enablePan = false

  const render = (): void => {
    const width = Math.max(320, stageElement.clientWidth)
    const height = Math.max(360, Math.min(640, Math.round(width * 0.56)))
    stageElement.style.height = `${height}px`
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    renderer.setSize(width, height, false)
    screens.resize(width, height)
    renderer.render(scene, camera)
    screens.render()
  }

  const updateStatus = (): void => {
    if (!removed) asset.update(0.25)
    render()
    const bounds = new Box3().setFromObject(asset.root)
    const normals = asset.screens.map((surface) =>
      new Vector3(0, 0, 1)
        .applyQuaternion(surface.anchor.getWorldQuaternion(new Quaternion()))
        .toArray(),
    )
    const reels = asset.parts.find((part) => part.id === "cassette-reels")
    const reelRotation = reels?.node.children[0]?.rotation.z ?? 0
    status.dataset["bounds"] = JSON.stringify(boundsTuple(bounds))
    status.dataset["disposalCount"] = String(disposalCount)
    status.dataset["explosion"] = String(asset.explosion)
    status.dataset["partIds"] = JSON.stringify(asset.parts.map((part) => part.id))
    status.dataset["reelRotation"] = String(reelRotation)
    status.dataset["removed"] = String(removed)
    status.dataset["screenCount"] = String(stageElement.querySelectorAll(".model-screen").length)
    status.dataset["screenIds"] = JSON.stringify(asset.screens.map((screen) => screen.screenId.value))
    status.dataset["screenNormal"] = JSON.stringify(normals)
    status.dataset["screenVisible"] = JSON.stringify(
      [...stageElement.querySelectorAll<HTMLElement>(".model-screen")].map(
        (element) => element.dataset["visible"] === "true",
      ),
    )
    status.dataset["status"] = current.status
    status.textContent = removed
      ? `Ratio removed · disposal ${disposalCount}`
      : `${asset.parts.length} stable parts · ${current.status} · reel ${reelRotation.toFixed(3)}`
  }

  play.addEventListener("click", () => {
    current = snapshot({ liveElapsedSeconds: 13, status: "playing" })
    updateStatus()
  })
  pause.addEventListener("click", () => {
    current = snapshot({ status: "paused" })
    updateStatus()
  })
  fail.addEventListener("click", () => {
    current = snapshot({ error: { code: "stream-failed", message: "Fixture stream failed" }, status: "error" })
    updateStatus()
  })
  explode.addEventListener("input", () => {
    asset.setExplosion(Number(explode.value))
    updateStatus()
  })
  reset.addEventListener("click", () => {
    explode.value = "0"
    asset.setExplosion(0)
    updateStatus()
  })
  remove.addEventListener("click", () => {
    if (removed) return
    stage.remove(ratioInstanceId)
    removed = true
    remove.disabled = true
    updateStatus()
  })
  window.addEventListener("resize", updateStatus)
  window.addEventListener(
    "pagehide",
    () => {
      screens.dispose()
      orbit.dispose()
      stage.dispose()
      renderer.dispose()
    },
    { once: true },
  )
  updateStatus()
}
