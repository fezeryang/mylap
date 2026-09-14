import type { Camera, Intersection, Object3D, Scene } from "three"
import { Matrix4, Quaternion, Raycaster, Vector3 } from "three"
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import {
  CSS3DObject,
  CSS3DRenderer,
  CSS3DSprite,
} from "three/examples/jsm/renderers/CSS3DRenderer.js"

import type { ScreenSurface, StageAsset } from "./asset-contracts"
import type { AssetStage, AssetStageEvent } from "./asset-stage"
import type { AssetInstanceId, ScreenAppId, ScreenId } from "./ids"
import type { ScreenAppHost, StageSnapshot } from "./screen-app"
import type { ScreenAppRegistry } from "./screen-app-registry"
import { ScreenSession } from "./screen-session"

type ScreenRuntimeOptions = {
  readonly camera: Camera
  readonly container: HTMLElement
  readonly controls: OrbitControls
  readonly readSnapshot: () => StageSnapshot
  readonly registry: ScreenAppRegistry
  readonly scene: Scene
  readonly stage: AssetStage
  readonly canInteract?: (assetId: AssetInstanceId) => boolean
  readonly requestDeviceFocus?: (assetId: AssetInstanceId) => void
  readonly invalidate?: () => void
}

type MountedScreen = {
  readonly asset: StageAsset
  readonly element: HTMLElement
  readonly object: CSS3DObject
  readonly session: ScreenSession
  readonly surface: ScreenSurface
  readonly occluders: Object3D[]
  readonly anchorMatrix: Matrix4
}

export type ScreenEscapeEvent = {
  readonly key: string
  readonly defaultPrevented?: boolean
  preventDefault(): void
  stopImmediatePropagation(): void
}

export type ScreenEscapeEventSource = {
  addEventListener(
    type: "keydown",
    listener: (event: ScreenEscapeEvent) => void,
    capture: boolean,
  ): void
  removeEventListener(
    type: "keydown",
    listener: (event: ScreenEscapeEvent) => void,
    capture: boolean,
  ): void
}

export const connectScreenEscapeRelease = (
  source: ScreenEscapeEventSource,
  isScreenFocused: () => boolean,
  releaseScreenFocus: () => void,
): (() => void) => {
  const releaseWithEscape = (event: ScreenEscapeEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || !isScreenFocused()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    releaseScreenFocus()
  }
  // Apps consume Escape for their dialogs first; unhandled Escape releases the screen.
  source.addEventListener("keydown", releaseWithEscape, false)
  return () => source.removeEventListener("keydown", releaseWithEscape, false)
}

class DomScreenHost implements ScreenAppHost {
  constructor(private readonly element: HTMLElement) {}

  append(node: Node): void {
    this.element.append(node)
  }

  clear(): void {
    this.element.replaceChildren()
  }
}

export class ScreenRuntime {
  private focused: MountedScreen | null = null
  private readonly mounted = new Map<string, MountedScreen>()
  private readonly normal = new Vector3()
  private readonly quaternion = new Quaternion()
  private readonly raycaster = new Raycaster()
  private readonly renderer = new CSS3DRenderer()
  private readonly screenPosition = new Vector3()
  private readonly cameraPosition = new Vector3()
  private readonly direction = new Vector3()
  private readonly intersections: Intersection[] = []
  private readonly cameraMatrix = new Matrix4()
  private readonly assetTransforms = new Map<StageAsset, { matrix: Matrix4; explosion: number }>()
  private spatialDirty = true
  private visibilityChecks = 0
  private readonly unsubscribeStage: () => void
  private readonly disconnectEscape: () => void

  constructor(private readonly options: ScreenRuntimeOptions) {
    this.renderer.domElement.className = "css3d-layer"
    options.container.append(this.renderer.domElement)
    for (const asset of options.stage.assets) this.attach(asset)
    this.refreshOccluders()
    this.unsubscribeStage = options.stage.subscribe(this.handleStageEvent)
    options.container.ownerDocument.addEventListener("pointerdown", this.releaseFromOutside, true)
    this.disconnectEscape = connectScreenEscapeRelease(
      options.container.ownerDocument,
      () => this.focused !== null,
      () => this.releaseFocus(),
    )
  }

  render(): void {
    const snapshot = this.options.readSnapshot()
    let changed = this.spatialDirty || !this.cameraMatrix.equals(this.options.camera.matrixWorld)
    this.cameraMatrix.copy(this.options.camera.matrixWorld)
    for (const asset of this.options.stage.assets) {
      const cached = this.assetTransforms.get(asset)
      if (
        !cached ||
        !cached.matrix.equals(asset.root.matrixWorld) ||
        cached.explosion !== asset.explosion
      ) {
        changed = true
        this.assetTransforms.set(asset, {
          matrix: asset.root.matrixWorld.clone(),
          explosion: asset.explosion,
        })
      }
    }
    this.mounted.forEach((mounted) => {
      mounted.session.update(snapshot)
      if (changed || !mounted.anchorMatrix.equals(mounted.surface.anchor.matrixWorld)) {
        this.updateVisibility(mounted)
        mounted.anchorMatrix.copy(mounted.surface.anchor.matrixWorld)
      }
    })
    this.spatialDirty = false
    this.renderer.render(this.options.scene, this.options.camera)
  }

