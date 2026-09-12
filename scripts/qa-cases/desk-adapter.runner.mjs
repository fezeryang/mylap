import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const snapshot = async (page) => {
  return page.locator("[data-testid='desk-adapter-status']").evaluate((status) => ({
    active: status.dataset.active,
    activeChanges: Number(status.dataset.activeChanges),
    bounds: JSON.parse(status.dataset.bounds ?? "[]"),
    explosion: Number(status.dataset.explosion),
    keyboard: status.dataset.keyboard,
    outerRoot: JSON.parse(status.dataset.outerRoot ?? "{}"),
    partIds: JSON.parse(status.dataset.partIds ?? "[]"),
    picks: Number(status.dataset.picks),
    screens: Number(status.dataset.screens),
    selectable: Number(status.dataset.selectable),
    selectionHelper: status.dataset.selectionHelper,
    shift: Number(status.dataset.shift),
  }))
}

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0
        const nextFrame = () => {
          frames += 1
          if (frames === 6) {
            resolve()
            return
          }
          requestAnimationFrame(nextFrame)
        }
        requestAnimationFrame(nextFrame)
      }),
  )
  const path = join(evidenceDir, "captures", `${id}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${id}.png`)
}

const clickSweep = async (page) => {
  const canvas = page.locator("[data-testid='desk-adapter-stage'] canvas")
  const box = await canvas.boundingBox()
  if (box === null) throw new Error("Desk adapter canvas is unavailable")
  for (const row of [0.2, 0.4, 0.6, 0.8]) {
    for (const column of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      await page.mouse.click(box.x + box.width * column, box.y + box.height * row)
    }
  }
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []
  const expectedPartIds = [
    "upper-shell",
    "lower-chassis",
    "work-surface",
    "work-surface-linework",
    "light-rails",
    "control-pods",
    "front-latch",
    "leg-left-rear-hip",
    "leg-left-rear-upper",
    "leg-left-rear-lower",
    "leg-right-rear-hip",
    "leg-right-rear-upper",
    "leg-right-rear-lower",
    "leg-left-front-hip",
    "leg-left-front-upper",
    "leg-left-front-lower",
    "leg-right-front-hip",
    "leg-right-front-upper",
    "leg-right-front-lower",
  ]

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${baseUrl}/?qa-case=desk-adapter`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  check(checks, "desk-adapter-host-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(
    checks,
    "desk-adapter-lazy-route",
    (await page.locator("html").getAttribute("data-qa-cases"))?.split(",").includes("desk-adapter") === true,
  )
  check(checks, "desk-adapter-canvas", await page.locator("[data-testid='desk-adapter-stage'] canvas").isVisible())

  let state = await snapshot(page)
  check(checks, "desk-type-instance", state.active === "desk-main")
  check(checks, "desk-outer-root-identity", JSON.stringify(state.outerRoot) === JSON.stringify({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }))
  check(checks, "desk-inner-shift-once", state.shift === -2.4775)
  check(checks, "desk-tabletop-y-zero", Math.abs(state.bounds[4]) <= 0.000001)
  check(checks, "desk-exact-parts", JSON.stringify(state.partIds) === JSON.stringify(expectedPartIds))
  check(checks, "desk-screenless-nonselectable", state.selectable === 0 && state.screens === 0 && state.keyboard === "false")

  await page.setViewportSize({ width: 375, height: 812 })
  await page.locator("[data-testid='desk-adapter-stage'] canvas").waitFor()
  await capture(page, captures, evidenceDir, "reduced-motion")
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  state = await snapshot(page)
  check(
    checks,
    "desk-normal-motion-remount-contract",
    state.explosion === 0 && state.screens === 0 && state.selectable === 0,
  )

  await capture(page, captures, evidenceDir, "overview")
  await clickSweep(page)
  state = await snapshot(page)
  check(checks, "desk-click-sweep-no-picks", state.picks === 0)
  check(checks, "desk-click-sweep-no-activation", state.activeChanges === 0 && state.active === "desk-main")
  check(checks, "desk-click-sweep-no-helper", state.selectionHelper === "false")

  await page.locator("input[type='range']").fill("1")
  state = await snapshot(page)
  check(checks, "desk-explosion-forwarded", state.explosion === 1)
  await capture(page, captures, evidenceDir, "exploded")
  await page.getByRole("button", { name: "Reset explosion" }).click()
  state = await snapshot(page)
  check(checks, "desk-explosion-reset", state.explosion === 0 && Math.abs(state.bounds[4]) <= 0.000001)
  await capture(page, captures, evidenceDir, "reset")

  await page.setViewportSize({ width: 768, height: 900 })
  await capture(page, captures, evidenceDir, "viewport-768")
  await page.setViewportSize({ width: 375, height: 812 })
  await capture(page, captures, evidenceDir, "viewport-375")
  writeFileSync(join(evidenceDir, "desk-adapter-observation.json"), `${JSON.stringify(state, null, 2)}\n`)

  return { captures, checks }
}
