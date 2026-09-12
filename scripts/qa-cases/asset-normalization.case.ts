import { AmbientLight, Box3, Box3Helper, Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three"

import { cyberdeckAssetDefinition } from "../../src/assets/cyberdeck-asset"
import { assetInstanceId } from "../../src/runtime/ids"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .normalization-shell { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; }
  .normalization-heading { margin: 0; color: #f4f2ff; font-size: 1rem; letter-spacing: .08em; }
  .normalization-copy, .normalization-status { margin: 0; color: #9799de; font-size: .75rem; line-height: 1.4; }
  .normalization-stage { min-height: 520px; overflow: hidden; border: 1px solid #34346a; background: #07102b; }
  .normalization-stage canvas { display: block; width: 100%; height: auto; }
  .normalization-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .normalization-controls button { border: 1px solid #7657ff; background: #14214a; color: #ddd9ee; padding: 8px 12px; }
  @media (max-width: 767px) { .normalization-shell { padding: 12px; } .normalization-stage { min-height: 360px; } }
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

const vectorTuple = (vector: Vector3): readonly [number, number, number] => [
  vector.x,
  vector.y,
  vector.z,
]

export const caseId = "asset-normalization"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const asset = cyberdeckAssetDefinition.create(assetInstanceId("computer-main"))
  const scene = new Scene()
  const camera = new PerspectiveCamera(34, 1, 0.1, 100)
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const bounds = new Box3().setFromObject(asset.root)
  const boundsOverlay = new Box3Helper(bounds, new Color("#34d9ff"))
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stage = document.createElement("div")
  const status = document.createElement("p")
  const controls = document.createElement("div")
  const explode = document.createElement("button")
  const reset = document.createElement("button")
  const dispose = document.createElement("button")
  let disposed = false

  style.textContent = styles
  shell.className = "normalization-shell"
  stage.className = "normalization-stage"
  stage.dataset["testid"] = "normalized-stage"
  status.className = "normalization-status"
  status.dataset["testid"] = "normalization-status"
  controls.className = "normalization-controls"
  explode.type = "button"
  explode.textContent = "Explode cyberdeck"
  explode.dataset["testid"] = "explode"
  reset.type = "button"
  reset.textContent = "Reset cyberdeck"
  reset.dataset["testid"] = "reset"
  dispose.type = "button"
  dispose.textContent = "Dispose cyberdeck"
  dispose.dataset["testid"] = "dispose"

  scene.background = new Color("#03040a")
  scene.add(asset.root, boundsOverlay, new AmbientLight("#8d91bf", 2.4))
  const keyLight = new DirectionalLight("#dceeff", 4.5)
  keyLight.position.set(5, 7, 6)
  scene.add(keyLight)
  const fillLight = new DirectionalLight("#7657ff", 2.2)
  fillLight.position.set(-6, 4, -4)
  scene.add(fillLight)
  camera.position.set(5.9, 4.8, 7.1)
  camera.lookAt(new Vector3(0, 1.1, 0))

  const render = (): void => {
    const width = Math.max(320, stage.clientWidth)
    const height = Math.max(360, Math.min(620, Math.round(width * 0.62)))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
  }

  const updateStatus = (): void => {
    const currentBounds = new Box3().setFromObject(asset.root)
    const authoredContent = asset.root.children[0]
    const screens = asset.screens.map((screen) => ({
      aligned: asset.root.getObjectById(screen.anchor.id) === screen.anchor,
      id: screen.screenId.value,
      insideAuthoredContent: authoredContent?.getObjectById(screen.anchor.id) === screen.anchor,
    }))
    status.dataset["bounds"] = JSON.stringify(boundsTuple(currentBounds))
    status.dataset["outerRoot"] = JSON.stringify({
      position: vectorTuple(asset.root.position),
      rotation: [asset.root.rotation.x, asset.root.rotation.y, asset.root.rotation.z],
      scale: vectorTuple(asset.root.scale),
    })
    status.dataset["authoredContentScale"] = JSON.stringify(
      authoredContent === undefined ? null : vectorTuple(authoredContent.scale),
    )
    status.dataset["screens"] = JSON.stringify(screens)
    status.dataset["explosion"] = String(asset.explosion)
    status.dataset["disposed"] = String(disposed)
    status.textContent = `bounds overlay active · ${screens.length} aligned screens · explosion ${asset.explosion.toFixed(1)}`
    boundsOverlay.box.copy(currentBounds)
    render()
  }

  explode.addEventListener("click", () => {
    asset.setExplosion(1)
    updateStatus()
  })
  reset.addEventListener("click", () => {
    asset.setExplosion(0)
    updateStatus()
  })
  dispose.addEventListener("click", () => {
    if (disposed) return
    asset.dispose()
    scene.remove(asset.root, boundsOverlay)
    disposed = true
    updateStatus()
  })
  window.addEventListener("resize", render)

  shell.innerHTML = `
    <h1 class="normalization-heading">CYBERDECK NORMALIZATION</h1>
    <p class="normalization-copy">Real production adapter with cyan final-bounds overlay.</p>
  `
  controls.append(explode, reset, dispose)
  stage.append(renderer.domElement)
  shell.append(style, stage, status, controls)
  root.append(shell)
  updateStatus()
}
