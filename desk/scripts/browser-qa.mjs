import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const baseUrl = "http://127.0.0.1:4175"
const evidenceDir = "evidence/renders"
await mkdir(evidenceDir, { recursive: true })

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

const settle = async (frames = 2) => {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let remaining = count
        const tick = () => {
          remaining -= 1
          if (remaining <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    frames,
  )
}

const openView = async (view, clean = true) => {
  await page.goto(`${baseUrl}/?qa=1&view=${view}${clean ? "&clean=1" : ""}`, {
    waitUntil: "networkidle",
  })
  await page.locator("html[data-model-ready='true'][data-render-ready='true']").waitFor()
  await settle()
}

const capture = async (name) => {
  await settle(2)
  await page.screenshot({ path: `${evidenceDir}/${name}.png` })
}

await openView("reference")
for (const view of ["reference", "front", "right", "rear", "left", "top"]) {
  await page.evaluate((name) => window.__deskPreview.setView(name), view)
  await capture(view)
}

await page.evaluate(() => window.__deskPreview.setView("reference"))
await page.evaluate(() => window.__deskPreview.setExplosion(1))
await capture("exploded")
await page.evaluate(() => {
  window.__deskPreview.setExplosion(0)
  window.__deskPreview.setLightsEnabled(false)
})
await capture("lights-off")

await openView("reference", false)
await page.locator('[data-view="front"]').click()
if ((await page.locator("#mode-name").textContent())?.trim() !== "FRONT VIEW") {
  throw new Error("Front view button did not update the active camera mode")
}
await page.locator("#explode").fill("100")
if ((await page.locator("#explode-value").textContent())?.trim() !== "100%") {
  throw new Error("Explosion range did not update the model state")
}
await page.locator("#lights").click()
if ((await page.locator("#lights").getAttribute("aria-pressed")) !== "false") {
  throw new Error("Lights button did not enter the off state")
}
await page.locator("#rotate").click()
if ((await page.locator("#rotate").getAttribute("aria-pressed")) !== "true") {
  throw new Error("Auto-rotation button did not enter the active state")
}
await page.locator("#reset").click()
const controlsAfterReset = {
  explosion: await page.locator("#explode").inputValue(),
  explosionLabel: (await page.locator("#explode-value").textContent())?.trim(),
  lights: await page.locator("#lights").getAttribute("aria-pressed"),
  rotation: await page.locator("#rotate").getAttribute("aria-pressed"),
  view: (await page.locator("#mode-name").textContent())?.trim(),
}
if (
  JSON.stringify(controlsAfterReset) !==
  JSON.stringify({
    explosion: "0",
    explosionLabel: "0%",
    lights: "true",
    rotation: "false",
    view: "REFERENCE VIEW",
  })
) {
  throw new Error(`Reset did not restore all controls: ${JSON.stringify(controlsAfterReset)}`)
}

const pickPoint = await page.evaluate(() => {
  const mesh = window.__deskPreview.model.userData.sculptRuntime.meshes.get("work-surface-mat")
  if (mesh === undefined) throw new Error("Missing work-surface mesh for picking QA")
  mesh.geometry.computeBoundingSphere()
  const center = mesh.geometry.boundingSphere?.center.clone()
  if (center === undefined) throw new Error("Work-surface mesh has no bounding sphere")
  const point = mesh.localToWorld(center).project(window.__deskPreview.camera)
  return {
    x: ((point.x + 1) / 2) * window.innerWidth,
    y: ((1 - point.y) / 2) * window.innerHeight,
  }
})
await page.mouse.click(pickPoint.x, pickPoint.y)
await settle()
const selectedPart = (await page.locator("#part-name").textContent())?.trim() ?? ""
if (selectedPart === "" || selectedPart === "CYBER DESK")
  throw new Error("Part picking did not select a desk part")
await capture("selected-part")

const responsive = [
  { width: 375, height: 812, name: "responsive-375" },
  { width: 768, height: 900, name: "responsive-768" },
  { width: 1280, height: 900, name: "responsive-1280" },
  { width: 1536, height: 1024, name: "responsive-1536" },
]
const responsiveBounds = []
await openView("reference", false)
for (const viewport of responsive) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.evaluate(() => window.__deskPreview.setView("reference"))
  const bounds = await page.evaluate(() => {
    const points = []
    for (const mesh of window.__deskPreview.model.userData.sculptRuntime.meshes.values()) {
      mesh.geometry.computeBoundingBox()
      const box = mesh.geometry.boundingBox
      if (box === null) continue
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const point = box.min.clone().set(x, y, z)
            mesh.localToWorld(point).project(window.__deskPreview.camera)
            points.push({ x: point.x, y: point.y })
          }
        }
      }
    }
    return {
      maxX: Math.max(...points.map((point) => Math.abs(point.x))),
      maxY: Math.max(...points.map((point) => Math.abs(point.y))),
    }
  })
  if (bounds.maxX > 0.96 || bounds.maxY > 0.96) {
    throw new Error(
      `Responsive camera clips the model at ${viewport.width}x${viewport.height}: ${JSON.stringify(bounds)}`,
    )
  }
  responsiveBounds.push({ viewport: `${viewport.width}x${viewport.height}`, ...bounds })
  await capture(viewport.name)
}

