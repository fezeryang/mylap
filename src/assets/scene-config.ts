import type { AssetPlacement } from "../runtime/asset-contracts"
import { assetInstanceId } from "../runtime/ids"
import { CYBERDECK_ASSET_TYPE_ID } from "./cyberdeck-asset"

const primary: AssetPlacement = {
  instanceId: assetInstanceId("cyberdeck-main"),
  position: [0, 0, 0],
  rotation: [0, -0.05, 0],
  scale: 1,
  typeId: CYBERDECK_ASSET_TYPE_ID,
}

export const sceneConfiguration = (multipleAssets: boolean): readonly AssetPlacement[] =>
  multipleAssets
    ? [
        {
          instanceId: assetInstanceId("cyberdeck-alpha"),
          position: [-5.3, 0, 0.25],
          rotation: [0, 0.08, 0],
          scale: 0.72,
          typeId: CYBERDECK_ASSET_TYPE_ID,
        },
        {
          instanceId: assetInstanceId("cyberdeck-beta"),
          position: [5.3, 0, -0.25],
          rotation: [0, -0.12, 0],
          scale: 0.72,
          typeId: CYBERDECK_ASSET_TYPE_ID,
        },
      ]
    : [primary]
