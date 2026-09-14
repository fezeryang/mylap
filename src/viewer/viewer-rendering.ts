import {
  ACESFilmicToneMapping,
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  VSMShadowMap,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { DESKTOP_FLOOR_Y } from "../assets/scene-config-validator"
import type { DesktopNavigationController } from "../shell/desktop-navigation"
import {
  createDesktopNavigationBinding,
  type DesktopNavigationBindingOptions,
} from "../shell/desktop-navigation-binding"

export type ViewerRenderingOptions = {
  readonly canvas: HTMLCanvasElement
  readonly multipleAssets: boolean
  readonly navigation?: Pick<
    DesktopNavigationBindingOptions,
    "input" | "onInteractionLockChange" | "onSettled" | "reducedMotion"
  >
  readonly requestedView: string | null
}

export type ViewerRendering = {
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls
  readonly navigation: DesktopNavigationController | null
  readonly renderer: WebGLRenderer
  readonly scene: Scene
  dispose(): void
  render(timestampMilliseconds?: number): void
  resetCamera(): void
  resize(width: number, height: number): void
}

const cameraViews: Readonly<Record<string, readonly [number, number, number]>> = {
  front: [0, 8.8, -26.5],
  keyboard: [0, 8, -16],
  left: [-26.5, 8.2, 0],
  rear: [0, 8.8, 26.5],
  reference: [-8.5, 17.5, -18.3],
  right: [26.5, 8.2, 0],
}

export const createViewerRendering = (options: ViewerRenderingOptions): ViewerRendering => {
  const baseVerticalFieldOfView = 31.5
  const navigationFrameAspect = 1.4
  const scene = new Scene()
  scene.background = new Color(0xf5ede3)
  scene.fog = null
  const camera = new PerspectiveCamera(
    baseVerticalFieldOfView,
    window.innerWidth / window.innerHeight,
    0.1,
    120,
  )
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas: options.canvas,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.7
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = VSMShadowMap

  const environmentGenerator = new PMREMGenerator(renderer)
  scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 1.05
  environmentGenerator.dispose()

  const controls = new OrbitControls(camera, options.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 11
  controls.maxDistance = 72
  controls.maxPolarAngle = Math.PI * 0.48
  controls.target.set(0, 2.4, 0)
  controls.autoRotateSpeed = 0.55

  const resetCamera = (): void => {
    const requested =
      options.requestedView === null ? undefined : cameraViews[options.requestedView]
    camera.position.set(...(requested ?? cameraViews["reference"] ?? [-8.5, 17.5, -18.3]))
    if (options.multipleAssets) camera.position.multiplyScalar(1.34)
    const aspect = window.innerWidth / window.innerHeight
    if (aspect < 1.05) camera.position.multiplyScalar(1.62)
    if (aspect < 0.6) camera.position.multiplyScalar(1.5)
    controls.target.set(0, 2.4, 0)
    controls.update()
  }
  resetCamera()

  scene.add(new HemisphereLight(0xe9edff, 0x171127, 0.42))
  scene.add(new AmbientLight(0x7a80cc, 0.1))
  const key = new DirectionalLight(0xffffff, 0.8)
  key.position.set(-7, 13, 10)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 5
  key.shadow.bias = -0.00025
  key.shadow.camera.left = -14
  key.shadow.camera.right = 14
  key.shadow.camera.top = 14
  key.shadow.camera.bottom = -12
  scene.add(key)
  const rim = new DirectionalLight(0xb35cff, 0.95)
  rim.position.set(9, 6, -11)
  scene.add(rim)
  const cyanFill = new DirectionalLight(0x37d6ff, 0.5)
  cyanFill.position.set(-10, 2, 6)
  scene.add(cyanFill)

  const ground = new Mesh(
    new CircleGeometry(
      options.navigation !== undefined ? 25 : options.multipleAssets ? 18 : 12,
      128,
    ),
    new MeshStandardMaterial({
      color: 0xd9c9b8,
      metalness: 0.05,
      opacity: 0.12,
      roughness: 0.76,
      transparent: true,
    }),
  )
  ground.name = "studio-ground"
  ground.rotation.x = -Math.PI / 2
  ground.position.y = options.navigation === undefined ? -1.05 : DESKTOP_FLOOR_Y
  ground.receiveShadow = true
  scene.add(ground)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(
    new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.16, 0.28, 0.91),
  )
  const navigation =
    options.navigation === undefined
      ? null
      : createDesktopNavigationBinding({
          camera,
          controls,
          input: options.navigation.input,
          ...(options.navigation.onInteractionLockChange === undefined
            ? {}
            : { onInteractionLockChange: options.navigation.onInteractionLockChange }),
          ...(options.navigation.onSettled === undefined
            ? {}
            : { onSettled: options.navigation.onSettled }),
          reducedMotion: options.navigation.reducedMotion,
        })
  if (navigation !== null) controls.minDistance = 2.5

  return {
    camera,
    controls,
    dispose: () => {
      navigation?.dispose()
      controls.dispose()
      composer.dispose()
      renderer.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
    },
    navigation,
    render: (timestampMilliseconds) => {
      if (timestampMilliseconds !== undefined) navigation?.advance(timestampMilliseconds)
      if (controls.enabled) controls.update()
      composer.render()
    },
    renderer,
    resetCamera,
    resize: (width, height) => {
      camera.aspect = width / height
      camera.fov =
        navigation === null || camera.aspect >= navigationFrameAspect
          ? baseVerticalFieldOfView
          : (Math.atan(
              Math.tan((baseVerticalFieldOfView * Math.PI) / 360) *
                (navigationFrameAspect / camera.aspect),
            ) *
              360) /
            Math.PI
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      composer.setSize(width, height)
    },
    scene,
  }
}
