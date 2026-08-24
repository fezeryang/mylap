import type { Material } from "three"
import { MathUtils, Mesh } from "three"

import {
  MAIN_WORKSPACE_APP_ID,
  STRUCTURE_ANALYSIS_APP_ID,
  SYSTEM_TELEMETRY_APP_ID,
} from "../apps/app-ids"
import { createCyberdeckModel } from "../model/create-cyberdeck-model"
import { explodedPosition } from "../model/part-layout"
import type { SceneAssetDefinition, StageAsset } from "../runtime/asset-contracts"
import { assetTypeId } from "../runtime/ids"

export const CYBERDECK_ASSET_TYPE_ID = assetTypeId("cyberdeck")

const disposeMaterials = (
  material: Material | readonly Material[],
  disposed: Set<Material>,
): void => {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((current) => {
    if (disposed.has(current)) return
    disposed.add(current)
    current.dispose()
  })
}

export const cyberdeckAssetDefinition: SceneAssetDefinition = {
  create: (instanceId): StageAsset => {
    const model = createCyberdeckModel({
      left: SYSTEM_TELEMETRY_APP_ID,
      main: MAIN_WORKSPACE_APP_ID,
      right: STRUCTURE_ANALYSIS_APP_ID,
    })
    let explosion = 0
    model.root.userData["assetInstanceId"] = instanceId.value

    return {
      dispose: () => {
        model.keyboard.releaseAll()
        const disposedMaterials = new Set<Material>()
        model.root.traverse((object) => {
          if (!(object instanceof Mesh)) return
          object.geometry.dispose()
          disposeMaterials(object.material, disposedMaterials)
        })
      },
      get explosion(): number {
        return explosion
      },
      instanceId,
      keyboard: model.keyboard,
      parts: model.parts,
      root: model.root,
      screens: model.screens,
      selectable: model.selectable,
      setExplosion: (factor) => {
        explosion = MathUtils.clamp(factor, 0, 1)
        model.parts.forEach((part) => {
          if (part.id === "cyberdeck-root") return
          part.node.position.copy(
            explodedPosition(part.authoredPosition, explosion * 0.72, part.centralClearance),
          )
        })
      },
      typeId: CYBERDECK_ASSET_TYPE_ID,
      update: (deltaSeconds) => model.keyboard.update(deltaSeconds),
    }
  },
  typeId: CYBERDECK_ASSET_TYPE_ID,
}
