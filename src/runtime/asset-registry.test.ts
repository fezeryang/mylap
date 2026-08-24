import { describe, expect, test } from "bun:test"

import type { SceneAssetDefinition } from "./asset-contracts"
import { AssetRegistry, DuplicateAssetTypeError, UnknownAssetTypeError } from "./asset-registry"
import { assetTypeId } from "./ids"

const fakeDefinition = (value: string): SceneAssetDefinition => ({
  create: () => {
    throw new Error("Fake definition is not instantiated by registry tests")
  },
  typeId: assetTypeId(value),
})

describe("AssetRegistry", () => {
  test("Given a registered asset type, when registered again, then the duplicate is rejected", () => {
    const registry = new AssetRegistry()
    registry.register(fakeDefinition("cyberdeck"))

    const registerDuplicate = (): void => registry.register(fakeDefinition("cyberdeck"))

    expect(registerDuplicate).toThrow(DuplicateAssetTypeError)
  })

  test("Given an unknown asset type, when resolved, then a typed error is raised", () => {
    const registry = new AssetRegistry()

    const resolveUnknown = (): SceneAssetDefinition => registry.resolve(assetTypeId("unknown"))

    expect(resolveUnknown).toThrow(UnknownAssetTypeError)
  })
})
