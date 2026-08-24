import type { Group, Object3D } from "three"

import type { AssetKeyboard, AssetPart, ScreenSurface } from "../runtime/asset-contracts"

export type ModelPart = AssetPart

export type BuiltSection = {
  readonly root: Group
  readonly parts: readonly ModelPart[]
}

export type CyberdeckModel = BuiltSection & {
  readonly keyboard: AssetKeyboard
  readonly screens: readonly ScreenSurface[]
  readonly selectable: readonly Object3D[]
}
