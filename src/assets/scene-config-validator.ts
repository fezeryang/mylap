import type { AssetPlacement } from "../runtime/asset-contracts"
import { assetInstanceId, assetTypeId } from "../runtime/ids"

export type DesktopInstanceId =
  | "computer-main"
  | "desk-main"
  | "phone-main"
  | "radio-main"
  | "bulletin-board-main"
export type DesktopAssetType = "cyberdeck" | "cyber-desk" | "phone" | "ratio" | "bulletin-board"
export type DesktopSocketLabel =
  | "socket-desktop-asset-1"
  | "socket-desktop-asset-2"
  | "socket-desktop-asset-3"
  | "socket-desktop-asset-4"
  | "environment"
export type DesktopVector = readonly [number, number, number]
export type DesktopTargetFootprint =
  | { readonly kind: "authored" }
  | { readonly kind: "bounded"; readonly x: number; readonly z: number }

export type DesktopPlacementSpec = {
  readonly instanceId: DesktopInstanceId
  readonly typeId: DesktopAssetType
  readonly socketLabel: DesktopSocketLabel
  readonly outerPosition: DesktopVector
  readonly outerRotation: DesktopVector
  readonly outerScale: 1
  readonly innerAuthoredTransform: {
    readonly appliesOnce: true
    readonly position: DesktopVector
    readonly rotation: DesktopVector
  }
  readonly targetFootprint: DesktopTargetFootprint
  readonly selectable: boolean
  readonly role: "device" | "environment"
}

export const DESKTOP_TABLETOP_BOUNDS = {
  maxX: 6,
  maxZ: 2.9,
  minX: -6,
  minZ: -2.9,
} as const
export const DESKTOP_TABLETOP_SIZE = { x: 12, z: 5.8 } as const
// Bottom of the authored desk's feet after its adapter translation.
export const DESKTOP_FLOOR_Y = -4.673366053709811
export const BOARD_FOOTPRINT = { x: 9, z: 4 } as const
export const BOARD_BASE_Y = -0.8

export type DesktopSceneValidationCode =
  | "invalid-input"
  | "duplicate-instance"
  | "missing-instance"
  | "unexpected-instance"
  | "order-mismatch"
  | "invalid-placement"
  | "desk-metadata"
  | "outside-tabletop"
  | "overlap"

export class DesktopSceneValidationError extends Error {
  constructor(
    readonly code: DesktopSceneValidationCode,
    readonly detail: string,
  ) {
    super(`Invalid desktop scene (${code}): ${detail}`)
    this.name = "DesktopSceneValidationError"
  }
}

const ORDER = [
  "computer-main",
  "desk-main",
  "phone-main",
  "radio-main",
  "bulletin-board-main",
] as const
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const field = (record: Record<string, unknown>, key: string): unknown => record[key]
const isInstanceId = (value: string): value is DesktopInstanceId =>
  value === "computer-main" ||
  value === "desk-main" ||
  value === "phone-main" ||
  value === "radio-main" ||
  value === "bulletin-board-main"
const isAssetType = (value: string): value is DesktopAssetType =>
  value === "cyberdeck" ||
  value === "cyber-desk" ||
  value === "phone" ||
  value === "ratio" ||
  value === "bulletin-board"
const isSocket = (value: string): value is DesktopSocketLabel =>
  value === "environment" ||
  value === "socket-desktop-asset-1" ||
  value === "socket-desktop-asset-2" ||
  value === "socket-desktop-asset-3" ||
  value === "socket-desktop-asset-4"
const invalid = (detail: string): DesktopSceneValidationError =>
  new DesktopSceneValidationError("invalid-input", detail)

const vector = (value: unknown, name: string): DesktopVector => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw invalid(`${name} must be a finite three-component vector`)
  }
  const [x, y, z] = value
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    throw invalid(`${name} must contain only numbers`)
  }
  return [x, y, z]
}

