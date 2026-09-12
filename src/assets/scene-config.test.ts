import { describe, expect, test } from "bun:test"

import * as sceneConfig from "./scene-config"

import {
  compileDesktopScenePlacements,
  DESKTOP_TABLETOP_BOUNDS,
  desktopSceneSpecification,
  sceneConfiguration,
  validateDesktopSceneSpecification,
} from "./scene-config"

describe("sceneConfiguration legacy behavior", () => {
  test("returns the centered primary cyberdeck placement by default", () => {
    const placements = sceneConfiguration(false)

    expect(placements).toHaveLength(1)
    expect(placements[0]?.instanceId.value).toBe("cyberdeck-main")
    expect(placements[0]?.typeId.value).toBe("cyberdeck")
    expect(placements[0]?.position).toEqual([0, 0, 0])
    expect(placements[0]?.rotation).toEqual([0, -0.05, 0])
    expect(placements[0]?.scale).toBe(1)
  })

  test("returns the two legacy cyberdeck placements for multiple assets", () => {
    const placements = sceneConfiguration(true)

    expect(placements.map(({ instanceId }) => instanceId.value)).toEqual([
      "cyberdeck-alpha",
      "cyberdeck-beta",
    ])
    expect(placements.map(({ typeId }) => typeId.value)).toEqual(["cyberdeck", "cyberdeck"])
    expect(placements.map(({ position }) => position)).toEqual([
      [-5.3, 0, 0.25],
      [5.3, 0, -0.25],
    ])
    expect(placements.map(({ rotation }) => rotation)).toEqual([
      [0, 0.08, 0],
      [0, -0.12, 0],
    ])
    expect(placements.map(({ scale }) => scale)).toEqual([0.72, 0.72])
  })
})

const exportedValue = (name: string): unknown => Reflect.get(sceneConfig, name)

const exportedValidator = (): ((candidate: unknown) => unknown) | null => {
  const candidate = exportedValue("validateDesktopSceneSpecification")
  if (typeof candidate !== "function") return null
  return (input: unknown): unknown => Reflect.apply(candidate, undefined, [input])
}

const canonicalPlacements = (): readonly unknown[] => {
  const candidate = exportedValue("desktopSceneSpecification")
  return Array.isArray(candidate) ? candidate : []
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const property = (record: Record<string, unknown>, key: string): unknown => record[key]

const placementWith = (
  placement: unknown,
  changes: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (!isRecord(placement)) return null
  return { ...placement, ...changes }
}

const expectValidationCode = (candidate: unknown, code: string): void => {
  const validate = exportedValidator()
  expect(validate).not.toBeNull()
  if (validate === null) return

  let caught: unknown = null
  try {
    validate(candidate)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(Error)
  if (!(caught instanceof Error)) return
  expect("code" in caught).toBe(true)
  if (!("code" in caught)) return
  expect(caught.code).toBe(code)
}

describe("desktopSceneSpecification", () => {
  test("places four stable instances in the locked order", () => {
    const placements = desktopSceneSpecification

    expect(placements).toHaveLength(4)
    expect(placements.map(({ instanceId }) => instanceId)).toEqual([
      "computer-main",
      "desk-main",
      "phone-main",
      "radio-main",
    ])
    expect(placements.map(({ typeId }) => typeId)).toEqual([
      "cyberdeck",
      "cyber-desk",
      "phone",
      "ratio",
    ])
    expect(placements.map(({ socketLabel }) => socketLabel)).toEqual([
      "socket-desktop-asset-2",
      "environment",
      "socket-desktop-asset-1",
      "socket-desktop-asset-3",
    ])
    expect(placements.map(({ outerPosition }) => outerPosition)).toEqual([
      [0, 0.05, 0],
      [0, 0, 0],
      [-3, 0.05, 0],
      [3, 0.05, 0],
    ])
    expect(placements.map(({ outerRotation }) => outerRotation)).toEqual([
      [0, -0.05, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, Math.PI, 0],
    ])
    expect(placements.map(({ targetFootprint }) => targetFootprint)).toEqual([
      { kind: "bounded", x: 4.2, z: 2.2 },
      { kind: "authored" },
      { kind: "bounded", x: 0.9, z: 2.2 },
      { kind: "bounded", x: 1.7, z: 1.2 },
    ])
    expect(placements[1]?.innerAuthoredTransform).toEqual({
      appliesOnce: true,
      position: [0, -2.4775, 0],
      rotation: [0, 0, 0],
    })
    expect(placements[2]?.innerAuthoredTransform.rotation).toEqual([-Math.PI / 2, 0, 0])
    expect(placements[1]?.selectable).toBe(false)
    expect(placements[1]?.role).toBe("environment")
    expect(placements[1]?.outerScale).toBe(1)
    expect(DESKTOP_TABLETOP_BOUNDS).toEqual({ minX: -6, maxX: 6, minZ: -2.9, maxZ: 2.9 })
  })

  test("validates the canonical layout and compiles absolute host placements", () => {
    const validated = validateDesktopSceneSpecification(desktopSceneSpecification)
    const placements = compileDesktopScenePlacements(validated)

    expect(validated).toHaveLength(4)
    expect(placements.map(({ instanceId }) => instanceId.value)).toEqual([
      "computer-main",
      "desk-main",
      "phone-main",
      "radio-main",
    ])
    expect(placements.map(({ typeId }) => typeId.value)).toEqual([
      "cyberdeck",
      "cyber-desk",
      "phone",
      "ratio",
    ])
    expect(placements.map(({ position }) => position)).toEqual([
      [0, 0.05, 0],
      [0, 0, 0],
      [-3, 0.05, 0],
      [3, 0.05, 0],
    ])
  })

  test("rejects malformed validator payloads with a typed failure", () => {
    expectValidationCode(null, "invalid-input")
    expectValidationCode([null], "invalid-input")
  })

  test("remains inactive in the current root composition", async () => {
    const mainSource = await Bun.file(new URL("../main.ts", import.meta.url)).text()

    expect(mainSource).toContain("sceneConfiguration")
    expect(mainSource).not.toContain("compileDesktopScenePlacements")
    expect(mainSource).not.toContain("desktopSceneSpecification")
  })

  test("rejects a duplicate instance", () => {
    const placements = canonicalPlacements()
    expectValidationCode([...placements, placements[0]], "duplicate-instance")
  })

  test("rejects a missing required instance", () => {
    const placements = canonicalPlacements()
    expectValidationCode(
      placements.filter((placement) => {
        return !(isRecord(placement) && property(placement, "instanceId") === "radio-main")
      }),
      "missing-instance",
    )
  })

  test("rejects overlapping device bounds", () => {
    const placements = canonicalPlacements().map((placement) => {
      if (!(isRecord(placement) && property(placement, "instanceId") === "phone-main"))
        return placement
      return placementWith(placement, { outerPosition: [-2, 0.05, 0] })
    })
    expectValidationCode(placements, "overlap")
  })

  test("rejects a device outside the tabletop", () => {
    const placements = canonicalPlacements().map((placement) => {
      if (!(isRecord(placement) && property(placement, "instanceId") === "radio-main"))
        return placement
      return placementWith(placement, { outerPosition: [100, 0.05, 0] })
    })
    expectValidationCode(placements, "outside-tabletop")
  })
})
