import { Box3, type BufferGeometry, Group, type Material, Mesh } from "three"
import { createBulletinBoardModel } from "../../board/src/model/create-bulletin-board-model"
import type { AssetPart, SceneAssetDefinition, StageAsset } from "../runtime/asset-contracts"
import type { AssetInstanceId } from "../runtime/ids"
import { assetTypeId } from "../runtime/ids"
import { normalizeAuthoredAssetRoot } from "./asset-normalization"
import { BOARD_FOOTPRINT } from "./scene-config-validator"

export const BULLETIN_BOARD_ASSET_TYPE_ID = assetTypeId("bulletin-board")

export const BULLETIN_BOARD_TARGET_FOOTPRINT = BOARD_FOOTPRINT

export const createBulletinBoardAssetDefinition = (): SceneAssetDefinition => ({
  create: (instanceId: AssetInstanceId): StageAsset => {
    const model = createBulletinBoardModel()
    // Adapt authoring nodes to host part groups without changing mesh transforms.
    const parts: readonly AssetPart[] = model.parts.map((part) => {
      let node: Group
      if (part.node instanceof Group) node = part.node
      else {
        node = new Group()
        node.name = `${part.id}-part`
        part.node.parent?.add(node)
        node.add(part.node)
      }
      return { id: part.id, node, authoredPosition: node.position.clone(), centralClearance: 0 }
    })

    const normalized = normalizeAuthoredAssetRoot({
      authoredRoot: model.root,
      authoredRotation: [0, 0, 0],
      targetFootprint: BULLETIN_BOARD_TARGET_FOOTPRINT,
    })

    const bounds = new Box3().setFromObject(normalized.root)
    const explosionRange = bounds.max.y - bounds.min.y

    normalized.root.userData["assetInstanceId"] = instanceId.value
    let disposed = false
    let explosion = 0

    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        const geometries = new Set<BufferGeometry>()
        const materials = new Set<Material>()
        model.root.traverse((object) => {
          if (!(object instanceof Mesh)) return
          geometries.add(object.geometry)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material)
        })
        for (const geometry of geometries) geometry.dispose()
        for (const material of materials) material.dispose()
      },
      get explosion() {
        return explosion
      },
      instanceId,
      parts,
      root: normalized.root,
      screens: [],
      selectable: model.selectable,
      setExplosion: (factor: number) => {
        if (disposed) return
        explosion = Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 0
        parts.forEach((part, i) => {
          const offset = (i / parts.length) * explosionRange * explosion
          part.node.position.copy(part.authoredPosition)
          part.node.position.y += offset
        })
      },
      typeId: BULLETIN_BOARD_ASSET_TYPE_ID,
      update: () => {},
    }
  },
  typeId: BULLETIN_BOARD_ASSET_TYPE_ID,
})
