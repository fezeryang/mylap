import { BufferGeometry, Group, Material, Mesh, MeshBasicMaterial, PlaneGeometry } from "three"
import { createNeonCyberphoneModel } from "../../phone/src/model/createPhoneModel"
import type { PhoneModel } from "../../phone/src/model/modelTypes"
import { PART_IDS } from "../../phone/src/model/parts"
import { PHONE_SHELL_APP_ID } from "../apps/app-ids"
import type { AssetPart, SceneAssetDefinition, StageAsset } from "../runtime/asset-contracts"
import { assetTypeId, screenId } from "../runtime/ids"
import { InvalidAssetBoundsError, normalizeAuthoredAssetRoot } from "./asset-normalization"

export const PHONE_ASSET_TYPE_ID = assetTypeId("phone")
export const PHONE_TARGET_FOOTPRINT = { x: 0.9, z: 2.2 } as const

export class InvalidPhoneModelError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid phone model: ${reason}`)
    this.name = "InvalidPhoneModelError"
  }
}

type PhoneModelFactory = () => PhoneModel

const PHONE_SCREEN_PIXEL_SIZE = { height: 1280, width: 600 } as const
const PHONE_SCREEN_WORLD_SIZE = { height: 13.7216, width: 6.432 } as const

const contains = (ancestor: Group, descendant: Group): boolean => {
  let cursor = descendant.parent
  while (cursor !== null) {
    if (cursor === ancestor) return true
    cursor = cursor.parent
  }
  return false
}

const modelParts = (model: PhoneModel): readonly AssetPart[] => {
  if (model.partGroups.size !== PART_IDS.length) {
    throw new InvalidPhoneModelError("part map must contain the exact authored phone part IDs")
  }
  return PART_IDS.map((id) => {
    const node = model.partGroups.get(id)
    if (!(node instanceof Group) || !contains(model.root, node)) {
      throw new InvalidPhoneModelError(`part node is missing from the model root: ${id}`)
    }
    return {
      authoredPosition: node.position.clone(),
      centralClearance: 0,
      id,
      node,
    }
  })
}

const modelMeshes = (model: PhoneModel): readonly Mesh[] => {
  const meshes: Mesh[] = []
  model.root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object)
  })
  return meshes
}

const assertModelResources = (model: PhoneModel, meshes: readonly Mesh[]): void => {
  const geometries = new Set(meshes.map((mesh) => mesh.geometry))
  const materials = new Set<Material>()
  meshes.forEach((mesh) => {
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    meshMaterials.forEach((material) => {
      materials.add(material)
    })
  })
  const resourceGeometries = new Set(model.resources.geometries)
  const resourceMaterials = new Set(model.resources.materials)
  const geometriesMatch =
    resourceGeometries.size === model.resources.geometries.length &&
    resourceGeometries.size === geometries.size &&
    [...geometries].every((geometry) =>
      geometry instanceof BufferGeometry ? resourceGeometries.has(geometry) : false,
    )
  const materialsMatch =
    resourceMaterials.size === model.resources.materials.length &&
    resourceMaterials.size === materials.size &&
    [...materials].every((material) =>
      material instanceof Material ? resourceMaterials.has(material) : false,
    )
  if (!geometriesMatch || !materialsMatch) {
    throw new InvalidPhoneModelError(
      "resource metadata must exactly cover unique descendant geometries and materials",
    )
  }
}

const hostExplosion = (factor: number): number => {
  if (factor === Number.POSITIVE_INFINITY) return 1
  if (!Number.isFinite(factor)) return 0
  return Math.min(1, Math.max(0, factor))
}

export const createPhoneAssetDefinition = (
  createModel: PhoneModelFactory = createNeonCyberphoneModel,
): SceneAssetDefinition => ({
  create: (instanceId): StageAsset => {
    const model = createModel()
    let hitProxy: Mesh | null = null
    try {
      const parts = modelParts(model)
      if (model.screenAnchor !== model.partGroups.get("screen-ui")) {
        throw new InvalidPhoneModelError("screen anchor must be the screen-ui part")
      }
      const meshes = modelMeshes(model)
      assertModelResources(model, meshes)
      const normalized = normalizeAuthoredAssetRoot({
        authoredRoot: model.root,
        authoredRotation: [-Math.PI / 2, 0, 0],
        targetFootprint: PHONE_TARGET_FOOTPRINT,
      })
      normalized.root.userData["assetInstanceId"] = instanceId.value

      hitProxy = new Mesh(
        new PlaneGeometry(PHONE_SCREEN_WORLD_SIZE.width, PHONE_SCREEN_WORLD_SIZE.height),
        new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      )
      hitProxy.name = "phone-primary-hit-plane"
      hitProxy.position.z = 0.025
      hitProxy.userData["explodeWithParent"] = true
      hitProxy.userData["screenHitProxy"] = true
      model.screenAnchor.add(hitProxy)
      const selectable = [...meshes, hitProxy]
      let disposed = false
      let explosion = 0

      return {
        dispose: () => {
          if (disposed) return
          disposed = true
          hitProxy?.geometry.dispose()
          const materials =
            hitProxy === null
              ? []
              : Array.isArray(hitProxy.material)
                ? hitProxy.material
                : [hitProxy.material]
          materials.forEach((material) => {
            material.dispose()
          })
          model.dispose()
        },
        get explosion(): number {
          return explosion
        },
        instanceId,
        parts,
        root: normalized.root,
        screens: [
          {
            anchor: model.screenAnchor,
            defaultAppId: PHONE_SHELL_APP_ID,
            hitProxy,
            occlusionRoot: model.root,
            pixelSize: PHONE_SCREEN_PIXEL_SIZE,
            screenId: screenId("phone-primary"),
            worldSize: PHONE_SCREEN_WORLD_SIZE,
          },
        ],
        selectable,
        setExplosion: (factor) => {
          explosion = hostExplosion(factor)
          model.setExplosion(1 + explosion * 1.1)
        },
        typeId: PHONE_ASSET_TYPE_ID,
        update: () => undefined,
      }
    } catch (error) {
      hitProxy?.geometry.dispose()
      if (hitProxy !== null) {
        const materials = Array.isArray(hitProxy.material) ? hitProxy.material : [hitProxy.material]
        materials.forEach((material) => {
          material.dispose()
        })
      }
      model.dispose()
      if (error instanceof InvalidPhoneModelError) throw error
      if (error instanceof InvalidAssetBoundsError) throw new InvalidPhoneModelError(error.reason)
      throw error
    }
  },
  typeId: PHONE_ASSET_TYPE_ID,
})

export const phoneAssetDefinition = createPhoneAssetDefinition()
