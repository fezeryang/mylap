import { describe, expect, test } from "bun:test"
import { type BufferGeometry, type Material, Mesh } from "three"

import { createNeonCyberphoneModel } from "./createPhoneModel"
import { PART_IDS } from "./parts"

describe("createNeonCyberphoneModel", () => {
  test("Given the authored phone, when created, then parts, screen, explosion, and resources are model-owned", () => {
    const model = createNeonCyberphoneModel()
    const descendantGeometries = new Set<BufferGeometry>()
    const descendantMaterials = new Set<Material>()

    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      descendantGeometries.add(object.geometry)
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        descendantMaterials.add(material)
      })
    })

    expect([...model.partGroups.keys()]).toEqual([
      "rear-shell",
      "metal-chassis",
      "clear-bumper",
      "front-stack",
      "rear-glass",
      "chassis-left-rail",
      "chassis-right-rail",
      "front-bezel",
      "display-glass",
      "screen-ui",
      "front-camera",
      "neon-rim",
      "left-controls",
      "top-button",
      "middle-button",
      "bottom-button",
      "bottom-hardware",
      "usb-port",
      "left-speaker-array",
      "right-speaker-array",
    ])
    expect(new Set(model.partGroups.keys())).toEqual(new Set(PART_IDS))
    const screenPart = model.partGroups.get("screen-ui")
    if (screenPart === undefined) throw new Error("Phone model omitted the screen-ui part")
    expect(model.screenAnchor).toBe(screenPart)
    expect(model.getManifest().parts.map((part) => part.id)).toEqual([...model.partGroups.keys()])
    expect(new Set(model.resources.geometries)).toEqual(descendantGeometries)
    expect(new Set(model.resources.materials)).toEqual(descendantMaterials)
    expect(model.resources.geometries).toHaveLength(descendantGeometries.size)
    expect(model.resources.materials).toHaveLength(descendantMaterials.size)

    const screenHome = model.screenAnchor.position.clone()
    model.setExplosion(2.1)
    expect(model.screenAnchor.position.distanceTo(screenHome)).toBeGreaterThan(1)
    model.setExplosion(1)
    expect(model.screenAnchor.position.distanceTo(screenHome)).toBeLessThan(0.000_001)

    model.dispose()
  })

  test("Given shared model resources, when disposed repeatedly, then every unique resource disposes exactly once", () => {
    const model = createNeonCyberphoneModel()
    let geometryDisposals = 0
    let materialDisposals = 0
    model.resources.geometries.forEach((geometry) => {
      geometry.addEventListener("dispose", () => {
        geometryDisposals += 1
      })
    })
    model.resources.materials.forEach((material) => {
      material.addEventListener("dispose", () => {
        materialDisposals += 1
      })
    })

    model.dispose()
    model.dispose()

    expect(geometryDisposals).toBe(model.resources.geometries.length)
    expect(materialDisposals).toBe(model.resources.materials.length)
  })
})
