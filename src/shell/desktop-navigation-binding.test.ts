import { describe, expect, test } from "bun:test"
import { PerspectiveCamera, Vector3 } from "three"

import { createDesktopNavigationBinding } from "./desktop-navigation-binding"

class FakeControls {
  readonly target = new Vector3()
  enabled = true
  updateCalls = 0

  update(): void {
    this.updateCalls += 1
  }
}

describe("desktop navigation camera binding", () => {
  test("Given a Three camera and controls, when advanced, then exact pose and flags are bound", () => {
    const camera = new PerspectiveCamera()
    const controls = new FakeControls()
    const input = { enabled: true }
    const navigation = createDesktopNavigationBinding({
      camera,
      controls,
      input,
      reducedMotion: false,
    })
    navigation.advance(0)

    navigation.request("enter")
    expect(controls.enabled).toBe(false)
    expect(input.enabled).toBe(false)
    navigation.advance(800)

    expect(camera.position.toArray()).toEqual([-8, 11, -36])
    expect(controls.target.toArray()).toEqual([-5, -0.8, 0])
    navigation.advance(1600)
    expect(controls.enabled).toBe(true)
    expect(input.enabled).toBe(true)
    expect(controls.updateCalls).toBe(3)
  })

  test("Given pre-disabled controls and input, when a transition settles, then prior flags restore once", () => {
    const camera = new PerspectiveCamera()
    const controls = new FakeControls()
    controls.enabled = false
    const input = { enabled: false }
    const navigation = createDesktopNavigationBinding({
      camera,
      controls,
      input,
      reducedMotion: false,
    })
    navigation.advance(0)

    navigation.request("focus-phone")
    navigation.request("focus-computer")
    navigation.advance(650)

    expect(controls.enabled).toBe(false)
    expect(input.enabled).toBe(false)
  })

  test("Given a disposed binding, when advanced, then camera and controls receive no callback", () => {
    const camera = new PerspectiveCamera()
    const controls = new FakeControls()
    const input = { enabled: true }
    const navigation = createDesktopNavigationBinding({
      camera,
      controls,
      input,
      reducedMotion: false,
    })
    navigation.advance(0)
    navigation.request("enter")
    navigation.dispose()
    const pose = camera.position.toArray()
    const updateCalls = controls.updateCalls

    navigation.advance(1600)

    expect(camera.position.toArray()).toEqual(pose)
    expect(controls.updateCalls).toBe(updateCalls)
    expect(controls.enabled).toBe(true)
    expect(input.enabled).toBe(true)
  })
})
