import { CylinderGeometry, Mesh, PlaneGeometry } from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { createRoundedFrameGeometry } from "./geometry"
import type { PartDefinition, PhoneMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export function createShellParts(materials: PhoneMaterials): readonly PartDefinition[] {
  const rearShell = createPart({ id: "rear-shell", explodeDirection: [0, 0, -1] })
  addPartMesh(rearShell, new RoundedBoxGeometry(7, 14.5, 0.26, 8, 0.92), materials.rearGlass)
  rearShell.group.position.z = -0.3
  rearShell.home.copy(rearShell.group.position)

  const rearGlass = createPart({ id: "rear-glass", explodeDirection: [0, 0, -1.3] })
  addPartMesh(rearGlass, new RoundedBoxGeometry(6.76, 14.22, 0.1, 8, 0.84), materials.rearGlass)
  rearGlass.group.position.z = -0.51
  rearGlass.home.copy(rearGlass.group.position)

  const chassis = createPart({ id: "metal-chassis", explodeDirection: [0, 0, -0.42] })
  addPartMesh(
    chassis,
    createRoundedFrameGeometry({
      width: 7.16,
      height: 14.7,
      radius: 1.04,
      inset: 0.24,
      depth: 0.56,
      bevel: 0.065,
    }),
    materials.metal,
  )

  const bumper = createPart({ id: "clear-bumper", explodeDirection: [0, 0, -0.72] })
  addPartMesh(
    bumper,
    createRoundedFrameGeometry({
      width: 7.5,
      height: 15.02,
      radius: 1.12,
      inset: 0.18,
      depth: 0.66,
      bevel: 0.07,
    }),
    materials.clearBumper,
  )
  bumper.group.position.z = -0.03
  bumper.home.copy(bumper.group.position)

  const frontStack = createPart({ id: "front-stack", explodeDirection: [0, 0, 0.68] })

  const leftRail = createPart({
    id: "chassis-left-rail",
    position: [-3.51, 0, 0],
    explodeDirection: [-1, 0, 0],
  })
  addPartMesh(leftRail, new RoundedBoxGeometry(0.3, 12.95, 0.56, 5, 0.14), materials.metal)

  const rightRail = createPart({
    id: "chassis-right-rail",
    position: [3.51, 0, 0],
    explodeDirection: [1, 0, 0],
  })
  addPartMesh(rightRail, new RoundedBoxGeometry(0.3, 12.95, 0.56, 5, 0.14), materials.metal)

  const bezel = createPart({ id: "front-bezel", explodeDirection: [0, 0, 0.92] })
  addPartMesh(
    bezel,
    createRoundedFrameGeometry({
      width: 6.9,
      height: 14.42,
      radius: 0.92,
      inset: 0.18,
      depth: 0.16,
      bevel: 0.045,
    }),
    materials.bezel,
  )
  bezel.group.position.z = 0.42
  bezel.home.copy(bezel.group.position)

  const screen = createPart({ id: "screen-ui", explodeDirection: [0, 0, 1.5] })
  screen.group.position.z = 0.54
  screen.home.copy(screen.group.position)

  const glass = createPart({ id: "display-glass", explodeDirection: [0, 0, 1.2] })
  addPartMesh(glass, new RoundedBoxGeometry(6.57, 14.08, 0.1, 8, 0.78), materials.displayGlass)
  glass.group.position.z = 0.62
  glass.home.copy(glass.group.position)

  const camera = createPart({
    id: "front-camera",
    position: [0, 5.91, 0.7],
    explodeDirection: [0, 0.25, 1.8],
  })
  const cameraBody = addPartMesh(camera, new CylinderGeometry(0.2, 0.2, 0.08, 32), materials.bezel)
  cameraBody.rotation.x = Math.PI / 2
  const lens = addReliefMesh(
    camera,
    new CylinderGeometry(0.09, 0.09, 0.09, 24),
    materials.opticalGlass,
  )
  lens.rotation.x = Math.PI / 2
  lens.position.z = 0.045

  const rim = createNeonRim(materials)
  return [
    rearShell,
    chassis,
    bumper,
    frontStack,
    rearGlass,
    leftRail,
    rightRail,
    bezel,
    glass,
    screen,
    camera,
    rim,
  ]
}

function createNeonRim(materials: PhoneMaterials): PartDefinition {
  const rim = createPart({ id: "neon-rim", explodeDirection: [0, 0, 1.05] })
  rim.group.position.z = 0.68
  rim.home.copy(rim.group.position)

  const vertical = new RoundedBoxGeometry(0.065, 12.42, 0.055, 3, 0.03)
  const horizontal = new RoundedBoxGeometry(5.14, 0.065, 0.055, 3, 0.03)
  const left = addReliefMesh(rim, vertical, materials.magentaLight)
  left.position.x = -3.23
  const right = addReliefMesh(rim, vertical, materials.cyanLight)
  right.position.x = 3.23
  const top = addReliefMesh(rim, horizontal, materials.magentaLight)
  top.position.y = 6.92
  const bottom = addReliefMesh(rim, horizontal, materials.cyanLight)
  bottom.position.y = -6.92

  const sheen = new Mesh(new PlaneGeometry(2.4, 12.7), materials.displayGlass)
  sheen.name = "display-glass-diagonal-sheen"
  sheen.position.set(-1.55, 0, -0.05)
  sheen.rotation.z = -0.16
  sheen.userData["explodeWithParent"] = true
  rim.group.add(sheen)
  return rim
}
