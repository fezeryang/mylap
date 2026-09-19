import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Box3, Group, Mesh, Quaternion, Vector3 } from "three"

import { createRadioModel } from "../../ratio/src/model/createRadioModel"
import { PART_IDS } from "../../ratio/src/model/parts"
import { assetInstanceId } from "../runtime/ids"
import type { RadioSnapshot } from "../services/radio-contracts"
import {
  createRatioAssetDefinition,
  InvalidRatioModelError,
  RATIO_ASSET_TYPE_ID,
  RATIO_TARGET_FOOTPRINT,
} from "./ratio-asset"

type CanvasContext = {
  clearRect(): void
  fillStyle: string
  fillText(): void
  font: string
  textAlign: string
  textBaseline: string
}

const createCanvasDocument = () => {
  const context: CanvasContext = {
    clearRect: () => undefined,
    fillStyle: "",
    fillText: () => undefined,
    font: "",
    textAlign: "",
    textBaseline: "",
  }
  return {
    createElement: (name: string) => {
      if (name !== "canvas") throw new TypeError(`Unexpected element: ${name}`)
      return { getContext: () => context, height: 0, width: 0 }
    },
  }
}

const snapshot = (overrides: Partial<RadioSnapshot> = {}): RadioSnapshot => ({
  error: null,
  liveElapsedSeconds: 12,
  powered: true,
  selectedStation: null,
  stations: [],
  status: "paused",
  visualization: [0.2, 0.4, 0.6],
  volume: 0.5,
  ...overrides,
})

const boundsSize = (root: Group): Vector3 => new Box3().setFromObject(root).getSize(new Vector3())

