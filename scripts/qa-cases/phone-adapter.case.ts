import {
  AmbientLight,
  BoxHelper,
  Box3,
  Color,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import { PHONE_SHELL_APP_ID } from "../../src/apps/app-ids"
import { createPhoneAssetDefinition } from "../../src/assets/phone-asset"
import { AssetRegistry } from "../../src/runtime/asset-registry"
import { AssetStage } from "../../src/runtime/asset-stage"
import type { ScreenAppDefinition } from "../../src/runtime/screen-app"
import { ScreenAppRegistry } from "../../src/runtime/screen-app-registry"
import { ScreenRuntime } from "../../src/runtime/screen-runtime"
import { assetInstanceId } from "../../src/runtime/ids"
import { createNeonCyberphoneModel } from "../../phone/src/model/createPhoneModel"
import { resolvePartId } from "../../phone/src/model/parts"
import type { QaCaseModule } from "../qa-harness/qa-case-contract"

const styles = `
  .phone-adapter-shell { min-height: 100dvh; padding: 16px; display: grid; gap: 12px; align-content: start; color: #ddd9ee; background: #03040a; font-family: "Rajdhani", "Segoe UI", sans-serif; }
  .phone-adapter-heading { margin: 0; color: #f4f0ff; font-size: 1rem; letter-spacing: .08em; }
  .phone-adapter-copy, .phone-adapter-status { margin: 0; color: #b8c8ff; font-size: .75rem; line-height: 1.45; }
  .phone-adapter-stage { position: relative; overflow: hidden; min-height: 430px; border: 1px solid #315cff; background: radial-gradient(circle at 50% 45%, #071247, #02030a 74%); }
  .phone-adapter-stage canvas, .phone-adapter-stage .css3d-layer { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .phone-adapter-stage .css3d-layer { pointer-events: none; }
  .phone-adapter-stage .model-screen { overflow: hidden; pointer-events: auto; border: 2px solid #28e8ff; border-radius: 72px; background: linear-gradient(155deg, #06135b, #071247 58%, #020512); color: #f4f0ff; box-shadow: inset 0 0 28px #315cff, 0 0 24px #8b45ff; }
  .phone-adapter-app { min-height: 100%; padding: 72px 48px; display: grid; place-content: center; gap: 28px; text-align: center; }
  .phone-adapter-app strong { font-size: 48px; letter-spacing: .08em; }
  .phone-adapter-app button { min-height: 88px; border: 2px solid #28e8ff; border-radius: 24px; background: #071247; color: #f4f0ff; font: 650 30px/1 "Rajdhani", sans-serif; }
  .phone-adapter-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .phone-adapter-controls button, .phone-adapter-controls input { min-height: 44px; border: 1px solid #8b45ff; background: #071247; color: #f4f0ff; padding: 8px 12px; }
  @media (max-width: 767px) { .phone-adapter-shell { padding: 12px; } .phone-adapter-stage { min-height: 360px; } }
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

const qaPhoneApp: ScreenAppDefinition = {
  appId: PHONE_SHELL_APP_ID,
  mount: (host, context) => {
    const app = document.createElement("section")
    const heading = document.createElement("strong")
    const button = document.createElement("button")
    let activations = 0
    app.className = "phone-adapter-app"
    app.dataset["qaPhoneApp"] = "mounted"
    heading.textContent = "TODŌU PHONE"
    button.type = "button"
    button.textContent = "OPEN CONTROL"
    button.addEventListener("click", () => {
      activations += 1
      app.dataset["activations"] = String(activations)
      context.requestAssetActivation()
      context.requestScreenFocus()
    })
    app.append(heading, button)
    host.append(app)
    return {
      dispose: () => {
        document.documentElement.dataset["phoneAppDisposed"] = "true"
      },
      setActive: (active) => {
        app.dataset["active"] = String(active)
      },
      update: () => undefined,
    }
  },
}

export const caseId = "phone-adapter"

export const mount: QaCaseModule["mount"] = ({ root }) => {
  const scene = new Scene()
  const assetRegistry = new AssetRegistry()
  const appRegistry = new ScreenAppRegistry()
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  const camera = new PerspectiveCamera(36, 1, 0.1, 100)
  const style = document.createElement("style")
  const shell = document.createElement("section")
  const stageElement = document.createElement("div")
  const status = document.createElement("p")
  const controls = document.createElement("div")
  const explode = document.createElement("input")
  const reset = document.createElement("button")
  const screenPower = document.createElement("button")
  const remove = document.createElement("button")
  const orbit = new OrbitControls(camera, renderer.domElement)
  const phoneInstanceId = assetInstanceId("phone-main")
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let disposalCount = 0
  let pickedPart = "none"
  let removed = false
  let selectionHelper: BoxHelper | null = null

  const phoneDefinition = createPhoneAssetDefinition(() => {
    const model = createNeonCyberphoneModel()
    const dispose = model.dispose
    Object.defineProperty(model, "dispose", {
      value: (): void => {
        disposalCount += 1
        dispose()
      },
    })
    return model
  })
  assetRegistry.register(phoneDefinition)
  appRegistry.register(qaPhoneApp)
  const stage = new AssetStage(scene, assetRegistry)
  const asset = stage.mount({
    instanceId: phoneInstanceId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    typeId: phoneDefinition.typeId,
  })
  stageElement.append(renderer.domElement)
  const screens = new ScreenRuntime({
    camera,
    container: stageElement,
    controls: orbit,
    readSnapshot: () => ({
      activeAsset: stage.active?.instanceId.value ?? "none",
      drawCalls: renderer.info.render.calls,
      fps: 60,
      selectedPart: pickedPart,
      triangles: renderer.info.render.triangles,
    }),
    registry: appRegistry,
    scene,
    stage,
  })

  style.textContent = styles
  shell.className = "phone-adapter-shell"
  stageElement.className = "phone-adapter-stage"
  stageElement.dataset["testid"] = "phone-adapter-stage"
  status.className = "phone-adapter-status"
  status.dataset["testid"] = "phone-adapter-status"
  controls.className = "phone-adapter-controls"
  explode.type = "range"
  explode.dataset["testid"] = "phone-explosion"
  explode.min = "0"
  explode.max = "1"
  explode.step = "0.5"
  explode.value = "0"
  reset.type = "button"
  reset.textContent = "RESET EXPLOSION"
  screenPower.type = "button"
  screenPower.textContent = "SCREEN OFF FOR PICKING"
  remove.type = "button"
  remove.textContent = "REMOVE PHONE"
  shell.innerHTML = `
    <h1 class="phone-adapter-heading">FLAT PHONE ROOT ADAPTER</h1>
    <p class="phone-adapter-copy">Real phone model factory, physical CSS3D screen, stable picking, explosion, and cleanup.</p>
  `
  controls.append(explode, reset, screenPower, remove)
  shell.append(style, stageElement, status, controls)
  root.append(shell)

  scene.background = new Color("#02030a")
  scene.add(new AmbientLight("#8b45ff", 2.4))
  const keyLight = new DirectionalLight("#dcd5f4", 4.8)
  keyLight.position.set(3, 7, 4)
  scene.add(keyLight)
  const fillLight = new DirectionalLight("#28e8ff", 2.8)
  fillLight.position.set(-4, 3, -2)
  scene.add(fillLight)
  camera.position.set(2.6, 4.8, 3.5)
  camera.lookAt(0, 0, 0)
  orbit.target.set(0, 0, 0)
  orbit.enableDamping = false
  orbit.enablePan = false

  const render = (): void => {
    const width = Math.max(320, stageElement.clientWidth)
    const height = Math.max(360, Math.min(640, Math.round(width * 0.56)))
    stageElement.style.height = `${height}px`
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    renderer.setSize(width, height, false)
    screens.resize(width, height)
    renderer.render(scene, camera)
    screens.render()
  }

  const updateStatus = (): void => {
    render()
    const bounds = new Box3().setFromObject(asset.root)
    const surface = asset.screens[0]
    const screenNormal = new Vector3()
    const anchorPosition = new Vector3()
    if (surface !== undefined && !removed) {
      screenNormal.set(0, 0, 1).applyQuaternion(surface.anchor.getWorldQuaternion(new Quaternion()))
      surface.anchor.getWorldPosition(anchorPosition)
    }
    const screenElement = stageElement.querySelector<HTMLElement>(".model-screen")
    status.dataset["bounds"] = JSON.stringify(boundsTuple(bounds))
    status.dataset["disposalCount"] = String(disposalCount)
    status.dataset["explosion"] = String(asset.explosion)
    status.dataset["partIds"] = JSON.stringify(asset.parts.map((part) => part.id))
    status.dataset["pickedPart"] = pickedPart
    status.dataset["removed"] = String(removed)
    status.dataset["screenAnchor"] = JSON.stringify(anchorPosition.toArray())
    status.dataset["screenCount"] = String(stageElement.querySelectorAll(".model-screen").length)
    status.dataset["screenNormal"] = JSON.stringify(screenNormal.toArray())
    status.dataset["screenVisible"] = screenElement?.dataset["visible"] ?? "false"
    status.dataset["selectables"] = String(asset.selectable.length)
    status.textContent = removed
      ? `Phone removed · disposal ${disposalCount}`
      : `${asset.parts.length} stable parts · ${pickedPart} · explosion ${asset.explosion}`
  }

  renderer.domElement.addEventListener("pointerup", (event) => {
    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects([...asset.selectable], false)[0]
    if (hit !== undefined) {
      const resolved = resolvePartId(hit.object)
      pickedPart = resolved ?? "none"
      const selectedPart = asset.parts.find((part) => part.id === resolved)
      if (selectedPart !== undefined) {
        if (selectionHelper !== null) {
          scene.remove(selectionHelper)
          selectionHelper.geometry.dispose()
          selectionHelper.material.dispose()
        }
        selectionHelper = new BoxHelper(selectedPart.node, 0x28e8ff)
        selectionHelper.name = "selection-outline"
        scene.add(selectionHelper)
      }
    }
    updateStatus()
  })
  explode.addEventListener("input", () => {
    asset.setExplosion(Number(explode.value))
    updateStatus()
  })
  reset.addEventListener("click", () => {
    explode.value = "0"
    asset.setExplosion(0)
    updateStatus()
  })
  screenPower.addEventListener("click", () => {
    const powered = !screens.isPowered(phoneInstanceId)
    screens.setPower(phoneInstanceId, powered)
    screenPower.textContent = powered ? "SCREEN OFF FOR PICKING" : "SCREEN ON"
    updateStatus()
  })
  remove.addEventListener("click", () => {
    if (removed) return
    if (selectionHelper !== null) {
      scene.remove(selectionHelper)
      selectionHelper.geometry.dispose()
      selectionHelper.material.dispose()
      selectionHelper = null
    }
    stage.remove(phoneInstanceId)
    removed = true
    remove.disabled = true
    updateStatus()
  })
  window.addEventListener("resize", updateStatus)
  window.addEventListener(
    "pagehide",
    () => {
      screens.dispose()
      orbit.dispose()
      stage.dispose()
      renderer.dispose()
    },
    { once: true },
  )
  updateStatus()
}