  get occlusionChecks(): number {
    return this.visibilityChecks
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
  }

  install(assetId: AssetInstanceId, targetScreenId: ScreenId, appId: ScreenAppId): void {
    this.requireMounted(assetId, targetScreenId).session.install(appId)
  }

  setPower(assetId: AssetInstanceId, powered: boolean): void {
    this.spatialDirty = true
    this.forAsset(assetId).forEach((mounted) => {
      mounted.session.setPower(powered)
      mounted.element.dataset["powered"] = String(powered)
      if (!powered && mounted === this.focused) this.releaseFocus()
    })
    this.options.invalidate?.()
  }

  togglePower(assetId: AssetInstanceId): boolean {
    const current = this.forAsset(assetId)[0]?.session.isPowered ?? false
    const next = !current
    this.setPower(assetId, next)
    return next
  }

  isPowered(assetId: AssetInstanceId): boolean {
    return this.forAsset(assetId)[0]?.session.isPowered ?? false
  }

  get focusedScreen(): { readonly assetId: AssetInstanceId; readonly screenId: ScreenId } | null {
    if (this.focused === null) return null
    return {
      assetId: this.focused.asset.instanceId,
      screenId: this.focused.surface.screenId,
    }
  }

  releaseScreenFocus(): void {
    this.releaseFocus()
  }

  dispose(): void {
    this.releaseFocus()
    this.unsubscribeStage()
    const document = this.options.container.ownerDocument
    document.removeEventListener("pointerdown", this.releaseFromOutside, true)
    this.disconnectEscape()
    for (const mounted of this.mounted.values()) this.detach(mounted)
    this.mounted.clear()
    this.renderer.domElement.remove()
  }

  private readonly handleStageEvent = (event: AssetStageEvent): void => {
    switch (event.kind) {
      case "asset-added":
        this.attach(event.asset)
        this.refreshOccluders()
        return
      case "asset-removed":
        for (const mounted of this.forAsset(event.asset.instanceId)) this.removeMounted(mounted)
        this.assetTransforms.delete(event.asset)
        this.refreshOccluders()
        return
      case "active-changed":
        this.mounted.forEach((mounted) => {
          const active = mounted.asset === event.asset
          mounted.session.setActive(active)
          mounted.element.dataset["activeAsset"] = String(active)
        })
        return
    }
  }

  private attach(asset: StageAsset): void {
    asset.screens.forEach((surface) => {
      const element = document.createElement("section")
      element.className = "model-screen"
      element.dataset["assetInstance"] = asset.instanceId.value
      element.dataset["screenId"] = surface.screenId.value
      element.dataset["powered"] = "true"
      element.dataset["interactive"] = String(surface.interactive !== false)
      element.dataset["activeAsset"] = String(this.options.stage.active === asset)
      element.style.width = `${surface.pixelSize.width}px`
      element.style.height = `${surface.pixelSize.height}px`
      element.tabIndex = surface.interactive === false ? -1 : 0
      element.setAttribute("role", "region")
      element.setAttribute(
        "aria-label",
        `${asset.instanceId.value} ${surface.screenId.value} screen application`,
      )

      const object = surface.cssBillboard ? new CSS3DSprite(element) : new CSS3DObject(element)
      object.name = `${asset.instanceId.value}-${surface.screenId.value}-css3d`
      object.rotation.y = surface.cssRotationY ?? 0
      object.position.z = surface.depthOffset ?? 0.025
      object.scale.set(
        surface.worldSize.width / surface.pixelSize.width,
        surface.worldSize.height / surface.pixelSize.height,
        1,
      )
      surface.anchor.add(object)
      const mounted: MountedScreen = {
        asset,
        element,
        object,
        session: new ScreenSession({
          context: {
            assetInstanceId: asset.instanceId,
            requestAssetActivation: () => this.options.stage.activate(asset.instanceId),
            requestScreenFocus: () => this.focusScreen(mounted),
            screenId: surface.screenId,
          },
          host: new DomScreenHost(element),
          registry: this.options.registry,
        }),
        surface,
        occluders: [],
        anchorMatrix: new Matrix4(),
      }
      let suppressClick = false
      element.addEventListener(
        "pointerdown",
        (event) => {
          if (this.options.canInteract?.(asset.instanceId) === false) {
            suppressClick = true
            event.preventDefault()
            event.stopImmediatePropagation()
            this.options.requestDeviceFocus?.(asset.instanceId)
            this.options.invalidate?.()
            return
          }
          suppressClick = false
          this.focusScreen(mounted)
        },
        true,
      )
      element.addEventListener(
        "click",
        (event) => {
          if (!suppressClick && this.options.canInteract?.(asset.instanceId) !== false) return
          suppressClick = false
          event.preventDefault()
          event.stopImmediatePropagation()
          this.options.requestDeviceFocus?.(asset.instanceId)
          this.options.invalidate?.()
        },
        true,
      )
      element.addEventListener("pointercancel", () => {
        suppressClick = false
      })
      element.addEventListener("pointerdown", (event) => {
        event.stopPropagation()
        this.options.stage.activate(asset.instanceId)
      })
      element.addEventListener("focusin", () => this.focusScreen(mounted))
      mounted.session.install(surface.defaultAppId)
      mounted.session.setActive(this.options.stage.active === asset)
      this.mounted.set(this.key(asset.instanceId, surface.screenId), mounted)
      this.options.container.ownerDocument.documentElement.dataset["screenSessions"] = String(
        this.mounted.size,
      )
    })
  }

