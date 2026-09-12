import { writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const TODO_14_IDS = [
  "kbd-shell-phone",
  "kbd-shell-computer",
  "kbd-shell-other",
  "kbd-pick-phone",
  "kbd-pick-computer",
  "kbd-body-overview",
  "kbd-body-phone",
  "kbd-body-computer",
  "kbd-body-locked",
  "kbd-screen-phone",
  "kbd-screen-computer",
  "kbd-escape1-phone",
  "kbd-escape2-phone",
  "kbd-escape1-computer",
  "kbd-escape2-computer",
  "kbd-escape-noop",
  "kbd-exit-phone",
  "kbd-exit-computer",
  "kbd-removal-phone",
  "kbd-repeat-keyup",
]

const click = (locator) => locator.evaluate((element) => element.click())
const read = (page) => page.evaluate(() => window.__todouQa?.read() ?? null)
const check = (checks, id, passed) => checks.push({ id, passed: Boolean(passed) })
const waitForState = async (page, state) => {
  await page.waitForFunction(
    (expected) => window.__todouQa?.read().navigationState === expected,
    state,
    { timeout: 15_000 },
  )
  return read(page)
}
const capture = async (page, captures, evidenceDir, name) => {
  const path = join(evidenceDir, "captures", `${name}.png`)
  await page.screenshot({ path })
  captures.push(`captures/${name}.png`)
}
const layoutAudit = (page) =>
  page.evaluate(() => {
    const selectors = {
      identity: ".hud--identity",
      status: ".hud--status",
      devices: "#device-focus-controls",
      navigation: "#navigation-status",
    }
    const rects = Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => {
        const element = document.querySelector(selector)
        if (element === null) throw new Error(`Missing layout surface: ${selector}`)
        const { top, right, bottom, left, width, height } = element.getBoundingClientRect()
        return [name, { top, right, bottom, left, width, height }]
      }),
    )
    const intersects = (left, right) =>
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
    const entries = Object.entries(rects)
    return {
      contained: entries.every(
        ([, rect]) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= window.innerWidth &&
          rect.bottom <= window.innerHeight,
      ),
      nonIntersecting: entries.every(([name, rect], index) =>
        entries.slice(index + 1).every(([otherName, other]) => name === otherName || !intersects(rect, other)),
      ),
      mobileVerticalStack:
        rects.identity.bottom < rects.status.top &&
        rects.status.bottom < rects.devices.top &&
        rects.devices.bottom < rects.navigation.top,
    }
  })
const finalLineWordCount = (page) =>
  page.locator(".desktop-shell__copy").evaluate((element) => {
    const text = element.firstChild
    if (text?.nodeType !== Node.TEXT_NODE) return 0
    const range = document.createRange()
    const lines = new Map()
    for (const word of (text.textContent ?? "").matchAll(/\S+/g)) {
      const start = word.index ?? 0
      range.setStart(text, start)
      range.setEnd(text, start + word[0].length)
      const line = Math.round(range.getBoundingClientRect().top)
      lines.set(line, (lines.get(line) ?? 0) + 1)
    }
    return [...lines.entries()].sort(([left], [right]) => left - right).at(-1)?.[1] ?? 0
  })
const projectedBoxHeight = (page, selector) =>
  page.locator(selector).first().evaluate((element) => {
    const { height } = element.getBoundingClientRect()
    return height
  })
const focusedPhoneLayoutAudit = (page) =>
  page.evaluate(() => {
    const screen = document.querySelector(".model-screen[data-asset-instance='phone-main'][data-screen-id='phone-primary']")
    const dock = document.querySelector("#controls, .control-dock")
    if (screen === null || dock === null) throw new Error("Missing focused phone layout surface")
    const screenRect = screen.getBoundingClientRect()
    const dockRect = dock.getBoundingClientRect()
    const intersects =
      screenRect.left < dockRect.right &&
      screenRect.right > dockRect.left &&
      screenRect.top < dockRect.bottom &&
      screenRect.bottom > dockRect.top
    return {
      contained:
        screenRect.left >= 0 &&
        screenRect.top >= 0 &&
        screenRect.right <= window.innerWidth &&
        screenRect.bottom <= window.innerHeight,
      intersects,
      screen: screenRect.toJSON(),
    }
  })
