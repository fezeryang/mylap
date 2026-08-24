import { describe, expect, test } from "bun:test"
import { Vector3 } from "three"

import { explodedPosition, keyboardRows } from "./part-layout"

describe("explodedPosition", () => {
  test("Given an outer part, when explosion is zero, then its authored position is preserved", () => {
    const authored = new Vector3(4, 1, -2)

    const result = explodedPosition(authored, 0, 0)

    expect(result.toArray()).toEqual([4, 1, -2])
  })

  test("Given an outer part, when exploded, then it scales away from the assembly centre", () => {
    const authored = new Vector3(-3, 2, 1)

    const result = explodedPosition(authored, 1, 0)

    expect(result.toArray()).toEqual([-6, 4, 2])
  })

  test("Given a central stack, when exploded, then clearance separates it on the thin axis", () => {
    const authored = new Vector3(0, 0, 0)

    const result = explodedPosition(authored, 1, 2)

    expect(result.toArray()).toEqual([0, 0, 2])
  })
})

describe("keyboardRows", () => {
  test("Given the reference layout, when generated, then it contains a dense six-row keyboard", () => {
    const rows = keyboardRows()

    expect(rows).toHaveLength(6)
    expect(rows.flat()).toHaveLength(74)
  })

  test("Given the bottom row, when generated, then the spacebar is the widest key", () => {
    const rows = keyboardRows()
    const bottomRow = rows.at(-1)
    if (bottomRow === undefined) throw new Error("keyboard rows unexpectedly empty")

    const widest = Math.max(...bottomRow.map((key) => key.width))

    expect(widest).toBe(4.4)
  })

  test("Given the physical layout, when codes are collected, then every bindable key is unique", () => {
    const keys = keyboardRows().flat()

    const codes = keys.flatMap((key) => (key.code === undefined ? [] : [key.code]))

    expect(codes).toHaveLength(72)
    expect(new Set(codes).size).toBe(72)
  })

  test("Given browser-standard keys, when mapped, then modifiers and functions stay distinct", () => {
    const keysByLabel = keyboardRows()
      .flat()
      .reduce<Record<string, readonly string[]>>((result, key) => {
        const current = result[key.label] ?? []
        return {
          ...result,
          [key.label]: [...current, ...(key.code === undefined ? [] : [key.code])],
        }
      }, {})

    expect(keysByLabel["AUX"]).toEqual(["F1"])
    expect(keysByLabel["PWR"]).toEqual(["F8"])
    expect(keysByLabel["SHIFT"]).toEqual(["ShiftLeft", "ShiftRight"])
    expect(keysByLabel["ALT"]).toEqual(["AltLeft", "AltRight"])
    expect(keysByLabel["FN"]).toEqual([])
    expect(keysByLabel["←"]).toEqual(["ArrowLeft"])
    expect(keysByLabel["→"]).toEqual(["ArrowRight"])
  })
})
