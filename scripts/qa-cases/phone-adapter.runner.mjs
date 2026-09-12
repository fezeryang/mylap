import { writeFileSync } from "node:fs"
import { join } from "node:path"

const check = (checks, id, passed) => {
  checks.push({ id, passed })
  if (!passed) throw new Error(`Browser QA check failed: ${id}`)
}

const snapshot = async (page) =>
  page.locator("[data-testid='phone-adapter-status']").evaluate((status) => ({
    bounds: JSON.parse(status.dataset.bounds ?? "[]"),
    disposalCount: Number(status.dataset.disposalCount),
    explosion: Number(status.dataset.explosion),
    partIds: JSON.parse(status.dataset.partIds ?? "[]"),
    pickedPart: status.dataset.pickedPart,
    removed: status.dataset.removed,
    screenAnchor: JSON.parse(status.dataset.screenAnchor ?? "[]"),
    screenCount: Number(status.dataset.screenCount),
    screenNormal: JSON.parse(status.dataset.screenNormal ?? "[]"),
    screenVisible: status.dataset.screenVisible,
    selectables: Number(status.dataset.selectables),
  }))

const capture = async (page, captures, evidenceDir, id) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
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
  await page.screenshot({ path })
  captures.push(`captures/${id}.png`)
}

const pickPhone = async (page) => {
  const canvas = page.locator("[data-testid='phone-adapter-stage'] canvas").first()
  const box = await canvas.boundingBox()
  if (box === null) throw new Error("Phone adapter canvas is unavailable")
  for (const row of [0.35, 0.5, 0.65]) {
    for (const column of [0.35, 0.42, 0.5, 0.58, 0.65]) {
      await page.mouse.click(box.x + box.width * column, box.y + box.height * row)
      const state = await snapshot(page)
      if (state.pickedPart !== "none") return state
    }
  }
  return snapshot(page)
}

export const run = async ({ page, baseUrl, evidenceDir }) => {
  const checks = []
  const captures = []

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${baseUrl}/?qa-case=phone-adapter`, { waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 375, height: 812 })
  let state = await snapshot(page)
  check(checks, "phone-reduced-contract", state.explosion === 0 && state.screenCount === 1)
  await capture(page, captures, evidenceDir, "reduced-motion")

  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator("html[data-qa-ready='true']").waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  state = await snapshot(page)
  const sizeX = state.bounds[3] - state.bounds[0]
  const sizeZ = state.bounds[5] - state.bounds[2]
  check(checks, "phone-type-instance-ready", await page.evaluate(() => window.__todouComponentQa?.ready === true))
  check(checks, "phone-parts-selectables", state.partIds.length === 20 && state.selectables > state.partIds.length)
  check(checks, "phone-footprint-bottom", Math.abs(state.bounds[1]) <= 0.000001 && sizeX <= 0.901 && sizeZ <= 2.201 && (Math.abs(sizeX - 0.9) <= 0.001 || Math.abs(sizeZ - 2.2) <= 0.001))
  check(checks, "phone-flat-positive-y", Math.abs(state.screenNormal[0]) <= 0.000001 && Math.abs(state.screenNormal[1] - 1) <= 0.000001 && Math.abs(state.screenNormal[2]) <= 0.000001)
  check(checks, "phone-screen-aligned-visible", state.screenCount === 1 && state.screenVisible === "true" && state.screenAnchor[1] > state.bounds[1])
  await capture(page, captures, evidenceDir, "normal-aligned")

  const screenButton = page.getByRole("button", { name: "OPEN CONTROL" })
  await screenButton.click()
  check(checks, "phone-css3d-interactive", (await page.locator("[data-qa-phone-app]").getAttribute("data-activations")) === "1")

  await page.getByRole("button", { name: "SCREEN OFF FOR PICKING" }).click()
  state = await pickPhone(page)
  check(checks, "phone-picking-stable-part", state.pickedPart !== "none" && state.partIds.includes(state.pickedPart))
  await capture(page, captures, evidenceDir, "picked-outline")
  await page.getByRole("button", { name: "SCREEN ON" }).click()

  await page.locator("[data-testid='phone-explosion']").fill("1")
  state = await snapshot(page)
  check(checks, "phone-explosion", state.explosion === 1 && state.screenCount === 1)
  await capture(page, captures, evidenceDir, "exploded")
  await page.getByRole("button", { name: "RESET EXPLOSION" }).click()
  state = await snapshot(page)
  check(checks, "phone-reset", state.explosion === 0 && state.screenCount === 1)
  await capture(page, captures, evidenceDir, "reset")

  await page.setViewportSize({ width: 768, height: 900 })
  await capture(page, captures, evidenceDir, "viewport-768")
  await page.setViewportSize({ width: 375, height: 812 })
  await capture(page, captures, evidenceDir, "viewport-375")

  await page.getByRole("button", { name: "REMOVE PHONE" }).click()
  state = await snapshot(page)
  check(checks, "phone-removal-disposes-once", state.removed === "true" && state.disposalCount === 1)
  check(checks, "phone-removal-clears-screen", state.screenCount === 0 && (await page.locator(".model-screen").count()) === 0)
  check(checks, "phone-removal-disposes-app", (await page.locator("html").getAttribute("data-phone-app-disposed")) === "true")
  await capture(page, captures, evidenceDir, "removal")

  writeFileSync(join(evidenceDir, "phone-adapter-observation.json"), `${JSON.stringify(state, null, 2)}\n`)
  return { captures, checks }
}
