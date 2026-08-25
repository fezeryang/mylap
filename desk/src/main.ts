import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { type CyberDeskModel, createCyberDeskModel } from "./createCyberDesk.js"
import "./style.css"

type ViewName = "reference" | "front" | "right" | "rear" | "left" | "top"

interface DeskPreviewApi {
  readonly camera: THREE.PerspectiveCamera
  readonly model: CyberDeskModel
  readonly renderer: THREE.WebGLRenderer
  readonly setView: (view: ViewName) => void
  readonly setExplosion: (amount: number) => void
  readonly setLightsEnabled: (enabled: boolean) => void
}

declare global {
  interface Window {
    __deskPreview: DeskPreviewApi
  }
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`Missing required desk preview element: ${selector}`)
  return element
}

const canvas = requiredElement<HTMLCanvasElement>("#scene")
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x030611)
scene.fog = new THREE.FogExp2(0x030611, 0.018)

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.VSMShadowMap

const environment = new RoomEnvironment()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(environment, 0.035).texture
environment.dispose()
pmrem.dispose()

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.065
controls.minDistance = 8
controls.maxDistance = 70
controls.maxPolarAngle = Math.PI * 0.49
controls.target.set(0, -0.42, 0)

const model = createCyberDeskModel()
scene.add(model)

const hemisphere = new THREE.HemisphereLight(0x8fa8ff, 0x050711, 1.05)
scene.add(hemisphere)
const key = new THREE.DirectionalLight(0xdce8ff, 3.2)
key.position.set(-7, 12, 9)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.left = -11
key.shadow.camera.right = 11
key.shadow.camera.top = 10
key.shadow.camera.bottom = -8
key.shadow.camera.near = 1
key.shadow.camera.far = 35
key.shadow.radius = 5
key.shadow.blurSamples = 12
scene.add(key)
const rim = new THREE.DirectionalLight(0x25dfff, 2)
rim.position.set(9, 5, -10)
scene.add(rim)
const magentaFill = new THREE.PointLight(0xff28e6, 24, 18, 2)
magentaFill.position.set(-7, 1, -4)
scene.add(magentaFill)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(16, 96),
  new THREE.ShadowMaterial({ color: 0x00020a, opacity: 0.32 }),
)
ground.name = "ground-contact-shadow"
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.72
ground.receiveShadow = true
scene.add(ground)

const grid = new THREE.GridHelper(32, 32, 0x14335c, 0x0b1831)
grid.position.y = -1.7
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
for (const material of gridMaterials) {
  material.transparent = true
  material.opacity = 0.25
}
scene.add(grid)

const views: Readonly<Record<ViewName, readonly [number, number, number]>> = {
  reference: [11.7, 7.6, 12.4],
  front: [0, 4.6, 17.5],
  right: [17.5, 4.6, 0],
  rear: [0, 4.6, -17.5],
  left: [-17.5, 4.6, 0],
  top: [0.01, 21, 0.01],
}
const modeName = requiredElement<HTMLElement>("#mode-name")
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")]
let activeView: ViewName = "reference"
let explosionAmount = 0

function responsiveCameraScale(): number {
  const referenceAspect = 1672 / 941
  return Math.max(1, (referenceAspect / camera.aspect) * 1.1)
}

function applyCameraPosition(): void {
  const base = views[activeView]
  const scale = responsiveCameraScale() * (1 + explosionAmount * 0.45)
  camera.position.set(base[0] * scale, base[1] * scale, base[2] * scale)
  camera.up.set(0, activeView === "top" ? 0 : 1, activeView === "top" ? -1 : 0)
  controls.target.set(0, -0.42, 0)
  controls.update()
}

function isViewName(value: string | null): value is ViewName {
  return value !== null && value in views
}

function setView(view: ViewName): void {
  activeView = view
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  applyCameraPosition()
  modeName.textContent = `${view.toUpperCase()} VIEW`
  for (const button of viewButtons)
    button.setAttribute("aria-pressed", String(button.dataset.view === view))
}

for (const button of viewButtons) {
  button.addEventListener("click", () => {
    const view = button.dataset.view ?? null
    if (isViewName(view)) setView(view)
  })
}

