import { describe, expect, test } from "bun:test"
import { Group, Scene } from "three"

import type { AssetPlacement, SceneAssetDefinition, StageAsset } from "./asset-contracts"
import { AssetRegistry } from "./asset-registry"
import { AssetStage, DuplicateAssetInstanceError } from "./asset-stage"
import { assetInstanceId, assetTypeId } from "./ids"

const typeId = assetTypeId("cyberdeck")

const placement = (value: string, x: number): AssetPlacement => ({
  instanceId: assetInstanceId(value),
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  typeId,
})

describe("AssetStage", () => {
  test("Given one asset type, when two instances mount, then both coexist with independent IDs", () => {
    const registry = new AssetRegistry()
    registry.register(fakeDefinition())
    const stage = new AssetStage(new Scene(), registry)

    stage.mount(placement("deck-a", -5))
    stage.mount(placement("deck-b", 5))

    expect(stage.assets.map((asset) => asset.instanceId.value)).toEqual(["deck-a", "deck-b"])
    expect(stage.active?.instanceId.value).toBe("deck-a")
  })

  test("Given a mounted instance, when the same ID mounts again, then the duplicate is rejected", () => {
    const registry = new AssetRegistry()
    registry.register(fakeDefinition())
    const stage = new AssetStage(new Scene(), registry)
    stage.mount(placement("deck-a", 0))

    const mountDuplicate = (): StageAsset => stage.mount(placement("deck-a", 2))

    expect(mountDuplicate).toThrow(DuplicateAssetInstanceError)
  })

  test("Given an active second instance, when removed, then it is disposed and focus falls back", () => {
    const disposed = new Map<string, number>()
    const registry = new AssetRegistry()
    registry.register(fakeDefinition(disposed))
    const stage = new AssetStage(new Scene(), registry)
    stage.mount(placement("deck-a", -5))
    stage.mount(placement("deck-b", 5))
    stage.activate(assetInstanceId("deck-b"))

    stage.remove(assetInstanceId("deck-b"))

    expect(disposed.get("deck-b")).toBe(1)
    expect(stage.active?.instanceId.value).toBe("deck-a")
  })
})

const fakeDefinition = (disposed = new Map<string, number>()): SceneAssetDefinition => ({
  create: (instanceId): StageAsset => ({
    dispose: () => disposed.set(instanceId.value, (disposed.get(instanceId.value) ?? 0) + 1),
    explosion: 0,
    instanceId,
    parts: [],
    root: new Group(),
    screens: [],
    selectable: [],
    setExplosion: () => undefined,
    typeId,
    update: () => undefined,
  }),
  typeId,
})
