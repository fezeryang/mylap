import { CylinderGeometry, Group, SphereGeometry, Vector3 } from "three"
import { createDishGeometry, roundedBox, tubeBetween } from "./geometry"
import type { PartDefinition, RadioMaterials } from "./modelTypes"
import { addPartMesh, addReliefMesh, createPart } from "./partFactory"

export type TopParts = {
  readonly definitions: readonly PartDefinition[]
  readonly dishPivot: Group
}

export function createTopParts(materials: RadioMaterials): TopParts {
  const presets = createPart({
    id: "top-preset-controls",
    position: [-1.15, 3.72, 0.42],
    explodeDirection: [0, 1, 0.15],
  })
  const colors = [
    materials.pearlDark,
    materials.lavender,
    materials.magentaLight,
    materials.violetLight,
    materials.blueLight,
  ]
  colors.forEach((material, index) => {
    const button = addPartMesh(
      presets,
      roundedBox(0.82, 0.24, 0.72, 0.09),
      material,
      `preset-${index + 1}`,
    )
    button.position.x = (index - 2) * 0.91
    button.userData["controlId"] = `preset-${index + 1}`
  })

  const handle = createPart({
    id: "carry-handle",
    position: [0, 5.15, -0.2],
    explodeDirection: [0, 1, -0.1],
  })
  const grip = addPartMesh(
    handle,
    roundedBox(6.4, 0.62, 0.72, 0.25),
    materials.lavender,
    "handle-grip",
  )
  grip.rotation.z = 0.015
  const leftUpright = tubeBetween(
    new Vector3(-3.2, -1.45, 0),
    new Vector3(-3.2, 0, 0),
    0.22,
    materials.chrome,
    "handle-left-upright",
  )
  const rightUpright = tubeBetween(
    new Vector3(3.2, -1.45, 0),
    new Vector3(3.2, 0, 0),
    0.22,
    materials.chrome,
    "handle-right-upright",
  )
  leftUpright.userData["partId"] = handle.id
  rightUpright.userData["partId"] = handle.id
  handle.group.add(leftUpright, rightUpright)

  const leftHinge = createHinge("left-handle-hinge", -3.2, materials)
  const rightHinge = createHinge("right-handle-hinge", 3.2, materials)

  const swivel = createPart({
    id: "aerial-swivel",
    position: [-3.72, 3.82, -0.25],
    explodeDirection: [-0.35, 1, -0.2],
  })
  const swivelMesh = addPartMesh(swivel, new SphereGeometry(0.29, 24, 16), materials.chrome)
  swivelMesh.scale.y = 0.78

  const aerial = createPart({
    id: "telescopic-aerial",
    position: [-3.72, 3.9, -0.25],
    explodeDirection: [-0.55, 1.15, -0.3],
  })
  const aerialStart = new Vector3(0, 0, 0)
  const aerialEnd = new Vector3(5.25, 3.4, -0.12)
  const rod = tubeBetween(aerialStart, aerialEnd, 0.055, materials.chrome, "telescopic-aerial-rod")
  rod.userData["partId"] = aerial.id
  aerial.group.add(rod)
  const tip = addPartMesh(
    aerial,
    new SphereGeometry(0.13, 20, 12),
    materials.violetLight,
    "aerial-tip",
  )
  tip.position.copy(aerialEnd)

  const dishBase = createPart({
    id: "dish-base",
    position: [4.27, 4.05, 0.02],
    explodeDirection: [0.55, 1, 0.1],
  })
  const base = addPartMesh(dishBase, new CylinderGeometry(0.62, 0.82, 0.34, 48), materials.chrome)
  base.position.y = -0.15
  const neck = addReliefMesh(
    dishBase,
    new CylinderGeometry(0.21, 0.28, 0.48, 28),
    materials.dark,
    "dish-neck",
  )
  neck.position.y = 0.22

  const dish = createPart({
    id: "dish-antenna",
    position: [4.28, 5.15, 0.04],
    explodeDirection: [0.65, 1.2, 0.1],
  })
  const dishPivot = new Group()
  dishPivot.name = "dish-scan-pivot"
  dishPivot.rotation.x = -0.17
  dishPivot.rotation.y = -0.2
  const reflector = addPartMesh(
    dish,
    createDishGeometry(1.3, 0.48),
    materials.dish,
    "dish-reflector",
  )
  reflector.rotation.x = -0.23
  reflector.rotation.y = -0.48
  dishPivot.add(reflector)
  dish.group.add(dishPivot)

  const feed = createPart({
    id: "dish-feed",
    position: [4.28, 5.15, 0.04],
    explodeDirection: [0.8, 1.25, 0.3],
  })
  const feedArm = tubeBetween(
    new Vector3(0, 0, 0.05),
    new Vector3(0.52, 0.18, 0.72),
    0.035,
    materials.chrome,
    "dish-feed-arm",
  )
  feedArm.userData["partId"] = feed.id
  feed.group.add(feedArm)
  const receiver = addPartMesh(
    feed,
    new CylinderGeometry(0.18, 0.21, 0.3, 24),
    materials.violetLight,
    "dish-feed-receiver",
  )
  receiver.position.set(0.54, 0.2, 0.75)
  receiver.rotation.x = Math.PI / 2

  return {
    definitions: [presets, handle, leftHinge, rightHinge, swivel, aerial, dishBase, dish, feed],
    dishPivot,
  }
}

function createHinge(
  id: "left-handle-hinge" | "right-handle-hinge",
  x: number,
  materials: RadioMaterials,
): PartDefinition {
  const hinge = createPart({
    id,
    position: [x, 3.65, -0.2],
    explodeDirection: [Math.sign(x), 0.85, -0.15],
  })
  const barrel = addPartMesh(hinge, new CylinderGeometry(0.34, 0.34, 0.62, 32), materials.chrome)
  barrel.rotation.z = Math.PI / 2
  addReliefMesh(
    hinge,
    new CylinderGeometry(0.18, 0.18, 0.65, 24),
    materials.dark,
    `${id}-pin`,
  ).rotation.z = Math.PI / 2
  return hinge
}
