import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("main workspace app factory", () => {
  test("Given host dependencies, when defaults register, then all six exact applications resolve", async () => {
    const page = await softwarePage()
    try {
      expect(await page.evaluate(() => window.softwareTest.mountedApps)).toEqual([
        "main-workspace",
        "system-telemetry",
        "structure-analysis",
        "phone-shell",
        "ratio-tuner-display",
        "ratio-cassette-display",
      ])
    } finally {
      await page.close()
    }
  }, 30000)

  test("Given mounted applications, when a handle is disposed twice, subscriptions are released once", async () => {
    const page = await softwarePage()
    try {
      await page.locator(".desktop-os-dock [data-app-id='music']").click()
      const before = await page.evaluate(() => window.softwareTest.activeRadioListeners())
      expect(before).toBeGreaterThan(1)
      const after = await page.evaluate(() => {
        window.softwareTest.computer.dispose()
        const once = window.softwareTest.activeRadioListeners()
        window.softwareTest.computer.dispose()
        return [once, window.softwareTest.activeRadioListeners()]
      })
      // Both the open Music window and the system control center own a subscription.
      expect(after).toEqual([before - 2, before - 2])
      await page.evaluate(() => {
        window.softwareTest.phone.dispose()
        window.softwareTest.dependencies.musicService.dispose()
        window.softwareTest.dependencies.radioService.dispose()
        window.softwareTest.dependencies.dataService.dispose()
        window.softwareTest.dependencies.libraryService.dispose()
        window.softwareTest.dependencies.clockService.dispose()
        window.softwareTest.dependencies.browserService.dispose()
        window.softwareTest.dependencies.filesService.dispose()
      })
      expect(await page.evaluate(() => window.softwareTest.activeRadioListeners())).toBe(0)
    } finally {
      await page.close()
    }
  }, 30000)
})
