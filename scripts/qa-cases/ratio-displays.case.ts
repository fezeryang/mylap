import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import {
  createRatioCassetteDisplayApp,
  createRatioTunerDisplayApp,
} from "../../src/apps/ratio-display-presenter"
import { createRatioAssetDefinition } from "../../src/assets/ratio-asset"
import { AssetRegistry } from "../../src/runtime/asset-registry"
import { AssetStage } from "../../src/runtime/asset-stage"
import { assetInstanceId } from "../../src/runtime/ids"
import { assetTypeId } from "../../src/runtime/ids"
import { ScreenAppRegistry } from "../../src/runtime/screen-app-registry"
import { ScreenRuntime } from "../../src/runtime/screen-runtime"
import type {
  RadioCommand,
  RadioMediaService,
  RadioSnapshot,
  RadioStation,
} from "../../src/services/radio-contracts"
import type { SceneAssetDefinition, StageAsset } from "../../src/runtime/asset-contracts"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .ratio-displays-qa { min-height: 100dvh; display: grid; align-content: start; gap: 12px; padding: 16px; color: #ddd9ee; background: #03040a; font: 12px/1.45 "IBM Plex Mono", monospace; }
  .ratio-displays-qa h1 { margin: 0; color: #f4f2ff; font-size: 16px; letter-spacing: .1em; }
  .ratio-displays-qa p { margin: 0; color: #9799de; }
  .ratio-displays-stage { position: relative; min-height: 460px; overflow: hidden; border: 1px solid #34346a; background: radial-gradient(circle at 50% 42%, #10194a, #03040a 74%); }
  .ratio-displays-stage canvas, .ratio-displays-stage .css3d-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
  .ratio-displays-stage .css3d-layer { pointer-events: none; }
  .ratio-displays-stage .model-screen { overflow: hidden; pointer-events: auto; border: 1px solid #34346a; background: #02041c; box-shadow: inset 0 0 26px #071247; }
  .ratio-displays-tools { display: flex; flex-wrap: wrap; gap: 8px; }
  .ratio-displays-tools button { min-height: 38px; border: 1px solid #7657ff; padding: 7px 10px; color: #ddd9ee; background: #14214a; font: inherit; }
  .ratio-displays-tools button:focus-visible { outline: 2px solid #34d9ff; outline-offset: 2px; }
  @media (max-width: 767px) { .ratio-displays-qa { padding: 12px; } .ratio-displays-stage { min-height: 360px; } }
`

const station = {
  bitrate: 128,
  codec: "MP3",
  favicon: null,
  healthy: true,
  hls: false,
  homepage: null,
  name: "QA Radio Signal",
  source: "qa-fixture",
  stationUuid: "ratio-display-fixture",
  streamUrl: "/qa/ratio-display.mp3",
} as const satisfies RadioStation

const snapshot = (overrides: Partial<RadioSnapshot> = {}): RadioSnapshot => ({
  error: null,
  liveElapsedSeconds: 12.5,
  powered: true,
  selectedStation: station,
  stations: [station],
  status: "loading",
  visualization: [0, 0.18, 0.62, 1],
  volume: 0.35,
  ...overrides,
})

const OCCLUDER_TYPE_ID = assetTypeId("qa-ratio-occluder")
const OCCLUDER_INSTANCE_ID = assetInstanceId("qa-ratio-occluder")

const occluderDefinition: SceneAssetDefinition = {
  typeId: OCCLUDER_TYPE_ID,
  create: (instanceId): StageAsset => {
    const root = new Group()
    const geometry = new BoxGeometry(2.8, 2.8, 0.2)
    const material = new MeshBasicMaterial({ colorWrite: false, depthWrite: true })
    const blocker = new Mesh(geometry, material)
    blocker.name = "qa-ratio-occluder"
    root.add(blocker)
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        geometry.dispose()
        material.dispose()
      },
      explosion: 0,
      instanceId,
      parts: [],
      root,
      screens: [],
      selectable: [blocker],
      setExplosion: () => undefined,
      typeId: OCCLUDER_TYPE_ID,
      update: () => undefined,
    }
  },
}

class DisplayRadioService implements RadioMediaService {
  #listeners = new Set<(next: RadioSnapshot) => void>()
  #snapshot = snapshot()
  unsubscribeCalls = 0

  dispatch(_command: RadioCommand): Promise<void> {
    return Promise.reject(new Error("Ratio displays are read-only"))
  }

  dispose(): void {}

  emit(next: RadioSnapshot): void {
    this.#snapshot = next
    for (const listener of this.#listeners) listener(next)
  }

  get listenerCount(): number {
    return this.#listeners.size
  }

  loadStations(): Promise<void> {
    return Promise.resolve()
  }

  read(): RadioSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (next: RadioSnapshot) => void): () => void {
    this.#listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.unsubscribeCalls += 1
      this.#listeners.delete(listener)
    }
  }
}

const appendButton = (root: HTMLElement, label: string, action: () => void): void => {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.addEventListener("click", action)
  root.append(button)
}

export const caseId = "ratio-displays"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const service = new DisplayRadioService()
  const scene = new Scene()
  const registry = new AssetRegistry()
  const apps = new ScreenAppRegistry()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  const shell = document.createElement("main")
  const stageElement = document.createElement("section")
  const tools = document.createElement("nav")
  const status = document.createElement("output")
  const style = document.createElement("style")
  const orbit = new OrbitControls(camera, renderer.domElement)
  const ratioId = assetInstanceId("radio-main")
  let backFacing = false
  let occluding = false
  let removed = false

  const definition = createRatioAssetDefinition({ readRadioSnapshot: () => service.read() })
  registry.register(definition)
  registry.register(occluderDefinition)
  apps.register(createRatioTunerDisplayApp({ radioService: service }))
  apps.register(createRatioCassetteDisplayApp({ radioService: service }))
  const stage = new AssetStage(scene, registry)
  const asset = stage.mount({
    instanceId: ratioId,
    position: [0, 0, 0],
    rotation: [0, Math.PI, 0],
    scale: 1,
    typeId: definition.typeId,
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
    registry: apps,
    scene,
    stage,
  })

  style.textContent = styles
  shell.className = "ratio-displays-qa"
  stageElement.className = "ratio-displays-stage"
  stageElement.dataset["testid"] = "ratio-displays-stage"
  tools.className = "ratio-displays-tools"
  tools.setAttribute("aria-label", "Ratio display QA tools")
  status.hidden = true
  status.dataset["testid"] = "ratio-displays-status"
  shell.innerHTML = "<h1>RATIO READ-ONLY DISPLAYS</h1><p>One shared service feeds two physical screen-runtime subscribers.</p>"
  shell.append(style, stageElement, tools, status)
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
    const screenElements = [...stageElement.querySelectorAll<HTMLElement>(".model-screen")]
    status.dataset["backFacing"] = String(backFacing)
    status.dataset["occluding"] = String(occluding)
    status.dataset["listenerCount"] = String(service.listenerCount)
    status.dataset["removed"] = String(removed)
    status.dataset["snapshot"] = JSON.stringify(service.read())
    status.dataset["unsubscribeCalls"] = String(service.unsubscribeCalls)
    status.dataset["visible"] = JSON.stringify(
      screenElements.map((screen) => screen.dataset["visible"] === "true"),
    )
    status.textContent = `listeners ${service.listenerCount} · ${service.read().status} · visible ${screenElements.map((screen) => screen.dataset["visible"]).join(",")}`
  }

  appendButton(tools, "Play fixture", () => {
    service.emit(snapshot({ liveElapsedSeconds: 13, status: "playing" }))
    updateStatus()
  })
  appendButton(tools, "Power off", () => {
    service.emit(snapshot({ powered: false, status: "idle", visualization: [0, 0, 0, 0] }))
    updateStatus()
  })
  appendButton(tools, "Inject stream error", () => {
    service.emit(
      snapshot({
        error: { code: "stream-failed", message: '<img src="x"> fixture stream failed' },
        status: "error",
      }),
    )
    updateStatus()
  })
  appendButton(tools, "Toggle back-facing", () => {
    backFacing = !backFacing
    asset.root.rotation.y = backFacing ? 0 : Math.PI
    updateStatus()
  })
  appendButton(tools, "Toggle occlusion", () => {
    if (occluding) {
      stage.remove(OCCLUDER_INSTANCE_ID)
      occluding = false
    } else {
      stage.mount({
        instanceId: OCCLUDER_INSTANCE_ID,
        position: [1.35, 1.4, -2.1],
        rotation: [0, 0, 0],
        scale: 1,
        typeId: OCCLUDER_TYPE_ID,
      })
      occluding = true
    }
    updateStatus()
  })
  appendButton(tools, "Remove displays", () => {
    if (removed) return
    stage.remove(ratioId)
    removed = true
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
