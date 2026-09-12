import { describe, expect, test } from "bun:test"
import { Object3D, Vector3 } from "three"
import { explodedPosition, PART_IDS, resolvePartId } from "./parts"

describe("radio part identity", () => {
  test("Given the authored catalog, when IDs are enumerated, then every selectable part is unique", () => {
    const uniqueIds = new Set(PART_IDS)

    expect(uniqueIds.size).toBe(PART_IDS.length)
    expect(PART_IDS.length).toBeGreaterThanOrEqual(25)
    expect(uniqueIds.has("dish-antenna")).toBe(true)
    expect(uniqueIds.has("cassette-reels")).toBe(true)
  })

  test("Given an authored position, when explosion is neutral, then the position is preserved", () => {
    const origin = new Vector3(2.4, -1.1, 0.6)

    expect(explodedPosition(origin, 1)).toEqual(origin)
    expect(origin).toEqual(new Vector3(2.4, -1.1, 0.6))
  })

  test("Given a nested mesh, when resolving selection, then the nearest authored part is returned", () => {
    const part = new Object3D()
    const mesh = new Object3D()
    part.userData["partId"] = "tuning-dial"
    part.add(mesh)

    expect(resolvePartId(mesh)).toBe("tuning-dial")
  })
})
