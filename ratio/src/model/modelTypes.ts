import type { Group, Material, Object3D, Vector3 } from "three"
import type { PartId } from "./parts"

export type RadioMaterials = {
  readonly pearl: Material
  readonly pearlDark: Material
  readonly chrome: Material
  readonly dark: Material
  readonly grille: Material
  readonly glass: Material
  readonly cassetteGlass: Material
  readonly lavender: Material
  readonly rubber: Material
  readonly cyanLight: Material
  readonly blueLight: Material
  readonly violetLight: Material
  readonly magentaLight: Material
  readonly redLight: Material
  readonly dish: Material
}

export type PartDefinition = {
  readonly id: PartId
  readonly group: Group
  readonly home: Vector3
  readonly explodeDirection: Vector3
}

export type RadioAnimationState = {
  readonly playback: "stopped" | "playing" | "paused" | "buffering" | "error"
  readonly currentTimeSeconds: number
  readonly spectrum: readonly number[]
}

export type RadioScreenAnchors = {
  readonly tuner: Group
  readonly cassette: Group
}

export type PartRecord = {
  readonly id: PartId
  readonly name: PartId
  readonly kind: "part"
  readonly module: PartId
  readonly triangles: number
  readonly meshNames: readonly string[]
  readonly homePosition: readonly [number, number, number]
}

export type PartsManifest = {
  readonly schemaVersion: 1
  readonly parts: readonly PartRecord[]
  readonly unnamedMeshes: 0
  readonly integralMeshes: number
}

export type RadioModel = {
  readonly root: Group
  readonly screens: RadioScreenAnchors
  readonly partGroups: ReadonlyMap<PartId, Group>
  readonly selectables: readonly Object3D[]
  readonly setExplosion: (factor: number) => void
  readonly selectPart: (partId: PartId | null) => void
  readonly setTuning: (normalized: number) => void
  readonly setSlider: (id: "bass-slider" | "treble-slider" | "volume-slider", value: number) => void
  readonly update: (deltaSeconds: number, state: RadioAnimationState) => void
  readonly getManifest: () => PartsManifest
}
