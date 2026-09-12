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
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import { ModelController } from "../../src/model/model-controller"
import type { AssetPlacement, SceneAssetDefinition, ScreenSurface, StageAsset } from "../../src/runtime/asset-contracts"
import { AssetRegistry } from "../../src/runtime/asset-registry"
import { AssetStage } from "../../src/runtime/asset-stage"
import { assetInstanceId, assetTypeId, screenAppId, screenId } from "../../src/runtime/ids"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .heterogeneous-shell { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; background: #03040a; font-family: "IBM Plex Mono", monospace; }
  .heterogeneous-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .heterogeneous-copy, .heterogeneous-status { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.4; }
  .heterogeneous-stage { overflow: hidden; min-height: 430px; border: 1px solid #34346a; background: #07102b; }
  .heterogeneous-stage canvas { display: block; width: 100%; height: auto; }
  .heterogeneous-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .heterogeneous-controls button { border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px 12px; }
  .heterogeneous-controls button:disabled { border-color: #34346a; color: #9799de; opacity: .7; }
  @media (max-width: 767px) { .heterogeneous-shell { padding: 12px; } .heterogeneous-stage { min-height: 360px; } }
`

const PHONE_TYPE = assetTypeId("phone-shaped-fixture")
const RADIO_TYPE = assetTypeId("radio-shaped-fixture")
const DESK_TYPE = assetTypeId("screenless-desk-fixture")

type FixtureShape = {
  readonly geometry: readonly [number, number, number]
  readonly partId: string | null
}

const placement = (typeId: ReturnType<typeof assetTypeId>, instance: string, x: number): AssetPlacement => ({
  instanceId: assetInstanceId(instance),
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  typeId,
})

const screen = (id: string): ScreenSurface => {
  const anchor = new Group()
  const hitProxy = new Group()
  const occlusionRoot = new Group()
  return {
    anchor,
    defaultAppId: screenAppId("fixture-app"),
    hitProxy,
    occlusionRoot,
    pixelSize: { height: 1, width: 1 },
    screenId: screenId(id),
    worldSize: { height: 1, width: 1 },
  }
}

const fixtureDefinition = (
  typeId: ReturnType<typeof assetTypeId>,
  shape: FixtureShape,
  disposalCounts: Map<string, number>,
): SceneAssetDefinition => ({
  create: (instanceId): StageAsset => {
    const root = new Group()
    root.name = `fixture-root-${instanceId.value}`
    const declaredPart = new Group()
    declaredPart.name = `arbitrary-${instanceId.value}-holder`
    const nestedVisual = new Group()
    nestedVisual.name = `nested-visual-${instanceId.value}`
    const mesh = new Mesh(
      new BoxGeometry(...shape.geometry),
      new MeshBasicMaterial({ color: instanceId.value === "phone-main" ? "#7657ff" : "#ff55ca" }),
    )
    mesh.name = `mesh-name-is-not-an-id-${instanceId.value}`
    root.add(declaredPart)
    declaredPart.add(nestedVisual)
    nestedVisual.add(mesh)
    let disposed = false
    let explosion = 0
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        disposalCounts.set(instanceId.value, (disposalCounts.get(instanceId.value) ?? 0) + 1)
        mesh.geometry.dispose()
        mesh.material.dispose()
      },
      get explosion(): number {
        return explosion
      },
      instanceId,
      parts: shape.partId === null
        ? []
        : [{ authoredPosition: new Vector3(), centralClearance: 0, id: shape.partId, node: declaredPart }],
      root,
      screens: shape.partId === null ? [] : [screen(`${instanceId.value}-primary`)],
      selectable: [mesh],
      setExplosion: (factor) => {
        explosion = factor
      },
      typeId,
      update: () => undefined,
    }
  },
  typeId,
})

const meshFor = (asset: StageAsset): Mesh => {
  const selectable = asset.selectable[0]
  if (!(selectable instanceof Mesh)) throw new Error("Fixture selectable must be a mesh")
  return selectable
}

const projectedPoint = (renderer: WebGLRenderer, camera: PerspectiveCamera, mesh: Mesh): readonly [number, number] => {
  const rect = renderer.domElement.getBoundingClientRect()
  const projected = mesh.getWorldPosition(new Vector3()).project(camera)
  return [rect.left + ((projected.x + 1) * rect.width) / 2, rect.top + ((1 - projected.y) * rect.height) / 2]
}

export const caseId = "heterogeneous-picking"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const scene = new Scene()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const camera = new PerspectiveCamera(42, 1, 0.1, 100)
  const registry = new AssetRegistry()
  const disposalCounts = new Map<string, number>()
  registry.register(
    fixtureDefinition(
      PHONE_TYPE,
      { geometry: [0.85, 2.1, 0.35], partId: "phone-primary-body" },
      disposalCounts,
    ),
  )
  registry.register(
    fixtureDefinition(
      RADIO_TYPE,
      { geometry: [1.65, 0.9, 0.65], partId: "radio-tuner-casing" },
      disposalCounts,
    ),
  )
  registry.register(
    fixtureDefinition(DESK_TYPE, { geometry: [6.4, 0.35, 3.2], partId: null }, disposalCounts),
  )
  const stage = new AssetStage(scene, registry)
  const desk = stage.mount(placement(DESK_TYPE, "desk-main", 0))
  desk.root.position.y = -1.8
  const phone = stage.mount(placement(PHONE_TYPE, "phone-main", -2.4))
  const radio = stage.mount(placement(RADIO_TYPE, "radio-main", 2.4))
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stageElement = document.createElement("div")
  const controls = document.createElement("div")
  const status = document.createElement("p")
  const partTitle = document.createElement("p")
  const partMeta = document.createElement("p")
  const resetView = document.createElement("button")
  const autoRotate = document.createElement("button")
  const screenPower = document.createElement("button")
  const activateDesk = document.createElement("button")
  const removeRadio = document.createElement("button")
  const disposeFixture = document.createElement("button")
  const explode = document.createElement("input")
  const picks: string[] = []
  const powered = new Map<string, boolean>([
    ["phone-main", true],
    ["radio-main", true],
  ])
  let powerToggles = 0
  let disposed = false

  style.textContent = styles
  shell.className = "heterogeneous-shell"
  stageElement.className = "heterogeneous-stage"
  stageElement.dataset["testid"] = "heterogeneous-stage"
  controls.className = "heterogeneous-controls"
  status.className = "heterogeneous-status"
  status.dataset["testid"] = "heterogeneous-status"
  partTitle.dataset["testid"] = "part-title"
  partMeta.dataset["testid"] = "part-meta"
  screenPower.dataset["testid"] = "screen-power"
  activateDesk.dataset["testid"] = "activate-desk"
  removeRadio.dataset["testid"] = "remove-radio"
  disposeFixture.dataset["testid"] = "dispose-fixture"
  resetView.type = "button"
  resetView.textContent = "Reset view"
  autoRotate.type = "button"
  autoRotate.textContent = "Auto rotate"
  screenPower.type = "button"
  activateDesk.type = "button"
  activateDesk.textContent = "Activate screenless desk"
  removeRadio.type = "button"
  removeRadio.textContent = "Remove radio"
  disposeFixture.type = "button"
  disposeFixture.textContent = "Dispose fixtures"
  explode.type = "range"
  explode.value = "0"

  shell.innerHTML = `
    <h1 class="heterogeneous-heading">HETEROGENEOUS PICKING</h1>
    <p class="heterogeneous-copy">Production controller with synthetic phone, radio, and screenless desk contracts.</p>
  `
  stageElement.append(renderer.domElement)
  controls.append(resetView, autoRotate, screenPower, activateDesk, removeRadio, disposeFixture, explode)
  shell.append(style, stageElement, partTitle, partMeta, status, controls)
  root.append(shell)

  scene.background = new Color("#03040a")
  scene.add(new AmbientLight("#8d91bf", 2.2))
  const keyLight = new DirectionalLight("#dceeff", 3.5)
  keyLight.position.set(4, 6, 5)
  scene.add(keyLight)
  camera.position.set(0, 1.3, 10)
  camera.lookAt(0, -0.45, 0)
  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = false

  const render = (): void => {
    const width = Math.max(320, stageElement.clientWidth)
    const height = Math.max(360, Math.min(560, Math.round(width * 0.56)))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
  }

  const writeSnapshot = (): void => {
    const active = stage.active
    status.dataset["active"] = active?.instanceId.value ?? "none"
    status.dataset["picks"] = JSON.stringify(picks)
    status.dataset["outline"] = String(scene.getObjectByName("selection-outline") !== undefined)
    status.dataset["powerToggles"] = String(powerToggles)
    status.dataset["disposed"] = String(disposed)
    status.dataset["disposalCounts"] = JSON.stringify(Object.fromEntries(disposalCounts))
    status.dataset["phonePoint"] = JSON.stringify(projectedPoint(renderer, camera, meshFor(phone)))
    status.dataset["radioPoint"] = JSON.stringify(projectedPoint(renderer, camera, meshFor(radio)))
    status.dataset["deskPoint"] = JSON.stringify(projectedPoint(renderer, camera, meshFor(desk)))
    status.textContent = `${active?.instanceId.value ?? "none"} · ${picks.length} stable picks · outline ${status.dataset["outline"]}`
  }

  const controller = new ModelController({
    camera,
    controls: orbit,
    elements: { autoRotate, canvas: renderer.domElement, explode, partMeta, partTitle, resetView, screenPower },
    onAssetPick: (pick) => {
      picks.push(`${pick.instanceId.value}:${pick.partId}`)
    },
    onSelection: () => undefined,
    resetCamera: () => {
      camera.position.set(0, 1.3, 10)
      camera.lookAt(0, -0.45, 0)
      render()
    },
    scene,
    screens: {
      isPowered: (instanceId) => powered.get(instanceId.value) ?? false,
      togglePower: (instanceId) => {
        powerToggles += 1
        const next = !(powered.get(instanceId.value) ?? false)
        powered.set(instanceId.value, next)
        return next
      },
    },
    stage,
  })

  stage.subscribe(() => {
    render()
    writeSnapshot()
  })
  renderer.domElement.addEventListener("pointerup", () => {
    render()
    writeSnapshot()
  })
  activateDesk.addEventListener("click", () => stage.activate(desk.instanceId))
  removeRadio.addEventListener("click", () => stage.remove(radio.instanceId))
  disposeFixture.addEventListener("click", () => {
    if (disposed) return
    disposed = true
    controller.dispose()
    stage.dispose()
    orbit.dispose()
    renderer.dispose()
    writeSnapshot()
  })
  window.addEventListener("resize", () => {
    render()
    writeSnapshot()
  })
  render()
  writeSnapshot()
}
