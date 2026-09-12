import { DoubleSide, type Material, MeshPhysicalMaterial, MeshStandardMaterial } from "three"
import { RADIO_COLORS } from "../theme"
import type { RadioMaterials } from "./modelTypes"

function emissiveMaterial(color: number, intensity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.08,
    roughness: 0.2,
    toneMapped: false,
  })
}

export function createRadioMaterials(): RadioMaterials {
  const pearl = new MeshPhysicalMaterial({
    color: RADIO_COLORS.pearl,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
    metalness: 0.12,
    roughness: 0.27,
  })
  const pearlDark = new MeshPhysicalMaterial({
    color: RADIO_COLORS.pearlShadow,
    clearcoat: 0.52,
    metalness: 0.2,
    roughness: 0.34,
  })
  const chrome = new MeshPhysicalMaterial({
    color: RADIO_COLORS.chrome,
    metalness: 0.96,
    roughness: 0.19,
    anisotropy: 0.52,
    envMapIntensity: 1.7,
  })
  const dark = new MeshPhysicalMaterial({
    color: RADIO_COLORS.dark,
    metalness: 0.18,
    roughness: 0.34,
    clearcoat: 0.28,
  })
  const grille = new MeshStandardMaterial({
    color: 0x11152f,
    metalness: 0.6,
    roughness: 0.44,
  })
  const glass = new MeshPhysicalMaterial({
    color: RADIO_COLORS.screenBorder,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    emissive: RADIO_COLORS.screenDeep,
    emissiveIntensity: 0.15,
    metalness: 0.05,
    opacity: 0.34,
    roughness: 0.08,
    transparent: true,
  })
  const cassetteGlass = new MeshPhysicalMaterial({
    color: RADIO_COLORS.cassetteBorder,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    opacity: 0.28,
    roughness: 0.09,
    transparent: true,
  })
  const lavender = new MeshPhysicalMaterial({
    color: RADIO_COLORS.lavender,
    clearcoat: 0.36,
    metalness: 0.04,
    roughness: 0.39,
  })
  const rubber = new MeshStandardMaterial({ color: RADIO_COLORS.rubber, roughness: 0.76 })
  const dish = new MeshPhysicalMaterial({
    color: 0x8a84da,
    clearcoat: 0.9,
    clearcoatRoughness: 0.09,
    metalness: 0.76,
    roughness: 0.15,
    side: DoubleSide,
  })

  return {
    pearl,
    pearlDark,
    chrome,
    dark,
    grille,
    glass,
    cassetteGlass,
    lavender,
    rubber,
    cyanLight: emissiveMaterial(RADIO_COLORS.cyan, 3.8),
    blueLight: emissiveMaterial(RADIO_COLORS.blue, 3.2),
    violetLight: emissiveMaterial(RADIO_COLORS.violet, 3.5),
    magentaLight: emissiveMaterial(RADIO_COLORS.magenta, 3.8),
    redLight: emissiveMaterial(RADIO_COLORS.red, 3.4),
    dish,
  }
}

export function disposeMaterial(material: Material): void {
  material.dispose()
}
