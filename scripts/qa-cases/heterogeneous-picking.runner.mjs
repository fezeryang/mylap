import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const snapshot = async (page) => {
  return page.locator("[data-testid='heterogeneous-status']").evaluate((status) => ({
    active: status.dataset.active,
    deskPoint: JSON.parse(status.dataset.deskPoint ?? "[]"),
    disposed: status.dataset.disposed,
    disposalCounts: JSON.parse(status.dataset.disposalCounts ?? "{}"),
    outline: status.dataset.outline,
    phonePoint: JSON.parse(status.dataset.phonePoint ?? "[]"),
    picks: JSON.parse(status.dataset.picks ?? "[]"),
    powerToggles: status.dataset.powerToggles,
    radioPoint: JSON.parse(status.dataset.radioPoint ?? "[]"),
  }))
}

const clickDeclaredPoint = async (page, point) => {
  if (!Array.isArray(point) || point.length !== 2) throw new Error("Declared fixture point is unavailable")
  await page.mouse.click(point[0], point[1])
}

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${id}.png`)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=heterogeneous-picking`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  check(checks, "heterogeneous-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "heterogeneous-lazy-route",
    (await page.locator("html").getAttribute("data-qa-cases"))?.split(",").includes("heterogeneous-picking") === true,
  )
  check(checks, "production-controller-canvas", await page.locator("[data-testid='heterogeneous-stage'] canvas").isVisible())

  await page.setViewportSize({ width: 1280, height: 900 })
  let state = await snapshot(page)
  await clickDeclaredPoint(page, state.phonePoint)
  state = await snapshot(page)
  check(checks, "phone-stable-instance-part", state.picks.length === 1 && state.picks[0] === "phone-main:phone-primary-body")
  check(checks, "phone-active", state.active === "phone-main")
  check(checks, "phone-outline-visible", state.outline === "true")
  check(checks, "phone-title-stable-part", (await page.locator("[data-testid='part-title']").textContent()) === "PHONE PRIMARY BODY")
  await capture(page, captures, evidenceDir, "phone-outline")

  await clickDeclaredPoint(page, state.radioPoint)
  state = await snapshot(page)
  check(
    checks,
    "radio-stable-instance-part",
    state.picks.length === 2 && state.picks[1] === "radio-main:radio-tuner-casing",
  )
  check(checks, "radio-active", state.active === "radio-main")
  check(checks, "radio-outline-visible", state.outline === "true")
  check(checks, "radio-title-stable-part", (await page.locator("[data-testid='part-title']").textContent()) === "RADIO TUNER CASING")
  await capture(page, captures, evidenceDir, "radio-outline")

  const beforeEnvironment = state
  await clickDeclaredPoint(page, state.deskPoint)
  state = await snapshot(page)
  check(checks, "desk-hit-active-unchanged", state.active === beforeEnvironment.active)
  check(checks, "desk-hit-picks-unchanged", JSON.stringify(state.picks) === JSON.stringify(beforeEnvironment.picks))
  check(checks, "desk-hit-outline-unchanged", state.outline === beforeEnvironment.outline)
  const canvas = await page.locator("[data-testid='heterogeneous-stage'] canvas").boundingBox()
  if (canvas === null) throw new Error("Heterogeneous canvas bounds are unavailable")
  await page.mouse.click(canvas.x + 4, canvas.y + 4)
  state = await snapshot(page)
  check(checks, "outside-hit-active-unchanged", state.active === beforeEnvironment.active)
  check(checks, "outside-hit-picks-unchanged", JSON.stringify(state.picks) === JSON.stringify(beforeEnvironment.picks))
  check(checks, "outside-hit-outline-unchanged", state.outline === beforeEnvironment.outline)
  await capture(page, captures, evidenceDir, "desk-outside-unchanged")

  await page.locator("[data-testid='remove-radio']").click()
  state = await snapshot(page)
  check(checks, "removal-active-fallback", state.active === "desk-main")
  check(checks, "removal-clears-outline", state.outline === "false")
  check(checks, "removal-disposes-radio-once", state.disposalCounts["radio-main"] === 1)
  check(checks, "screenless-power-disabled", await page.locator("[data-testid='screen-power']").isDisabled())
  check(checks, "screenless-power-state", (await page.locator("[data-testid='screen-power']").getAttribute("aria-pressed")) === "false")
  check(checks, "screenless-power-label", (await page.locator("[data-testid='screen-power']").textContent()) === "NO SCREENS")
  await page.locator("[data-testid='screen-power']").evaluate((button) => button.click())
  state = await snapshot(page)
  check(checks, "screenless-power-runtime-untouched", state.powerToggles === "0")

  for (const viewport of [
    { id: "viewport-375", width: 375, height: 812 },
    { id: "viewport-768", width: 768, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await capture(page, captures, evidenceDir, viewport.id)
    check(checks, viewport.id, true)
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await capture(page, captures, evidenceDir, "reduced-motion")
  check(checks, "reduced-motion", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))

  await page.locator("[data-testid='dispose-fixture']").click()
  state = await snapshot(page)
  check(checks, "fixture-dispose-ran", state.disposed === "true")
  check(
    checks,
    "fixture-resource-disposal-once",
    state.disposalCounts["desk-main"] === 1 &&
      state.disposalCounts["phone-main"] === 1 &&
      state.disposalCounts["radio-main"] === 1,
  )

  writeFileSync(
    join(evidenceDir, "heterogeneous-picking-observation.json"),
    `${JSON.stringify({ checks, finalState: state }, null, 2)}\n`,
  )
  return { checks, captures }
}
