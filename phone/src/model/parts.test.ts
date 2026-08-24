import { describe, expect, test } from "bun:test"
import { Group, Mesh, Object3D, Vector3 } from "three"
import { explodedPosition, resolvePartId } from "./parts"

describe("explodedPosition", () => {
  test("scales a part away from the model centre while preserving its direction", () => {
    // Given
    const origin = new Vector3(2, -1, 0.5)

    // When
    const exploded = explodedPosition(origin, 2)

    // Then
    expect(exploded.toArray()).toEqual([4, -2, 1])
  })
})

describe("resolvePartId", () => {
  test("resolves surface relief to its named owning part", () => {
    // Given
    const part = new Group()
    part.name = "metal-chassis"
    part.userData["partId"] = "metal-chassis"
    const relief = new Mesh()
    relief.userData["explodeWithParent"] = true
    part.add(relief)

    // When
    const resolved = resolvePartId(relief)

    // Then
    expect(resolved).toBe("metal-chassis")
  })

  test("returns null when the object is outside the authored part hierarchy", () => {
    // Given
    const anonymous = new Object3D()

    // When
    const resolved = resolvePartId(anonymous)

    // Then
    expect(resolved).toBeNull()
  })
})
