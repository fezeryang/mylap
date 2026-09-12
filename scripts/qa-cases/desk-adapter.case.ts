import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import { cyberDeskAssetDefinition } from "../../src/assets/cyber-desk-asset"
import { ModelController } from "../../src/model/model-controller"
import { AssetRegistry } from "../../src/runtime/asset-registry"
import { AssetStage } from "../../src/runtime/asset-stage"
import { assetInstanceId } from "../../src/runtime/ids"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .desk-adapter-shell { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; background: #03040a; font-family: "IBM Plex Mono", monospace; }
  .desk-adapter-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .desk-adapter-copy, .desk-adapter-status { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.4; }
  .desk-adapter-stage { overflow: hidden; min-height: 430px; border: 1px solid #34346a; background: #07102b; }
  .desk-adapter-stage canvas { display: block; width: 100%; height: auto; }
  .desk-adapter-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .desk-adapter-controls button { border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px 12px; }
  .desk-adapter-controls button:disabled { border-color: #34346a; color: #9799de; opacity: .7; }
  @media (max-width: 767px) { .desk-adapter-shell { padding: 12px; } .desk-adapter-stage { min-height: 360px; } }
`

type BoundsTuple = readonly [number, number, number, number, number, number]

const boundsTuple = (bounds: Box3): BoundsTuple => [
  bounds.min.x,
  bounds.min.y,
  bounds.min.z,
  bounds.max.x,
  bounds.max.y,
  bounds.max.z,
]

export const caseId = "desk-adapter"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const scene = new Scene()
  const registry = new AssetRegistry()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const camera = new PerspectiveCamera(42, 1, 0.1, 100)
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stageElement = document.createElement("div")
  const status = document.createElement("p")
  const controls = document.createElement("div")
  const autoRotate = document.createElement("button")
  const explode = document.createElement("input")
  const partMeta = document.createElement("p")
  const partTitle = document.createElement("p")
  const reset = document.createElement("button")
  const resetView = document.createElement("button")
  const screenPower = document.createElement("button")
  const orbit = new OrbitControls(camera, renderer.domElement)
  const deskInstanceId = assetInstanceId("desk-main")
  let activeChanges = 0
  let picks = 0

  registry.register(cyberDeskAssetDefinition)
  const stage = new AssetStage(scene, registry)
  const asset = stage.mount({
    instanceId: deskInstanceId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    typeId: cyberDeskAssetDefinition.typeId,
  })
  stage.subscribe((event) => {
    if (event.kind === "active-changed") activeChanges += 1
  })

  style.textContent = styles
  shell.className = "desk-adapter-shell"
  stageElement.className = "desk-adapter-stage"
  stageElement.dataset["testid"] = "desk-adapter-stage"
  status.className = "desk-adapter-status"
  status.dataset["testid"] = "desk-adapter-status"
  controls.className = "desk-adapter-controls"
  autoRotate.type = "button"
  autoRotate.textContent = "Auto rotate"
  explode.type = "range"
  explode.max = "1"
  explode.min = "0"
  explode.step = "1"
  explode.value = "0"
  reset.type = "button"
  reset.textContent = "Reset explosion"
  resetView.type = "button"
  resetView.textContent = "Reset view"
  screenPower.type = "button"
  screenPower.textContent = "No screens"

  shell.innerHTML = `
    <h1 class="desk-adapter-heading">CYBER-DESK ENVIRONMENT ADAPTER</h1>
    <p class="desk-adapter-copy">Real desk factory, screenless environment contract, and non-selectable click sweep.</p>
  `
  controls.append(autoRotate, explode, reset, resetView, screenPower)
  stageElement.append(renderer.domElement)
  shell.append(style, stageElement, partTitle, partMeta, status, controls)
  root.append(shell)

  scene.background = new Color("#03040a")
  scene.add(new AmbientLight("#8d91bf", 2.3))
  const keyLight = new DirectionalLight("#dceeff", 4.3)
  keyLight.position.set(9, 12, 8)
  scene.add(keyLight)
  const fillLight = new DirectionalLight("#7657ff", 2.1)
  fillLight.position.set(-8, 4, -7)
  scene.add(fillLight)
  camera.position.set(12.5, 7.2, 12.5)
  camera.lookAt(new Vector3(0, -1.2, 0))
  orbit.enableDamping = false

  const render = (): void => {
    const width = Math.max(320, stageElement.clientWidth)
    const height = Math.max(360, Math.min(640, Math.round(width * 0.56)))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
  }

  const updateStatus = (): void => {
    const bounds = new Box3().setFromObject(asset.root)
    const authoredContent = asset.root.children[0]
    status.dataset["active"] = stage.active?.instanceId.value ?? "none"
    status.dataset["activeChanges"] = String(activeChanges)
    status.dataset["bounds"] = JSON.stringify(boundsTuple(bounds))
    status.dataset["explosion"] = String(asset.explosion)
    status.dataset["keyboard"] = String(asset.keyboard !== undefined)
    status.dataset["outerRoot"] = JSON.stringify({
      position: asset.root.position.toArray(),
      rotation: [asset.root.rotation.x, asset.root.rotation.y, asset.root.rotation.z],
      scale: asset.root.scale.toArray(),
    })
    status.dataset["partIds"] = JSON.stringify(asset.parts.map((part) => part.id))
    status.dataset["picks"] = String(picks)
    status.dataset["screens"] = String(asset.screens.length)
    status.dataset["selectable"] = String(asset.selectable.length)
    status.dataset["selectionHelper"] = String(scene.getObjectByName("selection-outline") !== undefined)
    status.dataset["shift"] = String(authoredContent?.position.y)
    status.textContent = `${asset.parts.length} stable parts · no screens · ${picks} desk picks`
    render()
  }

  const controller = new ModelController({
    camera,
    controls: orbit,
    elements: { autoRotate, canvas: renderer.domElement, explode, partMeta, partTitle, resetView, screenPower },
    onAssetPick: () => {
      picks += 1
    },
    onSelection: () => undefined,
    resetCamera: () => {
      camera.position.set(12.5, 7.2, 12.5)
      camera.lookAt(new Vector3(0, -1.2, 0))
      updateStatus()
    },
    scene,
    screens: { isPowered: () => false, togglePower: () => false },
    stage,
  })

  explode.addEventListener("input", updateStatus)
  reset.addEventListener("click", () => {
    explode.value = "0"
    asset.setExplosion(0)
    updateStatus()
  })
  renderer.domElement.addEventListener("pointerup", updateStatus)
  window.addEventListener("resize", updateStatus)
  window.addEventListener(
    "pagehide",
    () => {
      controller.dispose()
      orbit.dispose()
      stage.dispose()
      renderer.dispose()
    },
    { once: true },
  )
  updateStatus()
}