await page.setViewportSize({ width: 1672, height: 941 })
await page.evaluate(() => window.__deskPreview.setView("reference"))
await settle()
const manifest = await page.evaluate(() => {
  const runtime = window.__deskPreview.model.userData.sculptRuntime
  const parts = runtime.partManifest.map((part) => {
    let triangles = 0
    for (const meshName of part.meshNames) {
      const mesh = runtime.meshes.get(meshName)
      if (mesh === undefined) continue
      const index = mesh.geometry.index
      const position = mesh.geometry.attributes.position
      triangles += index === null ? (position?.count ?? 0) / 3 : index.count / 3
    }
    return {
      name: part.id,
      kind: "part",
      module: part.destructionGroup,
      triangles: Math.round(triangles),
    }
  })
  const unnamedMeshes = [...runtime.meshes.values()].filter((mesh) => mesh.name === "").length
  return { model: "cyber-desk", parts, unnamedMeshes, integralMeshes: runtime.meshes.size }
})
await writeFile("parts.json", `${JSON.stringify(manifest, null, 2)}\n`)

await page.emulateMedia({ reducedMotion: "no-preference" })
await page.goto(`${baseUrl}/?view=reference`, { waitUntil: "networkidle" })
await page.locator("html[data-model-ready='true'][data-render-ready='true']").waitFor()
const rotationBefore = await page.evaluate(() => window.__deskPreview.model.rotation.y)
await page.locator("#rotate").click()
await page.waitForTimeout(350)
const rotationAfter = await page.evaluate(() => window.__deskPreview.model.rotation.y)
const rotationDelta = rotationAfter - rotationBefore
if (rotationDelta < 0.02)
  throw new Error(`Auto-rotation produced no visible rotation: ${rotationDelta}`)
await page.locator("#reset").click()

await page.emulateMedia({ reducedMotion: "reduce" })
await page.goto(`${baseUrl}/?view=reference`, { waitUntil: "networkidle" })
await page.locator("html[data-model-ready='true'][data-render-ready='true']").waitFor()
const reducedRotationBefore = await page.evaluate(() => window.__deskPreview.model.rotation.y)
await page.locator("#rotate").click()
await page.waitForTimeout(350)
const reducedRotationAfter = await page.evaluate(() => window.__deskPreview.model.rotation.y)
const reducedMotionDelta = reducedRotationAfter - reducedRotationBefore
const reducedMotionRotation = await page.locator("#rotate").getAttribute("aria-pressed")
if (reducedMotionRotation !== "false") throw new Error("Reduced motion allowed auto-rotation")
if (Math.abs(reducedMotionDelta) > 0.001) {
  throw new Error(`Reduced motion changed the model rotation: ${reducedMotionDelta}`)
}

const result = {
  captures: [
    "reference",
    "front",
    "right",
    "rear",
    "left",
    "top",
    "exploded",
    "lights-off",
    "selected-part",
    ...responsive.map((item) => item.name),
  ],
  consoleErrors,
  partCount: manifest.parts.length,
  selectedPart,
  controlsAfterReset,
  rotationDelta,
  reducedMotionDelta,
  reducedMotionRotation,
  responsiveBounds,
  viewports: responsive.map(({ width, height }) => `${width}x${height}`),
}
await writeFile("evidence/browser-qa.json", `${JSON.stringify(result, null, 2)}\n`)
await browser.close()
if (consoleErrors.length > 0)
  throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`)
console.log(JSON.stringify(result))
