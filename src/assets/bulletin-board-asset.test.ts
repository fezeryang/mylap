import { expect, test } from "bun:test"
import { Box3, type Material, Mesh } from "three"
import { assetInstanceId } from "../runtime/ids"
import { createBulletinBoardAssetDefinition } from "./bulletin-board-asset"
import { createCyberDeskAssetDefinition } from "./cyber-desk-asset"
import { desktopSceneSpec, validateDesktopScene } from "./scene-config-validator"

test("enlarged board is elevated beside the desk with a generous gap", () => {
  const board = createBulletinBoardAssetDefinition().create(assetInstanceId("qa-board"))
  const desk = createCyberDeskAssetDefinition().create(assetInstanceId("qa-desk"))
  try {
    const placement = desktopSceneSpec.find(
      ({ instanceId }) => instanceId === "bulletin-board-main",
    )
    if (placement === undefined) throw new Error("Missing board placement")
    const localBounds = new Box3().setFromObject(board.root)
    expect(localBounds.max.x - localBounds.min.x).toBeGreaterThan(8.9)
    const [x, y, z] = placement.outerPosition
    const [rx, ry, rz] = placement.outerRotation
    board.root.position.set(x, y, z)
    board.root.rotation.set(rx, ry, rz)
    const boardBounds = new Box3().setFromObject(board.root)
    const deskBounds = new Box3().setFromObject(desk.root)
    expect(boardBounds.max.x).toBeLessThan(deskBounds.min.x - 2.5)
    expect(boardBounds.min.y).toBeGreaterThan(deskBounds.min.y + 3.8)
    expect((boardBounds.min.y + boardBounds.max.y) / 2).toBeGreaterThan(deskBounds.max.y + 2)
    expect(boardBounds.intersectsBox(deskBounds)).toBe(false)
  } finally {
    board.dispose()
    desk.dispose()
  }
})

test("board is additional to radio; part reset preserves every authored mesh position", () => {
  const placements = validateDesktopScene(desktopSceneSpec)
  expect(placements.map((placement) => placement.instanceId)).toContain("radio-main")
  expect(placements.map((placement) => placement.instanceId)).toContain("bulletin-board-main")
  const board = createBulletinBoardAssetDefinition().create(assetInstanceId("qa-board"))
  const before = new Box3().setFromObject(board.root)
  const positions = board.parts.map((part) => part.node.position.clone())
  let releases = 0
  const materials = new Set<Material>()
  board.root.traverse((object) => {
    if (object instanceof Mesh)
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material)
  })
  for (const material of materials)
    material.addEventListener("dispose", () => {
      releases++
    })
  board.setExplosion(1)
  expect(board.explosion).toBe(1)
  board.setExplosion(0)
  expect(
    board.parts.every((part, index) =>
      part.node.position.equals(positions[index] ?? part.node.position),
    ),
  ).toBe(true)
  expect(new Box3().setFromObject(board.root).equals(before)).toBe(true)
  board.dispose()
  board.dispose()
  expect(releases).toBe(materials.size)
})
