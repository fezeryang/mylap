import { afterAll, describe, expect, test } from "bun:test"
import { closeSoftwareBrowser, softwarePage } from "./software-browser-test-support"

afterAll(closeSoftwareBrowser)

describe("phone shell state", () => {
  test("Phone and computer control the same live radio and preserve app state across activation and disposal", async () => {
    const page = await softwarePage()
    try {
      const phone = page.locator(".phone-shell")
      const computer = page.locator(".desktop-os")
      await phone.locator(".phone-os-grid [data-app-id='music']").click()
      await computer.locator(".desktop-os-dock [data-app-id='music']").click()
      await phone.getByTestId("music-radio-tab").click()
      await computer.getByTestId("music-radio-tab").click()
      await phone.getByTestId("oho-power").click()
      await phone.getByTestId("oho-station").selectOption("night-shift")
      await phone.getByTestId("oho-volume").fill("0.35")
      await phone
        .locator(".music-radio-actions")
        .getByRole("button", { name: "Play", exact: true })
        .click()
      await page.waitForFunction(
        () => window.softwareTest.dependencies.radioService.read().status === "playing",
      )
      expect(await computer.getByTestId("oho-station").inputValue()).toBe("night-shift")
      expect(await computer.getByTestId("oho-volume").inputValue()).toBe("0.35")
      expect(
        await page.evaluate(
          () => window.softwareTest.dependencies.radioService.read().selectedStation?.name,
        ),
      ).toBe("Night Shift")
      const count = await page.evaluate(() => window.softwareTest.activeRadioListeners())
      await page.evaluate(() => {
        window.softwareTest.phone.setActive(false)
        window.softwareTest.phone.setActive(true)
      })
      expect(await phone.getAttribute("data-route")).toBe("music")
      expect(await phone.getByTestId("music-radio-tab").getAttribute("aria-pressed")).toBe("true")
      const oldVolume = await phone.getByTestId("oho-volume").inputValue()
      await page.evaluate(async () => {
        window.softwareTest.phone.dispose()
        await window.softwareTest.dependencies.radioService.dispatch({
          kind: "set-volume",
          volume: 0.5,
        })
      })
      // Music, the island's player/title, and Control Center all release their subscriptions.
      expect(await page.evaluate(() => window.softwareTest.activeRadioListeners())).toBe(count - 4)
      expect(await phone.getByTestId("oho-volume").inputValue()).toBe(oldVolume)
      expect(await computer.getByTestId("oho-volume").inputValue()).toBe("0.5")
    } finally {
      await page.close()
    }
  }, 30000)

  test("Real notes survive minimizing, phone app switching, and shared edits without losing text", async () => {
    const page = await softwarePage()
    try {
      const computer = page.locator(".desktop-os")
      const phone = page.locator(".phone-shell")
      await computer.locator(".desktop-os-dock [data-app-id='notes']").click()
      await computer.getByRole("button", { name: "New Note", exact: true }).click()
      await computer.getByRole("textbox", { name: "Note title", exact: true }).fill("Our workspace")
      await computer
        .getByRole("textbox", { name: "Note text", exact: true })
        .fill("A shared idea from the computer.")
      await computer.getByRole("button", { name: "最小化备忘录", exact: true }).click()
      await phone.locator(".phone-os-grid [data-app-id='notes']").click()
      await phone.locator(".productivity-note-row").filter({ hasText: "Our workspace" }).click()
      expect(
        await phone.getByRole("textbox", { name: "Note text", exact: true }).inputValue(),
      ).toBe("A shared idea from the computer.")
      await phone
        .getByRole("textbox", { name: "Note text", exact: true })
        .fill("Edited on Phone — 中文输入")
      await phone.getByRole("button", { name: "返回手机主屏幕", exact: true }).click()
      await phone.locator(".phone-os-grid [data-app-id='notes']").click()
      expect(
        await phone.getByRole("textbox", { name: "Note text", exact: true }).inputValue(),
      ).toBe("Edited on Phone — 中文输入")
      await computer.locator(".desktop-os-dock [data-app-id='notes']").click()
      expect(
        await computer.getByRole("textbox", { name: "Note text", exact: true }).inputValue(),
      ).toBe("Edited on Phone — 中文输入")
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("todou.workspace.data") ?? "{}").notes[0].text,
        ),
      ).toBe("Edited on Phone — 中文输入")
    } finally {
      await page.close()
    }
  }, 30000)
})
