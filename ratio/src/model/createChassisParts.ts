import { CylinderGeometry } from "three"
import { flatBox, roundedBox } from "./geometry"
import type { PartDefinition, RadioMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export function createChassisParts(materials: RadioMaterials): readonly PartDefinition[] {
  const chassis = createPart({ id: "chassis-shell", explodeDirection: [0, 0, -0.2] })
  addPartMesh(chassis, roundedBox(12, 7, 3.15, 0.5), materials.pearl, "chassis-primary-shell")
  const lowerBand = addReliefMesh(
    chassis,
    roundedBox(11.45, 0.3, 3.28, 0.11),
    materials.pearlDark,
    "chassis-lower-band",
  )
  lowerBand.position.y = -3.33
  const topBand = addReliefMesh(
    chassis,
    roundedBox(10.9, 0.22, 3.23, 0.1),
    materials.chrome,
    "chassis-top-band",
  )
  topBand.position.y = 3.32

  const rear = createPart({
    id: "rear-shell",
    position: [0, 0, -1.56],
    explodeDirection: [0, 0, -1],
  })
  addPartMesh(rear, roundedBox(11.3, 6.4, 0.3, 0.36), materials.dark)
  for (let index = 0; index < 8; index += 1) {
    const vent = addReliefMesh(
      rear,
      flatBox(0.08, 1.65, 0.08),
      materials.rubber,
      `rear-vent-${index}`,
    )
    vent.position.set(-1.05 + index * 0.3, 0.4, -0.19)
  }

  const fascia = createPart({
    id: "front-fascia",
    position: [0, 0, 1.57],
    explodeDirection: [0, 0, 1],
  })
  addPartMesh(fascia, roundedBox(11.45, 6.45, 0.25, 0.38), materials.pearl)
  const innerPanel = addReliefMesh(
    fascia,
    roundedBox(10.85, 5.75, 0.12, 0.3),
    materials.pearlDark,
    "fascia-inner-step",
  )
  innerPanel.position.z = 0.16

  const topDeck = createPart({
    id: "top-deck",
    position: [0, 3.42, 0.18],
    explodeDirection: [0, 1, 0],
  })
  addPartMesh(topDeck, roundedBox(9.6, 0.32, 2.35, 0.14), materials.pearl)
  const inset = addReliefMesh(
    topDeck,
    roundedBox(7.4, 0.12, 1.45, 0.08),
    materials.pearlDark,
    "top-inset",
  )
  inset.position.y = 0.18

  const side = createPart({
    id: "left-side-module",
    position: [-5.87, -0.15, 0.2],
    explodeDirection: [-1, 0, 0],
  })
  addPartMesh(side, roundedBox(0.3, 4.9, 2.45, 0.14), materials.pearlDark)
  const rail = addReliefMesh(
    side,
    roundedBox(0.12, 3.25, 0.78, 0.06),
    materials.cyanLight,
    "left-light-rail",
  )
  rail.position.set(-0.18, -0.2, 0.48)
  const magentaRail = addReliefMesh(
    side,
    roundedBox(0.08, 2.72, 0.2, 0.04),
    materials.magentaLight,
    "left-light-rail-magenta",
  )
  magentaRail.position.set(-0.23, -0.2, 0.86)
  for (let index = 0; index < 4; index += 1) {
    const vent = addReliefMesh(
      side,
      flatBox(0.1, 0.15, 0.72),
      materials.dark,
      `left-io-slot-${index}`,
    )
    vent.position.set(-0.2, 1.65 - index * 0.62, -0.42)
  }

  const guards = createPart({ id: "corner-guards", explodeDirection: [0, 0, 0.75] })
  const guardPositions = [
    [-5.62, 3.13],
    [5.62, 3.13],
    [-5.62, -3.13],
    [5.62, -3.13],
  ] as const
  guardPositions.forEach(([x, y], index) => {
    const guard = addPartMesh(
      guards,
      roundedBox(0.62, 0.62, 3.28, 0.18),
      materials.chrome,
      `corner-guard-${index}`,
    )
    guard.position.set(x, y, 0)
  })

  const feet = createPart({
    id: "rubber-feet",
    position: [0, -3.64, 0],
    explodeDirection: [0, -1, 0],
  })
  for (const x of [-4.3, 4.3]) {
    for (const z of [-1.05, 1.05]) {
      const foot = addPartMesh(feet, new CylinderGeometry(0.32, 0.36, 0.18, 20), materials.rubber)
      foot.position.set(x, 0, z)
    }
  }

  return [chassis, rear, fascia, topDeck, side, guards, feet]
}
