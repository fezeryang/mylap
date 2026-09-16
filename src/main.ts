import "./style.css"
import "./screen-apps.css"
import "./workspace-tokens.css"
import "./workspace-production.css"
import "./workspace-apps.css"
import "./device-os.css"
import "./phone-os.css"
import "./productivity-apps.css"
import "./music-app.css"
import "./library-apps.css"
import "./companion-os.css"
import "./system-controls.css"
import "./workspace-browser-files.css"
import "./spotlight-search.css"
import { DEVICE_APPS } from "./apps/device-applications"
import "./design-tokens.css"
import "./animations.css"
import { createBrowserPolicy } from "./apps/browser-url-policy"
import { registerDefaultApps } from "./apps/register-default-apps"
import { createBulletinBoardAssetDefinition } from "./assets/bulletin-board-asset"
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
import { createRenderScheduler } from "./runtime/render-scheduler"
import type { StageSnapshot } from "./runtime/screen-app"
import { ScreenAppRegistry } from "./runtime/screen-app-registry"
import { ScreenRuntime } from "./runtime/screen-runtime"
import { createRadioMediaService } from "./services/radio-media-service"
import { handleRadioPartPick } from "./services/radio-physical-controls"
import {
  createWorkspaceBrowserService,
  PERSONAL_SITE_URL,
} from "./services/workspace-browser-service"
import { createWorkspaceClockService } from "./services/workspace-clock-service"
import { createWorkspaceDataService } from "./services/workspace-data-service"
import { createWorkspaceFilesService } from "./services/workspace-files-service"
import { createWorkspaceLibraryService } from "./services/workspace-library-service"
import { createWorkspaceMusicService } from "./services/workspace-music-service"
import { queryShellDom } from "./shell/dom-contract"
import { bindShellDom, createKeyboardTargetClassifier } from "./shell/shell-dom"
import { createSpotlightSearch } from "./spotlight-search"
import { createSpotlightSearchRegistry } from "./spotlight-search-registry"
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
const dataService = createWorkspaceDataService()
const musicService = createWorkspaceMusicService(radioService)
const libraryService = createWorkspaceLibraryService()
const clockService = createWorkspaceClockService()
// Local-only dual-site preview; production always uses the real personal domain.
const localSite = query.get("personal-site") ?? ""
const personalSiteUrl =
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+\/$/.test(localSite)
    ? localSite
    : PERSONAL_SITE_URL
const browserService = createWorkspaceBrowserService(localStorage, personalSiteUrl)
const filesService = createWorkspaceFilesService()
startInitialRadioLoad(radioService)

const navigationInput = { enabled: true }
let syncShell = (): void => undefined
let invalidateScene = (): void => undefined
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
    personalSiteUrl,
    ...(personalSiteUrl !== PERSONAL_SITE_URL ? { allowRelativeQa: true } : {}),
  }),
  dataService,
  musicService,
  libraryService,
  clockService,
  browserService,
  filesService,
  radioService,
})

const assetRegistry = new AssetRegistry()
assetRegistry.register(cyberdeckAssetDefinition)
assetRegistry.register(cyberDeskAssetDefinition)
assetRegistry.register(phoneAssetDefinition)
assetRegistry.register(createRatioAssetDefinition({ readRadioSnapshot: radioService.read }))
assetRegistry.register(createBulletinBoardAssetDefinition())
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
  invalidate: () => invalidateScene(),
  canInteract: (id) =>
    navigation.read().state ===
    (id.value === "phone-main"
      ? "phone-focus"
      : id.value === "radio-main"
        ? "radio-focus"
        : "computer-focus"),
  requestDeviceFocus: (id) => {
    shell.focusDevice(id)
  },
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
  invalidateScene()
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

// Setup Spotlight Search
const spotlightRegistry = createSpotlightSearchRegistry()
spotlightRegistry.registerApp("workspace", "电脑桌面", "💼", () => {
  shell.focusDevice({ kind: "asset-instance-id", value: "computer-main" })
})
spotlightRegistry.registerApp("phone", "手机", "📱", () => {
  shell.focusDevice({ kind: "asset-instance-id", value: "phone-main" })
})
spotlightRegistry.registerApp("radio", "收音机", "📻", () => {
  shell.focusDevice({ kind: "asset-instance-id", value: "radio-main" })
})
spotlightRegistry.registerTool("reset-view", "重置视角", "🔄", () => {
  navigation.request("return-overview")
})
spotlightRegistry.registerTool("auto-rotate", "切换自动旋转", "🔁", () => {
  autoRotate.click()
})
spotlightRegistry.registerTool("screen-power", "切换屏幕电源", "⚡", () => {
  screenPower.click()
})
spotlightRegistry.registerSetting("explode-view", "爆炸视图", "💥", () => {
  explode.focus()
})

for (const application of DEVICE_APPS) {
  spotlightRegistry.registerApp(`software-${application.id}`, application.title, "▧", () => {
    setExpandedScreen(null)
    shell.focusDevice({ kind: "asset-instance-id", value: "computer-main" })
    app
      .querySelector<HTMLButtonElement>(`.desktop-os-dock [data-app-id="${application.id}"]`)
      ?.click()
  })
}

