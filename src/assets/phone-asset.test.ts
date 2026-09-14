import { describe, expect, test } from "bun:test"
import { Box3, Group, Mesh, PlaneGeometry, Vector3 } from "three"

import { createNeonCyberphoneModel } from "../../phone/src/model/createPhoneModel"
import type { PhoneModel } from "../../phone/src/model/modelTypes"
import { PART_IDS } from "../../phone/src/model/parts"
import { assetInstanceId } from "../runtime/ids"
import {
  createPhoneAssetDefinition,
  InvalidPhoneModelError,
  PHONE_ASSET_TYPE_ID,
  PHONE_TARGET_FOOTPRINT,
  phoneAssetDefinition,
} from "./phone-asset"

const boundsSize = (root: Group): Vector3 => new Box3().setFromObject(root).getSize(new Vector3())

describe("phoneAssetDefinition", () => {
  test("Given the authored phone, when adapted, then the stable normalized stage contract is exact", () => {
    const asset = phoneAssetDefinition.create(assetInstanceId("phone-main"))
    const bounds = new Box3().setFromObject(asset.root)
    const size = bounds.getSize(new Vector3())
    const authoredContent = asset.root.children[0]

    expect(asset.typeId).toEqual(PHONE_ASSET_TYPE_ID)
    expect(asset.instanceId).toEqual(assetInstanceId("phone-main"))
    expect(asset.root.position.toArray()).toEqual([0, 0, 0])
    expect(asset.root.rotation.toArray()).toEqual([0, 0, 0, "XYZ"])
    expect(asset.root.scale.toArray()).toEqual([1, 1, 1])
    expect(authoredContent).toBeInstanceOf(Group)
    if (!(authoredContent instanceof Group)) throw new Error("Phone authored content is missing")
    expect(authoredContent.rotation.x).toBeCloseTo(-Math.PI / 2, 12)
    expect(authoredContent.scale.x).toBeCloseTo(authoredContent.scale.y, 12)
    expect(authoredContent.scale.y).toBeCloseTo(authoredContent.scale.z, 12)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(size.x).toBeLessThanOrEqual(PHONE_TARGET_FOOTPRINT.x + 0.001)
    expect(size.z).toBeLessThanOrEqual(PHONE_TARGET_FOOTPRINT.z + 0.001)
    expect(
      Math.abs(size.x - PHONE_TARGET_FOOTPRINT.x) <= 0.001 ||
        Math.abs(size.z - PHONE_TARGET_FOOTPRINT.z) <= 0.001,
    ).toBe(true)
    expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0, 6)
    expect((bounds.min.z + bounds.max.z) / 2).toBeCloseTo(0, 6)
    expect(asset.parts.map((part) => part.id)).toEqual([...PART_IDS])
    expect(asset.parts.every((part) => asset.root.getObjectById(part.node.id) === part.node)).toBe(
      true,
    )
    expect(asset.selectable.length).toBeGreaterThan(asset.parts.length)
    expect(asset.selectable.every((object) => object instanceof Mesh)).toBe(true)
    expect(asset.keyboard).toBeUndefined()

    asset.dispose()
  })

  test("Given the phone screen, when adapted and normalized, then its app, hit, occlusion, and +Y alignment metadata are exact", () => {
    const asset = phoneAssetDefinition.create(assetInstanceId("phone-main"))
    const surface = asset.screens[0]
    if (surface === undefined) throw new Error("Phone screen surface is missing")
    asset.root.updateMatrixWorld(true)
    const screenNormal = new Vector3(0, 0, 1).transformDirection(surface.anchor.matrixWorld)

    expect(asset.screens).toHaveLength(1)
    expect(surface.screenId.value).toBe("phone-primary")
    expect(surface.defaultAppId.value).toBe("phone-shell")
    expect(surface.pixelSize).toEqual({ height: 2560 / 3, width: 400 })
    expect(surface.worldSize).toEqual({ height: 13.7216, width: 6.432 })
    expect(surface.worldSize.width / surface.pixelSize.width).toBeCloseTo(
      surface.worldSize.height / surface.pixelSize.height,
      10,
    )
    expect(surface.hitProxy.position.z).toBe(surface.depthOffset ?? 0.025)
    expect(surface.anchor.position.z + (surface.depthOffset ?? 0)).toBeGreaterThan(0.67)
    expect(surface.anchor.name).toBe("screen-ui")
    expect(surface.hitProxy.parent).toBe(surface.anchor)
    expect(surface.hitProxy).toBeInstanceOf(Mesh)
    if (!(surface.hitProxy instanceof Mesh)) throw new Error("Phone hit proxy is not a mesh")
    expect(surface.hitProxy.geometry).toBeInstanceOf(PlaneGeometry)
    expect(surface.hitProxy.userData["screenHitProxy"]).toBe(true)
    expect(surface.hitProxy.userData["explodeWithParent"]).toBe(true)
    expect(surface.occlusionRoot.name).toBe("neon-cyberphone")
    expect(asset.selectable).toContain(surface.hitProxy)
    expect(screenNormal.x).toBeCloseTo(0, 6)
    expect(screenNormal.y).toBeCloseTo(1, 6)
    expect(screenNormal.z).toBeCloseTo(0, 6)

    asset.dispose()
  })

  test("Given host explosion values, when set including out-of-range and non-finite inputs, then host and authored factors map deterministically", () => {
    const modelFactors: number[] = []
    const definition = createPhoneAssetDefinition(() => {
      const model = createNeonCyberphoneModel()
      const setExplosion = model.setExplosion
      Object.defineProperty(model, "setExplosion", {
        value: (factor: number): void => {
          modelFactors.push(factor)
          setExplosion(factor)
        },
      })
      return model
    })
    const asset = definition.create(assetInstanceId("phone-main"))

    for (const factor of [0, 0.5, 1, 0, -2, 4, Number.NaN, Number.POSITIVE_INFINITY]) {
      asset.setExplosion(factor)
    }

    expect(modelFactors).toEqual([1, 1.55, 2.1, 1, 1, 2.1, 1, 2.1])
    expect(asset.explosion).toBe(1)
    asset.update(999)
    expect(asset.explosion).toBe(1)

    asset.dispose()
  })

  test("Given an adapted phone, when disposed repeatedly, then model and adapter resources dispose exactly once", () => {
    let modelDisposals = 0
    let hitProxyGeometryDisposals = 0
    let hitProxyMaterialDisposals = 0
    const definition = createPhoneAssetDefinition(() => {
      const model = createNeonCyberphoneModel()
      const dispose = model.dispose
      Object.defineProperty(model, "dispose", {
        value: (): void => {
          modelDisposals += 1
          dispose()
        },
      })
      return model
    })
    const asset = definition.create(assetInstanceId("phone-main"))
    const hitProxy = asset.screens[0]?.hitProxy
    if (!(hitProxy instanceof Mesh)) throw new Error("Phone hit proxy is missing")
    hitProxy.geometry.addEventListener("dispose", () => {
      hitProxyGeometryDisposals += 1
    })
    const materials = Array.isArray(hitProxy.material) ? hitProxy.material : [hitProxy.material]
    materials.forEach((material) => {
      material.addEventListener("dispose", () => {
        hitProxyMaterialDisposals += 1
      })
    })

    asset.dispose()
    asset.dispose()

    expect(modelDisposals).toBe(1)
    expect(hitProxyGeometryDisposals).toBe(1)
    expect(hitProxyMaterialDisposals).toBe(materials.length)
  })

  test("Given malformed model parts, resources, or bounds, when creation fails, then each model is cleaned once", () => {
    const disposalCounts: number[] = []
    const malformedModels: PhoneModel[] = [
      (() => {
        const model = createNeonCyberphoneModel()
        const partGroups = new Map(model.partGroups)
        partGroups.delete("rear-shell")
        return { ...model, partGroups }
      })(),
      (() => {
        const model = createNeonCyberphoneModel()
        return { ...model, resources: { ...model.resources, geometries: [] } }
      })(),
      (() => {
        const model = createNeonCyberphoneModel()
        model.root.position.x = Number.POSITIVE_INFINITY
        return model
      })(),
    ]

    malformedModels.forEach((model, index) => {
      const dispose = model.dispose
      disposalCounts[index] = 0
      Object.defineProperty(model, "dispose", {
        value: (): void => {
          disposalCounts[index] = (disposalCounts[index] ?? 0) + 1
          dispose()
        },
      })
      const definition = createPhoneAssetDefinition(() => model)
      expect(() => definition.create(assetInstanceId("phone-main"))).toThrow(InvalidPhoneModelError)
    })

    expect(disposalCounts).toEqual([1, 1, 1])
  })

  test("Given the root adapter source, when inspected, then it imports only the phone model boundary", async () => {
    const source = await Bun.file(`${import.meta.dir}/phone-asset.ts`).text()

    expect(source).toContain("../../phone/src/model/createPhoneModel")
    expect(source).not.toMatch(/phone\/src\/(?:main|viewer|ui|runtime|model\/generated)/)
  })

  test("Given a no-op update, when invoked, then normalized phone bounds remain unchanged", () => {
    const asset = phoneAssetDefinition.create(assetInstanceId("phone-main"))
    const before = boundsSize(asset.root)

    asset.update(20)

    expect(boundsSize(asset.root)).toEqual(before)
    asset.dispose()
  })
})
