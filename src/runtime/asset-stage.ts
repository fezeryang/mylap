import type { Object3D, Scene } from "three"

import type { AssetPlacement, StageAsset } from "./asset-contracts"
import type { AssetRegistry } from "./asset-registry"
import type { AssetInstanceId } from "./ids"

export class DuplicateAssetInstanceError extends Error {
  constructor(readonly instanceId: AssetInstanceId) {
    super(`Asset instance is already mounted: ${instanceId.value}`)
    this.name = "DuplicateAssetInstanceError"
  }
}

export class UnknownAssetInstanceError extends Error {
  constructor(readonly instanceId: AssetInstanceId) {
    super(`Asset instance is not mounted: ${instanceId.value}`)
    this.name = "UnknownAssetInstanceError"
  }
}

export type AssetStageEvent =
  | { readonly asset: StageAsset; readonly kind: "asset-added" }
  | { readonly asset: StageAsset; readonly kind: "asset-removed" }
  | { readonly asset: StageAsset | null; readonly kind: "active-changed" }

export type AssetStageListener = (event: AssetStageEvent) => void

export class AssetStage {
  private activeAsset: StageAsset | null = null
  private readonly instances = new Map<string, StageAsset>()
  private readonly listeners = new Set<AssetStageListener>()

  constructor(
    private readonly scene: Scene,
    private readonly registry: AssetRegistry,
  ) {}

  get active(): StageAsset | null {
    return this.activeAsset
  }

  get assets(): readonly StageAsset[] {
    return [...this.instances.values()]
  }

  mount(placement: AssetPlacement): StageAsset {
    if (this.instances.has(placement.instanceId.value)) {
      throw new DuplicateAssetInstanceError(placement.instanceId)
    }
    const asset = this.registry.resolve(placement.typeId).create(placement.instanceId)
    asset.root.position.set(...placement.position)
    asset.root.rotation.set(...placement.rotation)
    asset.root.scale.setScalar(placement.scale)
    this.instances.set(placement.instanceId.value, asset)
    this.scene.add(asset.root)
    this.emit({ asset, kind: "asset-added" })
    if (this.activeAsset === null) this.setActive(asset)
    return asset
  }

  activate(instanceId: AssetInstanceId): void {
    const asset = this.instances.get(instanceId.value)
    if (asset === undefined) throw new UnknownAssetInstanceError(instanceId)
    this.setActive(asset)
  }

  activateFromObject(object: Object3D): StageAsset | null {
    const asset = this.findOwner(object)
    if (asset !== null) this.setActive(asset)
    return asset
  }

  findOwner(object: Object3D): StageAsset | null {
    let cursor: Object3D | null = object
    while (cursor !== null) {
      const asset = this.assets.find((candidate) => candidate.root === cursor)
      if (asset !== undefined) return asset
      cursor = cursor.parent
    }
    return null
  }

  remove(instanceId: AssetInstanceId): void {
    const asset = this.instances.get(instanceId.value)
    if (asset === undefined) throw new UnknownAssetInstanceError(instanceId)
    this.instances.delete(instanceId.value)
    this.scene.remove(asset.root)
    asset.dispose()
    this.emit({ asset, kind: "asset-removed" })
    if (this.activeAsset === asset) this.setActive(this.assets[0] ?? null)
  }

  subscribe(listener: AssetStageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(deltaSeconds: number): void {
    this.instances.forEach((asset) => {
      asset.update(deltaSeconds)
    })
  }

  dispose(): void {
    const instanceIds = this.assets.map((asset) => asset.instanceId)
    instanceIds.forEach((instanceId) => {
      this.remove(instanceId)
    })
    this.listeners.clear()
  }

  private setActive(asset: StageAsset | null): void {
    if (this.activeAsset === asset) return
    this.activeAsset = asset
    this.emit({ asset, kind: "active-changed" })
  }

  private emit(event: AssetStageEvent): void {
    this.listeners.forEach((listener) => {
      listener(event)
    })
  }
}