const hintContrastAudit = async (page) => {
  const hint = page.locator(".interaction-hint")
  const details = await hint.evaluate((element) => {
    const style = getComputedStyle(element)
    return { backgroundColor: style.backgroundColor, color: style.color }
  })
  const visibility = await page.evaluate(() => {
    const elements = [...document.querySelectorAll(".desktop-shell, .hud, .control-dock, .interaction-hint")]
    return elements.map((element) => {
      const saved = element.style.visibility
      element.style.visibility = "hidden"
      return saved
    })
  })
  let screenshot
  try {
    screenshot = await page.screenshot()
  } finally {
    await page.evaluate((saved) => {
      for (const [index, element] of [...document.querySelectorAll(".desktop-shell, .hud, .control-dock, .interaction-hint")].entries()) {
        element.style.visibility = saved[index]
      }
    }, visibility)
  }
  return page.evaluate(
    async ({ backgroundColor, color, encoded }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${encoded}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (context === null) return 0
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const cssChannels = (value) => {
        const channels = (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
        return channels.slice(0, 3).every((channel) => channel <= 1)
          ? [...channels.slice(0, 3).map((channel) => channel * 255), channels[3] ?? 1]
          : channels
      }
      const foreground = cssChannels(color).slice(0, 3)
      const backgroundChannels = cssChannels(backgroundColor)
      const alpha = backgroundChannels[3] ?? 1
      const channel = (value) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      const luminance = (rgb) =>
        0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
      const contrast = (background) => {
        const [bright, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
        return (bright + 0.05) / (dark + 0.05)
      }
      let minimumContrast = Number.POSITIVE_INFINITY
      for (let index = 0; index < pixels.length; index += 4) {
        const background = [0, 1, 2].map(
          (offset) =>
            (backgroundChannels[offset] ?? 0) * alpha + (pixels[index + offset] ?? 0) * (1 - alpha),
        )
        minimumContrast = Math.min(minimumContrast, contrast(background))
      }
      return { contrast: minimumContrast, hasStableBacking: alpha >= 0.9 }
    },
    { ...details, encoded: screenshot.toString("base64") },
  )
}
const enter = async (page) => {
  await click(page.locator("#enter-desktop"))
  return waitForState(page, "overview")
}
const focusDevice = async (page, device) => {
  await click(page.locator(`#focus-${device}`))
  return waitForState(page, `${device}-focus`)
}
const exitDevice = async (page) => {
  await click(page.locator("#exit-device"))
  return waitForState(page, "overview")
}
const dispatchKey = (locator, code, options = {}) =>
  locator.evaluate(
    (target, eventOptions) => {
      const event = new KeyboardEvent(eventOptions.kind ?? "keydown", {
        bubbles: true,
        cancelable: true,
        code: eventOptions.code,
        key: eventOptions.key ?? eventOptions.code,
        repeat: eventOptions.repeat ?? false,
      })
      target.dispatchEvent(event)
      return event.defaultPrevented
    },
    { code, ...options },
  )

const productKeyboardJourney = async (page, checks, segment) => {
  let prevented
  if (segment === "routing") {
  for (const [id, selector] of [
    ["phone", "#focus-phone"],
    ["computer", "#focus-computer"],
    ["other", "#auto-rotate"],
  ]) {
    const prevented = await dispatchKey(page.locator(selector), "KeyZ")
    check(
      checks,
      `product-kbd-shell-${id}`,
      !prevented && (await read(page))?.lastKeyboardRoute === null,
    )
  }

  prevented = await dispatchKey(page.locator("#scene"), "KeyO")
  check(
    checks,
    "product-kbd-body-overview",
    prevented && (await read(page))?.lastKeyboardRoute?.assetId === "computer-main",
  )
  await dispatchKey(page.locator("#scene"), "KeyO", { kind: "keyup" })

  prevented = await page.evaluate(() => {
    document.querySelector("#focus-phone")?.click()
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyL",
      key: "l",
    })
    document.querySelector("#scene")?.dispatchEvent(event)
    return event.defaultPrevented
  })
  check(
    checks,
    "product-kbd-body-locked",
    !prevented && (await read(page))?.lastKeyboardRoute === null,
  )
  await waitForState(page, "phone-focus")
  prevented = await dispatchKey(page.locator("#scene"), "KeyP")
  check(
    checks,
    "product-kbd-body-phone",
    prevented && (await read(page))?.lastKeyboardRoute?.assetId === "phone-main",
  )
  await dispatchKey(page.locator("#scene"), "KeyP", { kind: "keyup" })
  await exitDevice(page)

  await focusDevice(page, "computer")
  prevented = await dispatchKey(page.locator("#scene"), "KeyC")
  check(
    checks,
    "product-kbd-body-computer",
    prevented && (await read(page))?.lastKeyboardRoute?.assetId === "computer-main",
  )
  await dispatchKey(page.locator("#scene"), "KeyC", { kind: "keyup" })
  await exitDevice(page)
    return
  }

  if (segment === "screen") {
  for (const device of ["phone", "computer"]) {
    await focusDevice(page, device)
    const screenId = device === "phone" ? "phone-primary" : "main"
    const screen = page.locator(
      `.model-screen[data-asset-instance='${device}-main'][data-screen-id='${screenId}']`,
    )
    const target = screen.locator("button, input, select").first()
    await target.focus()
    prevented = await dispatchKey(target, device === "phone" ? "KeyF" : "KeyG")
    const routed = await read(page)
    check(
      checks,
      `product-kbd-screen-${device}`,
      !prevented &&
        routed?.lastKeyboardRoute?.assetId === `${device}-main` &&
        routed?.lastKeyboardRoute?.screenId === screenId,
    )
    prevented = await dispatchKey(target, "Escape", { key: "Escape" })
    const firstEscape = await read(page)
    check(
      checks,
      `product-kbd-escape1-${device}`,
      prevented &&
        firstEscape?.navigationState === `${device}-focus` &&
        firstEscape?.focusedScreen === null,
    )
    prevented = await dispatchKey(page.locator("#scene"), "Escape", { key: "Escape" })
    const secondEscape = await waitForState(page, "overview")
    check(
      checks,
      `product-kbd-escape2-${device}`,
      prevented && secondEscape?.activeAsset === "computer-main",
    )
  }

  prevented = await dispatchKey(page.locator("#scene"), "Escape", { key: "Escape" })
  check(
    checks,
    "product-kbd-escape-noop",
    prevented && (await read(page))?.navigationState === "overview",
  )
    return
  }

  await focusDevice(page, "phone")
  check(
    checks,
    "product-kbd-exit-phone",
    (await exitDevice(page))?.activeAsset === "computer-main",
  )
  await focusDevice(page, "computer")
  check(
    checks,
    "product-kbd-exit-computer",
    (await exitDevice(page))?.activeAsset === "computer-main",
  )

  const before = await read(page)
  const sequence = await page.locator("#scene").evaluate((target) => {
    const events = [
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyR",
        key: "r",
      }),
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyR",
        key: "r",
        repeat: true,
      }),
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "KeyU",
        key: "u",
      }),
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "KeyR",
        key: "r",
      }),
    ]
    for (const event of events) target.dispatchEvent(event)
    return events.map((event) => event.defaultPrevented)
  })
  const after = await read(page)
  check(
    checks,
    "product-kbd-repeat-keyup",
    JSON.stringify(sequence) === JSON.stringify([true, false, false, true]) &&
      before?.lastKeyboardRoute?.code !== "KeyR" &&
      after?.lastKeyboardRoute?.code === "KeyR",
  )
}

