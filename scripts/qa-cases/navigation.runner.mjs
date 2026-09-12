import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const readSnapshot = (page) =>
  page.locator("[data-testid='navigation-status']").evaluate((status) => ({
    disposed: status.dataset.disposed,
    ...JSON.parse(status.dataset.snapshot ?? "{}"),
  }))

const within = (value, expected, tolerance = 0.000001) =>
  Number.isFinite(value) && Math.abs(value - expected) <= tolerance

const vectorEquals = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((value, index) => within(value, expected[index]))

const poseEquals = (snapshot, position, target) =>
  vectorEquals(snapshot.camera, position) &&
  vectorEquals(snapshot.target, target) &&
  vectorEquals(snapshot.pose?.position, position) &&
  vectorEquals(snapshot.pose?.target, target)

const advance = async (page, timestamp) => {
  await page.locator("[data-testid='timestamp']").fill(String(timestamp))
  await page.locator("[data-testid='advance']").click()
  return readSnapshot(page)
}

const capture = async (page, captures, evidenceDir, name) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  const path = join(evidenceDir, "captures", `${name}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${name}.png`)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=navigation`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()

  let snapshot = await readSnapshot(page)
  check(checks, "navigation-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(checks, "landing-state", snapshot.state === "landing")
  check(checks, "landing-pose", poseEquals(snapshot, [0, 10.5, -20], [0, 0.5, 0]))
  check(checks, "landing-input-ready", snapshot.controlsEnabled && snapshot.inputEnabled && !snapshot.interactionLocked)
  await capture(page, captures, evidenceDir, "landing-1280")

  await page.locator("[data-testid='enter']").click()
  snapshot = await readSnapshot(page)
  check(checks, "entering-lock", snapshot.state === "entering" && !snapshot.controlsEnabled && !snapshot.inputEnabled && snapshot.interactionLocked)
  snapshot = await advance(page, 800)
  check(checks, "entry-mid-state", snapshot.state === "entering" && within(snapshot.progress, 0.5))
  check(checks, "entry-mid-pose", poseEquals(snapshot, [-3.4, 8.45, -15.25], [0, 0.5, 0]))
  await capture(page, captures, evidenceDir, "entering-mid-1280")
  snapshot = await advance(page, 1600)
  check(checks, "overview-state", snapshot.state === "overview")
  check(checks, "overview-pose", poseEquals(snapshot, [-6.8, 6.4, -10.5], [0, 0.5, 0]))
  check(checks, "entry-restored-once", snapshot.restoreCount === 1 && snapshot.controlsEnabled && snapshot.inputEnabled)
  await capture(page, captures, evidenceDir, "overview-1280")

  await page.locator("[data-testid='focus-phone']").click()
  snapshot = await advance(page, 1925)
  check(checks, "phone-mid-state", snapshot.state === "focusing-phone" && within(snapshot.progress, 0.5))
  await capture(page, captures, evidenceDir, "phone-focus-mid-1280")
  snapshot = await advance(page, 2250)
  check(checks, "phone-focus-state", snapshot.state === "phone-focus")
  check(checks, "phone-focus-pose", poseEquals(snapshot, [-3.2, 3, -4.3], [-3, 0.35, 0]))
  await capture(page, captures, evidenceDir, "phone-focus-1280")

  await page.locator("[data-testid='return-overview']").click()
  snapshot = await advance(page, 2575)
  check(checks, "return-mid-state", snapshot.state === "returning" && within(snapshot.progress, 0.5))
  await capture(page, captures, evidenceDir, "returning-mid-1280")
  snapshot = await advance(page, 2900)
  check(checks, "phone-return-overview", snapshot.state === "overview" && poseEquals(snapshot, [-6.8, 6.4, -10.5], [0, 0.5, 0]))

  await page.locator("[data-testid='focus-computer']").click()
  snapshot = await advance(page, 3550)
  check(checks, "computer-focus-state", snapshot.state === "computer-focus")
  check(checks, "computer-focus-pose", poseEquals(snapshot, [0, 4.2, -6.2], [0, 0.8, 0]))
  await capture(page, captures, evidenceDir, "computer-focus-1280")

  for (const viewport of [
    { id: "overview-375", width: 375, height: 812 },
    { id: "overview-768", width: 768, height: 900 },
    { id: "overview-1280-final", width: 1280, height: 900 },
  ]) {
    await page.locator("[data-testid='return-overview']").click()
    await advance(page, Number((await readSnapshot(page)).state === "overview" ? 3551 : 4200))
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await capture(page, captures, evidenceDir, viewport.id)
    check(checks, viewport.id, true)
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.locator("[data-testid='enter']").click()
  await advance(page, 400)
  await page.locator("[data-testid='focus-phone']").click()
  await advance(page, 700)
  await page.locator("[data-testid='focus-computer']").click()
  const beforeMalformed = await readSnapshot(page)
  await advance(page, "not-time")
  await advance(page, -1)
  snapshot = await advance(page, 699)
  check(checks, "malformed-time-ignored", JSON.stringify(snapshot.pose) === JSON.stringify(beforeMalformed.pose))
  snapshot = await advance(page, 1349)
  check(checks, "superseded-still-transitioning", snapshot.state === "focusing-computer" && snapshot.settlements.length === 0)
  snapshot = await advance(page, 1350)
  check(checks, "supersession-newest-only", snapshot.state === "computer-focus" && snapshot.settlements.join(",") === "computer-focus")
  check(checks, "supersession-one-restore", snapshot.lockCount === 1 && snapshot.restoreCount === 1)
  await capture(page, captures, evidenceDir, "supersession-computer-final")

  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.locator("[data-testid='enter']").click()
  await advance(page, 300)
  const beforeDispose = await readSnapshot(page)
  await page.locator("[data-testid='dispose']").click()
  await advance(page, 1600)
  snapshot = await readSnapshot(page)
  check(checks, "dispose-restores-once", snapshot.disposed === "true" && snapshot.restoreCount === 1 && snapshot.controlsEnabled && snapshot.inputEnabled)
  check(checks, "dispose-no-post-callback", JSON.stringify(snapshot.camera) === JSON.stringify(beforeDispose.camera) && snapshot.settlements.length === 0)

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.locator("[data-testid='enter']").click()
  snapshot = await readSnapshot(page)
  check(checks, "reduced-entry-synchronous", snapshot.state === "overview" && poseEquals(snapshot, [-6.8, 6.4, -10.5], [0, 0.5, 0]))
  await page.locator("[data-testid='focus-phone']").click()
  snapshot = await readSnapshot(page)
  check(checks, "reduced-focus-synchronous", snapshot.state === "phone-focus" && poseEquals(snapshot, [-3.2, 3, -4.3], [-3, 0.35, 0]))
  check(checks, "reduced-never-locks", snapshot.lockCount === 0 && snapshot.restoreCount === 0 && snapshot.controlsEnabled && snapshot.inputEnabled)
  await capture(page, captures, evidenceDir, "reduced-phone-focus")

  writeFileSync(join(evidenceDir, "navigation-observation.json"), `${JSON.stringify({ checks, finalSnapshot: snapshot }, null, 2)}\n`)
  return { checks, captures }
}
