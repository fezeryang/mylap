import type { SceneAssetDefinition } from "./asset-contracts"
import type { AssetTypeId } from "./ids"

export class DuplicateAssetTypeError extends Error {
  constructor(readonly typeId: AssetTypeId) {
    super(`Asset type is already registered: ${typeId.value}`)
    this.name = "DuplicateAssetTypeError"
  }
}

export class UnknownAssetTypeError extends Error {
  constructor(readonly typeId: AssetTypeId) {
    super(`Asset type is not registered: ${typeId.value}`)
    this.name = "UnknownAssetTypeError"
  }
}

export class AssetRegistry {
  private readonly definitions = new Map<string, SceneAssetDefinition>()

  register(definition: SceneAssetDefinition): void {
    if (this.definitions.has(definition.typeId.value)) {
      throw new DuplicateAssetTypeError(definition.typeId)
    }
    this.definitions.set(definition.typeId.value, definition)
  }

  resolve(typeId: AssetTypeId): SceneAssetDefinition {
    const definition = this.definitions.get(typeId.value)
    if (definition === undefined) throw new UnknownAssetTypeError(typeId)
    return definition
  }
}