describe("ratioAssetDefinition", () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document")

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: createCanvasDocument(),
    })
  })

  afterEach(() => {
    if (documentDescriptor === undefined) delete (globalThis as { document?: unknown }).document
    else Object.defineProperty(globalThis, "document", documentDescriptor)
  })

  test("Given the authored ratio model, when adapted, then its normalized exact stage contract is exposed", () => {
    const definition = createRatioAssetDefinition({ readRadioSnapshot: () => snapshot() })
    const asset = definition.create(assetInstanceId("radio-main"))
    const bounds = new Box3().setFromObject(asset.root)
    const size = boundsSize(asset.root)
    const authoredContent = asset.root.children[0]

    expect(definition.typeId).toEqual(RATIO_ASSET_TYPE_ID)
    expect(asset.instanceId).toEqual(assetInstanceId("radio-main"))
    expect(asset.root.rotation.toArray()).toEqual([0, 0, 0, "XYZ"])
    expect(authoredContent).toBeInstanceOf(Group)
    if (!(authoredContent instanceof Group)) throw new Error("Ratio authored content is missing")
    expect(authoredContent.rotation.toArray()).toEqual([0, 0, 0, "XYZ"])
    expect(authoredContent.scale.x).toBeCloseTo(authoredContent.scale.y, 12)
    expect(authoredContent.scale.y).toBeCloseTo(authoredContent.scale.z, 12)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(size.x).toBeLessThanOrEqual(RATIO_TARGET_FOOTPRINT.x + 0.001)
    expect(size.z).toBeLessThanOrEqual(RATIO_TARGET_FOOTPRINT.z + 0.001)
    expect(
      Math.abs(size.x - RATIO_TARGET_FOOTPRINT.x) <= 0.001 ||
        Math.abs(size.z - RATIO_TARGET_FOOTPRINT.z) <= 0.001,
    ).toBe(true)
    expect(asset.parts.map((part) => part.id)).toEqual([...PART_IDS])
    expect(asset.selectable.length).toBeGreaterThan(PART_IDS.length)
    expect(asset.selectable.every((node) => asset.root.getObjectById(node.id) === node)).toBe(true)
    expect(asset.keyboard).toBeUndefined()

    asset.dispose()
  })

  test("Given ratio screen anchors, when adapted and stage-rotated to its locked placement, then both physical screens face the front with exact metadata", () => {
    const asset = createRatioAssetDefinition({ readRadioSnapshot: () => snapshot() }).create(
      assetInstanceId("radio-main"),
    )
    asset.root.rotation.y = Math.PI
    asset.root.updateMatrixWorld(true)

    expect(asset.screens.map((surface) => surface.screenId.value)).toEqual([
      "ratio-tuner",
      "ratio-cassette",
    ])
    expect(asset.screens.map((surface) => surface.defaultAppId.value)).toEqual([
      "ratio-tuner-display",
      "ratio-cassette-display",
    ])
    expect(asset.screens.map((surface) => surface.pixelSize)).toEqual([
      { height: 120, width: 900 },
      { height: 175.4839, width: 320 },
    ])
    expect(asset.screens.map((surface) => surface.worldSize)).toEqual([
      { height: 1.15, width: 8.65 },
      { height: 1.36, width: 2.48 },
    ])
    asset.screens.forEach((surface) => {
      // A physical display must inherit the radio's orientation during camera orbit.
      expect(surface.cssBillboard).not.toBe(true)
      const normal = new Vector3(0, 0, 1).applyQuaternion(
        surface.anchor.getWorldQuaternion(new Quaternion()),
      )
      expect(surface.hitProxy).toBeInstanceOf(Mesh)
      expect(surface.hitProxy.parent).toBe(surface.anchor)
      expect(surface.occlusionRoot.name).toBe("retro-future-radio")
      // biome-ignore lint/complexity/useLiteralKeys: Three userData is an index signature.
      expect(surface.hitProxy.userData["screenHitProxy"]).toBe(true)
      // biome-ignore lint/complexity/useLiteralKeys: Three userData is an index signature.
      expect(surface.hitProxy.userData["explodeWithParent"]).toBe(true)
      expect(normal.x).toBeCloseTo(0, 6)
      expect(normal.y).toBeCloseTo(0, 6)
      expect(normal.z).toBeCloseTo(-1, 6)
    })

    asset.dispose()
  })

  test("Given playing, paused, error, malformed, and stale snapshots, when updated, then only playing drives finite physical animation", () => {
    const updates: Parameters<ReturnType<typeof createRadioModel>["update"]>[] = []
    let current: RadioSnapshot = snapshot({ status: "playing", visualization: [0.8, 0.4] })
    const definition = createRatioAssetDefinition({
      createModel: () => {
        const model = createRadioModel()
        const update = model.update
        Object.defineProperty(model, "update", {
          value: (...args: Parameters<typeof update>): void => {
            updates.push(args)
            update(...args)
          },
        })
        return model
      },
      readRadioSnapshot: () => current,
    })
    const asset = definition.create(assetInstanceId("radio-main"))
    const reels = asset.parts.find((part) => part.id === "cassette-reels")
    if (reels === undefined) throw new Error("Cassette reels are missing")

    asset.update(0.5)
    const playingRotation = reels.node.children[0]?.rotation.z
    current = snapshot({ status: "paused" })
    asset.update(0.5)
    const pausedRotation = reels.node.children[0]?.rotation.z
    current = snapshot({ error: { code: "stream-failed", message: "failed" }, status: "error" })
    asset.update(0.5)
    const errorRotation = reels.node.children[0]?.rotation.z
    current = snapshot({
      status: "playing",
      visualization: [Number.NaN, Number.POSITIVE_INFINITY, 0.7],
    })
    asset.update(Number.NaN)
    asset.update(0.5)

    expect(playingRotation).toBeLessThan(0)
    expect(pausedRotation).toBe(playingRotation)
    expect(errorRotation).toBe(pausedRotation)
    expect(updates.map((entry) => entry[1].playback)).toEqual([
      "playing",
      "paused",
      "error",
      "playing",
    ])
    expect(updates[3]?.[1].spectrum).toEqual([0.7])
    expect(updates.every((entry) => Number.isFinite(entry[0]))).toBe(true)

    asset.dispose()
  })

  test("Given an adapted ratio model, when explosion resets and disposal races later updates, then resources dispose exactly once", () => {
    const asset = createRatioAssetDefinition({
      createModel: createRadioModel,
      readRadioSnapshot: () => snapshot({ status: "playing" }),
    }).create(assetInstanceId("radio-main"))
    const modelMesh = asset.selectable.find((node): node is Mesh => node instanceof Mesh)
    if (modelMesh === undefined) throw new Error("Ratio model mesh is missing")
    let geometryDisposals = 0
    modelMesh.geometry.addEventListener("dispose", () => {
      geometryDisposals += 1
    })
    const before = asset.parts.find((part) => part.id === "dish-antenna")?.node.position.clone()
    if (before === undefined) throw new Error("Ratio dish is missing")

    asset.setExplosion(1)
    const exploded = asset.parts.find((part) => part.id === "dish-antenna")?.node.position.clone()
    asset.setExplosion(-4)
    const reset = asset.parts.find((part) => part.id === "dish-antenna")?.node.position.clone()
    asset.dispose()
    asset.update(1)
    asset.setExplosion(1)
    asset.dispose()

    expect(asset.explosion).toBe(0)
    expect(exploded?.distanceTo(before)).toBeGreaterThan(0.1)
    expect(reset?.distanceTo(before)).toBeLessThan(0.000001)
    expect(geometryDisposals).toBe(1)
  })

  test("Given malformed ratio model boundaries, when creation fails, then it cleans the authored resources and rejects the contract", () => {
    let disposalCount = 0
    const definition = createRatioAssetDefinition({
      createModel: () => {
        const model = createRadioModel()
        const mesh = model.selectables.find((node): node is Mesh => node instanceof Mesh)
        if (mesh === undefined) throw new Error("Ratio model mesh is missing")
        mesh.geometry.addEventListener("dispose", () => {
          disposalCount += 1
        })
        return { ...model, partGroups: new Map([...model.partGroups].slice(1)) }
      },
      readRadioSnapshot: () => snapshot(),
    })

    expect(() => definition.create(assetInstanceId("radio-main"))).toThrow(InvalidRatioModelError)
    expect(disposalCount).toBe(1)
  })

  test("Given the root adapter source, when inspected, then it imports only ratio model sources and no standalone media boundary", async () => {
    const source = await Bun.file(`${import.meta.dir}/ratio-asset.ts`).text()

    const ratioImports = [...source.matchAll(/from "(\.\.\/\.\.\/ratio\/src\/[^"]+)"/g)].map(
      (match) => match[1],
    )

    expect(ratioImports).toEqual([
      "../../ratio/src/model/createRadioModel",
      "../../ratio/src/model/modelTypes",
    ])
    expect(source).not.toMatch(/(?:fetch\(|createRadioMediaService|createDemoAudioPlayer)/)
  })
})
