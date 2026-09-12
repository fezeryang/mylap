import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, 4, radius)
}

export function tubeBetween(
  start: Vector3,
  end: Vector3,
  radius: number,
  material: Material,
  name: string,
): Mesh {
  const direction = end.clone().sub(start)
  const mesh = new Mesh(new CylinderGeometry(radius, radius, direction.length(), 20), material)
  mesh.name = name
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
  )
  mesh.castShadow = true
  return mesh
}

export function createDishGeometry(
  radius: number,
  depth: number,
  radialSegments = 64,
): BufferGeometry {
  const ringSegments = 18
  const positions: number[] = []
  const indices: number[] = []
  for (let ring = 0; ring <= ringSegments; ring += 1) {
    const radial = radius * (ring / ringSegments)
    const z = -depth * (radial / radius) ** 2
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2
      positions.push(Math.cos(angle) * radial, Math.sin(angle) * radial, z)
    }
  }
  const row = radialSegments + 1
  for (let ring = 0; ring < ringSegments; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const current = ring * row + segment
      const next = current + row
      indices.push(current, next, current + 1, current + 1, next, next + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createLabel(text: string, width: number, height: number, color: string): Mesh {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext("2d")
  if (context === null) throw new TypeError("Canvas 2D context unavailable for radio label")
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = color
  context.font = "600 62px Arial Narrow, sans-serif"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
  const mesh = new Mesh(new PlaneGeometry(width, height), material)
  mesh.name = `label-${text.toLowerCase().replaceAll(" ", "-")}`
  return mesh
}

export function flatBox(width: number, height: number, depth: number): BoxGeometry {
  return new BoxGeometry(width, height, depth)
}
