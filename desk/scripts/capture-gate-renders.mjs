import { mkdir } from "node:fs/promises"
import { chromium } from "playwright-core"

const outputDir = "evidence/gates"
await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader-webgl"],
})
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 })
const consoleErrors = []
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text())
})
page.on("pageerror", (error) => consoleErrors.push(error.message))
await page.goto("http://127.0.0.1:4175/?qa=1&view=reference&clean=1", { waitUntil: "networkidle" })
await page.locator("html[data-model-ready='true'][data-render-ready='true']").waitFor()

await page.evaluate(() => {
  const model = window.__deskPreview.model
  const scene = model.parent
  if (scene === null) throw new Error("Desk model has no review scene")
  if (scene.background !== null && "set" in scene.background) scene.background.set(0xffffff)
  scene.fog = null
  for (const child of scene.children) {
    if (child === model || "isLight" in child) continue
    child.visible = false
  }
})

const settle = async () => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 8
        const tick = () => {
          frames -= 1
          if (frames === 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
}

for (const view of ["reference", "front", "right", "rear", "left"]) {
  await page.evaluate((name) => window.__deskPreview.setView(name), view)
  await settle()
  await page.screenshot({ path: `${outputDir}/${view}.png` })
}

await page.evaluate(() => {
  window.__deskPreview.setView("reference")
  window.__deskPreview.camera.position.multiplyScalar(0.62)
  window.__deskPreview.camera.updateProjectionMatrix()
})
await settle()
await page.screenshot({ path: `${outputDir}/match.png` })

await page.evaluate(() => {
  const materials = new Set()
  for (const mesh of window.__deskPreview.model.userData.sculptRuntime.meshes.values()) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of list) materials.add(material)
  }
  for (const material of materials) {
    if ("map" in material) material.map = null
    if ("normalMap" in material) material.normalMap = null
    if ("roughnessMap" in material) material.roughnessMap = null
    if ("emissive" in material) material.emissive.setHex(0x000000)
    if ("emissiveIntensity" in material) material.emissiveIntensity = 0
    if ("color" in material) material.color.setHex(0x8d96a8)
    material.needsUpdate = true
  }
})
await settle()
await page.screenshot({ path: `${outputDir}/map-stripped.png` })
await browser.close()
if (consoleErrors.length > 0)
  throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`)
console.log(
  JSON.stringify({
    captures: ["reference", "front", "right", "rear", "left", "map-stripped"],
    consoleErrors,
  }),
)