  private detach(mounted: MountedScreen): void {
    if (this.focused === mounted) this.releaseFocus()
    mounted.session.dispose()
    mounted.surface.anchor.remove(mounted.object)
    mounted.element.remove()
  }

  private removeMounted(mounted: MountedScreen): void {
    this.detach(mounted)
    this.mounted.delete(this.key(mounted.asset.instanceId, mounted.surface.screenId))
    this.options.container.ownerDocument.documentElement.dataset["screenSessions"] = String(
      this.mounted.size,
    )
  }

  private focusScreen(mounted: MountedScreen): void {
    if (this.focused === mounted) return
    this.releaseFocus()
    this.options.stage.activate(mounted.asset.instanceId)
    this.focused = mounted
    mounted.element.dataset["focused"] = "true"
    this.options.controls.enabled = false
    this.options.container.ownerDocument.documentElement.dataset["controlsEnabled"] = "false"
  }

  private releaseFocus(): void {
    if (this.focused === null) return
    this.focused.element.dataset["focused"] = "false"
    const activeElement = this.options.container.ownerDocument.activeElement
    if (activeElement instanceof HTMLElement && this.focused.element.contains(activeElement)) {
      activeElement.blur()
    }
    this.focused = null
    this.options.controls.enabled = true
    this.options.container.ownerDocument.documentElement.dataset["controlsEnabled"] = "true"
  }

  private readonly releaseFromOutside = (event: PointerEvent): void => {
    if (!(event.target instanceof Node)) return
    if (this.focused !== null && !this.focused.element.contains(event.target)) this.releaseFocus()
  }

  private updateVisibility(mounted: MountedScreen): void {
    mounted.surface.anchor.getWorldPosition(this.screenPosition)
    mounted.surface.anchor.getWorldQuaternion(this.quaternion)
    this.options.camera.getWorldPosition(this.cameraPosition)
    this.normal.set(0, 0, 1).applyQuaternion(this.quaternion)
    const facing =
      this.normal.dot(
        this.direction.copy(this.cameraPosition).sub(this.screenPosition).normalize(),
      ) > 0.04
    const visible = mounted.session.isPowered && facing && !this.isOccluded(mounted)
    mounted.object.visible = visible
    if (mounted.element.dataset["visible"] !== String(visible))
      mounted.element.dataset["visible"] = String(visible)
  }

  private isOccluded(mounted: MountedScreen): boolean {
    const direction = this.direction.copy(this.screenPosition).sub(this.cameraPosition)
    const screenDistance = direction.length()
    this.raycaster.set(this.cameraPosition, direction.normalize())
    this.raycaster.far = Math.max(0, screenDistance - 0.08)
    this.intersections.length = 0
    this.visibilityChecks++
    this.raycaster.intersectObjects(mounted.occluders, false, this.intersections)
    const blocker = this.intersections[0]
    return blocker !== undefined && blocker.distance < screenDistance - 0.08
  }

  private refreshOccluders(): void {
    for (const mounted of this.mounted.values()) {
      mounted.occluders.length = 0
      for (const asset of this.options.stage.assets) {
        if (asset !== mounted.asset) mounted.occluders.push(...asset.selectable)
      }
    }
    this.spatialDirty = true
    this.options.invalidate?.()
  }

  private forAsset(assetId: AssetInstanceId): readonly MountedScreen[] {
    return [...this.mounted.values()].filter(
      (mounted) => mounted.asset.instanceId.value === assetId.value,
    )
  }

  private requireMounted(assetId: AssetInstanceId, targetScreenId: ScreenId): MountedScreen {
    const mounted = this.mounted.get(this.key(assetId, targetScreenId))
    if (mounted === undefined) {
      throw new Error(`Screen is not mounted: ${assetId.value}/${targetScreenId.value}`)
    }
    return mounted
  }

  private key(assetId: AssetInstanceId, targetScreenId: ScreenId): string {
    return `${assetId.value}:${targetScreenId.value}`
  }
}
