import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  type Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three"
import type { KeyboardBinding } from "../runtime/asset-contracts"
import { KeyboardController } from "../runtime/keyboard-controller"
import { addLightBar, namedMesh, roundedBox } from "./geometry"
import type { CyberdeckMaterials } from "./materials"
import type { PartBuilder } from "./part-builder"
import { type KeyTone, keyboardRows } from "./part-layout"

const legendTextures = new Map<string, CanvasTexture>()

const keyLegend = (label: string, tone: string, width: number): Mesh => {
  const cacheKey = `${tone}:${label}`
  let texture = legendTextures.get(cacheKey)
  if (texture === undefined) {
    const canvas = document.createElement("canvas")
    canvas.width = 192
    canvas.height = 96
    const context = canvas.getContext("2d")
    if (context === null) throw new Error("The browser did not provide a key-legend canvas context")
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = tone === "pearl" || tone === "lavender" ? "#202649" : "#f4f2ff"
    context.font = `700 ${label.length > 5 ? 27 : 34}px ui-monospace, monospace`
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(label, 96, 49)
    texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    legendTextures.set(cacheKey, texture)
  }
  const material = new MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true })
  const legend = new Mesh(new PlaneGeometry(Math.min(width * 0.76, 0.56), 0.15), material)
  legend.name = `legend-${label}`
  legend.position.y = 0.116
  legend.rotation.x = -Math.PI / 2
  legend.userData["explodeWithParent"] = true
  return legend
}

const keyMaterial = (tone: KeyTone, materials: CyberdeckMaterials): MeshPhysicalMaterial =>
  ({
    cyan: materials.keyCyan,
    lavender: materials.keyLavender,
    pearl: materials.keyPearl,
    pink: materials.keyPink,
    violet: materials.keyViolet,
  })[tone]

export const buildKeyboard = (
  parent: Group,
  builder: PartBuilder,
  materials: CyberdeckMaterials,
): KeyboardController => {
  const keyboard = builder.create("keyboard-module", parent, new Vector3(0.65, 0.35, -0.52), 0.1)
  keyboard.add(roundedBox("keyboard-tray", 7.95, 0.19, 3.72, 0.16, materials.dark))
  const keycaps = builder.create("keycap-system", keyboard, new Vector3(0, 0.17, 0), 0.35)
  const bindings: KeyboardBinding[] = []
  const rows = keyboardRows()
  const rowPitch = 0.54
  rows.forEach((row, rowIndex) => {
    const totalWidth = row.reduce((sum, spec) => sum + spec.width * 0.49 + 0.055, -0.055)
    let cursor = -totalWidth / 2
    row.forEach((spec, keyIndex) => {
      const width = spec.width * 0.49
      const material = keyMaterial(spec.tone, materials).clone()
      const keycap = roundedBox(
        `key-r${rowIndex}-c${keyIndex}-${spec.label}`,
        width,
        0.22,
        0.46,
        0.07,
        material,
      )
      keycap.position.set(cursor + width / 2, 0, (2.5 - rowIndex) * rowPitch)
      keycap.rotation.x = -0.04
      keycap.userData["explodeWithParent"] = true
      keycap.userData["label"] = spec.label
      if (spec.code !== undefined) {
        keycap.userData["keyboardCode"] = spec.code
        bindings.push({
          code: spec.code,
          glowIntensity: 2.2,
          keycap,
          material,
          restPosition: keycap.position.clone(),
          travel: 0.075,
        })
      }
      keycap.add(keyLegend(spec.label, spec.tone, width))
      keycaps.add(keycap)
      cursor += width + 0.055
    })
  })
  return new KeyboardController(
    bindings,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
}

export const buildRightControls = (
  parent: Group,
  builder: PartBuilder,
  materials: CyberdeckMaterials,
): void => {
  const encoder = builder.create("rotary-encoder", parent, new Vector3(-4.0, 0.52, 0.62), 0.45)
  const ringOuter = namedMesh(
    "encoder-violet-ring",
    new TorusGeometry(0.58, 0.055, 12, 48),
    materials.violet,
  )
  ringOuter.rotation.x = Math.PI / 2
  encoder.add(ringOuter)
  const ringInner = namedMesh(
    "encoder-cyan-ring",
    new TorusGeometry(0.48, 0.025, 10, 48),
    materials.cyan,
  )
  ringInner.rotation.x = Math.PI / 2
  ringInner.position.y = 0.015
  encoder.add(ringInner)
  const knob = namedMesh(
    "encoder-knob",
    new CylinderGeometry(0.39, 0.43, 0.28, 48),
    materials.hardware,
  )
  knob.position.y = 0.12
  encoder.add(knob)
  for (let index = 0; index < 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2
    const ridge = roundedBox(`encoder-ridge-${index}`, 0.055, 0.22, 0.08, 0.018, materials.cavity)
    ridge.position.set(Math.cos(angle) * 0.4, 0.14, Math.sin(angle) * 0.4)
    ridge.rotation.y = -angle
    ridge.userData["explodeWithParent"] = true
    encoder.add(ridge)
  }

  const nav = builder.create("navigation-cluster", parent, new Vector3(-4.05, 0.42, -1.75), 0.55)
  const wheelTrack = roundedBox("secondary-wheel-track", 0.36, 0.12, 0.92, 0.09, materials.cavity)
  wheelTrack.position.set(-0.72, -0.05, 0.02)
  nav.add(wheelTrack)
  const secondaryWheel = namedMesh(
    "secondary-control-wheel",
    new CylinderGeometry(0.2, 0.2, 0.3, 24),
    materials.hardware,
  )
  secondaryWheel.rotation.z = Math.PI / 2
  secondaryWheel.position.set(-0.72, 0.12, 0.02)
  nav.add(secondaryWheel)
  const positions = [
    [0, 0.48],
    [-0.48, 0],
    [0, 0],
    [0.48, 0],
    [0, -0.48],
  ] as const
  positions.forEach(([x, z], index) => {
    const material = index === 0 ? materials.keyLavender : materials.keyViolet
    const button = roundedBox(`nav-key-${index}`, 0.42, 0.2, 0.42, 0.07, material)
    button.position.set(x, 0, z)
    button.userData["explodeWithParent"] = true
    nav.add(button)
  })
  ;[-0.34, 0.34].forEach((x, index) => {
    const button = roundedBox(
      `nav-function-${index}`,
      0.42,
      0.16,
      0.24,
      0.06,
      index === 0 ? materials.keyPink : materials.keyCyan,
    )
    button.position.set(x, 0, -0.78)
    button.userData["explodeWithParent"] = true
    nav.add(button)
  })
  addLightBar(nav, "nav-status", [0, 0.14, -0.72], [0.72, 0.035, 0.06], materials.magenta)
}

export const buildCarryGrip = (
  parent: Group,
  builder: PartBuilder,
  materials: CyberdeckMaterials,
): void => {
  const grip = builder.create("carry-assembly", parent, new Vector3(0, -0.56, -3.82), 0.85)
  const core = namedMesh("carry-grip-core", new CapsuleGeometry(0.32, 2.9, 8, 24), materials.rubber)
  core.rotation.z = Math.PI / 2
  grip.add(core)
  for (let index = -7; index <= 7; index += 1) {
    const rib = namedMesh(
      `grip-rib-${index}`,
      new TorusGeometry(0.334, 0.024, 8, 24),
      materials.cavity,
    )
    rib.rotation.y = Math.PI / 2
    rib.position.x = index * 0.2
    rib.userData["explodeWithParent"] = true
    grip.add(rib)
  }
}
