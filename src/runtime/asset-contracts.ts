import type { Group, Mesh, MeshPhysicalMaterial, Object3D, Vector3 } from "three"

import type { KeyboardCode } from "../model/part-layout"
import type { AssetInstanceId, AssetTypeId, ScreenAppId, ScreenId } from "./ids"

export type AssetPart = {
  readonly id: string
  readonly node: Group
  readonly authoredPosition: Vector3
  readonly centralClearance: number
}

export type ScreenSize = {
  readonly height: number
  readonly width: number
}

export type ScreenSurface = {
  readonly anchor: Object3D
  readonly defaultAppId: ScreenAppId
  readonly hitProxy: Object3D
  readonly occlusionRoot: Object3D
  readonly pixelSize: ScreenSize
  readonly screenId: ScreenId
  readonly worldSize: ScreenSize
}

export type KeyboardBinding = {
  readonly code: KeyboardCode
  readonly glowIntensity: number
  readonly keycap: Mesh
  readonly material: MeshPhysicalMaterial
  readonly restPosition: Vector3
  readonly travel: number
}

export interface AssetKeyboard {
  readonly bindings: readonly KeyboardBinding[]
  readonly pressedCodes: readonly KeyboardCode[]
  press(code: string): boolean
  release(code: string): boolean
  releaseAll(): void
  update(deltaSeconds: number): void
}

export interface StageAsset {
  readonly explosion: number
  readonly instanceId: AssetInstanceId
  readonly keyboard?: AssetKeyboard
  readonly parts: readonly AssetPart[]
  readonly root: Group
  readonly screens: readonly ScreenSurface[]
  readonly selectable: readonly Object3D[]
  readonly typeId: AssetTypeId
  dispose(): void
  setExplosion(factor: number): void
  update(deltaSeconds: number): void
}

export interface SceneAssetDefinition {
  readonly typeId: AssetTypeId
  create(instanceId: AssetInstanceId): StageAsset
}

export type AssetPlacement = {
  readonly instanceId: AssetInstanceId
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number]
  readonly scale: number
  readonly typeId: AssetTypeId
}
