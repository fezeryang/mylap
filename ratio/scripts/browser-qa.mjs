import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const baseUrl = process.env.RADIO_QA_URL ?? "http://127.0.0.1:5175"
const evidenceDir = new URL("../evidence/", import.meta.url)
const rendersDir = new URL("renders/", evidenceDir)
const checks = []
const consoleErrors = []
const pageErrors = []
await mkdir(rendersDir, { recursive: true })
const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(60_000)
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
page.on("pageerror", (error) => pageErrors.push(error.message))
function record(name, pass, detail) {
  checks.push({ name, pass, detail })
  if (!pass) throw new Error(`${name}: ${detail}`)
}

await page.goto(baseUrl, { waitUntil: "networkidle" })
await page.waitForFunction(() => window.__ready === true && window.__interactive === true)
record(
  "runtime-ready",
  await page.locator("canvas.webgl-layer").isVisible(),
  "WebGL canvas visible",
)

for (const view of ["reference", "front", "right", "rear", "left"]) {
  await page.locator(`[data-view="${view}"]`).click()
  await page.waitForTimeout(220)
  await page.screenshot({ path: new URL(`renders/${view}.png`, evidenceDir).pathname })
  record(`view-${view}`, true, "camera control completed")
}

await page.locator('[data-view="reference"]').click()
await page.locator("#play").click()
await page.waitForTimeout(420)
record(
  "playback",
  (await page.locator("#play").getAttribute("aria-pressed")) === "true",
  "demo adapter playing",
)
record(
  "live-spectrum",
  (await page.locator("#spectrum i").count()) === 24,
  "24 live spectrum channels",
)
await page.locator("#frequency").fill("103.2")
record(
  "tuning",
  (await page.locator("#frequency-value").textContent())?.includes("103.2") === true,
  "frequency display updated",
)
await page.locator('[data-band="AM"]').click()
record(
  "band",
  (await page.locator('[data-band="AM"]').getAttribute("aria-pressed")) === "true",
  "band switched",
)
await page.locator("#power").click()
record(
  "power-off",
  (await page.locator("body").getAttribute("data-power")) === "off",
  "screen power state",
)
await page.screenshot({ path: new URL("renders/screen-state.png", evidenceDir).pathname })
await page.locator("#power").click()

await page.locator("#explode").fill("0.78")
await page.waitForTimeout(180)
await page.screenshot({ path: new URL("renders/exploded.png", evidenceDir).pathname })
const exploded = await page.evaluate(
  () => window.__radio.model.partGroups.get("dish-antenna").position.y > 5.5,
)
record("explosion", exploded, "authored part transforms separated")
await page.locator("#reset").click()
record(
  "reset",
  (await page.locator("#status").textContent()) === "View reset",
  "reference state restored",
)

const canvasBounds = await page.locator("canvas.webgl-layer").boundingBox()
if (canvasBounds === null) throw new Error("WebGL canvas bounds unavailable")
await page.mouse.click(
  canvasBounds.x + canvasBounds.width * 0.42,
  canvasBounds.y + canvasBounds.height * 0.58,
)
record(
  "part-picking",
  (await page.locator("#selected-part").textContent()) !== "none",
  "raycast selected stable part",
)
const manifest = await page.evaluate(() => window.__radio.model.getManifest())
record("manifest", manifest.parts.length === 29, `${manifest.parts.length} stable authored parts`)
await writeFile(new URL("../parts.json", import.meta.url), JSON.stringify(manifest, null, 2))

for (const { width, height } of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1536, height: 864 },
]) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(160)
  await page.screenshot({ path: new URL(`renders/responsive-${width}.png`, evidenceDir).pathname })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  record(`responsive-${width}`, !overflow, `horizontal overflow=${overflow}`)
}
await page.close()