const parsePlacement = (value: unknown, index: number): DesktopPlacementSpec => {
  if (!isRecord(value)) throw invalid(`placement ${index} must be an object`)
  const instanceId = field(value, "instanceId")
  const typeId = field(value, "typeId")
  const socketLabel = field(value, "socketLabel")
  const outerScale = field(value, "outerScale")
  const selectable = field(value, "selectable")
  const role = field(value, "role")
  const transform = field(value, "innerAuthoredTransform")
  const footprint = field(value, "targetFootprint")
  if (typeof instanceId !== "string" || !isInstanceId(instanceId))
    throw invalid("invalid instance ID")
  if (typeof typeId !== "string" || !isAssetType(typeId)) throw invalid("invalid type ID")
  if (typeof socketLabel !== "string" || !isSocket(socketLabel))
    throw invalid("invalid socket label")
  if (outerScale !== 1 || typeof selectable !== "boolean")
    throw invalid(`placement ${index} has invalid metadata`)
  if (role !== "device" && role !== "environment")
    throw invalid(`placement ${index} has invalid role`)
  if (!isRecord(transform) || field(transform, "appliesOnce") !== true)
    throw invalid("inner transform must apply once")
  if (!isRecord(footprint)) throw invalid("target footprint is invalid")
  const kind = field(footprint, "kind")
  let targetFootprint: DesktopTargetFootprint
  if (kind === "authored") {
    targetFootprint = { kind: "authored" }
  } else {
    const x = field(footprint, "x")
    const z = field(footprint, "z")
    if (
      kind !== "bounded" ||
      typeof x !== "number" ||
      typeof z !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x <= 0 ||
      z <= 0
    ) {
      throw invalid("target footprint is invalid")
    }
    targetFootprint = { kind: "bounded", x, z }
  }
  return {
    instanceId,
    typeId,
    socketLabel,
    outerPosition: vector(field(value, "outerPosition"), "outer position"),
    outerRotation: vector(field(value, "outerRotation"), "outer rotation"),
    outerScale: 1,
    innerAuthoredTransform: {
      appliesOnce: true,
      position: vector(field(transform, "position"), "inner position"),
      rotation: vector(field(transform, "rotation"), "inner rotation"),
    },
    targetFootprint,
    selectable,
    role,
  }
}

const expectedType = (id: DesktopInstanceId): DesktopAssetType => {
  switch (id) {
    case "computer-main":
      return "cyberdeck"
    case "desk-main":
      return "cyber-desk"
    case "phone-main":
      return "phone"
    case "radio-main":
      return "ratio"
    case "bulletin-board-main":
      return "bulletin-board"
  }
}
const expectedSocket = (id: DesktopInstanceId): DesktopSocketLabel => {
  switch (id) {
    case "computer-main":
      return "socket-desktop-asset-2"
    case "desk-main":
      return "environment"
    case "phone-main":
      return "socket-desktop-asset-1"
    case "radio-main":
      return "socket-desktop-asset-3"
    case "bulletin-board-main":
      return "environment"
  }
}
const expectedFootprint = (id: DesktopInstanceId): DesktopTargetFootprint => {
  switch (id) {
    case "computer-main":
      return { kind: "bounded", x: 4.2, z: 2.2 }
    case "desk-main":
      return { kind: "authored" }
    case "phone-main":
      return { kind: "bounded", x: 0.9, z: 2.2 }
    case "radio-main":
      return { kind: "bounded", x: 1.7, z: 1.2 }
    case "bulletin-board-main":
      return { kind: "bounded", ...BOARD_FOOTPRINT }
  }
}
const sameFootprint = (left: DesktopTargetFootprint, right: DesktopTargetFootprint): boolean =>
  left.kind === right.kind &&
  (left.kind === "authored" ||
    (right.kind === "bounded" && left.x === right.x && left.z === right.z))
const bounds = (
  placement: DesktopPlacementSpec,
): readonly [number, number, number, number] | null => {
  if (placement.targetFootprint.kind === "authored") return null
  const [x, , z] = placement.outerPosition
  return [
    x - placement.targetFootprint.x / 2,
    x + placement.targetFootprint.x / 2,
    z - placement.targetFootprint.z / 2,
    z + placement.targetFootprint.z / 2,
  ]
}

