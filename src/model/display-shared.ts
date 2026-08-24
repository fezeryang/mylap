import { type Group, Mesh, PlaneGeometry } from "three"

import type { ScreenSurface } from "../runtime/asset-contracts"
import type { ScreenAppId } from "../runtime/ids"
import type { CyberdeckMaterials } from "./materials"
import type { PartBuilder } from "./part-builder"

export type DisplaysBuild = { readonly screens: readonly ScreenSurface[] }

export type DisplayAppIds = {
  readonly left: ScreenAppId
  readonly main: ScreenAppId
  readonly right: ScreenAppId
}

export type DisplayBuildOptions = {
  readonly apps: DisplayAppIds
  readonly builder: PartBuilder
  readonly materials: CyberdeckMaterials
  readonly root: Group
}

type ScreenPlaneOptions = {
  readonly height: number
  readonly materials: CyberdeckMaterials
  readonly name: string
  readonly width: number
}

export const createScreenHitPlane = (options: ScreenPlaneOptions): Mesh => {
  const screen = new Mesh(
    new PlaneGeometry(options.width, options.height, 1, 1),
    options.materials.cavity,
  )
  screen.name = options.name
  screen.userData["explodeWithParent"] = true
  screen.userData["screenHitProxy"] = true
  return screen
}
