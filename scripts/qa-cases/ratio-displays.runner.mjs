import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const state = async (page) =>
  page.locator("[data-testid='ratio-displays-status']").evaluate((status) => ({
    backFacing: status.dataset.backFacing,
    occluding: status.dataset.occluding,
    listenerCount: Number(status.dataset.listenerCount),
    removed: status.dataset.removed,
    snapshot: JSON.parse(status.dataset.snapshot ?? "null"),
    unsubscribeCalls: Number(status.dataset.unsubscribeCalls),
    visible: JSON.parse(status.dataset.visible ?? "[]"),
  }))

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.locator(".ratio-displays-qa").screenshot({ path })
  captures.push(`captures/${id}.png`)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${baseUrl}/?qa-case=ratio-displays`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })

  check(checks, "ratio-displays-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "ratio-displays-real-factories-mounted",
    (await page.locator("[data-testid='ratio-tuner-display-app']").count()) === 1 &&
      (await page.locator("[data-testid='ratio-cassette-display-app']").count()) === 1,
  )
  let current = await state(page)
  check(checks, "ratio-displays-two-subscriptions", current.listenerCount === 2)
  check(
    checks,
    "ratio-displays-front-surfaces-visible",
    current.visible.length === 2 && current.visible.every(Boolean),
  )
  check(
    checks,
    "ratio-displays-loading-station-volume-samples-text",
    (await page.locator(".ratio-display-state").allTextContents()).every((text) => text === "LOADING") &&
      (await page.locator(".ratio-display-station").allTextContents()).every((text) => text === "QA Radio Signal") &&
      (await page.locator(".ratio-display-volume").allTextContents()).every((text) => text === "VOL 35%") &&
      (await page.locator(".ratio-display-samples").allTextContents()).every((text) => text !== "SAMPLES · —"),
  )
  check(
    checks,
    "ratio-displays-no-controls-or-dispatch-surface",
    (await page.locator(".model-screen button, .model-screen input, .model-screen select, .model-screen textarea, .model-screen audio, .model-screen video, .model-screen iframe").count()) === 0,
  )
  await capture(page, captures, evidenceDir, "loading-1280")

  await page.getByRole("button", { name: "Play fixture" }).click()
  check(
    checks,
    "ratio-displays-shared-playing-snapshot",
    (await page.locator("[data-testid='ratio-tuner-display-app']").getAttribute("data-radio-state")) === "playing" &&
      (await page.locator("[data-testid='ratio-cassette-display-app']").getAttribute("data-radio-state")) === "playing" &&
      (await page.locator(".ratio-display-samples").allTextContents()).every((text) => text !== "SAMPLES · —"),
  )
  await capture(page, captures, evidenceDir, "playing-1280")

  await page.setViewportSize({ width: 768, height: 900 })
  await capture(page, captures, evidenceDir, "playing-768")

  await page.getByRole("button", { name: "Power off" }).click()
  check(
    checks,
    "ratio-displays-powered-off-text",
    (await page.locator(".ratio-display-state").allTextContents()).every((text) => text === "POWER OFF"),
  )
  await capture(page, captures, evidenceDir, "power-off-768")

  await page.getByRole("button", { name: "Inject stream error" }).click()
  check(
    checks,
    "ratio-displays-error-is-text-only",
    (await page.locator(".ratio-display-state").allTextContents()).every((text) => text === "ERROR") &&
      (await page.locator(".ratio-display-error").allTextContents()).every((text) => text.includes("STREAM-FAILED")) &&
      (await page.locator(".model-screen img").count()) === 0,
  )
  await capture(page, captures, evidenceDir, "error-768")

  await page.getByRole("button", { name: "Play fixture" }).click()
  await page.emulateMedia({ reducedMotion: "reduce" })
  const reduced = await page.locator(".ratio-cassette-reel").first().evaluate((reel) => ({
    animationName: getComputedStyle(reel).animationName,
    animationDuration: getComputedStyle(reel).animationDuration,
    textPresent:
      document.querySelector("[data-testid='ratio-cassette-display-app'] .ratio-display-state")?.textContent === "PLAYING" &&
      document.querySelector("[data-testid='ratio-cassette-display-app'] .ratio-display-volume")?.textContent === "VOL 35%",
  }))
  check(
    checks,
    "ratio-displays-reduced-motion-freezes-decoration-keeps-text",
    reduced.animationName === "none" && reduced.animationDuration === "0s" && reduced.textPresent,
  )
  await page.setViewportSize({ width: 375, height: 812 })
  await capture(page, captures, evidenceDir, "reduced-motion-375")
  await page.emulateMedia({ reducedMotion: "no-preference" })

  await page.getByRole("button", { name: "Toggle occlusion" }).click()
  current = await state(page)
  check(
    checks,
    "ratio-displays-occlusion-is-hidden-by-screen-runtime",
    current.occluding === "true" && current.visible.length === 2 && current.visible.every((visible) => !visible),
  )
  await capture(page, captures, evidenceDir, "occluded-375")
  await page.getByRole("button", { name: "Toggle occlusion" }).click()
  current = await state(page)
  check(checks, "ratio-displays-occlusion-restores", current.occluding === "false" && current.visible.every(Boolean))

  await page.getByRole("button", { name: "Toggle back-facing" }).click()
  current = await state(page)
  check(
    checks,
    "ratio-displays-back-facing-is-hidden-by-screen-runtime",
    current.backFacing === "true" && current.visible.length === 2 && current.visible.every((visible) => !visible),
  )
  await capture(page, captures, evidenceDir, "back-facing-375")
  await page.getByRole("button", { name: "Toggle back-facing" }).click()
  current = await state(page)
  check(checks, "ratio-displays-front-restores", current.visible.length === 2 && current.visible.every(Boolean))

  await page.getByRole("button", { name: "Remove displays" }).click()
  await page.getByRole("button", { name: "Remove displays" }).click()
  await page.getByRole("button", { name: "Play fixture" }).click()
  current = await state(page)
  check(
    checks,
    "ratio-displays-exactly-once-unsubscribe-and-stale-emission-contained",
    current.removed === "true" &&
      current.listenerCount === 0 &&
      current.unsubscribeCalls === 2 &&
      (await page.locator(".model-screen").count()) === 0,
  )
  await capture(page, captures, evidenceDir, "disposed-375")

  writeFileSync(
    join(evidenceDir, "ratio-displays-observation.json"),
    `${JSON.stringify({ checks, final: current, reduced }, null, 2)}\n`,
  )
  return { captures, checks }
}
