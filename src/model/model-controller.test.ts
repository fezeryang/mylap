import { describe, expect, test } from "bun:test"
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three"

import type {
  AssetPlacement,
  SceneAssetDefinition,
  ScreenSurface,
  StageAsset,
} from "../runtime/asset-contracts"
import { AssetRegistry } from "../runtime/asset-registry"
import { AssetStage } from "../runtime/asset-stage"
import { assetInstanceId, assetTypeId, screenAppId, screenId } from "../runtime/ids"
import { type ControllerElements, ModelController } from "./model-controller"

class TestButton {
  disabled = false
  textContent: string | null = ""
  private readonly listeners = new Set<() => void>()
  private readonly attributes = new Map<string, string>()

  addEventListener(type: "click", listener: () => void): void {
    if (type === "click") this.listeners.add(listener)
  }

  click(): void {
    this.listeners.forEach((listener) => {
      listener()
    })
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  removeEventListener(type: "click", listener: () => void): void {
    if (type === "click") this.listeners.delete(listener)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
}

class TestCanvas {
  private readonly pointerDownListeners = new Set<
    (event: { readonly clientX: number; readonly clientY: number }) => void
  >()
  private readonly pointerUpListeners = new Set<
    (event: { readonly clientX: number; readonly clientY: number }) => void
  >()

  addEventListener(
    type: "pointerdown" | "pointerup",
    listener: (event: { readonly clientX: number; readonly clientY: number }) => void,
  ): void {
    this.listenersFor(type).add(listener)
  }

  getBoundingClientRect(): {
    readonly height: number
    readonly left: number
    readonly top: number
    readonly width: number
  } {
    return { height: 800, left: 0, top: 0, width: 1000 }
  }

  pointerDown(x: number, y: number): void {
    this.pointerDownListeners.forEach((listener) => {
      listener(pointerEvent(x, y))
    })
  }

  pointerUp(x: number, y: number): void {
    this.pointerUpListeners.forEach((listener) => {
      listener(pointerEvent(x, y))
    })
  }

  removeEventListener(
    type: "pointerdown" | "pointerup",
    listener: (event: { readonly clientX: number; readonly clientY: number }) => void,
  ): void {
    this.listenersFor(type).delete(listener)
  }

  private listenersFor(
    type: "pointerdown" | "pointerup",
  ): Set<(event: { readonly clientX: number; readonly clientY: number }) => void> {
    return type === "pointerdown" ? this.pointerDownListeners : this.pointerUpListeners
  }
}

class TestRange {
  value = "0"
  private readonly listeners = new Set<() => void>()

  addEventListener(type: "input", listener: () => void): void {
    if (type === "input") this.listeners.add(listener)
  }

  removeEventListener(type: "input", listener: () => void): void {
    if (type === "input") this.listeners.delete(listener)
  }
}

const pointerEvent = (
  clientX: number,
  clientY: number,
): { readonly clientX: number; readonly clientY: number } => ({
  clientX,
  clientY,
})

const placement = (
  typeId: ReturnType<typeof assetTypeId>,
  instance: string,
  x: number,
): AssetPlacement => ({
  instanceId: assetInstanceId(instance),
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  typeId,
})

const screen = (id: string): ScreenSurface => {
  const anchor = new Group()
  const hitProxy = new Group()
  const occlusionRoot = new Group()
  return {
    anchor,
    defaultAppId: screenAppId("test-app"),
    hitProxy,
    occlusionRoot,
    pixelSize: { height: 1, width: 1 },
    screenId: screenId(id),
    worldSize: { height: 1, width: 1 },
  }
}

const fixtureDefinition = (
  type: string,
  partId: string | null,
  screens: readonly ScreenSurface[],
): SceneAssetDefinition => {
  const typeId = assetTypeId(type)
  return {
    create: (instanceId): StageAsset => {
      const root = new Group()
      const part = new Group()
      const nested = new Group()
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: "#34d9ff" }))
      root.add(part)
      part.add(nested)
      nested.add(mesh)
      return {
        dispose: () => {
          mesh.geometry.dispose()
          mesh.material.dispose()
        },
        explosion: 0,
        instanceId,
        parts:
          partId === null
            ? []
            : [{ authoredPosition: new Vector3(), centralClearance: 0, id: partId, node: part }],
        root,
        screens,
        selectable: [mesh],
        setExplosion: () => undefined,
        typeId,
        update: () => undefined,
      }
    },
    typeId,
  }
}

const canvasPoint = (camera: PerspectiveCamera, object: Mesh): readonly [number, number] => {
  const projected = object.getWorldPosition(new Vector3()).project(camera)
  return [(projected.x + 1) * 500, (1 - projected.y) * 400]
}

