import type { Group, Material, Vector3 } from "three"
import type { PartId } from "./parts"

export type PhoneMaterials = {
  readonly rearGlass: Material
  readonly metal: Material
  readonly clearBumper: Material
  readonly bezel: Material
  readonly displayGlass: Material
  readonly opticalGlass: Material
  readonly cyanLight: Material
  readonly magentaLight: Material
  readonly violetLight: Material
}

export type PhoneModel = {
  readonly root: Group
  readonly screenAnchor: Group
  readonly partGroups: ReadonlyMap<PartId, Group>
  readonly setExplosion: (factor: number) => void
  readonly selectPart: (partId: PartId | null) => void
  readonly getManifest: () => PartsManifest
}

export type PartRecord = {
  readonly name: PartId
  readonly kind: "part"
  readonly module: PartId
  readonly triangles: number
  readonly id: PartId
  readonly meshNames: readonly string[]
  readonly homePosition: readonly [number, number, number]
}

export type PartsManifest = {
  readonly schemaVersion: 1
  readonly parts: readonly PartRecord[]
  readonly unnamedMeshes: 0
  readonly integralMeshes: number
}

export type PartDefinition = {
  readonly id: PartId
  readonly group: Group
  readonly home: Vector3
  readonly explodeDirection: Vector3
}
