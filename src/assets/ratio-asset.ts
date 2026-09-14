import { Group, MathUtils, Mesh, MeshBasicMaterial, PlaneGeometry } from "three"

import { createRadioModel, disposeRadioModel } from "../../ratio/src/model/createRadioModel"
import type { RadioModel } from "../../ratio/src/model/modelTypes"
import { RATIO_CASSETTE_DISPLAY_APP_ID, RATIO_TUNER_DISPLAY_APP_ID } from "../apps/app-ids"
import type { AssetPart, SceneAssetDefinition, StageAsset } from "../runtime/asset-contracts"
import { assetTypeId, screenId } from "../runtime/ids"
import type { RadioSnapshot } from "../services/radio-contracts"
import { InvalidAssetBoundsError, normalizeAuthoredAssetRoot } from "./asset-normalization"

export const RATIO_ASSET_TYPE_ID = assetTypeId("ratio")
export const RATIO_TARGET_FOOTPRINT = { x: 1.7, z: 1.2 } as const

export class InvalidRatioModelError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid ratio model: ${reason}`)
    this.name = "InvalidRatioModelError"
  }
}

type RatioModelFactory = () => RadioModel

export type RatioAssetOptions = {
  readonly createModel?: RatioModelFactory
  readonly readRadioSnapshot: () => RadioSnapshot
}

const TUNER_SCREEN_PIXEL_SIZE = { height: 120, width: 900 } as const
const TUNER_SCREEN_WORLD_SIZE = { height: 1.15, width: 8.65 } as const
const CASSETTE_SCREEN_PIXEL_SIZE = { height: 175.4839, width: 320 } as const
const CASSETTE_SCREEN_WORLD_SIZE = { height: 1.36, width: 2.48 } as const
const RATIO_PART_IDS = [
  "chassis-shell",
  "rear-shell",
  "front-fascia",
  "top-deck",
  "left-side-module",
  "corner-guards",
  "tuner-bezel",
  "tuner-glass",
  "speaker-surround",
  "speaker-grille",
  "speaker-cone",
  "cassette-bezel",
  "cassette-glass",
  "cassette-reels",
  "tuning-dial",
  "bass-slider",
  "treble-slider",
  "volume-slider",
  "transport-controls",
  "top-preset-controls",
  "carry-handle",
  "left-handle-hinge",
  "right-handle-hinge",
  "aerial-swivel",
  "telescopic-aerial",
  "dish-base",
  "dish-antenna",
  "dish-feed",
  "rubber-feet",
] as const

const contains = (ancestor: Group, descendant: Group): boolean => {
  let cursor = descendant.parent
  while (cursor !== null) {
    if (cursor === ancestor) return true
    cursor = cursor.parent
  }
  return false
}

const modelParts = (model: RadioModel): readonly AssetPart[] => {
  const manifestParts = model.getManifest().parts
  const manifestIds = manifestParts.map((part) => part.id)
  if (
    manifestIds.length !== RATIO_PART_IDS.length ||
    model.partGroups.size !== RATIO_PART_IDS.length ||
    new Set(manifestIds).size !== manifestIds.length ||
    manifestIds.some((id) => !RATIO_PART_IDS.includes(id))
  ) {
    throw new InvalidRatioModelError("part map must contain the exact authored ratio part IDs")
  }
  return RATIO_PART_IDS.map((id) => {
    const node = model.partGroups.get(id)
    if (!(node instanceof Group) || !contains(model.root, node)) {
      throw new InvalidRatioModelError(`part node is missing from the model root: ${id}`)
    }
    return {
      authoredPosition: node.position.clone(),
      centralClearance: 0,
      id,
      node,
    }
  })
}

const assertScreenAnchor = (model: RadioModel, anchor: Group, name: string): void => {
  if (!contains(model.root, anchor)) {
    throw new InvalidRatioModelError(`${name} screen anchor is missing from the model root`)
  }
}

const assertSelectables = (model: RadioModel): void => {
  if (model.selectables.length === 0) {
    throw new InvalidRatioModelError("selectables must not be empty")
  }
  if (
    model.selectables.some((selectable) => model.root.getObjectById(selectable.id) !== selectable)
  ) {
    throw new InvalidRatioModelError("selectables must be exact model descendants")
  }
}

const hostExplosion = (factor: number): number => {
  if (factor === Number.POSITIVE_INFINITY) return 1
  if (!Number.isFinite(factor)) return 0
  return MathUtils.clamp(factor, 0, 1)
}

const playbackState = (snapshot: RadioSnapshot): RadioModelAnimation["playback"] => {
  if (!snapshot.powered) return "stopped"
  switch (snapshot.status) {
    case "idle":
      return "stopped"
    case "loading":
      return "buffering"
    case "playing":
      return "playing"
    case "paused":
      return "paused"
    case "error":
      return "error"
  }
}

type RadioModelAnimation = Parameters<RadioModel["update"]>[1]

const finiteSpectrum = (values: unknown): readonly number[] =>
  Array.isArray(values)
    ? values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : []

const animationState = (snapshot: RadioSnapshot): RadioModelAnimation => ({
  currentTimeSeconds: Number.isFinite(snapshot.liveElapsedSeconds)
    ? snapshot.liveElapsedSeconds
    : 0,
  playback: playbackState(snapshot),
  spectrum: finiteSpectrum(snapshot.visualization),
})

const disposeHitProxy = (proxy: Mesh): void => {
  proxy.geometry.dispose()
  const materials = Array.isArray(proxy.material) ? proxy.material : [proxy.material]
  materials.forEach((material) => {
    material.dispose()
  })
}

const createHitProxy = (
  name: string,
  worldSize: { readonly height: number; readonly width: number },
): Mesh => {
  const proxy = new Mesh(
    new PlaneGeometry(worldSize.width, worldSize.height),
    new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  )
  proxy.name = name
  proxy.position.z = 0.01
  // biome-ignore lint/complexity/useLiteralKeys: Three userData is an index signature.
  proxy.userData["explodeWithParent"] = true
  // biome-ignore lint/complexity/useLiteralKeys: Three userData is an index signature.
  proxy.userData["screenHitProxy"] = true
  return proxy
}

export const createRatioAssetDefinition = (options: RatioAssetOptions): SceneAssetDefinition => ({
  create: (instanceId): StageAsset => {
    const model = (options.createModel ?? createRadioModel)()
    let tunerHitProxy: Mesh | null = null
    let cassetteHitProxy: Mesh | null = null
    try {
      const parts = modelParts(model)
      assertSelectables(model)
      assertScreenAnchor(model, model.screens.tuner, "tuner")
      assertScreenAnchor(model, model.screens.cassette, "cassette")
      const normalized = normalizeAuthoredAssetRoot({
        authoredRoot: model.root,
        authoredRotation: [0, 0, 0],
        targetFootprint: RATIO_TARGET_FOOTPRINT,
      })
      // biome-ignore lint/complexity/useLiteralKeys: Three userData is an index signature.
      normalized.root.userData["assetInstanceId"] = instanceId.value

      tunerHitProxy = createHitProxy("ratio-tuner-hit-plane", TUNER_SCREEN_WORLD_SIZE)
      cassetteHitProxy = createHitProxy("ratio-cassette-hit-plane", CASSETTE_SCREEN_WORLD_SIZE)
      model.screens.tuner.add(tunerHitProxy)
      model.screens.cassette.add(cassetteHitProxy)
      const tunerProxy = tunerHitProxy
      const cassetteProxy = cassetteHitProxy
      let disposed = false
      let explosion = 0

      return {
        dispose: () => {
          if (disposed) return
          disposed = true
          disposeHitProxy(tunerProxy)
          disposeHitProxy(cassetteProxy)
          disposeRadioModel(model)
        },
        get explosion(): number {
          return explosion
        },
        instanceId,
        get needsAnimation() {
          return options.readRadioSnapshot().status === "playing"
        },
        parts,
        root: normalized.root,
        screens: [
          {
            anchor: model.screens.tuner,
            cssBillboard: true,
            interactive: false,
            defaultAppId: RATIO_TUNER_DISPLAY_APP_ID,
            hitProxy: tunerProxy,
            occlusionRoot: model.root,
            pixelSize: TUNER_SCREEN_PIXEL_SIZE,
            screenId: screenId("ratio-tuner"),
            worldSize: TUNER_SCREEN_WORLD_SIZE,
          },
          {
            anchor: model.screens.cassette,
            cssBillboard: true,
            interactive: false,
            defaultAppId: RATIO_CASSETTE_DISPLAY_APP_ID,
            hitProxy: cassetteProxy,
            occlusionRoot: model.root,
            pixelSize: CASSETTE_SCREEN_PIXEL_SIZE,
            screenId: screenId("ratio-cassette"),
            worldSize: CASSETTE_SCREEN_WORLD_SIZE,
          },
        ],
        selectable: [...model.selectables, tunerProxy, cassetteProxy],
        setExplosion: (factor) => {
          if (disposed) return
          explosion = hostExplosion(factor)
          model.setExplosion(explosion)
        },
        typeId: RATIO_ASSET_TYPE_ID,
        update: (deltaSeconds) => {
          if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds < 0) return
          const snapshot = options.readRadioSnapshot()
          model.update(deltaSeconds, animationState(snapshot))
          model.setSlider("volume-slider", snapshot.volume)
          const stationIndex = snapshot.stations.findIndex(
            (station) => station.stationUuid === snapshot.selectedStation?.stationUuid,
          )
          const tuning =
            stationIndex < 0 || snapshot.stations.length < 2
              ? 0.5
              : stationIndex / (snapshot.stations.length - 1)
          model.setTuning(tuning)
        },
      }
    } catch (error) {
      if (tunerHitProxy !== null) disposeHitProxy(tunerHitProxy)
      if (cassetteHitProxy !== null) disposeHitProxy(cassetteHitProxy)
      disposeRadioModel(model)
      if (error instanceof InvalidRatioModelError) throw error
      if (error instanceof InvalidAssetBoundsError) throw new InvalidRatioModelError(error.reason)
      throw error
    }
  },
  typeId: RATIO_ASSET_TYPE_ID,
})
