import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("desktop system UI", () => {
  test("system menu keyboard flow opens settings window", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await computer.getByRole("button", { name: "系统设置", exact: true }).click()
      const menu = computer.getByRole("menu", { name: "系统菜单" })
      await menu.waitFor({ state: "visible" })
      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("关于本机")
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
      await menu.waitFor({ state: "hidden" })
      await computer
        .locator(".desktop-os-window[data-app='settings']")
        .waitFor({ state: "visible" })
    } finally {
      await page.close()
    }
  }, 30000)

  test("about dialog and lock screen open and dismiss", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await computer.getByRole("button", { name: "系统设置", exact: true }).click()
      await computer.getByRole("menuitem", { name: "关于本机", exact: true }).click()
      const about = computer.getByRole("dialog", { name: "关于本机" })
      await about.waitFor({ state: "visible" })
      expect(await about.textContent()).toContain("TODŌU 桌面")
      await page.keyboard.press("Escape")
      await about.waitFor({ state: "hidden" })
      await computer.getByRole("button", { name: "系统设置", exact: true }).click()
      await computer.getByRole("menuitem", { name: "锁定屏幕", exact: true }).click()
      const lock = computer.getByRole("dialog", { name: "锁定屏幕" })
      await lock.waitFor({ state: "visible" })
      expect(await computer.locator(".desktop-os-lock-clock").textContent()).toMatch(
        /^\d{2}:\d{2}$/,
      )
      await page.keyboard.press("Enter")
      await lock.waitFor({ state: "hidden" })
    } finally {
      await page.close()
    }
  }, 30000)

  test("sleep overlay wakes on any key", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await computer.getByRole("button", { name: "系统设置", exact: true }).click()
      await computer.getByRole("menuitem", { name: "睡眠", exact: true }).click()
      const sleep = computer.getByRole("dialog", { name: "睡眠中，按任意键或点击唤醒" })
      await sleep.waitFor({ state: "visible" })
      await page.keyboard.press("x")
      await sleep.waitFor({ state: "hidden" })
    } finally {
      await page.close()
    }
  }, 30000)

  test("notification banners appear, close, and dismiss with Escape", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await computer.locator(".desktop-os-banner").nth(2).waitFor({ state: "visible" })
      expect(await computer.locator(".desktop-os-banner").count()).toBe(3)
      await computer.getByRole("button", { name: "关闭通知", exact: true }).first().click()
      expect(await computer.locator(".desktop-os-banner").count()).toBe(2)
      await computer.getByRole("button", { name: "桌面", exact: true }).click()
      await page.keyboard.press("Escape")
      expect(await computer.locator(".desktop-os-banner").count()).toBe(1)
    } finally {
      await page.close()
    }
  }, 30000)

  test("search sheet filters apps and opens the first result", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await computer.getByRole("button", { name: "搜索应用", exact: true }).click()
      const sheet = computer.locator(".desktop-os-search")
      await sheet.waitFor({ state: "visible" })
      await computer.getByRole("searchbox", { name: "搜索应用名称", exact: true }).fill("音乐")
      expect(await computer.locator(".desktop-os-search-result:not([hidden])").count()).toBe(1)
      await page.keyboard.press("Enter")
      await sheet.waitFor({ state: "hidden" })
      await computer.locator(".desktop-os-window[data-app='music']").waitFor({ state: "visible" })
    } finally {
      await page.close()
    }
  }, 30000)

  test("reduced motion preference collapses menu, banner, and dialog motion", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      await page.evaluate(() => {
        window.softwareTest.dependencies.dataService.setPreferences({ reducedMotion: true })
      })
      await page.waitForFunction(
        () => document.querySelector(".desktop-os")?.getAttribute("data-reduced-motion") === "true",
      )
      await computer.getByRole("button", { name: "系统设置", exact: true }).click()
      await computer.getByRole("menu", { name: "系统菜单" }).waitFor({ state: "visible" })
      await computer.locator(".desktop-os-banner").first().waitFor({ state: "visible" })
      const durations = await page.evaluate(() => {
        const menu = document.querySelector(".desktop-os-system-menu")
        const banner = document.querySelector(".desktop-os-banner")
        const aboutCard = document.querySelector(".desktop-os-about-card")
        if (menu === null || banner === null || aboutCard === null)
          throw new Error("system menu, banner, or about card missing")
        const toMs = (value: string): number =>
          value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
        return {
          menu: toMs(getComputedStyle(menu).animationDuration),
          banner: toMs(getComputedStyle(banner).animationDuration),
          aboutCard: toMs(getComputedStyle(aboutCard).animationDuration),
        }
      })
      expect(durations.menu).toBeLessThanOrEqual(0.01)
      expect(durations.banner).toBeLessThanOrEqual(0.01)
      expect(durations.aboutCard).toBeLessThanOrEqual(0.01)
    } finally {
      await page.close()
    }
  }, 30000)
})
