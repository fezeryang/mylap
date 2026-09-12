import type { RadioSnapshot } from "../services/radio-contracts"

export type TodouQaSnapshot = {
  readonly navigationState: string
  readonly activeAsset: string | null
  readonly focusedScreen: { readonly assetId: string; readonly screenId: string } | null
  readonly instances: readonly {
    readonly instanceId: string
    readonly typeId: string
    readonly bounds: readonly [number, number, number, number, number, number]
    readonly screenIds: readonly string[]
  }[]
  readonly screenSessionCount: number
  readonly radio: RadioSnapshot
  readonly lastKeyboardRoute: {
    readonly assetId: string
    readonly screenId: string | null
    readonly code: string
  } | null
  readonly disposalCounts: Readonly<Record<string, number>>
}

export interface TodouQaApi {
  read(): TodouQaSnapshot
  removeAsset(instanceId: string): void
}

declare global {
  interface Window {
    __todouQa?: TodouQaApi
  }
}
