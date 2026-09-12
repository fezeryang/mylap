import { Box3, Group, MathUtils } from "three"
import type { AssetPart, SceneAssetDefinition, StageAsset } from "../runtime/asset-contracts"
import { assetTypeId } from "../runtime/ids"
import type { CyberDeskModel } from "./cyber-desk-asset-model.js"
import { createCyberDeskModel } from "./cyber-desk-asset-model.js"

export const CYBER_DESK_ASSET_TYPE_ID = assetTypeId("cyber-desk")

export class InvalidCyberDeskModelError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid cyber-desk model: ${reason}`)
    this.name = "InvalidCyberDeskModelError"
  }
}

type CyberDeskModelFactory = () => CyberDeskModel

const expectedPartIds = [
  "upper-shell",
  "lower-chassis",
  "work-surface",
  "work-surface-linework",
  "light-rails",
  "control-pods",
  "front-latch",
  "leg-left-rear-hip",
  "leg-left-rear-upper",
  "leg-left-rear-lower",
  "leg-right-rear-hip",
  "leg-right-rear-upper",
  "leg-right-rear-lower",
  "leg-left-front-hip",
  "leg-left-front-upper",
  "leg-left-front-lower",
  "leg-right-front-hip",
  "leg-right-front-upper",
  "leg-right-front-lower",
] as const

const assertFiniteBounds = (model: CyberDeskModel): void => {
  const bounds = new Box3().setFromObject(model)
  const values = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
  ]
  if (values.some((value) => !Number.isFinite(value))) {
    throw new InvalidCyberDeskModelError("bounds must be finite")
  }
}

const assetParts = (model: CyberDeskModel): readonly AssetPart[] => {
  const runtime = model.userData.sculptRuntime
  const manifestIds = runtime.partManifest.map((part) => part.id)
  if (
    manifestIds.length !== expectedPartIds.length ||
    new Set(manifestIds).size !== expectedPartIds.length ||
    !expectedPartIds.every((id) => manifestIds.includes(id))
  ) {
    throw new InvalidCyberDeskModelError("part manifest must contain the exact 19 desk part IDs")
  }
  return expectedPartIds.map((id) => {
    const node = runtime.nodes.get(id)
    if (!(node instanceof Group))
      throw new InvalidCyberDeskModelError(`part node is missing: ${id}`)
    return {
      authoredPosition: node.position.clone(),
      centralClearance: 0,
      id,
      node,
    }
  })
}

export const createCyberDeskAssetDefinition = (
  createModel: CyberDeskModelFactory = createCyberDeskModel,
): SceneAssetDefinition => ({
  create: (instanceId): StageAsset => {
    const model = createModel()
    const runtime = model.userData.sculptRuntime
    try {
      assertFiniteBounds(model)
      const parts = assetParts(model)
      const root = new Group()
      const authoredContent = new Group()
      let disposed = false
      let explosion = 0
      root.name = `cyber-desk-stage-${instanceId.value}`
      root.userData["assetInstanceId"] = instanceId.value
      authoredContent.name = "cyber-desk-authored-content"
      authoredContent.position.y = -2.4775
      authoredContent.add(model)
      root.add(authoredContent)

      return {
        dispose: () => {
          if (disposed) return
          disposed = true
          runtime.dispose()
        },
        get explosion(): number {
          return explosion
        },
        instanceId,
        parts,
        root,
        screens: [],
        selectable: [],
        setExplosion: (factor) => {
          explosion = MathUtils.clamp(factor, 0, 1)
          runtime.setExplosion(explosion)
        },
        typeId: CYBER_DESK_ASSET_TYPE_ID,
        update: () => undefined,
      }
    } catch (error) {
      runtime.dispose()
      throw error
    }
  },
  typeId: CYBER_DESK_ASSET_TYPE_ID,
})

export const cyberDeskAssetDefinition = createCyberDeskAssetDefinition()
