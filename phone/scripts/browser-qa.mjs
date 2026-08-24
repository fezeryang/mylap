import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const baseUrl = process.env.PHONE_QA_URL ?? "http://127.0.0.1:4173"
const evidenceDir = new URL("../evidence/", import.meta.url)
const rendersDir = new URL("renders/", evidenceDir)
const consoleErrors = []
const pageErrors = []
const checks = []

await mkdir(rendersDir, { recursive: true })
const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
})
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
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
await page.waitForFunction(() => window.__ready === true)
record(
  "runtime-ready",
  (await page.locator("#stage[data-ready='true']").count()) === 1,
  "render loop ready",
)

for (const view of ["reference", "front", "right", "rear", "left"]) {
  await page.locator(`[data-view="${view}"]`).click()
  await page.waitForTimeout(180)
  await page.screenshot({ path: new URL(`renders/${view}.png`, evidenceDir).pathname })
  record(
    `view-${view}`,
    (await page.locator("#viewer-status").textContent())?.includes(view) === true,
    "camera status updated",
  )
}

await page.locator("[data-view='reference']").click()
await page.screenshot({ path: new URL("renders/screen-rest.png", evidenceDir).pathname })
await page.locator("#screen-power-control").click()
await page.waitForTimeout(100)
await page.screenshot({ path: new URL("renders/screen-mid.png", evidenceDir).pathname })
await page.waitForTimeout(260)
await page.screenshot({ path: new URL("renders/screen-off.png", evidenceDir).pathname })
record(
  "screen-off",
  (await page.locator("#phone-screen").getAttribute("data-power")) === "off",
  "screen powered off",
)
await page.locator("#screen-power-control").click()
await page.locator("#phone-screen [data-app-id='camera']").click()
record(
  "screen-app-click",
  (await page.locator("#phone-screen").getAttribute("data-active-app")) === "camera",
  "camera app active",
)
record(
  "screen-app-surface",
  (await page.locator("[data-app-surface]").textContent())?.includes("Optical Camera") === true,
  "camera app content rendered",
)
await page.screenshot({ path: new URL("renders/screen-camera-active.png", evidenceDir).pathname })

await page.locator("#explode-control").click()
record(
  "explode",
  (await page.locator("#explode-control[aria-pressed='true']").count()) === 1,
  "explosion toggled",
)
await page.screenshot({ path: new URL("renders/exploded.png", evidenceDir).pathname })
await page.locator("#auto-rotate-control").click()
record(
  "auto-rotate",
  (await page.locator("#auto-rotate-control[aria-pressed='true']").count()) === 1,
  "auto rotation toggled",
)
await page.locator("#reset-control").click()
record(
  "reset",
  (await page.locator("#viewer-status").textContent()) === "Reference view restored",
  "reset restored reference state",
)

await page.evaluate(() => {
  const canvas = document.querySelector("#webgl-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("canvas unavailable")
  const bounds = canvas.getBoundingClientRect()
  canvas.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }),
  )
})
record(
  "part-picking",
  (await page.locator("#viewer-status").textContent())?.includes("selected") === true,
  "centre ray selected a modeled part",
)

const manifest = await page.evaluate(() => window.__phone.manifest())
record("manifest", manifest.parts.length >= 20, `${manifest.parts.length} authored parts exposed`)
await writeFile(new URL("../parts.json", import.meta.url), JSON.stringify(manifest, null, 2))

for (const { width, height } of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1536, height: 864 },
]) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(120)
  await page.screenshot({ path: new URL(`renders/responsive-${width}.png`, evidenceDir).pathname })
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  record(`responsive-${width}`, !hasOverflow, `horizontal overflow=${hasOverflow}`)
}

record("console-errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "none")
record("page-errors", pageErrors.length === 0, pageErrors.join(" | ") || "none")
await writeFile(
  new URL("browser-qa.json", evidenceDir),
  JSON.stringify({ status: "PASS", baseUrl, checks, consoleErrors, pageErrors }, null, 2),
)
await browser.close()
console.log(JSON.stringify({ status: "PASS", checks: checks.length, parts: manifest.parts.length }))
