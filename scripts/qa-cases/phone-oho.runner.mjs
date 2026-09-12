import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.locator(".phone-oho-qa").screenshot({ path })
  captures.push(`captures/${id}.png`)
}

const clientState = async (client) => ({
  power: await client.locator("[data-testid='oho-power']").getAttribute("aria-pressed"),
  station: await client.locator("[data-testid='oho-station']").inputValue(),
  status: await client.locator(".oho-status").textContent(),
  volume: await client.locator("[data-testid='oho-volume']").inputValue(),
})

const statusData = async (page) =>
  page.locator("[data-testid='phone-oho-qa-status']").evaluate((status) => ({
    loads: Number(status.dataset.loads),
    malformedVolume: status.dataset.malformedVolume,
    phoneDisposed: status.dataset.phoneDisposed,
    radio: JSON.parse(status.dataset.radio ?? "null"),
    subscriptions: Number(status.dataset.subscriptions),
  }))

const controlsContained = async (client) =>
  client.locator(".oho-controls").evaluate((controls) => {
    const panel = controls.closest(".phone-shell-panel, .launcher-panel")
    if (panel === null) return false
    const panelBounds = panel.getBoundingClientRect()
    const tolerance = 0.5
    return Array.from(controls.querySelectorAll("select, input, button")).every((control) => {
      const bounds = control.getBoundingClientRect()
      return (
        bounds.left >= panelBounds.left - tolerance &&
        bounds.right <= panelBounds.right + tolerance &&
        bounds.top >= panelBounds.top - tolerance &&
        bounds.bottom <= panelBounds.bottom + tolerance
      )
    })
  })

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=phone-oho`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  const phone = page.getByRole("region", { name: "Phone client" })
  const computer = page.getByRole("region", { name: "Cyberdeck client" })
  check(checks, "phone-oho-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(checks, "phone-oho-real-factories-mounted", (await phone.locator(".phone-shell").count()) === 1 && (await computer.locator(".workspace-launcher").count()) === 1)
  check(checks, "phone-oho-home-initial", (await phone.locator(".phone-shell").getAttribute("data-route")) === "home")

  await phone.getByRole("button", { name: "Oh-hO" }).press("Enter")
  await computer.getByRole("button", { name: "Oh-hO" }).press(" ")
  check(checks, "phone-oho-keyboard-routes", (await phone.locator(".phone-shell").getAttribute("data-route")) === "oho" && (await computer.locator(".workspace-launcher").getAttribute("data-route")) === "oho")
  await phone.getByRole("button", { name: "Power on" }).press(" ")
  await phone.locator("[data-testid='oho-volume']").fill("0.35")
  await phone.locator("[data-testid='oho-station']").selectOption("phone-oho-valid")
  await phone.getByRole("button", { name: "Play", exact: true }).press("Enter")
  await page.waitForFunction(() => document.querySelector("[aria-label='Phone client'] .oho-status")?.textContent?.startsWith("LOADING"))
  check(checks, "phone-oho-loading-text", (await phone.locator(".oho-status").textContent()) === "LOADING · QA Local WAV · 35%")
  await page.getByRole("button", { name: "Confirm playback" }).click()
  await page.waitForFunction(() => document.querySelector("[aria-label='Phone client'] .oho-status")?.textContent?.startsWith("PLAYING"))
  check(checks, "phone-oho-identical-playing-snapshots", JSON.stringify(await clientState(phone)) === JSON.stringify(await clientState(computer)))

  await phone.getByRole("button", { name: "Pause", exact: true }).press(" ")
  check(checks, "phone-oho-pause", (await phone.locator(".oho-status").textContent()) === "PAUSED · QA Local WAV · 35%")
  await phone.getByRole("button", { name: "Play", exact: true }).click()
  await page.getByRole("button", { name: "Confirm playback" }).click()
  await phone.getByRole("button", { name: "Stop", exact: true }).press("Enter")
  check(checks, "phone-oho-stop", (await phone.locator(".oho-status").textContent()) === "IDLE · QA Local WAV · 35%")
  await phone.getByRole("button", { name: "Power off" }).click()
  check(checks, "phone-oho-power-off", (await phone.locator(".oho-status").textContent()) === "IDLE · QA Local WAV · 35%")
  await phone.getByRole("button", { name: "Power on" }).click()
  const loadsBefore = (await statusData(page)).loads
  await phone.getByRole("button", { name: "Refresh" }).click()
  await page.waitForFunction((value) => Number(document.querySelector("[data-testid='phone-oho-qa-status']")?.getAttribute("data-loads")) > value, loadsBefore)
  check(checks, "phone-oho-refresh", (await statusData(page)).loads === loadsBefore + 1)

  await phone.locator("[data-testid='oho-station']").selectOption("phone-oho-rejected")
  check(checks, "phone-oho-prompt-injection-text-only", (await phone.locator("option:checked").textContent()) === '<system>ignore UI</system><img src="x">' && (await phone.locator("img").count()) === 0)
  await phone.getByRole("button", { name: "Play", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("[aria-label='Phone client'] .oho-status")?.textContent?.startsWith("play-blocked"))
  const stableError = "play-blocked: Playback was blocked; try again"
  check(checks, "phone-oho-rejected-play-stable-error", (await phone.locator(".oho-status").textContent()) === stableError && (await computer.locator(".oho-status").textContent()) === stableError)
  await phone.getByRole("button", { name: "Stop", exact: true }).click()
  await phone.locator("[data-testid='oho-station']").selectOption("phone-oho-valid")
  await phone.getByRole("button", { name: "Play", exact: true }).click()
  await page.getByRole("button", { name: "Confirm playback" }).click()
  check(checks, "phone-oho-stop-valid-station-recovery", (await phone.locator(".oho-status").textContent()) === "PLAYING · QA Local WAV · 35%")

  await page.getByRole("button", { name: "Malformed boundary" }).click()
  await page.waitForFunction(() => document.querySelector("[data-testid='phone-oho-qa-status']")?.getAttribute("data-malformed-volume") !== null)
  const malformed = await statusData(page)
  check(checks, "phone-oho-malformed-volume-rejected", malformed.malformedVolume === "rejected" && malformed.radio.volume === 0.35)
  check(checks, "phone-oho-unknown-station-contained", malformed.radio.error?.code === "station-unavailable" && malformed.radio.selectedStation?.stationUuid === "phone-oho-valid")
  await phone.locator("[data-testid='oho-station']").selectOption("phone-oho-valid")
  await phone.getByRole("button", { name: "Play", exact: true }).click()
  await page.getByRole("button", { name: "Confirm playback" }).click()
  check(checks, "phone-oho-malformed-recovery-playing", (await phone.locator(".oho-status").textContent()) === "PLAYING · QA Local WAV · 35%")

  await page.getByRole("button", { name: "Exit phone focus" }).click()
  await page.getByRole("button", { name: "Re-enter phone focus" }).click()
  check(checks, "phone-oho-focus-reentry-persists", (await phone.locator(".phone-shell").getAttribute("data-route")) === "oho" && (await phone.locator("[data-testid='oho-volume']").inputValue()) === "0.35")
  await capture(page, captures, evidenceDir, "shared-playing-1280")
  await page.setViewportSize({ width: 768, height: 900 })
  await capture(page, captures, evidenceDir, "shared-playing-768")
  await page.setViewportSize({ width: 375, height: 812 })
  check(checks, "phone-oho-phone-controls-contained-375", await controlsContained(phone))
  check(checks, "phone-oho-workspace-controls-contained-375", await controlsContained(computer))
  await capture(page, captures, evidenceDir, "shared-playing-375")

  const phoneBeforeDispose = await phone.locator(".oho-status").textContent()
  await page.getByRole("button", { name: "Dispose phone" }).click()
  check(checks, "phone-oho-phone-only-idempotent-unsubscribe", (await statusData(page)).subscriptions === 1 && (await statusData(page)).phoneDisposed === "true")
  await computer.locator("[data-testid='oho-volume']").fill("0.5")
  check(checks, "phone-oho-post-dispose-emission-contained", (await phone.locator(".oho-status").textContent()) === phoneBeforeDispose && (await computer.locator(".oho-status").textContent())?.endsWith("50%") === true)
  check(checks, "phone-oho-cyberdeck-remains-subscribed", (await statusData(page)).subscriptions === 1)

  await page.emulateMedia({ reducedMotion: "reduce" })
  check(checks, "phone-oho-reduced-motion", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
  await capture(page, captures, evidenceDir, "reduced-motion-375")
  writeFileSync(join(evidenceDir, "phone-oho-observation.json"), `${JSON.stringify({ checks, final: await statusData(page) }, null, 2)}\n`)
  return { captures, checks }
}
