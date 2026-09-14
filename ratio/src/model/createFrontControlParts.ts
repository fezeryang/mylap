import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, TorusGeometry } from "three"
import { createLabel, roundedBox } from "./geometry"
import type { PartDefinition, RadioMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export type FrontControlParts = {
  readonly definitions: readonly PartDefinition[]
  readonly tuningDial: Group
  readonly sliderKnobs: ReadonlyMap<"bass-slider" | "treble-slider" | "volume-slider", Group>
}

export function createFrontControlParts(materials: RadioMaterials): FrontControlParts {
  const tuningDial = createPart({
    id: "tuning-dial",
    position: [4.23, -1.28, 1.97],
    explodeDirection: [0.72, -0.12, 1.12],
  })
  addPartMesh(tuningDial, new TorusGeometry(1.05, 0.12, 14, 72), materials.violetLight)
  addReliefMesh(
    tuningDial,
    new TorusGeometry(0.92, 0.09, 12, 72),
    materials.chrome,
    "tuning-knurled-wall",
  )
  const face = addPartMesh(tuningDial, new CylinderGeometry(0.83, 0.83, 0.22, 64), materials.chrome)
  face.rotation.x = Math.PI / 2
  face.position.z = 0.12
  addKnurling(tuningDial, materials)

  const sliderEntries = [
    { id: "bass-slider", x: 2.85, light: materials.magentaLight },
    { id: "treble-slider", x: 3.34, light: materials.cyanLight },
    { id: "volume-slider", x: 3.83, light: materials.violetLight },
  ] as const
  const sliderKnobs = new Map<"bass-slider" | "treble-slider" | "volume-slider", Group>()
  const sliderDefinitions = sliderEntries.map(({ id, x, light }, index) => {
    const slider = createPart({
      id,
      position: [x, -1.03, 1.94],
      explodeDirection: [0.5 + index * 0.08, -0.1, 1],
    })
    const track = addPartMesh(
      slider,
      roundedBox(0.22, 1.52, 0.12, 0.06),
      materials.dark,
      `${id}-track`,
    )
    const trackLight = addReliefMesh(
      slider,
      roundedBox(0.045, 1.32, 0.045, 0.018),
      light,
      `${id}-light-track`,
    )
    trackLight.position.z = 0.08
    const knob = new Group()
    knob.name = `${id}-knob`
    knob.position.set(0, id === "treble-slider" ? -0.12 : 0.28, 0.18)
    const knobMesh = addReliefMesh(
      slider,
      roundedBox(0.34, 0.24, 0.2, 0.05),
      materials.chrome,
      `${id}-knob-mesh`,
    )
    knob.add(knobMesh)
    slider.group.add(knob)
    slider.group.remove(knobMesh)
    sliderKnobs.set(id, knob)
    const label = createLabel(id.replace("-slider", "").toUpperCase(), 0.52, 0.14, "#11132e")
    label.position.set(0, 0.94, 0.14)
    slider.group.add(label)
    track.userData["controlId"] = id
    return slider
  })

  const transport = createPart({
    id: "transport-controls",
    position: [1.34, -2.62, 1.88],
    explodeDirection: [0.12, -0.75, 1],
  })
  const controls = [
    { label: "REC", color: materials.redLight },
    { label: "PLAY", color: materials.blueLight },
    { label: "STOP", color: materials.dark },
    { label: "REW", color: materials.dark },
    { label: "FF", color: materials.dark },
    { label: "PAUSE", color: materials.dark },
  ] as const
  controls.forEach(({ label, color }, index) => {
    const button = addPartMesh(
      transport,
      roundedBox(0.72, 0.62, 0.36, 0.08),
      index === 0 ? materials.pearl : materials.pearlDark,
      `transport-${label.toLowerCase()}`,
    )
    button.position.set((index - 2.5) * 0.76, 0, 0)
    button.userData["controlId"] = label.toLowerCase()
    const light = addReliefMesh(
      transport,
      new CylinderGeometry(0.055, 0.055, 0.03, 16),
      color,
      `transport-${label}-light`,
    )
    light.rotation.x = Math.PI / 2
    light.position.set((index - 2.5) * 0.76, 0.13, 0.21)
    light.userData["controlId"] = label.toLowerCase()
    const labelMesh = createLabel(label, 0.45, 0.12, "#17172e")
    labelMesh.position.set((index - 2.5) * 0.76, -0.17, 0.22)
    labelMesh.userData["controlId"] = label.toLowerCase()
    labelMesh.name = `transport-${label.toLowerCase()}-label`
    transport.group.add(labelMesh)
  })

  return {
    definitions: [tuningDial, ...sliderDefinitions, transport],
    tuningDial: tuningDial.group,
    sliderKnobs,
  }
}

function addKnurling(part: PartDefinition, materials: RadioMaterials): void {
  const count = 48
  const geometry = new BoxGeometry(0.055, 0.16, 0.06)
  const knurls = new InstancedMesh(geometry, materials.pearlDark, count)
  knurls.name = "tuning-dial-knurl-field"
  knurls.userData["partId"] = part.id
  const matrix = new Matrix4()
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    matrix.makeRotationZ(angle)
    matrix.setPosition(Math.cos(angle) * 0.96, Math.sin(angle) * 0.96, 0.06)
    knurls.setMatrixAt(index, matrix)
  }
  knurls.instanceMatrix.needsUpdate = true
  part.group.add(knurls)
}
