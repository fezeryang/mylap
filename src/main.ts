import { Clock } from "three"

import "./style.css"
import "./screen-apps.css"
import "./workspace-theme.css"
import "./workspace-production.css"
import "./workspace-apps.css"
import { createBrowserPolicy } from "./apps/browser-url-policy"
import { registerDefaultApps } from "./apps/register-default-apps"
import { cyberDeskAssetDefinition } from "./assets/cyber-desk-asset"
import { cyberdeckAssetDefinition } from "./assets/cyberdeck-asset"
import { phoneAssetDefinition } from "./assets/phone-asset"
import { createRatioAssetDefinition } from "./assets/ratio-asset"
import {
  compileDesktopPlacement,
  desktopSceneSpec,
  validateDesktopScene,
} from "./assets/scene-config"
import { ModelController } from "./model/model-controller"
import { AssetRegistry } from "./runtime/asset-registry"
import { AssetStage, type AssetStageEvent } from "./runtime/asset-stage"
import type { AssetInstanceId } from "./runtime/ids"
import { type KeyboardRouteDiagnostic, KeyboardRouter } from "./runtime/keyboard-router"
import type { StageSnapshot } from "./runtime/screen-app"
import { ScreenAppRegistry } from "./runtime/screen-app-registry"
import { ScreenRuntime } from "./runtime/screen-runtime"
import { createRadioMediaService } from "./services/radio-media-service"
import { handleRadioPartPick } from "./services/radio-physical-controls"
import { createWorkspaceNotesService } from "./services/workspace-notes-service"
import { queryShellDom } from "./shell/dom-contract"
import { bindShellDom, createKeyboardTargetClassifier } from "./shell/shell-dom"
import { createTodouQaController } from "./types/todou-qa-host"
import { selectRootRadioConfiguration, startInitialRadioLoad } from "./types/todou-qa-query"
import { attachPartManifest } from "./viewer/part-manifest"
import { createViewerRendering } from "./viewer/viewer-rendering"

class DomContractError extends Error {
  constructor(selector: string, expected: string) {
    super(`Expected ${selector} to resolve to ${expected}`)
    this.name = "DomContractError"
  }
}

const requireElement = <ElementType extends Element>(
  selector: string,
  elementConstructor: { new (): ElementType },
): ElementType => {
  const element = document.querySelector(selector)
  if (!(element instanceof elementConstructor)) {
    throw new DomContractError(selector, elementConstructor.name)
  }
  return element
}

const query = new URLSearchParams(window.location.search)
const radioConfiguration = selectRootRadioConfiguration(query, window.fetch.bind(window))
document.documentElement.dataset["radioDirectory"] = radioConfiguration.directoryLabel

const app = requireElement("#app", HTMLElement)
const canvas = requireElement("#scene", HTMLCanvasElement)
const resetView = requireElement("#reset-view", HTMLButtonElement)
const autoRotate = requireElement("#auto-rotate", HTMLButtonElement)
const screenPower = requireElement("#screen-power", HTMLButtonElement)
const explode = requireElement("#explode-range", HTMLInputElement)
const partTitle = requireElement("#part-title", HTMLElement)
const partMeta = requireElement("#part-meta", HTMLElement)
const statusText = requireElement("#status-text", HTMLElement)
const closeExpandedScreen = requireElement("#close-expanded-screen", HTMLButtonElement)
const shellDom = queryShellDom(document)

const mediaElement = document.createElement("audio")
mediaElement.preload = "none"
const radioService = createRadioMediaService({
  allowQaFixtures: radioConfiguration.allowQaFixtures,
  directory: radioConfiguration.directory,
  mediaElement,
})
const notesService = createWorkspaceNotesService(window.localStorage)
startInitialRadioLoad(radioService)

const navigationInput = { enabled: true }
let syncShell = (): void => undefined
const rendering = createViewerRendering({
  canvas,
  multipleAssets: true,
  navigation: {
    input: navigationInput,
    onSettled: () => syncShell(),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  },
  requestedView: query.get("view"),
})
const navigation = rendering.navigation
if (navigation === null) throw new DomContractError("desktop navigation", "controller")

const appRegistry = new ScreenAppRegistry()
registerDefaultApps(appRegistry, {
  browserPolicy: createBrowserPolicy({
    allowRelativeQa: radioConfiguration.qaEnabled,
    currentOrigin: window.location.origin,
  }),
  notesService,
  radioService,
})

