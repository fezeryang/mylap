import type { Object3D, Vector3 } from "three"

export const PART_IDS = [
  "rear-shell",
  "metal-chassis",
  "clear-bumper",
  "front-stack",
  "rear-glass",
  "chassis-left-rail",
  "chassis-right-rail",
  "front-bezel",
  "display-glass",
  "screen-ui",
  "front-camera",
  "left-controls",
  "top-button",
  "middle-button",
  "bottom-button",
  "bottom-hardware",
  "usb-port",
  "left-speaker-array",
  "right-speaker-array",
  "neon-rim",
] as const

export type PartId = (typeof PART_IDS)[number]

const PART_ID_SET: ReadonlySet<string> = new Set(PART_IDS)

export function explodedPosition(origin: Vector3, factor: number): Vector3 {
  return origin.clone().multiplyScalar(factor)
}

function isPartId(value: unknown): value is PartId {
  return typeof value === "string" && PART_ID_SET.has(value)
}

export function resolvePartId(object: Object3D): PartId | null {
  let current: Object3D | null = object
  while (current !== null) {
    const candidate: unknown = current.userData["partId"]
    if (isPartId(candidate)) return candidate
    current = current.parent
  }
  return null
}
