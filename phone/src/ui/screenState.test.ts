import { describe, expect, test } from "bun:test"
import { initialScreenState, reduceScreenState } from "./screenState"

describe("reduceScreenState", () => {
  test("launches an app while keeping the display powered", () => {
    // Given
    const initial = initialScreenState()

    // When
    const next = reduceScreenState(initial, { kind: "launch-app", app: "camera" })

    // Then
    expect(next).toEqual({ power: "on", activeApp: "camera" })
  })

  test("clears the active app when the display powers off", () => {
    // Given
    const running = { power: "on", activeApp: "radio" } as const

    // When
    const next = reduceScreenState(running, { kind: "toggle-power" })

    // Then
    expect(next).toEqual({ power: "off", activeApp: null })
  })
})
