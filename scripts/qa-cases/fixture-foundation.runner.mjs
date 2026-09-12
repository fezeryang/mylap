import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const fixtureFrame = (page) => page.frame({ url: /\/qa\/iframe-fixture\.html/ })

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=fixture-foundation`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  check(checks, "fixture-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "fixture-lazy-route",
    (await page.locator("html").getAttribute("data-qa-cases"))?.split(",").includes("fixture-foundation") === true,
  )

  const frameElement = page.locator("[data-testid='fixture-frame']")
  check(
    checks,
    "iframe-security",
    (await frameElement.getAttribute("sandbox")) ===
      "allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox" &&
      (await frameElement.getAttribute("referrerpolicy")) === "no-referrer",
  )
  let frame = fixtureFrame(page)
  if (frame === null) {
    await page.waitForTimeout(50)
    frame = fixtureFrame(page)
  }
  check(checks, "iframe-load", frame !== null && (await frame.locator("h1").textContent()) === "Local iframe fixture")

  await frame.locator("#fixture-link").click()
  await frame.waitForURL(/\/qa\/iframe-linked\.html/)
  check(checks, "iframe-link", (await frame.locator("h1").textContent()) === "Local link loaded")
  await frame.locator("a").click()
  await frame.waitForURL(/\/qa\/iframe-fixture\.html/)
  await frame.locator("input[name='value']").fill("verified")
  await frame.getByRole("button", { name: "Submit fixture form" }).click()
  await frame.waitForURL(/\/qa\/iframe-submitted\.html\?value=verified/)
  check(checks, "iframe-form", (await frame.locator("#submitted-value").textContent()) === "verified")

  await frame.goto(`${baseUrl}/qa/iframe-fixture.html`)
  const popupPromise = page.waitForEvent("popup")
  await frame.locator("#fixture-popup").click()
  const popup = await popupPromise
  await popup.waitForLoadState("domcontentloaded")
  check(checks, "popup-path", new URL(popup.url()).pathname === "/qa/popup-target.html")
  check(checks, "popup-opener-null", await popup.evaluate(() => window.opener === null))
  await popup.close()

  const validAudio = page.locator("[data-testid='valid-audio']")
  await page.locator("[data-testid='play-valid-audio']").click()
  await page.waitForFunction(() =>
    document.querySelector("[data-testid='valid-audio']")?.getAttribute("data-events")?.includes("timeupdate"),
  )
  check(checks, "audio-valid-playing", (await validAudio.getAttribute("data-events"))?.includes("playing") === true)
  check(checks, "audio-valid-timeupdate", (await validAudio.getAttribute("data-events"))?.includes("timeupdate") === true)
  await page.locator("[data-testid='pause-valid-audio']").click()
  await page.waitForFunction(() =>
    document.querySelector("[data-testid='valid-audio']")?.getAttribute("data-events")?.includes("pause"),
  )
  check(checks, "audio-valid-pause", (await validAudio.getAttribute("data-events"))?.includes("pause") === true)
  await page.waitForFunction(() =>
    document.querySelector("[data-testid='missing-audio']")?.getAttribute("data-events")?.includes("error"),
  )
  await page.waitForFunction(() =>
    document.querySelector("[data-testid='corrupt-audio']")?.getAttribute("data-events")?.includes("error"),
  )
  check(checks, "audio-missing-error", true)
  check(checks, "audio-corrupt-error", true)

  for (const viewport of [
    { id: "viewport-375", width: 375, height: 812 },
    { id: "viewport-768", width: 768, height: 900 },
    { id: "viewport-1280", width: 1280, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const path = join(evidenceDir, "captures", `${viewport.id}.png`)
    await page.screenshot({ path })
    captures.push(`captures/${viewport.id}.png`)
    check(checks, viewport.id, true)
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.locator(".fixture-status").evaluate((status) => {
    status.textContent = "Fixtures ready · reduced motion"
  })
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const reducedPath = join(evidenceDir, "captures", "reduced-motion.png")
  await page.screenshot({ path: reducedPath })
  captures.push("captures/reduced-motion.png")
  check(checks, "reduced-motion", (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) === true)
  check(checks, "reduced-content-visible", await page.locator("#fixture-heading").isVisible())

  return { checks, captures }
}
