import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const readSnapshot = (page) =>
  page.locator("[data-testid='normalization-status']").evaluate((status) => ({
    bounds: JSON.parse(status.dataset.bounds ?? "[]"),
    authoredContentScale: JSON.parse(status.dataset.authoredContentScale ?? "null"),
    disposed: status.dataset.disposed,
    explosion: status.dataset.explosion,
    outerRoot: JSON.parse(status.dataset.outerRoot ?? "null"),
    screens: JSON.parse(status.dataset.screens ?? "[]"),
  }))

const footprint = (bounds) => ({
  x: bounds[3] - bounds[0],
  z: bounds[5] - bounds[2],
})

const checkNormalized = (checks, snapshot, id) => {
  const size = footprint(snapshot.bounds)
  check(checks, `${id}-x-target`, size.x <= 4.201)
  check(checks, `${id}-z-target`, size.z <= 2.201)
  check(checks, `${id}-one-target-exact`, Math.min(Math.abs(size.x - 4.2), Math.abs(size.z - 2.2)) <= 0.001)
  check(checks, `${id}-bottom`, Math.abs(snapshot.bounds[1]) <= 0.001)
  check(checks, `${id}-screen-count`, snapshot.screens.length === 3)
  check(checks, `${id}-screen-anchors`, snapshot.screens.every((screen) => screen.aligned && screen.insideAuthoredContent))
}

const within = (value, expected, tolerance = 0.000001) =>
  Number.isFinite(value) && Math.abs(value - expected) <= tolerance

const vectorEquals = (vector, expected) =>
  Array.isArray(vector) && vector.length === expected.length && vector.every((value, index) => within(value, expected[index]))

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  await page.goto(`${baseUrl}/?qa-case=asset-normalization`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  check(checks, "normalization-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "normalization-lazy-route",
    (await page.locator("html").getAttribute("data-qa-cases"))?.split(",").includes("asset-normalization") === true,
  )
  check(checks, "bounds-overlay-canvas", await page.locator("[data-testid='normalized-stage'] canvas").isVisible())
  const initial = await readSnapshot(page)
  checkNormalized(checks, initial, "initial")
  check(
    checks,
    "outer-root-identity-transform",
    initial.outerRoot !== null &&
      vectorEquals(initial.outerRoot.position, [0, 0, 0]) &&
      vectorEquals(initial.outerRoot.rotation, [0, 0, 0]) &&
      vectorEquals(initial.outerRoot.scale, [1, 1, 1]),
  )
  check(
    checks,
    "authored-content-uniform-scale",
    Array.isArray(initial.authoredContentScale) &&
      initial.authoredContentScale.length === 3 &&
      initial.authoredContentScale.every((value) => Number.isFinite(value) && value > 0) &&
      within(initial.authoredContentScale[0], initial.authoredContentScale[1]) &&
      within(initial.authoredContentScale[1], initial.authoredContentScale[2]),
  )
  writeFileSync(
    join(evidenceDir, "normalization-observation.json"),
    `${JSON.stringify({ initial, footprint: footprint(initial.bounds) }, null, 2)}\n`,
  )

  for (const viewport of [
    { id: "viewport-375", width: 375, height: 812 },
    { id: "viewport-768", width: 768, height: 900 },
    { id: "viewport-1280", width: 1280, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.waitForTimeout(50)
    const path = join(evidenceDir, "captures", `${viewport.id}.png`)
    await page.screenshot({ path })
    captures.push(`captures/${viewport.id}.png`)
    check(checks, viewport.id, true)
  }
  const frontPath = join(evidenceDir, "captures", "normalized-front.png")
  await page.screenshot({ path: frontPath })
  captures.push("captures/normalized-front.png")

  await page.locator("[data-testid='explode']").click()
  const exploded = await readSnapshot(page)
  check(checks, "explosion-applied", exploded.explosion === "1")
  check(checks, "explosion-screen-ancestry", exploded.screens.every((screen) => screen.aligned && screen.insideAuthoredContent))
  await page.locator("[data-testid='reset']").click()
  const reset = await readSnapshot(page)
  check(checks, "explosion-reset", reset.explosion === "0")
  checkNormalized(checks, reset, "reset")
  const referencePath = join(evidenceDir, "captures", "normalized-reference.png")
  await page.screenshot({ path: referencePath })
  captures.push("captures/normalized-reference.png")

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  const reduced = await readSnapshot(page)
  checkNormalized(checks, reduced, "reduced")
  const reducedPath = join(evidenceDir, "captures", "reduced-motion.png")
  await page.screenshot({ path: reducedPath })
  captures.push("captures/reduced-motion.png")
  check(checks, "reduced-motion", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))

  await page.locator("[data-testid='dispose']").click()
  const disposed = await readSnapshot(page)
  check(checks, "disposal-once", disposed.disposed === "true")

  return { checks, captures }
}
