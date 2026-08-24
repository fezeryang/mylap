import { describe, expect, test } from "bun:test"
import { BoxGeometry, Mesh, MeshPhysicalMaterial, Vector3 } from "three"

import type { KeyboardBinding } from "./asset-contracts"
import { KeyboardController } from "./keyboard-controller"
import { KeyboardRouter } from "./keyboard-router"

const keyboardFixture = (): {
  readonly binding: KeyboardBinding
  readonly keyboard: KeyboardController
} => {
  const material = new MeshPhysicalMaterial({ color: 0xffffff })
  const keycap = new Mesh(new BoxGeometry(1, 1, 1), material)
  keycap.position.set(0, 0.2, 0)
  const binding: KeyboardBinding = {
    code: "KeyQ",
    glowIntensity: 0.75,
    keycap,
    material,
    restPosition: new Vector3(0, 0.2, 0),
    travel: 0.075,
  }
  return { binding, keyboard: new KeyboardController([binding]) }
}

describe("KeyboardController", () => {
  test("Given a mapped key, when pressed and updated, then it moves down and glows", () => {
    const { binding, keyboard } = keyboardFixture()

    keyboard.press("KeyQ")
    keyboard.update(1)

    expect(binding.keycap.position.y).toBeCloseTo(0.125, 3)
    expect(binding.material.emissiveIntensity).toBeCloseTo(0.75, 3)
    expect(binding.keycap.userData["pressed"]).toBe(true)
  })

  test("Given a held key, when released, then it returns without accumulating travel", () => {
    const { binding, keyboard } = keyboardFixture()
    keyboard.press("KeyQ")
    keyboard.press("KeyQ")
    keyboard.update(1)

    keyboard.release("KeyQ")
    keyboard.update(1)

    expect(binding.keycap.position.y).toBeCloseTo(0.2, 3)
    expect(binding.material.emissiveIntensity).toBeCloseTo(0, 3)
  })
})

describe("KeyboardRouter", () => {
  test("Given a held key, when the active asset changes, then the previous keyboard is released", () => {
    const first = keyboardFixture()
    const second = keyboardFixture()
    const router = new KeyboardRouter()
    router.setActive(first.keyboard)
    router.handleKeyDown("KeyQ", false)

    router.setActive(second.keyboard)

    expect(first.keyboard.pressedCodes).toEqual([])
    expect(second.keyboard.pressedCodes).toEqual([])
  })

  test("Given auto-repeat and page hiding, when routed, then repeat is ignored and held keys clear", () => {
    const { keyboard } = keyboardFixture()
    const router = new KeyboardRouter()
    router.setActive(keyboard)
    router.handleKeyDown("KeyQ", false)
    router.handleKeyDown("KeyQ", true)

    router.handlePageVisibility(false)

    expect(keyboard.pressedCodes).toEqual([])
  })
})