const assertLayout = (placements: readonly DesktopPlacementSpec[]): void => {
  const devices = placements.flatMap((placement) => {
    const footprint = bounds(placement)
    return footprint === null || placement.instanceId === "bulletin-board-main"
      ? []
      : [{ id: placement.instanceId, footprint }]
  })
  const board = placements.find(({ instanceId }) => instanceId === "bulletin-board-main")
  if (board !== undefined && board.targetFootprint.kind === "bounded") {
    const yaw = board.outerRotation[1]
    const halfWidth =
      (Math.abs(Math.cos(yaw)) * board.targetFootprint.x +
        Math.abs(Math.sin(yaw)) * board.targetFootprint.z) /
      2
    // Keep a generous side gap and elevate the board above the desk's lower structure.
    if (
      Math.abs(board.outerPosition[0]) - halfWidth < 8.8 ||
      board.outerPosition[1] < BOARD_BASE_Y ||
      board.outerRotation[0] !== 0 ||
      board.outerRotation[2] !== 0 ||
      board.role !== "environment"
    ) {
      throw new DesktopSceneValidationError(
        "invalid-placement",
        "bulletin-board-main must be elevated upright beside the desk, with a generous side gap",
      )
    }
  }
  for (const device of devices) {
    const [minX, maxX, minZ, maxZ] = device.footprint
    if (
      minX < DESKTOP_TABLETOP_BOUNDS.minX ||
      maxX > DESKTOP_TABLETOP_BOUNDS.maxX ||
      minZ < DESKTOP_TABLETOP_BOUNDS.minZ ||
      maxZ > DESKTOP_TABLETOP_BOUNDS.maxZ
    ) {
      throw new DesktopSceneValidationError(
        "outside-tabletop",
        `${device.id} is outside the tabletop bounds`,
      )
    }
  }
  for (let first = 0; first < devices.length; first += 1) {
    const left = devices[first]
    if (left === undefined) continue
    for (let second = first + 1; second < devices.length; second += 1) {
      const right = devices[second]
      if (right === undefined) continue
      const separated =
        left.footprint[1] <= right.footprint[0] ||
        right.footprint[1] <= left.footprint[0] ||
        left.footprint[3] <= right.footprint[2] ||
        right.footprint[3] <= left.footprint[2]
      if (!separated)
        throw new DesktopSceneValidationError("overlap", `${left.id} overlaps ${right.id}`)
    }
  }
}

export const validateDesktopSceneSpecification = (
  candidate: unknown,
): readonly DesktopPlacementSpec[] => {
  if (!Array.isArray(candidate)) throw invalid("scene specification must be an array")
  const placements = candidate.map(parsePlacement)
  const seen = new Set<string>()
  for (const placement of placements) {
    if (seen.has(placement.instanceId))
      throw new DesktopSceneValidationError(
        "duplicate-instance",
        `instance ID is repeated: ${placement.instanceId}`,
      )
    seen.add(placement.instanceId)
  }
  const missing = ORDER.find((id) => !seen.has(id))
  if (missing !== undefined)
    throw new DesktopSceneValidationError(
      "missing-instance",
      `required instance is missing: ${missing}`,
    )
  if (placements.length !== ORDER.length)
    throw new DesktopSceneValidationError("unexpected-instance", "scene has too many instances")
  if (placements.some((placement, index) => placement.instanceId !== ORDER[index]))
    throw new DesktopSceneValidationError("order-mismatch", "instances are not in the locked order")
  for (const placement of placements) {
    if (
      placement.typeId !== expectedType(placement.instanceId) ||
      placement.socketLabel !== expectedSocket(placement.instanceId) ||
      !sameFootprint(placement.targetFootprint, expectedFootprint(placement.instanceId))
    ) {
      throw new DesktopSceneValidationError(
        "invalid-placement",
        `${placement.instanceId} has incorrect type or socket`,
      )
    }
  }
  const desk = placements.find(({ instanceId }) => instanceId === "desk-main")
  if (
    desk === undefined ||
    desk.typeId !== "cyber-desk" ||
    desk.socketLabel !== "environment" ||
    desk.role !== "environment" ||
    desk.selectable ||
    desk.targetFootprint.kind !== "authored" ||
    desk.outerPosition.some((value) => value !== 0) ||
    desk.outerRotation.some((value) => value !== 0) ||
    desk.innerAuthoredTransform.position[0] !== 0 ||
    desk.innerAuthoredTransform.position[1] !== -2.4775 ||
    desk.innerAuthoredTransform.position[2] !== 0 ||
    desk.innerAuthoredTransform.rotation.some((value) => value !== 0)
  ) {
    throw new DesktopSceneValidationError(
      "desk-metadata",
      "desk-main must be a non-selectable authored environment at the outer origin",
    )
  }
  assertLayout(placements)
  return placements
}

