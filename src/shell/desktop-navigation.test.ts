import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import {
  createDesktopNavigationController,
  cubicInOut,
  DESKTOP_NAVIGATION_POSES,
  type DesktopNavigationRequest,
  type DesktopNavigationState,
} from "./desktop-navigation"

const expectPose = (
  actual: { readonly position: readonly number[]; readonly target: readonly number[] },
  expected: { readonly position: readonly number[]; readonly target: readonly number[] },
): void => {
  actual.position.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.position[index] ?? 0, 12)
  })
  actual.target.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.target[index] ?? 0, 12)
  })
}

describe("desktop navigation state machine", () => {
  test("Given a new controller, when read, then it starts at the exact landing pose", () => {
    const navigation = createDesktopNavigationController({ reducedMotion: false })

    expect(navigation.read().state).toBe("landing")
    expectPose(navigation.read().pose, DESKTOP_NAVIGATION_POSES.landing)
    expect(navigation.read().interactionLocked).toBe(false)
  })

  test("Given landing, when entry advances, then entering lasts 1600ms with cubic midpoint", () => {
    const navigation = createDesktopNavigationController({ reducedMotion: false })
    navigation.advance(0)

    navigation.request("enter")
    expect(navigation.read().state).toBe("entering")
    expect(navigation.read().interactionLocked).toBe(true)
    navigation.advance(800)
    expect(navigation.read().progress).toBe(0.5)
    expectPose(navigation.read().pose, {
      position: [-3.4, 8.45, -15.25],
      target: [0, 0.5, 0],
    })
    navigation.advance(1600)
    expect(navigation.read().state).toBe("overview")
    expectPose(navigation.read().pose, DESKTOP_NAVIGATION_POSES.overview)
    expect(navigation.read().interactionLocked).toBe(false)
  })

  test.each([
    ["phone", "focusing-phone", "phone-focus", "phone"],
    ["computer", "focusing-computer", "computer-focus", "computer"],
  ] as const)(
    "Given overview, when %s focus advances, then it lasts 650ms and reaches the exact pose",
    (device, transition, stable, poseName) => {
      const navigation = createDesktopNavigationController({ reducedMotion: false })
      navigation.advance(0)
      navigation.request("enter")
      navigation.advance(1600)

      navigation.request(device === "phone" ? "focus-phone" : "focus-computer")
      expect(navigation.read().state).toBe(transition)
      navigation.advance(1925)
      expect(navigation.read().progress).toBe(0.5)
      expectPose(
        navigation.read().pose,
        device === "phone"
          ? { position: [-4.95, 4.055, -6.345], target: [-1.5, 0.325, 0] }
          : { position: [-3.4, 5.215, -8.185], target: [0, 0.65, 0] },
      )
      navigation.advance(2250)
      expect(navigation.read().state).toBe(stable)
      expectPose(navigation.read().pose, DESKTOP_NAVIGATION_POSES[poseName])
    },
  )

  test.each(["phone-focus", "computer-focus"] as const)(
    "Given %s, when return advances, then returning lasts 650ms and reaches overview",
    (focusState) => {
      const navigation = createDesktopNavigationController({ reducedMotion: false })
      navigation.advance(0)
      navigation.request(focusState === "phone-focus" ? "focus-phone" : "focus-computer")
      navigation.advance(650)

      navigation.request("return-overview")
      expect(navigation.read().state).toBe("returning")
      navigation.advance(975)
      expect(navigation.read().progress).toBe(0.5)
      expectPose(
        navigation.read().pose,
        focusState === "phone-focus"
          ? { position: [-4.95, 4.055, -6.345], target: [-1.5, 0.325, 0] }
          : { position: [-3.4, 5.215, -8.185], target: [0, 0.65, 0] },
      )
      navigation.advance(1300)
      expect(navigation.read().state).toBe("overview")
      expectPose(navigation.read().pose, DESKTOP_NAVIGATION_POSES.overview)
    },
  )

  test("Given a transition, when superseded, then only the newest request settles", () => {
    const settled: DesktopNavigationState[] = []
    const lockChanges: boolean[] = []
    const navigation = createDesktopNavigationController({
      onInteractionLockChange: (locked) => lockChanges.push(locked),
      onSettled: (state) => settled.push(state),
      reducedMotion: false,
    })
    navigation.advance(0)

    navigation.request("enter")
    navigation.advance(400)
    navigation.request("focus-phone")
    navigation.advance(700)
    navigation.request("focus-computer")
    navigation.advance(1349)
    expect(navigation.read().state).toBe("focusing-computer")
    navigation.advance(1350)

    expect(navigation.read().state).toBe("computer-focus")
    expect(settled).toEqual(["computer-focus"])
    expect(lockChanges).toEqual([true, false])
  })

  test.each([
    ["enter", "overview"],
    ["return-overview", "overview"],
    ["focus-phone", "phone-focus"],
    ["focus-computer", "computer-focus"],
  ] as const)(
    "Given a stable %s destination, when requested again, then the request is idempotent",
    (request: DesktopNavigationRequest, expectedState: DesktopNavigationState) => {
      const settled: DesktopNavigationState[] = []
      const navigation = createDesktopNavigationController({
        onSettled: (state) => settled.push(state),
        reducedMotion: true,
      })
      navigation.request(request)
      const settledCount = settled.length

      navigation.request(request)

      expect(navigation.read().state).toBe(expectedState)
      expect(settled).toHaveLength(settledCount)
    },
  )

  test("Given malformed or non-monotonic frame time, when advanced, then it is ignored", () => {
    const navigation = createDesktopNavigationController({ reducedMotion: false })
    navigation.advance(100)
    navigation.request("enter")
    navigation.advance(500)
    const before = navigation.read()

    navigation.advance(Number.NaN)
    navigation.advance(Number.POSITIVE_INFINITY)
    navigation.advance(-1)
    navigation.advance(500)
    navigation.advance(499)

    expect(navigation.read()).toEqual(before)
    navigation.advance(1700)
    expect(navigation.read().state).toBe("overview")
  })

  test("Given reduced motion, when requested, then every destination settles synchronously", () => {
    const settled: DesktopNavigationState[] = []
    const lockChanges: boolean[] = []
    const navigation = createDesktopNavigationController({
      onInteractionLockChange: (locked) => lockChanges.push(locked),
      onSettled: (state) => settled.push(state),
      reducedMotion: true,
    })

    navigation.request("enter")
    expect(navigation.read().state).toBe("overview")
    navigation.request("focus-phone")
    expect(navigation.read().state).toBe("phone-focus")
    navigation.request("focus-computer")
    expect(navigation.read().state).toBe("computer-focus")
    navigation.request("return-overview")

    expect(navigation.read().state).toBe("overview")
    expect(settled).toEqual(["overview", "phone-focus", "computer-focus", "overview"])
    expect(lockChanges).toEqual([])
  })

  test("Given a running transition, when disposed, then lock restores once and callbacks stop", () => {
    const settled: DesktopNavigationState[] = []
    const lockChanges: boolean[] = []
    const navigation = createDesktopNavigationController({
      onInteractionLockChange: (locked) => lockChanges.push(locked),
      onSettled: (state) => settled.push(state),
      reducedMotion: false,
    })
    navigation.advance(0)
    navigation.request("enter")

    navigation.dispose()
    navigation.dispose()
    navigation.advance(1600)
    navigation.request("focus-phone")

    expect(lockChanges).toEqual([true, false])
    expect(settled).toEqual([])
  })

  test("Given cubic-in-out, when sampled, then endpoints and midpoint are exact", () => {
    expect(cubicInOut(0)).toBe(0)
    expect(cubicInOut(0.25)).toBe(0.0625)
    expect(cubicInOut(0.5)).toBe(0.5)
    expect(cubicInOut(0.75)).toBe(0.9375)
    expect(cubicInOut(1)).toBe(1)
  })

  test("Given navigation sources, when inspected, then they schedule no second frame loop or timer", async () => {
    const sources = await Promise.all(
      [
        join(import.meta.dir, "desktop-navigation.ts"),
        join(import.meta.dir, "desktop-navigation-binding.ts"),
        join(import.meta.dir, "../viewer/viewer-rendering.ts"),
      ].map((path) => Bun.file(path).text()),
    )

    expect(sources.every((source) => !source.includes("requestAnimationFrame"))).toBe(true)
    expect(sources.every((source) => !source.includes("setAnimationLoop"))).toBe(true)
    expect(sources.every((source) => !source.includes("setTimeout"))).toBe(true)
  })
})