const params = new URLSearchParams(window.location.search)
const requestedView = params.get("view")
setView(isViewName(requestedView) ? requestedView : "reference")

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
const qaMode = params.get("qa") === "1"
if (qaMode) {
  controls.enabled = false
  controls.enableDamping = false
}
if (params.get("clean") === "1") document.documentElement.dataset.cleanCapture = "true"

const explodeInput = requiredElement<HTMLInputElement>("#explode")
const explodeValue = requiredElement<HTMLOutputElement>("#explode-value")
const setExplosion = (amount: number) => {
  const clamped = THREE.MathUtils.clamp(amount, 0, 1)
  explosionAmount = clamped
  model.userData.sculptRuntime.setExplosion(clamped)
  applyCameraPosition()
  explodeValue.value = `${Math.round(clamped * 100)}%`
}
explodeInput.addEventListener("input", () => setExplosion(Number(explodeInput.value) / 100))

const lightsButton = requiredElement<HTMLButtonElement>("#lights")
let lightsEnabled = true
const setLightsEnabled = (enabled: boolean) => {
  lightsEnabled = enabled
  model.userData.sculptRuntime.setLightsEnabled(enabled)
  lightsButton.setAttribute("aria-pressed", String(enabled))
  lightsButton.textContent = enabled ? "灯光开启" : "灯光关闭"
}
lightsButton.addEventListener("click", () => setLightsEnabled(!lightsEnabled))

const rotateButton = requiredElement<HTMLButtonElement>("#rotate")
let autoRotate = false
rotateButton.addEventListener("click", () => {
  autoRotate = !autoRotate && !reducedMotion
  rotateButton.setAttribute("aria-pressed", String(autoRotate))
  rotateButton.textContent = autoRotate ? "停止旋转" : "自动旋转"
})

const resetButton = requiredElement<HTMLButtonElement>("#reset")
resetButton.addEventListener("click", () => {
  autoRotate = false
  rotateButton.setAttribute("aria-pressed", "false")
  rotateButton.textContent = "自动旋转"
  explodeInput.value = "0"
  setExplosion(0)
  setLightsEnabled(true)
  model.rotation.y = 0
  setView("reference")
})

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const selectionBox = new THREE.BoxHelper(model, 0x00e5ff)
selectionBox.visible = false
scene.add(selectionBox)
const partName = requiredElement<HTMLElement>("#part-name")
const status = requiredElement<HTMLElement>("#status")

canvas.addEventListener("pointerup", (event) => {
  const bounds = canvas.getBoundingClientRect()
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(
    [...model.userData.sculptRuntime.meshes.values()],
    false,
  )[0]
  const part = hit === undefined ? null : model.userData.sculptRuntime.resolvePart(hit.object)
  if (part === null) {
    selectionBox.visible = false
    partName.textContent = "CYBER DESK"
    status.textContent = "未选择部件。桌面保持 5 个稳定资产挂载点。"
    return
  }
  selectionBox.setFromObject(part)
  selectionBox.visible = true
  partName.textContent = part.name.replaceAll("-", " ").toUpperCase()
  status.textContent = `已选择 ${part.name}，该部件可独立定位与展开。`
})

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  applyCameraPosition()
})

window.__deskPreview = { camera, model, renderer, setView, setExplosion, setLightsEnabled }
document.documentElement.dataset.modelReady = "true"
document.documentElement.dataset.partCount = String(
  model.userData.sculptRuntime.partManifest.length,
)
status.textContent = `资产已隔离：${model.userData.sculptRuntime.partManifest.length} 个可选/可展开部件，5\u00a0个桌面挂载点。`

const clock = new THREE.Clock()
function render(): void {
  requestAnimationFrame(render)
  const delta = Math.min(clock.getDelta(), 0.05)
  if (autoRotate && !qaMode) model.rotation.y += delta * 0.24
  if (!qaMode) controls.update()
  if (selectionBox.visible) selectionBox.update()
  renderer.render(scene, camera)
  document.documentElement.dataset.renderReady = "true"
}
render()