const assetRegistry = new AssetRegistry()
assetRegistry.register(cyberdeckAssetDefinition)
assetRegistry.register(cyberDeskAssetDefinition)
assetRegistry.register(phoneAssetDefinition)
assetRegistry.register(createRatioAssetDefinition({ readRadioSnapshot: radioService.read }))
const stage = new AssetStage(rendering.scene, assetRegistry)
const sceneConfiguration = validateDesktopScene(desktopSceneSpec)
for (const placement of sceneConfiguration.map(compileDesktopPlacement)) {
  stage.mount(placement)
}
stage.activate({ kind: "asset-instance-id", value: "computer-main" })

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
let lastKeyboardRoute: KeyboardRouteDiagnostic | null = null
keyboardRouter.setActive(stage.active?.keyboard ?? null)
const routeKeyboardTo = (assetId: AssetInstanceId): void => {
  const asset = stage.assets.find((candidate) => candidate.instanceId.value === assetId.value)
  keyboardRouter.setActive(asset?.keyboard ?? null)
}
const clearDiagnostic = (): void => {
  lastKeyboardRoute = null
}
const shell = bindShellDom({
  activateAsset: (assetId) => stage.activate(assetId),
  clearScreenFocus: () => screens.releaseScreenFocus(),
  computerAssetId: { kind: "asset-instance-id", value: "computer-main" },
  document,
  dom: shellDom,
  navigation,
  onDiagnostic: clearDiagnostic,
  phoneAssetId: { kind: "asset-instance-id", value: "phone-main" },
  radioAssetId: { kind: "asset-instance-id", value: "radio-main" },
  routeKeyboardTo,
})
syncShell = shell.sync
shell.enter()
shell.sync()
const disconnectKeyboard = keyboardRouter.connect(window, document, {
  classifyTarget: createKeyboardTargetClassifier(shell.readState),
  onDiagnostic: (diagnostic) => {
    lastKeyboardRoute = diagnostic
  },
})

const qaController = createTodouQaController({
  clearDiagnostic,
  keyboardRouter,
  navigation,
  radioService,
  readKeyboardRoute: () => lastKeyboardRoute,
  routeKeyboardTo,
  screens,
  shell,
  stage,
})
const unsubscribeStage = stage.subscribe((event: AssetStageEvent) => {
  switch (event.kind) {
    case "active-changed":
      keyboardRouter.setActive(event.asset?.keyboard ?? null)
      return
    case "asset-added":
      return
    case "asset-removed":
      qaController.recordAssetDisposal(event.asset.instanceId.value)
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
  onAssetPick: ({ instanceId, partId }) => {
    shell.pickDevice(instanceId)
    if (instanceId.value === "radio-main") handleRadioPartPick(radioService, partId)
  },
  onSelection: (partId) => {
    selectedPart = partId
  },
  resetCamera: () => navigation.request("return-overview"),
  scene: rendering.scene,
  screens,
  stage,
})

let expandedScreen: HTMLElement | null = null
const setExpandedScreen = (screen: HTMLElement | null): void => {
  if (expandedScreen !== null) expandedScreen.dataset["expanded"] = "false"
  expandedScreen = screen
  if (expandedScreen !== null) expandedScreen.dataset["expanded"] = "true"
  closeExpandedScreen.hidden = expandedScreen === null
  document.documentElement.dataset["expandedScreen"] =
    expandedScreen?.dataset["assetInstance"] ?? ""
}
const handleWorkspaceClick = (event: MouseEvent): void => {
  if (!(event.target instanceof Element)) return
  const expand = event.target.closest<HTMLElement>("[data-expand-screen='true']")
  if (expand !== null) {
    const screen = expand.closest<HTMLElement>(".model-screen")
    if (screen !== null) setExpandedScreen(screen)
    return
  }
  const device = event.target.closest<HTMLElement>("[data-focus-device]")
  const assetId = device?.dataset["focusDevice"]
  if (assetId === "computer-main" || assetId === "phone-main" || assetId === "radio-main") {
    setExpandedScreen(null)
    shell.focusDevice({ kind: "asset-instance-id", value: assetId })
  }
}
const closeExpanded = (): void => {
  setExpandedScreen(null)
  screens.releaseScreenFocus()
}
app.addEventListener("click", handleWorkspaceClick)
closeExpandedScreen.addEventListener("click", closeExpanded)

attachPartManifest(stage.assets)
document.documentElement.dataset["modelReady"] = "true"

if (radioConfiguration.qaEnabled) window.__todouQa = qaController.api

const resize = (): void => {
  rendering.resize(window.innerWidth, window.innerHeight)
  screens.resize(window.innerWidth, window.innerHeight)
}
window.addEventListener("resize", resize)
resize()

const clock = new Clock()
let sampleFrames = 0
let sampleSeconds = 0
const renderFrame = (timestampMilliseconds: number): void => {
  if (document.documentElement.dataset["captureFrozen"] === "true") return
  const deltaSeconds = Math.min(clock.getDelta(), 0.1)
  stage.update(deltaSeconds)
  rendering.render(timestampMilliseconds)
  screens.render()
  shell.sync()
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
  const inputLabel = pressed.length === 0 ? "INPUT READY" : `KEY ${pressed}`
  statusText.textContent = `${activeName} · ${stage.assets.length} ASSETS · ${inputLabel}`
  document.documentElement.dataset["activeAsset"] = active?.instanceId.value ?? ""
  document.documentElement.dataset["pressedKeys"] = pressed
  document.documentElement.dataset["controlsEnabled"] = String(rendering.controls.enabled)
}
rendering.renderer.setAnimationLoop(renderFrame)

let disposed = false
const dispose = (): void => {
  if (disposed) return
  disposed = true
  rendering.renderer.setAnimationLoop(null)
  window.removeEventListener("resize", resize)
  controller.dispose()
  app.removeEventListener("click", handleWorkspaceClick)
  closeExpandedScreen.removeEventListener("click", closeExpanded)
  shell.dispose()
  screens.dispose()
  unsubscribeStage()
  disconnectKeyboard()
  stage.dispose()
  radioService.dispose()
  rendering.dispose()
  Reflect.deleteProperty(window, "__todouQa")
  document.documentElement.dataset["hostDisposed"] = "true"
}
window.addEventListener("pagehide", dispose, { once: true })