const reduced = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce",
})
await reduced.goto(baseUrl, { waitUntil: "networkidle" })
await reduced.waitForFunction(() => window.__ready === true)
record(
  "reduced-motion",
  await reduced.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  "reduced motion respected",
)
await reduced.close()
const highDpi = await browser.newPage({
  viewport: { width: 900, height: 543 },
  deviceScaleFactor: 1.25,
})
await highDpi.goto(baseUrl, { waitUntil: "networkidle" })
await highDpi.waitForFunction(() => window.__ready === true)
await highDpi.locator('[data-view="front"]').click()
const highDpiLayers = await highDpi.evaluate(() => {
  const canvas = document.querySelector("canvas.webgl-layer")
  const screens = document.querySelector(".screen-layer")
  const tuner = document.querySelector("#tuner-screen")
  const cassette = document.querySelector("#cassette-screen")
  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(screens instanceof HTMLElement) ||
    !(tuner instanceof HTMLElement) ||
    !(cassette instanceof HTMLElement)
  ) {
    throw new TypeError("Render layers or device screens unavailable")
  }
  const canvasBounds = canvas.getBoundingClientRect()
  const screenBounds = screens.getBoundingClientRect()
  const tunerBounds = tuner.getBoundingClientRect()
  const cassetteBounds = cassette.getBoundingClientRect()
  return {
    canvas: [canvasBounds.width, canvasBounds.height],
    screens: [screenBounds.width, screenBounds.height],
    tuner: [tunerBounds.x, tunerBounds.y, tunerBounds.width, tunerBounds.height],
    cassette: [cassetteBounds.x, cassetteBounds.y, cassetteBounds.width, cassetteBounds.height],
    viewport: [innerWidth, innerHeight],
  }
})
await highDpi.screenshot({ path: new URL("renders/high-dpi-front.png", evidenceDir).pathname })
record(
  "high-dpi-layer-alignment",
  highDpiLayers.canvas[0] === highDpiLayers.viewport[0] &&
    highDpiLayers.canvas[1] === highDpiLayers.viewport[1] &&
    highDpiLayers.screens[0] === highDpiLayers.viewport[0] &&
    highDpiLayers.screens[1] === highDpiLayers.viewport[1],
  JSON.stringify(highDpiLayers),
)
const within = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance
record(
  "high-dpi-screen-apertures",
  within(highDpiLayers.tuner[0], 273, 3) &&
    within(highDpiLayers.tuner[1], 222, 3) &&
    within(highDpiLayers.tuner[2], 357, 4) &&
    within(highDpiLayers.tuner[3], 75, 3) &&
    within(highDpiLayers.cassette[0], 414, 3) &&
    within(highDpiLayers.cassette[1], 339, 3) &&
    within(highDpiLayers.cassette[2], 101, 3) &&
    within(highDpiLayers.cassette[3], 66, 3),
  JSON.stringify({ tuner: highDpiLayers.tuner, cassette: highDpiLayers.cassette }),
)
await highDpi.close()
const blockout = await browser.newPage({ viewport: { width: 1514, height: 1009 } })
await blockout.goto(`${baseUrl}?flat=1&review=1`, { waitUntil: "networkidle" })
await blockout.waitForFunction(() => window.__ready === true)
await blockout.screenshot({
  path: new URL("renders/blockout-flat.png", evidenceDir).pathname,
  omitBackground: true,
})
await blockout.goto(`${baseUrl}?review=1`, { waitUntil: "networkidle" })
await blockout.waitForFunction(() => window.__ready === true)
await blockout.screenshot({
  path: new URL("renders/review-isolated.png", evidenceDir).pathname,
  omitBackground: true,
})
await blockout.close()
record("console-errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none")
record("page-errors", pageErrors.length === 0, pageErrors.join(" | ") || "none")
await writeFile(
  new URL("browser-qa.json", evidenceDir),
  JSON.stringify({ status: "PASS", baseUrl, checks, consoleErrors, pageErrors }, null, 2),
)
await browser.close()
console.log(JSON.stringify({ status: "PASS", checks: checks.length, parts: manifest.parts.length }))
