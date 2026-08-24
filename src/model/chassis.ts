import { type Group, Vector3 } from "three"

import { addLightBar, addScrew, chamferedPlate, roundedBox } from "./geometry"
import type { CyberdeckMaterials } from "./materials"
import type { PartBuilder } from "./part-builder"

export type ChassisBuild = {
  readonly lower: Group
  readonly upper: Group
}

const buildEdgeArmor = (
  lower: Group,
  builder: PartBuilder,
  materials: CyberdeckMaterials,
  side: "left" | "right",
): void => {
  const sign = side === "left" ? -1 : 1
  const id = `edge-armor-${side}`
  const armor = builder.create(id, lower, new Vector3(sign * 5.28, 0, 0), 0.45)
  const rail = chamferedPlate(`${id}-rail`, 5.7, 0.82, 0.48, 0.24, materials.armor)
  rail.rotation.y = Math.PI / 2
  armor.add(rail)
  ;[-2.28, -0.72, 0.84, 2.35].forEach((z, index) => {
    const block = roundedBox(`${id}-block-${index}`, 0.62, 0.84, 0.76, 0.13, materials.pearlEdge)
    block.position.set(sign * 0.08, 0.02, z)
    block.userData["explodeWithParent"] = true
    armor.add(block)
  })
}

export const buildChassis = (
  root: Group,
  builder: PartBuilder,
  materials: CyberdeckMaterials,
): ChassisBuild => {
  const lower = builder.create("lower-chassis", root, new Vector3(0, 0, 0), 0.35)
  lower.add(roundedBox("lower-shell", 10.95, 0.58, 6.25, 0.3, materials.pearl))
  const underside = roundedBox("lower-dark-seam", 10.18, 0.2, 5.9, 0.24, materials.dark)
  underside.position.y = -0.43
  underside.userData["explodeWithParent"] = true
  lower.add(underside)

  const upper = builder.create("upper-deck", lower, new Vector3(0, 0.4, -0.12), 0.3)
  upper.add(roundedBox("upper-pearl-deck", 10.05, 0.25, 5.52, 0.24, materials.pearlEdge))
  const keyboardWell = roundedBox("keyboard-well-recess", 8.35, 0.13, 4.05, 0.18, materials.cavity)
  keyboardWell.position.set(-0.58, 0.15, -0.38)
  keyboardWell.userData["explodeWithParent"] = true
  upper.add(keyboardWell)

  buildEdgeArmor(lower, builder, materials, "left")
  buildEdgeArmor(lower, builder, materials, "right")

  const bumper = builder.create("front-bumper", lower, new Vector3(0, -0.1, -3.15), 0.55)
  bumper.add(chamferedPlate("front-bumper-center", 10.45, 0.72, 0.42, 0.34, materials.pearlEdge))
  const bumperInset = roundedBox("front-bumper-inset", 4.8, 0.3, 0.12, 0.05, materials.dark)
  bumperInset.position.z = -0.28
  bumperInset.userData["explodeWithParent"] = true
  bumper.add(bumperInset)

  const leftMount = builder.create(
    "handle-left-mount",
    lower,
    new Vector3(-2.15, -0.35, -3.48),
    0.7,
  )
  leftMount.add(roundedBox("handle-left-bracket", 0.95, 0.8, 0.92, 0.17, materials.pearlEdge))
  const rightMount = builder.create(
    "handle-right-mount",
    lower,
    new Vector3(2.15, -0.35, -3.48),
    0.7,
  )
  rightMount.add(roundedBox("handle-right-bracket", 0.95, 0.8, 0.92, 0.17, materials.pearlEdge))

  const ports = builder.create("port-detail-system", lower, new Vector3(0, -0.2, -3.34), 0.95)
  ;[-4.1, -3.45, 3.2, 4.05].forEach((x, index) => {
    const width = index === 2 ? 0.58 : 0.42
    const port = roundedBox(`front-port-${index}`, width, 0.2, 0.12, 0.035, materials.cavity)
    port.position.x = x
    port.userData["explodeWithParent"] = true
    ports.add(port)
  })

  const vents = builder.create("rear-vent-bank", upper, new Vector3(0, 0.18, 2.14), 0.5)
  const ventBacking = roundedBox("rear-vent-backing", 6.5, 0.09, 0.65, 0.08, materials.armor)
  vents.add(ventBacking)
  const slots = builder.create("vent-slot-system", vents, new Vector3(0, 0.075, 0), 0.4)
  for (let index = -15; index <= 15; index += 1) {
    const slot = roundedBox(`rear-slot-${index}`, 0.13, 0.055, 0.43, 0.025, materials.cavity)
    slot.position.x = index * 0.2
    slot.rotation.z = index % 2 === 0 ? 0.04 : -0.04
    slot.userData["explodeWithParent"] = true
    slots.add(slot)
  }
  ;[-3.55, 3.55].forEach((x, sideIndex) => {
    const speaker = roundedBox(`deck-speaker-${sideIndex}`, 2.15, 0.08, 0.58, 0.08, materials.armor)
    speaker.position.set(x, 0.12, -0.03)
    speaker.userData["explodeWithParent"] = true
    vents.add(speaker)
    for (let index = -7; index <= 7; index += 1) {
      const slot = roundedBox(
        `speaker-${sideIndex}-slot-${index}`,
        0.07,
        0.045,
        0.42,
        0.018,
        materials.cavity,
      )
      slot.position.set(x + index * 0.13, 0.17, -0.03)
      slot.userData["explodeWithParent"] = true
      vents.add(slot)
    }
  })

  const lights = builder.create("light-rail-system", root, new Vector3(0, 0, 0), 1.1)
  addLightBar(lights, "front-cyan-rail", [-3.9, -0.42, -3.24], [2.0, 0.08, 0.09], materials.cyan)
  addLightBar(
    lights,
    "front-violet-rail",
    [-1.3, -0.42, -3.24],
    [2.35, 0.08, 0.09],
    materials.violet,
  )
  addLightBar(
    lights,
    "front-magenta-rail",
    [1.35, -0.42, -3.24],
    [2.35, 0.08, 0.09],
    materials.magenta,
  )
  addLightBar(
    lights,
    "front-right-cyan-rail",
    [4.1, -0.42, -3.24],
    [1.8, 0.08, 0.09],
    materials.cyan,
  )
  addLightBar(
    lights,
    "handle-left-light",
    [-2.15, -0.72, -3.78],
    [0.45, 0.09, 0.08],
    materials.magenta,
  )
  addLightBar(
    lights,
    "handle-right-light",
    [2.15, -0.72, -3.78],
    [0.45, 0.09, 0.08],
    materials.cyan,
  )

  const fasteners = builder.create("fastener-system", root, new Vector3(0, 0, 0), 1.25)
  ;[-4.85, 4.85].forEach((x) => {
    ;[-2.72, 2.72].forEach((z) => {
      addScrew(fasteners, `base-screw-${x}-${z}`, x, 0.52, z, materials.hardware)
    })
  })
  ;[-3.8, -1.25, 1.25, 3.8].forEach((x) => {
    addScrew(fasteners, `front-screw-${x}`, x, 0.54, -2.82, materials.hardware)
  })
  return { lower, upper }
}
