import { CylinderGeometry, Vector3 } from "three"

import type { ScreenSurface } from "../runtime/asset-contracts"
import { screenId } from "../runtime/ids"
import { createScreenHitPlane, type DisplayBuildOptions } from "./display-shared"
import { addLightBar, addScrew, chamferedPlate, namedMesh, roundedBox } from "./geometry"

export const buildWingDisplay = (
  options: DisplayBuildOptions,
  side: "left" | "right",
): ScreenSurface => {
  const { apps, builder, materials, root } = options
  const left = side === "left"
  const sign = left ? -1 : 1
  const id = `${side}-display-assembly`
  const assembly = builder.create(
    id,
    root,
    new Vector3(sign * (left ? 6.35 : 6.45), left ? 1.0 : -0.06, left ? 0.5 : -1.15),
    1.2,
  )
  assembly.rotation.set(0.42, left ? Math.PI - 0.36 : Math.PI + 0.28, left ? -0.12 : 0.12)
  const shellId = `${side}-wing-shell`
  const shell = builder.create(shellId, assembly, new Vector3(0, 0.72, 0), 1.25)
  shell.add(chamferedPlate(`${side}-wing-outer`, 4.2, 3.2, 0.36, 0.32, materials.pearl))
  const armor = chamferedPlate(`${side}-wing-armor`, 3.94, 2.94, 0.4, 0.26, materials.armor)
  armor.position.z = 0.03
  armor.userData["explodeWithParent"] = true
  shell.add(armor)
  const bezel = chamferedPlate(`${side}-wing-bezel`, 3.72, 2.72, 0.43, 0.2, materials.dark)
  bezel.position.z = 0.09
  bezel.userData["explodeWithParent"] = true
  shell.add(bezel)
  const glass = roundedBox(`${side}-wing-glass`, 3.48, 2.5, 0.07, 0.1, materials.cavity)
  glass.position.z = 0.32
  glass.userData["explodeWithParent"] = true
  shell.add(glass)
  const rearArmor = chamferedPlate(
    `${side}-wing-rear-armor`,
    3.45,
    2.3,
    0.12,
    0.22,
    materials.armor,
  )
  rearArmor.position.z = -0.29
  rearArmor.userData["explodeWithParent"] = true
  shell.add(rearArmor)
  ;[-0.88, 0, 0.88].forEach((x, index) => {
    const rib = roundedBox(`${side}-rear-rib-${index}`, 0.1, 1.86, 0.1, 0.03, materials.dark)
    rib.position.set(x, 0, -0.38)
    rib.userData["explodeWithParent"] = true
    shell.add(rib)
  })

  const screen = builder.create(`${side}-screen`, shell, new Vector3(0, 0, 0.37), 1.35)
  const ui = builder.create(`${side}-screen-ui`, screen, new Vector3(0, 0, 0.012), 1.4)
  const hitProxy = createScreenHitPlane({
    height: 2.38,
    materials,
    name: `${side}-screen-hit-plane`,
    width: 3.35,
  })
  ui.add(hitProxy)

  const joint = builder.create(
    `${side}-wing-joint`,
    root,
    new Vector3(sign * 5.25, 0.24, 0.05),
    0.95,
  )
  const jointOuter = namedMesh(
    `${side}-joint-outer`,
    new CylinderGeometry(0.31, 0.31, 1.3, 28),
    materials.armor,
  )
  jointOuter.rotation.z = Math.PI / 2
  joint.add(jointOuter)
  const jointInner = namedMesh(
    `${side}-joint-inner`,
    new CylinderGeometry(0.18, 0.18, 1.38, 24),
    materials.dark,
  )
  jointInner.rotation.z = Math.PI / 2
  jointInner.userData["explodeWithParent"] = true
  joint.add(jointInner)
  addLightBar(
    shell,
    `${side}-wing-cyan-edge`,
    [sign * -1.95, 0, 0.27],
    [0.06, 1.7, 0.06],
    left ? materials.violet : materials.cyan,
  )
  addLightBar(
    shell,
    `${side}-wing-magenta-edge`,
    [sign * 1.95, 0, 0.27],
    [0.06, 1.25, 0.06],
    materials.magenta,
  )
  ;[-1.74, 1.74].forEach((x) => {
    ;[-1.22, 1.22].forEach((y) => {
      addScrew(shell, `${side}-screw-${x}-${y}`, x, y, 0.28, materials.hardware)
    })
  })
  return {
    anchor: ui,
    defaultAppId: left ? apps.left : apps.right,
    hitProxy,
    occlusionRoot: shell,
    pixelSize: { height: 560, width: 800 },
    screenId: screenId(`${side}-wing`),
    worldSize: { height: 2.38, width: 3.35 },
  }
}
