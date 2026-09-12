import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { assetInstanceId } from "../runtime/ids"
import { createDesktopNavigationController } from "./desktop-navigation"
import { createShellController, type ShellEscapeEvent } from "./shell-dom"

class EscapeEvent implements ShellEscapeEvent {
  defaultPrevented = false
  propagationStopped = false
  readonly key: string
  readonly repeat: boolean

  constructor(key: string, repeat = false) {
    this.key = key
    this.repeat = repeat
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

describe("root DOM contract baseline", () => {
  test("Given the current root document, when inspected, then validated viewer IDs remain present", async () => {
    const html = await Bun.file(join(import.meta.dir, "../../index.html")).text()

    for (const id of [
      "app",
      "scene",
      "reset-view",
      "auto-rotate",
      "screen-power",
      "explode-range",
      "part-title",
      "part-meta",
      "status-text",
    ]) {
      expect(html).toContain(`id="${id}"`)
    }
  })

  test("Given the root document, when inspected, then accessible landing and device controls use native semantics", async () => {
    const html = await Bun.file(join(import.meta.dir, "../../index.html")).text()

    for (const id of ["enter-desktop", "focus-phone", "focus-computer", "exit-device"]) {
      expect(html).toMatch(new RegExp(`<button[^>]+id="${id}"[^>]+type="button"`))
    }
    expect(html).toMatch(/id="navigation-status"[^>]+aria-live="polite"/)
  })
})

describe("accessible shell controller", () => {
  test("Given landing, when entering and focusing by button or pick, then one ordered ownership path is used", () => {
    const phone = assetInstanceId("phone-main")
    const computer = assetInstanceId("computer-main")
    const calls: string[] = []
    const navigation = createDesktopNavigationController({ reducedMotion: true })
    const shell = createShellController({
      activateAsset: (id) => calls.push(`active:${id.value}`),
      clearScreenFocus: () => calls.push("clear-screen"),
      computerAssetId: computer,
      navigation,
      onDiagnostic: () => calls.push("diagnostic:null"),
      phoneAssetId: phone,
      routeKeyboardTo: (id) => calls.push(`keyboard:${id.value}`),
    })

    shell.enter()
    shell.focusDevice(phone)

    expect(navigation.read().state).toBe("phone-focus")
    expect(calls).toEqual([
      "diagnostic:null",
      "active:computer-main",
      "clear-screen",
      "keyboard:computer-main",
      "diagnostic:null",
      "active:phone-main",
      "clear-screen",
      "keyboard:phone-main",
    ])

    const beforeIgnoredPick = calls.length
    shell.pickDevice(computer)
    expect(calls).toHaveLength(beforeIgnoredPick)

    shell.exit()
    shell.pickDevice(computer)
    expect(navigation.read().state).toBe("computer-focus")
    expect(calls.slice(-4)).toEqual([
      "diagnostic:null",
      "active:computer-main",
      "clear-screen",
      "keyboard:computer-main",
    ])
  })

  test("Given device focus or overview, when shell handles Escape, then device exits and overview is a no-op", () => {
    const phone = assetInstanceId("phone-main")
    const computer = assetInstanceId("computer-main")
    const active: string[] = []
    const navigation = createDesktopNavigationController({ reducedMotion: true })
    const shell = createShellController({
      activateAsset: (id) => active.push(id.value),
      clearScreenFocus: () => {},
      computerAssetId: computer,
      navigation,
      onDiagnostic: () => {},
      phoneAssetId: phone,
      routeKeyboardTo: () => {},
    })
    shell.enter()
    shell.focusDevice(phone)
    const deviceEscape = new EscapeEvent("Escape")

    shell.handleEscape(deviceEscape)

    expect(navigation.read().state).toBe("overview")
    expect(active.at(-1)).toBe("computer-main")
    expect(deviceEscape.defaultPrevented).toBe(true)
    expect(deviceEscape.propagationStopped).toBe(true)

    const activeCount = active.length
    const overviewEscape = new EscapeEvent("Escape")
    shell.handleEscape(overviewEscape)
    expect(active).toHaveLength(activeCount)
    expect(overviewEscape.defaultPrevented).toBe(true)
    expect(overviewEscape.propagationStopped).toBe(true)
  })

  test("Given device focus, when repeated Escape arrives, then the shell ignores it", () => {
    const phone = assetInstanceId("phone-main")
    const computer = assetInstanceId("computer-main")
    let activationCount = 0
    const navigation = createDesktopNavigationController({ reducedMotion: true })
    const shell = createShellController({
      activateAsset: () => {
        activationCount += 1
      },
      clearScreenFocus: () => {},
      computerAssetId: computer,
      navigation,
      onDiagnostic: () => {},
      phoneAssetId: phone,
      routeKeyboardTo: () => {},
    })
    shell.enter()
    shell.focusDevice(phone)
    const before = activationCount
    const repeatedEscape = new EscapeEvent("Escape", true)

    shell.handleEscape(repeatedEscape)

    expect(navigation.read().state).toBe("phone-focus")
    expect(activationCount).toBe(before)
    expect(repeatedEscape.defaultPrevented).toBe(false)
    expect(repeatedEscape.propagationStopped).toBe(false)
  })

  test("Given overview, when an unknown asset is requested, then active and navigation state remain unchanged", () => {
    const phone = assetInstanceId("phone-main")
    const computer = assetInstanceId("computer-main")
    let activationCount = 0
    const navigation = createDesktopNavigationController({ reducedMotion: true })
    const shell = createShellController({
      activateAsset: () => {
        activationCount += 1
      },
      clearScreenFocus: () => {},
      computerAssetId: computer,
      navigation,
      onDiagnostic: () => {},
      phoneAssetId: phone,
      routeKeyboardTo: () => {},
    })
    shell.enter()
    const before = activationCount

    shell.focusDevice(assetInstanceId("unknown-main"))

    expect(navigation.read().state).toBe("overview")
    expect(activationCount).toBe(before)
  })
})
