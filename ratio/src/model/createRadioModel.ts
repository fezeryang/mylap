import { Box3, Group, MathUtils, Mesh, Vector3 } from "three"
import { createChassisParts } from "./createChassisParts"
import { createFrontControlParts } from "./createFrontControlParts"
import { createFrontDisplayParts } from "./createFrontDisplayParts"
import { createTopParts } from "./createTopParts"
import { createRadioMaterials, disposeMaterial } from "./materials"
import type { PartDefinition, PartsManifest, RadioModel } from "./modelTypes"
import type { PartId } from "./parts"

export function createRadioModel(): RadioModel {
  const root = new Group()
  root.name = "retro-future-radio"
  const materials = createRadioMaterials()
  const displays = createFrontDisplayParts(materials)
  const controls = createFrontControlParts(materials)
  const top = createTopParts(materials)
  const definitions = [
    ...createChassisParts(materials),
    ...displays.definitions,
    ...controls.definitions,
    ...top.definitions,
  ]
  const partGroups = new Map<PartId, Group>()
  for (const definition of definitions) {
    partGroups.set(definition.id, definition.group)
    root.add(definition.group)
  }
  const selectables = definitions.flatMap((definition) => definition.group.children)
  let selectedPart: PartId | null = null
  let playbackPhase = 0
  root.userData["sculptRuntime"] = {
    nodes: definitions.map(({ id }) => id),
    sockets: ["tuner-screen", "cassette-screen"],
    destructionGroups: ["shell", "front-controls", "top-accessories"],
  }

  return {
    root,
    screens: { tuner: displays.tunerAnchor, cassette: displays.cassetteAnchor },
    partGroups,
    selectables,
    setExplosion(factor) {
      const amount = MathUtils.clamp(factor, 0, 1) * 2.25
      for (const definition of definitions) {
        definition.group.position
          .copy(definition.home)
          .addScaledVector(definition.explodeDirection, amount)
      }
    },
    selectPart(partId) {
      selectedPart = partId
      for (const definition of definitions)
        definition.group.scale.setScalar(definition.id === partId ? 1.035 : 1)
    },
    setTuning(normalized) {
      controls.tuningDial.rotation.z = MathUtils.lerp(
        -0.75,
        0.75,
        MathUtils.clamp(normalized, 0, 1),
      )
    },
    setSlider(id, value) {
      controls.sliderKnobs
        .get(id)
        ?.position.setY(MathUtils.lerp(-0.58, 0.58, MathUtils.clamp(value, 0, 1)))
    },
    update(deltaSeconds, state) {
      if (state.playback === "playing") playbackPhase += deltaSeconds
      for (const reel of displays.reelGroups)
        reel.rotation.z -= state.playback === "playing" ? deltaSeconds * 2.4 : 0
      top.dishPivot.rotation.y = -0.2 + Math.sin(playbackPhase * 0.42) * 0.12
      const cone = partGroups.get("speaker-cone")
      const energy =
        state.spectrum.reduce((sum, value) => sum + value, 0) / Math.max(1, state.spectrum.length)
      cone?.scale.setScalar(
        state.playback === "playing"
          ? 1 + energy * 0.018
          : selectedPart === "speaker-cone"
            ? 1.035
            : 1,
      )
    },
    getManifest: () => createManifest(definitions),
  }
}

function createManifest(definitions: readonly PartDefinition[]): PartsManifest {
  return {
    schemaVersion: 1,
    unnamedMeshes: 0,
    integralMeshes: 0,
    parts: definitions.map((definition) => {
      const meshNames: string[] = []
      let triangles = 0
      definition.group.traverse((object) => {
        if (!(object instanceof Mesh)) return
        meshNames.push(object.name)
        const index = object.geometry.index
        const position = object.geometry.getAttribute("position")
        triangles += index === null ? position.count / 3 : index.count / 3
      })
      return {
        id: definition.id,
        name: definition.id,
        kind: "part",
        module: definition.id,
        triangles: Math.round(triangles),
        meshNames,
        homePosition: definition.home.toArray() as [number, number, number],
      }
    }),
  }
}

export function disposeRadioModel(model: RadioModel): void {
  const materials = new Set<import("three").Material>()
  model.root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of meshMaterials) materials.add(material)
  })
  for (const material of materials) disposeMaterial(material)
  new Box3().setFromObject(model.root).getSize(new Vector3())
}
