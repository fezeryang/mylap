import { describe, expect, test } from "bun:test"
import { createCyberDeskModel } from "./createCyberDesk"

describe("createCyberDeskModel", () => {
  test("publishes stable separable parts and desktop asset sockets", () => {
    const model = createCyberDeskModel()
    const runtime = model.userData.sculptRuntime

    expect(model.userData.assetTypeId).toBe("cyber-desk")
    expect(runtime.partManifest.length).toBe(19)
    expect(runtime.nodes.has("upper-shell")).toBe(true)
    expect(runtime.nodes.has("leg-left-front-upper")).toBe(true)
    expect(runtime.nodes.has("leg-right-rear-lower")).toBe(true)
    expect(runtime.sockets.has("socket-desktop-asset-1")).toBe(true)
    expect(runtime.sockets.has("socket-desktop-asset-5")).toBe(true)
    expect(runtime.colliders.has("collider-tabletop")).toBe(true)

    runtime.dispose()
  })

  test("explodes parts from their original layout and resets deterministically", () => {
    const model = createCyberDeskModel()
    const runtime = model.userData.sculptRuntime
    const part = runtime.nodes.get("leg-right-front-lower")
    expect(part).toBeDefined()
    if (part === undefined) throw new Error("Expected lower leg part")
    const rest = part.position.clone()

    runtime.setExplosion(1)
    expect(part.position.distanceTo(rest)).toBeGreaterThan(1)
    runtime.setExplosion(0)
    expect(part.position.distanceTo(rest)).toBeLessThan(0.000_001)

    runtime.dispose()
  })

  test("resolves surface relief to its owning selectable part", () => {
    const model = createCyberDeskModel()
    const runtime = model.userData.sculptRuntime
    const strip = runtime.meshes.get("leg-left-front-cyan-strip")
    expect(strip).toBeDefined()
    if (strip === undefined) throw new Error("Expected cyan leg strip")

    expect(runtime.resolvePart(strip)?.name).toBe("leg-left-front-upper")
    runtime.dispose()
  })
})
