import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("phone lock screen and notification center", () => {
  test("boots locked over the home route and unlocks to the grid via button", async () => {
    const page = await softwarePage({ unlockPhone: false })
    try {
      const phone = page.locator(".phone-shell")
      const lock = phone.locator(".phone-os-lock")
      expect(await lock.isVisible()).toBe(true)
      expect(await phone.getAttribute("data-route")).toBe("home")
      expect(await phone.locator(".phone-os-lock-time").textContent()).toMatch(/^\d{2}:\d{2}$/)
      expect(await phone.locator(".phone-os-lock-hint").textContent()).toBe("向上轻扫以解锁")
      await phone.getByRole("button", { name: "解锁手机", exact: true }).click()
      await lock.waitFor({ state: "hidden" })
      expect(await lock.isVisible()).toBe(false)
      expect(await phone.getAttribute("data-route")).toBe("home")
      await phone.locator(".phone-os-grid [data-app-id='music']").click()
      expect(await phone.getAttribute("data-route")).toBe("music")
    } finally {
      await page.close()
    }
  }, 30000)

  test("notification center lists, clears, opens apps, and restores focus on Escape", async () => {
    const page = await softwarePage()
    try {
      const phone = page.locator(".phone-shell")
      await phone.getByRole("button", { name: "打开通知中心", exact: true }).click()
      const panel = phone.getByRole("dialog", { name: "通知中心" })
      await panel.waitFor({ state: "visible" })
      expect(await phone.locator(".phone-os-notification").count()).toBe(3)
      await panel.getByRole("button", { name: "清除日历通知", exact: true }).click()
      expect(await phone.locator(".phone-os-notification").count()).toBe(2)
      await phone.getByRole("button", { name: "清除全部通知", exact: true }).click()
      expect(await phone.locator(".phone-os-notification").count()).toBe(0)
      expect(await phone.locator(".phone-os-notifications-empty").textContent()).toBe(
        "没有更早的通知",
      )
      await page.keyboard.press("Escape")
      await panel.waitFor({ state: "hidden" })
      const focusLabel = await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      )
      expect(focusLabel).toBe("打开通知中心")
    } finally {
      await page.close()
    }
  }, 30000)

  test("tapping a notification opens its app and closes the panel", async () => {
    const page = await softwarePage()
    try {
      const phone = page.locator(".phone-shell")
      await phone.getByRole("button", { name: "打开通知中心", exact: true }).click()
      const panel = phone.getByRole("dialog", { name: "通知中心" })
      await panel.waitFor({ state: "visible" })
      await panel.getByRole("button", { name: "打开音乐", exact: true }).click()
      await panel.waitFor({ state: "hidden" })
      expect(await phone.getAttribute("data-route")).toBe("music")
    } finally {
      await page.close()
    }
  }, 30000)

  test("reduced motion preference collapses lock and notification motion", async () => {
    const page = await softwarePage({ unlockPhone: false })
    try {
      const phone = page.locator(".phone-shell")
      await phone.locator(".phone-os-lock").waitFor({ state: "visible" })
      await page.evaluate(() => {
        window.softwareTest.dependencies.dataService.setPreferences({ reducedMotion: true })
      })
      await page.waitForFunction(
        () =>
          document.querySelector(".phone-shell")?.getAttribute("data-reduced-motion") === "true",
      )
      const durations = await page.evaluate(() => {
        const lock = document.querySelector(".phone-os-lock")
        const notifications = document.querySelector(".phone-os-notifications")
        if (lock === null || notifications === null)
          throw new Error("lock screen or notification center missing")
        const toMs = (value: string): number =>
          value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
        return {
          lockTransition: toMs(getComputedStyle(lock).transitionDuration),
          notificationsAnimation: toMs(getComputedStyle(notifications).animationDuration),
        }
      })
      expect(durations.lockTransition).toBeLessThanOrEqual(0.01)
      expect(durations.notificationsAnimation).toBeLessThanOrEqual(0.01)
    } finally {
      await page.close()
    }
  }, 30000)
})
