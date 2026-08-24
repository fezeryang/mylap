import { Clock } from "three"

import "./style.css"
import "./screen-apps.css"
import { registerDefaultApps } from "./apps/register-default-apps"
import { cyberdeckAssetDefinition } from "./assets/cyberdeck-asset"
import { sceneConfiguration } from "./assets/scene-config"
import { ModelController } from "./model/model-controller"
import { AssetRegistry } from "./runtime/asset-registry"
import { AssetStage, type AssetStageEvent } from "./runtime/asset-stage"
import { KeyboardRouter } from "./runtime/keyboard-router"
import type { StageSnapshot } from "./runtime/screen-app"
import { ScreenAppRegistry } from "./runtime/screen-app-registry"
import { ScreenRuntime } from "./runtime/screen-runtime"
import { attachPartManifest } from "./viewer/part-manifest"
import { createViewerRendering } from "./viewer/viewer-rendering"

class DomContractError extends Error {
  constructor(selector: string, expected: string) {
    super(`Expected ${selector} to resolve to ${expected}`)
    this.name = "DomContractError"
  }
}

const app = document.querySelector("#app")
const canvas = document.querySelector("#scene")
const resetView = document.querySelector("#reset-view")
const autoRotate = document.querySelector("#auto-rotate")
const screenPower = document.querySelector("#screen-power")
const explode = document.querySelector("#explode-range")
const partTitle = document.querySelector("#part-title")
const partMeta = document.querySelector("#part-meta")
const statusText = document.querySelector("#status-text")
if (!(app instanceof HTMLElement)) throw new DomContractError("#app", "element")
if (!(canvas instanceof HTMLCanvasElement)) throw new DomContractError("#scene", "canvas")
if (!(resetView instanceof HTMLButtonElement)) throw new DomContractError("#reset-view", "button")
if (!(autoRotate instanceof HTMLButtonElement)) throw new DomContractError("#auto-rotate", "button")
if (!(screenPower instanceof HTMLButtonElement)) {
  throw new DomContractError("#screen-power", "button")
}
if (!(explode instanceof HTMLInputElement)) throw new DomContractError("#explode-range", "input")
if (!(partTitle instanceof HTMLElement)) throw new DomContractError("#part-title", "element")
if (!(partMeta instanceof HTMLElement)) throw new DomContractError("#part-meta", "element")
if (!(statusText instanceof HTMLElement)) throw new DomContractError("#status-text", "element")

const query = new URLSearchParams(window.location.search)
const multipleAssets = query.get("assets") === "2"
const rendering = createViewerRendering({
  canvas,
  multipleAssets,
  requestedView: query.get("view"),
})

const assetRegistry = new AssetRegistry()
assetRegistry.register(cyberdeckAssetDefinition)
const stage = new AssetStage(rendering.scene, assetRegistry)
sceneConfiguration(multipleAssets).forEach((placement) => {
  stage.mount(placement)
})

const appRegistry = new ScreenAppRegistry()
registerDefaultApps(appRegistry)
let selectedPart = "cyberdeck-root"
let measuredFps = 60
const readSnapshot = (): StageSnapshot => ({
  activeAsset: stage.active?.instanceId.value ?? "none",
  drawCalls: rendering.renderer.info.render.calls,
  fps: measuredFps,
  selectedPart,
  triangles: rendering.renderer.info.render.triangles,
})
const screens = new ScreenRuntime({
  camera: rendering.camera,
  container: app,
  controls: rendering.controls,
  readSnapshot,
  registry: appRegistry,
  scene: rendering.scene,
  stage,
})

const keyboardRouter = new KeyboardRouter()
keyboardRouter.setActive(stage.active?.keyboard ?? null)
const disconnectKeyboard = keyboardRouter.connect(window, document)
const unsubscribeKeyboard = stage.subscribe((event: AssetStageEvent) => {
  switch (event.kind) {
    case "active-changed":
      keyboardRouter.setActive(event.asset?.keyboard ?? null)
      return
    case "asset-added":
    case "asset-removed":
      return
  }
})

const controller = new ModelController({
  camera: rendering.camera,
  controls: rendering.controls,
  elements: {
    autoRotate,
    canvas,
    explode,
    partMeta,
    partTitle,
    resetView,
    screenPower,
  },
  onSelection: (partId) => {
    selectedPart = partId
  },
  resetCamera: rendering.resetCamera,
  scene: rendering.scene,
  screens,
  stage,
})

attachPartManifest(stage.assets)
document.documentElement.dataset["modelReady"] = "true"

const resize = (): void => {
  rendering.resize(window.innerWidth, window.innerHeight)
  screens.resize(window.innerWidth, window.innerHeight)
}
window.addEventListener("resize", resize)
resize()

const clock = new Clock()
let sampleFrames = 0
let sampleSeconds = 0
const renderFrame = (): void => {
  if (document.documentElement.dataset["captureFrozen"] === "true") return
  const deltaSeconds = Math.min(clock.getDelta(), 0.1)
  stage.update(deltaSeconds)
  rendering.render()
  screens.render()
  sampleFrames += 1
  sampleSeconds += deltaSeconds
  if (sampleSeconds >= 0.5) {
    measuredFps = Math.round(sampleFrames / sampleSeconds)
    sampleFrames = 0
    sampleSeconds = 0
  }
  const active = stage.active
  const pressed = active?.keyboard?.pressedCodes.join("+") ?? ""
  const activeName = active?.instanceId.value.toUpperCase() ?? "NO ASSET"
  const assetLabel = stage.assets.length === 1 ? "ASSET" : "ASSETS"
  const inputLabel = pressed.length === 0 ? "INPUT READY" : `KEY ${pressed}`
  statusText.textContent = `${activeName} · ${stage.assets.length} ${assetLabel} · ${inputLabel}`
  document.documentElement.dataset["activeAsset"] = active?.instanceId.value ?? ""
  document.documentElement.dataset["pressedKeys"] = pressed
}
rendering.renderer.setAnimationLoop(renderFrame)

let disposed = false
const dispose = (): void => {
  if (disposed) return
  disposed = true
  rendering.renderer.setAnimationLoop(null)
  window.removeEventListener("resize", resize)
  controller.dispose()
  screens.dispose()
  unsubscribeKeyboard()
  disconnectKeyboard()
  stage.dispose()
  rendering.dispose()
}
window.addEventListener("pagehide", dispose, { once: true })
