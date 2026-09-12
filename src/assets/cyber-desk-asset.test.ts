import { describe, expect, test } from "bun:test"
import { Box3, Group, Vector3 } from "three"
import { assetInstanceId } from "../runtime/ids"
import {
  CYBER_DESK_ASSET_TYPE_ID,
  createCyberDeskAssetDefinition,
  cyberDeskAssetDefinition,
  InvalidCyberDeskModelError,
} from "./cyber-desk-asset"
import { createCyberDeskModel } from "./cyber-desk-asset-model.js"

const expectedPartIds = [
  "upper-shell",
  "lower-chassis",
  "work-surface",
  "work-surface-linework",
  "light-rails",
  "control-pods",
  "front-latch",
  "leg-left-rear-hip",
  "leg-left-rear-upper",
  "leg-left-rear-lower",
  "leg-right-rear-hip",
  "leg-right-rear-upper",
  "leg-right-rear-lower",
  "leg-left-front-hip",
  "leg-left-front-upper",
  "leg-left-front-lower",
  "leg-right-front-hip",
  "leg-right-front-upper",
  "leg-right-front-lower",
] as const

describe("cyberDeskAssetDefinition", () => {
  test("Given the desk model, when the adapter creates desk-main, then it preserves the exact environment contract", () => {
    const asset = cyberDeskAssetDefinition.create(assetInstanceId("desk-main"))
    const bounds = new Box3().setFromObject(asset.root)
    const authoredContent = asset.root.children[0]

    expect(asset.typeId).toEqual(CYBER_DESK_ASSET_TYPE_ID)
    expect(asset.instanceId).toEqual(assetInstanceId("desk-main"))
    expect(asset.root.position.toArray()).toEqual([0, 0, 0])
    expect(asset.root.rotation.toArray()).toEqual([0, 0, 0, "XYZ"])
    expect(asset.root.scale.toArray()).toEqual([1, 1, 1])
    expect(authoredContent).toBeInstanceOf(Group)
    if (!(authoredContent instanceof Group))
      throw new Error("Desk adapter omitted authored content")
    expect(authoredContent.position.toArray()).toEqual([0, -2.4775, 0])
    expect(authoredContent.scale.toArray()).toEqual([1, 1, 1])
    expect(bounds.max.y).toBeCloseTo(0, 6)
    expect(asset.parts.map((part) => part.id)).toEqual([...expectedPartIds])
    expect(asset.parts).toHaveLength(19)
    expect(
      asset.parts.every((part) => authoredContent.getObjectById(part.node.id) === part.node),
    ).toBe(true)
    expect(asset.selectable).toEqual([])
    expect(asset.screens).toEqual([])
    expect(asset.keyboard).toBeUndefined()

    asset.dispose()
  })

  test("Given a desk adapter, when exploded, reset, updated, and disposed repeatedly, then model delegation is stable", () => {
    let disposalCount = 0
    const definition = createCyberDeskAssetDefinition(() => {
      const model = createCyberDeskModel()
      const runtime = model.userData.sculptRuntime
      Object.defineProperty(model.userData, "sculptRuntime", {
        configurable: true,
        value: {
          ...runtime,
          dispose: (): void => {
            disposalCount += 1
            runtime.dispose()
          },
        },
      })
      return model
    })
    const asset = definition.create(assetInstanceId("desk-main"))
    const lowerLeg = asset.parts.find((part) => part.id === "leg-right-front-lower")
    if (lowerLeg === undefined) throw new Error("Desk adapter omitted the lower leg part")
    const rest = lowerLeg.node.position.clone()
    const updatePosition = new Vector3(3, 4, 5)

    asset.setExplosion(1)
    expect(asset.explosion).toBe(1)
    expect(lowerLeg.node.position.distanceTo(rest)).toBeGreaterThan(1)
    asset.setExplosion(-4)
    expect(asset.explosion).toBe(0)
    expect(lowerLeg.node.position.distanceTo(rest)).toBeLessThan(0.000_001)
    asset.update(999)
    expect(lowerLeg.node.position).toEqual(rest)
    updatePosition.copy(lowerLeg.node.position)
    expect(updatePosition).toEqual(rest)

    asset.dispose()
    asset.dispose()

    expect(disposalCount).toBe(1)
  })

  test("Given malformed desk factory output, when the adapter sees missing parts or non-finite bounds, then it rejects and cleans up", () => {
    let missingPartDisposals = 0
    let nonFiniteBoundsDisposals = 0
    const missingPartDefinition = createCyberDeskAssetDefinition(() => {
      const model = createCyberDeskModel()
      const runtime = model.userData.sculptRuntime
      const nodes = new Map(runtime.nodes)
      nodes.delete("upper-shell")
      Object.defineProperty(model.userData, "sculptRuntime", {
        configurable: true,
        value: {
          ...runtime,
          dispose: (): void => {
            missingPartDisposals += 1
            runtime.dispose()
          },
          nodes,
        },
      })
      return model
    })
    const nonFiniteBoundsDefinition = createCyberDeskAssetDefinition(() => {
      const model = createCyberDeskModel()
      const runtime = model.userData.sculptRuntime
      Object.defineProperty(model.userData, "sculptRuntime", {
        configurable: true,
        value: {
          ...runtime,
          dispose: (): void => {
            nonFiniteBoundsDisposals += 1
            runtime.dispose()
          },
        },
      })
      model.position.x = Number.POSITIVE_INFINITY
      return model
    })

    expect(() => missingPartDefinition.create(assetInstanceId("desk-main"))).toThrow(
      InvalidCyberDeskModelError,
    )
    expect(() => nonFiniteBoundsDefinition.create(assetInstanceId("desk-main"))).toThrow(
      InvalidCyberDeskModelError,
    )
    expect(missingPartDisposals).toBe(1)
    expect(nonFiniteBoundsDisposals).toBe(1)
  })

  test("Given the root adapter source, when inspected, then it imports no standalone desk viewer or entrypoint", async () => {
    const source = await Bun.file(`${import.meta.dir}/cyber-desk-asset.ts`).text()

    const modelBridge = await Bun.file(`${import.meta.dir}/cyber-desk-asset-model.js`).text()

    expect(modelBridge).toContain("../../desk/src/createCyberDesk.ts")
    expect(`${source}\n${modelBridge}`).not.toMatch(/desk\/src\/(?:main|.*viewer)/)
  })
})
