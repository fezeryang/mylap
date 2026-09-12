import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js"
import type { RadioModel } from "../model/modelTypes"
import { resolvePartId } from "../model/parts"
import type { PlaybackState } from "../ui/mediaState"

export type CameraView = "reference" | "front" | "right" | "rear" | "left"

export type Viewer = {
  readonly setView: (view: CameraView) => void
  readonly setExplosion: (value: number) => void
  readonly reset: () => void
  readonly dispose: () => void
}

type ViewerOptions = {
  readonly host: HTMLElement
  readonly tunerScreen: HTMLElement
  readonly cassetteScreen: HTMLElement
  readonly model: RadioModel
  readonly reducedMotion: boolean
  readonly reviewMode: boolean
  readonly onPartSelected: (partId: string | null) => void
  readonly animationState: () => {
    readonly playback: PlaybackState
    readonly currentTimeSeconds: number
    readonly spectrum: readonly number[]
  }
}

const VIEW_POSITIONS: Readonly<Record<CameraView, readonly [number, number, number]>> = {
  reference: [7, 6.2, 21],
  front: [0, 0.8, 22],
  right: [19, 2.8, 2],
  rear: [0, 2.6, -20],
  left: [-19, 2.8, 2],
}

export function createViewer(options: ViewerOptions): Viewer {
  const scene = new Scene()
  scene.background = options.reviewMode ? null : new Color(0x030515)
  const camera = new PerspectiveCamera(34, 1, 0.1, 100)
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.shadowMap.enabled = true
  renderer.domElement.className = "webgl-layer"
  const cssRenderer = new CSS3DRenderer()
  cssRenderer.domElement.className = "screen-layer"
  options.host.append(renderer.domElement, cssRenderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = !options.reducedMotion
  controls.enablePan = false
  controls.minDistance = 12
  controls.maxDistance = 34
  controls.target.set(0, 0.7, 0)

  scene.add(options.model.root)
  scene.add(new AmbientLight(0x7c8cff, 1.55))
  const key = new DirectionalLight(0xffeaff, 4.2)
  key.position.set(-7, 11, 13)
  key.castShadow = true
  scene.add(key)
  const rim = new DirectionalLight(0x3959ff, 3.2)
  rim.position.set(8, 7, -10)
  scene.add(rim)
  const magenta = new DirectionalLight(0xff33db, 1.8)
  magenta.position.set(-10, 1, 6)
  scene.add(magenta)

  if (!options.reviewMode) {
    const floor = new Mesh(
      new PlaneGeometry(60, 60),
      new MeshPhysicalMaterial({ color: 0x080a20, roughness: 0.72, metalness: 0.18 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -3.76
    floor.receiveShadow = true
    scene.add(floor)
    const grid = new GridHelper(36, 36, 0x423ecb, 0x151838)
    grid.position.y = -3.72
    scene.add(grid)
  }

  const tunerObject = attachScreen(options.tunerScreen, 0.0096, options.model.screens.tuner)
  const cassetteObject = attachScreen(
    options.cassetteScreen,
    0.00775,
    options.model.screens.cassette,
  )
  tunerObject.position.set(0, 0, 0.01)
  cassetteObject.position.set(0, 0, 0.01)

  const raycaster = new Raycaster()
  const pointer = new Vector2()
  const onPointerDown = (event: PointerEvent): void => {
    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects([...options.model.selectables], true)[0]
    const partId = hit === undefined ? null : resolvePartId(hit.object)
    options.model.selectPart(partId)
    options.onPartSelected(partId)
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown)

  const resize = (): void => {
    const width = options.host.clientWidth
    const height = options.host.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    cssRenderer.setSize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(options.host)
  resize()
  const clock = new Clock()
  const cameraFacing = new Vector3()
  let frame = 0
  const render = (): void => {
    frame = requestAnimationFrame(render)
    const delta = Math.min(clock.getDelta(), 0.05)
    controls.update()
    const screensFaceCamera =
      cameraFacing.copy(camera.position).sub(controls.target).normalize().z > 0.25
    tunerObject.visible = screensFaceCamera
    cassetteObject.visible = screensFaceCamera
    options.model.update(delta, options.animationState())
    renderer.render(scene, camera)
    cssRenderer.render(scene, camera)
  }
  const setView = (view: CameraView): void => {
    camera.position.fromArray(VIEW_POSITIONS[view])
    if (options.reviewMode && view === "reference") camera.position.multiplyScalar(0.92)
    controls.target.set(0, view === "rear" ? 0.5 : 0.7, 0)
    controls.update()
  }
  setView("reference")
  render()

  return {
    setView,
    setExplosion: (value) => options.model.setExplosion(value),
    reset() {
      options.model.setExplosion(0)
      options.model.selectPart(null)
      setView("reference")
    },
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      cssRenderer.domElement.remove()
    },
  }
}

function attachScreen(
  element: HTMLElement,
  scale: number,
  anchor: import("three").Group,
): CSS3DObject {
  const object = new CSS3DObject(element)
  object.scale.setScalar(scale)
  anchor.add(object)
  return object
}
