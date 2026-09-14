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
  /** Read-only displays let physical controls below them receive native pointer input. */
  readonly interactive?: boolean
  readonly anchor: Object3D
  /** Optional DOM-plane correction when an authored asset is mounted back-to-front. */
  readonly cssRotationY?: number
  /** Use a camera-facing DOM plane for authored displays that are not normal to the camera. */
  readonly cssBillboard?: boolean
  readonly defaultAppId: ScreenAppId
  readonly depthOffset?: number
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
  readonly needsAnimation?: boolean
  readonly bindings: readonly KeyboardBinding[]
  readonly pressedCodes: readonly KeyboardCode[]
  press(code: string): boolean
  release(code: string): boolean
  releaseAll(): void
  update(deltaSeconds: number): void
}

export interface StageAsset {
  /** True only while instance-local visual animation needs another host frame. */
  readonly needsAnimation?: boolean
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
