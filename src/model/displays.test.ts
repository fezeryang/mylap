import { describe, expect, test } from "bun:test"
import { Group, Mesh, PlaneGeometry } from "three"

import { screenAppId } from "../runtime/ids"
import { buildDisplays } from "./displays"
import { createCyberdeckMaterials } from "./materials"
import { PartBuilder } from "./part-builder"

const buildFixture = () => {
  const builder = new PartBuilder()
  const root = new Group()
  const displays = buildDisplays({
    apps: {
      left: screenAppId("test-left"),
      main: screenAppId("test-main"),
      right: screenAppId("test-right"),
    },
    builder,
    materials: createCyberdeckMaterials(),
    root,
  })
  return { builder, displays }
}

describe("buildDisplays", () => {
  test("Given three app IDs, when built, then surfaces keep stable order and routing", () => {
    const { displays } = buildFixture()

    expect(displays.screens.map((surface) => surface.screenId.value)).toEqual([
      "main",
      "left-wing",
      "right-wing",
    ])
    expect(displays.screens.map((surface) => surface.defaultAppId.value)).toEqual([
      "test-main",
      "test-left",
      "test-right",
    ])
    expect(displays.screens.map((surface) => surface.pixelSize)).toEqual([
      { height: 720, width: 1280 },
      { height: 560, width: 800 },
      { height: 560, width: 800 },
    ])
    expect(displays.screens.map((surface) => surface.worldSize)).toEqual([
      { height: 5.3, width: 9.28 },
      { height: 2.38, width: 3.35 },
      { height: 2.38, width: 3.35 },
    ])
  })

  test("Given screen surfaces, when inspected, then anchors and hit proxies remain connected", () => {
    const { displays } = buildFixture()

    for (const surface of displays.screens) {
      expect(surface.hitProxy.parent).toBe(surface.anchor)
      expect(surface.anchor.parent?.parent).toBe(surface.occlusionRoot)
      expect(surface.hitProxy.userData["explodeWithParent"]).toBe(true)
      expect(surface.hitProxy.userData["screenHitProxy"]).toBe(true)
      expect(surface.hitProxy).toBeInstanceOf(Mesh)
      expect((surface.hitProxy as Mesh).geometry).toBeInstanceOf(PlaneGeometry)
    }
    expect(displays.screens.map((surface) => surface.anchor.name)).toEqual([
      "main-screen-ui",
      "left-screen-ui",
      "right-screen-ui",
    ])
    expect(displays.screens.map((surface) => surface.occlusionRoot.name)).toEqual([
      "main-lid-shell",
      "left-wing-shell",
      "right-wing-shell",
    ])
  })

  test("Given display geometry, when registered, then selectable part IDs retain creation order", () => {
    const { builder } = buildFixture()

    expect(builder.parts.map((part) => part.id)).toEqual([
      "main-display-assembly",
      "main-lid-shell",
      "main-screen",
      "main-screen-ui",
      "camera-module",
      "main-hinge",
      "left-display-assembly",
      "left-wing-shell",
      "left-screen",
      "left-screen-ui",
      "left-wing-joint",
      "right-display-assembly",
      "right-wing-shell",
      "right-screen",
      "right-screen-ui",
      "right-wing-joint",
    ])
  })
})