const createFixture = () => {
  const scene = new Scene()
  const registry = new AssetRegistry()
  const phoneType = assetTypeId("phone-shaped-fixture")
  const radioType = assetTypeId("radio-shaped-fixture")
  const deskType = assetTypeId("screenless-desk-fixture")
  registry.register(
    fixtureDefinition(phoneType.value, "phone-primary-body", [screen("phone-primary")]),
  )
  registry.register(
    fixtureDefinition(radioType.value, "radio-tuner-casing", [screen("radio-primary")]),
  )
  registry.register(fixtureDefinition(deskType.value, null, []))
  const stage = new AssetStage(scene, registry)
  const phone = stage.mount(placement(phoneType, "phone-main", -2))
  const radio = stage.mount(placement(radioType, "radio-main", 2))
  const desk = stage.mount(placement(deskType, "desk-main", 0))
  const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  scene.updateMatrixWorld(true)
  const canvas = new TestCanvas()
  const screenPower = new TestButton()
  const elements: ControllerElements = {
    autoRotate: new TestButton(),
    canvas,
    explode: new TestRange(),
    partMeta: { textContent: "" },
    partTitle: { textContent: "" },
    resetView: new TestButton(),
    screenPower,
  }
  const picks: string[] = []
  let powerToggles = 0
  const controller = new ModelController({
    camera,
    controls: { autoRotate: false },
    elements,
    onAssetPick: (pick) => picks.push(`${pick.instanceId.value}:${pick.partId}`),
    onSelection: () => undefined,
    resetCamera: () => undefined,
    scene,
    screens: {
      isPowered: () => true,
      togglePower: () => {
        powerToggles += 1
        return true
      },
    },
    stage,
  })
  const meshFor = (asset: StageAsset): Mesh => {
    const mesh = asset.selectable[0]
    if (!(mesh instanceof Mesh)) throw new Error("Fixture selectable must be a mesh")
    return mesh
  }
  return {
    canvas,
    controller,
    desk,
    elements,
    meshFor,
    phone,
    picks,
    radio,
    readPowerToggles: () => powerToggles,
    scene,
    screenPower,
    stage,
  }
}

const click = (canvas: TestCanvas, camera: PerspectiveCamera, mesh: Mesh): void => {
  const [x, y] = canvasPoint(camera, mesh)
  canvas.pointerDown(x, y)
  canvas.pointerUp(x, y)
}

describe("ModelController", () => {
  test("Given declared phone and radio descendant meshes with arbitrary names, when clicked, then stable asset picks select their declared parts", () => {
    const fixture = createFixture()
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    click(fixture.canvas, camera, fixture.meshFor(fixture.phone))
    click(fixture.canvas, camera, fixture.meshFor(fixture.radio))

    expect(fixture.picks).toEqual([
      "phone-main:phone-primary-body",
      "radio-main:radio-tuner-casing",
    ])
    expect(fixture.stage.active?.instanceId.value).toBe("radio-main")
    expect(fixture.scene.getObjectByName("selection-outline")).not.toBeNull()
  })

  test("Given a selected declared part, when the active asset changes or selection asset is removed, then no stale outline remains", () => {
    const fixture = createFixture()
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    click(fixture.canvas, camera, fixture.meshFor(fixture.phone))

    fixture.stage.activate(assetInstanceId("radio-main"))
    const afterActiveChange = fixture.scene.getObjectByName("selection-outline")
    fixture.stage.remove(assetInstanceId("radio-main"))

    expect(afterActiveChange).toBeUndefined()
    expect(fixture.scene.getObjectByName("selection-outline")).toBeUndefined()
  })

  test("Given a selected phone, when a screenless desk or outside is clicked, then activation selection and helper state stay unchanged", () => {
    const fixture = createFixture()
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    click(fixture.canvas, camera, fixture.meshFor(fixture.phone))
    const initialHelper = fixture.scene.getObjectByName("selection-outline")
    click(fixture.canvas, camera, fixture.meshFor(fixture.desk))
    fixture.canvas.pointerDown(10, 10)
    fixture.canvas.pointerUp(10, 10)

    expect(fixture.stage.active?.instanceId.value).toBe("phone-main")
    expect(fixture.scene.getObjectByName("selection-outline")).toBe(initialHelper)
  })

  test("Given a screenless active asset, when controls synchronize, then screen power is disabled without toggling runtime power", () => {
    const fixture = createFixture()

    fixture.stage.activate(assetInstanceId("desk-main"))
    fixture.screenPower.click()

    expect(fixture.screenPower.disabled).toBe(true)
    expect(fixture.screenPower.getAttribute("aria-pressed")).toBe("false")
    expect(fixture.screenPower.textContent).toBe("NO SCREENS")
    expect(fixture.readPowerToggles()).toBe(0)
  })
})
