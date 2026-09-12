import type { Object3D, Vector3 } from "three"

export const PART_IDS = [
  "chassis-shell",
  "rear-shell",
  "front-fascia",
  "top-deck",
  "left-side-module",
  "corner-guards",
  "tuner-bezel",
  "tuner-glass",
  "speaker-surround",
  "speaker-grille",
  "speaker-cone",
  "cassette-bezel",
  "cassette-glass",
  "cassette-reels",
  "tuning-dial",
  "bass-slider",
  "treble-slider",
  "volume-slider",
  "transport-controls",
  "top-preset-controls",
  "carry-handle",
  "left-handle-hinge",
  "right-handle-hinge",
  "aerial-swivel",
  "telescopic-aerial",
  "dish-base",
  "dish-antenna",
  "dish-feed",
  "rubber-feet",
] as const

export type PartId = (typeof PART_IDS)[number]

const PART_ID_SET: ReadonlySet<string> = new Set(PART_IDS)

function isPartId(value: unknown): value is PartId {
  return typeof value === "string" && PART_ID_SET.has(value)
}

export function explodedPosition(origin: Vector3, factor: number): Vector3 {
  return origin.clone().multiplyScalar(Math.max(1, factor))
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