export const compileDesktopPlacement = (placement: DesktopPlacementSpec): AssetPlacement => ({
  instanceId: assetInstanceId(placement.instanceId),
  position: placement.outerPosition,
  rotation: placement.outerRotation,
  scale: placement.outerScale,
  typeId: assetTypeId(placement.typeId),
})
export const compileDesktopScenePlacements = (
  specification: readonly DesktopPlacementSpec[] = desktopSceneSpecification,
): readonly AssetPlacement[] => specification.map(compileDesktopPlacement)

export const desktopSceneSpecification = [
  {
    instanceId: "computer-main",
    typeId: "cyberdeck",
    socketLabel: "socket-desktop-asset-2",
    outerPosition: [0, 0.05, 0],
    outerRotation: [0, -0.05, 0],
    outerScale: 1,
    innerAuthoredTransform: { appliesOnce: true, position: [0, 0, 0], rotation: [0, 0, 0] },
    targetFootprint: { kind: "bounded", x: 4.2, z: 2.2 },
    selectable: true,
    role: "device",
  },
  {
    instanceId: "desk-main",
    typeId: "cyber-desk",
    socketLabel: "environment",
    outerPosition: [0, 0, 0],
    outerRotation: [0, 0, 0],
    outerScale: 1,
    innerAuthoredTransform: { appliesOnce: true, position: [0, -2.4775, 0], rotation: [0, 0, 0] },
    targetFootprint: { kind: "authored" },
    selectable: false,
    role: "environment",
  },
  {
    instanceId: "phone-main",
    typeId: "phone",
    socketLabel: "socket-desktop-asset-1",
    outerPosition: [-3, 0.05, 0],
    outerRotation: [0, 0, 0],
    outerScale: 1,
    innerAuthoredTransform: {
      appliesOnce: true,
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
    targetFootprint: { kind: "bounded", x: 0.9, z: 2.2 },
    selectable: true,
    role: "device",
  },
  {
    instanceId: "radio-main",
    typeId: "ratio",
    socketLabel: "socket-desktop-asset-3",
    outerPosition: [3, 0.05, 0],
    outerRotation: [0, Math.PI, 0],
    outerScale: 1,
    innerAuthoredTransform: { appliesOnce: true, position: [0, 0, 0], rotation: [0, 0, 0] },
    targetFootprint: { kind: "bounded", x: 1.7, z: 1.2 },
    selectable: true,
    role: "device",
  },
  {
    instanceId: "bulletin-board-main",
    typeId: "bulletin-board",
    socketLabel: "environment",
    outerPosition: [-13.8, BOARD_BASE_Y, 1.1],
    outerRotation: [0, Math.PI - 0.15, 0],
    outerScale: 1,
    innerAuthoredTransform: { appliesOnce: true, position: [0, 0, 0], rotation: [0, 0, 0] },
    targetFootprint: { kind: "bounded", ...BOARD_FOOTPRINT },
    selectable: true,
    role: "environment",
  },
] as const satisfies readonly DesktopPlacementSpec[]
export const DESKTOP_SCENE_SPECIFICATION = desktopSceneSpecification
export type DesktopSceneSpec = readonly DesktopPlacementSpec[]
export const desktopSceneSpec = desktopSceneSpecification
export const validateDesktopScene = validateDesktopSceneSpecification
