import { BoxGeometry } from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { createRoundedFrameGeometry } from "./geometry"
import type { PartDefinition, PhoneMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export function createHardwareParts(materials: PhoneMaterials): readonly PartDefinition[] {
  const controls = createPart({
    id: "left-controls",
    position: [-3.68, 2.5, 0.04],
    explodeDirection: [-1.4, 0.25, 0.25],
  })

  const top = createButton(
    { id: "top-button", position: [-3.75, 4.18, 0.05], height: 0.72 },
    materials,
  )
  const middle = createButton(
    { id: "middle-button", position: [-3.79, 2.64, 0.06], height: 1.22 },
    materials,
  )
  for (let index = -5; index <= 5; index += 1) {
    const ridge = addReliefMesh(middle, new BoxGeometry(0.05, 0.075, 0.34), materials.violetLight)
    ridge.position.set(-0.13, index * 0.1, 0)
    ridge.rotation.z = 0.22
  }
  const bottom = createButton(
    { id: "bottom-button", position: [-3.75, 1.2, 0.05], height: 0.62 },
    materials,
  )

  const hardware = createPart({
    id: "bottom-hardware",
    position: [0, -7.34, 0.02],
    explodeDirection: [0, -1.2, 0.25],
  })
  addPartMesh(hardware, new RoundedBoxGeometry(6.52, 0.34, 0.7, 4, 0.14), materials.metal)

  const port = createPart({
    id: "usb-port",
    position: [0, -7.48, 0.68],
    explodeDirection: [0, -1.7, 0.5],
  })
  addPartMesh(
    port,
    createRoundedFrameGeometry({
      width: 1.5,
      height: 0.4,
      radius: 0.19,
      inset: 0.1,
      depth: 0.12,
      bevel: 0.025,
    }),
    materials.metal,
  )
  const portCavity = addReliefMesh(
    port,
    new RoundedBoxGeometry(1.25, 0.21, 0.045, 5, 0.09),
    materials.bezel,
  )
  portCavity.position.set(0, 0, -0.04)
  const portTongue = addReliefMesh(port, new BoxGeometry(0.62, 0.1, 0.07), materials.violetLight)
  portTongue.position.set(0, 0, 0.04)

  const leftSpeaker = createSpeaker("left-speaker-array", -1.82, materials)
  const rightSpeaker = createSpeaker("right-speaker-array", 1.82, materials)
  return [controls, top, middle, bottom, hardware, port, leftSpeaker, rightSpeaker]
}

type ButtonConfig = {
  readonly id: "top-button" | "middle-button" | "bottom-button"
  readonly position: readonly [number, number, number]
  readonly height: number
}

function createButton(config: ButtonConfig, materials: PhoneMaterials): PartDefinition {
  const part = createPart({
    id: config.id,
    position: config.position,
    explodeDirection: [-1.6, 0, 0.25],
  })
  addPartMesh(part, new RoundedBoxGeometry(0.26, config.height, 0.46, 4, 0.11), materials.metal)
  const accent = addReliefMesh(
    part,
    new RoundedBoxGeometry(0.05, config.height * 0.74, 0.28, 3, 0.025),
    config.id === "bottom-button" ? materials.cyanLight : materials.magentaLight,
  )
  accent.position.x = -0.15
  return part
}

function createSpeaker(
  id: "left-speaker-array" | "right-speaker-array",
  centreX: number,
  materials: PhoneMaterials,
): PartDefinition {
  const direction = id === "left-speaker-array" ? -1 : 1
  const part = createPart({
    id,
    position: [centreX, -7.54, 0.66],
    explodeDirection: [direction, -1.45, 0.45],
  })
  for (let index = -2; index <= 2; index += 1) {
    const hole = addReliefMesh(
      part,
      new RoundedBoxGeometry(0.3, 0.11, 0.055, 3, 0.04),
      materials.bezel,
    )
    hole.position.x = index * 0.36
  }
  return part
}
