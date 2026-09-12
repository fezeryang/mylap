import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three"

import { assetInstanceId } from "../runtime/ids"
import { InvalidAssetBoundsError, normalizeAuthoredAssetRoot } from "./asset-normalization"
import { cyberdeckAssetDefinition } from "./cyberdeck-asset"

const createCanvasContext = (): object =>
  new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "measureText") return () => ({ width: 0 })
        return () => undefined
      },
      set: () => true,
    },
  )

const createCanvas = (): object => ({
  getContext: () => createCanvasContext(),
  height: 0,
  width: 0,
})

const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document")
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")

const installBrowserGlobals = (): void => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => createCanvas() },
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  })
}

const restoreGlobal = (
  name: "document" | "window",
  descriptor: PropertyDescriptor | undefined,
): void => {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name)
    return
  }
  Object.defineProperty(globalThis, name, descriptor)
}

const transformState = (root: Group) => ({
  matrix: root.matrix.elements.slice(),
  matrixAutoUpdate: root.matrixAutoUpdate,
  matrixWorld: root.matrixWorld.elements.slice(),
  matrixWorldAutoUpdate: root.matrixWorldAutoUpdate,
  matrixWorldNeedsUpdate: root.matrixWorldNeedsUpdate,
  position: root.position.toArray(),
  quaternion: root.quaternion.toArray(),
  rotation: root.rotation.toArray(),
  scale: root.scale.toArray(),
})

beforeEach(installBrowserGlobals)
afterEach(() => {
  restoreGlobal("document", documentDescriptor)
  restoreGlobal("window", windowDescriptor)
})

describe("cyberdeckAssetDefinition", () => {
  test("Given a production cyberdeck adapter, when created, then its footprint fits 4.2 by 2.2", () => {
    const asset = cyberdeckAssetDefinition.create(assetInstanceId("computer-main"))
    const bounds = new Box3().setFromObject(asset.root)
    const footprint = bounds.getSize(new Vector3())

    expect(footprint.x).toBeLessThanOrEqual(4.201)
    expect(footprint.z).toBeLessThanOrEqual(2.201)
    expect(Math.min(Math.abs(footprint.x - 4.2), Math.abs(footprint.z - 2.2))).toBeLessThanOrEqual(
      0.001,
    )
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(asset.root.scale.x).toBe(asset.root.scale.y)
    expect(asset.root.scale.y).toBe(asset.root.scale.z)
    expect(asset.root.children).toHaveLength(1)
    const authoredContent = asset.root.children[0]
    if (authoredContent === undefined)
      throw new Error("Cyberdeck adapter did not create authored content")
    expect(asset.parts.map((part) => part.id)).toContain("cyberdeck-root")
    expect(asset.screens.map((screen) => screen.screenId.value)).toEqual([
      "main",
      "left-wing",
      "right-wing",
    ])
    expect(
      asset.parts.every((part) => authoredContent.getObjectById(part.node.id) === part.node),
    ).toBe(true)
    expect(
      asset.selectable.every(
        (selectable) => authoredContent.getObjectById(selectable.id) === selectable,
      ),
    ).toBe(true)
    for (const screen of asset.screens) {
      expect(authoredContent.children.includes(screen.anchor)).toBe(false)
      expect(authoredContent.getObjectById(screen.anchor.id)).toBe(screen.anchor)
    }

    asset.dispose()
  })

  test("Given a production cyberdeck adapter, when disposed twice, then each geometry disposes once", () => {
    const asset = cyberdeckAssetDefinition.create(assetInstanceId("computer-main"))
    const mesh = asset.selectable.find(
      (selectable): selectable is Mesh => selectable instanceof Mesh,
    )
    if (mesh === undefined) throw new Error("Cyberdeck adapter did not expose a selectable mesh")
    const originalDispose = mesh.geometry.dispose.bind(mesh.geometry)
    let disposalCount = 0
    mesh.geometry.dispose = () => {
      disposalCount += 1
      originalDispose()
    }

    asset.dispose()
    asset.dispose()

    expect(disposalCount).toBe(1)
  })
})

