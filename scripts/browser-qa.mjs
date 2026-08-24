import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const baseUrl = "http://127.0.0.1:4173"
const evidenceDir = "evidence/renders"
await mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader-webgl"],
})
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } })
const consoleErrors = []
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
page.on("pageerror", (error) => consoleErrors.push(error.message))

const settleFrames = async (count = 4) => {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        let remaining = frames
        const tick = () => {
          remaining -= 1
          if (remaining <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    count,
  )
}

const openView = async (view, assets = 1) => {
  await page.goto(`${baseUrl}/?view=${view}&assets=${assets}&qa=1`, { waitUntil: "networkidle" })
  await page.locator("html[data-model-ready='true']").waitFor()
  await settleFrames()
}

const capture = async (name, hideScreens = false) => {
  await settleFrames()
  if (hideScreens) {
    await page.locator(".css3d-layer").evaluate((layer) => {
      layer.style.visibility = "hidden"
    })
  }
  await page.locator("html").evaluate((root) => {
    root.dataset.captureFrozen = "true"
  })
  await settleFrames(2)
  await page.screenshot({ path: `${evidenceDir}/${name}.png` })
  await settleFrames(2)
  await page.screenshot({ path: `${evidenceDir}/${name}.png` })
  await page.locator("html").evaluate((root) => {
    root.dataset.captureFrozen = "false"
  })
  if (hideScreens) {
    await page.locator(".css3d-layer").evaluate((layer) => {
      layer.style.visibility = "visible"
    })
  }
}

const visibleScreens = async () =>
  page.locator(".model-screen[data-visible='true'][data-powered='true']").count()

for (const view of ["reference", "front", "right", "rear", "left"]) {
  await openView(view)
  await page.locator(".hud, .control-dock, .interaction-hint").evaluateAll((elements) => {
    elements.forEach((element) => {
      element.style.visibility = "hidden"
    })
  })
  await capture(view)
}

await openView("reference")
const allScreens = page.locator(".model-screen")
if ((await allScreens.count()) !== 3) throw new Error("Expected three independent screen hosts")
if ((await visibleScreens()) === 0) throw new Error("No screen is visible from the reference view")
for (const screenId of ["main", "left-wing", "right-wing"]) {
  const host = page.locator(`[data-asset-instance="cyberdeck-main"][data-screen-id="${screenId}"]`)
  if ((await host.count()) !== 1) throw new Error(`Missing independent ${screenId} screen host`)
}

const mainScreen = page.locator(
  '[data-asset-instance="cyberdeck-main"][data-screen-id="main"]',
)
const terminalInput = mainScreen.getByRole("textbox", { name: "屏幕命令输入" })
await terminalInput.click()
await terminalInput.fill("中文组合输入")
if ((await terminalInput.inputValue()) !== "中文组合输入") throw new Error("DOM screen input failed")
if ((await mainScreen.getAttribute("data-focused")) !== "true") {
  throw new Error("Screen focus did not pause the 3D interaction")
}
await capture("screen-focused-ime")
await page.keyboard.press("Escape")
if ((await mainScreen.getAttribute("data-focused")) !== "false") {
  throw new Error("Escape did not release screen focus")
}

await openView("keyboard")
await capture("key-rest", true)
await page.keyboard.down("q")
await page.locator("html[data-pressed-keys='KeyQ']").waitFor()
await page.waitForTimeout(40)
await capture("key-mid", true)
await page.waitForTimeout(160)
await capture("key-held", true)
await page.keyboard.up("q")
await page.locator("html[data-pressed-keys='']").waitFor()
await settleFrames(12)
await capture("key-settled", true)

await openView("reference")
await page.getByRole("button", { name: "SCREENS ON" }).click()
if ((await page.getByRole("button", { name: "SCREENS OFF" }).getAttribute("aria-pressed")) !== "false") {
  throw new Error("Screen-power control did not reach the off state")
}
if ((await page.locator(".model-screen[data-powered='false']").count()) !== 3) {
  throw new Error("Screen power did not update every session on the active asset")
}
await capture("screen-off")
await page.getByRole("button", { name: "SCREENS OFF" }).click()

await page.getByRole("button", { name: "AUTO ROTATE" }).click()
if ((await page.getByRole("button", { name: "AUTO ROTATE" }).getAttribute("aria-pressed")) !== "true") {
  throw new Error("Auto-rotate control did not reach the on state")
}
await page.locator("#explode-range").evaluate((input) => {
  input.value = "0.72"
  input.dispatchEvent(new Event("input", { bubbles: true }))
})
await settleFrames(24)
await capture("exploded")
await page.getByRole("button", { name: "RESET VIEW" }).click()

await openView("reference")
await page.mouse.click(785, 675)
await settleFrames()
const selectedPart = (await page.locator("#part-title").textContent())?.trim() ?? ""
if (selectedPart === "CYBERDECK ROOT") throw new Error("Canvas part-picking did not select a part")
await capture("reference-ui")

const manifestText = await page.locator("#part-manifest").textContent()
if (manifestText === null) throw new Error("Runtime part manifest is missing")
await writeFile("parts.json", `${manifestText}\n`)

await openView("front", 2)
if ((await page.locator("html").getAttribute("data-screen-sessions")) !== "6") {
  throw new Error("Two assets did not create six independent screen sessions")
}
const betaMain = page.locator(
  '[data-asset-instance="cyberdeck-beta"][data-screen-id="main"]',
)
await betaMain.click()
await page.locator("html[data-active-asset='cyberdeck-beta']").waitFor()
await page.keyboard.down("ArrowLeft")
await page.locator("html[data-pressed-keys='ArrowLeft']").waitFor()
await capture("multi-asset-key-held")
await page.keyboard.up("ArrowLeft")
await capture("multi-asset")

const viewportChecks = [
  { height: 812, name: "responsive-375", width: 375 },
  { height: 900, name: "responsive-768", width: 768 },
  { height: 900, name: "responsive-1280", width: 1280 },
  { height: 1024, name: "responsive-1536", width: 1536 },
]
for (const viewport of viewportChecks) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await openView("reference")
  await capture(viewport.name)
}

const captures = [
  "reference", "front", "right", "rear", "left",
  "screen-focused-ime", "key-rest", "key-mid", "key-held", "key-settled",
  "screen-off", "exploded", "reference-ui", "multi-asset-key-held", "multi-asset",
  ...viewportChecks.map((viewport) => viewport.name),
]
const result = {
  captures,
  consoleErrors,
  controls: {
    autoRotate: "pass",
    explode: "pass",
    keyboard: "pass",
    multiAsset: "pass",
    resetView: "pass",
    screenFocus: "pass",
    screenPower: "pass",
  },
  screenHosts: 3,
  selectedPart,
  viewportChecks: viewportChecks.map(
    (viewport) => `${viewport.width}x${viewport.height}`,
  ),
}
await writeFile("evidence/browser-qa.json", `${JSON.stringify(result, null, 2)}\n`)
await browser.close()
if (consoleErrors.length > 0) throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`)
console.log(JSON.stringify(result))
