import type { Camera } from "three"

import {
  createDesktopNavigationController,
  type DesktopNavigationController,
  type DesktopNavigationPose,
  type DesktopNavigationState,
} from "./desktop-navigation"

export type DesktopNavigationBindingOptions = {
  readonly camera: Camera
  readonly controls: {
    enabled: boolean
    readonly target: { set(x: number, y: number, z: number): unknown }
    update(): void
  }
  readonly input: { enabled: boolean }
  readonly onInteractionLockChange?: (locked: boolean) => void
  readonly onSettled?: (state: DesktopNavigationState) => void
  readonly reducedMotion: boolean
}

export const createDesktopNavigationBinding = (
  options: DesktopNavigationBindingOptions,
): DesktopNavigationController => {
  let retainedControlsEnabled = options.controls.enabled
  let retainedInputEnabled = options.input.enabled
  let poseApplied: DesktopNavigationPose | null = null

  const controller = createDesktopNavigationController({
    onInteractionLockChange: (locked) => {
      if (locked) {
        retainedControlsEnabled = options.controls.enabled
        retainedInputEnabled = options.input.enabled
        options.controls.enabled = false
        options.input.enabled = false
        options.onInteractionLockChange?.(locked)
        return
      }
      options.controls.enabled = retainedControlsEnabled
      options.input.enabled = retainedInputEnabled
      options.onInteractionLockChange?.(locked)
    },
    ...(options.onSettled === undefined ? {} : { onSettled: options.onSettled }),
    reducedMotion: options.reducedMotion,
  })

  const applyPose = (): void => {
    const current = controller.read().pose
    if (
      poseApplied !== null &&
      current.position.every((value, index) => value === poseApplied?.position[index]) &&
      current.target.every((value, index) => value === poseApplied?.target[index])
    ) {
      return
    }
    options.camera.position.set(...current.position)
    options.controls.target.set(...current.target)
    options.controls.update()
    poseApplied = current
  }

  applyPose()
  return {
    advance: (timestampMilliseconds) => {
      controller.advance(timestampMilliseconds)
      applyPose()
    },
    dispose: () => controller.dispose(),
    read: () => controller.read(),
    request: (request) => {
      controller.request(request)
      applyPose()
    },
  }
}
