import type { Object3D } from "three"
import { Box3, Group, Vector3 } from "three"

export type AssetFootprint = {
  readonly x: number
  readonly z: number
}

export type AssetNormalizationOptions = {
  readonly authoredRoot: Group
  readonly authoredRotation: readonly [number, number, number]
  readonly targetFootprint: AssetFootprint
}

export type NormalizedAssetRoot = {
  readonly authoredContent: Group
  readonly root: Group
}

export class InvalidAssetBoundsError extends Error {
  constructor(readonly reason: string) {
    super(`Unable to normalize asset bounds: ${reason}`)
    this.name = "InvalidAssetBoundsError"
  }
}

const finite = (value: number): boolean => Number.isFinite(value)

const finiteBounds = (bounds: Box3): boolean =>
  finite(bounds.min.x) &&
  finite(bounds.min.y) &&
  finite(bounds.min.z) &&
  finite(bounds.max.x) &&
  finite(bounds.max.y) &&
  finite(bounds.max.z)

const assertTargetFootprint = (target: AssetFootprint): void => {
  if (!finite(target.x) || !finite(target.z) || target.x <= 0 || target.z <= 0) {
    throw new InvalidAssetBoundsError(
      "target footprint must have finite positive X and Z dimensions",
    )
  }
}

const captureTransformState = (root: Group) => ({
  matrix: root.matrix.clone(),
  matrixAutoUpdate: root.matrixAutoUpdate,
  matrixWorld: root.matrixWorld.clone(),
  matrixWorldAutoUpdate: root.matrixWorldAutoUpdate,
  matrixWorldNeedsUpdate: root.matrixWorldNeedsUpdate,
  position: root.position.clone(),
  quaternion: root.quaternion.clone(),
  rotation: root.rotation.clone(),
  scale: root.scale.clone(),
})

const restoreTransformState = (
  root: Group,
  state: ReturnType<typeof captureTransformState>,
): void => {
  root.position.copy(state.position)
  root.quaternion.copy(state.quaternion)
  root.rotation.copy(state.rotation)
  root.scale.copy(state.scale)
  root.matrix.copy(state.matrix)
  root.matrixAutoUpdate = state.matrixAutoUpdate
  root.matrixWorld.copy(state.matrixWorld)
  root.matrixWorldAutoUpdate = state.matrixWorldAutoUpdate
  root.matrixWorldNeedsUpdate = state.matrixWorldNeedsUpdate
}

const restoreChildAtIndex = (parent: Object3D, child: Group, index: number): void => {
  parent.add(child)
  const attachedIndex = parent.children.indexOf(child)
  parent.children.splice(attachedIndex, 1)
  parent.children.splice(index, 0, child)
}

const measureOrThrow = (options: AssetNormalizationOptions): Box3 => {
  const measuringContent = new Group()
  measuringContent.rotation.set(...options.authoredRotation)
  const originalParent = options.authoredRoot.parent
  const originalIndex = originalParent?.children.indexOf(options.authoredRoot) ?? -1
  const transformState = captureTransformState(options.authoredRoot)
  let attachedToMeasuringContent = false
  let bounds: Box3

  try {
    measuringContent.add(options.authoredRoot)
    attachedToMeasuringContent = true
    bounds = new Box3().setFromObject(measuringContent)
  } finally {
    if (attachedToMeasuringContent) {
      measuringContent.remove(options.authoredRoot)
      if (originalParent !== null && originalIndex >= 0) {
        restoreChildAtIndex(originalParent, options.authoredRoot, originalIndex)
      }
    }
    restoreTransformState(options.authoredRoot, transformState)
  }

  const size = bounds.getSize(new Vector3())

  if (bounds.isEmpty()) throw new InvalidAssetBoundsError("authored content is empty")
  if (!finiteBounds(bounds))
    throw new InvalidAssetBoundsError("authored content has non-finite bounds")
  if (!finite(size.x) || !finite(size.z) || size.x <= 0 || size.z <= 0) {
    throw new InvalidAssetBoundsError("authored content has degenerate X or Z bounds")
  }
  return bounds
}

export const normalizeAuthoredAssetRoot = (
  options: AssetNormalizationOptions,
): NormalizedAssetRoot => {
  assertTargetFootprint(options.targetFootprint)
  const bounds = measureOrThrow(options)
  const size = bounds.getSize(new Vector3())
  const scale = Math.min(options.targetFootprint.x / size.x, options.targetFootprint.z / size.z)
  const center = bounds.getCenter(new Vector3())
  const root = new Group()
  const authoredContent = new Group()

  root.name = `${options.authoredRoot.name}-stage-root`
  authoredContent.name = `${options.authoredRoot.name}-authored-content`
  authoredContent.rotation.set(...options.authoredRotation)
  authoredContent.scale.setScalar(scale)
  authoredContent.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
  authoredContent.add(options.authoredRoot)
  root.add(authoredContent)

  return { authoredContent, root }
}
