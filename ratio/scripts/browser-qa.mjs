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

async function checkScreenProjection(page, label) {
  // Sample a rendered frame, rather than a timeout that can read stale layout
  // on machines rendering WebGL in software.
  const screens = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const anchors = window.__radio.model.screens
        const lastScreen = anchors.cassette.children.find((child) => child.isCSS3DObject)
        const previous = lastScreen.onAfterRender
        lastScreen.onAfterRender = function (renderer, scene, camera) {
          previous.call(this, renderer, scene, camera)
          lastScreen.onAfterRender = previous
          resolve(
            Object.entries(anchors).map(([name, anchor]) => {
              const object = anchor.children.find((child) => child.isCSS3DObject)
              const element = object.element
              const bounds = element.getBoundingClientRect()
              const viewport = document.querySelector("canvas.webgl-layer").getBoundingClientRect()
              const corners = [-1, 1].flatMap((x) =>
                [-1, 1].map((y) => {
                  const point = object.position
                    .clone()
                    .set((x * element.offsetWidth) / 2, (y * element.offsetHeight) / 2, 0)
                    .applyMatrix4(object.matrixWorld)
                    .project(camera)
                  return [
                    viewport.x + ((point.x + 1) * viewport.width) / 2,
                    viewport.y + ((1 - point.y) * viewport.height) / 2,
                  ]
                }),
              )
              const expected = [
                Math.min(...corners.map(([x]) => x)),
                Math.min(...corners.map(([, y]) => y)),
                Math.max(...corners.map(([x]) => x)),
                Math.max(...corners.map(([, y]) => y)),
              ]
              const actual = [bounds.left, bounds.top, bounds.right, bounds.bottom]
              return {
                name,
                actual,
                expected,
                error: Math.max(...actual.map((value, index) => Math.abs(value - expected[index]))),
                camera: camera.matrixWorld.elements.slice(),
              }
            }),
          )
        }
      }),
  )
  record(
    label,
    screens.every((screen) => screen.error < 1),
    JSON.stringify(screens),
  )
  return screens
}

async function checkScreenDrag(page, name, label) {
  const before = await checkScreenProjection(page, `${label}-before`)
  const bounds = await page.locator(`#${name}-screen`).boundingBox()
  if (bounds === null) throw new Error(`${name} screen is not visible`)
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 45, y + 12, { steps: 8 })
  const during = await checkScreenProjection(page, `${label}-during`)
  await page.mouse.up()
  record(
    label,
    during[0].camera.some((value, index) => Math.abs(value - before[0].camera[index]) > 0.001),
    "Dragging the live screen rotates the shared camera and keeps both screens attached",
  )
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
  if (view === "reference" || view === "front") {
    await checkScreenProjection(page, `screen-projection-${view}`)
  }
  await page.screenshot({ path: new URL(`renders/${view}.png`, evidenceDir).pathname })
  record(`view-${view}`, true, "camera control completed")
}

await page.locator('[data-view="reference"]').click()
await checkScreenDrag(page, "tuner", "tuner-screen-orbit")
await page.screenshot({ path: new URL("renders/screen-orbit.png", evidenceDir).pathname })
await page.locator('[data-view="front"]').click()
await checkScreenDrag(page, "cassette", "cassette-screen-orbit")
await page.mouse.wheel(0, -180)
await checkScreenProjection(page, "screen-projection-zoom")
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
await checkScreenProjection(page, "screen-projection-exploded")
await page.locator("#reset").click()
await checkScreenProjection(page, "screen-projection-reset")
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
  await checkScreenProjection(page, `screen-projection-${width}`)
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
await checkScreenDrag(reduced, "tuner", "reduced-motion-screen-orbit")
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
await checkScreenProjection(highDpi, "high-dpi-screen-apertures")
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
