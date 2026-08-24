import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js"
import type { PhoneModel } from "../model/modelTypes"
import { type PartId, resolvePartId } from "../model/parts"
import { PHONE_COLORS } from "../theme"

export const VIEW_IDS = ["reference", "front", "right", "rear", "left"] as const
export type ViewId = (typeof VIEW_IDS)[number]

type ViewerConfig = {
  readonly canvas: HTMLCanvasElement
  readonly cssLayer: HTMLElement
  readonly screenElement: HTMLElement
  readonly model: PhoneModel
  readonly onPartSelected: (partId: PartId | null) => void
}

type RenderSurface = {
  readonly config: ViewerConfig
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  readonly cssRenderer: CSS3DRenderer
  readonly composer: EffectComposer
  readonly scene: Scene
}

export type PhoneViewer = {
  readonly setView: (viewId: ViewId) => void
  readonly setAutoRotate: (enabled: boolean) => void
  readonly renderOnce: () => void
  readonly renderDiagnostic: () => void
}

const VIEW_POSITIONS: Readonly<Record<ViewId, readonly [number, number, number]>> = {
  reference: [-6.5, -3.55, 21.9],
  front: [0, 0, 27],
  right: [25, 0, 10],
  rear: [5, 0, -27],
  left: [-25, 0, 10],
}

export function createViewer(config: ViewerConfig): PhoneViewer {
  const scene = new Scene()
  scene.add(config.model.root)

  const camera = new PerspectiveCamera(38, 1, 0.1, 100)
  const renderer = createWebGlRenderer(config.canvas)
  const cssRenderer = new CSS3DRenderer()
  cssRenderer.domElement.className = "css3d-layer"
  config.cssLayer.append(cssRenderer.domElement)

  const pmrem = new PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  addLighting(scene)

  const controls = new OrbitControls(camera, config.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.minDistance = 16
  controls.maxDistance = 34
  controls.target.set(0, 0, 0)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.28, 0.38, 0.9))

  let interactive = false
  let autoRotate = false
  let currentView: ViewId = "reference"
  const screenPosition = new Vector3()
  const screenNormal = new Vector3()
  const screenToCamera = new Vector3()
  const screenRotation = new Quaternion()
  controls.addEventListener("start", () => {
    interactive = true
    window.__interactive = true
  })

  const setView = (viewId: ViewId): void => {
    currentView = viewId
    interactive = false
    window.__interactive = false
    controls.enabled = false
    const position = VIEW_POSITIONS[viewId]
    const portraitScale = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.05 : 1
    const compactLandscapeScale = camera.aspect >= 0.9 && window.innerWidth < 1100 ? 1.12 : 1
    camera.position.set(
      position[0] * portraitScale * compactLandscapeScale,
      position[1] * portraitScale * compactLandscapeScale,
      position[2] * portraitScale * compactLandscapeScale,
    )
    camera.up.set(0, 1, 0)
    config.model.root.rotation.set(0, 0, viewId === "reference" ? 0.14 : 0)
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.update()
    controls.enabled = true
  }

  const surface = { config, camera, renderer, cssRenderer, composer, scene }
  bindPicking(surface)
  const resize = (): void => {
    resizeRenderers(surface)
    setView(currentView)
  }
  window.addEventListener("resize", resize)
  resize()

  const renderOnce = (): void => {
    composer.render()
    config.model.screenAnchor.getWorldPosition(screenPosition)
    config.model.screenAnchor.getWorldQuaternion(screenRotation)
    screenNormal.set(0, 0, 1).applyQuaternion(screenRotation)
    config.screenElement.style.visibility =
      screenToCamera.copy(camera.position).sub(screenPosition).dot(screenNormal) > 0.05
        ? "visible"
        : "hidden"
    cssRenderer.render(scene, camera)
  }
  const animate = (): void => {
    requestAnimationFrame(animate)
    if (interactive) controls.update()
    if (autoRotate) config.model.root.rotation.y += 0.004
    renderOnce()
    window.__ready = true
  }
  animate()

  return {
    setView,
    setAutoRotate: (enabled) => {
      autoRotate = enabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    },
    renderOnce,
    renderDiagnostic: () => renderer.render(scene, camera),
  }
}

function createWebGlRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  return renderer
}

function addLighting(scene: Scene): void {
  scene.add(new AmbientLight(0x253b78, 0.86))
  const key = new DirectionalLight(0xd9e4ff, 1.85)
  key.position.set(-8, 10, 9)
  key.castShadow = true
  scene.add(key)
  const cyan = new DirectionalLight(PHONE_COLORS.cyan, 0.92)
  cyan.position.set(8, -4, 7)
  scene.add(cyan)
  const magenta = new DirectionalLight(PHONE_COLORS.magenta, 0.82)
  magenta.position.set(-8, 5, -5)
  scene.add(magenta)
}

function bindPicking(surface: RenderSurface): void {
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  surface.renderer.domElement.addEventListener("pointerup", (event) => {
    const bounds = surface.renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, surface.camera)
    const first = raycaster.intersectObjects(surface.scene.children, true)[0]
    const partId = first === undefined ? null : resolvePartId(first.object)
    surface.config.model.selectPart(partId)
    surface.config.onPartSelected(partId)
  })
}

function resizeRenderers(surface: RenderSurface): void {
  const width = surface.config.cssLayer.clientWidth
  const height = surface.config.cssLayer.clientHeight
  surface.camera.aspect = width / height
  surface.camera.updateProjectionMatrix()
  surface.renderer.setSize(width, height, false)
  surface.cssRenderer.setSize(width, height)
  surface.composer.setSize(width, height)
}
