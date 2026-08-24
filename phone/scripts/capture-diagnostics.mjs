import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const output = new URL("../evidence/diagnostic/", import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
})
const page = await browser.newPage({ viewport: { width: 1254, height: 1254 } })
page.setDefaultTimeout(60_000)
await page.goto(process.env.PHONE_QA_URL ?? "http://127.0.0.1:4173", { waitUntil: "networkidle" })
await page.waitForFunction(() => window.__ready === true)
await page.addStyleTag({
  content:
    "html, body, #stage { background: transparent !important; } #stage::before, .hud, #phone-screen { display: none !important; }",
})

const views = (process.env.PHONE_DIAG_VIEWS ?? "reference,front,right,rear,left").split(",")
for (const view of views) {
  await page.evaluate((viewId) => window.__phone.viewer.setView(viewId), view)
  await page.waitForTimeout(180)
  const dataUrl = await page.evaluate(() => {
    window.__phone.viewer.renderDiagnostic()
    const canvas = document.querySelector("#webgl-canvas")
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("WebGL canvas unavailable")
    return canvas.toDataURL("image/png")
  })
  await writeFile(new URL(`${view}.png`, output), Buffer.from(dataUrl.split(",")[1], "base64"))
}

await writeFile(
  new URL("../parts.json", import.meta.url),
  JSON.stringify(await page.evaluate(() => window.__phone.manifest()), null, 2),
)
await browser.close()
console.log("diagnostic captures ready")
