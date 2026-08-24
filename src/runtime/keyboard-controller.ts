import { MathUtils } from "three"

import type { KeyboardCode } from "../model/part-layout"
import type { AssetKeyboard, KeyboardBinding } from "./asset-contracts"

export class KeyboardController implements AssetKeyboard {
  private readonly bindingsByCode = new Map<string, KeyboardBinding>()
  private readonly pressed = new Set<KeyboardCode>()

  constructor(
    readonly bindings: readonly KeyboardBinding[],
    private readonly reducedMotion = false,
  ) {
    bindings.forEach((binding) => {
      this.bindingsByCode.set(binding.code, binding)
      binding.material.emissive.setHex(0x34d9ff)
      binding.material.emissiveIntensity = 0
    })
  }

  get pressedCodes(): readonly KeyboardCode[] {
    return [...this.pressed]
  }

  press(code: string): boolean {
    const binding = this.bindingsByCode.get(code)
    if (binding === undefined || this.pressed.has(binding.code)) return false
    this.pressed.add(binding.code)
    binding.keycap.userData["pressed"] = true
    return true
  }

  release(code: string): boolean {
    const binding = this.bindingsByCode.get(code)
    if (binding === undefined || !this.pressed.delete(binding.code)) return false
    binding.keycap.userData["pressed"] = false
    return true
  }

  releaseAll(): void {
    this.bindings.forEach((binding) => {
      binding.keycap.userData["pressed"] = false
    })
    this.pressed.clear()
  }

  update(deltaSeconds: number): void {
    this.bindings.forEach((binding) => {
      const pressed = this.pressed.has(binding.code)
      const targetY = binding.restPosition.y - (pressed ? binding.travel : 0)
      const targetGlow = pressed ? binding.glowIntensity : 0
      binding.keycap.position.y = this.reducedMotion
        ? targetY
        : MathUtils.damp(binding.keycap.position.y, targetY, 22, deltaSeconds)
      binding.material.emissiveIntensity = this.reducedMotion
        ? targetGlow
        : MathUtils.damp(binding.material.emissiveIntensity, targetGlow, 18, deltaSeconds)
    })
  }
}
