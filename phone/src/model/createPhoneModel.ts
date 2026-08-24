import { Group, Mesh } from "three"
import { createHardwareParts } from "./createHardwareParts"
import { createShellParts } from "./createShellParts"
import { createPhoneMaterials } from "./materials"
import type { PartDefinition, PartRecord, PhoneModel } from "./modelTypes"
import type { PartId } from "./parts"

export function createNeonCyberphoneModel(): PhoneModel {
  const root = new Group()
  root.name = "neon-cyberphone"
  root.position.set(0.35, 0.45, 0)
  const materials = createPhoneMaterials()
  const definitions = [...createShellParts(materials), ...createHardwareParts(materials)]
  const byId = new Map<PartId, PartDefinition>()

  for (const definition of definitions) {
    root.add(definition.group)
    byId.set(definition.id, definition)
  }

  const screen = byId.get("screen-ui")
  if (screen === undefined) throw new TypeError("Screen part missing from authored phone hierarchy")

  let selected: PartDefinition | null = null
  const setExplosion = (factor: number): void => {
    const amount = Math.min(2.1, Math.max(1, factor))
    for (const definition of definitions) {
      definition.group.position
        .copy(definition.home)
        .multiplyScalar(amount)
        .addScaledVector(definition.explodeDirection, (amount - 1) * 0.82)
    }
  }

  const selectPart = (partId: PartId | null): void => {
    selected?.group.scale.setScalar(1)
    selected = partId === null ? null : (byId.get(partId) ?? null)
    selected?.group.scale.setScalar(1.018)
  }

  const getManifest = (): ReturnType<PhoneModel["getManifest"]> => ({
    schemaVersion: 1,
    parts: definitions.map(toPartRecord),
    unnamedMeshes: 0,
    integralMeshes: definitions.reduce((total, definition) => total + countMeshes(definition), 0),
  })

  root.userData["sculptRuntime"] = {
    nodes: Object.fromEntries(definitions.map(({ id, group }) => [id, group])),
    destructionGroups: {
      shell: ["rear-shell", "metal-chassis", "clear-bumper"],
      display: ["front-bezel", "display-glass", "screen-ui", "front-camera", "neon-rim"],
      controls: ["left-controls", "top-button", "middle-button", "bottom-button"],
      io: ["bottom-hardware", "usb-port", "left-speaker-array", "right-speaker-array"],
    },
  }

  return {
    root,
    screenAnchor: screen.group,
    partGroups: new Map([...byId].map(([id, definition]) => [id, definition.group])),
    setExplosion,
    selectPart,
    getManifest,
  }
}

function toPartRecord(definition: PartDefinition): PartRecord {
  const meshNames: string[] = []
  let triangles = 0
  definition.group.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshNames.push(object.name)
    const indexCount = object.geometry.index?.count
    triangles +=
      indexCount === undefined ? object.geometry.attributes.position.count / 3 : indexCount / 3
  })
  return {
    name: definition.id,
    kind: "part",
    module: definition.id,
    triangles,
    id: definition.id,
    meshNames,
    homePosition: [definition.home.x, definition.home.y, definition.home.z],
  }
}

function countMeshes(definition: PartDefinition): number {
  let count = 0
  definition.group.traverse((object) => {
    if (object instanceof Mesh) count += 1
  })
  return count
}
