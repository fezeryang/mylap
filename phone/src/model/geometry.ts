import { ExtrudeGeometry, Path, Shape } from "three"

type RoundedFrame = {
  readonly width: number
  readonly height: number
  readonly radius: number
  readonly inset: number
  readonly depth: number
  readonly bevel: number
}

function roundedRect(path: Shape | Path, width: number, height: number, radius: number): void {
  const halfWidth = width / 2
  const halfHeight = height / 2
  path.moveTo(-halfWidth + radius, -halfHeight)
  path.lineTo(halfWidth - radius, -halfHeight)
  path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius)
  path.lineTo(halfWidth, halfHeight - radius)
  path.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight)
  path.lineTo(-halfWidth + radius, halfHeight)
  path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius)
  path.lineTo(-halfWidth, -halfHeight + radius)
  path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight)
}

function roundedRectCounterClockwise(
  path: Path,
  width: number,
  height: number,
  radius: number,
): void {
  const halfWidth = width / 2
  const halfHeight = height / 2
  path.moveTo(-halfWidth + radius, -halfHeight)
  path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth, -halfHeight + radius)
  path.lineTo(-halfWidth, halfHeight - radius)
  path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth + radius, halfHeight)
  path.lineTo(halfWidth - radius, halfHeight)
  path.quadraticCurveTo(halfWidth, halfHeight, halfWidth, halfHeight - radius)
  path.lineTo(halfWidth, -halfHeight + radius)
  path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth - radius, -halfHeight)
  path.lineTo(-halfWidth + radius, -halfHeight)
}

export function createRoundedFrameGeometry(frame: RoundedFrame): ExtrudeGeometry {
  const shape = new Shape()
  roundedRect(shape, frame.width, frame.height, frame.radius)

  const hole = new Path()
  const innerWidth = frame.width - frame.inset * 2
  const innerHeight = frame.height - frame.inset * 2
  roundedRectCounterClockwise(
    hole,
    innerWidth,
    innerHeight,
    Math.max(0.08, frame.radius - frame.inset),
  )
  shape.holes.push(hole)

  const geometry = new ExtrudeGeometry(shape, {
    depth: frame.depth,
    bevelEnabled: true,
    bevelSize: frame.bevel,
    bevelThickness: frame.bevel,
    bevelSegments: 4,
    curveSegments: 18,
  })
  geometry.translate(0, 0, -frame.depth / 2)
  geometry.computeVertexNormals()
  return geometry
}