const spotlight = createSpotlightSearch({
  container: app,
  items: spotlightRegistry.getAll(),
  maxResults: 8,
})

const handleGlobalKeydown = (event: KeyboardEvent): void => {
  // Cmd+K or Ctrl+K to open spotlight
  if ((event.metaKey || event.ctrlKey) && event.key === "k") {
    event.preventDefault()
    const state = spotlight.read()
    if (state.visible) {
      spotlight.hide()
    } else {
      spotlight.show()
    }
    return
  }
}
document.addEventListener("keydown", handleGlobalKeydown)

const disconnectKeyboard = keyboardRouter.connect(window, document, {
  classifyTarget: createKeyboardTargetClassifier(shell.readState),
  onDiagnostic: (diagnostic) => {
    lastKeyboardRoute = diagnostic
    if (diagnostic?.screenId === null) invalidateScene()
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
  invalidateScene()
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
  onAssetPick: ({ instanceId, partId, controlId }) => {
    shell.pickDevice(instanceId)
    if (instanceId.value !== "radio-main") return
    if (partId === "transport-controls" && controlId === "rec") {
      setExpandedScreen(null)
      shell.focusDevice({ kind: "asset-instance-id", value: "computer-main" })
      document
        .querySelector<HTMLButtonElement>('.desktop-os-dock [data-app-id="recorder"]')
        ?.click()
      return
    }
    handleRadioPartPick(radioService, partId, controlId)
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
  scheduler.setPaused(expandedScreen !== null || document.hidden)
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
  invalidateScene()
}
window.addEventListener("resize", resize)
resize()

let sampleFrames = 0
let sampleSeconds = 0
let drawnFrames = 0
const renderFrame = (timestampMilliseconds: number, deltaSeconds: number): boolean => {
  if (document.documentElement.dataset["captureFrozen"] === "true") return false
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
  const status = `${activeName} · ${stage.assets.length} ASSETS · ${inputLabel}`
  if (statusText.textContent !== status) statusText.textContent = status
  const values = {
    activeAsset: active?.instanceId.value ?? "",
    pressedKeys: pressed,
    controlsEnabled: String(rendering.controls.enabled),
  }
  for (const [key, value] of Object.entries(values)) {
    if (document.documentElement.dataset[key] !== value)
      document.documentElement.dataset[key] = value
  }
  if (radioConfiguration.qaEnabled) {
    document.documentElement.dataset["renderedFrames"] = String(++drawnFrames)
    document.documentElement.dataset["occlusionChecks"] = String(screens.occlusionChecks)
  }
  return (
    navigation.read().interactionLocked ||
    (rendering.controls.enabled && rendering.controls.autoRotate) ||
    stage.assets.some((asset) => asset.needsAnimation)
  )
}
const scheduler = createRenderScheduler(renderFrame)
invalidateScene = scheduler.invalidate
rendering.controls.addEventListener("change", invalidateScene)
// Native UI, keyboard release and model controls request one frame, not a permanent loop.
const sceneInputEvents = [
  "click",
  "input",
  "keydown",
  "keyup",
  "pointerup",
  "pointercancel",
] as const
const sceneInput = (event: Event): void => {
  if (event.target instanceof Element && event.target.closest(".model-screen")) return
  invalidateScene()
}
for (const event of sceneInputEvents) document.addEventListener(event, sceneInput, true)
const resumeScene = (): void => {
  scheduler.setPaused(document.hidden || expandedScreen !== null)
  invalidateScene()
}
document.addEventListener("visibilitychange", resumeScene)
window.addEventListener("blur", invalidateScene)
const unsubscribeRadioRender = radioService.subscribe(() => invalidateScene())
invalidateScene()

let disposed = false
const dispose = (): void => {
  if (disposed) return
  disposed = true
  scheduler.dispose()
  unsubscribeRadioRender()
  rendering.controls.removeEventListener("change", invalidateScene)
  for (const event of sceneInputEvents) document.removeEventListener(event, sceneInput, true)
  document.removeEventListener("visibilitychange", resumeScene)
  window.removeEventListener("blur", invalidateScene)
  spotlight.dispose()
  document.removeEventListener("keydown", handleGlobalKeydown)
  window.removeEventListener("resize", resize)
  controller.dispose()
  app.removeEventListener("click", handleWorkspaceClick)
  closeExpandedScreen.removeEventListener("click", closeExpanded)
  shell.dispose()
  screens.dispose()
  unsubscribeStage()
  disconnectKeyboard()
  stage.dispose()
  musicService.dispose()
  libraryService.dispose()
  clockService.dispose()
  browserService.dispose()
  filesService.dispose()
  dataService.dispose()
  radioService.dispose()
  rendering.dispose()
  Reflect.deleteProperty(window, "__todouQa")
  document.documentElement.dataset["hostDisposed"] = "true"
}
window.addEventListener("pagehide", dispose, { once: true })
