import { Box3, Group, Mesh, Vector3 } from "three"

import { buildChassis } from "./chassis"
import { buildCarryGrip, buildKeyboard, buildRightControls } from "./controls"
import type { DisplayAppIds } from "./displays"
import { buildDisplays } from "./displays"
import { createCyberdeckMaterials } from "./materials"
import { PartBuilder } from "./part-builder"
import type { CyberdeckModel } from "./types"

export const createCyberdeckModel = (displayApps: DisplayAppIds): CyberdeckModel => {
  const root = new Group()
  root.name = "cyberdeck-root"
  const builder = new PartBuilder()
  builder.register("cyberdeck-root", root)
  const materials = createCyberdeckMaterials()
  const chassis = buildChassis(root, builder, materials)
  const keyboard = buildKeyboard(chassis.upper, builder, materials)
  buildRightControls(chassis.upper, builder, materials)
  buildCarryGrip(chassis.lower, builder, materials)
  const displays = buildDisplays({ apps: displayApps, builder, materials, root })

  const selectable: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh) selectable.push(object)
  })
  const nodes: Record<string, Group> = {}
  builder.parts.forEach((part) => {
    nodes[part.id] = part.node
  })
  const bounds = new Box3().setFromObject(root)
  const colliderSize = bounds.getSize(new Vector3())
  const colliderCenter = bounds.getCenter(new Vector3())
  root.userData["sculptRuntime"] = {
    colliders: [
      {
        center: colliderCenter.toArray(),
        id: "cyberdeck-compound",
        size: colliderSize.toArray(),
        type: "box",
      },
    ],
    destructionGroups: {
      chassis: ["lower-chassis", "upper-deck", "keyboard-module", "front-bumper"],
      displays: ["main-display-assembly", "left-display-assembly", "right-display-assembly"],
      hardware: ["carry-assembly", "rotary-encoder", "fastener-system"],
    },
    nodes,
    sockets: {
      "front-handle-socket": [0, -0.55, -3.52],
      "left-wing-socket": [-5.25, 0.24, 0.05],
      "main-lid-hinge": [0, 0.34, 2.68],
      "right-wing-socket": [5.25, 0.24, 0.05],
    },
  }
  return {
    keyboard,
    parts: builder.parts,
    root,
    screens: displays.screens,
    selectable,
  }
}
