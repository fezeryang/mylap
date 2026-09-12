import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  RingGeometry,
  TorusGeometry,
} from "three"
import { createLabel, flatBox, roundedBox } from "./geometry"
import type { PartDefinition, RadioMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export type FrontDisplayParts = {
  readonly definitions: readonly PartDefinition[]
  readonly tunerAnchor: Group
  readonly cassetteAnchor: Group
  readonly reelGroups: readonly Group[]
}

export function createFrontDisplayParts(materials: RadioMaterials): FrontDisplayParts {
  const tunerBezel = createPart({
    id: "tuner-bezel",
    position: [0.45, 1.55, 1.82],
    explodeDirection: [0, 0.15, 1],
  })
  addPartMesh(tunerBezel, roundedBox(9.55, 1.9, 0.28, 0.18), materials.dark)
  const chromeStep = addReliefMesh(
    tunerBezel,
    roundedBox(9.22, 1.6, 0.13, 0.14),
    materials.chrome,
    "tuner-chrome-step",
  )
  chromeStep.position.z = 0.18
  const navyStep = addReliefMesh(
    tunerBezel,
    roundedBox(8.92, 1.38, 0.12, 0.11),
    materials.dark,
    "tuner-navy-step",
  )
  navyStep.position.z = 0.27

  const tunerGlass = createPart({
    id: "tuner-glass",
    position: [0.45, 1.55, 2.02],
    explodeDirection: [0, 0.12, 1.15],
  })
  addPartMesh(tunerGlass, roundedBox(8.65, 1.15, 0.08, 0.08), materials.glass)
  const tunerAnchor = new Group()
  tunerAnchor.name = "tuner-screen-anchor"
  tunerAnchor.position.z = 0.055
  tunerGlass.group.add(tunerAnchor)

  const speakerSurround = createPart({
    id: "speaker-surround",
    position: [-3.25, -1.35, 1.9],
    explodeDirection: [-0.8, -0.25, 1],
  })
  addPartMesh(speakerSurround, new TorusGeometry(1.72, 0.19, 16, 72), materials.chrome)
  addReliefMesh(
    speakerSurround,
    new TorusGeometry(1.53, 0.055, 10, 72),
    materials.magentaLight,
    "speaker-magenta-ring",
  )
  addReliefMesh(
    speakerSurround,
    new TorusGeometry(1.62, 0.045, 10, 72),
    materials.cyanLight,
    "speaker-cyan-ring",
  )

  const speakerGrille = createPart({
    id: "speaker-grille",
    position: [-3.25, -1.35, 1.91],
    explodeDirection: [-0.78, -0.2, 1.18],
  })
  const grillePlate = addPartMesh(
    speakerGrille,
    new CylinderGeometry(1.48, 1.48, 0.12, 72),
    materials.grille,
  )
  grillePlate.rotation.x = Math.PI / 2
  addSpeakerPerforations(speakerGrille, materials)

  const speakerCone = createPart({
    id: "speaker-cone",
    position: [-3.25, -1.35, 2.02],
    explodeDirection: [-0.72, -0.18, 1.35],
  })
  const hub = addPartMesh(speakerCone, new CylinderGeometry(0.53, 0.61, 0.16, 48), materials.dark)
  hub.rotation.x = Math.PI / 2
  addReliefMesh(
    speakerCone,
    new TorusGeometry(0.56, 0.035, 8, 48),
    materials.blueLight,
    "speaker-hub-light",
  )
  const radioLabel = createLabel("RADIO", 0.72, 0.2, "#aaa7ef")
  radioLabel.position.z = 0.12
  radioLabel.userData["explodeWithParent"] = true
  speakerCone.group.add(radioLabel)

  const cassetteBezel = createPart({
    id: "cassette-bezel",
    position: [1.05, -1.15, 1.86],
    explodeDirection: [0.15, -0.12, 1],
  })
  addPartMesh(cassetteBezel, roundedBox(3.05, 2.0, 0.26, 0.16), materials.dark)
  const cassetteChrome = addReliefMesh(
    cassetteBezel,
    roundedBox(2.78, 1.74, 0.12, 0.12),
    materials.chrome,
    "cassette-chrome-step",
  )
  cassetteChrome.position.z = 0.18

  const cassetteGlass = createPart({
    id: "cassette-glass",
    position: [1.05, -1.15, 2.08],
    explodeDirection: [0.15, -0.1, 1.22],
  })
  addPartMesh(cassetteGlass, roundedBox(2.48, 1.36, 0.07, 0.09), materials.cassetteGlass)
  const cassetteAnchor = new Group()
  cassetteAnchor.name = "cassette-screen-anchor"
  cassetteAnchor.position.z = 0.05
  cassetteGlass.group.add(cassetteAnchor)

  const cassetteReels = createPart({
    id: "cassette-reels",
    position: [1.05, -1.12, 1.99],
    explodeDirection: [0.14, -0.08, 1.35],
  })
  const reelGroups = [-0.67, 0.67].map((x, index) => {
    const reel = new Group()
    reel.name = `cassette-reel-${index}`
    reel.position.x = x
    const ring = new Mesh(new TorusGeometry(0.38, 0.08, 10, 36), materials.violetLight)
    ring.name = `cassette-reel-ring-${index}`
    const hubMesh = new Mesh(new RingGeometry(0.09, 0.17, 8), materials.dark)
    hubMesh.name = `cassette-reel-hub-${index}`
    hubMesh.position.z = 0.02
    reel.add(ring, hubMesh)
    cassetteReels.group.add(reel)
    return reel
  })
  const tape = addReliefMesh(
    cassetteReels,
    flatBox(1.3, 0.07, 0.03),
    materials.magentaLight,
    "cassette-tape",
  )
  tape.position.y = -0.39

  return {
    definitions: [
      tunerBezel,
      tunerGlass,
      speakerSurround,
      speakerGrille,
      speakerCone,
      cassetteBezel,
      cassetteGlass,
      cassetteReels,
    ],
    tunerAnchor,
    cassetteAnchor,
    reelGroups,
  }
}

function addSpeakerPerforations(part: PartDefinition, materials: RadioMaterials): void {
  const points: readonly (readonly [number, number])[] = Array.from({ length: 19 }, (_, row) =>
    Array.from({ length: 19 }, (_, column) => [(column - 9) * 0.145, (row - 9) * 0.145] as const),
  )
    .flat()
    .filter(([x, y]) => Math.hypot(x, y) < 1.33)
  const geometry = new CylinderGeometry(0.035, 0.035, 0.035, 10)
  geometry.rotateX(Math.PI / 2)
  const holes = new InstancedMesh(geometry, materials.dark, points.length)
  holes.name = "speaker-perforation-grid"
  holes.userData["partId"] = part.id
  const matrix = new Matrix4()
  points.forEach(([x, y], index) => {
    matrix.makeTranslation(x, y, 0.08)
    holes.setMatrixAt(index, matrix)
  })
  holes.instanceMatrix.needsUpdate = true
  part.group.add(holes)
}
