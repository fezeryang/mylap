import { CylinderGeometry, SphereGeometry, Vector3 } from "three"

import type { ScreenSurface } from "../runtime/asset-contracts"
import { screenId } from "../runtime/ids"
import { createScreenHitPlane, type DisplayBuildOptions } from "./display-shared"
import { addLightBar, addScrew, chamferedPlate, namedMesh, roundedBox } from "./geometry"

export const buildMainDisplay = (options: DisplayBuildOptions): ScreenSurface => {
  const { apps, builder, materials, root } = options
  const assembly = builder.create("main-display-assembly", root, new Vector3(0, 0.34, 2.68), 0.8)
  assembly.rotation.set(0.1, Math.PI, 0)
  const shell = builder.create("main-lid-shell", assembly, new Vector3(0, 3.45, 0), 0.9)
  shell.add(chamferedPlate("main-lid-outer-shell", 10.62, 6.65, 0.5, 0.36, materials.pearl))
  const armorInset = chamferedPlate("main-lid-armor-inset", 10.24, 6.27, 0.54, 0.3, materials.armor)
  armorInset.position.z = 0.01
  armorInset.scale.set(1, 1, 0.65)
  armorInset.userData["explodeWithParent"] = true
  shell.add(armorInset)
  const bezel = chamferedPlate("main-lid-dark-bezel", 9.92, 5.95, 0.58, 0.25, materials.dark)
  bezel.position.z = 0.06
  bezel.scale.set(1, 1, 0.55)
  bezel.userData["explodeWithParent"] = true
  shell.add(bezel)
  const glass = roundedBox("main-screen-glass", 9.48, 5.48, 0.09, 0.15, materials.cavity)
  glass.position.z = 0.33
  glass.userData["explodeWithParent"] = true
  shell.add(glass)

  const rearInset = chamferedPlate("main-lid-rear-inset", 9.28, 5.1, 0.16, 0.31, materials.armor)
  rearInset.position.z = -0.34
  rearInset.userData["explodeWithParent"] = true
  shell.add(rearInset)
  ;[-2.75, 0, 2.75].forEach((x, index) => {
    const spine = roundedBox(`main-rear-spine-${index}`, 0.22, 4.55, 0.12, 0.055, materials.dark)
    spine.position.set(x, 0, -0.45)
    spine.userData["explodeWithParent"] = true
    shell.add(spine)
  })
  const rearBadge = roundedBox(
    "main-rear-service-panel",
    2.8,
    0.72,
    0.13,
    0.12,
    materials.pearlEdge,
  )
  rearBadge.position.set(0, 1.62, -0.47)
  rearBadge.userData["explodeWithParent"] = true
  shell.add(rearBadge)

  const screen = builder.create("main-screen", shell, new Vector3(0, 0, 0.39), 1.1)
  const ui = builder.create("main-screen-ui", screen, new Vector3(0, 0, 0.015), 1.15)
  const hitProxy = createScreenHitPlane({
    height: 5.3,
    materials,
    name: "main-screen-hit-plane",
    width: 9.28,
  })
  ui.add(hitProxy)

  const camera = builder.create("camera-module", shell, new Vector3(0, 2.78, 0.39), 1.25)
  camera.add(roundedBox("camera-pill", 1.18, 0.28, 0.16, 0.13, materials.dark))
  const lens = namedMesh("camera-lens", new SphereGeometry(0.095, 20, 12), materials.hardware)
  lens.position.set(-0.28, 0, 0.1)
  camera.add(lens)
  addLightBar(
    camera,
    "camera-violet-status",
    [0.22, 0, 0.11],
    [0.45, 0.085, 0.045],
    materials.magenta,
  )

  const hinge = builder.create("main-hinge", assembly, new Vector3(0, 0.12, 0.05), 0.75)
  ;[-3.65, 3.65].forEach((x, index) => {
    const barrel = namedMesh(
      `main-hinge-barrel-${index}`,
      new CylinderGeometry(0.36, 0.36, 1.62, 32),
      materials.armor,
    )
    barrel.rotation.z = Math.PI / 2
    barrel.position.x = x
    barrel.userData["explodeWithParent"] = true
    hinge.add(barrel)
    const cap = namedMesh(
      `main-hinge-cap-${index}`,
      new CylinderGeometry(0.24, 0.24, 1.68, 28),
      materials.dark,
    )
    cap.rotation.z = Math.PI / 2
    cap.position.x = x
    cap.userData["explodeWithParent"] = true
    hinge.add(cap)
  })
  addLightBar(shell, "lid-left-cyan-rail", [-5.08, 0.55, 0.31], [0.08, 4.15, 0.08], materials.cyan)
  addLightBar(
    shell,
    "lid-right-magenta-rail",
    [5.08, 0.55, 0.31],
    [0.08, 4.15, 0.08],
    materials.magenta,
  )
  addLightBar(shell, "lid-top-violet-rail", [1.65, 3.01, 0.31], [3.3, 0.07, 0.08], materials.violet)
  ;[-4.82, 4.82].forEach((x) => {
    ;[-2.75, 2.75].forEach((y) => {
      addScrew(shell, `lid-screw-${x}-${y}`, x, y, 0.34, materials.hardware)
      addScrew(shell, `lid-rear-screw-${x}-${y}`, x, y, -0.48, materials.hardware)
    })
  })
  return {
    anchor: ui,
    defaultAppId: apps.main,
    hitProxy,
    occlusionRoot: shell,
    pixelSize: { height: 720, width: 1280 },
    screenId: screenId("main"),
    worldSize: { height: 5.3, width: 9.28 },
  }
}
