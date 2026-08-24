import { type BufferGeometry, Group, type Material, Mesh, Vector3 } from "three"
import type { PartDefinition } from "./modelTypes"
import type { PartId } from "./parts"

type PartConfig = {
  readonly id: PartId
  readonly position?: readonly [number, number, number]
  readonly explodeDirection: readonly [number, number, number]
}

export function createPart(config: PartConfig): PartDefinition {
  const group = new Group()
  group.name = config.id
  group.userData["partId"] = config.id
  const position = config.position ?? [0, 0, 0]
  group.position.set(position[0], position[1], position[2])
  return {
    id: config.id,
    group,
    home: group.position.clone(),
    explodeDirection: new Vector3(...config.explodeDirection),
  }
}

export function addPartMesh(
  part: PartDefinition,
  geometry: BufferGeometry,
  material: Material,
): Mesh {
  const mesh = new Mesh(geometry, material)
  mesh.name = `${part.id}-mesh`
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData["partId"] = part.id
  part.group.add(mesh)
  return mesh
}

export function addReliefMesh(
  part: PartDefinition,
  geometry: BufferGeometry,
  material: Material,
): Mesh {
  const mesh = new Mesh(geometry, material)
  mesh.name = `${part.id}-relief-${part.group.children.length}`
  mesh.castShadow = true
  mesh.userData["explodeWithParent"] = true
  part.group.add(mesh)
  return mesh
}
