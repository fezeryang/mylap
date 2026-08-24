import type { Material } from "three"
import {
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  type Group,
  Mesh,
  Shape,
} from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

export const namedMesh = (name: string, geometry: BufferGeometry, material: Material): Mesh => {
  const mesh = new Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export const roundedBox = (
  name: string,
  width: number,
  height: number,
  depth: number,
  radius: number,
  material: Material,
): Mesh => namedMesh(name, new RoundedBoxGeometry(width, height, depth, 3, radius), material)

export const chamferedPlate = (
  name: string,
  width: number,
  height: number,
  depth: number,
  cut: number,
  material: Material,
): Mesh => {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const shape = new Shape()
  shape.moveTo(-halfWidth + cut, -halfHeight)
  shape.lineTo(halfWidth - cut, -halfHeight)
  shape.lineTo(halfWidth, -halfHeight + cut)
  shape.lineTo(halfWidth, halfHeight - cut)
  shape.lineTo(halfWidth - cut, halfHeight)
  shape.lineTo(-halfWidth + cut, halfHeight)
  shape.lineTo(-halfWidth, halfHeight - cut)
  shape.lineTo(-halfWidth, -halfHeight + cut)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.08,
    bevelThickness: 0.06,
    curveSegments: 2,
    depth,
  })
  geometry.translate(0, 0, -depth / 2)
  return namedMesh(name, geometry, material)
}

export const addLightBar = (
  parent: Group,
  name: string,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  material: Material,
): Mesh => {
  const mesh = roundedBox(name, scale[0], scale[1], scale[2], Math.min(...scale) * 0.35, material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.userData["explodeWithParent"] = true
  parent.add(mesh)
  return mesh
}

export const addScrew = (
  parent: Group,
  name: string,
  x: number,
  y: number,
  z: number,
  material: Material,
): Mesh => {
  const screw = namedMesh(name, new CylinderGeometry(0.075, 0.075, 0.045, 16), material)
  screw.position.set(x, y, z)
  screw.userData["explodeWithParent"] = true
  parent.add(screw)
  return screw
}
