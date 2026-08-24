import type { Object3D, Scene } from "three"
import { BoxHelper, type Camera, Group, Raycaster, Vector2 } from "three"
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import type { AssetStage, AssetStageEvent } from "../runtime/asset-stage"
import type { ScreenRuntime } from "../runtime/screen-runtime"

export type ControllerElements = {
  readonly autoRotate: HTMLButtonElement
  readonly canvas: HTMLCanvasElement
  readonly explode: HTMLInputElement
  readonly partMeta: HTMLElement
  readonly partTitle: HTMLElement
  readonly resetView: HTMLButtonElement
  readonly screenPower: HTMLButtonElement
}

export type ModelControllerOptions = {
  readonly camera: Camera
  readonly controls: OrbitControls
  readonly elements: ControllerElements
  readonly onSelection: (partId: string) => void
  readonly resetCamera: () => void
  readonly scene: Scene
  readonly screens: ScreenRuntime
  readonly stage: AssetStage
}

export class ModelController {
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly pointerDown = new Vector2()
  private selectionHelper: BoxHelper | null = null
  private readonly unsubscribeStage: () => void

  constructor(private readonly options: ModelControllerOptions) {
    const { elements } = options
    elements.resetView.addEventListener("click", this.resetView)
    elements.autoRotate.addEventListener("click", this.toggleAutoRotate)
    elements.screenPower.addEventListener("click", this.toggleScreens)
    elements.explode.addEventListener("input", this.updateExplosion)
    elements.canvas.addEventListener("pointerdown", this.rememberPointer)
    elements.canvas.addEventListener("pointerup", this.pickPart)
    this.unsubscribeStage = options.stage.subscribe(this.handleStageEvent)
    this.syncActiveAsset()
  }

  dispose(): void {
    const { elements } = this.options
    elements.resetView.removeEventListener("click", this.resetView)
    elements.autoRotate.removeEventListener("click", this.toggleAutoRotate)
    elements.screenPower.removeEventListener("click", this.toggleScreens)
    elements.explode.removeEventListener("input", this.updateExplosion)
    elements.canvas.removeEventListener("pointerdown", this.rememberPointer)
    elements.canvas.removeEventListener("pointerup", this.pickPart)
    this.unsubscribeStage()
    this.clearSelection()
  }

  private readonly resetView = (): void => {
    this.options.resetCamera()
  }

  private readonly toggleAutoRotate = (): void => {
    this.options.controls.autoRotate = !this.options.controls.autoRotate
    this.options.elements.autoRotate.setAttribute(
      "aria-pressed",
      String(this.options.controls.autoRotate),
    )
  }

  private readonly toggleScreens = (): void => {
    const active = this.options.stage.active
    if (active === null) return
    const powered = this.options.screens.togglePower(active.instanceId)
    this.updateScreenPower(powered)
  }

  private readonly updateExplosion = (): void => {
    const active = this.options.stage.active
    if (active === null) return
    const parsed = Number.parseFloat(this.options.elements.explode.value)
    const factor = Number.isFinite(parsed) ? parsed : 0
    this.options.camera.position.setLength(24 + factor * 15)
    active.setExplosion(factor)
  }

  private readonly rememberPointer = (event: PointerEvent): void => {
    this.pointerDown.set(event.clientX, event.clientY)
  }

  private readonly pickPart = (event: PointerEvent): void => {
    if (this.pointerDown.distanceTo(new Vector2(event.clientX, event.clientY)) > 5) return
    const bounds = this.options.elements.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.options.camera)
    const selectable = this.options.stage.assets.flatMap((asset) => asset.selectable)
    const firstHit = this.raycaster.intersectObjects(selectable, false)[0]
    if (firstHit === undefined) return
    this.options.stage.activateFromObject(firstHit.object)
    const part = this.findPart(firstHit.object)
    if (part === null) return
    this.select(part)
  }

  private findPart(object: Object3D): Group | null {
    let cursor: Object3D | null = object
    while (cursor !== null) {
      const componentId = cursor.userData["componentId"]
      if (typeof componentId === "string" && cursor instanceof Group) return cursor
      cursor = cursor.parent
    }
    return null
  }

  private select(part: Group): void {
    this.clearSelection()
    this.selectionHelper = new BoxHelper(part, 0x34d9ff)
    this.selectionHelper.name = "selection-outline"
    this.options.scene.add(this.selectionHelper)
    this.options.elements.partTitle.textContent = part.name.replaceAll("-", " ").toUpperCase()
    const childMeshes = part.children.filter((child) => child.type === "Mesh").length
    this.options.elements.partMeta.textContent = `${childMeshes} DIRECT VISUAL MESH${childMeshes === 1 ? "" : "ES"} · NAMED RUNTIME NODE`
    this.options.onSelection(part.name)
  }

  private clearSelection(): void {
    if (this.selectionHelper === null) return
    this.options.scene.remove(this.selectionHelper)
    this.selectionHelper.geometry.dispose()
    this.selectionHelper.material.dispose()
    this.selectionHelper = null
  }

  private readonly handleStageEvent = (event: AssetStageEvent): void => {
    switch (event.kind) {
      case "active-changed":
        this.syncActiveAsset()
        return
      case "asset-added":
      case "asset-removed":
        return
    }
  }

  private syncActiveAsset(): void {
    const active = this.options.stage.active
    if (active === null) {
      this.options.elements.explode.value = "0"
      this.updateScreenPower(false)
      return
    }
    this.options.elements.explode.value = String(active.explosion)
    this.updateScreenPower(this.options.screens.isPowered(active.instanceId))
    this.options.elements.partTitle.textContent = active.instanceId.value.toUpperCase()
    this.options.elements.partMeta.textContent = "ACTIVE ASSET · CLICK A NAMED PART TO INSPECT"
    this.options.onSelection("cyberdeck-root")
  }

  private updateScreenPower(powered: boolean): void {
    this.options.elements.screenPower.setAttribute("aria-pressed", String(powered))
    this.options.elements.screenPower.textContent = powered ? "SCREENS ON" : "SCREENS OFF"
  }
}
