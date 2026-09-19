import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright-core"

const baseUrl = process.env.RADIO_DESKTOP_URL ?? "http://127.0.0.1:5173"
const output = process.env.EVIDENCE_DIR ?? "/tmp/todou-radio-screen-orbit"
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/snap/bin/chromium",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
})
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(60_000)
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto(`${baseUrl}/?qa=1&radio-fixtures=1`, { waitUntil: "networkidle" })
  await page.waitForFunction(() => window.__todouQa !== undefined)
  if (await page.locator("#enter-desktop").isVisible()) {
    await page.locator("#enter-desktop").click()
  }
  await page.waitForFunction(() => window.__todouQa?.read().navigationState === "overview")
  await page.screenshot({ path: join(output, "desktop.png") })
  await page.locator("#focus-radio").evaluate((button) => button.click())
  await page.waitForFunction(() => window.__todouQa?.read().navigationState === "radio-focus")
  const readScreens = () =>
    page.locator('.model-screen[data-asset-instance="radio-main"]').evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.dataset.screenId,
        transform: element.style.transform,
        camera: element.parentElement.style.transform,
        visible: element.dataset.visible,
        bounds: element.getBoundingClientRect().toJSON(),
      })),
    )
  const before = await readScreens()
  assert.equal(before.length, 2)
  assert.ok(before.every((screen) => screen.visible === "true"))
  await page.screenshot({ path: join(output, "radio-before-orbit.png") })
  // Drag the canvas to orbit without activating a screen app.
  await page.mouse.move(1060, 400)
  await page.mouse.down()
  await page.mouse.move(1120, 425, { steps: 12 })
  await page.mouse.up()
  await page.waitForFunction((camera) => {
    const screen = document.querySelector('.model-screen[data-screen-id="ratio-tuner"]')
    return screen?.parentElement.style.transform !== camera
  }, before[0].camera)
  await page.screenshot({ path: join(output, "radio-after-orbit.png") })
  const after = await readScreens()
  for (const [index, screen] of after.entries()) {
    assert.equal(screen.visible, "true", `${screen.id} remains visible`)
    assert.equal(
      screen.transform,
      before[index].transform,
      `${screen.id} must stay in its physical plane instead of turning toward the camera`,
    )
    assert.notEqual(screen.camera, before[index].camera)
    assert.ok(
      Math.abs(screen.bounds.x - before[index].bounds.x) > 1 ||
        Math.abs(screen.bounds.width - before[index].bounds.width) > 1,
      `${screen.id} must move with the projected device`,
    )
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ status: "PASS", before, after, errors, output }))
} finally {
  await browser.close()
}