const runPhase = async ({
  page,
  baseUrl,
  evidenceDir,
  phase,
  priorChecks = [],
  aggregateChecks = [],
  aggregateCaptures = [],
}) => {
  const checks = aggregateChecks
  const captures = aggregateCaptures
  const setupChecks = phase === "visual-foundation" ? checks : []
  const visualMeasurements = {}
  const validWav = resolve("public/qa/valid.wav")
  let radioFixture = "valid"
  await page.route("**/qa/radio.wav", (route) => {
    if (radioFixture !== "valid") {
      return route.fulfill({
        status: 302,
        headers: {
          "cache-control": "no-store",
          location: `/qa/${radioFixture}.wav`,
        },
      })
    }
    return route.fulfill({
      contentType: "audio/wav",
      headers: { "cache-control": "no-store" },
      path: validWav,
    })
  })
  await page.route("**.api.radio-browser.info/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  )

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" })
  await page.locator("html[data-model-ready='true']").waitFor({ timeout: 45_000 })
  check(setupChecks, "non-qa-api-absent", await page.evaluate(() => !("__todouQa" in window)))
  check(
    setupChecks,
    "production-directory-selected",
    (await page.locator("html").getAttribute("data-radio-directory")) === "production",
  )

  await page.goto(`${baseUrl}/?qa=1&radio-fixtures=1`, { waitUntil: "domcontentloaded" })
  await page.locator("html[data-model-ready='true']").waitFor({ timeout: 45_000 })
  await page.waitForFunction(() => window.__todouQa?.read().radio.stations.length === 2)
  check(setupChecks, "qa-api-present", await page.evaluate(() => typeof window.__todouQa?.read === "function"))
  const initial = await read(page)
  const expectedInstances = [
    ["computer-main", "cyberdeck", ["main", "left-wing", "right-wing"]],
    ["desk-main", "cyber-desk", []],
    ["phone-main", "phone", ["phone-primary"]],
    ["radio-main", "ratio", ["ratio-tuner", "ratio-cassette"]],
  ]
  check(
    setupChecks,
    "four-instances-six-screens",
    initial?.screenSessionCount === 6 &&
      JSON.stringify(initial.instances.map(({ instanceId, typeId, screenIds }) => [instanceId, typeId, screenIds])) ===
        JSON.stringify(expectedInstances),
  )
  const devices = initial?.instances.filter(({ instanceId }) => instanceId !== "desk-main") ?? []
  const tabletop = devices.every(({ bounds }) =>
    bounds.every((value) => Number.isFinite(value)) &&
    bounds[0] >= -6.001 &&
    bounds[3] <= 6.001 &&
    bounds[2] >= -2.901 &&
    bounds[5] <= 2.901,
  )
  const separated = devices.every((left, index) =>
    devices.slice(index + 1).every(
      (right) =>
        left.bounds[3] <= right.bounds[0] ||
        right.bounds[3] <= left.bounds[0] ||
        left.bounds[5] <= right.bounds[2] ||
        right.bounds[5] <= left.bounds[2],
    ),
  )
  check(setupChecks, "desktop-bounds-tabletop-no-overlap", tabletop && separated)
  check(
    setupChecks,
    "initial-active-computer-six-sessions",
    initial?.activeAsset === "computer-main" && initial.focusedScreen === null,
  )

  if (phase === "visual-foundation") {
    await capture(page, captures, evidenceDir, "product-landing-1280")
    visualMeasurements.landingFinalLineWords = await finalLineWordCount(page)
    check(checks, "visual-landing-balanced-final-line", visualMeasurements.landingFinalLineWords >= 2)
    await enter(page)
    await capture(page, captures, evidenceDir, "product-overview-1280")
    visualMeasurements.hint1280 = await hintContrastAudit(page)
    check(
      checks,
      "visual-hint-1280-contrast",
      visualMeasurements.hint1280.hasStableBacking && visualMeasurements.hint1280.contrast >= 4.5,
    )
    const overviewLayout = await layoutAudit(page)
    check(checks, "product-overview-1280-hud-controls-nonintersection", overviewLayout.nonIntersecting)
    check(checks, "product-overview-1280-hud-controls-contained", overviewLayout.contained)
  } else {
    await enter(page)
  }
  if (phase === "visual-phone") {
    await focusDevice(page, "phone")
    visualMeasurements.phoneBodyBoxHeight = await projectedBoxHeight(page, ".phone-shell-home p")
    check(
      checks,
      "visual-phone-body-projection-readable",
      visualMeasurements.phoneBodyBoxHeight >= 14,
    )
    visualMeasurements.phoneLayout = await focusedPhoneLayoutAudit(page)
    check(checks, "visual-phone-screen-contained", visualMeasurements.phoneLayout.contained)
    check(checks, "visual-phone-screen-dock-nonintersection", !visualMeasurements.phoneLayout.intersects)
    await capture(page, captures, evidenceDir, "product-phone-focus-1280")
  }
  if (phase === "visual-browser") {
    await focusDevice(page, "computer")
    const visualComputerScreen = page.locator(
      ".model-screen[data-asset-instance='computer-main'][data-screen-id='main']",
    )
    await click(visualComputerScreen.locator("[data-testid='launcher-browser']"))
    visualMeasurements.browserControlBoxHeight = await projectedBoxHeight(page, ".launcher-route")
    check(
      checks,
      "visual-browser-control-projection-readable",
      visualMeasurements.browserControlBoxHeight >= 14,
    )
    await capture(page, captures, evidenceDir, "product-browser-focus-1280")
  }
  if (phase.startsWith("visual-")) {
    writeFileSync(join(evidenceDir, `product-${phase}-observation.json`), `${JSON.stringify({
      checks,
      visualMeasurements,
    }, null, 2)}\n`)
    return { checks, captures }
  }
  if (phase.startsWith("functional-keyboard-")) {
    await productKeyboardJourney(page, checks, phase.slice("functional-keyboard-".length))
    return { checks, captures }
  }
  if (phase === "functional-stage-interaction") {

  let picked = null
  for (const [x, y] of [
    [900, 620],
    [1010, 620],
    [880, 580],
    [1030, 580],
    [950, 640],
  ]) {
    await page.mouse.click(x, y)
    picked = await read(page)
    if (picked?.navigationState === "focusing-phone") {
      picked = await waitForState(page, "phone-focus")
      break
    }
    if (picked?.navigationState === "phone-focus") break
  }
  check(checks, "product-kbd-pick-phone", picked?.navigationState === "phone-focus")
  if (picked?.navigationState === "phone-focus") await exitDevice(page)
  await page.mouse.click(675, 505)
  picked = await read(page)
  if (picked?.navigationState === "focusing-computer") {
    picked = await waitForState(page, "computer-focus")
  }
  check(checks, "product-kbd-pick-computer", picked?.navigationState === "computer-focus")
  if (picked?.navigationState === "computer-focus") await exitDevice(page)

  const unknownBefore = await read(page)
  const unknownError = await page.evaluate(() => {
    try {
      window.__todouQa?.removeAsset("missing-main")
      return null
    } catch (error) {
      return error instanceof Error ? error.name : String(error)
    }
  })
  check(
    checks,
    "unknown-removal-atomic",
    unknownError === "UnknownAssetInstanceError" &&
      JSON.stringify(unknownBefore) === JSON.stringify(await read(page)),
  )

  const screenPowerSelector = ".model-screen[data-asset-instance='computer-main']"
  await click(page.locator("#screen-power"))
  check(
    checks,
    "screen-power-off-all-computer-sessions",
    await page.locator(screenPowerSelector).evaluateAll((screens) =>
      screens.every((screen) => screen.dataset.powered === "false"),
    ),
  )
  await click(page.locator("#screen-power"))
  check(
    checks,
    "screen-power-recovery",
    await page.locator(screenPowerSelector).evaluateAll((screens) =>
      screens.every((screen) => screen.dataset.powered === "true"),
    ),
  )
  const boundsBeforeExplosion = (await read(page))?.instances[0]?.bounds
  await page.locator("#explode-range").evaluate((input) => {
    input.value = "1"
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  const boundsExploded = (await read(page))?.instances[0]?.bounds
  await page.locator("#explode-range").evaluate((input) => {
    input.value = "0"
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  check(
    checks,
    "explosion-reset",
    JSON.stringify(boundsBeforeExplosion) !== JSON.stringify(boundsExploded) &&
      (await page.locator("#explode-range").inputValue()) === "0",
  )
    return { checks, captures }
  }

  if (phase === "functional-media-radio") {
  await focusDevice(page, "computer")
  await page.locator("html").evaluate((root) => {
    root.dataset.captureFrozen = "true"
  })
  const computerScreen = page.locator(".model-screen[data-asset-instance='computer-main'][data-screen-id='main']")
  await click(computerScreen.locator("[data-testid='launcher-oho']"))
  const computerOho = computerScreen.locator("[data-testid='oho-controls']")
  await click(computerOho.getByRole("button", { name: "Power on" }))
  await click(computerOho.getByRole("button", { name: "Play", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.status === "playing", null, {
    timeout: 15_000,
  })
  check(
    checks,
    "real-wav-playing",
    (await read(page))?.radio.selectedStation?.stationUuid === "qa-radio-wav" &&
      (await read(page))?.radio.status === "playing",
  )
  await click(computerOho.getByRole("button", { name: "Pause", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.status === "paused")
  check(checks, "radio-pause-retains-state", (await read(page))?.radio.status === "paused")
  await click(computerOho.getByRole("button", { name: "Play", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.status === "playing")
  await click(computerOho.getByRole("button", { name: "Stop", exact: true }))
  radioFixture = "missing"
  await click(computerOho.getByRole("button", { name: "Play", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.error?.code === "stream-failed")
  check(checks, "missing-media-error", (await read(page))?.radio.error?.code === "stream-failed")
  radioFixture = "corrupt"
  await click(computerOho.getByRole("button", { name: "Play", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.error?.code === "stream-failed")
  check(checks, "corrupt-media-error", (await read(page))?.radio.error?.code === "stream-failed")
  radioFixture = "valid"
  await click(computerOho.getByRole("button", { name: "Play", exact: true }))
  await page.waitForFunction(() => window.__todouQa?.read().radio.status === "playing")
  check(checks, "media-error-recovery", (await read(page))?.radio.status === "playing")
  await page.locator("html").evaluate((root) => {
    delete root.dataset.captureFrozen
  })
  await exitDevice(page)
  await focusDevice(page, "phone")
  const phoneScreen = page.locator(".model-screen[data-asset-instance='phone-main']")
  await click(phoneScreen.locator("[data-testid='phone-oho']"))
  check(
    checks,
    "shared-radio-phone-computer-ratio",
    (await phoneScreen.locator(".oho-status").textContent())?.includes("PLAYING") &&
      (await page.locator("[data-testid='ratio-tuner-display-app']").textContent())?.includes("PLAYING") &&
      (await page.locator("[data-testid='ratio-cassette-display-app']").textContent())?.includes("PLAYING"),
  )
  await capture(page, captures, evidenceDir, "product-phone-radio-1280")
  await exitDevice(page)
    return { checks, captures }
  }

  if (phase === "functional-browser") {
  await focusDevice(page, "computer")
  const computerScreen = page.locator(".model-screen[data-asset-instance='computer-main'][data-screen-id='main']")
  await click(computerScreen.locator("[data-testid='launcher-browser']"))
  const browserInput = computerScreen.locator("[data-testid='launcher-browser-input']")
  await browserInput.fill("javascript:alert(1)")
  await browserInput.press("Enter")
  check(
    checks,
    "browser-unsafe-url-rejected",
    (await computerScreen.locator(".launcher-browser-status").textContent())?.includes(
      "unsupported-scheme",
    ),
  )
  await browserInput.fill("/qa/iframe-fixture.html")
  await browserInput.press("Enter")
  const frame = computerScreen.locator("[data-testid='launcher-browser-frame']")
  check(
    checks,
    "browser-sandbox-referrer-embed",
    (await frame.getAttribute("sandbox")) ===
      "allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox" &&
      (await frame.getAttribute("referrerpolicy")) === "no-referrer" &&
      (await frame.getAttribute("src"))?.endsWith("/qa/iframe-fixture.html"),
  )
  const popupPromise = page.waitForEvent("popup")
  await click(computerScreen.locator("[data-testid='launcher-new-tab']"))
  const popup = await popupPromise
  check(
    checks,
    "browser-popup-no-opener",
    (await popup.evaluate(() => window.opener === null)) && popup.url().endsWith("/qa/iframe-fixture.html"),
  )
  await popup.close()
  await page.evaluate(() => {
    window.open = () => null
  })
  await click(computerScreen.locator("[data-testid='launcher-new-tab']"))
  check(
    checks,
    "browser-null-popup-neutral",
    (await computerScreen.locator(".launcher-browser-status").textContent()) ===
      "Open requested; your browser may block it.",
  )
  await page.evaluate(() => {
    window.open = () => ({ close: () => document.documentElement.dataset["unsafeClosed"] = "true", opener: {} })
  })
  await click(computerScreen.locator("[data-testid='launcher-new-tab']"))
  check(
    checks,
    "browser-unsafe-opener-closed",
    (await computerScreen.locator(".launcher-browser-status").textContent()) ===
      "Unsafe window closed" &&
      (await page.locator("html").getAttribute("data-unsafe-closed")) === "true",
  )
  await capture(page, captures, evidenceDir, "product-browser-1280")
  await exitDevice(page)
    return { checks, captures }
  }

  for (const viewport of [
    { width: 1024, height: 768, name: "product-overview-1024" },
    { width: 768, height: 900, name: "product-overview-768" },
    { width: 375, height: 812, name: "product-overview-375" },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await capture(page, captures, evidenceDir, viewport.name)
    if (viewport.width === 1024) {
      visualMeasurements.hint1024 = await hintContrastAudit(page)
      check(
        checks,
        "visual-hint-1024-contrast",
        visualMeasurements.hint1024.hasStableBacking && visualMeasurements.hint1024.contrast >= 4.5,
      )
    }
    check(checks, viewport.name, await page.locator("#navigation-status").isVisible())
    const layout = await layoutAudit(page)
    check(checks, `${viewport.name}-hud-controls-nonintersection`, layout.nonIntersecting)
    check(checks, `${viewport.name}-hud-controls-contained`, layout.contained)
    if (viewport.width === 375) {
      check(checks, "product-overview-375-mobile-vertical-stack", layout.mobileVerticalStack)
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__todouQa?.read().radio.stations.length === 2)
  const reduced = await enter(page)
  check(checks, "reduced-motion-synchronous", reduced?.navigationState === "overview")
  await page.evaluate(
    () => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))),
  )
  await capture(page, captures, evidenceDir, "product-overview-reduced-1280")
  visualMeasurements.hintReduced1280 = await hintContrastAudit(page)
  check(
    checks,
    "visual-hint-reduced-1280-contrast",
    visualMeasurements.hintReduced1280.hasStableBacking &&
      visualMeasurements.hintReduced1280.contrast >= 4.5,
  )
  const reducedLayout = await layoutAudit(page)
  check(checks, "product-overview-reduced-1280-hud-controls-nonintersection", reducedLayout.nonIntersecting)
  check(checks, "product-overview-reduced-1280-hud-controls-contained", reducedLayout.contained)
  await page.emulateMedia({ reducedMotion: "no-preference" })

  await focusDevice(page, "phone")
  const removablePhoneScreen = page.locator(".model-screen[data-asset-instance='phone-main']")
  await removablePhoneScreen.locator("button, input, select").first().focus()
  const sessionsBeforeRemoval = (await read(page))?.screenSessionCount
  await page.evaluate(() => window.__todouQa?.removeAsset("phone-main"))
  const removed = await waitForState(page, "overview")
  check(
    checks,
    "product-kbd-removal-phone",
    sessionsBeforeRemoval === 6 &&
      removed?.screenSessionCount === 5 &&
      removed.activeAsset === "computer-main" &&
      removed.focusedScreen === null &&
      removed.disposalCounts["phone-main"] === 1 &&
      (await page.locator("html").getAttribute("data-controls-enabled")) === "true",
  )
  await dispatchKey(page.locator("#scene"), "KeyK")
  check(
    checks,
    "phone-removal-computer-keyboard-owner",
    (await read(page))?.lastKeyboardRoute?.assetId === "computer-main",
  )

  const mirrorUrl = `${baseUrl}/?qa=1&radio-fixtures=1&radio-scenario=mirror-exhaustion`
  await page.goto(mirrorUrl, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__todouQa?.read().radio.error !== null)
  check(
    checks,
    "mirror-exhaustion-resolves-error",
    (await read(page))?.radio.error?.code === "directory-unavailable",
  )
  const finalSnapshot = await read(page)
  await page.goto("about:blank")

  const pendingErrors = []
  const pendingPage = await page.context().browser().newPage()
  pendingPage.on("pageerror", (error) => pendingErrors.push(error.message))
  await pendingPage.goto(`${baseUrl}/?qa=1&radio-fixtures=1&radio-scenario=pending`, {
    waitUntil: "domcontentloaded",
  })
  await pendingPage.locator("html[data-model-ready='true']").waitFor({ timeout: 45_000 })
  await pendingPage.close()
  await page.waitForTimeout(200)
  check(checks, "pending-disposal-no-unhandled-rejection", pendingErrors.length === 0)

  const malformedPage = await page.context().browser().newPage()
  const malformedErrorPromise = new Promise((resolveError) => {
    const timer = setTimeout(() => resolveError(null), 5_000)
    malformedPage.once("pageerror", (error) => {
      clearTimeout(timer)
      resolveError(error.name)
    })
  })
  await malformedPage.goto(`${baseUrl}/?qa=1&radio-fixtures=1&radio-scenario=hostile`, {
    waitUntil: "domcontentloaded",
  })
  const malformedError = await malformedErrorPromise
  await malformedPage.close()
  check(checks, "unknown-radio-scenario-startup-fails", malformedError === "RadioScenarioError")

  for (const id of TODO_14_IDS) {
    check(
      checks,
      `product-${id}-present`,
      [...priorChecks, ...checks].some((entry) => entry.id === `product-${id}` && entry.passed),
    )
  }
  writeFileSync(
    join(evidenceDir, "product-observation.json"),
    `${JSON.stringify({ checks, finalSnapshot, visualMeasurements }, null, 2)}\n`,
  )
  return { checks, captures }
}

const visualPhases = ["visual-foundation", "visual-phone", "visual-browser"].map((phase) => ({
  id: phase,
  run: (input) => runPhase({ ...input, phase }),
}))

const functionalPhases = [
  "functional-keyboard-routing",
  "functional-keyboard-screen",
  "functional-keyboard-exit-repeat",
  "functional-stage-interaction",
  "functional-media-radio",
  "functional-browser",
  "functional-recovery",
].map((phase) => ({
  id: phase,
  run: (input) => runPhase({ ...input, phase }),
}))

export const phases = process.env.QA_VISUAL_CONTRACT_ONLY === "1"
  ? visualPhases
  : [...visualPhases, ...functionalPhases]
