export type AssetInstanceId = {
  readonly kind: "asset-instance-id"
  readonly value: string
}

export type AssetTypeId = {
  readonly kind: "asset-type-id"
  readonly value: string
}

export type ScreenAppId = {
  readonly kind: "screen-app-id"
  readonly value: string
}

export type ScreenId = {
  readonly kind: "screen-id"
  readonly value: string
}

export class InvalidIdentifierError extends Error {
  constructor(readonly identifierKind: string) {
    super(`${identifierKind} must not be empty`)
    this.name = "InvalidIdentifierError"
  }
}

const normalized = (value: string, identifierKind: string): string => {
  const result = value.trim()
  if (result.length === 0) throw new InvalidIdentifierError(identifierKind)
  return result
}

export const assetInstanceId = (value: string): AssetInstanceId => ({
  kind: "asset-instance-id",
  value: normalized(value, "asset instance ID"),
})

export const assetTypeId = (value: string): AssetTypeId => ({
  kind: "asset-type-id",
  value: normalized(value, "asset type ID"),
})

export const screenAppId = (value: string): ScreenAppId => ({
  kind: "screen-app-id",
  value: normalized(value, "screen app ID"),
})

export const screenId = (value: string): ScreenId => ({
  kind: "screen-id",
  value: normalized(value, "screen ID"),
})
