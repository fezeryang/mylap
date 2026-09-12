import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const snapshot = async (page) =>
  page.locator("[data-testid='ratio-adapter-status']").evaluate((status) => ({
    bounds: JSON.parse(status.dataset.bounds ?? "[]"),
    disposalCount: Number(status.dataset.disposalCount),
    explosion: Number(status.dataset.explosion),
    partIds: JSON.parse(status.dataset.partIds ?? "[]"),
    reelRotation: Number(status.dataset.reelRotation),
    removed: status.dataset.removed,
    screenCount: Number(status.dataset.screenCount),
    screenIds: JSON.parse(status.dataset.screenIds ?? "[]"),
    screenNormal: JSON.parse(status.dataset.screenNormal ?? "[]"),
    screenVisible: JSON.parse(status.dataset.screenVisible ?? "[]"),
    status: status.dataset.status,
  }))

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.dispatchEvent(new Event("resize"))
        let frames = 0
        const nextFrame = () => {
          frames += 1
          if (frames === 6) resolve()
          else requestAnimationFrame(nextFrame)
        }
        requestAnimationFrame(nextFrame)
      }),
  )
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.locator(".ratio-adapter-shell").screenshot({ path })
  captures.push(`captures/${id}.png`)
}

const captureSeparatedSurfaces = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.dispatchEvent(new Event("resize"))
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
  for (const [suffix, locator] of [
    ["model", page.locator("[data-testid='ratio-adapter-stage'] canvas")],
    ["tuner", page.locator(".model-screen[data-screen-id='ratio-tuner']")],
    ["cassette", page.locator(".model-screen[data-screen-id='ratio-cassette']")],
  ]) {
    const path = join(evidenceDir, "captures", `${id}-${suffix}.png`)
    await locator.screenshot({ path })
    captures.push(`captures/${id}-${suffix}.png`)
  }
}

const tick = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event("resize")))
}

const openSnapshotRoute = async (page, baseUrl, radioState, viewport) => {
  const query = new URLSearchParams({ "qa-case": "ratio-adapter" })
  if (radioState !== null) query.set("radio-state", radioState)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize(viewport)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []

  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${baseUrl}/?qa-case=ratio-adapter`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  let state = await snapshot(page)
  const sizeX = state.bounds[3] - state.bounds[0]
  const sizeZ = state.bounds[5] - state.bounds[2]
  check(checks, "ratio-adapter-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "ratio-adapter-lazy-route",
    (await page.locator("html").getAttribute("data-qa-cases"))?.split(",").includes("ratio-adapter") === true,
  )
  check(checks, "ratio-type-instance-ready", state.partIds.length === 29 && state.screenCount === 2)
  check(
    checks,
    "ratio-footprint-bottom",
    Math.abs(state.bounds[1]) <= 0.000001 &&
      sizeX <= 1.701 &&
      sizeZ <= 1.201 &&
      (Math.abs(sizeX - 1.7) <= 0.001 || Math.abs(sizeZ - 1.2) <= 0.001),
  )
  check(
    checks,
    "ratio-y-pi-front-orientation",
    state.screenNormal.length === 2 &&
      state.screenNormal.every(
        (normal) =>
          Math.abs(normal[0]) <= 0.000001 &&
          Math.abs(normal[1]) <= 0.000001 &&
          Math.abs(normal[2] + 1) <= 0.000001,
      ),
  )
  check(
    checks,
    "ratio-exact-screen-ids",
    JSON.stringify(state.screenIds) === JSON.stringify(["ratio-tuner", "ratio-cassette"]),
  )
  check(
    checks,
    "ratio-two-screens-aligned-visible",
    state.screenVisible.every(Boolean) &&
      (await page.locator("[data-testid='ratio-tuner-app']").count()) === 1 &&
      (await page.locator("[data-testid='ratio-cassette-app']").count()) === 1,
  )

  await page.getByRole("button", { name: "PLAY SNAPSHOT" }).click()
  state = await snapshot(page)
  const playingRotation = state.reelRotation
  check(checks, "ratio-playing-physical-motion", state.status === "playing" && playingRotation < 0)

  await page.getByRole("button", { name: "PAUSE SNAPSHOT" }).click()
  const pausedRotation = (await snapshot(page)).reelRotation
  await tick(page)
  state = await snapshot(page)
  check(
    checks,
    "ratio-paused-stationary",
    state.status === "paused" && state.reelRotation === pausedRotation && pausedRotation === playingRotation,
  )

  await page.getByRole("button", { name: "ERROR SNAPSHOT" }).click()
  const errorRotation = (await snapshot(page)).reelRotation
  await tick(page)
  state = await snapshot(page)
  check(
    checks,
    "ratio-error-textual-stationary",
    state.status === "error" &&
      state.reelRotation === errorRotation &&
      errorRotation === pausedRotation &&
      (await page.locator("[data-testid='ratio-error-state']").count()) === 2,
  )

  await page.locator("[data-testid='ratio-explosion']").fill("1")
  state = await snapshot(page)
  check(checks, "ratio-explosion", state.explosion === 1)
  await page.getByRole("button", { name: "RESET EXPLOSION" }).click()
  state = await snapshot(page)
  check(checks, "ratio-reset", state.explosion === 0)

  for (const { id, radioState, viewport } of [
    { id: "normal-two-screens", radioState: "paused", viewport: { width: 1280, height: 900 } },
    { id: "playing", radioState: "playing", viewport: { width: 1280, height: 900 } },
    { id: "paused", radioState: "paused", viewport: { width: 1280, height: 900 } },
    { id: "error", radioState: "error", viewport: { width: 1280, height: 900 } },
    { id: "viewport-768", radioState: "paused", viewport: { width: 768, height: 900 } },
    { id: "viewport-375", radioState: "paused", viewport: { width: 375, height: 812 } },
  ]) {
    await openSnapshotRoute(page, baseUrl, radioState, viewport)
    if (id === "normal-two-screens" || id.startsWith("viewport-")) {
      await capture(page, captures, evidenceDir, id)
    } else {
      await captureSeparatedSurfaces(page, captures, evidenceDir, id)
    }
    check(checks, id, true)
  }

  await page.emulateMedia({ reducedMotion: "reduce" })
  await openSnapshotRoute(page, baseUrl, "paused", { width: 375, height: 812 })
  state = await snapshot(page)
  check(checks, "ratio-reduced-contract", state.status === "paused" && state.screenCount === 2)
  await captureSeparatedSurfaces(page, captures, evidenceDir, "reduced-motion")
  await page.emulateMedia({ reducedMotion: "no-preference" })

  await openSnapshotRoute(page, baseUrl, "error", { width: 375, height: 812 })
  await page.getByRole("button", { name: "REMOVE RATIO" }).click()
  state = await snapshot(page)
  check(checks, "ratio-removal-disposes-once", state.removed === "true" && state.disposalCount === 1)
  check(
    checks,
    "ratio-removal-clears-both-screens",
    state.screenCount === 0 && (await page.locator(".model-screen").count()) === 0,
  )
  await capture(page, captures, evidenceDir, "removal")

  writeFileSync(
    join(evidenceDir, "ratio-adapter-observation.json"),
    `${JSON.stringify({ checks, finalState: state }, null, 2)}\n`,
  )
  return { captures, checks }
}
