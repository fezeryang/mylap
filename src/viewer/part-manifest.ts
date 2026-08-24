import { Mesh } from "three"

import type { StageAsset } from "../runtime/asset-contracts"

export const attachPartManifest = (assets: readonly StageAsset[]): void => {
  const assetEntries = assets.map((asset) => ({
    instanceId: asset.instanceId.value,
    integralMeshes: asset.selectable.length,
    parts: asset.parts
      .filter((part) => part.id !== "cyberdeck-root")
      .map((part) => {
        let triangles = 0
        part.node.traverse((object) => {
          if (!(object instanceof Mesh)) return
          const positionCount = object.geometry.attributes.position?.count ?? 0
          triangles +=
            object.geometry.index === null ? positionCount / 3 : object.geometry.index.count / 3
        })
        return {
          kind: "part",
          module: part.node.parent?.name ?? "cyberdeck-root",
          name: part.id,
          triangles,
        }
      }),
    typeId: asset.typeId.value,
    unnamedMeshes: asset.selectable.filter((mesh) => mesh.name.length === 0).length,
  }))
  const manifestNode = document.createElement("script")
  manifestNode.id = "part-manifest"
  manifestNode.type = "application/json"
  manifestNode.textContent = JSON.stringify({ assets: assetEntries, model: "multi-asset-stage" })
  document.body.append(manifestNode)
}
