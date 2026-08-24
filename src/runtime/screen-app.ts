import type { AssetInstanceId, ScreenAppId, ScreenId } from "./ids"

export type StageSnapshot = {
  readonly activeAsset: string
  readonly drawCalls: number
  readonly fps: number
  readonly selectedPart: string
  readonly triangles: number
}

export interface ScreenAppHost {
  append(node: Node): void
  clear(): void
}

export type ScreenAppContext = {
  readonly assetInstanceId: AssetInstanceId
  readonly requestAssetActivation: () => void
  readonly requestScreenFocus: () => void
  readonly screenId: ScreenId
}

export interface ScreenAppHandle {
  dispose(): void
  setActive(active: boolean): void
  update(snapshot: StageSnapshot): void
}

export interface ScreenAppDefinition {
  readonly appId: ScreenAppId
  mount(host: ScreenAppHost, context: ScreenAppContext): ScreenAppHandle
}