describe("normalizeAuthoredAssetRoot", () => {
  test("Given rotated authored content, when normalized, then orientation is measured before scaling", () => {
    const authoredRoot = new Group()
    authoredRoot.add(new Mesh(new BoxGeometry(1, 1, 5), new MeshBasicMaterial()))
    const normalized = normalizeAuthoredAssetRoot({
      authoredRoot,
      authoredRotation: [0, Math.PI / 2, 0],
      targetFootprint: { x: 4, z: 2 },
    })
    const bounds = new Box3().setFromObject(normalized.root)
    const footprint = bounds.getSize(new Vector3())

    expect(footprint.x).toBeCloseTo(4, 6)
    expect(footprint.z).toBeCloseTo(0.8, 6)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(normalized.authoredContent.scale.x).toBe(normalized.authoredContent.scale.y)
    expect(normalized.authoredContent.scale.y).toBe(normalized.authoredContent.scale.z)
  })

  test("Given empty authored content, when normalized, then it rejects before reparenting or transforms", () => {
    const authoredRoot = new Group()
    const originalPosition = authoredRoot.position.clone()
    const originalRotation = authoredRoot.rotation.clone()

    expect(() =>
      normalizeAuthoredAssetRoot({
        authoredRoot,
        authoredRotation: [0, 0, 0],
        targetFootprint: { x: 4.2, z: 2.2 },
      }),
    ).toThrow(InvalidAssetBoundsError)
    expect(authoredRoot.parent).toBeNull()
    expect(authoredRoot.position.equals(originalPosition)).toBe(true)
    expect(authoredRoot.rotation.equals(originalRotation)).toBe(true)
  })

  test("Given non-finite or degenerate content, when normalized, then it rejects before reparenting", () => {
    const nonFiniteRoot = new Group()
    const nonFiniteMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    nonFiniteMesh.position.x = Number.POSITIVE_INFINITY
    nonFiniteRoot.add(nonFiniteMesh)
    const degenerateRoot = new Group()
    degenerateRoot.add(new Mesh(new BoxGeometry(0, 1, 1), new MeshBasicMaterial()))

    expect(() =>
      normalizeAuthoredAssetRoot({
        authoredRoot: nonFiniteRoot,
        authoredRotation: [0, 0, 0],
        targetFootprint: { x: 4.2, z: 2.2 },
      }),
    ).toThrow(InvalidAssetBoundsError)
    expect(() =>
      normalizeAuthoredAssetRoot({
        authoredRoot: degenerateRoot,
        authoredRotation: [0, 0, 0],
        targetFootprint: { x: 4.2, z: 2.2 },
      }),
    ).toThrow(InvalidAssetBoundsError)
    expect(nonFiniteRoot.parent).toBeNull()
    expect(degenerateRoot.parent).toBeNull()
  })

  test("Given invalid content between siblings, when normalization rejects, then hierarchy and transforms restore exactly", () => {
    const parent = new Group()
    const before = new Group()
    const authoredRoot = new Group()
    const after = new Group()
    const nonFiniteMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    nonFiniteMesh.position.x = Number.POSITIVE_INFINITY
    authoredRoot.name = "authored-root"
    authoredRoot.position.set(1.25, -2.5, 3.75)
    authoredRoot.rotation.set(0.25, -0.5, 0.75)
    authoredRoot.scale.set(1.5, 2.5, 3.5)
    authoredRoot.matrixAutoUpdate = false
    authoredRoot.matrix.makeTranslation(9, 8, 7)
    authoredRoot.matrixWorld.makeTranslation(6, 5, 4)
    authoredRoot.matrixWorldAutoUpdate = false
    authoredRoot.matrixWorldNeedsUpdate = false
    authoredRoot.add(nonFiniteMesh)
    parent.add(before, authoredRoot, after)
    const beforeState = transformState(authoredRoot)

    expect(() =>
      normalizeAuthoredAssetRoot({
        authoredRoot,
        authoredRotation: [0, 0, 0],
        targetFootprint: { x: 4.2, z: 2.2 },
      }),
    ).toThrow(InvalidAssetBoundsError)
    expect(authoredRoot.parent).toBe(parent)
    expect(parent.children).toEqual([before, authoredRoot, after])
    expect(transformState(authoredRoot)).toEqual(beforeState)
  })

  test("Given measurement throws, when normalization unwinds, then hierarchy and transforms restore exactly", () => {
    const parent = new Group()
    const before = new Group()
    const authoredRoot = new Group()
    const after = new Group()
    authoredRoot.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
    parent.add(before, authoredRoot, after)
    authoredRoot.position.set(2, 3, 4)
    authoredRoot.rotation.set(0.1, 0.2, 0.3)
    authoredRoot.scale.set(1.2, 1.3, 1.4)
    authoredRoot.updateMatrix()
    authoredRoot.updateMatrixWorld(true)
    const beforeState = transformState(authoredRoot)
    const originalUpdateWorldMatrix = authoredRoot.updateWorldMatrix.bind(authoredRoot)
    authoredRoot.updateWorldMatrix = () => {
      throw new Error("measurement failure")
    }

    expect(() =>
      normalizeAuthoredAssetRoot({
        authoredRoot,
        authoredRotation: [0, 0, 0],
        targetFootprint: { x: 4.2, z: 2.2 },
      }),
    ).toThrow("measurement failure")
    authoredRoot.updateWorldMatrix = originalUpdateWorldMatrix
    expect(authoredRoot.parent).toBe(parent)
    expect(parent.children).toEqual([before, authoredRoot, after])
    expect(transformState(authoredRoot)).toEqual(beforeState)
  })
})
