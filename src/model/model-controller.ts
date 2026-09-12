import type { Object3D, Scene } from "three"
import { BoxHelper, type Camera, Raycaster, Vector2 } from "three"
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import type { AssetPart, StageAsset } from "../runtime/asset-contracts"
import type { AssetStage, AssetStageEvent } from "../runtime/asset-stage"
import type { AssetInstanceId } from "../runtime/ids"
import type { ScreenRuntime } from "../runtime/screen-runtime"

export type AssetPick = {
  readonly instanceId: AssetInstanceId
  readonly partId: string
}

type ButtonControl = {
  addEventListener(type: "click", listener: () => void): void
  removeEventListener(type: "click", listener: () => void): void
  setAttribute(name: string, value: string): void
  disabled: boolean
  textContent: string | null
}

type CanvasBounds = {
  readonly height: number
  readonly left: number
  readonly top: number
  readonly width: number
}

type ControllerPointerEvent = {
  readonly clientX: number
  readonly clientY: number
}

type CanvasControl = {
  addEventListener(
    type: "pointerdown" | "pointerup",
    listener: (event: ControllerPointerEvent) => void,
  ): void
  getBoundingClientRect(): CanvasBounds
  removeEventListener(
    type: "pointerdown" | "pointerup",
    listener: (event: ControllerPointerEvent) => void,
  ): void
}

type RangeControl = {
  addEventListener(type: "input", listener: () => void): void
  removeEventListener(type: "input", listener: () => void): void
  value: string
}

type TextOutput = {
  textContent: string | null
}

export type ControllerElements = {
  readonly autoRotate: ButtonControl
  readonly canvas: CanvasControl
  readonly explode: RangeControl
  readonly partMeta: TextOutput
  readonly partTitle: TextOutput
  readonly resetView: ButtonControl
  readonly screenPower: ButtonControl
}

export type ModelControllerOptions = {
  readonly camera: Camera
  readonly controls: Pick<OrbitControls, "autoRotate">
  readonly elements: ControllerElements
  readonly onAssetPick?: (pick: AssetPick) => void
  readonly onSelection: (partId: string) => void
  readonly resetCamera: () => void
  readonly scene: Scene
  readonly screens: Pick<ScreenRuntime, "isPowered" | "togglePower">
  readonly stage: Pick<AssetStage, "activate" | "active" | "assets" | "findOwner" | "subscribe">
}

type PickTarget = {
  readonly asset: StageAsset
  readonly part: AssetPart
}

export class ModelController {
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly pointerDown = new Vector2()
  private selectedAssetId: AssetInstanceId | null = null
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
    if (active === null || active.screens.length === 0) return
    const powered = this.options.screens.togglePower(active.instanceId)
    this.updateScreenPower(true, powered)
  }

  private readonly updateExplosion = (): void => {
    const active = this.options.stage.active
    if (active === null) return
    const parsed = Number.parseFloat(this.options.elements.explode.value)
    const factor = Number.isFinite(parsed) ? parsed : 0
    this.options.camera.position.setLength(24 + factor * 15)
    active.setExplosion(factor)
  }

  private readonly rememberPointer = (event: ControllerPointerEvent): void => {
    this.pointerDown.set(event.clientX, event.clientY)
  }

  private readonly pickPart = (event: ControllerPointerEvent): void => {
    if (this.pointerDown.distanceTo(new Vector2(event.clientX, event.clientY)) > 5) return
    const bounds = this.options.elements.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.options.camera)
    const selectable = this.options.stage.assets.flatMap((asset) => asset.selectable)
    const target = this.raycaster
      .intersectObjects(selectable, false)
      .map((hit) => this.resolvePickTarget(hit.object))
      .find((candidate): candidate is PickTarget => candidate !== null)
    if (target === undefined) return
    this.options.stage.activate(target.asset.instanceId)
    this.select(target)
  }

  private resolvePickTarget(object: Object3D): PickTarget | null {
    const asset = this.options.stage.findOwner(object)
    if (asset === null) return null
    const part = this.findPart(asset, object)
    return part === null ? null : { asset, part }
  }

  private findPart(asset: StageAsset, object: Object3D): AssetPart | null {
    let cursor: Object3D | null = object
    while (cursor !== null) {
      const part = asset.parts.find((candidate) => candidate.node === cursor)
      if (part !== undefined) return part
      cursor = cursor.parent
    }
    return null
  }

  private select(target: PickTarget): void {
    this.clearSelection()
    this.selectedAssetId = target.asset.instanceId
    this.selectionHelper = new BoxHelper(target.part.node, 0x34d9ff)
    this.selectionHelper.name = "selection-outline"
    this.options.scene.add(this.selectionHelper)
    this.options.elements.partTitle.textContent = target.part.id.replaceAll("-", " ").toUpperCase()
    const childMeshes = target.part.node.children.filter((child) => child.type === "Mesh").length
    this.options.elements.partMeta.textContent = `${childMeshes} DIRECT VISUAL MESH${childMeshes === 1 ? "" : "ES"} · NAMED RUNTIME NODE`
    this.options.onSelection(target.part.id)
    this.options.onAssetPick?.({ instanceId: target.asset.instanceId, partId: target.part.id })
  }

  private clearSelection(): void {
    if (this.selectionHelper === null) return
    this.options.scene.remove(this.selectionHelper)
    this.selectionHelper.geometry.dispose()
    this.selectionHelper.material.dispose()
    this.selectionHelper = null
    this.selectedAssetId = null
  }

  private readonly handleStageEvent = (event: AssetStageEvent): void => {
    switch (event.kind) {
      case "active-changed":
        this.clearSelection()
        this.syncActiveAsset()
        return
      case "asset-added":
        return
      case "asset-removed":
        if (this.selectedAssetId?.value === event.asset.instanceId.value) this.clearSelection()
        return
    }
  }

  private syncActiveAsset(): void {
    const active = this.options.stage.active
    if (active === null) {
      this.options.elements.explode.value = "0"
      this.options.elements.partTitle.textContent = "NO ACTIVE ASSET"
      this.options.elements.partMeta.textContent =
        "NO ACTIVE ASSET · CLICK A DECLARED PART TO INSPECT"
      this.updateScreenPower(false, false)
      return
    }
    this.options.elements.explode.value = String(active.explosion)
    this.updateScreenPower(
      active.screens.length > 0,
      active.screens.length > 0 && this.options.screens.isPowered(active.instanceId),
    )
    this.options.elements.partTitle.textContent = active.instanceId.value.toUpperCase()
    this.options.elements.partMeta.textContent = "ACTIVE ASSET · CLICK A NAMED PART TO INSPECT"
  }

  private updateScreenPower(hasScreens: boolean, powered: boolean): void {
    this.options.elements.screenPower.disabled = !hasScreens
    this.options.elements.screenPower.setAttribute("aria-pressed", String(powered))
    this.options.elements.screenPower.textContent = hasScreens
      ? powered
        ? "SCREENS ON"
        : "SCREENS OFF"
      : "NO SCREENS"
  }
}
