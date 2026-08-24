import { MeshPhysicalMaterial } from "three"
import { PHONE_COLORS } from "../theme"
import type { PhoneMaterials } from "./modelTypes"

export function createPhoneMaterials(): PhoneMaterials {
  return {
    rearGlass: new MeshPhysicalMaterial({
      color: PHONE_COLORS.deepGlass,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
    metal: new MeshPhysicalMaterial({
      color: PHONE_COLORS.silver,
      roughness: 0.28,
      metalness: 0.9,
      clearcoat: 0.18,
      clearcoatRoughness: 0.2,
      anisotropy: 0.6,
      anisotropyRotation: Math.PI / 2,
      envMapIntensity: 0.95,
    }),
    clearBumper: new MeshPhysicalMaterial({
      color: PHONE_COLORS.clearViolet,
      roughness: 0.24,
      metalness: 0,
      transmission: 0.88,
      thickness: 0.12,
      ior: 1.46,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.18,
      envMapIntensity: 0.82,
    }),
    bezel: new MeshPhysicalMaterial({
      color: PHONE_COLORS.ink,
      roughness: 0.3,
      metalness: 0.06,
      clearcoat: 0.46,
    }),
    displayGlass: new MeshPhysicalMaterial({
      color: PHONE_COLORS.deepGlass,
      roughness: 0.07,
      metalness: 0.04,
      transmission: 0.14,
      thickness: 0.08,
      ior: 1.52,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.2,
      envMapIntensity: 2.4,
    }),
    opticalGlass: new MeshPhysicalMaterial({
      color: 0x00122f,
      roughness: 0.06,
      metalness: 0.12,
      transmission: 0.32,
      ior: 1.6,
      clearcoat: 1,
    }),
    cyanLight: new MeshPhysicalMaterial({
      color: PHONE_COLORS.cyan,
      emissive: PHONE_COLORS.cyan,
      emissiveIntensity: 1.8,
      roughness: 0.12,
      toneMapped: true,
    }),
    magentaLight: new MeshPhysicalMaterial({
      color: PHONE_COLORS.magenta,
      emissive: PHONE_COLORS.magenta,
      emissiveIntensity: 1.9,
      roughness: 0.12,
      toneMapped: true,
    }),
    violetLight: new MeshPhysicalMaterial({
      color: PHONE_COLORS.violet,
      emissive: PHONE_COLORS.violet,
      emissiveIntensity: 1.7,
      roughness: 0.14,
      toneMapped: true,
    }),
  }
}
